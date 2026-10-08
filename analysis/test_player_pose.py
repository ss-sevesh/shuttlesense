"""Identity lock must abstain instead of adopting an official or replacement."""
import unittest
import numpy as np
from player_pose import select_players


class SelectionTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
