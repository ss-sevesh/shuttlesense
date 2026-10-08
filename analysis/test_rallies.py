"""Run: python analysis/test_rallies.py"""
import numpy as np
import cv2
from pathlib import Path
from tempfile import TemporaryDirectory

from rallies import motion, separate
from video_edits import court_view, frame_change, inspect_video


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
gated = motion([{'time_s': t, 'person_detections': people, 'court_view': t < 2}
                for t in (0, 1, 2, 3)], corners, [1.5], 1.5)
assert gated[2]['reset_at_s'] == 1.5 and not gated[2]['both_players_visible']
assert all(s['motion_heights_per_s'] is None for s in gated[2:])
assert separate([sample(0, 1), sample(1, 1), sample(2, 1),
                 {**sample(3, None, True), 'reset_at_s': 2.5}], 5)[0]['end_s'] == 2.5
reference = np.random.default_rng(0).integers(0, 256, (200, 200), dtype=np.uint8)
landmarks = [(30, 30), (100, 30), (170, 30), (30, 170), (100, 170), (170, 170)]
assert court_view(reference, reference, landmarks)
assert not court_view(np.zeros_like(reference), reference, landmarks)
occluded = reference.copy()
occluded[:50, :50] = 0
assert court_view(occluded, reference, landmarks)  # One player covering a line is not a camera change.
before = np.zeros((100, 100), np.uint8)
after = before.copy()
after[:6] = 100
assert frame_change(after, before, np.ones_like(before)) >= .055
after[:6] = 20
assert frame_change(after, before, np.ones_like(before)) == 0
with TemporaryDirectory() as directory:
    video = Path(directory) / 'edits.avi'
    writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*'MJPG'), 5, (200, 200))
    assert writer.isOpened()
    edited = reference.copy()
    edited[60:140, 60:140] = 255 - edited[60:140, 60:140]
    for frame in (reference, reference, edited, edited, np.zeros_like(reference),
                  np.zeros_like(reference), reference, reference):
        writer.write(cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR))
    writer.release()
    detections = [{'time_s': i / 5, 'person_detections': []} for i in range(8)]
    gated, edits = inspect_video(video, detections, [[0, 0], [199, 0], [199, 199], [0, 199]],
                                0, landmarks)
    assert [e['reason'] for e in edits] == ['same_view_edit', 'court_view_change', 'court_view_change']
    assert np.allclose([e['time_s'] for e in edits], [.4, .8, 1.2])
    assert [s['court_view'] for s in gated] == [True, True, True, True, False, False, True, True]
print('Rally motion checks passed')
