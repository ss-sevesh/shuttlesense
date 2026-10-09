"""Fuse tracked MediaPipe players with observed TrackNet positions for review."""
import argparse
import base64
import html
import json
import math
from bisect import bisect_left, bisect_right
from pathlib import Path

import cv2
import numpy as np

from detect import digest
from rallies import shuttle_evidence
from serve_rallies import boundaries

COCO = [0,2,5,7,8,11,12,13,14,15,16,23,24,25,26,27,28]
EDGES = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),
         (23,24),(23,25),(25,27),(24,26),(26,28),(27,29),(29,31),(28,30),(30,32)]


def player_arrays(player):
    points = np.asarray(player.get('keypoints_xy', []), dtype=float)
    scores = np.asarray(player.get('keypoint_scores', []), dtype=float)
    if points.shape != (33,2) or scores.shape != (33,):
        return None
    if not np.isfinite(points).all() or not np.isfinite(scores).all():
        raise ValueError('Nonfinite pose landmarks')
    return points, scores


def mediapipe_posture(points, scores, height):
    """Separate visible torso/legs from wrist visibility in rear-facing players."""
    body_indices=[11,12,23,24,27,28]
    if min(scores[body_indices])<.3: return {'body_visible':False,'serve_ready':False}
    shoulder=points[[11,12]].mean(axis=0);hip=points[[23,24]].mean(axis=0)
    body=bool(shoulder[1]<hip[1]<points[[27,28],1].mean())
    wrists=[j for j in (15,16) if scores[j]>=.3]
    ready=body and bool(wrists) and all(points[j,1]>shoulder[1]-.1*height for j in wrists) and min(np.linalg.norm(points[j]-hip) for j in wrists)<.6*height
    return {'body_visible':body,'serve_ready':bool(ready),'wrists_observed':bool(wrists)}


def validate_observations(poses, shuttle):
    shuttle_evidence([],shuttle)
    if poses.get('kind') != 'tracked_player_pose': raise ValueError('Expected tracked MediaPipe observations')
    if poses['fps'] != shuttle['settings']['fps']: raise ValueError('Report frame rates differ')
    for report in (poses,shuttle):
        if not report['samples']: raise ValueError('Empty observation report')
        previous = -math.inf
        for sample in report['samples']:
            t = sample['time_s']
            if not math.isfinite(t) or t <= previous: raise ValueError('Observation times must increase')
            if abs(sample['source_frame']/poses['fps']-t)>1e-5: raise ValueError('Frame and timestamp disagree')
            previous = t
    for sample in shuttle['samples']:
        p=sample['xy_px']
        if p is not None and (np.asarray(p).shape!=(2,) or not np.isfinite(p).all()):
            raise ValueError('Invalid shuttle coordinates')
    for sample in poses['samples']:
        if len({p['side'] for p in sample['players']}) != len(sample['players']): raise ValueError('Duplicate court-side players')
        for p in sample['players']:
            box=np.asarray(p['box_xywh'])
            if p['side'] not in ('far','near') or box.shape!=(4,) or not np.isfinite(box).all() or np.any(box[2:]<=0):
                raise ValueError('Invalid player box or side')
            if np.asarray(p['court_xy']).shape!=(2,) or not np.isfinite(p['court_xy']).all(): raise ValueError('Invalid court position')
            player_arrays(p)


