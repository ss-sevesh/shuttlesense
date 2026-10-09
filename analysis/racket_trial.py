"""Offline RTMDet-Ins-s feasibility trial; racket proximity is not impact."""
import argparse
import base64
import hashlib
import html
import json
import math
from pathlib import Path
import subprocess
import time

import cv2
import numpy as np

MODEL_NAME = 'rtmdet-ins_s_8xb32-300e_coco'
MODEL_URL = ('https://download.openmmlab.com/mmdetection/v3.0/rtmdet/' + MODEL_NAME +
             '/' + MODEL_NAME + '_20221121_212604-fdc5d7ec.pth')
MODEL_DIR = Path('data/models/rtmdet-ins-s')
SCORE = .3


def digest(path):
    # Python 3.10 is required by the published Windows MMCV wheel.
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''): value.update(block)
    return value.hexdigest()


def mask_distance(mask, shuttle):
    point = np.asarray(shuttle, dtype=float)
    if (mask.ndim != 2 or point.shape != (2,) or not np.isfinite(point).all() or
            np.any(point < 0) or np.any(point >= [mask.shape[1], mask.shape[0]])):
        raise ValueError('Expected an image-space mask and finite in-bounds shuttle')
    yy, xx = np.nonzero(mask)
    if not len(xx): return None
    distances = np.hypot(xx - point[0], yy - point[1])
    index = int(distances.argmin())
    return float(distances[index]), [int(xx[index]), int(yy[index])]


def associate(box, players):
    """Nearest tracked player rectangle; ties and distant rackets abstain."""
    center = np.asarray(box[:2]) + np.asarray(box[2:]) / 2
    ranked = []
    for player in players:
        x, y, width, height = player['box_xywh']
        offset = np.maximum(np.maximum([x, y] - center, center - [x + width, y + height]), 0)
        ranked.append((float(np.linalg.norm(offset) / height), player))
    ranked.sort(key=lambda value: value[0])
    if not ranked or ranked[0][0] > .5: return None
    if len(ranked) > 1 and ranked[1][0] - ranked[0][0] <= .1: return None
    return ranked[0][1]


def select_minimum(rows, window):
    valid = [r for r in rows if window[0] <= r['source_frame'] <= window[1] and r['distance_px'] is not None]
    unavailable = {'frame': None, 'distance_px': None}
    if not valid: return {**unavailable, 'status': 'missing_observations'}
    if len({r['track_id'] for r in valid}) != 1: return {**unavailable, 'status': 'identity_switch'}
    selected = min(valid, key=lambda r: r['distance_px'])
    frame, distance = selected['source_frame'], selected['distance_px']
    if sum(math.isclose(r['distance_px'], distance, abs_tol=1e-6) for r in valid) > 1:
        return {**unavailable, 'status': 'ambiguous_minimum'}
    frames = {r['source_frame'] for r in valid}
    if frame in window or frame - 1 not in frames or frame + 1 not in frames:
        return {**unavailable, 'status': 'unbracketed_minimum'}
    return {'status': 'proximity_candidate', 'frame': frame, 'distance_px': distance}


def load_inputs(job):
    poses, shuttle, contacts = [json.loads((job / name).read_text(encoding='utf-8'))
                                for name in ('players.json', 'shuttle.json', 'contacts.json')]
    video_hash = digest(job / 'source.mp4')
    if any(report['video_sha256'] != video_hash for report in (poses, shuttle, contacts)):
        raise ValueError('Reports and source video must have identical hashes')
    if poses['fps'] != 30 or shuttle['settings']['fps'] != poses['fps']:
        raise ValueError('Trial requires the existing 30 FPS source')
    for report in (poses, shuttle):
        for frame, row in enumerate(report['samples']):
            if row['source_frame'] != frame or abs(row['time_s'] - frame / poses['fps']) > 1e-5:
                raise ValueError('Every original decoded frame must have aligned observations')
    if len(poses['samples']) != len(shuttle['samples']) or not poses['samples']:
        raise ValueError('Observation coverage differs or is empty')
    return poses, shuttle, contacts


