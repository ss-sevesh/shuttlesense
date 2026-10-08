"""Experimental pretrained BST-0 shot inference from tracked MediaPipe poses."""
import argparse
import bisect
import hashlib
import importlib
import json
import math
from pathlib import Path
import sys
import time

import numpy as np
from rallies import shuttle_evidence

COCO_FROM_MEDIAPIPE = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
BONES = [(0, 1), (0, 2), (1, 2), (1, 3), (2, 4), (3, 5), (4, 6),
         (5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (5, 11), (6, 12),
         (11, 12), (11, 13), (13, 15), (12, 14), (14, 16)]
SHOT_NAMES = ['net shot', 'defensive net shot', 'smash', 'lift', 'clear', 'drive',
              'drop', 'push', 'net kill', 'cross-court net shot', 'short serve', 'long serve']
RAW_NAMES = ['放小球', '擋小球', '殺球', '挑球', '長球', '平球', '切球', '推球',
             '撲球', '勾球', '發短球', '發長球']
WEIGHT_NAME = 'bst_0_JnB_bone_between_2_hits_with_max_limits_seq_100_merged_2.pt'
WEIGHT_SHA256 = 'c4d41bb8248f0f79f7a7182ac2b38ec021ef51edd4978dfa31d17291b530afc8'


def normalize_player(player):
    """Match the authors' bbox-diagonal, center-aligned 2D normalization."""
    points = np.asarray(player['keypoints_xy'], dtype=np.float32)
    scores = np.asarray(player['keypoint_scores'], dtype=np.float32)
    box = np.asarray(player['box_xywh'], dtype=np.float32)
    if points.shape != (33, 2) or scores.shape != (33,) or box.shape != (4,):
        raise ValueError('BST adapter requires 33 MediaPipe landmarks, scores and xywh box')
    court = np.asarray(player['court_xy'], dtype=np.float32)
    if court.shape != (2,) or not all(np.isfinite(a).all() for a in (points, scores, box, court)):
        raise ValueError('BST inputs must be finite and include normalized court coordinates')
    if min(box[2:]) <= 0:
        raise ValueError('Player box width and height must be positive')
    joints = points[COCO_FROM_MEDIAPIPE].copy()
    visible = scores[COCO_FROM_MEDIAPIPE] >= .5
    joints[~visible] = 0
    diagonal = np.linalg.norm(box[2:])
    # The official normalization subtracts the center even for zero coordinates.
    normalized = np.where(joints != 0, (joints - box[:2]) / diagonal, 0)
    normalized -= box[2:] / (2 * diagonal)
    return normalized, court, float(visible[5:].mean())


def fixed_length(joints, positions, shuttle, target=100):
    """Match make_seq_len_same: stride reduction and trailing zero padding."""
    count = len(positions)
    if count > target:
        need_padding = count % target > target // 2
        stride = count // target + int(need_padding)
        joints, positions, shuttle = (a[::stride][:target] for a in (joints, positions, shuttle))
    length = len(positions)
    pad = target - length
    return (np.pad(joints, ((0, pad), (0, 0), (0, 0), (0, 0))),
            np.pad(positions, ((0, pad), (0, 0), (0, 0))),
            np.pad(shuttle, ((0, pad), (0, 0))), length)


def prepare_window(samples, shuttle_samples, start, end, width, height, pose_tolerance=.075):
    pose_times = [s['time_s'] for s in samples]
    joints, positions, shuttle = [], [], []
    valid_frames = 0
    visibility = []
    track_ids = {'far': set(), 'near': set()}
    for raw in shuttle_samples:
        t = raw['time_s']
        if not start <= t < end:
            continue
        jp = np.zeros((2, 17, 2), dtype=np.float32)
        pp = np.zeros((2, 2), dtype=np.float32)
        sp = np.zeros(2, dtype=np.float32)
        i = bisect.bisect_left(pose_times, t)
        neighbors = [j for j in (i - 1, i) if 0 <= j < len(samples)]
        closest = min(neighbors, key=lambda j: abs(pose_times[j] - t)) if neighbors else None
        if closest is not None and abs(pose_times[closest] - t) <= pose_tolerance:
            tracked = samples[closest]['players']
            for player in tracked:
                track_ids[player['side']].add(player['track_id'])
            players = {p['side']: p for p in tracked if p.get('pose_detected', True)}
            if 'far' in players and 'near' in players:
                values = [normalize_player(players[side]) for side in ('far', 'near')]
                jp = np.stack([v[0] for v in values])
                pp = np.stack([v[1] for v in values])
                visibility.append(min(v[2] for v in values))
                valid_frames += 1
                if raw['xy_px'] is not None:
                    sp = np.asarray(raw['xy_px'], dtype=np.float32) / [width, height]
                    if not np.isfinite(sp).all():
                        raise ValueError('Shuttle positions must be finite')
        joints.append(jp)
        positions.append(pp)
        shuttle.append(sp)
    if not joints:
        return None
    # ponytail: MediaPipe is sampled at 15 fps then aligned to TrackNet's frame grid;
    # validate against MMPose before treating these predictions as reliable labels.
    joint_arr, pos_arr, shuttle_arr, length = fixed_length(
        np.stack(joints), np.stack(positions), np.stack(shuttle))
    bones = np.stack([np.where((joint_arr[:, :, a] != 0) & (joint_arr[:, :, b] != 0),
                              joint_arr[:, :, b] - joint_arr[:, :, a], 0)
                      for a, b in BONES], axis=-2)
    features = np.concatenate((joint_arr, bones), axis=-2).reshape(100, 2, 72)
    quality = {'two_player_fraction': valid_frames / len(joints),
               'body_visibility': float(np.mean(visibility)) if visibility else 0,
               'identity_switch': any(len(ids) > 1 for ids in track_ids.values()),
               'track_ids': {side: sorted(ids) for side, ids in track_ids.items()}}
    return features, pos_arr, shuttle_arr, length, quality


def classify_hits(poses_report, shuttle_report, hits, *, model_dir=Path('data/bst-official'), device='cuda'):
    if shuttle_report.get('kind') != 'raw_tracknet_shuttle_proposals':
        raise ValueError('Expected raw observed TrackNet positions')
    shuttle_evidence([],shuttle_report)
    import torch
    started = time.perf_counter()
    source_hash = poses_report['video_sha256']
    if source_hash != shuttle_report['video_sha256']:
        raise ValueError('Pose and shuttle reports belong to different videos')
    if device == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable; explicitly choose --device cpu')
    weight = model_dir / WEIGHT_NAME
    if hashlib.sha256(weight.read_bytes()).hexdigest() != WEIGHT_SHA256:
        raise ValueError('BST checkpoint does not match the tested official weight')
    sys.path.insert(0, str(model_dir.resolve()))
    try:
        architecture = importlib.import_module('model.bst').BST_0
    finally:
        sys.path.pop(0)
    net = architecture(in_dim=72, seq_len=100, n_class=25,
                       depth_tem=2, depth_inter=1).to(device)
    net.load_state_dict(torch.load(weight, weights_only=True, map_location=device), strict=True)
    net.eval()
    samples = poses_report['samples']
    raw_samples = shuttle_report['samples']
    if not samples or not raw_samples:
        raise ValueError('Pose and shuttle reports must contain samples')
    for stream in (samples, raw_samples):
        if any(not math.isfinite(s['time_s']) for s in stream) or any(
                b['time_s'] <= a['time_s'] for a, b in zip(stream, stream[1:])):
            raise ValueError('Samples must have finite strictly increasing timestamps')
    width, height = poses_report['width'], poses_report['height']
    if min(width, height) <= 0:
        raise ValueError('Video dimensions must be positive')
    shots = []
    ordered = sorted(hits, key=lambda h: h['time_s'])
    fps = shuttle_report['settings']['fps']
    for i, hit in enumerate(ordered):
        t = hit['time_s']
        if not math.isfinite(t):
            raise ValueError('Hit timestamps must be finite')
        previous = ordered[i - 1]['time_s'] if i else t - .5
        following = ordered[i + 1]['time_s'] if i + 1 < len(ordered) else t + .25
        start = max(previous, t - 1.5, raw_samples[0]['time_s'])
        end = min(following + .25, t + 1.75, raw_samples[-1]['time_s'] + 1 / fps)
        inputs = prepare_window(samples, raw_samples, start, end, width, height)
        result = {**hit, 'window_start_s': start, 'window_end_s': end,
                  'shot_type': 'unknown', 'shot_status': 'insufficient_tracking',
                  'confidence': None}
        if inputs is not None:
            features, positions, shuttle, length, quality = inputs
            result['input_quality'] = quality
            if quality['identity_switch']:
                result['shot_status'] = 'identity_switch'
            elif length >= 6 and quality['two_player_fraction'] >= .7 and quality['body_visibility'] >= .5:
                with torch.inference_mode():
                    tensors = [torch.as_tensor(a, device=device, dtype=torch.float32).unsqueeze(0)
                               for a in (features, shuttle)]
                    probabilities = torch.softmax(net(*tensors, torch.tensor([length], device=device)), dim=-1)[0].cpu()
                value, label_id = probabilities.max(0)
                label_id, score = int(label_id), float(value)
                side = 'far' if 1 <= label_id <= 12 else 'near' if label_id >= 13 else None
                shot = SHOT_NAMES[(label_id - 1) % 12] if label_id else 'unknown'
                raw_label = ('Top_' if side == 'far' else 'Bottom_') + RAW_NAMES[(label_id - 1) % 12] if label_id else '未知球種'
                accepted = label_id != 0 and score >= .5 and side == hit['side']
                result.update(confidence=score, raw_class_id=label_id, raw_label=raw_label,
                              raw_shot_type=shot, predicted_side=side,
                              shot_type=shot if accepted else 'unknown',
                              shot_status='experimental_prediction' if accepted else 'review_required')
        shots.append(result)
    return {'video_sha256': source_hash, 'shots': shots, 'elapsed_s': time.perf_counter() - started,
            'settings': {'model': 'official pretrained BST-0', 'device': device,
                         'checkpoint': WEIGHT_NAME, 'checkpoint_sha256': WEIGHT_SHA256,
                         'revision': 'fb9b310bf4c8a8e3d89c75e61bc06a7ac3de62df',
                         'sequence_length': 100, 'confidence_kind': 'uncalibrated softmax score',
                         'pose_adapter': 'MediaPipe33 to COCO17; experimental domain shift',
                         'modalities': ['pose joints and bones', 'shuttle trajectory'],
                         'minimum_score': .5, 'shot_classes': SHOT_NAMES}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('poses', 'shuttle', 'hits', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--model-dir', type=Path, default=Path('data/bst-official'))
    parser.add_argument('--device', choices=('cpu', 'cuda'), default='cuda')
    args = parser.parse_args()
    poses, shuttle, hits = [json.loads(p.read_text(encoding='utf-8'))
                           for p in (args.poses, args.shuttle, args.hits)]
    if hits['video_sha256'] != poses['video_sha256']:
        parser.error('Hit report belongs to a different source video')
    report = classify_hits(poses, shuttle, hits['hits'], model_dir=args.model_dir, device=args.device)
    report['input_sha256'] = {name: hashlib.sha256(path.read_bytes()).hexdigest()
                              for name, path in [('poses', args.poses), ('shuttle', args.shuttle), ('hits', args.hits)]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'shots': len(report['shots']), 'predictions': sum(s['confidence'] is not None for s in report['shots'])}))


if __name__ == '__main__':
    main()
