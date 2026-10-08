"""Run: python analysis/test_rallies.py"""
from rallies import motion, separate


def sample(t, speed, reset=False):
    return {'time_s': t, 'motion_heights_per_s': speed, 'reset': reset}


active = [sample(t, 1.) for t in range(4)]
quiet = [sample(t, 0.) for t in range(4, 7)]
assert separate(active + quiet, 8)[0] == {
    'start_s': 0, 'end_s': 3, 'end_reason': 'low_player_motion',
    'outcome': 'unknown', 'review_status': 'provisional'}
assert separate(active + [sample(t, None) for t in range(4, 8)], 8)[0]['end_s'] == 8
assert separate(active + [sample(4, None, True), sample(5, 1), sample(6, 1)], 8)[0]['end_reason'] == 'camera_cut_or_sample_gap'
assert len(separate(active + [sample(4, 0), sample(5, 1)], 8)) == 1
assert separate([sample(0, 1), sample(1, 0), sample(2, 0), sample(3, 0)], 4) == []
assert separate([sample(t, 0) for t in range(5)], 5) == []
for bad in ([sample(1, 1), sample(1, 1)], [sample(0, float('nan'))], [sample(8, 1)]):
    try:
        separate(bad, 8)
        raise AssertionError('Invalid signal accepted')
    except ValueError:
        pass
corners = [[0, 0], [100, 0], [100, 100], [0, 100]]
people = [{'box_xywh': [40, y, 10, 20], 'score': .9} for y in (10, 60)]
signals = motion([{'time_s': t, 'person_detections': people} for t in (0, 1, 2, 5)], corners, [2], 1.5)
assert signals[1]['motion_heights_per_s'] == 0
assert signals[2]['reset'] and signals[2]['motion_heights_per_s'] is None
assert signals[3]['reset']
assert motion([{'time_s': 0, 'person_detections': []}], corners, [], 1)[0]['motion_heights_per_s'] is None
print('Rally motion checks passed')
