"""Persistent local full-video model job; never renders a second overlay video."""
import argparse
import hashlib
import json
import math
import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np

from court import calibrate
from upload_demo import ordered_corners

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/feasibility/whatsapp-rallies-01'
PIPELINE_VERSION = 'wrist-distance-v1'


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, allow_nan=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(path)


def inspect(video, corners):
    points = np.asarray(corners, dtype=float)
    if points.shape != (8,) or not np.isfinite(points).all() or np.any(points < 0) or np.any(points > 1):
        raise ValueError('Court corners must be eight numbers inside the picture.')
    capture = cv2.VideoCapture(str(video))
    try:
        if not capture.isOpened(): raise ValueError('Cannot decode this video. Choose a readable MP4, MOV or WebM.')
        width, height, fps, frames = [capture.get(k) for k in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT, cv2.CAP_PROP_FPS, cv2.CAP_PROP_FRAME_COUNT)]
        if not all(math.isfinite(n) and n > 0 for n in (width, height, fps, frames)) or frames/fps < 1:
            raise ValueError('The video must contain at least one second with readable timing.')
        if width*height > 3840*2160 or fps > 120:
            raise ValueError('Use a video up to 4K resolution and 120 frames per second for this local prototype.')
        ordered = ordered_corners(points) * [width, height]
        calibrate(ordered, min_area_px2=max(100, width*height*.005))
        return {'width': int(width), 'height': int(height), 'duration': frames/fps, 'corners': ordered.tolist()}
    finally:
        capture.release()


def far_roi(corners, width, height):
    """Far half plus body-height margin, derived from the user's calibration."""
    points = np.asarray(corners)
    half = np.vstack((points[:2], (points[0]+points[3])/2, (points[1]+points[2])/2))
    x0 = max(0, math.floor(half[:,0].min()-.12*width))
    y0 = max(0, math.floor(half[:,1].min()-.35*height))
    x1 = min(width, math.ceil(half[:,0].max()+.12*width))
    y1 = min(height, math.ceil(half[:,1].max()+.05*height))
    return [x0, y0, x1-x0, y1-y0]


def shot_reason(hit):
    if hit['shot_status']=='unresolved_contact': return 'Wrist-distance contact timing could not be resolved.'
    if hit['shot_status']=='experimental_prediction': return 'Experimental prediction; review the clip.'
    if hit['shot_status']=='identity_switch': return 'Player identity changed around this contact.'
    if hit['shot_status']=='insufficient_tracking': return 'Tracking or body landmarks were missing.'
    if hit.get('confidence') is not None and hit['confidence']<.5: return 'Model score was below the acceptance threshold.'
    if hit.get('raw_shot_type') in (None,'unknown'): return 'Model predicted an unknown shot class.'
    if hit.get('predicted_side') is not None and hit['predicted_side']!=hit['side']: return 'The predicted player side did not match the contact.'
    return 'Model evidence did not pass acceptance filters.'


