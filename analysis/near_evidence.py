"""Near-court white-line fits and non-LLM pose descriptions at contact candidates."""
import cv2
import numpy as np


def fit_markings(mask):
    """Fit observed white pixels in narrow corridors of a calibrated singles layout."""
    specs = [('Singles left', 'v', 100, 500, 1000), ('Singles right', 'v', 600, 500, 1000),
             ('Doubles left', 'v', 100-500*.46/5.18, 500, 1000),
             ('Doubles right', 'v', 600+500*.46/5.18, 500, 1000),
             ('Centre service', 'v', 350, 1000*(.5+1.98/13.4), 1000),
             ('Short service', 'h', 1000*(.5+1.98/13.4), 56, 644),
             ('Doubles long service', 'h', 1000*(1-.76/13.4), 56, 644),
             ('Back boundary', 'h', 1000, 56, 644)]
    lines = []
    for name, axis, expected, start, stop in specs:
        plane = mask if axis == 'v' else mask.T
        points = []
        for t in range(round(start)+5, round(stop)-5, 3):
            low, high = round(expected)-18, round(expected)+19
            found = np.flatnonzero(plane[t, low:high]) + low
            if len(found): points.append((t, float(np.median(found))))
        if len(points) < (stop-start)/3*.45: continue
        values = np.asarray(points)
        slope, offset = np.polyfit(values[:, 0], values[:, 1], 1)
        good = np.abs(values[:, 1]-(slope*values[:, 0]+offset)) < 5
        if good.mean() < .65 or good.sum() < 20: continue
        slope, offset = np.polyfit(values[good, 0], values[good, 1], 1)
        if abs(slope) > .08: continue
        endpoints = [[slope*t+offset, t] if axis == 'v' else [t, slope*t+offset] for t in (start, stop)]
        lines.append({'name': name, 'points': endpoints, 'support': round(float(good.mean()), 3)})
    return lines


def court_lines(video, corners, segments, fps):
    capture = cv2.VideoCapture(str(video))
    width, height = [capture.get(p) for p in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT)]
    matrix = cv2.getPerspectiveTransform(np.float32(corners), np.float32([[100,0],[600,0],[600,1000],[100,1000]]))
    inverse = np.linalg.inv(matrix)
    reports = []
    try:
        for first, stop in segments:
            masks = []
            for index in np.linspace(first, stop-1, min(11, stop-first)).astype(int):
                capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
                ok, frame = capture.read()
                if not ok: raise ValueError('Cannot decode court-line reference')
                hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
                white = cv2.inRange(hsv, np.array([0,0,145]), np.array([179,100,255]))
                masks.append(cv2.warpPerspective(white, matrix, (700, 1050), flags=cv2.INTER_NEAREST))
            persistent = (np.mean(np.asarray(masks)>0, axis=0) >= .45).astype('uint8')*255
            lines = fit_markings(persistent)
            for line in lines:
                projected = cv2.perspectiveTransform(np.float32([line['points']]), inverse)[0]
                line['points'] = (projected/[width,height]).tolist()
            reports.append({'start': first/fps, 'end': stop/fps, 'lines': lines})
    finally: capture.release()
    # shortcut: a fixed camera and approximate singles corners guide fits; recalibrate moving cameras.
    return {'method': 'calibrated_persistent_white_pixel_fit', 'segments': reports,
            'reason': 'Observed near-side markings fitted using singles-court geometry. Verify alignment; not an in/out decision.'}


def describe_pose(person, wrist):
    points = np.asarray(person['keypoints_xy'])
    scores = np.asarray(person['keypoint_scores'])
    shoulder, hip = (11, 23) if wrist == 'left' else (12, 24)
    hand = 15 if wrist == 'left' else 16
    if points.shape != (33,2) or min(scores[[shoulder,hip,hand]]) < .5: return 'Pose uncertain'
    y = points[hand,1]
    level = 'Raised arm / overhead posture' if y < points[shoulder,1] else 'Arm at torso level' if y < points[hip,1] else 'Low arm / underhand posture'
    return level + f' ({wrist} wrist proxy)'


def hit_poses(poses, shuttle, scenes):
    from contact_frames import contact_report, angle_report, join_angles
    contacts = join_angles(contact_report(poses, shuttle), angle_report(poses))
    samples = {s['source_frame']: s for s in poses['samples']}
    events = []
    for hit in contacts['hits']:
        contact = hit['contact']
        frame = contact['frame'] if contact['frame'] is not None else contact['seedFrame']
        if not scenes[frame]['court']: continue
        person = next((p for p in samples[frame]['players'] if p['side'] == 'near' and p['track_id'] == hit['track_id']), None)
        if person is None: continue
        events.append({'frame': frame, 'time': frame/poses['fps'], 'trackId': hit['track_id'],
                       'status': 'estimated_contact' if contact['frame'] is not None else 'swing_candidate',
                       'pose': describe_pose(person, contact['wrist']), 'measurements': contact['measurements'],
                       'reason': contact['status']})
    return events
