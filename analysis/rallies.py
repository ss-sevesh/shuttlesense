"""Provisional rallies from court-player motion and optional raw shuttle evidence."""
import argparse
import html
import json
import math
import os
from pathlib import Path

import numpy as np

from court import calibrate, project
from detect import digest
from video_edits import inspect_video


def shuttle_evidence(signals, report):
    """Attach recent observed shuttle motion; never fill missed detections."""
    settings = report['settings']
    if (not all(math.isfinite(settings[k]) for k in ('start_s', 'end_s', 'fps'))
            or not 0 <= settings['start_s'] < settings['end_s'] or settings['fps'] <= 0
            or not report['samples']):
        raise ValueError('Expected a nonempty raw shuttle clip with valid timing')
    raw, index, last_visible, previous, recent = report['samples'], 0, None, None, []
    last_time = -1.
    for sample in raw:
        time, point = sample['time_s'], sample['xy_px']
        if sample.get('inpainted', False):
            raise ValueError('Use raw detections for missing-shuttle evidence, not inpainted positions')
        if not math.isfinite(time) or time <= last_time or not settings['start_s'] - 1e-6 <= time < settings['end_s']:
            raise ValueError('Invalid shuttle sample timing')
        if last_time >= 0 and time - last_time > 1.5 / settings['fps']:
            raise ValueError('Shuttle inference gaps cannot count as missing detections')
        if point is not None and (len(point) != 2 or not np.isfinite(point).all()):
            raise ValueError('Invalid shuttle point')
        last_time = time
    if (raw[0]['time_s'] - settings['start_s'] > 1.5 / settings['fps'] or
            settings['end_s'] - raw[-1]['time_s'] > 1.5 / settings['fps']):
        raise ValueError('Shuttle samples must cover the declared clip')
    result = []
    for signal in signals:
        time = signal['time_s']
        if not settings['start_s'] - 1e-6 <= time < settings['end_s']:
            continue
        while index < len(raw) and raw[index]['time_s'] <= time + 1e-6:
            sample = raw[index]
            point, timestamp = sample['xy_px'], sample['time_s']
            if point is not None:
                if previous is not None and timestamp - previous[0] <= 1.5 / settings['fps']:
                    speed = float(np.linalg.norm(np.array(point) - previous[1])) / (timestamp - previous[0])
                    if speed >= 50:
                        recent.append(timestamp)
                last_visible = timestamp
            previous = (timestamp, np.array(point)) if point is not None else None
            index += 1
        recent = [t for t in recent if t >= time - .2 - 1e-6]
        result.append({**signal, 'shuttle_moving': bool(recent),
                       'shuttle_missing_s': time - last_visible if last_visible is not None else time - settings['start_s']})
    return result


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
        edits = [] if last_time is None else [c for c in cuts if last_time < c <= time]
        reset = last_time is None or time - last_time > max_gap or bool(edits)
        players = [[], []]
        for detection in sample['person_detections'] if sample.get('court_view', True) else []:
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
        speed = floor_speed = None
        if not reset and previous is not None and all(b is not None for b in boxes + previous):
            # ponytail: one highest-score person per court half; replace with identities if crossing/officials matter.
            speed = max(float(np.linalg.norm((b[:2] + b[2:] / 2) - (p[:2] + p[2:] / 2))) /
                        ((b[3] + p[3]) / 2) / (time - last_time) for b, p in zip(boxes, previous))
            floor_speed = max(float(np.linalg.norm((b[:2]+[b[2]/2,b[3]])-(p[:2]+[p[2]/2,p[3]]))) /
                              ((b[3]+p[3])/2)/(time-last_time) for b,p in zip(boxes,previous))
        result.append({'time_s': time, 'motion_heights_per_s': speed, 'reset': reset,
                       'floor_motion_heights_per_s': floor_speed,
                       'reset_at_s': min(edits) if edits else last_time,
                       'court_view': sample.get('court_view', True),
                       'both_players_visible': all(b is not None for b in boxes),
                       'players_box_xywh': [b.tolist() if b is not None else None for b in boxes],
                       'players_court_xy': [project(matrix, [b[0]+b[2]/2, b[1]+b[3]], 'near').tolist()
                                            if b is not None else None for b in boxes]})
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
            finish(sample.get('reset_at_s', previous), 'camera_cut_or_sample_gap')
            start = last_active = quiet_start = None
        if speed is None:
            # Unknown visibility cannot establish a quiet rally ending.
            quiet_start = None
        elif speed >= threshold:
            if start is None and sample.get('shuttle_moving', True):
                start = time
            last_active, quiet_start = time, None
        elif start is not None:
            if quiet_start is None:
                quiet_start = time
            if time - quiet_start >= quiet_s - 1e-6 and sample.get('shuttle_missing_s', math.inf) >= 2 - 1e-6:
                finish(last_active, 'low_player_motion_and_missing_shuttle' if 'shuttle_missing_s' in sample else 'low_player_motion')
                start = last_active = quiet_start = None
        previous = time
    finish(end, 'clip_end_unfinished')
    return rallies


