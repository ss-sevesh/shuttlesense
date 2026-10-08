"""Checks cue sequencing and uncertainty without claiming real-video accuracy."""
from copy import deepcopy
import numpy as np
from serve_rallies import boundaries, diagonal, posture
from serve_review import byte_range

assert byte_range(None,100)==(0,99)
assert byte_range('bytes=10-20',100)==(10,20)
assert byte_range('bytes=90-',100)==(90,99)
for bad in ('bytes=101-','bytes=20-10','bytes=-20','bytes=0-1,5-9'):
    try: byte_range(bad,100)
    except ValueError: pass
    else: raise AssertionError('Invalid byte range accepted')

assert diagonal([[.3,.3],[.7,.7]])
assert not diagonal([[.3,.3],[.3,.7]])
assert not diagonal([None,[.7,.7]])
points = np.zeros((133,2)); scores = np.ones(133)
points[[5,6]] = [50,20]; points[[11,12]] = [50,50]
points[[9,10]] = [50,45]; points[[15,16]] = [50,90]
assert posture(points,scores,100) == {'body_visible':True,'serve_ready':True}
scores[9] = .1
assert not posture(points,scores,100)['body_visible']

raw = []
for frame in range(270):
    t = frame/30
    point = [70+t*30,80] if t < 2 else [70,80] if t < 6 else [70-(t-6)*60,80-(t-6)*180]
    raw.append({'time_s':t,'xy_px':point})
signals = []
for frame in range(45):
    t = frame/5
    signals.append({'time_s':t,'motion_heights_per_s':0 if 2<=t<=6 else 1,
        'reset':frame==0,'court_view':True,'both_players_visible':True,'shuttle_moving':t<2,
        'players_court_xy':[[.3,.3],[.7,.7]],'players_box_xywh':[[20,10,20,30],[60,50,20,40]],
        'pose':[{'body_visible':True,'serve_ready':True}]*2 if 5<=t<=6 else []})
result = boundaries(signals,raw,30)
assert len(result['serves'])==1, result
serve = result['serves'][0]
assert serve['server_side']=='near' and abs(serve['launch_s']-6)<1e-6
assert abs(serve['previous_end_s']-2)<1e-6
assert serve['review_status']=='provisional'
assert boundaries(signals,[{**s,'xy_px':None} for s in raw],30)['serves']==[]
assert boundaries([{**s,'shuttle_moving':False} for s in signals],raw,30)['quiet_candidates']==[]
assert boundaries([{**s,'players_court_xy':[[.3,.3],[.3,.7]]} for s in signals],raw,30)['serves']==[]
assert boundaries([{**s,'pose':[]} for s in signals],raw,30)['serves']==[]
# A detection miss breaks stationary evidence; it cannot count toward the two seconds.
missing = deepcopy(raw); missing[90]['xy_px']=None
assert boundaries(signals,missing,30)['serves'][0]['previous_end_s'] is None
chunked = deepcopy(raw); chunked[150]['chunk_start']=True
assert boundaries(signals,chunked,30)['serves'][0]['previous_end_s']==2
# A camera reset discards the previous quiet interval, even if the next serve is visible.
reset = [{**s,'reset':s['reset'] or abs(s['time_s']-4.8)<1e-6} for s in signals]
assert boundaries(reset,raw,30)['serves'][0]['previous_end_s'] is None
# Staying in one half while moving is not stationary evidence.
moving = [{**s,'xy_px':[70+s['time_s']*20,80]} if s['time_s']<5 else s for s in raw]
assert boundaries(signals,moving,30)['serves'][0]['previous_end_s'] is None
try: boundaries([signals[0],signals[0]],raw,30)
except ValueError: pass
else: raise AssertionError('Duplicate signal times accepted')
print('Serve-first sequencing, pose proxy, missing-data and cut checks passed')