def pose_measurements(samples):
    result,previous=[],{}
    for sample in samples:
        values=[]
        for p in sample['players']:
            arrays=player_arrays(p)
            if arrays is None: continue
            points,scores=arrays
            measurements={'side':p['side'],'track_id':p['track_id']}
            for name,indices in {'left_elbow_deg':(11,13,15),'right_elbow_deg':(12,14,16),
                                 'left_knee_deg':(23,25,27),'right_knee_deg':(24,26,28)}.items():
                a,b,c=points[list(indices)];u,v=a-b,c-b;den=np.linalg.norm(u)*np.linalg.norm(v)
                measurements[name]=float(np.degrees(np.arccos(np.clip(np.dot(u,v)/den,-1,1)))) if den>1e-6 and min(scores[list(indices)])>=.5 else None
            old=previous.get(p['track_id']);speed=None
            if old and 0<sample['time_s']-old[0]<=.15:
                reliable=[j for j in (15,16) if min(scores[j],old[2][j])>=.5]
                if reliable: speed=float(max(np.linalg.norm(points[j]-old[1][j]) for j in reliable)/(sample['time_s']-old[0])/p['box_xywh'][3])
            measurements['wrist_speed_heights_s']=speed
            values.append(measurements)
            previous[p['track_id']]=(sample['time_s'],points,scores)
        result.append({'time_s':sample['time_s'],'players':values})
    return result


def tracked_signals(samples, raw, fps):
    """Keep global court coordinates and reset evidence on identity/data gaps."""
    signals, previous = [], None
    for sample in samples:
        t = sample['time_s']
        if not math.isfinite(t) or (previous and t <= previous['time_s']):
            raise ValueError('Expected increasing finite pose timestamps')
        players = {p['side']:p for p in sample['players']}
        both = set(players) == {'near','far'}
        gap = previous is None or t-previous['time_s'] > .2
        old = {p['side']:p for p in previous['players']} if previous else {}
        same = both and set(old) == {'near','far'} and all(players[s]['track_id']==old[s]['track_id'] for s in players)
        reset = bool(gap or not both or (previous is not None and not same))
        floor_speed = None
        if same and not gap:
            speeds = []
            for side,p in players.items():
                b, a = np.asarray(p['box_xywh']), np.asarray(old[side]['box_xywh'])
                feet, old_feet = b[:2]+b[2:]*[.5,1], a[:2]+a[2:]*[.5,1]
                speeds.append(np.linalg.norm(feet-old_feet)/(t-previous['time_s'])/b[3])
            floor_speed = float(max(speeds))
        poses = []
        if both:
            for side in ('far','near'):
                p = players[side]; arrays = player_arrays(p)
                poses.append(mediapipe_posture(arrays[0],arrays[1],p['box_xywh'][3]) if arrays else
                             {'body_visible':False,'serve_ready':False})
        nearby = [s for s in raw if t-.12 <= s['time_s'] <= t and s['xy_px'] is not None]
        moving = False
        if len(nearby)>1 and nearby[-1]['time_s']-nearby[-2]['time_s'] <= 1.5/fps:
            moving = np.linalg.norm(np.asarray(nearby[-1]['xy_px'])-nearby[-2]['xy_px'])/(nearby[-1]['time_s']-nearby[-2]['time_s']) >= 50
        signals.append({'time_s':t,'reset':reset,'court_view':True,'both_players_visible':both,
                        'motion_heights_per_s':floor_speed,'floor_motion_heights_per_s':floor_speed,
                        'shuttle_moving':bool(moving),'pose':poses,
                        'players_court_xy':[players[s]['court_xy'] for s in ('far','near')] if both else [],
                        'players_box_xywh':[players[s]['box_xywh'] for s in ('far','near')] if both else []})
        previous = sample
    return signals


