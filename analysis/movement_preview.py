"""Coarse box-bottom occupancy preview, not measured ground contact."""
import argparse
import json
from pathlib import Path

import numpy as np

from court import calibrate, project
from detect import digest


def occupancy(tracks, corners, start, end, fps, side):
    if not np.isfinite([start, end, fps]).all() or start < 0 or end <= start or not 0 < fps <= 240:
        raise ValueError('Expected a finite interval and FPS in (0, 240]')
    settings = tracks['settings']
    if start < settings['start_s'] - 1e-6 or end > settings['end_s'] + 1e-6:
        raise ValueError('Preview must stay inside one tracked camera segment')
    matrix = calibrate(corners)
    grid = np.zeros((8, 6))
    outside, proposals, previous = 0., 0, -1.
    for sample in tracks['samples']:
        time = sample['time_s']
        if not np.isfinite(time) or time <= previous:
            raise ValueError('Tracker timestamps must be finite and strictly increasing')
        previous = time
        if time < start - 1e-6 or time >= end:
            continue
        if abs((time - start) * fps - round((time - start) * fps)) > 1e-4:
            raise ValueError('Sample timing does not match the declared FPS')
        if (not sample['proposal_available'] or sample.get('manual_reseed_required') or
                sample.get('identity_verified') is False):
            continue
        box = np.asarray(sample['proposed_box_xywh'], dtype=float)
        if box.shape != (4,) or not np.isfinite(box).all() or np.any(box[2:] <= 0):
            raise ValueError('Expected a finite positive xywh box')
        x, y, w, h = box
        point = project(matrix, [x + w / 2, y + h], side)
        seconds = min(1 / fps, end - time)
        proposals += 1
        # ponytail: coarse box-bottom proxy includes jump bias; replace only if precise contacts become necessary.
        if np.any(point < 0) or np.any(point > 1):
            outside += seconds
        else:
            column, row = np.minimum((point * [6, 8]).astype(int), [5, 7])
            grid[row, column] += seconds
    mapped = float(grid.sum())
    missing = end - start - mapped - outside
    if missing < -1e-6:
        raise ValueError('Sample durations exceed the interval')
    return {'version': 1, 'kind': 'approximate_box_movement', 'player_id': tracks['player_id'],
            'start_s': start, 'end_s': end, 'fps': fps, 'side': side,
            'grid_seconds': grid.tolist(), 'mapped_s': mapped, 'outside_s': outside,
            'missing_s': max(0., missing), 'proposal_samples': proposals,
            'contact_verified': False, 'identity_accuracy': None,
            'limitations': ['Box-bottom projection is approximate and includes raised-foot bias',
                            'Single reviewed camera segment; no measured contact or coaching claim']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tracks', type=Path, required=True)
    parser.add_argument('--corners', type=float, nargs=8, required=True)
    parser.add_argument('--start', type=float, required=True)
    parser.add_argument('--end', type=float, required=True)
    parser.add_argument('--fps', type=float, required=True)
    parser.add_argument('--side', choices=['near', 'far'], required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        tracks = json.loads(args.tracks.read_text(encoding='utf-8-sig'))
        result = occupancy(tracks, np.array(args.corners).reshape(4, 2),
                           args.start, args.end, args.fps, args.side)
        result.update(tracks_sha256=digest(args.tracks), video_sha256=tracks['video_sha256'],
                      corners_px=np.array(args.corners).reshape(4, 2).tolist())
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open('x', encoding='utf-8') as file:
            json.dump(result, file, indent=2, allow_nan=False)
        print(json.dumps({k: v for k, v in result.items() if k != 'grid_seconds'}, indent=2))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'Movement preview failed: {error}\n')


if __name__ == '__main__':
    main()
