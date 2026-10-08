"""Provisional rally intervals from court-player motion; no shuttle or winner inference."""
import argparse
import html
import json
import math
import os
from pathlib import Path

import numpy as np

from court import calibrate, project
from detect import digest


def motion(samples, corners, cuts, max_gap):
    if not math.isfinite(max_gap) or max_gap <= 0:
        raise ValueError('Maximum sample gap must be positive')
    matrix = calibrate(corners)
    previous, last_time = None, None
    result = []
    for sample in samples:
        time = sample['time_s']
        if not math.isfinite(time) or (last_time is not None and time <= last_time):
            raise ValueError('Detection times must be finite and increasing')
        reset = last_time is None or time - last_time > max_gap or any(last_time < c <= time for c in cuts)
        players = [[], []]
        for detection in sample['person_detections']:
            if not math.isfinite(detection['score']) or not 0 <= detection['score'] <= 1:
                raise ValueError('Invalid detection score')
            box = np.asarray(detection['box_xywh'], dtype=float)
            if box.shape != (4,) or not np.isfinite(box).all() or np.any(box[2:] <= 0):
                raise ValueError('Invalid detection box')
            x, y, w, h = box
            point = project(matrix, [x + w / 2, y + h], 'near')
            if -.1 <= point[0] <= 1.1 and -.1 <= point[1] <= 1.1:
                players[int(point[1] >= .5)].append((detection['score'], box))
        boxes = [max(side, key=lambda p: p[0])[1] if side else None for side in players]
        speed = None
        if not reset and previous is not None and all(b is not None for b in boxes + previous):
            # ponytail: one highest-score person per court half; replace with identities if crossing/officials matter.
            speed = max(float(np.linalg.norm((b[:2] + b[2:] / 2) - (p[:2] + p[2:] / 2))) /
                        ((b[3] + p[3]) / 2) / (time - last_time) for b, p in zip(boxes, previous))
        result.append({'time_s': time, 'motion_heights_per_s': speed, 'reset': reset,
                       'both_players_visible': all(b is not None for b in boxes)})
        previous, last_time = boxes, time
    return result


def separate(samples, end, threshold=.5, quiet_s=2., min_s=2.):
    if not all(math.isfinite(v) and v > 0 for v in (end, threshold, quiet_s, min_s)):
        raise ValueError('End and thresholds must be finite and positive')
    rallies, start, last_active, quiet_start, previous = [], None, None, None, -1.

    def finish(stop, reason):
        if start is not None and stop - start >= min_s:
            rallies.append({'start_s': start, 'end_s': stop, 'end_reason': reason,
                            'outcome': 'unknown', 'review_status': 'provisional'})

    for sample in samples:
        time, speed = sample['time_s'], sample['motion_heights_per_s']
        if not math.isfinite(time) or not 0 <= time < end or time <= previous:
            raise ValueError('Motion times must increase within the clip')
        if speed is not None and (not math.isfinite(speed) or speed < 0):
            raise ValueError('Invalid motion speed')
        if sample['reset']:
            finish(previous, 'camera_cut_or_sample_gap')
            start = last_active = quiet_start = None
        if speed is None:
            # Unknown visibility cannot establish a quiet rally ending.
            quiet_start = None
        elif speed >= threshold:
            if start is None:
                start = time
            last_active, quiet_start = time, None
        elif start is not None:
            if quiet_start is None:
                quiet_start = time
            if time - quiet_start >= quiet_s - 1e-6:
                finish(last_active, 'low_player_motion')
                start = last_active = quiet_start = None
        previous = time
    finish(end, 'clip_end_unfinished')
    return rallies


def review_page(video, output, rallies):
    source = html.escape(Path(os.path.relpath(video.resolve(), output.resolve())).as_posix(), quote=True)
    buttons = ''.join(f'<button data-start="{r["start_s"]}" data-end="{r["end_s"]}">'
                      f'Candidate {i}: {r["start_s"]:.1f}–{r["end_s"]:.1f}s '
                      f'({r["end_reason"]})</button>\n' for i, r in enumerate(rallies, 1))
    return f'''<!doctype html><html lang="en"><meta charset="utf-8">
<title>ShuttleSense rally suggestions</title>
<style>body{{font:18px system-ui;max-width:1000px;margin:30px auto;background:#151b20;color:white}}
video{{width:100%}}button{{display:block;padding:12px;margin:8px 0;cursor:pointer}}</style>
<h1>Provisional rally suggestions</h1>
<p>Player motion only. Walking can trigger candidates; quiet play can be missed.
No winners inferred. Compare these intervals with the original clip.</p>
<video controls src="{source}"></video><div>{buttons or 'No candidates; inspect the original clip.'}</div>
<button id="full">Play full clip</button>
<script>
const video=document.querySelector('video'); let stop=Infinity;
document.querySelectorAll('[data-start]').forEach(button=>button.onclick=()=>{{
stop=Number(button.dataset.end); video.currentTime=Number(button.dataset.start);
video.play().catch(()=>{{}}); }});
video.ontimeupdate=()=>{{if(video.currentTime>=stop) video.pause();}};
document.querySelector('#full').onclick=()=>{{stop=Infinity;video.currentTime=0;video.play().catch(()=>{{}});}};
</script></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--detections', type=Path, required=True)
    parser.add_argument('--corners', type=float, nargs=8, required=True)
    parser.add_argument('--cuts', type=float, nargs='*', default=[])
    parser.add_argument('--motion', type=float, default=.5, help='Body heights per second')
    parser.add_argument('--quiet', type=float, default=2.)
    parser.add_argument('--minimum', type=float, default=2.)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        detections = json.loads(args.detections.read_text(encoding='utf-8-sig'))
        if digest(args.video) != detections['video_sha256']:
            raise ValueError('Detections belong to a different video')
        settings = detections['settings']
        if (not all(math.isfinite(settings[k]) for k in ('start_s', 'end_s', 'sample_hz'))
                or not 0 <= settings['start_s'] < settings['end_s'] or settings['sample_hz'] <= 0
                or not detections['samples']):
            raise ValueError('Expected a nonempty sampled clip with valid settings')
        if not all(math.isfinite(c) and settings['start_s'] < c < settings['end_s'] for c in args.cuts):
            raise ValueError('Cuts must lie inside the sampled clip')
        signals = motion(detections['samples'], np.array(args.corners).reshape(4, 2),
                         args.cuts, 1.5 / settings['sample_hz'])
        rallies = separate(signals, settings['end_s'], args.motion, args.quiet, args.minimum)
        report = {'version': 1, 'kind': 'provisional_motion_rallies',
                  'video_sha256': detections['video_sha256'], 'detections_sha256': digest(args.detections),
                  'settings': {**settings, 'corners_px': args.corners, 'manual_cuts_s': args.cuts,
                               'motion_heights_per_s': args.motion, 'quiet_s': args.quiet, 'minimum_s': args.minimum},
                  'accuracy': None, 'limitations': ['Player motion is not proof of a rally',
                  'Walking and detector jitter can trigger starts; quiet rallies can split',
                  'Manual cuts; fixed court view only; no shuttle evidence or winner inference'],
                  'rallies': rallies, 'samples': signals}
        args.output.mkdir(parents=True, exist_ok=False)
        (args.output / 'results.json').write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
        (args.output / 'review.html').write_text(review_page(args.video, args.output, rallies), encoding='utf-8')
        print(json.dumps(rallies, indent=2))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'Rally detection failed: {error}\n')


if __name__ == '__main__':
    main()
