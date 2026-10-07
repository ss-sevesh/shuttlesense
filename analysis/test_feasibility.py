"""Synthetic regression checks, never tracking accuracy measurements."""
from copy import deepcopy

import numpy as np

from check_annotations import validate
from check_foot_review import validate_review
from court import calibrate, project, project_contact, project_foot_midpoint, reference_error_m
from detect import people, prepare
from prepare_foot_review import sample_frames
from track import checked_box, matching_detection, overlap


def rejects(action):
    try:
        action()
    except ValueError:
        return
    raise AssertionError("Invalid input was accepted")


def main():
    blank = {
        "version": 1, "kind": "unlabeled_two_shoe_review", "frame_size": [640, 480],
        "reviewer": None, "samples": [
            {"source_frame": 10, "time_s": 1, "context": [],
             "contact_status": "pending", "shoes_px": None, "note": ""},
            {"source_frame": 20, "time_s": 2, "context": [],
             "contact_status": "pending", "shoes_px": None, "note": ""}],
    }
    assert validate_review(blank, blank)["pending"] == 2
    rejects(lambda: validate_review(blank, blank, complete=True))
    reviewed = deepcopy(blank)
    reviewed["reviewer"] = "synthetic-reviewer"
    reviewed["samples"][0].update(contact_status="both_grounded", shoes_px=[[10, 20], [30, 40]])
    reviewed["samples"][1].update(contact_status="airborne", note="Neither shoe touches the floor")
    counts = validate_review(reviewed, blank, complete=True)
    assert counts["both_grounded"] == counts["airborne"] == 1 and counts["pending"] == 0
    for field, value in (("reviewer", None), ("frame_size", [1280, 720]),
                         ("samples", reviewed["samples"][:1]),
                         ("samples", reviewed["samples"][::-1])):
        invalid = deepcopy(reviewed)
        invalid[field] = value
        rejects(lambda: validate_review(invalid, blank, complete=True))
    for index, field, value in ((0, "shoes_px", [[640, 20], [30, 40]]),
                                (0, "shoes_px", [[True, 20], [30, 40]]),
                                (0, "shoes_px", [[10, float("nan")], [30, 40]]),
                                (0, "shoes_px", [[10, 20], [10, 20]]),
                                (0, "time_s", 1.1), (0, "contact_status", []),
                                (1, "shoes_px", [[10, 20], [30, 40]]), (1, "note", "")):
        invalid = deepcopy(reviewed)
        invalid["samples"][index][field] = value
        rejects(lambda: validate_review(invalid, blank, complete=True))
    frames = sample_frames(374, 1200, 30, 3)
    assert frames == list(range(404, 1185, 30)) and len(frames) == 27
    assert all(374 <= frame - 3 < frame + 3 < 1200 for frame in frames)
    for args in ((374, 1200, 0, 0), (374, 1200, 30, 30), (374, 390, 30, 3),
                 (1200, 374, 30, 3), (374, 1200, 30, -1), (374.0, 1200, 30, 3)):
        rejects(lambda: sample_frames(*args))
    assert overlap([0, 0, 10, 10], [0, 0, 10, 10]) == 1
    assert overlap([0, 0, 10, 10], [20, 20, 10, 10]) == 0
    first = {"box_xywh": [1, 1, 10, 10]}
    assert matching_detection([0, 0, 10, 10], [first]) == first["box_xywh"]
    assert matching_detection([0, 0, 10, 10], [first, first]) is None
    assert matching_detection([0, 0, 10, 10], []) is None
    assert matching_detection([100, 100, 10, 10], [first]) is None
    assert checked_box([696, 334, 84, 226], 1280, 720) == (696, 334, 84, 226)
    for box in ([0, 0, 0, 1], [1270, 0, 20, 40], [0, float("nan"), 10, 10], [-1, 0, 10, 10]):
        rejects(lambda: checked_box(box, 1280, 720))
    image = np.zeros((720, 1280, 3), dtype=np.uint8)
    tensor, ratio = prepare(image, 416)
    assert tensor.shape == (1, 3, 416, 416) and ratio == 416 / 1280
    assert np.all(tensor[:, :, 234:] == 114)
    raw = np.zeros((1, 3549, 85), dtype=np.float32)
    assert people(raw, 416, 1) == []
    raw[0, 0, 2:4] = np.log([4, 8])
    raw[0, 0, 4:6] = [0.8, 0.9]
    result = people(raw, 416, 1)
    assert len(result) == 1
    np.testing.assert_allclose(result[0]["box_xywh"], [-16, -32, 32, 64], atol=1e-5)
    assert abs(result[0]["score"] - 0.72) < 1e-6
    assert people(raw, 416, 1, threshold=0.8) == []
    np.testing.assert_allclose(people(raw, 416, 0.5)[0]["box_xywh"], [-32, -64, 64, 128], atol=1e-5)
    # Adjacent grid cells encoding the same box must collapse under native NMS.
    raw[0, 1] = raw[0, 0]
    raw[0, 1, 0] = -1
    assert len(people(raw, 416, 1)) == 1
    raw[0, :2, 5] = 0  # Other COCO classes must not be emitted as people.
    raw[0, :2, 6] = 1
    assert people(raw, 416, 1) == []
    rejects(lambda: people(np.zeros((1, 10, 85)), 416, 1))
    corners = [[100, 100], [300, 100], [400, 500], [0, 500]]
    matrix = calibrate(corners)
    shoes = [corners[0], corners[2]]
    np.testing.assert_allclose(project_foot_midpoint(matrix, shoes, "near", "both_grounded"),
                               [0.5, 0.5], atol=1e-6)
    np.testing.assert_allclose(project_foot_midpoint(matrix, shoes[::-1], "far", "both_grounded"),
                               [0.5, 0.5], atol=1e-6)
    np.testing.assert_allclose(project_foot_midpoint(matrix, corners[:2], "far", "both_grounded"),
                               [0.5, 1], atol=1e-6)
    assert not np.allclose(project(matrix, np.mean(shoes, axis=0), "near"), [0.5, 0.5])
    for status in ("one_grounded", "airborne", "uncertain", "occluded"):
        assert project_foot_midpoint(matrix, None, "unknown", status) is None
    for points in (None, [[1, 2]], [[1, 2], [float("nan"), 3]]):
        rejects(lambda: project_foot_midpoint(matrix, points, "near", "both_grounded"))
    rejects(lambda: project_foot_midpoint(matrix, shoes, "near", "grounded"))
    rejects(lambda: project_foot_midpoint(matrix, shoes, "unknown", "both_grounded"))
    np.testing.assert_allclose(project_contact(matrix, corners[0], "near", "grounded"), [0, 0], atol=1e-6)
    for status in ("airborne", "uncertain", "occluded"):
        assert project_contact(matrix, None, "unknown", status) is None
    rejects(lambda: project_contact(matrix, corners[0], "near", "guessed"))
    rejects(lambda: project_contact(matrix, None, "near", "grounded"))
    assert reference_error_m(matrix, corners[0], [0, 0], [5.18, 13.4]) < 1e-6
    assert abs(reference_error_m(matrix, corners[0], [0.1, 0], [5.18, 13.4]) - 0.518) < 1e-6
    rejects(lambda: reference_error_m(matrix, corners[0], [0, 0], [5.18, 0]))
    for point, expected in zip(corners, [[0, 0], [1, 0], [1, 1], [0, 1]]):
        np.testing.assert_allclose(project(matrix, point, "near"), expected, atol=1e-6)
    np.testing.assert_allclose(project(matrix, [200, 100], "near"), [0.5, 0], atol=1e-6)
    np.testing.assert_allclose(project(matrix, [100, 100], "far"), [1, 1], atol=1e-6)
    rejects(lambda: calibrate([[0, 0], [1, 0], [2, 0], [3, 0]]))
    rejects(lambda: calibrate([corners[i] for i in [0, 2, 1, 3]]))
    rejects(lambda: project(matrix, [float("nan"), 0], "near"))
    rejects(lambda: project(matrix, [100, 100], "unknown"))
    rejects(lambda: project(np.zeros((3, 3)), [1, 1], "near"))

    document = {
        "version": 1, "recording_id": "synthetic-test", "setup_id": "synthetic",
        "consent_confirmed": True, "split": "tuning", "duration_s": 10,
        "frame_size": [640, 480], "players": ["p1", "p2"], "selected_player": "p1",
        "rallies": [{"id": "r1", "start_s": 1, "end_s": 3, "outcome": "unknown"}],
        "orientation": [{"start_s": 0, "end_s": 5, "side": "near"},
                        {"start_s": 5, "end_s": 10, "side": "far"}],
        "samples": [{"time_s": 2, "player_id": "p1", "visibility": "visible", "foot_px": [200, 300]},
                    {"time_s": 2, "player_id": "p2", "visibility": "occluded", "foot_px": None}],
    }
    validate(document)
    for key, value in [("consent_confirmed", False), ("duration_s", float("nan")),
                       ("players", ["p1", "p1"]), ("rallies", []), ("split", "test")]:
        invalid = deepcopy(document)
        invalid[key] = value
        rejects(lambda: validate(invalid))
    for section, field, value in [("rallies", "end_s", 11), ("rallies", "outcome", "guessed"),
                                  ("orientation", "end_s", 6), ("samples", "player_id", "p3"),
                                  ("samples", "foot_px", [640, 0]), ("samples", "time_s", 10)]:
        invalid = deepcopy(document)
        invalid[section][0][field] = value
        rejects(lambda: validate(invalid))
    invalid = deepcopy(document)
    invalid["samples"].append(invalid["samples"][0])
    rejects(lambda: validate(invalid))
    invalid = deepcopy(document)
    invalid["rallies"].append({"id": "r2", "start_s": 2, "end_s": 4, "outcome": "won"})
    rejects(lambda: validate(invalid))
    print("PASS: synthetic annotation, calibration, foot midpoint, review sampling, side-change, and detector checks")


if __name__ == "__main__":
    main()
