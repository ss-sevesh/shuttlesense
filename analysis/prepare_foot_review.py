"""Export unmarked source frames for independent two-shoe contact review."""
import argparse
import json
import math
from pathlib import Path

import cv2

from detect import digest


def sample_frames(start, end, step, context):
    if (not all(type(v) is int for v in (start, end, step, context))
            or not 0 <= start < end or not 0 <= context < step):
        raise ValueError("Require ordered frame bounds and 0 <= context < step")
    frames = list(range(start + step, end - context, step))
    if not frames:
        raise ValueError("Interval is too short for the sampling schedule")
    return frames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--start-frame", type=int, required=True)
    parser.add_argument("--end-frame", type=int, required=True, help="Exclusive segment end")
    parser.add_argument("--step-frames", type=int, default=30)
    parser.add_argument("--context-frames", type=int, default=3)
    parser.add_argument("--player-id", required=True)
    args = parser.parse_args()
    capture = None
    try:
        centers = sample_frames(args.start_frame, args.end_frame, args.step_frames, args.context_frames)
        if not args.video.is_file() or not args.player_id.strip():
            raise ValueError("Provide an existing video and selected player ID")
        capture = cv2.VideoCapture(str(args.video))
        if not capture.isOpened():
            raise ValueError("Cannot open video")
        frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        if not math.isfinite(frame_count) or args.end_frame > frame_count:
            raise ValueError("Requested interval exceeds reported source frame count")
        args.output.mkdir(parents=True, exist_ok=False)  # Never overwrite returned labels.
        timestamps, previous, size = {}, -1, None
        needed = sorted({center + offset for center in centers
                         for offset in (-args.context_frames, 0, args.context_frames)})
        for index in needed:
            if not capture.set(cv2.CAP_PROP_POS_FRAMES, index):
                raise ValueError(f"Cannot seek to source frame {index}")
            ok, frame = capture.read()
            timestamp = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if (not ok or abs(capture.get(cv2.CAP_PROP_POS_FRAMES) - (index + 1)) > 0.01
                    or not math.isfinite(timestamp) or timestamp <= previous):
                raise ValueError(f"Cannot verify decoded frame/timestamp at {index}")
            current_size = [frame.shape[1], frame.shape[0]]
            if size is not None and size != current_size:
                raise ValueError("Frame dimensions changed within segment")
            size, previous = current_size, timestamp
            timestamps[index] = timestamp
            if not cv2.imwrite(str(args.output / f"source-{index:06d}.png"), frame):
                raise OSError(f"Cannot save source frame {index}")
        document = {
            "version": 1, "kind": "unlabeled_two_shoe_review",
            "video_sha256": digest(args.video), "selected_player": args.player_id,
            "frame_size": size, "reviewer": None,
            "movement_point": "court_midpoint_of_two_visible_grounded_shoe_contacts",
            "instructions": "Follow docs/ground-contact.md, Two-shoe review protocol; no tracker overlays.",
            "sampling": {"segment_start_frame": args.start_frame, "segment_end_frame": args.end_frame,
                         "first_sample_frame": centers[0], "step_frames": args.step_frames,
                         "context_frames": args.context_frames, "schedule_selected_before_labeling": True},
            "samples": [{"source_frame": index, "time_s": timestamps[index],
                         "context": [{"file": f"source-{other:06d}.png", "time_s": timestamps[other]}
                                     for other in sorted({index - args.context_frames, index, index + args.context_frames})],
                         "contact_status": "pending", "shoes_px": None, "note": ""}
                        for index in centers],
        }
        (args.output / "review.json").write_text(json.dumps(document, indent=2, allow_nan=False), encoding="utf-8")
    except (OSError, ValueError) as error:
        parser.exit(1, f"Review export failed: {error}\n")
    finally:
        if capture is not None:
            capture.release()
    print(f"Exported {len(centers)} pending samples and {len(needed)} unmarked frames; no accuracy measured")


if __name__ == "__main__":
    main()
