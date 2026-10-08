"""Synthetic cue checks; no claim about real-video accuracy."""
from copy import deepcopy
import numpy as np
from tracked_rallies import COCO, hit_candidates, tracked_signals, rally_intervals, mediapipe_posture, pose_measurements, validate_observations, play_status


def person(track=1, side='near', wrist=20):
    points=np.zeros((33,2));points[:,0]=50;points[:,1]=50
    points[15]=[wrist,50];points[16]=[50,50]
    return {'track_id':track,'side':side,'box_xywh':[0,0,100,100],
            'keypoints_xy':points.tolist(),'keypoint_scores':[1.]*33,
            'court_xy':[.7,.7] if side=='near' else [.3,.3]}


samples=[{'time_s':i/15,'source_frame':i*2,'players':[person(wrist=w),person(2,'far',50)]}
         for i,w in enumerate([20,40,42,60,62,80,82])]
raw=[{'time_s':i/30,'source_frame':i,'xy_px':[40 if i<5 else 60 if i<9 else 80,50]}
     for i in range(14)]
hits=hit_candidates(samples,raw,30)
assert hits and all(h['track_id']==1 for h in hits)
assert all(b['time_s']-a['time_s'] >= .25 for a,b in zip(hits,hits[1:]))
assert hit_candidates(samples,[{**s,'xy_px':None} for s in raw],30)==[]
missing=deepcopy(samples)
for s in missing:
    for p in s['players']: p['keypoint_scores'][15]=.1
assert hit_candidates(missing,raw,30)==[]
switched=deepcopy(samples)
for s in switched[1::2]: s['players'][0]['track_id']=99
assert hit_candidates(switched,raw,30)==[]
signals=tracked_signals(samples,raw,30)
assert signals[0]['reset'] and not signals[1]['reset']
occluded=deepcopy(samples);occluded[2]['players']=[]
signals=tracked_signals(occluded,raw,30)
assert signals[2]['reset'] and signals[3]['reset']
try: tracked_signals([samples[0],samples[0]],raw,30)
except ValueError: pass
else: raise AssertionError('Duplicate timestamps accepted')
activity=rally_intervals({'serves':[]},hits,0,1)
assert activity==[]  # Motion without an accepted near-side serve is outside play.
cues={'serves':[{'launch_s':.1,'setup_start_s':0,'previous_end_s':None},
                {'launch_s':3,'setup_start_s':2.8,'previous_end_s':2.0}]}
rallies=rally_intervals(cues,[{'time_s':1.2},{'time_s':3.1}],0,5)
assert abs(rallies[0]['end_s']-1.4)<1e-6 and rallies[1]['end_s'] is None
assert play_status(1.2,rallies)=='possible_play'
assert play_status(2,rallies)=='outside_play'
assert play_status(4,rallies)=='end_uncertain_review'
changed=deepcopy(cues)
changed['serves'][0]['epoch']=1; changed['serves'][1]['epoch']=2
assert rally_intervals(changed,[{'time_s':1.2},{'time_s':3.1}],0,5)[0]['end_s'] is None
closed={'serves':[{'launch_s':.1,'setup_start_s':0,'previous_end_s':None,'epoch':0}],
        'quiet_candidates':[{'start_s':2,'observed_until_s':4,'epoch':0}]}
interval=rally_intervals(closed,[{'time_s':1.2},{'time_s':4.5}],0,6)[0]
assert abs(interval['end_s']-1.4)<1e-6 and interval['hit_candidates']==1
assert len(COCO)==17 and len(set(COCO))==17
points=np.zeros((33,2));scores=np.ones(33)
points[[11,12]]=[50,20];points[[23,24]]=[50,50];points[[27,28]]=[50,90];points[[15,16]]=[50,45]
assert mediapipe_posture(points,scores,100)=={'body_visible':True,'serve_ready':True,'wrists_observed':True}
scores[[15,16]]=.1
assert mediapipe_posture(points,scores,100)=={'body_visible':True,'serve_ready':False,'wrists_observed':False}
assert pose_measurements(samples)[0]['players'][0]['wrist_speed_heights_s'] is None
pose_report={'kind':'tracked_player_pose','fps':30,'samples':samples}
shuttle_report={'settings':{'fps':30,'start_s':0,'end_s':14/30},'samples':raw}
validate_observations(pose_report,shuttle_report)
for bad in (raw[:3]+raw[8:], [{**s,'inpainted':True} for s in raw]):
    try: validate_observations(pose_report,{**shuttle_report,'samples':bad})
    except ValueError: pass
    else: raise AssertionError('Unobserved/inpainted shuttle evidence accepted')
print('Tracked hit suppression, identity gaps, missing evidence and uncertain boundary checks passed')
