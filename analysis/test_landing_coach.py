import unittest
from landing_coach import before_frames, landing_prompt, pose_context


class LandingTests(unittest.TestCase):
    def test_frames_cover_preceding_second_and_exclude_landing(self):
        self.assertEqual(before_frames(300, 30, 1202), [270, 278, 285, 292, 299])
        for frame in (0, 29, 1202, -1):
            with self.assertRaises(ValueError): before_frames(frame, 30, 1202)
        with self.assertRaises(ValueError): before_frames(300.5, 30, 1202)
        with self.assertRaises(ValueError): before_frames(20, 5, 1202)

    def test_context_uses_near_player_and_preserves_missing_pose(self):
        data = {'fps': 30, 'poseSampleHz': 30, 'samples': [
            {'time': i / 30, 'people': [{'side': 'far', 'trackId': 2},
                {'side': 'near', 'trackId': 1, 'court': [.4, .8], 'poseDetected': i != 2,
                 'measurements': {'leftElbow': 90}}]} for i in range(4)]}
        context = pose_context(data, [1, 2, 3])
        self.assertEqual([p['trackId'] for p in context], [1, 1, 1])
        self.assertIsNone(context[1]['measurements'])
        self.assertEqual(context[0]['court'], [.4, .8])
        self.assertIsNone(pose_context(data, [30])[0]['trackId'])
        sparse = {**data, 'samples': [data['samples'][0], data['samples'][2]], 'poseSampleHz': 15}
        self.assertEqual(pose_context(sparse, [1])[0]['poseTime'], 0)
        self.assertIsNone(pose_context({**sparse, 'samples': [data['samples'][2]]}, [1])[0]['poseTime'])
        data['samples'][3]['people'][1]['trackId'] = 3
        with self.assertRaises(ValueError): pose_context(data, [1, 2, 3])

    def test_prompt_distinguishes_selected_landing_from_verified_impact(self):
        text = landing_prompt({'landingFrame': 300, 'fps': 30, 'frames': [270, 277, 285, 292, 299], 'pose': []})
        self.assertIn('user-selected', text)
        self.assertIn('near/bottom', text)
        self.assertIn('alternative', text)
        self.assertIn('not confirm', text)


if __name__ == '__main__': unittest.main()
