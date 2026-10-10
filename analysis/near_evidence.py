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


def white_markings(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0,0,170]), np.array([179,55,255]))
    contrast = cv2.morphologyEx(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), cv2.MORPH_TOPHAT, np.ones((15,15), 'uint8'))
    white[contrast < 12] = 0  # Pale floor must not pull the marking centre sideways.
    return white


def refine_line(mask, endpoints):
    endpoints = np.asarray(endpoints, dtype=float)
    direction = endpoints[1]-endpoints[0]
    length = np.linalg.norm(direction)
    if length < 1: return None
    direction /= length
    normal = np.array([-direction[1], direction[0]])
    offsets = np.arange(-9,9.1,.5)
    centres = []
    for fraction in np.linspace(.04,.96,120):
        origin = endpoints[0]+fraction*length*direction
        probes = np.rint(origin+offsets[:,None]*normal).astype(int)
        valid = (probes[:,0] >= 0) & (probes[:,0] < mask.shape[1]) & (probes[:,1] >= 0) & (probes[:,1] < mask.shape[0])
        found = offsets[valid][mask[probes[valid,1],probes[valid,0]] > 0]
        if 1 <= len(found) <= 16: centres.append(origin+np.median(found)*normal)
    if len(centres) < 40: return None
    vx,vy,x,y = cv2.fitLine(np.float32(centres), cv2.DIST_HUBER, 0, .01, .01).flatten()
    axis, origin = np.array([vx,vy]), np.array([x,y])
    return (origin+((endpoints-origin)@axis)[:,None]*axis).tolist()


def trim_intersections(lines, width, height):
    lookup = {line['name']:line for line in lines}
    def intersect(a,b):
        p,q = np.asarray(a['points']), np.asarray(b['points'])
        matrix = np.column_stack((p[1]-p[0], q[0]-q[1]))
        if abs(np.linalg.det(matrix)) < 1e-6: return None
        point = p[0]+np.linalg.solve(matrix,q[0]-p[0])[0]*(p[1]-p[0])
        return point.tolist() if np.all(point >= 0) and np.all(point <= [width,height]) else None
    for line in lines:
        boundaries = ('Doubles left','Doubles right') if line['name'] in ('Short service','Doubles long service','Back boundary') else (('Short service' if line['name']=='Centre service' else None),'Back boundary')
        for index, boundary in enumerate(boundaries):
            if boundary in lookup:
                point = intersect(line,lookup[boundary])
                if point is not None: line['points'][index] = point


def court_lines(video, corners, segments, fps):
    capture = cv2.VideoCapture(str(video))
    width, height = [capture.get(p) for p in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT)]
    matrix = cv2.getPerspectiveTransform(np.float32(corners), np.float32([[100,0],[600,0],[600,1000],[100,1000]]))
    inverse = np.linalg.inv(matrix)
    reports = []
    try:
        for first, stop in segments:
            masks, originals = [], []
            for index in np.linspace(first, stop-1, min(11, stop-first)).astype(int):
                capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
                ok, frame = capture.read()
                if not ok: raise ValueError('Cannot decode court-line reference')
                white = white_markings(frame)
                originals.append(white)
                masks.append(cv2.warpPerspective(white, matrix, (700, 1050), flags=cv2.INTER_NEAREST))
            persistent = (np.mean(np.asarray(masks)>0, axis=0) >= .45).astype('uint8')*255
            lines = fit_markings(persistent)
            original = (np.mean(np.asarray(originals)>0, axis=0) >= .45).astype('uint8')*255
            refined = []
            for line in lines:
                projected = cv2.perspectiveTransform(np.float32([line['points']]), inverse)[0]
                points = refine_line(original, projected)
                if points is not None:
                    line['points'] = points
                    refined.append(line)
            trim_intersections(refined, width, height)
            for line in refined: line['points'] = (np.asarray(line['points'])/[width,height]).tolist()
            reports.append({'start': first/fps, 'end': stop/fps, 'lines': refined})
    finally: capture.release()
    # shortcut: a fixed camera and approximate singles corners guide fits; recalibrate moving cameras.
    return {'method': 'original_pixel_contrast_line_fit_v2', 'segments': reports,
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
