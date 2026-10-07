"""Test a stationary-shoe contact candidate; never outputs measured court positions."""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

from check_foot_review import validate_review
from detect import digest
from foot_pose import prepare_pose, decode_pose, foot_proxy


def shoe_speeds(shoes, times, height):
    """Max of before->centre and centre->after speeds, in box heights/second."""
    if any(shoe is None for shoe in shoes):
        return None
    positions, times = np.asarray(shoes), np.asarray(times)
    if (positions.shape != (3,2,2) or times.shape != (3,) or
            not np.isfinite(positions).all() or not np.isfinite(times).all() or
            not np.isfinite(height) or height <= 0):
        raise ValueError('Expected three finite shoe pairs, times and positive box height')
    intervals = np.diff(times)
    if np.any(intervals <= 0) or np.any(intervals > .2 + 1e-6):
        raise ValueError('Need ordered neighbouring frames within 0.2 seconds')
    return (np.linalg.norm(np.diff(positions,axis=0),axis=2) / intervals[:,None] / height).max(axis=0)


def score_rows(rows, threshold):
    counts = dict(tp=0,fp=0,tn=0,fn=0,abstain=0,excluded=0)
    for row in rows:
        status = row['reviewed_contact_status']
        if status in ('uncertain','occluded'):
            counts['excluded'] += 1
            continue
        if status not in ('both_grounded','one_grounded','airborne'):
            raise ValueError('Unknown reference contact status')
        speeds = row['shoe_speeds']
        if speeds is None:
            counts['abstain'] += 1
            continue
        positive, predicted = status == 'both_grounded', max(speeds) <= threshold
        counts['tp' if positive and predicted else 'fn' if positive else 'fp' if predicted else 'tn'] += 1
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet',type=Path,required=True)
    parser.add_argument('--review',type=Path,required=True)
    parser.add_argument('--tracks',type=Path,required=True)
    parser.add_argument('--model',type=Path,required=True)
    parser.add_argument('--split-frame',type=int,default=800)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    try:
        read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
        packet,review,tracks = read(args.packet),read(args.review),read(args.tracks)
        validate_review(review,packet,complete=True)
        if (packet['video_sha256'] != tracks['video_sha256'] or
                packet['selected_player'] != tracks['player_id']):
            raise ValueError('Source/player mismatch')
        args.output.mkdir(parents=True,exist_ok=False)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        session = ort.InferenceSession(str(args.model),options,providers=['CPUExecutionProvider'])
        if session.get_inputs()[0].shape[1:] != [3,256,192]:
            raise ValueError('Expected 192x256 pose model')
        rows,inputs = [],[]
        for sample in review['samples']:
            shoes,times,heights,context = [],[],[],[]
            for item in sample['context']:
                matches = [t for t in tracks['samples'] if abs(t['time_s']-item['time_s']) < 1e-6]
                if len(matches) != 1:
                    raise ValueError('Missing/ambiguous context tracker timestamp')
                track = matches[0]
                path = args.packet.parent/item['file']
                image = cv2.imread(str(path))
                if image is None or [image.shape[1],image.shape[0]] != packet['frame_size']:
                    raise ValueError('Invalid context image')
                inputs.append({'file':item['file'],'sha256':digest(path),'time_s':item['time_s']})
                proxy,height = None,None
                if track['proposal_available']:
                    tensor,center,scale = prepare_pose(image,track['proposed_box_xywh'])
                    points,responses = decode_pose(session.run(['simcc_x','simcc_y'],
                        {session.get_inputs()[0].name:tensor}),center,scale)
                    proxy = foot_proxy(points,responses,packet['frame_size'],.3)
                    height = track['proposed_box_xywh'][3]
                shoes.append(proxy)
                times.append(item['time_s'])
                heights.append(height)
                context.append({'time_s':item['time_s'],'shoes_px':None if proxy is None else proxy.tolist()})
            if len(shoes) != 3 or abs(times[1]-sample['time_s']) > 1e-6:
                raise ValueError('Expected before/centre/after context')
            speeds = shoe_speeds(shoes,times,heights[1])
            rows.append({'source_frame':sample['source_frame'], 'time_s':sample['time_s'],
                         'reviewed_contact_status':sample['contact_status'],
                         'shoe_speeds':None if speeds is None else speeds.tolist(),'context':context})
        tuning = [r for r in rows if r['source_frame'] < args.split_frame]
        checking = [r for r in rows if r['source_frame'] >= args.split_frame]
        if not tuning or not checking:
            raise ValueError('Split must leave tuning and checking samples')
        # ponytail: tiny motion-only baseline; replace if contact errors warrant a learned temporal model.
        trials = [{'threshold':i/10,'counts':score_rows(tuning,i/10)} for i in range(1,16)]
        best = min(trials,key=lambda t:(2*t['counts']['fp']+t['counts']['fn'],t['threshold']))
        threshold = best['threshold']
        for row in rows:
            row['stationary_pair_candidate'] = None if row['shoe_speeds'] is None else max(row['shoe_speeds']) <= threshold
        result = {'kind':'stationary_shoe_contact_candidate_experiment',
                  'model_sha256':digest(args.model),'review_sha256':digest(args.review),
                  'packet_sha256':digest(args.packet),'tracks_sha256':digest(args.tracks),
                  'reviewer':review['reviewer'],'split_frame':args.split_frame,
                  'threshold_box_heights_per_s':threshold,'threshold_selection':'minimise 2*FP+FN on earlier samples; lowest threshold breaks ties',
                  'raw_response_threshold':.3,'trials':trials,'tuning_counts':best['counts'],
                  'checking_counts':score_rows(checking,threshold), 'results':rows,'inputs':inputs,
                  'limitations':['Stationarity does not prove contact; no court position output',
                    'Same-camera same-video split, not untouched-clip or independent human validation',
                    'Future context is required; this is offline, not causal real-time contact detection',
                    'Uncertain/occluded labels are excluded from confusion counts, not treated as negatives']}
        (args.output/'results.json').write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
        print(json.dumps({k:v for k,v in result.items() if k not in ('inputs','results','trials')},indent=2))
        print('Frame, state, speeds, candidate:',[(r['source_frame'],r['reviewed_contact_status'],
              None if r['shoe_speeds'] is None else [round(v,3) for v in r['shoe_speeds']],
              r['stationary_pair_candidate']) for r in rows])
    except (OSError,ValueError,KeyError) as error:
        parser.exit(1,f'Motion experiment failed: {error}\n')


if __name__ == '__main__':
    main()
