import copy
import unittest
from shot_review import ending_reviews


class EndingTests(unittest.TestCase):
    def setUp(self):
        player = dict(side='near',track_id=1,box_xywh=[50,50,100,200],court_xy=[.2,.8],pose_detected=True,
                      keypoints_xy=[[100,120] for _ in range(33)],keypoint_scores=[1.]*33)
        for joint in (11,12): player['keypoints_xy'][joint]=[100,80]
        for joint in (23,24): player['keypoints_xy'][joint]=[100,150]
        self.poses=dict(kind='tracked_player_pose',video_sha256='a'*64,fps=30,width=1280,height=720,
                        samples=[dict(time_s=i/30,source_frame=i,players=[copy.deepcopy(player)]) for i in range(30)])
        self.shuttle=dict(kind='raw_tracknet_shuttle_proposals',video_sha256='a'*64,settings=dict(start_s=0,end_s=1,fps=30),
                          samples=[dict(time_s=i/30,source_frame=i,xy_px=[500,120],inpainted=False) for i in range(30)])
        self.scenes=[dict(court=True,reset=False) for _ in range(30)]
        self.windows=[dict(start_s=0,end_s=1,review_stop_s=1)]

    def review(self): return ending_reviews(self.poses,self.shuttle,self.scenes,self.windows,[])[0]

    def test_opposite_side_is_observed_separation_not_claimed_intent(self):
        event=self.review()
        self.assertEqual(event['status'],'opposite_side_no_clear_attempt')
        self.assertAlmostEqual(event['evidence']['distancePx'],400)
        self.assertAlmostEqual(event['evidence']['distanceHeights'],2)
        self.assertIn('intent is unknown',event['summary'])
        self.assertLess(event['evidence']['time'],event['endTime'])

    def test_visible_wrist_movement_is_reach_candidate(self):
        for i,(pose,raw) in enumerate(zip(self.poses['samples'],self.shuttle['samples'])):
            pose['players'][0]['keypoints_xy'][16]=[100+6*i,120]
            raw['xy_px']=[210,120]
        self.assertEqual(self.review()['status'],'reach_or_swing_observed')

    def test_unknown_end_missing_tail_cut_and_identity_switch_abstain(self):
        self.windows[0]['end_s']=None
        self.assertIsNone(self.review()['evidence'])
        self.windows[0]['end_s']=1
        self.shuttle['samples'][-2]['xy_px']=None
        self.assertEqual(self.review()['status'],'unknown')
        self.shuttle['samples'][-2]['xy_px']=[500,120]
        self.scenes[-4]['reset']=True
        self.assertEqual(self.review()['status'],'unknown')
        self.scenes[-4]['reset']=False
        self.poses['samples'][-1]['players'][0]['track_id']=99
        self.assertEqual(self.review()['status'],'unknown')

    def test_occluded_pose_and_different_video_abstain_or_reject(self):
        for row in self.poses['samples']: row['players'][0]['keypoint_scores'][11]=.1
        self.assertIsNone(self.review()['evidence'])
        self.shuttle['video_sha256']='b'*64
        with self.assertRaises(ValueError): self.review()


if __name__=='__main__': unittest.main()
