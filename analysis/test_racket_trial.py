"""Racket proximity is a candidate cue, not confirmed contact."""
import unittest
import hashlib
import json
from pathlib import Path
import tempfile

import numpy as np

from racket_trial import associate, load_inputs, mask_distance, select_minimum


class RacketTests(unittest.TestCase):
    def test_distance_uses_original_mask_pixels_not_box_center(self):
        mask = np.zeros((100, 200), dtype=bool)
        mask[40:43, 80:83] = True
        distance, point = mask_distance(mask, [86, 42])
        self.assertEqual(distance, 4)
        self.assertEqual(point, [82, 42])
        self.assertEqual(mask_distance(mask, [81, 41])[0], 0)
        self.assertIsNone(mask_distance(np.zeros_like(mask), [86, 42]))
        with self.assertRaises(ValueError): mask_distance(mask, [float('nan'), 0])
        with self.assertRaises(ValueError): mask_distance(mask, [200, 0])

    def test_near_far_missing_and_ambiguous_association(self):
        near = {'side': 'near', 'track_id': 1, 'box_xywh': [50, 50, 40, 80]}
        far = {'side': 'far', 'track_id': 2, 'box_xywh': [140, 5, 20, 30]}
        self.assertEqual(associate([40, 60, 10, 10], [near, far]), near)
        self.assertEqual(associate([145, 5, 10, 10], [near, far]), far)
        self.assertIsNone(associate([0, 0, 10, 10], []))
        self.assertIsNone(associate([500, 500, 10, 10], [near, far]))
        self.assertIsNone(associate([60, 60, 10, 10], [near, {**near, 'side': 'far', 'track_id': 2}]))

    def test_minimum_requires_adjacent_evidence_and_unique_identity(self):
        rows = [{'source_frame': i, 'distance_px': d, 'track_id': 1}
                for i, d in enumerate([10, 5, 2, 6, 12])]
        self.assertEqual(select_minimum(rows, [0, 4])['frame'], 2)
        for changes, reason in [({2: None}, 'unbracketed_minimum'),
                                ({3: 2}, 'ambiguous_minimum'),
                                ({0: 1}, 'unbracketed_minimum')]:
            changed = [{**row, 'distance_px': changes.get(row['source_frame'], row['distance_px'])} for row in rows]
            self.assertEqual(select_minimum(changed, [0, 4])['status'], reason)
        self.assertEqual(select_minimum([], [0, 4])['status'], 'missing_observations')
        rows[3]['track_id'] = 2
        self.assertEqual(select_minimum(rows, [0, 4])['status'], 'identity_switch')

    def test_inputs_reject_wrong_video_hash_gaps_and_timestamps(self):
        with tempfile.TemporaryDirectory() as directory:
            job = Path(directory)
            (job / 'source.mp4').write_bytes(b'fixture')
            video_hash = hashlib.sha256(b'fixture').hexdigest()
            samples = [{'source_frame': i, 'time_s': i / 30} for i in range(3)]
            poses = {'video_sha256': video_hash, 'fps': 30, 'samples': samples}
            shuttle = {'video_sha256': video_hash, 'settings': {'fps': 30}, 'samples': samples}
            contacts = {'video_sha256': video_hash}
            for name, value in [('players.json', poses), ('shuttle.json', shuttle), ('contacts.json', contacts)]:
                (job / name).write_text(json.dumps(value))
            self.assertEqual(len(load_inputs(job)[0]['samples']), 3)
            for bad in [{**poses, 'video_sha256': 'wrong'},
                        {**poses, 'samples': [samples[0], samples[2]]},
                        {**poses, 'samples': [{**samples[0], 'time_s': .1}, *samples[1:]]}]:
                (job / 'players.json').write_text(json.dumps(bad))
                with self.assertRaises(ValueError): load_inputs(job)


if __name__ == '__main__':
    unittest.main()
