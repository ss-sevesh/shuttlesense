"""Bounded-memory TrackNetV3 average ensemble on a fixed-camera CFR video."""
import argparse
from collections import deque
import importlib.util
from itertools import islice
import json
import math
from pathlib import Path
import time

import cv2
import numpy as np


def average_windows(windows, predict, *, batch_size=4, sequence_length=8):
    """Finalize each frame after its last overlapping prediction, including the tail."""
    if batch_size < 1 or sequence_length < 1:
        raise ValueError('Batch and sequence lengths must be positive')
    pending = {}
    iterator = iter(windows)
    next_start = 0
    while batch := list(islice(iterator, batch_size)):
        indices = [entry[0] for entry in batch]
        if indices != list(range(next_start, next_start + len(batch))):
            raise ValueError('TrackNet windows must be consecutive from frame zero')
        predictions = np.asarray(predict([entry[1] for entry in batch]))
        if predictions.ndim != 4 or predictions.shape[:2] != (len(batch), sequence_length):
            raise ValueError('Expected one sequence of heatmaps per input window')
        if not np.isfinite(predictions).all():
            raise ValueError('TrackNet emitted nonfinite heatmaps')
        for start, result in zip(indices, predictions):
            for offset, heatmap in enumerate(result):
                index = start + offset
                if index in pending:
                    total, count = pending[index]
                    if total.shape != heatmap.shape:
                        raise ValueError('TrackNet heatmap dimensions changed')
                    total += heatmap
                    pending[index] = (total, count + 1)
                else:
                    pending[index] = (heatmap.astype(np.float32, copy=True), 1)
        next_start += len(batch)
        for index in range(indices[0], next_start):
            total, count = pending.pop(index)
            yield index, total / count
    if next_start == 0:
        raise ValueError('At least one complete TrackNet sequence is required')
    for index, (total, count) in sorted(pending.items()):
        yield index, total / count


def frame_windows(capture, background, channels, fps):
    frames = deque(maxlen=8)
    index = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        timestamp = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
        if not math.isfinite(timestamp) or abs(timestamp - index / fps) > .6 / fps:
            raise ValueError('Input must have zero-based constant-frame-rate timestamps; normalize first')
        frames.append(channels(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
        if len(frames) == 8:
            yield index - 7, np.concatenate([background, *frames])
        index += 1


def main():
    import torch
    from detect import digest
    from shuttle import channels, location

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--assume-unedited', action='store_true', required=True)
    parser.add_argument('--model-dir', type=Path, default=Path('data/models/tracknetv3'))
    parser.add_argument('--output', type=Path, required=True, help='Output shuttle.json file')
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--device', choices=('cuda', 'cpu'), default='cuda')
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error('Batch size must be positive')
    if args.device == 'cuda' and not torch.cuda.is_available():
        parser.error('CUDA unavailable; choose --device cpu explicitly')
    device = torch.device(args.device)
    torch.set_num_threads(4)
    started = time.perf_counter()
    source_hash = digest(args.video)
    checkpoint_path = args.model_dir / 'TrackNet_best.pt'
    checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
    parameters = checkpoint['param_dict']
    if parameters['seq_len'] != 8 or parameters['bg_mode'] != 'concat':
        parser.error('Expected official eight-frame RGB/background checkpoint')
    spec = importlib.util.spec_from_file_location('official_tracknet_model', args.model_dir / 'model.py')
    official = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(official)
    model = official.TrackNet(in_dim=27, out_dim=8).to(device).eval()
    model.load_state_dict(checkpoint['model'], strict=True)
    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        parser.error('Cannot open source video')
    fps = capture.get(cv2.CAP_PROP_FPS)
    count_value = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    if not math.isfinite(fps) or fps <= 0 or not math.isfinite(count_value) or count_value < 8:
        capture.release()
        parser.error('Missing source FPS/frame count or video shorter than eight frames')
    frame_count = round(count_value)
    width = round(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    background_samples = []
    try:
        for index in np.unique(np.linspace(0, frame_count - 1, min(41, frame_count), dtype=int)):
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
            ok, frame = capture.read()
            if not ok:
                raise ValueError('Cannot decode background sample')
            background_samples.append(channels(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
        # ponytail: median of resized frames bounds RAM; fixed-camera video only.
        background = np.median(np.stack(background_samples), axis=0).astype(np.uint8)
        del background_samples
        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
        inference_s = 0.

        def predict(windows):
            nonlocal inference_s
            tick = time.perf_counter()
            tensor = torch.from_numpy(np.stack(windows).astype(np.float32) / 255).to(device)
            with torch.inference_mode():
                predictions = model(tensor).cpu().numpy()
            inference_s += time.perf_counter() - tick
            return predictions

        samples = []
        for index, heatmap in average_windows(frame_windows(capture, background, channels, fps),
                                               predict, batch_size=args.batch_size):
            samples.append({'time_s': index / fps, 'source_frame': index,
                            'xy_px': location(heatmap, width, height), 'inpainted': False})
            if index % 300 == 0:
                print(f'TrackNet {index + 1}/{frame_count} frames on {device}; {time.perf_counter() - started:.1f}s', flush=True)
        if len(samples) != frame_count:
            raise ValueError(f'Decode ended early: expected {frame_count}, received {len(samples)}')
    finally:
        capture.release()
    report = {'version': 1, 'kind': 'raw_tracknet_shuttle_proposals', 'video_sha256': source_hash,
              'model_sha256': digest(checkpoint_path), 'model_source_sha256': digest(args.model_dir / 'model.py'),
              'official_provenance': json.loads((args.model_dir / 'provenance.json').read_text()),
              'settings': {'start_s': 0, 'end_s': frame_count / fps, 'fps': fps, 'width': width, 'height': height,
                           'ensemble': 'average', 'heatmap_threshold': .5, 'background': '41 uniform resized-frame median',
                           'inpainting': False, 'input_contract': 'fixed_camera_no_edits',
                           'streaming': True, 'batch_size': args.batch_size, 'temporal_seams': False},
              'runtime': {'torch': torch.__version__, 'device': str(device),
                          'gpu': torch.cuda.get_device_name(0) if device.type == 'cuda' else None},
              'measurements': {'frames': len(samples), 'visible_proposals': sum(s['xy_px'] is not None for s in samples),
                               'inference_s': inference_s, 'decode_background_inference_s': time.perf_counter() - started},
              'accuracy': None, 'limitations': ['Raw detections are unverified; missing is not a point ending',
                                               'Background median uses resized frames, unlike short-clip runner',
                                               'Requires zero-based CFR video and fixed camera without edits'],
              'samples': samples}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps(report['measurements']))


if __name__ == '__main__':
    main()
