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


def merge_far_detections(full, zoom, roi, matrix):
    """Offset the far crop, reject truncated near players and suppress duplicate boxes."""
    x, y = roi[:2]
    detections = np.asarray(full, dtype=np.float32).reshape(-1,6).tolist()
    for original in np.asarray(zoom, dtype=np.float32).reshape(-1,6):
        row = original.copy()
        row[[0,2]] += x
        row[[1,3]] += y
        if project(matrix, [(row[0]+row[2])/2, row[3]], "near")[1] <= .5:
            detections.append(row.tolist())
    values = np.asarray(detections, dtype=np.float32).reshape(-1,6)
    xywh = values[:,:4].copy()
    xywh[:,2:] -= xywh[:,:2]
    keep = np.asarray(cv2.dnn.NMSBoxes(xywh.tolist(), values[:,4].tolist(), .05, .45)).reshape(-1).astype(int)
    return values[keep]


def select_players(boxes, matrix, locked, recovery=None, time_s=0):
    """Lock the first on-court identity per half; a missing ID stays missing."""
    choices = {"near": [], "far": []}
    for identity, box in boxes:
        x, y, w, h = box
        xy = project(matrix, [x + w / 2, y + h], "near")
        known_side = next((side for side, known_id in locked.items() if known_id == identity), None)
        if known_side:
            choices[known_side].append((identity, box, xy.tolist()))
            continue
        min_y = -.4 if recovery is not None else -.05
        if -.05 <= xy[0] <= 1.05 and min_y <= xy[1] <= 1.05:
            side = "far" if xy[1] < .5 else "near"
            choices[side].append((identity, box, xy.tolist()))
    result = []
    for side, candidates in choices.items():
        if side not in locked and candidates:
            # ponytail: initialise the largest in-court person; review selection before long matches.
            locked[side] = max(candidates, key=lambda c: c[1][2] * c[1][3])[0]
        match = next((c for c in candidates if c[0] == locked.get(side)), None)
        if recovery is not None:
            if match:
                recovery["last_seen"][side] = time_s
                recovery["pending"].pop(side, None)
            elif side in locked and time_s - recovery["last_seen"].get(side, time_s) >= .5:
                if len(candidates) == 1:
                    candidate = candidates[0]
                    previous = recovery["pending"].get(side)
                    if previous is None or previous[0] != candidate[0]:
                        recovery["pending"][side] = (candidate[0], time_s)
                    elif time_s - previous[1] >= .3:
                        recovery["events"].append(dict(time_s=time_s, side=side, previous_track_id=locked[side], track_id=candidate[0], status="provisional_unique_half_reacquisition"))
                        locked[side] = candidate[0]
                        recovery["segments"][side] = recovery["segments"].get(side, 0) + 1
                        recovery["last_seen"][side] = time_s
                        recovery["pending"].pop(side, None)
                        match = candidate
                else:
                    recovery["pending"].pop(side, None)
        if match:
            result.append(dict(track_id=match[0], side=side, box_xywh=match[1], court_xy=match[2], identity_segment=recovery["segments"].get(side, 0) if recovery is not None else 0))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--sample-hz", type=float, default=15)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--tracker", default="bytetrack.yaml")
    parser.add_argument("--far-roi", type=int, nargs=4, metavar=("X", "Y", "WIDTH", "HEIGHT"))
    parser.add_argument("--allow-reacquisition", action="store_true")
    parser.add_argument("--corners", type=float, nargs=8, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--detector", type=Path, default=Path("data/hf-racquet-baseline/yolo11n-pose.pt"))
    parser.add_argument("--pose-model", type=Path, default=Path("data/models/mediapipe/pose_landmarker_full.task"))
    args = parser.parse_args()
    if not all(math.isfinite(n) for n in [args.start, args.end, args.sample_hz]) or not 0 <= args.start < args.end or args.sample_hz <= 0:
        parser.error("Require finite start/end, positive duration and positive sample rate")
    if not 64 <= args.imgsz <= 1920 or args.imgsz % 32:
        parser.error("Detector size must be a multiple of 32 from 64 through 1920")
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
    from ultralytics.utils import YAML, IterableSimpleNamespace
    from ultralytics.utils.checks import check_yaml
    tracker_settings = YAML.load(check_yaml(args.tracker))
    tracker = None
    if args.far_roi:
        x, y, w, h = args.far_roi
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > width or y + h > height:
            parser.error("Far detection crop must be inside the decoded image")
        from ultralytics.trackers.byte_tracker import BYTETracker
        from ultralytics.engine.results import Boxes
        tracker = BYTETracker(args=IterableSimpleNamespace(**tracker_settings))
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    detector = YOLO(str(args.detector))
    options = vision.PoseLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=str(args.pose_model)), running_mode=vision.RunningMode.VIDEO, num_poses=1, min_pose_detection_confidence=.35, min_pose_presence_confidence=.35, min_tracking_confidence=.35)
    poses, locked, samples = {}, {}, []
    recovery = dict(last_seen={}, pending={}, events=[], segments={}) if args.allow_reacquisition else None
    started = time.perf_counter()
    first, stop = math.ceil(args.start * fps), math.ceil(args.end * fps)
    stride = max(1, round(fps / args.sample_hz))
    capture.set(cv2.CAP_PROP_POS_FRAMES, first)
    try:
        for source_frame in range(first, stop):
            okay, frame = capture.read()
            if not okay:
                raise RuntimeError(f"Decode failed at frame {source_frame}")
            boxes = []
            if tracker is not None:
                full = detector.predict(frame, classes=[0], conf=.05, imgsz=args.imgsz, device=device, verbose=False)[0]
                x, y, w, h = args.far_roi
                zoom = detector.predict(frame[y:y+h, x:x+w], classes=[0], conf=.05, imgsz=max(args.imgsz, 1280), device=device, verbose=False)[0]
                values = merge_far_detections(full.boxes.data.cpu().numpy(), zoom.boxes.data.cpu().numpy(), args.far_roi, matrix)
                tracked = tracker.update(Boxes(values, frame.shape[:2]), frame)
                for row in tracked:
                    x1, y1, x2, y2, identity = row[:5]
                    boxes.append((int(identity), [float(x1), float(y1), float(x2-x1), float(y2-y1)]))
            else:
                result = detector.track(frame, persist=True, tracker=args.tracker, classes=[0], conf=.05, imgsz=args.imgsz, device=device, verbose=False)[0]
                if result.boxes.id is not None:
                    for identity, xyxy in zip(result.boxes.id.cpu().tolist(), result.boxes.xyxy.cpu().tolist()):
                        x1, y1, x2, y2 = xyxy
                        boxes.append((int(identity), [x1, y1, x2 - x1, y2 - y1]))
            if (source_frame - first) % stride:
                continue
            players = select_players(boxes, matrix, locked, recovery, source_frame / fps)
            timestamp = round(source_frame / fps * 1000)
            for player in players:
                identity = player["side"] if recovery is not None else player["track_id"]
                if identity not in poses:
                    poses[identity] = vision.PoseLandmarker.create_from_options(options)
                x, y, w, h = player["box_xywh"]
                x1, y1 = max(0, int(x - w * .15)), max(0, int(y - h * .1))
                x2, y2 = min(width, math.ceil(x + w * 1.15)), min(height, math.ceil(y + h * 1.1))
                rgb = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB)
                if rgb.shape[0] < 256:
                    rgb = cv2.resize(rgb, (max(1, round(rgb.shape[1] * 256 / rgb.shape[0])), 256), interpolation=cv2.INTER_CUBIC)
                pose = poses[identity].detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp)
                landmarks = pose.pose_landmarks[0] if pose.pose_landmarks else []
                player["keypoints_xy"] = [[round(x1 + point.x * (x2 - x1), 3), round(y1 + point.y * (y2 - y1), 3)] for point in landmarks]
                player["keypoint_scores"] = [round(min(point.visibility, point.presence), 4) for point in landmarks]
                player["pose_detected"] = bool(landmarks)
            samples.append(dict(time_s=source_frame / fps, source_frame=source_frame, detected_track_ids=[b[0] for b in boxes], players=players))
            if len(samples) % 75 == 0:
                availability = {side: sum(any(p["side"] == side for p in s["players"]) for s in samples) for side in locked}
                print(f"{len(samples)} sampled frames at {source_frame / fps:.2f}s; IDs {locked}; tracked {availability}", flush=True)
    finally:
        capture.release()
        for pose in poses.values():
            pose.close()
    stats = {side: dict(track_id=identity, tracked_samples=sum(any(p["side"] == side for p in s["players"]) for s in samples), pose_samples=sum(any(p["side"] == side and p["pose_detected"] for p in s["players"]) for s in samples)) for side, identity in locked.items()}
    for side, values in stats.items():
        values["track_ids"] = sorted({p["track_id"] for s in samples for p in s["players"] if p["side"] == side})
    with args.video.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    report = dict(kind="tracked_player_pose", video_sha256=digest, fps=fps, width=width, height=height, video=str(args.video), settings=dict(start_s=args.start, end_s=args.end, sample_hz=fps / stride, tracking_hz=fps, detector_imgsz=args.imgsz, far_detection_roi=args.far_roi, far_detector_imgsz=max(args.imgsz,1280) if args.far_roi else None, corners_px=corners.tolist(), detector=str(args.detector), pose_model=str(args.pose_model), tracker="ByteTrack", tracker_config=args.tracker, detector_confidence=.05, device=device, pose_device="cpu", identity_policy="provisional_unique_half_reacquisition" if recovery is not None else "initial_ids_locked_no_replacement", pose_state="per_court_half" if recovery is not None else "per_track_id"), identity_events=recovery["events"] if recovery is not None else [], tracking_stats=stats, elapsed_s=round(time.perf_counter()-started, 3), samples=samples)
    report["settings"]["tracker_values"] = tracker_settings
    report["settings"]["tracker_values_sha256"] = hashlib.sha256(json.dumps(tracker_settings, sort_keys=True).encode()).hexdigest()
    report["settings"]["pose_min_input_height"] = 256
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(dict(output=str(args.output), sampled_frames=len(samples), tracking_stats=stats, elapsed_s=report["elapsed_s"])), flush=True)


if __name__ == "__main__":
    main()
