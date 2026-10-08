"""Offline serve-first boundary hypotheses for human review, not service faults."""
import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

from detect import digest
from foot_pose import prepare_pose, decode_pose
from rallies import motion, shuttle_evidence


def diagonal(players):
    if len(players) != 2 or any(p is None for p in players):
        return False
    far, near = np.asarray(players)
    return bool(.05 <= far[0] <= .95 and .05 <= near[0] <= .95 and
                .1 <= far[1] < .49 and .51 < near[1] <= .9 and
                (far[0]-.5)*(near[0]-.5) < 0)


def posture(points, scores, height):
    # ponytail: body landmarks provide a readiness proxy, not foot contact or a legal-serve classifier.
    needed = [5, 6, 9, 10, 11, 12, 15, 16]
    if np.any(scores[needed] < .3):
        return {'body_visible': False, 'serve_ready': False}
    shoulder, hip = points[[5,6]].mean(axis=0), points[[11,12]].mean(axis=0)
    wrists, ankles = points[[9,10]], points[[15,16]]
    body = shoulder[1] < hip[1] < ankles[:,1].mean()
    ready = body and np.all(wrists[:,1] > shoulder[1]-.1*height) and np.min(np.linalg.norm(wrists-hip,axis=1)) < .6*height
    return {'body_visible': bool(body), 'serve_ready': bool(ready)}


def launch(raw, start, stop, server, receiver):
    """Consecutive observed motion from the server box toward the receiver."""
    x,y,w,h = server
    direction = np.asarray(receiver[:2])+np.asarray(receiver[2:])/2 - [x+w/2,y+h/2]
    previous, origin, moving_start = None, None, None
    for sample in raw:
        t, point = sample['time_s'], sample['xy_px']
        if t < start-1e-6: continue
        if t > stop+1e-6: break
        if point is None or sample.get('chunk_start'):
            previous = origin = moving_start = None
            continue
        point = np.asarray(point)
        if origin is None and x-.2*w <= point[0] <= x+1.2*w and y-.2*h <= point[1] <= y+1.2*h:
            origin = (t, point)
        if origin is not None and previous is not None:
            delta = point-previous[1]
            if np.linalg.norm(delta)/(t-previous[0]) >= 50 and np.dot(delta,direction) > 0:
                if moving_start is None: moving_start = previous[0]
            else:
                moving_start = None
            if (moving_start is not None and t-moving_start >= .06 and np.linalg.norm(point-origin[1]) >= .2*h and
                    np.dot(point-origin[1],direction) > 0 and
                    np.linalg.norm(delta)/(t-previous[0]) >= 50):
                return moving_start
        previous = (t,point)
    return None


