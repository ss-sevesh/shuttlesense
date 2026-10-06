"""Offline YOLOX-Tiny detection experiment; not identity tracking or coaching."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import time

import cv2
import numpy as np
import onnxruntime as ort


def prepare(frame, size):
    height, width = frame.shape[:2]
    ratio = min(size / width, size / height)
    canvas = np.full((size, size, 3), 114, dtype=np.uint8)
    resized = cv2.resize(frame, (int(width * ratio), int(height * ratio)))
    canvas[:resized.shape[0], :resized.shape[1]] = resized
    return np.ascontiguousarray(canvas.transpose(2, 0, 1)[None], dtype=np.float32), ratio


def people(raw, size, ratio, threshold=0.3, nms=0.45):
    """YOLOX raw head: stride-grid centers/log-sizes; COCO person is class 0.

    API conventions verified against the official YOLOX ONNXRuntime demo.
    """
    grids, scales = [], []
    for stride in (8, 16, 32):
        xx, yy = np.meshgrid(np.arange(size // stride), np.arange(size // stride))
        grid = np.column_stack((xx.ravel(), yy.ravel()))
        grids.append(grid)
        scales.append(np.full((len(grid), 1), stride))
    grid, scale = np.concatenate(grids), np.concatenate(scales)
    values = np.asarray(raw)[0]
    if values.shape != (len(grid), 85) or not np.isfinite(values).all():
        raise ValueError("Expected finite, undecoded YOLOX COCO output")
    confidence = values[:, 4] * values[:, 5]
    mask = confidence >= threshold
    centers = (values[mask, :2] + grid[mask]) * scale[mask] / ratio
    dimensions = np.exp(values[mask, 2:4]) * scale[mask] / ratio
    boxes = np.column_stack((centers - dimensions / 2, dimensions))
    if not np.isfinite(boxes).all():
        raise ValueError("Nonfinite decoded boxes")
    scores = confidence[mask]
    kept = np.asarray(cv2.dnn.NMSBoxes(boxes.tolist(), scores.tolist(), threshold, nms)).ravel()
    return [{"box_xywh": boxes[i].tolist(), "score": float(scores[i])} for i in kept]


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="New private output directory")
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, default=180)
    parser.add_argument("--sample-hz", type=float, default=1)
    parser.add_argument("--score", type=float, default=0.3)
    parser.add_argument("--nms", type=float, default=0.45)
    args = parser.parse_args()
    if (not all(math.isfinite(v) for v in (args.start, args.end, args.sample_hz, args.score, args.nms))
            or not 0 <= args.start < args.end or not 0 < args.sample_hz <= 30
            or not 0 < args.score < 1 or not 0 < args.nms < 1):
        parser.error("Invalid interval, sample rate, or thresholds")
    if not args.video.is_file() or not args.model.is_file():
        parser.error("Video and model files must exist")
    args.output.mkdir(parents=True, exist_ok=False)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    startup = time.perf_counter()
    session = ort.InferenceSession(str(args.model), options, providers=["CPUExecutionProvider"])
    model_input = session.get_inputs()[0]
    if model_input.shape != [1, 3, 416, 416]:
        parser.error("This baseline supports only the official 416x416 YOLOX-Tiny raw ONNX model")
    startup_s = time.perf_counter() - startup
    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        parser.error("Cannot decode video")
    samples, detector_s, decoded, previous = [], 0, 0, -1
    next_time = args.start
    started = time.perf_counter()
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                raise ValueError("Video ended or decode failed before requested end")
            timestamp = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if not math.isfinite(timestamp) or timestamp <= previous:
                raise ValueError("Decoder timestamps are missing or nonmonotonic")
            previous = timestamp
            if timestamp >= args.end:
                break
            decoded += 1
            if timestamp + 1e-6 < next_time:
                continue
            tick = time.perf_counter()
            tensor, ratio = prepare(frame, 416)
            raw = session.run(None, {model_input.name: tensor})[0]
            detections = people(raw, 416, ratio, args.score, args.nms)
            elapsed = time.perf_counter() - tick
            detector_s += elapsed
            samples.append({"time_s": timestamp, "person_detections": detections, "inference_s": elapsed})
            # ponytail: sampled detections only; add tracking after manually reviewed detection coverage.
            if len(samples) <= 12 or len(samples) % 15 == 0:
                for detection in detections:
                    x, y, w, h = detection["box_xywh"]
                    cv2.rectangle(frame, (round(x), round(y)), (round(x+w), round(y+h)), (0, 230, 255), 2)
                    cv2.putText(frame, f"person {detection['score']:.2f}", (round(x), round(y)-5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 230, 255), 1)
                cv2.putText(frame, f"{timestamp:.2f}s - detections only, identity unknown", (25, frame.shape[0]-30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 230, 255), 2)
                if not cv2.imwrite(str(args.output / f"frame-{timestamp:08.3f}.jpg"), frame):
                    raise OSError("Cannot save review frame")
            next_time += 1 / args.sample_hz
            if len(samples) % 30 == 0:
                print(f"Sampled {len(samples)} frames through {timestamp:.2f}s", flush=True)
    finally:
        capture.release()
    wall_s = time.perf_counter() - started
    report = {
        "version": 1, "kind": "detection_feasibility", "video_sha256": digest(args.video),
        "model_sha256": digest(args.model), "model": "YOLOX-Tiny official 0.1.1rc0 ONNX",
        "runtime": {"opencv": cv2.__version__, "numpy": np.__version__, "onnxruntime": ort.__version__,
                    "providers": session.get_providers(), "threads": 4},
        "settings": {"start_s": args.start, "end_s": args.end, "sample_hz": args.sample_hz,
                     "score": args.score, "nms": args.nms, "input_size": 416},
        "measurements": {"sampled_frames": len(samples), "decoded_frames": decoded,
                         "startup_s": startup_s, "decode_inference_review_s": wall_s,
                         "inference_preprocess_postprocess_s": detector_s},
        "identity_accuracy": None, "tracking_coverage": None, "peak_memory_bytes": None,
        "limitations": ["No stable player identity or tracking", "No ground-truth accuracy evaluation",
                        "No court mapping until calibration is reviewed", "No coaching conclusions"],
        "samples": samples,
    }
    (args.output / "detections.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(report["measurements"], indent=2))


if __name__ == "__main__":
    main()