def hit_candidates(samples, raw, fps):
    """A local wrist-motion peak near an observed shuttle, with temporal suppression."""
    candidates = []
    times = [s['time_s'] for s in raw]
    for i in range(1,len(samples)-1):
        before, now, after = samples[i-1:i+2]
        dt1, dt2 = now['time_s']-before['time_s'], after['time_s']-now['time_s']
        if not 0 < dt1 <= .15 or not 0 < dt2 <= .15: continue
        t = now['time_s']
        nearby = [s for s in raw[bisect_left(times,t-1.5/fps):bisect_right(times,t+1.5/fps)] if s['xy_px'] is not None]
        if not nearby or any(s.get('chunk_start') for s in raw[bisect_left(times,t-.15):bisect_right(times,t+.15)]): continue
        prior = {p['track_id']:p for p in before['players']}
        later = {p['track_id']:p for p in after['players']}
        for p in now['players']:
            track = p['track_id']
            if track not in prior or track not in later: continue
            arrays = [player_arrays(q) for q in (prior[track],p,later[track])]
            if any(a is None for a in arrays): continue
            height = p['box_xywh'][3]
            for wrist in (15,16):
                if any(a[1][wrist] < .5 for a in arrays): continue
                speed1 = np.linalg.norm(arrays[1][0][wrist]-arrays[0][0][wrist])/dt1/height
                speed2 = np.linalg.norm(arrays[2][0][wrist]-arrays[1][0][wrist])/dt2/height
                # ponytail: candidate contact is a wrist/shuttle proxy; evaluate against reviewed hits before production.
                if speed1 < .8 or speed1 < speed2: continue
                proximity = min(np.linalg.norm(np.asarray(s['xy_px'])-arrays[1][0][wrist])/height for s in nearby)
                if proximity > .6: continue
                candidates.append({'time_s':now['time_s'],'source_frame':now['source_frame'],
                    'track_id':track,'side':p['side'],'wrist':wrist,'score':float(min(speed1,4)*(1-proximity)),
                    'evidence':{'wrist_speed_heights_s':float(speed1),'shuttle_distance_heights':float(proximity)},
                    'shot_type':None,'shot_status':'not_classified','review_status':'candidate'})
    # A single swing can create several wrist peaks: keep the strongest per temporal neighbourhood.
    kept = []
    for candidate in sorted(candidates,key=lambda x:x['score'],reverse=True):
        if all(abs(candidate['time_s']-p['time_s']) >= .25 for p in kept): kept.append(candidate)
    return sorted(kept,key=lambda x:x['time_s'])


def rally_intervals(cues, hits, start, stop):
    rallies = []
    serves = cues['serves']
    for i,serve in enumerate(serves):
        following = serves[i+1] if i+1<len(serves) else None
        review_stop = following['setup_start_s'] if following else stop
        quiets=[q['start_s'] for q in cues.get('quiet_candidates',[]) if q['epoch']==serve['epoch'] and
                serve['launch_s']<q['start_s'] and q['observed_until_s']<=review_stop]
        quiet = min(quiets) if quiets else following['previous_end_s'] if following and following.get('epoch')==serve.get('epoch') else None
        members = [h for h in hits if serve['launch_s'] <= h['time_s'] < review_stop]
        before_end = [h for h in members if quiet is not None and h['time_s'] <= quiet]
        ending = min(quiet,before_end[-1]['time_s']+.2) if before_end else None
        rallies.append({'start_s':serve['launch_s'],'end_s':ending,'review_stop_s':review_stop,
                        'start_status':'near_serve_pose_and_launch_candidate','end_status':'observed_stationary_and_quiet' if ending else 'uncertain',
                        'hit_candidates':sum(h['time_s']<=ending for h in members) if ending else len(members),
                        'outcome':'unknown','review_status':'provisional'})
    return rallies


