"""Validate one private recording's manual annotations; Python stdlib only."""
import argparse
import json
import math
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate(data):
    require(isinstance(data, dict), "Annotation root must be an object")
    require(type(data.get("version")) is int and data["version"] == 1, "Expected version 1")
    require(data.get("consent_confirmed") is True, "Record participant consent before evaluation")
    for field in ("recording_id", "setup_id"):
        require(isinstance(data.get(field), str) and data[field].strip(), f"Missing {field}")
    require(data.get("split") in ("tuning", "held_out"), "split must be tuning or held_out")
    duration = data.get("duration_s")
    require(number(duration) and duration > 0, "duration_s must be finite and positive")
    size = data.get("frame_size")
    require(isinstance(size, list) and len(size) == 2 and
            all(type(v) is int and v > 0 for v in size), "frame_size must be [width, height]")
    players = data.get("players")
    require(isinstance(players, list) and len(players) == 2 and
            all(isinstance(p, str) and p.strip() for p in players) and
            len(set(players)) == 2, "Expected two distinct player IDs")
    require(data.get("selected_player") in players, "selected_player must reference a player ID")

    for field in ("rallies", "orientation", "samples"):
        require(isinstance(data.get(field), list) and data[field], f"{field} must be a nonempty list")
        require(all(isinstance(item, dict) for item in data[field]), f"{field} entries must be objects")
    for field in ("rallies", "orientation"):
        previous_end = 0
        ids = set()
        for item in data[field]:
            start, end = item.get("start_s"), item.get("end_s")
            require(number(start) and number(end) and 0 <= start < end <= duration,
                    f"{field}: interval must satisfy 0 <= start_s < end_s <= duration_s")
            require(start >= previous_end, f"{field}: intervals must be ordered without overlap")
            if field == "orientation":
                require(start == previous_end, "orientation must cover the video without gaps")
                require(item.get("side") in ("near", "far", "unknown"), "Invalid orientation side")
            else:
                rally_id = item.get("id")
                require(isinstance(rally_id, str) and rally_id.strip() and rally_id not in ids,
                        "Rally IDs must be nonempty and unique")
                ids.add(rally_id)
                require(item.get("outcome") in ("won", "lost", "unknown"), "Invalid rally outcome")
            previous_end = end
        if field == "orientation":
            require(previous_end == duration, "orientation must cover the complete video")

    seen = set()
    previous_time = -1
    for sample in data["samples"]:
        time, player = sample.get("time_s"), sample.get("player_id")
        require(number(time) and 0 <= time < duration, "Sample timestamp outside video")
        require(time >= previous_time, "Samples must be timestamp ordered")
        require(player in players, "Sample references an unknown player")
        require((time, player) not in seen, "Duplicate player sample at timestamp")
        seen.add((time, player))
        visibility, point = sample.get("visibility"), sample.get("foot_px")
        require(visibility in ("visible", "occluded", "out_of_frame", "uncertain"), "Invalid visibility")
        if visibility == "visible":
            require(isinstance(point, list) and len(point) == 2 and
                    all(number(v) for v in point) and
                    0 <= point[0] < size[0] and 0 <= point[1] < size[1], "Invalid visible foot_px")
        else:
            require("foot_px" in sample and point is None, "Untrackable samples require null foot_px")
        previous_time = time
    times = {time for time, _ in seen}
    require(len(seen) == len(times) * 2, "Annotate both players at every sampled timestamp")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("annotations", type=Path)
    args = parser.parse_args()
    try:
        data = json.loads(args.annotations.read_text(encoding="utf-8-sig"))
        validate(data)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Invalid annotations: {error}\n")
    print(f"Valid structure: {len(data['rallies'])} rallies, {len(data['samples'])} player samples; source review still required")


if __name__ == "__main__":
    main()
