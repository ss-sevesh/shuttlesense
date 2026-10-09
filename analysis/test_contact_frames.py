"""Frame-alignment, missing-evidence, geometry, and decoded-image regressions."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from contact_frames import angle_report, contact_report, join_angles
from shot_coach import extract_frames, parse_answer, evidence_hash, prompt


def reports():
    samples = []
    for frame in range(230, 237):
        points = np.full((33, 2), 50.)
        player = {'track_id': 1, 'side': 'near', 'box_xywh': [0, 0, 100, 100], 'court_xy': [.5, .7],
                  'keypoints_xy': points.tolist(), 'keypoint_scores': [1.] * 33}
        samples.append({'source_frame': frame, 'time_s': frame / 30, 'players': [player]})
    poses = {'video_sha256': 'a' * 64, 'kind': 'tracked_player_pose', 'fps': 30, 'settings': {'sample_hz': 30}, 'samples': samples}
    raw = [{'source_frame': 230 + i, 'time_s': (230 + i) / 30, 'xy_px': [50 + distance, 50]} for i, distance in enumerate([45, 28, 12, 3, 18, 40, 60])]
    shuttle = {'video_sha256': 'a' * 64, 'kind': 'raw_tracknet_shuttle_proposals', 'settings': {'fps': 30, 'start_s': 230 / 30, 'end_s': 237 / 30}, 'samples': raw}
    seed = {'source_frame': 232, 'time_s': 232 / 30, 'track_id': 1, 'side': 'near', 'wrist': 15,
            'score': 1., 'evidence': {}, 'shot_type': None, 'shot_status': 'not_classified', 'review_status': 'candidate'}
    return poses, shuttle, seed


class ContactTests(unittest.TestCase):
    def select(self, poses, shuttle, seed):
        with patch('contact_frames.hit_candidates', return_value=[seed]):
            return contact_report(poses, shuttle)

    def test_minimum_selects_233_before_exact_angle_join(self):
        poses, shuttle, seed = reports()
        selected = self.select(poses, shuttle, seed)
        self.assertEqual(selected['hits'][0]['source_frame'], 233)
        self.assertEqual(selected['hits'][0]['contact']['distancePx'], 3)
        self.assertNotIn('measurements', selected['hits'][0]['contact'])
        angles = angle_report(poses)
        angles['samples'][3]['players'][0]['left_elbow_deg'] = 123.
        joined = join_angles(selected, angles)
        self.assertEqual(joined['hits'][0]['contact']['measurements']['elbow'], 123.)
        angles['video_sha256'] = 'b' * 64
        with self.assertRaises(ValueError): join_angles(joined, angles)

    def test_unresolved_evidence(self):
        for case, expected in [('missing', 'missing_observations'), ('switch', 'identity_switch'),
                               ('flat', 'ambiguous_minimum'), ('boundary', 'unbracketed_minimum'), ('gap', 'unbracketed_minimum')]:
            poses, shuttle, seed = reports()
            if case == 'missing':
                for row in shuttle['samples']: row['xy_px'] = None
            elif case == 'switch': poses['samples'][4]['players'][0]['track_id'] = 2
            elif case == 'flat': shuttle['samples'][4]['xy_px'] = [53, 50]
            elif case == 'boundary': shuttle['samples'][0]['xy_px'] = [50, 50]
            elif case == 'gap': shuttle['samples'][2]['xy_px'] = None
            result = self.select(poses, shuttle, seed)['hits'][0]['contact']
            self.assertEqual(result['status'], expected, case)
            self.assertIsNone(result['frame'])

    def test_hidden_wrist_15hz_and_wrong_hash(self):
        poses, shuttle, seed = reports()
        for row in poses['samples']: row['players'][0]['keypoint_scores'][15] = .1
        self.assertIsNone(self.select(poses, shuttle, seed)['hits'][0]['contact']['frame'])
        poses['settings']['sample_hz'] = 15
        with self.assertRaises(ValueError): self.select(poses, shuttle, seed)
        poses['settings']['sample_hz'] = 30
        shuttle['video_sha256'] = 'b' * 64
        with self.assertRaises(ValueError): self.select(poses, shuttle, seed)

    def test_far_player_does_not_create_contacts(self):
        poses, shuttle, seed = reports()
        with patch('contact_frames.hit_candidates', return_value=[{**seed, 'side': 'far'}]):
            self.assertEqual(contact_report(poses, shuttle)['hits'], [])
        for row in poses['samples']:
            row['players'].append({**deepcopy(row['players'][0]), 'side': 'far', 'track_id': 2})
        self.assertTrue(all(p['side'] == 'near' for row in angle_report(poses)['samples'] for p in row['players']))
        with patch('contact_frames.hit_candidates', return_value=[seed]) as finder:
            contact_report(poses, shuttle)
            self.assertTrue(all(p['side'] == 'near' for row in finder.call_args.args[0] for p in row['players']))

    def test_suppression_and_multiple_swings(self):
        poses, shuttle, seed = reports()
        extra = deepcopy(poses['samples'])
        for row in extra:
            row['source_frame'] += 30
            row['time_s'] += 1
        poses['samples'] += extra
        extra_raw = deepcopy(shuttle['samples'])
        for row in extra_raw:
            row['source_frame'] += 30
            row['time_s'] += 1
        shuttle['samples'] += [{'source_frame': f, 'time_s': f / 30, 'xy_px': None} for f in range(237, 260)] + extra_raw
        shuttle['settings']['end_s'] = 267 / 30
        later = {**seed, 'source_frame': 262, 'time_s': 262 / 30}
        with patch('contact_frames.hit_candidates', return_value=[seed, seed, later]):
            self.assertEqual([h['source_frame'] for h in contact_report(poses, shuttle)['hits']], [233, 263])

    def test_independent_geometry(self):
        poses, _, _ = reports()
        for row in poses['samples']:
            points = row['players'][0]['keypoints_xy']
            for i, p in {11: [0, 0], 12: [2, 0], 23: [0, 2], 24: [2, 2], 13: [-1, 0], 15: [-2, 0]}.items(): points[i] = p
        measured = angle_report(poses)['samples'][0]['players'][0]
        self.assertEqual(measured['left_elbow_deg'], 180)
        self.assertEqual(measured['body_lean_deg'], 0)
        self.assertEqual(measured['left_arm_elevation_deg'], 90)
        poses['samples'][0]['players'][0]['keypoint_scores'][11] = .1
        measured = angle_report(poses)['samples'][0]['players'][0]
        self.assertIsNone(measured['left_elbow_deg'])
        self.assertIsNone(measured['body_lean_deg'])

    def test_five_decoded_frames_and_edges(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            video = root / 'input.avi'
            writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*'MJPG'), 30, (32, 32))
            for i in range(8): writer.write(np.full((32, 32, 3), i * 25, dtype=np.uint8))
            writer.release()
            hits = [{'contact': {'frame': 4}}, {'contact': {'frame': 0}}, {'contact': {'frame': None}}]
            extract_frames(video, hits, root / 'frames')
            self.assertEqual(hits[0]['contact']['frames'], [2, 3, 4, 5, 6])
            self.assertEqual(hits[1]['contact']['frames'], [None, None, 0, 1, 2])
            self.assertEqual(hits[2]['contact']['frames'], [])
            for frame in range(7): self.assertAlmostEqual(cv2.imread(str(root / 'frames' / f'{frame}.jpg')).mean(), frame * 25, delta=2)

    def test_coaching_parser_and_hash(self):
        answer = {'shotType': 'unknown', 'visibleEvidence': 'Visible arm', 'uncertainty': 'Contact estimated', 'coaching': 'Observe the follow-through.'}
        self.assertEqual(parse_answer('```json\n' + json.dumps(answer) + '\n```'), answer)
        for bad in ['Not enough evidence', '{}', '```', '```json\n{}', json.dumps({**answer, 'shotType': 'made up'}), json.dumps({**answer, 'coaching': 23})]:
            with self.assertRaises((ValueError, TypeError)): parse_answer(bad)
        with tempfile.TemporaryDirectory() as temp:
            frames = Path(temp)
            for f in range(5): (frames / f'{f}.jpg').write_bytes(bytes([f]))
            hit = {'side': 'near', 'track_id': 1, 'play_status': 'end_uncertain_review', 'contact': {'frames': list(range(5)), 'measurements': {'racketFace': None}}}
            before = evidence_hash(hit, 30, frames)
            (frames / '2.jpg').write_bytes(b'changed')
            self.assertNotEqual(evidence_hash(hit, 30, frames), before)
            self.assertIn('end_uncertain_review', prompt(hit, 30))


if __name__ == '__main__': unittest.main()