def review_page(video, output, rallies):
    source = html.escape(Path(os.path.relpath(video.resolve(), output.resolve())).as_posix(), quote=True)
    endings = {'camera_cut_or_sample_gap': 'video edit or recording gap',
               'low_player_motion_and_missing_shuttle': 'players slowed down and shuttle was missing',
               'low_player_motion': 'players slowed down', 'clip_end_unfinished': 'unfinished at clip end'}
    buttons = ''.join(f'<button data-start="{r["start_s"]}" data-end="{r["end_s"]}">'
                      f'Possible rally {i}: {r["start_s"]:.1f}–{r["end_s"]:.1f}s '
                      f'({endings[r["end_reason"]]})</button>\n' for i, r in enumerate(rallies, 1))
    return f'''<!doctype html><html lang="en"><meta charset="utf-8">
<title>ShuttleSense rally suggestions</title>
<style>body{{font:18px system-ui;max-width:1000px;margin:30px auto;background:#151b20;color:white}}
video{{width:100%}}button{{display:block;padding:12px;margin:8px 0;cursor:pointer}}</style>
<h1>Provisional rally suggestions</h1>
<p>These are possible rallies, found using player movement and optional video-edit checks.
Starts and ends need review. Walking can trigger a start; no winners are inferred.</p>
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
    parser.add_argument('--shuttle', type=Path, help='Raw TrackNet report; limits suggestions to its clip')
    parser.add_argument('--view-reference', type=float, help='Time showing the fixed full court')
    parser.add_argument('--landmarks', type=int, nargs=12, help='Six visible floor-line intersections, x y')
    parser.add_argument('--cut-change', type=float, default=.055, help='Changed court pixel fraction for an edit')
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
        corners = np.array(args.corners).reshape(4, 2)
        samples, edits = detections['samples'], []
        if (args.view_reference is None) != (args.landmarks is None):
            raise ValueError('Supply both --view-reference and --landmarks for automatic edits')
        if args.view_reference is not None:
            samples, edits = inspect_video(args.video, samples, corners, args.view_reference,
                                           np.array(args.landmarks).reshape(6, 2), args.cut_change)
        signals = motion(samples, corners, args.cuts + [e['time_s'] for e in edits],
                         1.5 / settings['sample_hz'])
        shuttle = None
        if args.shuttle:
            shuttle = json.loads(args.shuttle.read_text(encoding='utf-8'))
            if shuttle['video_sha256'] != detections['video_sha256']:
                raise ValueError('Shuttle report belongs to a different source')
            span = shuttle['settings']
            if not settings['start_s'] <= span['start_s'] < span['end_s'] <= settings['end_s']:
                raise ValueError('Shuttle clip must lie inside the person-detection interval')
            signals = shuttle_evidence(signals, shuttle)
            settings = {**settings, 'start_s': span['start_s'], 'end_s': span['end_s']}
        rallies = separate(signals, settings['end_s'], args.motion, args.quiet, args.minimum)
        report = {'version': 1, 'kind': 'provisional_motion_rallies',
                  'video_sha256': detections['video_sha256'], 'detections_sha256': digest(args.detections),
                  'settings': {**settings, 'corners_px': args.corners, 'manual_cuts_s': args.cuts,
                               'motion_heights_per_s': args.motion, 'quiet_s': args.quiet, 'minimum_s': args.minimum,
                               'view_reference_s': args.view_reference, 'landmarks_px': args.landmarks,
                               'cut_changed_fraction': args.cut_change},
                  'accuracy': None, 'limitations': ['Player motion is not proof of a rally',
                  'Walking and detector jitter can trigger starts; quiet rallies can split',
                  'Fixed court view only; edit heuristic needs review; no winner inference'],
                  'shuttle_sha256': digest(args.shuttle) if args.shuttle else None,
                  'shuttle_rule': {'moving_px_per_s': 50, 'recent_motion_s': .2, 'missing_end_s': 2} if shuttle else None,
                  'video_edits': edits, 'rallies': rallies, 'samples': signals}
        args.output.mkdir(parents=True, exist_ok=False)
        (args.output / 'results.json').write_text(json.dumps(report, indent=2, allow_nan=False), encoding='utf-8')
        (args.output / 'review.html').write_text(review_page(args.video, args.output, rallies), encoding='utf-8')
        print(json.dumps(rallies, indent=2))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'Rally detection failed: {error}\n')


if __name__ == '__main__':
    main()
