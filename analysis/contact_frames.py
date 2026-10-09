"""Independent frame-distance contact selection and exact-frame angle join."""
import math

import numpy as np

from tracked_rallies import hit_candidates, player_arrays, pose_measurements

VERSION = 'wrist-distance-v1'


def angle(a, b):
    den = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.degrees(np.arccos(np.clip(np.dot(a, b) / den, -1, 1)))) if den > 1e-6 else None


def angle_report(poses):
    rows = pose_measurements(poses['samples'])
    for sample, row in zip(poses['samples'], rows):
        row['source_frame'] = sample['source_frame']
        row['players'] = [p for p in row['players'] if p['side'] == 'near']
        for measured in row['players']:
            person = next(p for p in sample['players'] if p['track_id'] == measured['track_id'] and p['side'] == measured['side'])
            points, scores = player_arrays(person)
            torso = points[[11, 12]].mean(axis=0) - points[[23, 24]].mean(axis=0)
            measured['body_lean_deg'] = angle(torso, np.array([0., -1.])) if min(scores[[11, 12, 23, 24]]) >= .5 else None
            for name, shoulder, elbow in [('left', 11, 13), ('right', 12, 14)]:
                measured[name + '_arm_elevation_deg'] = angle(points[elbow] - points[shoulder], -torso) if min(scores[[11, 12, 23, 24, shoulder, elbow]]) >= .5 else None
    return {'video_sha256': poses['video_sha256'], 'version': VERSION, 'samples': rows}


def contact_report(poses, shuttle):
    from tracked_rallies import validate_observations
    validate_observations(poses, shuttle)
    if poses['video_sha256'] != shuttle['video_sha256']:
        raise ValueError('Contact observations belong to different videos')
    fps = poses['fps']
    if poses['settings']['sample_hz'] != fps:
        raise ValueError('Contact refinement requires a pose sample for every video frame')
    samples = {s['source_frame']: s for s in poses['samples']}
    raw = {s['source_frame']: s for s in shuttle['samples']}
    near_samples = [{**s, 'players': [p for p in s['players'] if p['side'] == 'near']} for s in poses['samples']]
    seeds = [h for h in hit_candidates(near_samples, shuttle['samples'], fps) if h['side'] == 'near']
    hits = []
    for seed in seeds:
        first, last = seed['source_frame'] - round(.2 * fps), seed['source_frame'] + round(.2 * fps)
        distances = []
        switched = False
        for frame in range(first, last + 1):
            sample, observed = samples.get(frame), raw.get(frame)
            if sample is None:
                continue
            person = next((p for p in sample['players'] if p['side'] == seed['side']), None)
            if person is None:
                continue
            if person['track_id'] != seed['track_id']:
                switched = True
                continue
            if observed is None or observed['xy_px'] is None or observed.get('chunk_start'):
                continue
            arrays = player_arrays(person)
            if arrays is None or arrays[1][seed['wrist']] < .5:
                continue
            distance = float(np.linalg.norm(arrays[0][seed['wrist']] - np.asarray(observed['xy_px'])))
            distances.append((frame, distance, distance / person['box_xywh'][3]))
        selected = min(distances, key=lambda d: d[1]) if distances else None
        reason = 'missing_observations'
        if switched:
            reason = 'identity_switch'
        elif selected is not None:
            frame, pixels, relative = selected
            adjacent = {d[0]: d[1] for d in distances}
            if frame in (first, last) or frame - 1 not in adjacent or frame + 1 not in adjacent:
                reason = 'unbracketed_minimum'
            elif sum(math.isclose(d[1], pixels, abs_tol=1e-6) for d in distances) > 1:
                reason = 'ambiguous_minimum'
            elif relative > .6:
                reason = 'shuttle_too_far'
            else:
                reason = 'estimated'
        # shortcut: wrist distance is a contact proxy; replace after racket tracking is validated.
        contact = {'method': 'wrist_distance', 'status': reason, 'frame': selected[0] if reason == 'estimated' else None,
                   'wrist': 'left' if seed['wrist'] == 15 else 'right',
                   'distancePx': selected[1] if selected else None, 'distanceHeights': selected[2] if selected else None,
                   'windowFrames': [first, last], 'seedFrame': seed['source_frame']}
        hit = {**seed, 'contact': contact}
        if contact['frame'] is not None:
            hit.update(source_frame=contact['frame'], time_s=contact['frame'] / fps)
        hits.append(hit)
    kept = []
    for hit in sorted(hits, key=lambda h: (h['contact']['status'] == 'estimated', h['score']), reverse=True):
        if all(abs(hit['time_s'] - other['time_s']) >= .25 for other in kept):
            kept.append(hit)
    return {'video_sha256': poses['video_sha256'], 'version': VERSION, 'focus_side': 'near', 'hits': sorted(kept, key=lambda h: h['time_s'])}


def join_angles(contacts, angles):
    if contacts['video_sha256'] != angles['video_sha256'] or contacts['version'] != angles['version']:
        raise ValueError('Contact and angle reports do not match')
    rows = {row['source_frame']: row for row in angles['samples']}
    for hit in contacts['hits']:
        contact = hit['contact']
        person = next((p for p in rows.get(contact['frame'], {}).get('players', []) if p['track_id'] == hit['track_id'] and p['side'] == hit['side']), {})
        wrist = contact['wrist']
        contact['measurements'] = {'elbow': person.get(wrist + '_elbow_deg'), 'armExtension': person.get(wrist + '_elbow_deg'),
                                   'bodyLean': person.get('body_lean_deg'), 'armElevation': person.get(wrist + '_arm_elevation_deg'), 'racketFace': None}
    return contacts
