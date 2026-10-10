"""Pretrained floor segmentation plus TrackNet stop candidates, never confirmed impact."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import time

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODEL = 'nvidia/segformer-b0-finetuned-ade-512-512'
REVISION = '489d5cd81a0b59fab9b7ea758d3548ebe99677da'
MODEL_DIR = ROOT / 'data/models/segformer-floor'


def candidates(rows, fps, width, height):
    """Require continuous visible approach, then a floor-supported stationary hold."""
    if not all(math.isfinite(v) and v > 0 for v in (fps, width, height)):
        raise ValueError('Expected positive finite dimensions and FPS')
    radius = 4 * height / 720
    hold = max(3, math.ceil(.2 * fps))
    approach = max(3, math.ceil(.15 * fps))
    events, last = [], -math.inf
    for i, row in enumerate(rows):
        point = row['point']
        if row['frame'] != i or not math.isfinite(row['time']) or abs(row['time'] - i / fps) > .1 / fps:
            raise ValueError('Expected consecutive zero-based frame observations')
        if point is not None and (len(point) != 2 or not np.isfinite(point).all() or
                                  not (0 <= point[0] < width and 0 <= point[1] < height)):
            raise ValueError('Shuttle point outside image')
    for i in range(approach, len(rows) - hold + 1):
        row = rows[i]
        if row['time'] - last < .75 or row['point'] is None:
            continue
        window = rows[i-approach:i+hold]
        if any(r['point'] is None or r.get('reset') for r in window):
            continue
        point = np.asarray(row['point'])
        after = rows[i:i+hold]
        if not all(r['floor'] for r in after):
            continue
        if max(np.linalg.norm(np.asarray(r['point']) - point) for r in after) > radius:
            continue
        if np.linalg.norm(np.asarray(rows[i-approach]['point']) - point) < 3 * radius:
            continue
        # shortcut: a projected stop can be a held shuttle; require human impact review until depth/contact evidence exists.
        events.append({'frame': row['frame'], 'time': row['time'], 'point': row['point'],
                       'status': 'possible_landing', 'holdFrames': hold,
                       'floorScore': min(r['floorScore'] for r in after)})
        last = row['time']
    return events


def download():
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL, revision=REVISION, local_dir=MODEL_DIR,
                      allow_patterns=['config.json', 'preprocessor_config.json', '*.safetensors'])
    files = ['config.json', 'preprocessor_config.json', 'model.safetensors']
    hashes = {}
    for name in files:
        with (MODEL_DIR / name).open('rb') as source:
            hashes[name] = hashlib.file_digest(source, 'sha256').hexdigest()
    (MODEL_DIR / 'provenance.json').write_text(json.dumps({'model': MODEL, 'revision': REVISION, 'sha256': hashes}, indent=2))


def analyze(video, shuttle, output):
    import torch
    from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation
    from detect import digest
    from review_job import write_json
    started = time.perf_counter()
    if digest(video) != shuttle['video_sha256']:
        raise ValueError('Shuttle observations belong to another video')
    provenance = json.loads((MODEL_DIR / 'provenance.json').read_text())
    if provenance['model'] != MODEL or provenance['revision'] != REVISION:
        raise ValueError('Unexpected floor model provenance; download pinned model again')
    if set(provenance['sha256']) != {'config.json', 'preprocessor_config.json', 'model.safetensors'}:
        raise ValueError('Incomplete floor model provenance')
    for name, expected in provenance['sha256'].items():
        if name not in ('config.json', 'preprocessor_config.json', 'model.safetensors') or digest(MODEL_DIR / name) != expected:
            raise ValueError('Floor model checksum mismatch')
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    processor = AutoImageProcessor.from_pretrained(MODEL_DIR, local_files_only=True, use_fast=False)
    model = AutoModelForSemanticSegmentation.from_pretrained(MODEL_DIR, local_files_only=True, use_safetensors=True).to(device).eval()
    floor_id = model.config.label2id['floor']
    capture = cv2.VideoCapture(str(video))
    rows = []
    output.mkdir(parents=True, exist_ok=True)
    try:
        width, height, fps, count = [capture.get(k) for k in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT, cv2.CAP_PROP_FPS, cv2.CAP_PROP_FRAME_COUNT)]
        width, height, count = int(width), int(height), int(count)
        settings = shuttle['settings']
        if not capture.isOpened() or (width, height, count) != (settings['width'], settings['height'], len(shuttle['samples'])) or abs(fps-settings['fps']) > .001:
            raise ValueError('Video timing/dimensions do not match shuttle observations')
        with torch.inference_mode():
            for i, sample in enumerate(shuttle['samples']):
                if sample.get('source_frame', i) != i or not math.isfinite(sample['time_s']) or abs(sample['time_s'] - i/fps) > .1/fps:
                    raise ValueError('Expected consecutive zero-based shuttle frames')
                ok, frame = capture.read()
                if not ok:
                    raise ValueError('Video decode ended before shuttle observations')
                point = sample['xy_px']
                if point is not None and (len(point) != 2 or not np.isfinite(point).all() or not (0 <= point[0] < width and 0 <= point[1] < height)):
                    raise ValueError('Shuttle point outside image')
                logits = model(**processor(images=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), return_tensors='pt').to(device)).logits
                scores = logits.softmax(dim=1)[0, floor_id].cpu().numpy()
                labels = logits.argmax(dim=1)[0].cpu().numpy()
                mask = cv2.resize(((labels == floor_id) & (scores >= .6)).astype(np.uint8), (width, height), interpolation=cv2.INTER_NEAREST)
                floor_score = cv2.resize(scores, (width, height), interpolation=cv2.INTER_LINEAR)
                x, y = (min(width-1, round(point[0])), min(height-1, round(point[1]))) if point is not None else (0, 0)
                rows.append({'frame': i, 'time': sample['time_s'], 'point': point,
                             'reset': bool(sample.get('chunk_start')), 'floor': bool(point is not None and mask[y, x]),
                             'floorScore': float(floor_score[y, x]) if point is not None else 0.,
                             'floorFraction': float(mask.mean())})
                if i % max(1, round(fps)) == 0:
                    if not cv2.imwrite(str(output / f'mask-{i}.png'), mask * 255):
                        raise OSError('Cannot save floor mask')
                    overlay = frame.copy()
                    overlay[mask.astype(bool)] = (overlay[mask.astype(bool)] * .6 + np.array([40, 210, 70]) * .4).astype(np.uint8)
                    if point is not None: cv2.circle(overlay, (x, y), 5, (0, 0, 255), 2)
                    if not cv2.imwrite(str(output / f'floor-{i}.jpg'), overlay):
                        raise OSError('Cannot save floor diagnostic')
                    print(f'Floor {i+1}/{count}', flush=True)
    finally:
        capture.release()
    events = candidates(rows, fps, width, height)
    report = {'status': 'experimental', 'method': 'floor_overlap_and_stop', 'model': MODEL, 'revision': REVISION,
              'videoSha256': shuttle['video_sha256'], 'fps': fps, 'width': width, 'height': height,
              'settings': {'floorThreshold': .6, 'stationaryRadiusPx': 4*height/720, 'holdSeconds': .2, 'approachSeconds': .15},
              'candidates': events, 'measurements': {'frames': len(rows), 'floorOverlapFrames': sum(r['floor'] for r in rows),
              'meanFloorFraction': float(np.mean([r['floorFraction'] for r in rows])), 'seconds': time.perf_counter()-started, 'device': device},
              'reason': 'Floor overlap and a projected stop suggest a landing; neither proves ground contact. Missing detections do not count as landings.'}
    write_json(output / 'observations.json', {'videoSha256': shuttle['video_sha256'], 'rows': rows})
    write_json(output / 'results.json', report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--video', type=Path)
    parser.add_argument('--shuttle', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.download:
        download()
    else:
        if not all((args.video, args.shuttle, args.output)): parser.error('Supply video, shuttle and output')
        result = analyze(args.video, json.loads(args.shuttle.read_text(encoding='utf-8')), args.output)
        print(json.dumps({k: result[k] for k in ('status', 'candidates', 'measurements')}))