def play_status(time_s, rallies):
    for rally in rallies:
        ending = rally['end_s'] if rally['end_s'] is not None else rally['review_stop_s']
        if rally['start_s'] <= time_s <= ending:
            return 'possible_play' if rally['end_s'] is not None else 'end_uncertain_review'
    return 'outside_play'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video',type=Path)
    parser.add_argument('--poses',type=Path,required=True)
    parser.add_argument('--shuttle',type=Path,required=True)
    parser.add_argument('--shots',type=Path,help='BST output for these exact hit candidates')
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
    poses, shuttle = read(args.poses), read(args.shuttle)
    source_hash = digest(args.video)
    if any(r['video_sha256'] != source_hash for r in (poses,shuttle)):
        raise ValueError('Reports belong to another video')
    if shuttle['kind'] != 'raw_tracknet_shuttle_proposals': raise ValueError('Expected raw TrackNet observations')
    validate_observations(poses,shuttle)
    start, stop = shuttle['settings']['start_s'], shuttle['settings']['end_s']
    if not poses['settings']['start_s'] <= start+1e-6 < stop <= poses['settings']['end_s']+1e-6:
        raise ValueError('Shuttle interval must be covered by player tracking')
    samples = [s for s in poses['samples'] if start-1e-6 <= s['time_s'] < stop]
    if len(samples)<3: raise ValueError('At least three overlapping pose samples required')
    raw, fps = shuttle['samples'], shuttle['settings']['fps']
    if poses['settings']['sample_hz'] == fps:
        from contact_frames import contact_report, angle_report, join_angles
        hits = join_angles(contact_report(poses,shuttle), angle_report(poses))['hits']
    else:
        hits = hit_candidates(samples,raw,fps)
    cues = boundaries(tracked_signals(samples,raw,fps),raw,fps,server_side='near',require_diagonal=False)
    shot_model = None
    if args.shots:
        shots = read(args.shots)
        if shots['video_sha256'] != source_hash: raise ValueError('Shot report belongs to another video')
        if shots.get('input_sha256',{}).get('poses') != digest(args.poses) or shots.get('input_sha256',{}).get('shuttle') != digest(args.shuttle):
            raise ValueError('Shot report uses different pose/shuttle observations')
        shot_model = shots['settings']
        keys=('time_s','source_frame','track_id','side','wrist','score','evidence')
        if [{k:h[k] for k in keys} for h in hits] != [{k:s[k] for k in keys} for s in shots['shots']]:
            raise ValueError('Shot report uses different candidate-hit windows; rerun BST')
        for hit in hits:
            match = next((s for s in shots['shots'] if s['track_id']==hit['track_id'] and abs(s['time_s']-hit['time_s'])<1e-6),None)
            if match: hit.update({k:match[k] for k in ('shot_type','shot_status','confidence','raw_shot_type','predicted_side') if k in match})
    rallies = rally_intervals(cues,hits,start,stop)
    for hit in hits:
        hit['play_status']=play_status(hit['time_s'],rallies)
    result = {'kind':'tracked_pose_rally_candidates','video_sha256':source_hash,
        'settings':{'start_s':start,'end_s':stop,'fps':fps,'hit_suppression_s':.25,'contact_method':'wrist_distance' if poses['settings']['sample_hz']==fps else 'legacy_wrist_peaks','required_server_side':'near','require_observed_serve_posture':True,'require_diagonal_service_positions':False},
        'pose_report_sha256':digest(args.poses),'shuttle_report_sha256':digest(args.shuttle),
        'shot_report_sha256':digest(args.shots) if args.shots else None,
        'shot_model':shot_model,
        'tracking_stats':poses.get('tracking_stats',{}),'identity_events':poses.get('identity_events',[]),
        'shuttle_measurements':shuttle.get('measurements',{}),
        'hits':hits, **cues,'rallies':rallies,'pose_measurements':pose_measurements(samples),'accuracy':None,
        'limitations':['Hit events and boundaries need human review','Missing evidence keeps boundaries unknown',
                       'Pose landmarks are not racket tracking or service-fault detection']}
    args.output.mkdir(parents=True,exist_ok=False)
    (args.output/'results.json').write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
    render_review(args.video,args.output,samples,raw,result)
    print(json.dumps({'hit_candidates':len(hits),'serve_candidates':len(cues['serves']),
                      'review_intervals':len(rallies),'uncertain_endings':sum(r['end_s'] is None for r in rallies)}))


