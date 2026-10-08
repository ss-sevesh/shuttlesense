"""Fixed-camera edit/view heuristic for the local rally prototype."""
import math

import cv2
import numpy as np


def court_view(gray, reference, landmarks, correlation=.8):
    matches = 0
    for x, y in landmarks:
        if not 12 <= x < reference.shape[1] - 12 or not 12 <= y < reference.shape[0] - 12:
            raise ValueError('Floor landmarks must be 12 pixels inside the frame')
        patch = gray[y-12:y+13, x-12:x+13]
        template = reference[y-12:y+13, x-12:x+13]
        if template.shape != (25, 25) or patch.shape != template.shape:
            raise ValueError('Floor landmarks must be 12 pixels inside the frame')
        if np.std(template) < 1:
            raise ValueError('Reference landmarks need visible line texture')
        score = cv2.matchTemplate(patch, template, cv2.TM_CCOEFF_NORMED)[0, 0]
        matches += int(score >= correlation)
    return matches >= 4


def frame_change(gray, previous, mask):
    return float(np.mean(cv2.absdiff(gray, previous)[mask > 0] > 25))


def inspect_video(video, samples, corners, reference_s, landmarks, cut_change=.055):
    if (not math.isfinite(reference_s) or reference_s < 0 or
            not math.isfinite(cut_change) or not 0 < cut_change < 1):
        raise ValueError('Invalid reference time or cut threshold')
    points = np.asarray(landmarks)
    if points.shape != (6, 2) or not np.isfinite(points).all() or np.any(points != np.round(points)):
        raise ValueError('Expected six integer floor-line landmarks')
    points = points.astype(int)
    capture = cv2.VideoCapture(str(video))
    try:
        if not capture.isOpened():
            raise ValueError('Cannot decode video for edit detection')
        capture.set(cv2.CAP_PROP_POS_MSEC, reference_s * 1000)
        ok, reference = capture.read()
        if not ok:
            raise ValueError('Cannot decode court-view reference')
        reference = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
        if not court_view(reference, reference, points):
            raise ValueError('Invalid court-view reference')
        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
        h, w = reference.shape
        mask = np.zeros((180, 320), np.uint8)
        polygon = np.round(np.asarray(corners) * [320 / w, 180 / h]).astype(np.int32)
        cv2.fillConvexPoly(mask, polygon, 1)
        if not np.any(mask):
            raise ValueError('Court polygon is outside the video')
        previous, previous_view, previous_time = None, None, -1.
        edits, matched, index = [], [], 0
        while index < len(samples):
            ok, frame = capture.read()
            if not ok:
                raise ValueError('Video ended before detection samples')
            time = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if not math.isfinite(time) or time <= previous_time:
                raise ValueError('Nonmonotonic edit-pass timestamps')
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if gray.shape != reference.shape:
                raise ValueError('Frame dimensions changed')
            view = court_view(gray, reference, points)
            small = cv2.resize(gray, (320, 180))
            change = 0. if previous is None else frame_change(small, previous, mask)
            # ponytail: fixed landmarks and pixel-change threshold; moving cameras/dissolves need another detector.
            if previous is not None and (view != previous_view or
                                         (view and previous_view and change >= cut_change)):
                edits.append({'time_s': time, 'changed_fraction': change,
                              'reason': 'same_view_edit' if view == previous_view else 'court_view_change'})
            if time + 1e-6 >= samples[index]['time_s']:
                if abs(time - samples[index]['time_s']) > .001:
                    raise ValueError('Detection and edit-pass timestamps do not align')
                matched.append({**samples[index], 'court_view': bool(view)})
                index += 1
            previous, previous_view, previous_time = small, view, time
    finally:
        capture.release()
    return matched, edits
