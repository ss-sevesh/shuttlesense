"""Manual-seed OpenCV MIL baseline inside one reviewed continuous camera segment."""
import argparse
import json
import math
from pathlib import Path
import time

import cv2
import onnxruntime as ort

from detect import digest, people, prepare


def overlap(first, second):
    ax, ay, aw, ah = first
    bx, by, bw, bh = second
    intersection = max(0, min(ax+aw, bx+bw)-max(ax, bx)) * max(0, min(ay+ah, by+bh)-max(ay, by))
    union = aw*ah + bw*bh - intersection
    return intersection / union if union > 0 else 0


def matching_detection(box, detections, minimum=0.15, margin=0.1):
    ranked = sorted(((overlap(box, item["box_xywh"]), index) for index, item in enumerate(detections)), reverse=True)
    if not ranked or ranked[0][0] < minimum:
        return None
    if len(ranked) > 1 and ranked[0][0] - ranked[1][0] < margin:
        return None  # Ambiguous identity: require a new manual seed rather than guessing.
    return detections[ranked[0][1]]["box_xywh"]


def checked_box(box, width, height):
    if (len(box) != 4 or not all(math.isfinite(v) for v in box)
            or not 0 <= box[0] < width or not 0 <= box[1] < height
            or box[2] <= 0 or box[3] <= 0
            or box[0] + box[2] > width or box[1] + box[3] > height):
        raise ValueError("Seed box must fit the decoded frame: x y width height")
    result = tuple(round(v) for v in box)
    if result[2] < 1 or result[3] < 1:
        raise ValueError("Seed box collapsed after rounding")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--box", type=float, nargs=4, required=True)
    parser.add_argument("--player-id", required=True)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, default=12)
    parser.add_argument("--scale", type=float, default=0.5)
    parser.add_argument("--detector", type=Path, help="Optional official YOLOX-Tiny ONNX validation at 5 Hz")
    parser.add_argument("--minimum-overlap", type=float, default=0.15)
    parser.add_argument("--ambiguity-margin", type=float, default=0.1)
    args = parser.parse_args()
    if (not all(math.isfinite(v) for v in (args.start, args.end, args.scale, args.minimum_overlap, args.ambiguity_margin))
            or not 0 <= args.start < args.end or not 0 < args.scale <= 1
            or not 0 < args.minimum_overlap < 1 or not 0 < args.ambiguity_margin < 1
            or not args.player_id.strip()):
        parser.error("Invalid interval, scale, or player ID")
    if not args.video.is_file():
        parser.error("Video must exist")
    capture = cv2.VideoCapture(str(args.video))
    writer = None
    samples, previous, initialized = [], -1, False
    tracker_s = 0
    session, lost, next_check = None, False, args.start
    if args.detector:
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        session = ort.InferenceSession(str(args.detector), options, providers=["CPUExecutionProvider"])
        detector_input = session.get_inputs()[0]
        if detector_input.shape != [1, 3, 416, 416]:
            parser.error("Expected the official 416x416 YOLOX-Tiny raw model")
    started = time.perf_counter()
    cv2.setRNGSeed(0)
    cv2.setNumThreads(4)
    tracker = cv2.TrackerMIL_create()
    try:
        if not capture.isOpened():
            raise ValueError("Cannot open video")
        fps = capture.get(cv2.CAP_PROP_FPS)
        if not math.isfinite(fps) or fps <= 0:
            raise ValueError("Missing nominal frame rate")
        while True:
            ok, frame = capture.read()
            if not ok:
                raise ValueError("Decode failed or video ended before requested end")
            timestamp = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if not math.isfinite(timestamp) or timestamp <= previous:
                raise ValueError("Missing or nonmonotonic decoder timestamps")
            previous = timestamp
            if timestamp >= args.end:
                break
            if timestamp + 1e-6 < args.start:
                continue
            height, width = frame.shape[:2]
            scaled_width, scaled_height = round(width * args.scale), round(height * args.scale)
            if scaled_width < 1 or scaled_height < 1:
                raise ValueError("Scaled frame is empty")
            resized = cv2.resize(frame, (scaled_width, scaled_height))
            sx, sy = resized.shape[1] / width, resized.shape[0] / height
            tick = time.perf_counter()
            if not initialized:
                seed = checked_box(args.box, width, height)
                scaled_seed = checked_box([seed[0]*sx, seed[1]*sy, seed[2]*sx, seed[3]*sy],
                                          resized.shape[1], resized.shape[0])
                tracker.init(resized, scaled_seed)
                found, box = True, scaled_seed
                args.output.mkdir(parents=True, exist_ok=False)
                writer = cv2.VideoWriter(str(args.output / "review.mp4"), cv2.VideoWriter_fourcc(*"mp4v"),
                                         fps, (width, height))
                if not writer.isOpened():
                    raise OSError("Cannot create review video")
                initialized = True
            elif not lost:
                found, box = tracker.update(resized)
            else:
                found = False
            tracker_s += time.perf_counter() - tick
            proposed = [box[0]/sx, box[1]/sy, box[2]/sx, box[3]/sy] if found else None
            native_found = None if lost else bool(found)
            checked = False
            if session and not found:
                lost = True  # Reappearance after a gap requires a new manual identity seed.
            if session and not lost and timestamp + 1e-6 >= next_check:
                tensor, ratio = prepare(frame, 416)
                raw = session.run(None, {detector_input.name: tensor})[0]
                detections = people(raw, 416, ratio)
                corrected = matching_detection(proposed, detections, args.minimum_overlap,
                                                args.ambiguity_margin) if proposed else None
                checked = True
                if corrected:
                    x, y, w, h = corrected
                    left, top = max(0, x), max(0, y)
                    clipped = [left, top, min(width, x+w)-left, min(height, y+h)-top]
                    corrected_seed = checked_box([clipped[0]*sx, clipped[1]*sy, clipped[2]*sx, clipped[3]*sy],
                                                 scaled_width, scaled_height)
                    tracker = cv2.TrackerMIL_create()
                    tracker.init(resized, corrected_seed)
                    proposed = [corrected_seed[0]/sx, corrected_seed[1]/sy,
                                corrected_seed[2]/sx, corrected_seed[3]/sy]
                else:
                    proposed, found, lost = None, False, True
                next_check += 0.2
            # ponytail: MIL reports no calibrated confidence; proposals need human review before court metrics.
            samples.append({"time_s": timestamp, "player_id": args.player_id,
                            "tracker_reported_found": native_found, "proposal_available": proposed is not None,
                            "proposed_box_xywh": proposed,
                            "detector_checked": checked, "manual_reseed_required": lost,
                            "identity_verified": None})
            if proposed:
                x, y, w, h = proposed
                cv2.rectangle(frame, (round(x), round(y)), (round(x+w), round(y+h)), (0, 230, 255), 2)
            label = "UNVERIFIED MIL proposal" if found else "MISSING: no track proposal"
            cv2.putText(frame, f"{timestamp:.2f}s {args.player_id}: {label}", (20, height-25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 230, 255), 2)
            writer.write(frame)
            if len(samples) == 1 or timestamp + 1e-6 >= math.ceil(timestamp - 1e-6):
                if not cv2.imwrite(str(args.output / f"frame-{timestamp:08.3f}.jpg"), frame):
                    raise OSError("Cannot save review frame")
            if len(samples) % 90 == 0:
                print(f"Tracked {len(samples)} frames through {timestamp:.2f}s", flush=True)
        if not samples:
            raise ValueError("No frames in requested segment")
    finally:
        capture.release()
        if writer:
            writer.release()
    wall_s = time.perf_counter() - started
    report = {
        "version": 1, "kind": "unverified_tracking_feasibility", "video_sha256": digest(args.video),
        "tracker": "OpenCV MIL with detector checks" if session else "OpenCV MIL",
        "opencv": cv2.__version__, "player_id": args.player_id,
        "onnxruntime": ort.__version__ if session else None,
        "detector_sha256": digest(args.detector) if args.detector else None,
        "settings": {"start_s": args.start, "end_s": args.end, "scale": args.scale,
                     "seed_box_xywh": args.box, "seed": 0, "threads": 4,
                     "detector_check_hz": 5 if session else 0,
                     "minimum_overlap": args.minimum_overlap, "ambiguity_margin": args.ambiguity_margin},
        "measurements": {"frames": len(samples), "wall_s": wall_s, "tracker_s": tracker_s,
                         "native_reported_missing_frames": sum(s["tracker_reported_found"] is False for s in samples),
                         "missing_proposals": sum(s["proposed_box_xywh"] is None for s in samples)},
        "identity_accuracy": None, "validated_coverage": None, "peak_memory_bytes": None,
        "limitations": ["One manually reviewed camera segment only", "No re-identification after cuts",
                        "Found status does not prove correct identity", "No validated court metrics or coaching",
                        "Review video uses nominal FPS; evaluate source decoder timestamps for alignment"],
        "samples": samples,
    }
    (args.output / "tracks.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(json.dumps(report["measurements"], indent=2))


if __name__ == "__main__":
    main()