def render_review(video, output, samples, raw, result):
    start, stop, fps = (result['settings'][s] for s in ('start_s','end_s','fps'))
    capture = cv2.VideoCapture(str(video))
    width,height = (int(capture.get(p)) for p in (cv2.CAP_PROP_FRAME_WIDTH,cv2.CAP_PROP_FRAME_HEIGHT))
    capture.set(cv2.CAP_PROP_POS_FRAMES,round(start*fps))
    writer = cv2.VideoWriter(str(output/'overlay.mp4'),cv2.CAP_MSMF,cv2.VideoWriter_fourcc(*'avc1'),fps,(width,height))
    if not capture.isOpened() or not writer.isOpened(): raise OSError('Cannot open review video')
    index = raw_index = 0
    try:
        for source_frame in range(round(start*fps),round(stop*fps)):
            ok, frame = capture.read()
            if not ok: raise OSError('Could not decode review frame')
            t = source_frame/fps
            while index+1<len(samples) and samples[index+1]['time_s'] <= t+1e-6: index+=1
            while raw_index+1<len(raw) and raw[raw_index+1]['time_s'] <= t+1e-6: raw_index+=1
            if samples and abs(samples[index]['time_s']-t) <= .12:
                for p in samples[index]['players']:
                    color = (255,180,40) if p['side']=='far' else (40,220,255)
                    x,y,w,h = map(int,p['box_xywh'])
                    cv2.rectangle(frame,(x,y),(x+w,y+h),color,2)
                    cv2.putText(frame,f"{p['side']} ID {p['track_id']}",(x,y-8),cv2.FONT_HERSHEY_SIMPLEX,.55,color,2)
                    arrays = player_arrays(p)
                    if arrays:
                        points,scores=arrays
                        for a,b in EDGES:
                            if min(scores[a],scores[b]) >= .5:
                                cv2.line(frame,tuple(points[a].astype(int)),tuple(points[b].astype(int)),color,2)
            point = raw[raw_index]['xy_px'] if abs(raw[raw_index]['time_s']-t)<=1.5/fps else None
            if point is not None: cv2.circle(frame,tuple(map(int,point)),6,(100,255,100),2)
            hit = next((h for h in reversed(result['hits']) if 0 <= t-h['time_s'] < .5),None)
            status=play_status(t,result['rallies'])
            label = f"{t:.2f}s | "+(f"{hit['side']} {hit['play_status']}: {hit['shot_type'] or 'unclassified'}" if hit else 'Review window: ending unknown' if status=='end_uncertain_review' else 'Possible rally in progress' if status=='possible_play' else 'Waiting for near-side serve / tracking')
            cv2.putText(frame,label,(20,35),cv2.FONT_HERSHEY_SIMPLEX,.6,(255,255,255),2)
            writer.write(frame)
    finally:
        capture.release(); writer.release()
    buttons=[]
    for i,r in enumerate(result['rallies'],1):
        a = r.get('start_s') or r.get('review_start_s',start)
        b = r['end_s'] or r['review_stop_s']
        label = f"Possible rally {i}: {a:.2f}s; "+(f"end {b:.2f}s" if r['end_s'] else 'end unknown')
        buttons.append(f'<button data-start="{a-start}" data-end="{b-start}">{label}</button>')
    for h in result['hits']:
        buttons.append(f'<button data-start="{max(0,h["time_s"]-start-.6)}" data-end="{min(stop-start,h["time_s"]-start+.8)}">{h["time_s"]:.2f}s {h["side"]}: {html.escape(h["shot_type"] or "unknown")} ({h["play_status"]})</button>')
    maps=[]
    for side in ('far','near'):
        grid=np.zeros((12,8),dtype=np.float32)
        for sample in samples:
            for p in sample['players']:
                if p['side']!=side or p.get('court_xy') is None: continue
                x,y=p['court_xy']
                if 0<=x<=1 and 0<=y<=1: grid[min(11,int(y*12)),min(7,int(x*8))]+=1
        colored=cv2.applyColorMap((grid/max(1,float(grid.max()))*255).astype(np.uint8),cv2.COLORMAP_JET)
        colored=cv2.resize(colored,(200,300),interpolation=cv2.INTER_NEAREST)
        ok,png=cv2.imencode('.png',colored)
        if not ok: raise OSError('Cannot encode movement map')
        maps.append(f'<figure><img width="200" alt="{side} movement occupancy" src="data:image/png;base64,{base64.b64encode(png).decode()}"><figcaption>{side} player sampled occupancy</figcaption></figure>')
    labeled=sum(h['shot_status']=='experimental_prediction' for h in result['hits'])
    page=fr'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tracked pose rally review</title>
