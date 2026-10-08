"""ByteTrack identities and per-player MediaPipe poses for reviewable clips."""
import argparse
import hashlib
import json
import math
import os
import time
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path("data/matplotlib-cache").resolve()))
import cv2
import numpy as np
from court import calibrate, project


def select_players(boxes, matrix, locked):
    """Lock the first on-court identity per half; a missing ID stays missing."""
    choices = {"near": [], "far": []}
    for identity, box in boxes:
        x, y, w, h = box
        xy = project(matrix, [x + w / 2, y + h], "near")
        known_side = next((side for side, known_id in locked.items() if known_id == identity), None)
        if known_side:
            choices[known_side].append((identity, box, xy.tolist()))
            continue
        if -.05 <= xy[0] <= 1.05 and -.05 <= xy[1] <= 1.05:
            side = "far" if xy[1] < .5 else "near"
            choices[side].append((identity, box, xy.tolist()))
    result = []
    for side, candidates in choices.items():
        if side not in locked and candidates:
            # ponytail: initialise the largest in-court person; review selection before long matches.
            locked[side] = max(candidates, key=lambda c: c[1][2] * c[1][3])[0]
        match = next((c for c in candidates if c[0] == locked.get(side)), None)
        if match:
            result.append(dict(track_id=match[0], side=side, box_xywh=match[1], court_xy=match[2]))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--sample-hz", type=float, default=15)
    parser.add_argument("--corners", type=float, nargs=8, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--detector", type=Path, default=Path("data/hf-racquet-baseline/yolo11n-pose.pt"))
    parser.add_argument("--pose-model", type=Path, default=Path("data/models/mediapipe/pose_landmarker_full.task"))
    args = parser.parse_args()
    if not all(math.isfinite(n) for n in [args.start, args.end, args.sample_hz]) or not 0 <= args.start < args.end or args.end - args.start > 30 or args.sample_hz <= 0:
        parser.error("Require finite start/end, 0 < duration <= 30s and positive sample rate")
    for path in [args.video, args.detector, args.pose_model]:
        if not path.is_file():
            parser.error(f"Missing input: {path}")
    corners = np.array(args.corners).reshape(4, 2)
    matrix = calibrate(corners)
    capture = cv2.VideoCapture(str(args.video))
    fps = capture.get(cv2.CAP_PROP_FPS)
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    width, height = [int(capture.get(prop)) for prop in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT)]
    if not capture.isOpened() or fps <= 0 or args.end > count / fps + 1 / fps or args.sample_hz > fps:
        parser.error("Undecodable video or requested range/rate exceeds the video")
    from ultralytics import YOLO
    import mediapipe as mp
    import torch
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    detector = YOLO(str(args.detector))
    options = vision.PoseLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=str(args.pose_model)), running_mode=vision.RunningMode.VIDEO, num_poses=1, min_pose_detection_confidence=.35, min_pose_presence_confidence=.35, min_tracking_confidence=.35)
    poses, locked, samples = {}, {}, []
    started = time.perf_counter()
    first, stop = math.ceil(args.start * fps), math.ceil(args.end * fps)
    stride = max(1, round(fps / args.sample_hz))
    capture.set(cv2.CAP_PROP_POS_FRAMES, first)
    try:
        for source_frame in range(first, stop):
            okay, frame = capture.read()
            if not okay:
                raise RuntimeError(f"Decode failed at frame {source_frame}")
            result = detector.track(frame, persist=True, tracker="bytetrack.yaml", classes=[0], conf=.1, imgsz=960, device=device, verbose=False)[0]
            boxes = []
            if result.boxes.id is not None:
                for identity, xyxy in zip(result.boxes.id.cpu().tolist(), result.boxes.xyxy.cpu().tolist()):
                    x1, y1, x2, y2 = xyxy
                    boxes.append((int(identity), [x1, y1, x2 - x1, y2 - y1]))
            if (source_frame - first) % stride:
                continue
            players = select_players(boxes, matrix, locked)
            timestamp = round(source_frame / fps * 1000)
            for player in players:
                identity = player["track_id"]
                if identity not in poses:
                    poses[identity] = vision.PoseLandmarker.create_from_options(options)
                x, y, w, h = player["box_xywh"]
                x1, y1 = max(0, int(x - w * .15)), max(0, int(y - h * .1))
                x2, y2 = min(width, math.ceil(x + w * 1.15)), min(height, math.ceil(y + h * 1.1))
                rgb = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB)
                pose = poses[identity].detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp)
                landmarks = pose.pose_landmarks[0] if pose.pose_landmarks else []
                player["keypoints_xy"] = [[round(x1 + point.x * (x2 - x1), 3), round(y1 + point.y * (y2 - y1), 3)] for point in landmarks]
                player["keypoint_scores"] = [round(min(point.visibility, point.presence), 4) for point in landmarks]
                player["pose_detected"] = bool(landmarks)
            samples.append(dict(time_s=source_frame / fps, source_frame=source_frame, detected_track_ids=[b[0] for b in boxes], players=players))
            if len(samples) % 75 == 0:
                print(f"{len(samples)} sampled frames; IDs {locked}", flush=True)
    finally:
        capture.release()
        for pose in poses.values():
            pose.close()
    stats = {side: dict(track_id=identity, tracked_samples=sum(any(p["side"] == side for p in s["players"]) for s in samples), pose_samples=sum(any(p["side"] == side and p["pose_detected"] for p in s["players"]) for s in samples)) for side, identity in locked.items()}
    with args.video.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    report = dict(kind="tracked_player_pose", video_sha256=digest, fps=fps, width=width, height=height, video=str(args.video), settings=dict(start_s=args.start, end_s=args.end, sample_hz=fps / stride, tracking_hz=fps, detector_imgsz=960, corners_px=corners.tolist(), detector=str(args.detector), pose_model=str(args.pose_model), tracker="ByteTrack", device=device, pose_device="cpu", identity_policy="initial_ids_locked_no_replacement"), tracking_stats=stats, elapsed_s=round(time.perf_counter()-started, 3), samples=samples)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(dict(output=str(args.output), sampled_frames=len(samples), tracking_stats=stats, elapsed_s=report["elapsed_s"])), flush=True)


if __name__ == "__main__":
    main()