def infer_trial(job, output):
    from mmengine import Config
    from mmdet.apis import init_detector, inference_detector
    import torch

    poses, shuttle, contacts = load_inputs(job)
    manifest = json.loads((MODEL_DIR / 'provenance.json').read_text())
    if manifest['model'] != MODEL_NAME:
        raise ValueError('Wrong racket trial checkpoint')
    for name, expected in manifest['sha256'].items():
        if digest(MODEL_DIR / name) != expected: raise ValueError('Model/config hash mismatch')
    cfg = Config.fromfile(MODEL_DIR / 'config.py')
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    started = time.perf_counter()
    model = init_detector(cfg, str(MODEL_DIR / 'model.pth'), device=device)
    label = model.dataset_meta['classes'].index('tennis racket')
    output.mkdir(parents=True, exist_ok=False)
    (output / 'masks').mkdir()
    capture = cv2.VideoCapture(str(job / 'source.mp4'))
    size = (int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    count = len(poses['samples'])
    if (not capture.isOpened() or int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) != count or
            size != (poses['width'], poses['height']) or abs(capture.get(cv2.CAP_PROP_FPS) - poses['fps']) > 1e-5):
        capture.release()
        raise ValueError('Decoded source size/frame count/FPS differs from observations')
    writer = cv2.VideoWriter(str(output / 'overlay-raw.mp4'), cv2.VideoWriter_fourcc(*'mp4v'), 30, size)
    if not writer.isOpened():
        capture.release()
        raise RuntimeError('Cannot write annotated video')
    needed = {f for hit in contacts['hits'] for f in range(max(0, hit['contact']['windowFrames'][0]), min(count - 1, hit['contact']['windowFrames'][1]) + 1)}
    rows, images, detector_seconds = [], {}, 0.
    try:
        for frame in range(count):
            okay, picture = capture.read()
            if not okay or abs(capture.get(cv2.CAP_PROP_POS_FRAMES) - frame - 1) > .5:
                raise ValueError(f'Cannot decode exact frame {frame}')
            tick = time.perf_counter()
            with torch.inference_mode(): instances = inference_detector(model, picture).pred_instances
            selected = instances[(instances.labels == label) & (instances.scores >= SCORE)].cpu().numpy()
            detector_seconds += time.perf_counter() - tick
            masks = np.asarray(selected.masks, dtype=bool)
            if masks.shape != (len(selected), size[1], size[0]):
                raise ValueError('MMDetection masks must be rescaled to original image pixels')
            if len(selected): np.savez_compressed(output / 'masks' / f'{frame}.npz', masks=masks)
            detections, near = [], []
            for index, (box, score, mask) in enumerate(zip(selected.bboxes, selected.scores, masks)):
                if not np.isfinite(box).all() or not np.isfinite(score): raise ValueError('Nonfinite detection')
                x1, y1, x2, y2 = map(float, box)
                if x2 <= x1 or y2 <= y1: raise ValueError('Invalid detection box')
                player = associate([x1, y1, x2 - x1, y2 - y1], poses['samples'][frame]['players'])
                detection = {'box_xywh': [x1, y1, x2 - x1, y2 - y1], 'score': float(score), 'mask_index': index,
                             'side': player['side'] if player else None, 'track_id': player['track_id'] if player else None}
                detections.append(detection)
                if player and player['side'] == 'near': near.append((detection, mask))
                color = (50, 220, 50) if player and player['side'] == 'near' else (0, 180, 255)
                picture[mask] = (picture[mask] * .65 + np.asarray(color) * .35).astype(np.uint8)
                cv2.rectangle(picture, (round(x1), round(y1)), (round(x2), round(y2)), color, 1)
            point = shuttle['samples'][frame]['xy_px']
            distance = closest = track_id = None
            status = 'missing_racket' if not near else 'ambiguous_rackets' if len(near) > 1 else 'missing_shuttle'
            if len(near) == 1 and point is not None:
                result = mask_distance(near[0][1], point)
                if result is not None:
                    distance, closest = result
                    track_id = near[0][0]['track_id']
                    status = 'observed_proximity'
                    cv2.line(picture, tuple(map(round, point)), tuple(closest), (255, 200, 0), 1)
                else: status = 'empty_mask'
            if point is not None: cv2.circle(picture, tuple(map(round, point)), 4, (0, 0, 255), 1)
            row = {'source_frame': frame, 'time_s': frame / 30, 'detections': detections,
                   'status': status, 'track_id': track_id, 'distance_px': distance, 'closest_mask_xy': closest}
            rows.append(row)
            cv2.rectangle(picture, (0, 0), (size[0], 25), (20, 20, 20), -1)
            cv2.putText(picture, f'Frame {frame} | racket proximity only | green near, orange other, red shuttle', (8, 17), cv2.FONT_HERSHEY_SIMPLEX, .42, (255, 255, 255), 1)
            writer.write(picture)
            if frame in needed: images[frame] = picture.copy()
            if frame % 100 == 0: print(f'RTMDet {frame + 1}/{count}', flush=True)
        if capture.read()[0]: raise ValueError('Source contains unexpected extra frames')
    finally:
        capture.release()
        writer.release()
    windows = [{'id': i + 1, 'seed_frame': hit['contact']['seedFrame'], 'window_frames': hit['contact']['windowFrames'],
                'old_wrist_frame': hit['contact']['frame'], **select_minimum(rows, hit['contact']['windowFrames'])}
               for i, hit in enumerate(contacts['hits'])]
    report = {'kind': 'experimental_racket_proximity', 'video_sha256': poses['video_sha256'], 'fps': 30, 'frame_count': count,
              'model': manifest, 'score_threshold': SCORE, 'input_scale': 640, 'device': device,
              'detector_seconds': detector_seconds, 'elapsed_seconds': time.perf_counter() - started,
              'racket_frames': sum(any(d['side'] == 'near' for d in r['detections']) for r in rows),
              'proximity_frames': sum(r['distance_px'] is not None for r in rows), 'windows': windows, 'samples': rows,
              'limitations': ['COCO tennis-racket class is unvalidated for badminton.', 'Masks include the shaft; proximity is not impact.',
                              'Existing swing seeds limit the search; missed swings are not assessed.', 'No ground truth or contact accuracy measurement.']}
    (output / 'results.json').write_text(json.dumps(report, allow_nan=False), encoding='utf-8')
    return report, poses, images


