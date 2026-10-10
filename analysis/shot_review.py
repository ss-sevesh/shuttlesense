"""Bounded shot candidates and observable near-player behaviour before provisional endings."""
import numpy as np
from contact_frames import contact_report, angle_report, join_angles
from near_evidence import describe_pose
from tracked_rallies import player_arrays, validate_observations


def shot_hits(poses, shuttle, scenes, windows):
    contacts = join_angles(contact_report(poses,shuttle,focus_side=None),angle_report(poses))
    from focused_rallies import court_segments
    segments = court_segments(scenes)
    for hit in contacts['hits']:
        selected = hit['contact']['frame']
        hit['contact']['frames'] = [f if 0 <= f < len(scenes) else None for f in range(selected-2,selected+3)] if selected is not None else []
        segment = next(((a,b) for a,b in segments if a <= hit['source_frame'] < b),None)
        if segment is None: continue
        window = next((w for w in windows if w['start_s'] <= hit['time_s'] < (w['end_s'] if w['end_s'] is not None else w['review_stop_s'])),None)
        hit.update(clip_start_s=max(segment[0]/poses['fps'],window['start_s'] if window else 0),
                   clip_end_s=min(segment[1]/poses['fps'],(window['end_s'] if window['end_s'] is not None else window['review_stop_s']) if window else segment[1]/poses['fps']),
                   play_status='end_uncertain_review' if window and window['end_s'] is None else 'estimated_play_window' if window else 'outside_play')
    contacts['hits'] = [h for h in contacts['hits'] if 'clip_start_s' in h]
    return contacts


def ending_reviews(poses, shuttle, scenes, windows, shots):
    validate_observations(poses,shuttle)
    if poses['video_sha256'] != shuttle['video_sha256'] or len(scenes) != len(shuttle['samples']):
        raise ValueError('Ending observations do not share the same video timeline')
    people = {s['source_frame']:s['players'] for s in poses['samples']}
    events = []
    fps = poses['fps']
    for index, window in enumerate(windows):
        end = window['end_s']
        event = dict(rallyId=index+1,endTime=end,windowStart=max(window['start_s'],(end or window['review_stop_s'])-2),
                     windowEnd=end if end is not None else window['review_stop_s'],status='unknown',
                     summary='Ending is unknown; no failed-return judgment.',evidence=None,lastShot=None)
        events.append(event)
        if end is None: continue
        event['summary'] = 'Insufficient continuous near-player/shuttle evidence before this possible ground stop.'
        last = [h for h in shots if h['side']=='near' and window['start_s'] <= h['time_s'] < end]
        if last:
            hit = max(last,key=lambda h:h['time_s'])
            event['lastShot'] = dict(time=hit['time_s'],type=hit.get('shot_type') if hit.get('shot_type') not in (None,'unknown') else None,status=hit['shot_status'])
        rows = []
        for observed in shuttle['samples']:
            t, frame = observed['time_s'],observed['source_frame']
            if not event['windowStart'] <= t < end: continue
            if not scenes[frame]['court'] or scenes[frame]['reset'] or observed.get('chunk_start'):
                rows = []; continue
            person = next((p for p in people.get(frame,[]) if p['side']=='near'),None)
            arrays = player_arrays(person) if person else None
            if arrays is None or observed['xy_px'] is None:
                rows = []; continue
            points,scores = arrays
            wrists = [j for j in (15,16) if scores[j] >= .5]
            if not wrists or min(scores[[11,12,23,24]]) < .5:
                rows = []; continue
            if rows and (person['track_id'] != rows[-1]['person']['track_id'] or t-rows[-1]['time'] > 1.5/fps): rows = []
            point = np.asarray(observed['xy_px'])
            wrist = min(wrists,key=lambda j:np.linalg.norm(points[j]-point))
            if np.any(point < 0) or np.any(point >= [poses['width'],poses['height']]) or np.any(points[wrist] < 0) or np.any(points[wrist] > [poses['width'],poses['height']]):
                rows = []; continue
            centre = points[[11,12,23,24]].mean(axis=0)
            height = person['box_xywh'][3]
            rows.append(dict(time=t,frame=frame,person=person,point=point,wrist=points[wrist],hand=wrist,centre=centre,height=height,
                             distance=float(np.linalg.norm(points[wrist]-point)),offset=float(point[0]-centre[0])))
        if len(rows) < max(6,round(.3*fps)) or end-rows[-1]['time'] > 2/fps: continue
        # shortcut: image distances describe visible separation; use validated 3D tracking for physical reach/metres.
        evidence = min(rows,key=lambda r:r['distance']/r['height'])
        reach, approach = False,0.
        for a,b in zip(rows,rows[1:]):
            target = a['point']-a['centre']; norm = np.linalg.norm(target)
            if norm > 0: approach += float((b['centre']-a['centre'])@(target/norm)/b['height'])
            if a['hand']==b['hand']:
                speed = np.linalg.norm(b['wrist']-a['wrist'])/(b['time']-a['time'])/b['height']
                reach |= bool(speed >= .8 and b['distance']/b['height'] < 1.5)
        offset = evidence['offset']/evidence['height']
        event['status'] = 'reach_or_swing_observed' if reach else 'moving_toward_shuttle' if approach >= .15 else 'opposite_side_no_clear_attempt' if abs(offset) >= 1 else 'no_clear_attempt'
        side = 'camera-right' if offset > 0 else 'camera-left'
        event['summary'] = {'reach_or_swing_observed':'Visible wrist movement near the shuttle suggests a reach or swing; contact is unconfirmed.',
                            'moving_toward_shuttle':'The near player moved toward the shuttle; a return attempt is unconfirmed.',
                            'opposite_side_no_clear_attempt':f'Shuttle was well to {side} of the player, with no clear reach in the observed frames. Letting it pass is possible; intent is unknown.',
                            'no_clear_attempt':'No clear reach or swing in the observed frames. This does not prove the player chose not to return.'}[event['status']]
        event['evidence'] = dict(frame=evidence['frame'],time=evidence['time'],distancePx=evidence['distance'],distanceHeights=evidence['distance']/evidence['height'],
                                 horizontalOffsetPx=evidence['offset'],wristPoint=(evidence['wrist']/[poses['width'],poses['height']]).tolist(),
                                 shuttlePoint=(evidence['point']/[poses['width'],poses['height']]).tolist(),
                                 pose=describe_pose(evidence['person'],'left' if evidence['hand']==15 else 'right'))
    return events
