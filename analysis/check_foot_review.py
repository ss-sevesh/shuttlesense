"""Check returned two-shoe labels against the original blank packet; no scoring."""
import argparse
from collections import Counter
import json
from pathlib import Path

from check_annotations import number, require


STATUSES = ("pending", "both_grounded", "one_grounded", "airborne", "uncertain", "occluded")
LABEL_FIELDS = {"contact_status", "shoes_px", "note"}


def validate_review(data, original, *, complete=False):
    require(isinstance(original, dict) and isinstance(data, dict), "Review roots must be objects")
    require(original.get("version") == 1 and original.get("kind") == "unlabeled_two_shoe_review",
            "Expected the original version-1 blank two-shoe packet")
    fixed = lambda item, fields: {key: value for key, value in item.items() if key not in fields}
    require(fixed(data, {"reviewer", "samples"}) == fixed(original, {"reviewer", "samples"}),
            "Source, player, movement convention or sampling metadata changed")
    size = original.get("frame_size")
    require(isinstance(size, list) and len(size) == 2 and
            all(type(v) is int and v > 0 for v in size), "Invalid original image dimensions")
    samples, blanks = data.get("samples"), original.get("samples")
    require(isinstance(samples, list) and isinstance(blanks, list) and blanks and
            len(samples) == len(blanks), "Keep every scheduled sample, including difficult ones")
    counts = Counter({status: 0 for status in STATUSES})
    for sample, blank in zip(samples, blanks):
        require(isinstance(sample, dict) and isinstance(blank, dict), "Samples must be objects")
        require(blank.get("contact_status") == "pending" and blank.get("shoes_px") is None,
                "Compare against the original blank packet, not another person's labels")
        require(fixed(sample, LABEL_FIELDS) == fixed(blank, LABEL_FIELDS),
                "Sample frame, timestamp, order or context changed")
        status, shoes, note = sample.get("contact_status"), sample.get("shoes_px"), sample.get("note")
        require(isinstance(status, str) and status in STATUSES, "Unknown contact status")
        require(isinstance(note, str), "Each sample needs a text note field")
        require("shoes_px" in sample, "Each sample needs shoes_px, null when no midpoint exists")
        if status == "both_grounded":
            require(isinstance(shoes, list) and len(shoes) == 2 and
                    all(isinstance(point, list) and len(point) == 2 and
                        all(number(v) for v in point) and
                        0 <= point[0] < size[0] and 0 <= point[1] < size[1] for point in shoes),
                    "Both grounded shoes need finite contact points inside the original image")
            require(shoes[0] != shoes[1], "Mark two distinct shoe contacts")
        else:
            require(shoes is None, "No two-shoe midpoint: shoes_px must be null")
            require(status == "pending" or note.strip(), "Explain missing or unclear contacts in note")
        counts[status] += 1
    reviewer = data.get("reviewer")
    if complete or counts["pending"] != len(samples):
        require(isinstance(reviewer, str) and reviewer.strip(), "Record a reviewer name or private ID")
    else:
        require(reviewer is None or isinstance(reviewer, str) and reviewer.strip(), "Invalid reviewer ID")
    require(not complete or counts["pending"] == 0, "Review is unfinished: pending samples remain")
    return dict(counts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("review", type=Path)
    parser.add_argument("--original", type=Path, required=True, help="Untouched blank review.json")
    parser.add_argument("--complete", action="store_true", help="Reject any pending samples")
    args = parser.parse_args()
    try:
        read = lambda path: json.loads(path.read_text(encoding="utf-8-sig"))
        counts = validate_review(read(args.review), read(args.original), complete=args.complete)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Invalid foot review: {error}\n")
    print(json.dumps({"samples": sum(counts.values()), "contact_status_counts": counts,
                      "eligible_midpoint_labels": counts["both_grounded"]}, indent=2))
    print("Structure checked only; human independence, contact correctness and accuracy are not verified.")


if __name__ == "__main__":
    main()