def render_review(output, report, poses, images):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(output / 'overlay-raw.mp4'),
                    '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                    '-an', str(output / 'overlay.mp4')], check=True)
    (output / 'overlay-raw.mp4').unlink()
    cards = []
    for window in report['windows']:
        first, last = window['window_frames']
        frames = [frame for frame in range(first, last + 1) if frame in images]
        boxes = [p['box_xywh'] for frame in frames for p in poses['samples'][frame]['players'] if p['side'] == 'near']
        width, height = poses['width'], poses['height']
        if boxes:
            padding = max(b[3] for b in boxes) * .5
            left, top = max(0, math.floor(min(b[0] for b in boxes) - padding)), max(25, math.floor(min(b[1] for b in boxes) - padding))
            right, bottom = min(width, math.ceil(max(b[0] + b[2] for b in boxes) + padding)), min(height, math.ceil(max(b[1] + b[3] for b in boxes) + padding))
        else: left, top, right, bottom = 0, 25, width, height
        sheet = np.full((math.ceil(len(frames) / 4) * 350, 4 * 320, 3), 245, dtype=np.uint8)
        for index, frame in enumerate(frames):
            picture = images[frame][top:bottom, left:right]
            scale = min(320 / picture.shape[1], 320 / picture.shape[0])
            thumb = cv2.resize(picture, (max(1, round(picture.shape[1] * scale)), max(1, round(picture.shape[0] * scale))))
            x, y = index % 4 * 320, index // 4 * 350
            sheet[y:y + thumb.shape[0], x:x + thumb.shape[1]] = thumb
            label = f'Frame {frame}' + (' MIN' if frame == window['frame'] else '') + (' OLD' if frame == window['old_wrist_frame'] else '')
            cv2.putText(sheet, label, (x + 8, y + 338), cv2.FONT_HERSHEY_SIMPLEX, .55, (0, 0, 0), 1)
        path = output / f'window-{window["id"]:02d}.jpg'
        if not cv2.imwrite(str(path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 95]): raise RuntimeError('Cannot save frame strip')
        encoded = base64.b64encode(path.read_bytes()).decode('ascii')
        summary = f'{window["status"]}; proximity frame: {window["frame"]}; old wrist frame: {window["old_wrist_frame"]}'
        distance = window['distance_px']
        if distance is not None: summary += f'; distance: {distance:.1f}px'
        cards.append(f'<section><h2>Window {window["id"]} · {window["seed_frame"]/30:.2f}s</h2><p>{html.escape(summary)}</p>'
                     f'<button onclick="playWindow({max(0, first)/30},{min(report["frame_count"]-1, last)/30})">Play window {window["id"]}</button>'
                     f'<img alt="Annotated frames for swing window {window["id"]}; MIN is a proximity estimate, OLD is the prior wrist estimate" src="data:image/jpeg;base64,{encoded}"></section>')
    candidates = sum(window['frame'] is not None for window in report['windows'])
    document = ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                '<title>Racket detection trial</title><link rel="icon" href="data:,"><style>body{font:16px system-ui;margin:24px auto;padding:0 16px;max-width:1100px;color:#142c23;background:#f6f8f6}'
                'video,img{width:100%;height:auto}section{background:white;padding:20px;margin:24px 0;border:1px solid #ccd8cc;border-radius:12px}'
                'button{padding:10px 16px;margin-bottom:16px;cursor:pointer}</style><main><h1>Racket detection trial</h1>'
                '<p>Experimental COCO tennis-racket detections on badminton footage. Green: associated near racket. Orange: other or ambiguous. Red: saved shuttle proposal.</p>'
                f'<p>{report["frame_count"]} frames processed. Near racket present: {report["racket_frames"]} frames. '
                f'Racket and shuttle proximity available: {report["proximity_frames"]} frames. {candidates}/{len(report["windows"])} windows have a bracketed minimum.</p>'
                '<p><strong>Proximity is not confirmed impact.</strong> The mask can include the shaft; missing detections and between-frame impacts remain unresolved. No accuracy percentage is established.</p>'
                '<video id="video" aria-label="Annotated racket detection trial" controls preload="metadata" src="/source.mp4"></video>' + ''.join(cards) + '</main>'
                '<script>const video=document.getElementById("video");let stop=null;function playWindow(start,end){stop=end;video.currentTime=start;video.play().catch(()=>{});video.scrollIntoView({block:"center"});}'
                'video.addEventListener("timeupdate",()=>{if(stop!==null&&video.currentTime>=stop){video.pause();stop=null;}});</script></html>')
    (output / 'review.html').write_text(document, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', type=Path)
    parser.add_argument('--output', type=Path, required=True, help='New private trial directory')
    args = parser.parse_args()
    report, poses, images = infer_trial(args.job, args.output)
    render_review(args.output, report, poses, images)
    print(json.dumps({key: report[key] for key in ('frame_count', 'racket_frames', 'proximity_frames', 'elapsed_seconds', 'windows')}, indent=2))


if __name__ == '__main__':
    main()
