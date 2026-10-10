"""Missing shuttle / scene cuts never assert ground contact or bridge rallies."""
from focused_rallies import DEFAULT_OPTIONS, validate_options, court_segments, rally_windows

assert validate_options(dict(DEFAULT_OPTIONS))['llm'] is False
for changes in ({'shuttle': False}, {'llm': True}, {'pose': True, 'yolo': False}, {'ground': 'false'}):
    try: validate_options({**DEFAULT_OPTIONS, **changes})
    except ValueError: pass
    else: raise AssertionError(changes)
scenes = [{'court': True, 'reset': False} for _ in range(150)]
raw = [{'source_frame': i, 'time_s': i/30, 'xy_px': [20+5*(i%20),50]} for i in range(150)]
assert court_segments(scenes) == [(0,150)]
scenes[60] = {'court': False, 'reset': True}
scenes[61]['reset'] = True
assert court_segments(scenes) == [(0,60),(61,150)]
windows = rally_windows(raw, scenes, 30, None)
assert len(windows) == 2 and windows[0]['review_stop_s'] <= 2 and windows[1]['start_s'] >= 61/30
assert all(w['end_s'] is None for w in windows)
for row in raw: row['xy_px'] = None
assert not rally_windows(raw, scenes, 30, {'candidates': [{'time':1}]})
for i in range(20): raw[i]['xy_px'] = [20+5*i,50]
windows = rally_windows(raw, scenes, 30, {'candidates': [{'time':.7}]})
assert len(windows)==1 and windows[0]['end_s']==.7 and windows[0]['end_status']=='possible_ground_touch'
assert not rally_windows(raw[:5], scenes[:5], 30, None)
print('Rally activity, gaps, cut boundaries, short noise and unconfirmed ground endings passed.')
