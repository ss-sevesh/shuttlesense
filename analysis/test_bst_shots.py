"""Offline checks for the pretrained BST input adapter."""
import unittest

import numpy as np

from bst_shots import COCO_FROM_MEDIAPIPE, fixed_length, normalize_player, prepare_window, classify_hits


def person(side='near', offset=0):
    return {'side': side, 'track_id': 1 if side == 'near' else 2,
            'keypoints_xy': [[20 + i + offset, 40 + i] for i in range(33)],
            'keypoint_scores': [1.] * 33, 'box_xywh': [10 + offset, 20, 60, 80],
            'court_xy': [.5, .8 if side == 'near' else .2]}


class AdapterTests(unittest.TestCase):
    def test_raw_shuttle_gaps_and_inpainting_rejected_before_inference(self):
        raw=[{'time_s':i/30,'xy_px':[10,20]} for i in range(30)]
        report={'kind':'raw_tracknet_shuttle_proposals','settings':{'start_s':0,'end_s':1,'fps':30},'samples':raw}
        for rows in (raw[:5]+raw[10:], [{**s,'inpainted':True} for s in raw]):
            with self.assertRaises(ValueError): classify_hits({}, {**report,'samples':rows}, [])

    def test_landmark_order_and_bbox_normalization(self):
        p = person()
        values, court, visibility = normalize_player(p)
        expected = (np.array(p['keypoints_xy'])[COCO_FROM_MEDIAPIPE] - [40, 60]) / 100
        np.testing.assert_allclose(values, expected, atol=1e-7)
        np.testing.assert_allclose(court, [.5, .8])
        self.assertEqual(visibility, 1)
        np.testing.assert_allclose(normalize_player(person(offset=100))[0], values, atol=1e-7)

    def test_low_visibility_matches_official_missing_coordinate_behavior(self):
        p = person()
        p['keypoint_scores'][15] = .1
        values, _, _ = normalize_player(p)
        np.testing.assert_allclose(values[9], [-.3, -.4])

    def test_reject_bad_shape_and_nonfinite(self):
        for edit in ({'keypoints_xy': [[1, 2]]}, {'court_xy': [float('nan'), .5]},
                     {'box_xywh': [0, 0, 0, 50]}):
            with self.assertRaises(ValueError):
                normalize_player({**person(), **edit})

    def test_exact_stride_and_padding(self):
        for count, expected_length, stride in ((30, 30, 1), (101, 100, 1),
                                               (151, 76, 2), (200, 100, 2)):
            joints = np.repeat(np.arange(count)[:, None, None, None], 2 * 17 * 2, axis=3).reshape(count, 2, 17, 2)
            positions = np.zeros((count, 2, 2))
            shuttle = np.column_stack((np.arange(count), np.arange(count)))
            j, p, s, length = fixed_length(joints, positions, shuttle)
            self.assertEqual(length, expected_length)
            self.assertEqual(j.shape, (100, 2, 17, 2))
            np.testing.assert_equal(s[:length, 0], np.arange(count)[::stride][:100])
            self.assertFalse(s[length:].any())

    def test_window_orders_far_first_and_normalizes_shuttle(self):
        samples = [{'time_s': 0., 'players': [person(), person('far')]}]
        raw = [{'time_s': 0., 'xy_px': [640, 360]}]
        features, positions, shuttle, length, quality = prepare_window(samples, raw, 0, .04, 1280, 720)
        self.assertEqual(features.shape, (100, 2, 72))
        np.testing.assert_allclose(positions[0], [[.5, .2], [.5, .8]])
        np.testing.assert_allclose(shuttle[0], [.5, .5])
        self.assertEqual(length, 1)
        self.assertEqual(quality['two_player_fraction'], 1)

    def test_missing_pose_cannot_be_carried_through_long_gap(self):
        samples = [{'time_s': 0., 'players': [person(), person('far')]}]
        raw = [{'time_s': .5, 'xy_px': [640, 360]}]
        features, positions, shuttle, _, quality = prepare_window(samples, raw, .5, .6, 1280, 720)
        self.assertFalse(features.any())
        self.assertFalse(shuttle.any())
        self.assertEqual(quality['two_player_fraction'], 0)

    def test_window_flags_identity_switch_on_either_court_side(self):
        for side in ('near', 'far'):
            before = [person(), person('far')]
            after = [person(), person('far')]
            next(p for p in after if p['side'] == side)['track_id'] = 99
            samples = [{'time_s': 0., 'players': before}, {'time_s': .1, 'players': after}]
            raw = [{'time_s': 0., 'xy_px': [640, 360]}, {'time_s': .1, 'xy_px': [650, 370]}]
            *_, quality = prepare_window(samples, raw, 0, .15, 1280, 720)
            self.assertTrue(quality['identity_switch'])
            self.assertEqual(len(quality['track_ids'][side]), 2)
            next(p for p in after if p['side'] == side)['pose_detected'] = False
            *_, quality = prepare_window(samples, raw, 0, .15, 1280, 720)
            self.assertTrue(quality['identity_switch'])


if __name__ == '__main__':
    unittest.main()