<style>body{{font:17px system-ui;max-width:1050px;margin:24px auto;padding:16px;background:#121a21;color:#eee}}video{{width:100%}}button{{padding:12px;margin:5px;background:#c5e891;color:#172016;border:0;cursor:pointer}}figure{{display:inline-block}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}summary{{cursor:pointer}}</style>
<h1>ByteTrack + MediaPipe rally review</h1><p>Source {start:.2f}–{stop:.2f}s. Video controls use clip-relative times; event buttons show source times.</p>
<p>{len(result['serves'])} near-side serve candidates · {sum(h['play_status']=='possible_play' for h in result['hits'])} possible playing hits in intervals with proposed endings · {len(result['rallies'])} review intervals. Counts are unverified.</p>
<p>New play requires the near player's observed serve posture followed by shuttle launch. Walking, pickup and tossing outside an accepted interval remain outside play. {labeled} experimental BST labels are retained for review; labels alone never start play.</p>
<p>Missing detections leave gaps. Receiver positions may be near the baseline; this prototype does not require legal diagonal service boxes.</p>
<p>Unknown-ending windows can include post-point walking or tossing. Their contact candidates are marked end_uncertain_review and excluded from playing-hit counts.</p>
<video src="/source.mp4" controls playsinline preload="metadata"></video><p id="status">Blue: far player. Yellow: near player. Green: raw TrackNet shuttle proposal.</p>
<button id="full">Play full clip</button><h2>Current pose measurements</h2><pre id="pose">Play or seek to inspect joint angles. Wrist speed is measured in body heights/second.</pre><div>{''.join(buttons)}</div><h2>Movement occupancy</h2>{''.join(maps)}
<details><summary>Actual analysis report</summary><pre>{html.escape(json.dumps(result,indent=2))}</pre></details>
<p>Uncertain boundaries and missing shot labels stay unknown. Human review pending; no accuracy measured.</p>
<script>const v=document.querySelector('video'),poses={json.dumps(result['pose_measurements'])};let end=null;const play=()=>v.play().catch(e=>{{if(e.name!=='AbortError')document.querySelector('#status').textContent=e.message}});document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>{{end=Number(b.dataset.end);v.currentTime=Number(b.dataset.start);document.querySelector('#status').textContent=b.textContent;play()}});document.querySelector('#full').onclick=()=>{{end=null;v.currentTime=0;play()}};const fmt=(x,unit)=>x==null?'unknown':x.toFixed(1)+unit;v.ontimeupdate=()=>{{const t=v.currentTime+{start};const p=poses.reduce((a,b)=>Math.abs(a.time_s-t)<Math.abs(b.time_s-t)?a:b);document.querySelector('#pose').textContent=Math.abs(p.time_s-t)<.15?'Source time '+p.time_s.toFixed(2)+'s\n'+p.players.map(q=>q.side+' ID '+q.track_id+'\nElbow L / R: '+fmt(q.left_elbow_deg,'°')+' / '+fmt(q.right_elbow_deg,'°')+'\nKnee L / R: '+fmt(q.left_knee_deg,'°')+' / '+fmt(q.right_knee_deg,'°')+'\nWrist motion: '+fmt(q.wrist_speed_heights_s,' body heights/s')).join('\n\n'):'Pose unavailable';if(end!==null&&v.currentTime>=end){{v.pause();end=null}}}};</script></html>'''
    (output/'review.html').write_text(page,encoding='utf-8')


if __name__=='__main__': main()
