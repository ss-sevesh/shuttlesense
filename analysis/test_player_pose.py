"""Identity lock must abstain instead of adopting an official or replacement."""
import unittest
import numpy as np
from player_pose import select_players, merge_far_detections


class SelectionTest(unittest.TestCase):
    def test_far_crop_offsets_and_duplicate_suppression(self):
        matrix = np.diag([.01,.01,1])
        full = [[15,5,25,25,.6,0],[20,50,40,80,.9,0]]
        crop = [[5,5,15,25,.8,0],[10,50,30,80,.95,0]]
        result = merge_far_detections(full, crop, [10,0,100,100], matrix)
        self.assertEqual(len(result), 2)
        far = next(row for row in result if row[1] == 5)
        np.testing.assert_allclose(far, [15,5,25,25,.8,0])
        self.assertEqual(merge_far_detections([], [], [10,0,100,100], matrix).shape, (0,6))

    def test_lock_and_missing(self):
        locked = {}
        boxes = [(1, [.2, .1, .1, .1]), (2, [.4, .6, .2, .2]), (3, [1.2, .1, .3, .3])]
        result = select_players(boxes, np.eye(3), locked)
        self.assertEqual(locked, {"far": 1, "near": 2})
        self.assertEqual(len(result), 2)
        replacements = [(4, [.2, .1, .1, .1]), boxes[1]]
        self.assertEqual([p["side"] for p in select_players(replacements, np.eye(3), locked)], ["near"])
        self.assertEqual(locked["far"], 1)
        off_court = [(1, [.2, -.3, .1, .1])]
        self.assertEqual(select_players(off_court, np.eye(3), locked)[0]["track_id"], 1)

    def test_reacquisition_is_explicit_and_waits(self):
        locked = {}
        state = dict(last_seen={}, pending={}, events=[], segments={})
        select_players([(1, [.2,.1,.1,.1])], np.eye(3), locked, state, 0)
        replacement = [(2, [.2,.1,.1,.1])]
        self.assertEqual(select_players(replacement, np.eye(3), locked, state, .4), [])
        self.assertEqual(select_players(replacement, np.eye(3), locked, state, .6), [])
        result = select_players(replacement, np.eye(3), locked, state, 1)
        self.assertEqual(result[0]["identity_segment"], 1)
        self.assertEqual(state["events"][0]["previous_track_id"], 1)
        ambiguous = [(3, [.2,.1,.1,.1]), (4, [.4,.1,.1,.1])]
        self.assertEqual(select_players(ambiguous, np.eye(3), locked, state, 2), [])


if __name__ == "__main__":
    unittest.main()
