"""Run with data/tracknet-env/Scripts/python.exe analysis/test_shuttle.py."""
import numpy as np
from shuttle import channels, location
from rallies import separate, shuttle_evidence

rgb = np.zeros((288, 512, 3), np.uint8)
rgb[:, :, 0] = 255
assert channels(rgb).shape == (3, 288, 512)
assert channels(rgb)[0, 0, 0] == 255 and channels(rgb)[2, 0, 0] == 0
heatmap = np.zeros((288, 512), np.float32)
assert location(heatmap, 1280, 720) is None
heatmap[20:24, 40:44] = .9
assert location(heatmap, 1280, 720) == [105, 55]
heatmap[100, 100] = .99
assert location(heatmap, 1280, 720) == [105, 55]  # Largest contour, not highest pixel.
heatmap[:] = 0
heatmap[20:23, 40:43] = .9
assert location(heatmap, 1280, 720) == [102, 52]  # Official decoder rounds before scaling.
signals = [{'time_s': t / 5, 'motion_heights_per_s': 1 if t < 15 else 0, 'reset': False}
           for t in range(35)]
raw = [{'time_s': t / 30, 'xy_px': [t * 3, 20] if t < 90 else None} for t in range(210)]
report = {'settings': {'start_s': 0, 'end_s': 7, 'fps': 30}, 'samples': raw}
fused = shuttle_evidence(signals, report)
assert fused[0]['shuttle_moving'] is False and fused[1]['shuttle_moving'] is True
rallies = separate(fused, 7)
assert len(rallies) == 1 and rallies[0]['end_reason'] == 'low_player_motion_and_missing_shuttle'
assert separate([{**s, 'shuttle_moving': False} for s in signals], 7) == []
assert separate([{**s, 'shuttle_missing_s': 0} for s in fused], 7)[0]['end_reason'] == 'clip_end_unfinished'
assert separate([{**s, 'motion_heights_per_s': 1} for s in fused], 7)[0]['end_reason'] == 'clip_end_unfinished'
for bad in ({**report, 'samples': raw[:40] + raw[60:]},
            {**report, 'samples': raw[:-20]},
            {**report, 'samples': [{**s, 'inpainted': True} for s in raw]}):
    try:
        shuttle_evidence(signals, bad)
        raise AssertionError('Unusable shuttle evidence accepted')
    except ValueError:
        pass
print('Shuttle preprocessing, decoding and combined-rule checks passed')
