"""Projected overlap is insufficient; gaps and continued flight must abstain."""
import copy
from ground_landing import candidates

def rows(points):
    return [{'frame': i, 'time': i/30, 'point': p, 'floor': True, 'floorScore': .9} for i, p in enumerate(points)]

moving = [[20+10*i, 50] for i in range(8)]
landed = rows(moving + [[90, 50]]*12)
assert len(candidates(landed, 30, 720, 720)) == 1
assert not candidates(rows(moving), 30, 720, 720)
assert not candidates(rows([[90, 50]]*30), 30, 720, 720)
for key, value in [('point', None), ('floor', False), ('reset', True)]:
    changed = copy.deepcopy(landed)
    changed[8][key] = value
    if key == 'floor':
        for row in changed[8:]: row['floor'] = False
    assert not candidates(changed, 30, 720, 720), key
assert not candidates(landed[:9], 30, 720, 720)
for key, value in [('point', [900, 0]), ('point', [float('nan'), 0]), ('frame', 999), ('time', .5)]:
    changed = copy.deepcopy(landed)
    changed[0][key] = value
    try: candidates(changed, 30, 720, 720)
    except ValueError: pass
    else: raise AssertionError(key)
print('Ground candidate motion, overlap-only, gaps, resets, bounds and tail checks passed.')
