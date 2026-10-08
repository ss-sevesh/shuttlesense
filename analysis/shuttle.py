"""Raw pretrained TrackNetV3 proposals on one short, edit-bounded court clip."""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import time

import cv2
import numpy as np
from PIL import Image
import torch

from detect import digest


def channels(rgb):
    return np.moveaxis(np.asarray(Image.fromarray(rgb).resize((512, 288))), -1, 0)


def location(heatmap, width, height):
    if heatmap.shape != (288, 512) or not np.isfinite(heatmap).all():
        raise ValueError('Expected a finite TrackNet heatmap')
    contours, _ = cv2.findContours((heatmap > .5).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    x, y, w, h = max((cv2.boundingRect(c) for c in contours), key=lambda b: b[2] * b[3])
    return [int(int(x + w / 2) * width / 512), int(int(y + h / 2) * height / 288)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--edits', type=Path, required=True, help='Existing edit-aware rally report')
    parser.add_argument('--start', type=float, required=True)
    parser.add_argument('--end', type=float, required=True)
    parser.add_argument('--model-dir', type=Path, default=Path('data/models/tracknetv3'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not all(math.isfinite(v) for v in (args.start, args.end)) or not 0 <= args.start < args.end or args.end - args.start > 15:
        parser.error('Choose one finite court segment lasting at most 15 seconds')
    edits = json.loads(args.edits.read_text(encoding='utf-8'))
    video_hash = digest(args.video)
    if edits['video_sha256'] != video_hash:
        parser.error('Edit report belongs to a different source')
    if any(args.start + 1e-6 < e['time_s'] < args.end - 1e-6 for e in edits['video_edits']):
        parser.error('Clip crosses an edit; choose a single court segment')
    sampled = [s for s in edits['samples'] if args.start <= s['time_s'] < args.end]
    if not sampled or not all(s.get('court_view') for s in sampled):
        parser.error('Clip must lie in a checked court-view interval')
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    torch.set_num_threads(4)
    checkpoint_path = args.model_dir / 'TrackNet_best.pt'
    checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
    parameters = checkpoint['param_dict']
    if parameters['seq_len'] != 8 or parameters['bg_mode'] != 'concat':
        parser.error('Expected official eight-frame RGB/background checkpoint')
    spec = importlib.util.spec_from_file_location('official_tracknet_model', args.model_dir / 'model.py')
    official = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(official)
    model = official.TrackNet(in_dim=27, out_dim=8).to(device).eval()
    model.load_state_dict(checkpoint['model'])
    capture = cv2.VideoCapture(str(args.video))
    frames, times, background_frames = [], [], []
    fps = capture.get(cv2.CAP_PROP_FPS)
    if not math.isfinite(fps) or fps <= 0:
        parser.error('Missing source FPS')
    capture.set(cv2.CAP_PROP_POS_FRAMES, max(0, math.floor(args.start * fps)))
    tick = time.perf_counter()
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                raise ValueError('Decode failed before requested clip end')
            timestamp = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if timestamp >= args.end - 1e-6:
                break
            if timestamp < args.start - 1e-6:
                continue
            if not math.isfinite(timestamp) or (times and timestamp <= times[-1]):
                raise ValueError('Missing or nonmonotonic source timestamps')
            height, width = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            if len(times) % max(1, round((args.end - args.start) * fps / 41)) == 0:
                background_frames.append(rgb)
            frames.append(channels(rgb))
            times.append(timestamp)
    finally:
        capture.release()
    if len(frames) < 8:
        parser.error('At least eight frames are needed')
    background = channels(np.median(background_frames, axis=0).astype(np.uint8))
    del background_frames
    # ponytail: short clip held in RAM; use a streaming window before processing full matches.
    sums = np.zeros((len(frames), 288, 512), dtype=np.float32)
    counts = np.zeros(len(frames), dtype=np.int32)
    infer_tick = time.perf_counter()
    with torch.inference_mode():
        for i in range(len(frames) - 7):
            tensor = np.concatenate([background, *frames[i:i+8]]).astype(np.float32)[None] / 255.
            predictions = model(torch.from_numpy(tensor).to(device)).cpu().numpy()[0]
            sums[i:i+8] += predictions
            counts[i:i+8] += 1
            if i % 60 == 0:
                print(f'TrackNet window {i+1}/{len(frames)-7} on {device}', flush=True)
    inference_s = time.perf_counter() - infer_tick
    samples = [{'time_s': t, 'source_frame': round(t * fps),
                'xy_px': location(sums[i] / counts[i], width, height), 'inpainted': False}
               for i, t in enumerate(times)]
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'version': 1, 'kind': 'raw_tracknet_shuttle_proposals', 'video_sha256': video_hash,
              'model_sha256': digest(checkpoint_path), 'model_source_sha256': digest(args.model_dir / 'model.py'),
              'official_provenance': json.loads((args.model_dir / 'provenance.json').read_text()),
              'settings': {'start_s': args.start, 'end_s': args.end, 'fps': fps, 'ensemble': 'average',
                           'heatmap_threshold': .5, 'background': 'sampled segment median', 'inpainting': False},
              'runtime': {'torch': torch.__version__, 'device': str(device),
                          'gpu': torch.cuda.get_device_name(0) if device.type == 'cuda' else None},
              'measurements': {'frames': len(samples), 'visible_proposals': sum(s['xy_px'] is not None for s in samples),
                               'inference_s': inference_s, 'decode_background_inference_s': time.perf_counter()-tick},
              'accuracy': None, 'limitations': ['Raw detections are unverified; missing is not a point ending',
                                               'Single tuning clip; no measured tracking or rally accuracy'],
              'samples': samples}
    (args.output / 'shuttle.json').write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
    capture = cv2.VideoCapture(str(args.video))
    capture.set(cv2.CAP_PROP_POS_FRAMES, samples[0]['source_frame'])
    writer = cv2.VideoWriter(str(args.output / 'overlay.mp4'), cv2.CAP_MSMF,
                            cv2.VideoWriter_fourcc(*'avc1'), fps, (width, height))
    try:
        if not writer.isOpened():
            raise OSError('Cannot create H.264 review video')
        for sample in samples:
            ok, frame = capture.read()
            if not ok:
                raise ValueError('Cannot decode overlay source')
            if sample['xy_px'] is not None:
                cv2.circle(frame, tuple(sample['xy_px']), 8, (0, 255, 255), 2)
            cv2.putText(frame, f"{sample['time_s']:.3f}s RAW TrackNet proposal", (20, height-20),
                        cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 255, 255), 2)
            writer.write(frame)
    finally:
        capture.release()
        writer.release()
    (args.output / 'review.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
<title>ShuttleSense shuttle tracking test</title>
<style>body{font:18px system-ui;max-width:1000px;margin:30px auto;background:#151b20;color:white}video{width:100%}</style>
<h1>Shuttle tracking test</h1><p>The yellow circle is a raw model proposal.
No circle means no shuttle detection. Positions need review; this does not identify the winner.</p>
<video controls src="overlay.mp4"></video></html>''', encoding='utf-8')
    print(json.dumps(report['measurements'], indent=2))


if __name__ == '__main__':
    main()
