"""Selectable local tracking and provisional rally windows, without coaching."""
import json
import math

import cv2
import numpy as np

DEFAULT_OPTIONS = dict(yolo=True, shuttle=True, ground=True, pose=True, shots=False, llm=False, ending=False)


def validate_options(value):
    if isinstance(value,dict): value = {'ending':False,**value}
    if not isinstance(value, dict) or set(value) != set(DEFAULT_OPTIONS) or any(type(v) is not bool for v in value.values()):
        raise ValueError('Expected boolean analysis switches')
    for key, needs in {'ground': ['shuttle'], 'pose': ['yolo'], 'shots': ['pose', 'shuttle'], 'llm': ['shots'], 'ending':['ground','pose','shuttle']}.items():
        if value[key] and not all(value[n] for n in needs): raise ValueError(f'{key} dependencies are disabled')
    if not value['yolo'] and not value['shuttle']: raise ValueError('Enable player or shuttle tracking')
    return value


def scene_scan(video, corners):
    """Reuse fixed floor-line patch checks to exclude broadcast closeups and cuts."""
    from video_edits import court_view
    capture = cv2.VideoCapture(str(video))
    points = np.asarray(corners)
    landmarks = np.round(np.vstack((points, (points[0]+points[3])/2, (points[1]+points[2])/2))).astype(int)
    rows, previous = [], None
    try:
        ok, first = capture.read()
        if not ok: raise ValueError('Cannot decode scene reference')
        reference = cv2.cvtColor(first, cv2.COLOR_BGR2GRAY)
        # Poor line patches must not silently classify every frame as the court.
        if not court_view(reference, reference, landmarks, correlation=.7): raise ValueError('Mark court corners on visible floor lines')
        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
        while True:
            ok, frame = capture.read()
            if not ok: break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            view = court_view(gray, reference, landmarks, correlation=.7)
            small = cv2.resize(gray, (160, 90))
            change = float(np.mean(cv2.absdiff(small, previous) > 35)) if previous is not None else 0.
            reset = bool(rows and (view != rows[-1]['court'] or change > .35))
            rows.append({'frame': len(rows), 'court': bool(view), 'reset': reset})
            previous = small
    finally: capture.release()
    return rows


def court_segments(scenes):
    segments, start = [], None
    for i, scene in enumerate(scenes):
        if start is not None and (not scene['court'] or scene['reset']):
            if i-start >= 8: segments.append((start, i))
            start = None
        if scene['court'] and start is None: start = i
    if start is not None and len(scenes)-start >= 8: segments.append((start, len(scenes)))
    return segments


def rally_windows(raw, scenes, fps, ground):
    """Group sustained observed motion; quiet/gaps bound review, not ground contact."""
    if len(raw) != len(scenes) or not math.isfinite(fps) or fps <= 0: raise ValueError('Scene/shuttle timeline mismatch')
    windows, moving, previous = [], [], None
    def finish(stop):
        if len(moving) >= max(3, round(.3*fps)) and moving[-1]-moving[0] >= .5:
            landings = [e['time'] for e in (ground or {}).get('candidates', []) if moving[0] < e['time'] <= stop]
            end = min(landings) if landings else None
            windows.append({'start_s': moving[0], 'end_s': end, 'review_stop_s': stop,
                            'start_status': 'sustained_shuttle_motion_candidate',
                            'end_status': 'possible_ground_touch' if end is not None else 'unconfirmed_motion_window', 'hit_candidates': 0})
        moving.clear()
    for i, (sample, scene) in enumerate(zip(raw, scenes)):
        t, point = sample['time_s'], sample['xy_px']
        if sample['source_frame'] != i or abs(t-i/fps) > 1e-5: raise ValueError('Nonconsecutive shuttle timeline')
        if scene['reset'] or not scene['court']:
            if moving: finish(t)
            previous = None
            continue
        if moving and t-moving[-1] > 1.2:
            finish(min(t, moving[-1]+.5))
        if point is not None and previous is not None and t-previous[0] <= 1.5/fps:
            if np.linalg.norm(np.asarray(point)-previous[1])/(t-previous[0]) >= 100:
                moving.append(t)
        previous = (t, np.asarray(point)) if point is not None else None
    if moving: finish(len(raw)/fps)
    return windows


