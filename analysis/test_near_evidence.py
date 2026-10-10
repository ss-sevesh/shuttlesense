import cv2
import numpy as np
from near_evidence import fit_markings, describe_pose, white_markings, refine_line, trim_intersections

mask = np.zeros((1050,700), dtype='uint8')
for x in (56,100,350,600,644): cv2.line(mask, (x,500 if x != 350 else 649), (x,1000), 255, 4)
for y in (649,943,1000): cv2.line(mask, (56,y), (644,y), 255, 4)
lines = fit_markings(mask)
assert len(lines) == 8
assert {l['name'] for l in lines} >= {'Singles left','Singles right','Back boundary'}
assert fit_markings(np.zeros_like(mask)) == []
# Isolated white clutter must not become a sideline.
clutter = np.zeros_like(mask); cv2.rectangle(clutter,(95,700),(110,740),255,-1)
assert fit_markings(clutter) == []
cv2.rectangle(mask,(90,680),(115,800),0,-1)
assert any(l['name'] == 'Singles left' for l in fit_markings(mask))
p = {'keypoints_xy': np.zeros((33,2)).tolist(), 'keypoint_scores': [1.]*33}
p['keypoints_xy'][12][1],p['keypoints_xy'][24][1] = 30,80
for y,label in ((10,'Raised arm'),(50,'Arm at torso'),(100,'Low arm')):
    p['keypoints_xy'][16][1] = y
    assert describe_pose(p,'right').startswith(label)
p['keypoint_scores'][16] = .1
assert describe_pose(p,'right') == 'Pose uncertain'
print('Line fitting, white-clutter rejection, occlusion and pose confidence checks passed.')
frame = np.full((300,400,3), (155,190,165), dtype='uint8')
cv2.line(frame,(70,20),(160,270),(235,235,235),3)
white = white_markings(frame)
assert white[150,300] == 0 and white[145,115] > 0
points = refine_line(white,[[74,20],[166,270]])
assert points is not None
for point in points:
    assert abs(np.array([-250,90])@(np.asarray(point)-[70,20]))/np.hypot(90,250) < 1
assert refine_line(np.zeros_like(white),[[74,20],[166,270]]) is None
assert refine_line(white,[[74,20],[74,20]]) is None
edges = [{'name':'Doubles left','points':[[20,20],[10,250]]},
         {'name':'Doubles right','points':[[280,20],[290,250]]},
         {'name':'Back boundary','points':[[5,240],[295,240]]},
         {'name':'Short service','points':[[5,100],[295,100]]},
         {'name':'Centre service','points':[[150,90],[150,260]]}]
trim_intersections(edges,400,300)
assert np.allclose(edges[-1]['points'],[[150,100],[150,240]])
assert abs(edges[0]['points'][1][1]-240) < 1e-6
assert 16 < edges[3]['points'][0][0] < 17
print('Original-pixel slanted stripe, pale-floor rejection, abstention and fitted intersections passed.')
from unittest.mock import patch
from near_evidence import hit_poses
p['keypoint_scores'][16] = 1.
person = {**p, 'side':'near', 'track_id':1}
poses = {'fps':30,'samples':[{'source_frame':12,'players':[person]}]}
contact = {'frame':12,'seedFrame':11,'wrist':'right','status':'estimated','measurements':{'elbow':90,'bodyLean':10}}
joined = {'hits':[{'track_id':1,'contact':contact}]}
with patch('contact_frames.contact_report',return_value={}), patch('contact_frames.angle_report',return_value={}), patch('contact_frames.join_angles',return_value=joined):
    scenes = [{'court':True} for _ in range(20)]
    event = hit_poses(poses,{},scenes)[0]
    assert event['frame']==12 and event['time']==.4 and event['status']=='estimated_contact'
    assert event['measurements']['elbow']==90
    scenes[12]['court']=False
    assert hit_poses(poses,{},scenes)==[]
    scenes[12]['court']=True
    poses['samples'][0]['players'][0]['side']='far'
    assert hit_poses(poses,{},scenes)==[]
print('Exact-frame pose join and far-side / excluded-view rejection passed.')