def review_data(poses, shuttle, fused, file_name, cached, original_hash, marked_corners=None, ground=None):
    from tracked_rallies import validate_observations, pose_measurements
    validate_observations(poses, shuttle)
    if poses['video_sha256'] != shuttle['video_sha256'] or fused['video_sha256'] != poses['video_sha256']:
        raise ValueError('Model reports belong to different videos.')
    width, height = poses['width'], poses['height']
    measures = pose_measurements(poses['samples'])
    samples = []
    for sample, measured in zip(poses['samples'], measures):
        people = []
        for p in sample['players']:
            if fused.get('focus_side') == 'near' and p['side'] != 'near': continue
            m = next((m for m in measured['players'] if m['track_id']==p['track_id']), {})
            people.append({'trackId': p['track_id'], 'side': p['side'],
                'box': (np.asarray(p['box_xywh'])/[width,height,width,height]).tolist(),
                'court': p['court_xy'], 'landmarks': (np.asarray(p['keypoints_xy'])/[width,height]).tolist() if p['keypoints_xy'] else [],
                'scores': p['keypoint_scores'], 'poseDetected': p['pose_detected'],
                'measurements': {name:m.get(key) for name,key in [('leftElbow','left_elbow_deg'),('rightElbow','right_elbow_deg'),('leftKnee','left_knee_deg'),('rightKnee','right_knee_deg'),('wristSpeed','wrist_speed_heights_s')]}})
        samples.append({'time': sample['time_s'], 'people': people})
    metrics = {'sampleCount': len(samples), 'shuttleFrames': len(shuttle['samples']),
        'shuttleDetected': sum(s['xy_px'] is not None for s in shuttle['samples'])}
    for side in ('near','far'):
        metrics[side+'Tracked'] = sum(any(p['side']==side for p in s['players']) for s in poses['samples'])
        metrics[side+'Poses'] = sum(any(p['side']==side and p['pose_detected'] for p in s['players']) for s in poses['samples'])
    # Stable across exact cached uploads; any changed model evidence invalidates ordinal human labels.
    fingerprint=hashlib.sha256(json.dumps({'originalVideo':original_hash,'markedCorners':marked_corners or poses['settings']['corners_px'],'poses':poses,'shuttle':shuttle,'fused':fused},sort_keys=True,separators=(',', ':'),allow_nan=False).encode()).hexdigest()
    return {'videoSha256': poses['video_sha256'], 'analysisSha256':fingerprint, 'fileName': file_name, 'duration': shuttle['settings']['end_s'],
        'width': width, 'height': height, 'fps': poses['fps'], 'cached': cached, 'poseSampleHz': poses['settings']['sample_hz'],
        'samples': samples, 'shuttle': [{'time':s['time_s'],'point':(np.asarray(s['xy_px'])/[width,height]).tolist() if s['xy_px'] is not None else None} for s in shuttle['samples']],
        'shots': [{'id': i+1, 'time': h['time_s'], 'side':h['side'], 'trackId':h['track_id'],
            'predictedType':h.get('shot_type') if h.get('shot_type') not in (None,'unknown') else None,
            'rawType':h.get('raw_shot_type'), 'score':h.get('confidence'), 'status':h['shot_status'],
            'playStatus':h['play_status'], 'reason':shot_reason(h),
            **({'contact':h['contact'], 'coaching':h.get('coaching')} if 'contact' in h else {})} for i,h in enumerate(fused['hits'])],
        'pipelineVersion':fused.get('pipeline_version', 'legacy-wrist-peaks'),
        'focusSide':fused.get('focus_side'),
        **({'groundLanding':ground} if ground is not None else {}),
        'rallies': [{'id':i+1,'start':r['start_s'],'end':r['end_s'],'reviewStop':r['review_stop_s'],
            'hitCandidates':r['hit_candidates'],'startStatus':r['start_status'],'endStatus':r['end_status']} for i,r in enumerate(fused['rallies'])],
        'metrics': metrics, 'limitations': ['Predictions and contact candidates need human verification.',
            'Missing shuttle detections and changing player identities leave unknown results.',
            'A model score is not measured accuracy. Pose angles are image measurements. Wrist distance estimates contact, not racket impact.',
            'Racket-face angle is unavailable. Local vision coaching is experimental and may be incorrect.',
            'Unknown rally endings may include walking, pickup or tossing. Near-side observed serve posture and launch are required.',
            'Fixed, upright singles-court footage without edits is assumed; court calibration and handheld motion are unverified.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--validate', action='store_true')
    args = parser.parse_args()
    directory = args.directory.resolve()
    if directory.parent != (ROOT/'data/analysis-jobs').resolve(): raise ValueError('Invalid job directory')
    request = json.loads((directory/'request.json').read_text(encoding='utf-8'))
    original = directory/request['source']
    if args.validate:
        print(json.dumps(inspect(original, request['corners']))); return
    def stage(name, progress, **extra):
        write_json(directory/'status.json', {'id':directory.name,'status':'processing','stage':name,'progress':progress,**extra})
    def run(command, name, start, end):
        stage(name, start)
        with (directory/'worker.log').open('a', encoding='utf-8') as log:
            process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace', creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            for line in process.stdout:
                log.write(line); log.flush()
                if 'TrackNet ' in line or 'sampled frames at ' in line:
                    import re
                    match = re.search(r'TrackNet (\d+)/(\d+)', line)
                    if match: fraction=int(match[1])/int(match[2])
                    else:
                        match=re.search(r'at ([\d.]+)s',line)
                        fraction=float(match[1])/metadata['duration'] if match else 0
                    stage(name, min(end, start+(end-start)*fraction))
            if process.wait(): raise RuntimeError(f'{name} failed. See data/analysis-jobs/{directory.name}/worker.log for the model error.')
    try:
        stage('Checking video and calibration', 2)
        metadata = inspect(original, request['corners'])
        with original.open('rb') as source: original_hash=hashlib.file_digest(source,'sha256').hexdigest()
        provenance=json.loads((CACHE/'input_provenance.json').read_text(encoding='utf-8')) if (CACHE/'input_provenance.json').exists() else {}
        cached=bool(provenance.get('pipeline_version') == PIPELINE_VERSION and original_hash==provenance.get('original_sha256') and np.max(np.abs(np.asarray(metadata['corners'])-np.asarray(provenance['court_corners_px'])))<=2)
        if cached:
            stage('Loading matching full-video model results', 85)
            shutil.copyfile(CACHE/'input.mp4',directory/'source.mp4')
            poses=json.loads((CACHE/'players.json').read_text(encoding='utf-8'))
            shuttle=json.loads((CACHE/'shuttle.json').read_text(encoding='utf-8'))
            fused=json.loads((CACHE/'final-v2/results.json').read_text(encoding='utf-8'))
        else:
            run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(original),'-vf','fps=30','-c:v','libx264','-preset','veryfast','-crf','21','-an','-movflags','+faststart',str(directory/'source.mp4')], 'Normalizing complete video', 4, 10)
            info=inspect(directory/'source.mp4', request['corners'])
            roi=far_roi(info['corners'],info['width'],info['height'])
            run([str(ROOT/'data/player-pose-env/Scripts/python.exe'),'analysis/player_pose.py',str(directory/'source.mp4'),'--end',str(info['duration']),'--sample-hz','30','--imgsz','640','--tracker','analysis/bytetrack-phone.yaml','--allow-reacquisition','--far-roi',*map(str,roi),'--corners',*map(str,np.asarray(info['corners']).flatten()),'--output',str(directory/'players.json')], 'Tracking players and MediaPipe poses', 10, 52)
            run([str(ROOT/'data/tracknet-env/Scripts/python.exe'),'analysis/shuttle_stream.py',str(directory/'source.mp4'),'--assume-unedited','--output',str(directory/'shuttle.json')], 'Detecting shuttle with TrackNet on GPU', 52, 93)
            from tracked_rallies import validate_observations, tracked_signals, rally_intervals, play_status
            from contact_frames import contact_report, angle_report, join_angles
            from serve_rallies import boundaries
            poses=json.loads((directory/'players.json').read_text(encoding='utf-8')); shuttle=json.loads((directory/'shuttle.json').read_text(encoding='utf-8'))
            validate_observations(poses,shuttle)
            stage('Selecting contact frames and calculating independent angle report', 93)
            contacts=contact_report(poses,shuttle)
            angles=angle_report(poses)
            write_json(directory/'contacts.json',contacts)
            write_json(directory/'angles.json',angles)
            hits=join_angles(contacts,angles)['hits']
            write_json(directory/'hits.json',{'video_sha256':poses['video_sha256'],'hits':hits})
            run([str(ROOT/'data/hf-racquet-env/Scripts/python.exe'),'analysis/bst_shots.py','--poses',str(directory/'players.json'),'--shuttle',str(directory/'shuttle.json'),'--hits',str(directory/'hits.json'),'--output',str(directory/'shots.json')], 'Classifying candidate shots with BST', 93, 97)
            classified=json.loads((directory/'shots.json').read_text(encoding='utf-8'))['shots']
            cues=boundaries(tracked_signals(poses['samples'],shuttle['samples'],30),shuttle['samples'],30,server_side='near',require_diagonal=False)
            rallies=rally_intervals(cues,classified,0,info['duration'])
            for hit in classified: hit['play_status']=play_status(hit['time_s'],rallies)
            fused={'video_sha256':poses['video_sha256'],'pipeline_version':PIPELINE_VERSION,'focus_side':'near','fps':poses['fps'],'hits':classified,'rallies':rallies}
            write_json(directory/'fused.json',fused)
        stage('Segmenting floor and checking possible shuttle landings', 97)
        from ground_landing import MODEL, REVISION
        with (directory/'worker.log').open('a', encoding='utf-8') as log:
            try:
                # Cached jobs keep their model reports; the new pass reads the same normalized source.
                write_json(directory/'shuttle.json', shuttle)
                subprocess.run([str(ROOT/'data/hf-racquet-env/Scripts/python.exe'), 'analysis/ground_landing.py',
                    '--video', str(directory/'source.mp4'), '--shuttle', str(directory/'shuttle.json'),
                    '--output', str(directory/'ground')], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                    check=True, timeout=max(120, metadata['duration']*10), creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                ground=json.loads((directory/'ground/results.json').read_text(encoding='utf-8'))
                if ground['videoSha256'] != poses['video_sha256']: raise ValueError('Floor results belong to another video')
            except (subprocess.SubprocessError, OSError, ValueError) as error:
                log.write(f'Floor segmentation unavailable: {type(error).__name__}\n')
                ground={'status':'unavailable','model':MODEL,'revision':REVISION,'candidates':[],
                    'reason':'Floor worker did not complete. See worker.log; rally endings remain unknown.'}
        from shot_coach import extract_frames
        stage('Extracting five-frame contact evidence', 97)
        extract_frames(directory/'source.mp4',fused['hits'],directory/'frames')
        write_json(directory/'fused.json',fused)
        stage('Generating local Hugging Face shot coaching', 97)
        with (directory/'worker.log').open('a',encoding='utf-8') as log:
            try:
                subprocess.run([str(ROOT/'data/hf-racquet-env/Scripts/python.exe'),'analysis/shot_coach.py',str(directory)],
                    cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120+180*len(fused['hits']),
                    creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            except (subprocess.SubprocessError, OSError) as error:
                log.write(f'Local coaching unavailable: {type(error).__name__}\n')
            fused=json.loads((directory/'fused.json').read_text(encoding='utf-8'))
            for hit in fused['hits']:
                hit.setdefault('coaching',{'status':'unavailable','reason':'Local vision worker did not complete. See worker.log.'})
            write_json(directory/'fused.json',fused)
        stage('Preparing values for review', 98)
        with (directory/'source.mp4').open('rb') as source:
            if hashlib.file_digest(source,'sha256').hexdigest()!=poses['video_sha256']:
                raise ValueError('The normalized video does not match its model reports. Rerun analysis.')
        result=review_data(poses,shuttle,fused,request['fileName'],cached,original_hash,metadata['corners'],ground)
        write_json(directory/'result.json',result)
        write_json(directory/'provenance.json',{'originalSha256':original_hash,'normalizedSha256':result['videoSha256'],'pipelineVersion':PIPELINE_VERSION,'cached':cached,'cornersPx':metadata['corners'],'cachedCornerTolerancePx':2 if cached else None})
        write_json(directory/'status.json',{'id':directory.name,'status':'complete','stage':'Ready for your verification','progress':100})
    except Exception as error:
        write_json(directory/'status.json',{'id':directory.name,'status':'failed','stage':'Analysis failed','progress':0,'error':str(error)})
        raise


if __name__ == '__main__':
    main()