def run_focused(directory, request, metadata, original_hash, options, run, stage):
    from review_job import ROOT, inspect, write_json, review_data, far_roi
    from detect import digest
    source = directory/'source.mp4'
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(directory/request['source']), '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-an', '-movflags', '+faststart', str(source)], 'Normalizing video', 4, 10)
    info = inspect(source, request['corners'])
    source_hash = digest(source)
    capture = cv2.VideoCapture(str(source)); count = round(capture.get(cv2.CAP_PROP_FRAME_COUNT)); capture.release()
    stage('Checking court views and broadcast cuts', 10)
    scenes = scene_scan(source, info['corners'])
    if len(scenes) != count: raise ValueError('Scene scan ended early')
    segments = court_segments(scenes)
    write_json(directory/'scenes.json', {'samples': scenes, 'courtSegments': segments})
    poses = {'kind': 'tracked_player_pose', 'video_sha256': source_hash, 'width': info['width'], 'height': info['height'], 'fps': 30,
             'settings': {'sample_hz': 30, 'corners_px': info['corners']}, 'samples': [{'time_s': i/30, 'source_frame': i, 'players': []} for i in range(count)]}
    if options['yolo']:
        command = [str(ROOT/'data/player-pose-env/Scripts/python.exe'), 'analysis/player_pose.py', str(source), '--end', str(info['duration']), '--sample-hz', '30', '--imgsz', '640', '--tracker', 'analysis/bytetrack-phone.yaml', '--allow-reacquisition', '--corners', *map(str, np.asarray(info['corners']).flatten()), '--output', str(directory/'players.json')]
        if not options['pose']: command.append('--skip-pose')
        elif not options['shots']: command.append('--near-pose')
        if options['shots']: command.extend(['--far-roi',*map(str,far_roi(info['corners'],info['width'],info['height']))])
        run(command, 'YOLO player tracking' + (' and body pose' if options['pose'] else ' (body pose disabled)'), 12, 45)
        poses = json.loads((directory/'players.json').read_text())
        for row, scene in zip(poses['samples'], scenes):
            if not scene['court']: row['players'] = []
    write_json(directory/'players.json', poses)
    shuttle = {'kind': 'raw_tracknet_shuttle_proposals', 'video_sha256': source_hash,
               'settings': {'start_s': 0, 'end_s': count/30, 'fps': 30, 'width': info['width'], 'height': info['height']},
               'samples': [{'time_s': i/30, 'source_frame': i, 'xy_px': None, 'inpainted': False, 'chunk_start': scenes[i]['reset']} for i in range(count)]}
    if options['shuttle']:
        for n, (start, stop) in enumerate(segments):
            clip, report = directory/f'court-{n}.mp4', directory/f'court-{n}-shuttle.json'
            progress = 45+35*n/max(1,len(segments))
            run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(source), '-vf', f'trim=start_frame={start}:end_frame={stop},setpts=PTS-STARTPTS', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-an', str(clip)], 'Preparing court-view segment', progress, progress)
            run([str(ROOT/'data/tracknet-env/Scripts/python.exe'), 'analysis/shuttle_stream.py', str(clip), '--assume-unedited', '--output', str(report)], f'Tracking shuttle in court segment {n+1}/{len(segments)}', 45+35*n/max(1,len(segments)), 45+35*(n+1)/max(1,len(segments)))
            raw = json.loads(report.read_text())['samples']
            if len(raw) != stop-start: raise ValueError('Segment inference frame count mismatch')
            for j, sample in enumerate(raw):
                shuttle['samples'][start+j].update(xy_px=sample['xy_px'], chunk_start=j==0)
        shuttle['settings']['input_contract'] = 'independent_fixed_court_segments_with_view_abstention'
    write_json(directory/'shuttle.json', shuttle)
    ground = None
    if options['ground']:
        run([str(ROOT/'data/hf-racquet-env/Scripts/python.exe'), 'analysis/ground_landing.py', '--video', str(source), '--shuttle', str(directory/'shuttle.json'), '--output', str(directory/'ground')], 'Segmenting ground and checking shuttle stops', 80, 96)
        ground = json.loads((directory/'ground/results.json').read_text())
    from near_evidence import court_lines, hit_poses
    stage('Fitting near-side court lines and joining hit poses', 97)
    lines = court_lines(source, info['corners'], segments, 30)
    events = hit_poses(poses, shuttle, scenes) if options['pose'] and options['shuttle'] else []
    windows = rally_windows(shuttle['samples'], scenes, 30, ground)
    for window in windows:
        stop = window['end_s'] if window['end_s'] is not None else window['review_stop_s']
        window['hit_candidates'] = sum(window['start_s'] <= event['time'] <= stop for event in events)
    classified = []
    if options['shots']:
        from shot_review import shot_hits
        write_json(directory/'hits.json',shot_hits(poses,shuttle,scenes,windows))
        run([str(ROOT/'data/hf-racquet-env/Scripts/python.exe'),'analysis/bst_shots.py','--poses',str(directory/'players.json'),'--shuttle',str(directory/'shuttle.json'),'--hits',str(directory/'hits.json'),'--output',str(directory/'shots.json')], 'Classifying bounded shot windows with pretrained BST',97,98)
        classified = json.loads((directory/'shots.json').read_text(encoding='utf-8'))['shots']
    fused = {'video_sha256': source_hash, 'pipeline_version': 'bounded-bst-ending-v1' if options['shots'] or options['ending'] else 'near-lines-hit-pose-v2', 'focus_side': 'near', 'fps': 30, 'hits': [h for h in classified if h['side']=='near'], 'rallies': windows, 'options': options, 'courtLines': lines, 'hitPoses': events}
    if options['ending']:
        from shot_review import ending_reviews
        fused['endingReview'] = ending_reviews(poses,shuttle,scenes,windows,classified)
    write_json(directory/'fused.json', fused)
    result = review_data(poses, shuttle, fused, request['fileName'], False, original_hash, metadata['corners'], ground)
    result['options'] = options
    if not options['shuttle']: result['metrics']['shuttleFrames'] = 0
    if not options['yolo']: result['metrics']['sampleCount'] = 0
    result['limitations'] = ['Rally windows group observed shuttle motion; starts and endings require review.', 'Court-view patches exclude closeups. Camera movement, gradual transitions and identity switches remain unvalidated.', 'YOLO tracks players; TrackNet tracks the shuttle. Floor overlap is not proof of ground touch.', 'No LLM or contact-frame extraction ran.']
    result['limitations'].append('Court lines are fitted observations, not exact boundaries. Hit times use wrist/shuttle proximity; pose labels describe 2D arm position, not shot type or confirmed racket impact.')
    if options['shots']: result['limitations'].append('BST uses adapted MediaPipe poses and uncalibrated scores. Windows exclude detected adjacent hits; missed contacts can leave mixed movements.')
    if options['ending']: result['limitations'].append('Ending review describes the closest observed image-plane separation in the last two seconds before a possible ground stop, not intent or physical reach. Stops can follow rolling or pickup.')
    result['sceneSummary'] = {'courtSegments': [[a/30,b/30] for a,b in segments], 'excludedFrames': sum(not r['court'] for r in scenes)}
    write_json(directory/'result.json', result)
    write_json(directory/'provenance.json', {'originalSha256': original_hash, 'normalizedSha256': source_hash, 'pipelineVersion': fused['pipeline_version'], 'options': options})
    write_json(directory/'status.json', {'id': directory.name, 'status': 'complete', 'stage': 'Rally and ground candidates ready for review', 'progress': 100})