def boundaries(signals, raw, fps, quiet_s=2., stationary_px=12., setup_hold=.4, allow_occluded_server=False, server_side=None, require_diagonal=True):
    if server_side not in (None,'near','far'): raise ValueError('Invalid required server side')
    if not all(math.isfinite(v) and v > 0 for v in (fps, quiet_s, stationary_px, setup_hold)):
        raise ValueError('Expected positive finite thresholds')
    events, quiet, setups = [], [], []
    index, anchor, low_start, prep_start, prep_last, epoch = 0, None, None, None, None, 0
    latest_end, last_launch, last_time, active_seen = None, -math.inf, -math.inf, False
    for signal in signals:
        t, speed = signal['time_s'], signal['motion_heights_per_s']
        if not math.isfinite(t) or t <= last_time:
            raise ValueError('Signals must have increasing finite times')
        last_time = t
        if signal['reset']:
            epoch += 1
            anchor = low_start = prep_start = prep_last = latest_end = None
            active_seen = False
        chunk = False
        while index < len(raw) and raw[index]['time_s'] <= t+1e-6:
            sample = raw[index]
            st, point = sample['time_s'], sample['xy_px']
            if sample.get('chunk_start'):
                anchor = None; chunk = True
            if point is None:
                anchor = None
            elif anchor is None or np.linalg.norm(np.asarray(point)-anchor[1]) > stationary_px:
                anchor = (st,np.asarray(point))
            index += 1
        if chunk:
            low_start = None
        known = speed is not None and signal['court_view'] and signal['both_players_visible']
        if known and speed >= .5 and signal.get('shuttle_moving',False): active_seen = True
        if known and speed < .3:
            if low_start is None: low_start = t
        else:
            low_start = None
        fresh = index > 0 and t-raw[index-1]['time_s'] <= 1.5/fps
        if (active_seen and fresh and anchor is not None and low_start is not None and
                t-max(anchor[0],low_start) >= quiet_s-1e-6):
            candidate = max(anchor[0],low_start)
            if latest_end is None or candidate > latest_end+1e-6:
                latest_end = candidate
                quiet.append({'start_s': candidate, 'observed_until_s': t, 'epoch': epoch})
        poses = signal.get('pose', [])
        floor_speed = signal.get('floor_motion_heights_per_s',speed)
        positions = signal['players_court_xy']
        geometry = diagonal(positions) if require_diagonal else (len(positions)==2 and all(p is not None for p in positions) and
                    all(-.1 <= p[0] <= 1.1 for p in positions) and -.1 <= positions[0][1] < .49 and .51 < positions[1][1] <= 1.1)
        prepared = (known and floor_speed is not None and floor_speed < .3 and geometry and
                    len(poses)==2 and all(p['body_visible'] for p in poses) and any(p['serve_ready'] for p in poses))
        if prepared and server_side is not None:
            prepared = poses[['far','near'].index(server_side)]['serve_ready']
        if not prepared:
            prep_start = prep_last = None
            continue
        if prep_last is None or t-prep_last > .3:
            prep_start = t
        prep_last = t
        if not setups or abs(prep_start-setups[-1]['setup_start_s']) > 1e-6 or setups[-1]['epoch'] != epoch:
            setups.append({'setup_start_s':prep_start,'observed_until_s':t,'hold_s':0.,'epoch':epoch})
        else:
            setups[-1].update(observed_until_s=t,hold_s=t-prep_start)
        if t-prep_start < setup_hold-1e-6 or t < last_launch+2:
            continue
        # Never look forward through a camera reset or a TrackNet chunk boundary.
        stops = [s['time_s'] for s in signals if s['reset'] and s['time_s'] > t]
        stops += [s['time_s'] for s in raw if s.get('chunk_start') and s['time_s'] > t]
        stop = min([t+1.5, raw[-1]['time_s'], *stops])-1e-6
        boxes = signal['players_box_xywh']
        options = [(launch(raw,prep_start,stop,boxes[i],boxes[1-i]),i) for i in range(2)
                   if (server_side is None or ['far','near'][i]==server_side) and
                   (poses[i]['serve_ready'] or (allow_occluded_server and not poses[i].get('wrists_observed',True)))]
        options = [(time,i) for time,i in options if time is not None and time >= prep_start+setup_hold-1e-6]
        if not options: continue
        launched, server = min(options)
        if launched <= last_launch+2: continue
        endings = [q['start_s'] for q in quiet if q['epoch']==epoch and last_launch < q['start_s'] < prep_start
                   and q['observed_until_s'] <= prep_start+1e-6]
        events.append({'setup_start_s': prep_start, 'launch_s': launched, 'server_side': ['far','near'][server],
                       'previous_end_s': max(endings) if endings else None, 'epoch': epoch,
                       'previous_end_status': 'stationary_and_quiet_then_next_serve' if endings else 'uncertain',
                       'server_pose_status':'readiness_proxy' if poses[server]['serve_ready'] else 'wrist_occluded_launch_proxy',
                       'review_status': 'provisional'})
        last_launch = launched
    return {'serves':events, 'quiet_candidates':quiet, 'setup_candidates':setups}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video',type=Path)
    parser.add_argument('--detections',type=Path,required=True)
    parser.add_argument('--edits',type=Path,help='Optional legacy edit report; omit for the unedited prototype')
    parser.add_argument('--corners',type=float,nargs=8,help='Required without --edits: far-left, far-right, near-right, near-left')
    parser.add_argument('--shuttle',type=Path,nargs='+',required=True)
    parser.add_argument('--pose-model',type=Path,default=Path('data/models/rtmpose-m-wholebody/end2end.onnx'))
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--quiet',type=float,default=2.)
    parser.add_argument('--stationary-px',type=float,default=12.)
    parser.add_argument('--setup-hold',type=float,default=.4)
    args = parser.parse_args()
    read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
    detections = read(args.detections)
    edits = read(args.edits) if args.edits else None
    source_hash = digest(args.video)
    if source_hash != detections['video_sha256'] or (edits and source_hash != edits['video_sha256']):
        raise ValueError('Reports belong to a different source video')
    if not edits and not args.corners: parser.error('Mark --corners for the fixed-camera unedited prototype')
    corners = np.asarray(args.corners if args.corners else edits['settings']['corners_px']).reshape(4,2)
    cuts = [e['time_s'] for e in edits['video_edits']] if edits else []
    views = {s['time_s']:s['court_view'] for s in edits['samples']} if edits else None
    samples = [{**s,'court_view':views.get(s['time_s'],False) if views is not None else True} for s in detections['samples']]
    signals = motion(samples,corners,cuts,1.5/detections['settings']['sample_hz'])
    options = ort.SessionOptions(); options.intra_op_num_threads=4
    session = ort.InferenceSession(str(args.pose_model),options,providers=['CPUExecutionProvider'])
    output, reports, runs = [], [], []
    for path in args.shuttle:
        report = read(path); span = report['settings']
        if not detections['settings']['start_s'] <= span['start_s'] < span['end_s'] <= detections['settings']['end_s']:
            raise ValueError('Shuttle interval must lie inside the person-detection interval')
        if report['video_sha256'] != source_hash or report['kind'] != 'raw_tracknet_shuttle_proposals':
            raise ValueError('Expected raw TrackNet report for this video')
        if any(span['start_s']+1e-6 < c < span['end_s']-1e-6 for c in cuts):
            raise ValueError('Shuttle report crosses a camera edit')
        shuttle_evidence(signals,report)  # Validate each original report before joining adjacent unedited chunks.
        if runs and span['start_s'] < runs[-1]['settings']['end_s']-1e-6:
            raise ValueError('Supply non-overlapping shuttle reports in timestamp order')
        previous = runs[-1] if runs else None
        if (previous and span.get('input_contract')=='fixed_camera_no_edits' and
                previous['settings'].get('input_contract')=='fixed_camera_no_edits' and
                abs(span['start_s']-previous['settings']['end_s'])<1e-6 and
                span['fps']==previous['settings']['fps'] and report['model_sha256']==previous['model_sha256'] and
                not any(abs(c-span['start_s'])<1e-6 for c in cuts)):
            previous['samples'].extend([{**s,'chunk_start':i==0} for i,s in enumerate(report['samples'])])
            previous['settings']['end_s']=span['end_s']
        else:
            runs.append(report)
        reports.append({'path':path.as_posix(),'sha256':digest(path)})
    capture = cv2.VideoCapture(str(args.video))
    try:
        for report in runs:
            span = report['settings']
            fused = shuttle_evidence(signals,report)
            for signal in fused:
                signal['pose'] = []
                speed = signal['floor_motion_heights_per_s']
                if speed is None or speed >= .3 or not diagonal(signal['players_court_xy']): continue
                capture.set(cv2.CAP_PROP_POS_MSEC,signal['time_s']*1000)
                ok, frame = capture.read()
                if not ok: raise ValueError('Could not decode pose frame')
                for box in signal['players_box_xywh']:
                    tensor, center, scale = prepare_pose(frame,box)
                    points,scores = decode_pose(session.run(None,{session.get_inputs()[0].name:tensor}),center,scale)
                    signal['pose'].append({**posture(points,scores,box[3]),
                        'keypoints_px':points[:17].tolist(),'responses':scores[:17].tolist()})
            result = boundaries(fused,report['samples'],span['fps'],args.quiet,args.stationary_px,args.setup_hold)
            rallies = []
            for i,event in enumerate(result['serves']):
                following = result['serves'][i+1] if i+1<len(result['serves']) else None
                ending = following['previous_end_s'] if following else None
                rallies.append({'start_s':event['launch_s'],'end_s':ending,
                    'review_stop_s':following['setup_start_s'] if following else span['end_s'],
                    'end_status':'provisional_next_serve_confirmation' if ending is not None else 'uncertain',
                    'outcome':'unknown','review_status':'provisional'})
            result['rallies'] = rallies
            output.append({**result,'start_s':span['start_s'],'end_s':span['end_s'], 'samples':fused})
    finally:
        capture.release()
    args.output.mkdir(parents=True,exist_ok=False)
    result = {'kind':'provisional_serve_first_boundaries','video_sha256':source_hash,
              'detections_sha256':digest(args.detections),'edits_sha256':digest(args.edits) if args.edits else None,
              'pose_model_sha256':digest(args.pose_model),'shuttle_reports':reports,
              'settings':{'input_contract':'edit_checked_clip' if edits else 'fixed_camera_no_edits',
                          'corners_px':corners.tolist(),'quiet_s':args.quiet,'stationary_px':args.stationary_px,'pose_response_threshold':.3,
                          'setup_hold_s':args.setup_hold,'player_motion_heights_per_s':.3,'launch_lookahead_s':1.5},
              'accuracy':None,'clips':output,
              'limitations':['Serve posture is an untrained RTMPose readiness proxy, not service-fault classification',
                 'Highest-score person per half is not a verified identity',
                 'No backward confirmation across camera cuts or inference clips; missing positions are unknown']}
    (args.output/'results.json').write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
    cards = []
    for clip in output:
        for event in clip['serves']:
            ending = event['previous_end_s']
            text = f'Possible {event["server_side"]}-side serve at {event["launch_s"]:.2f}s; previous end: '+(f'{ending:.2f}s' if ending is not None else 'uncertain')
            cards.append(f'<button data-start="{max(clip["start_s"],event["setup_start_s"]-.5)}" data-end="{min(clip["end_s"],event["launch_s"]+3)}">{text}</button>')
        for rally in clip['rallies']:
            label = f'{rally["end_s"]:.2f}s' if rally['end_s'] is not None else 'end unknown'
            cards.append(f'<button data-start="{rally["start_s"]}" data-end="{rally["end_s"] if rally["end_s"] is not None else rally["review_stop_s"]}">Possible rally {rally["start_s"]:.2f}s — {label} (bounded review)</button>')
        for quiet in clip['quiet_candidates']:
            cards.append(f'<button data-start="{max(clip["start_s"],quiet["start_s"]-1)}" data-end="{min(clip["end_s"],quiet["observed_until_s"]+1)}">Quiet/stationary candidate {quiet["start_s"]:.2f}s — needs next-serve confirmation</button>')
        for setup in clip['setup_candidates']:
            if any(abs(e['setup_start_s']-setup['setup_start_s'])<1e-6 for e in clip['serves']): continue
            cards.append(f'<button data-start="{max(clip["start_s"],setup["setup_start_s"]-.5)}" data-end="{min(clip["end_s"],setup["observed_until_s"]+2)}">Setup cue {setup["setup_start_s"]:.2f}–{setup["observed_until_s"]:.2f}s — no confirmed launch</button>')
        cards.append(f'<button data-start="{clip["start_s"]}" data-end="{clip["end_s"]}">Inspect full analyzed clip {clip["start_s"]:.2f}–{clip["end_s"]:.2f}s</button>')
    page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Serve-first rally review</title>
<style>body{{font:18px system-ui;max-width:1000px;margin:30px auto;background:#151b20;color:white}}video{{width:100%}}button{{display:block;padding:12px;margin:8px 0}}</style>
<h1>Serve-first rally review</h1><p>Provisional cues, not verified rallies. Review the serve setup and launch; previous endings need two seconds of stationary shuttle plus quiet players. Missing evidence stays uncertain.</p>
<video controls src="/source.mp4"></video>{''.join(cards)}<script>const v=document.querySelector('video');let end=Infinity;document.querySelectorAll('button').forEach(b=>b.onclick=()=>{{end=+b.dataset.end;v.currentTime=+b.dataset.start;v.play().catch(()=>{{}})}});v.ontimeupdate=()=>{{if(v.currentTime>=end)v.pause()}};</script></html>'''
    (args.output/'review.html').write_text(page,encoding='utf-8')
    print(json.dumps([{k:v for k,v in clip.items() if k!='samples'} for clip in output],indent=2))


if __name__ == '__main__':
    main()
