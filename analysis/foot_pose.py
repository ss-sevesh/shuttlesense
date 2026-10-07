"""Offline RTMPose foot-proxy experiment; contact states still require review."""
import argparse
import json
from pathlib import Path
import time

import cv2
import numpy as np
import onnxruntime as ort

from check_foot_review import validate_review
from court import calibrate, project, project_foot_midpoint
from detect import digest


def prepare_pose(image, box):
    """192x256 RGB crop: deployed pipeline's 1.25 padding and normalization."""
    box = np.asarray(box, dtype=np.float64)
    if box.shape != (4,) or not np.isfinite(box).all() or np.any(box[2:] <= 0):
        raise ValueError('Expected finite positive xywh player box')
    center = box[:2] + box[2:] / 2
    width, height = box[2:] * 1.25
    width, height = max(width, height * .75), max(height, width / .75)
    scale = np.array([width, height])
    factors = np.array([192, 256]) / scale
    affine = np.column_stack((np.diag(factors), [96,128] - center * factors))
    crop = cv2.warpAffine(image, affine, (192,256), flags=cv2.INTER_LINEAR)
    rgb = crop[:,:,::-1].astype(np.float32)
    tensor = (rgb - [123.675,116.28,103.53]) / [58.395,57.12,57.375]
    return np.ascontiguousarray(tensor.transpose(2,0,1)[None], dtype=np.float32), center, scale


def decode_pose(outputs, center, scale):
    """Official SimCC argmax, split ratio 2, minimum axis response score."""
    sx, sy = outputs
    if (sx.shape != (1,133,384) or sy.shape != (1,133,512) or
            not np.isfinite(sx).all() or not np.isfinite(sy).all()):
        raise ValueError('Expected finite 133-keypoint SimCC outputs')
    scores = np.minimum(sx.max(axis=2), sy.max(axis=2))[0]
    points = np.stack((sx.argmax(axis=2), sy.argmax(axis=2)), axis=-1)[0] / 2
    points = points / [192,256] * scale + center - scale / 2
    return points, scores


def foot_proxy(points, scores, size, threshold):
    feet = points[17:23]
    if (not np.isfinite(threshold) or not 0 < threshold < 1 or
            feet.shape != (6,2) or not np.isfinite(feet).all()):
        raise ValueError('Invalid foot landmarks or response threshold')
    if np.any(scores[17:23] < threshold) or np.any(feet < 0) or np.any(feet >= size):
        return None
    # ponytail: toe/toe/heel centroid is only a shoe proxy; add a contact estimator if evaluation warrants it.
    return feet.reshape(2,3,2).mean(axis=1)


def error_summary(values):
    return {'n': len(values), 'median_m': float(np.median(values)) if values else None,
            'p90_m': float(np.percentile(values,90)) if values else None,
            'max_m': max(values) if values else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet', type=Path, required=True)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--tracks', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--corners', type=float, nargs=8, required=True,
                        help='Far-left, far-right, near-right, near-left pixel coordinates')
    parser.add_argument('--score', type=float, default=.3, help='Raw response threshold, not contact confidence')
    parser.add_argument('--output', type=Path, required=True, help='New private directory')
    args = parser.parse_args()
    try:
        read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
        original, review, tracks = read(args.packet), read(args.review), read(args.tracks)
        counts = validate_review(review, original, complete=True)
        if (tracks['video_sha256'] != original['video_sha256'] or
                tracks['player_id'] != original['selected_player']):
            raise ValueError('Tracker source/player does not match packet')
        if not np.isfinite(args.score) or not 0 < args.score < 1:
            raise ValueError('Response threshold must be between zero and one')
        matrix = calibrate(np.array(args.corners).reshape(4,2))
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        session = ort.InferenceSession(str(args.model), options, providers=['CPUExecutionProvider'])
        if session.get_inputs()[0].shape[1:] != [3,256,192]:
            raise ValueError('Expected RTMPose 192x256 input')
        args.output.mkdir(parents=True, exist_ok=False)
        rows, pose_errors, box_errors, eligible_predictions = [], [], [], 0
        started = time.perf_counter()
        for blank, label in zip(original['samples'],review['samples']):
            frame = blank['source_frame']
            image_path = args.packet.parent / f'source-{frame:06d}.png'
            image = cv2.imread(str(image_path))
            if image is None or [image.shape[1],image.shape[0]] != original['frame_size']:
                raise ValueError(f'Invalid source image at frame {frame}')
            matches = [t for t in tracks['samples'] if abs(t['time_s']-blank['time_s']) < 1e-6]
            if len(matches) != 1:
                raise ValueError(f'Missing or ambiguous tracker timestamp at frame {frame}')
            track = matches[0]
            row = {'source_frame':frame, 'time_s':blank['time_s'], 'image_sha256':digest(image_path),
                   'reviewed_contact_status':label['contact_status'], 'proxy_shoes_px':None,
                   'court_midpoint_with_reviewed_contact_gate':None, 'error_m':None, 'box_error_m':None}
            if track['proposal_available']:
                box = track['proposed_box_xywh']
                tensor, center, scale = prepare_pose(image,box)
                tick = time.perf_counter()
                points,scores = decode_pose(session.run(['simcc_x','simcc_y'],
                    {session.get_inputs()[0].name:tensor}), center,scale)
                row.update(box_xywh=box, keypoints_px=points.tolist(), responses=scores.tolist(),
                           inference_s=time.perf_counter()-tick)
                shoes = foot_proxy(points,scores,original['frame_size'],args.score)
                row['proxy_shoes_px'] = None if shoes is None else shoes.tolist()
                if label['contact_status'] == 'both_grounded':
                    reference = project_foot_midpoint(matrix,label['shoes_px'],'near','both_grounded')
                    x,y,w,h = box
                    box_position = project(matrix,[x+w/2,y+h],'near')
                    row['box_error_m'] = float(np.linalg.norm((box_position-reference)*[5.18,13.4]))
                    box_errors.append(row['box_error_m'])
                    if shoes is not None:
                        position = project_foot_midpoint(matrix,shoes,'near','both_grounded')
                        row['court_midpoint_with_reviewed_contact_gate'] = position.tolist()
                        row['error_m'] = float(np.linalg.norm((position-reference)*[5.18,13.4]))
                        pose_errors.append(row['error_m'])
                        eligible_predictions += 1
                overlay = image.copy()
                cv2.rectangle(overlay,(round(box[0]),round(box[1])),
                              (round(box[0]+box[2]),round(box[1]+box[3])),(255,255,0),1)
                for point in points[17:23]:
                    cv2.circle(overlay,tuple(np.rint(point).astype(int)),3,(0,0,255),-1)
                if shoes is not None:
                    for point in shoes:
                        cv2.circle(overlay,tuple(np.rint(point).astype(int)),5,(0,255,255),1)
                for point in label['shoes_px'] or []:
                    cv2.circle(overlay,tuple(point),5,(0,255,0),1)
                cv2.putText(overlay,f'{frame} {label["contact_status"]}: red pose, yellow proxy, green assistant',
                            (20,690),cv2.FONT_HERSHEY_SIMPLEX,.6,(255,255,255),1)
                if not cv2.imwrite(str(args.output/f'frame-{frame:06d}.jpg'),overlay):
                    raise OSError('Cannot save overlay')
            rows.append(row)
        report = {'kind':'assistant_labeled_foot_proxy_experiment', 'model_sha256':digest(args.model),
                  'packet_sha256':digest(args.packet), 'review_sha256':digest(args.review),
                  'tracks_sha256':digest(args.tracks), 'reviewer':review['reviewer'],
                  'model':'RTMPose-m COCO+UBody wholebody c8b76419',
                  'settings':{'response_threshold':args.score,'threads':4,'corners_px':args.corners,
                              'proxy':'mean of big toe, small toe and heel per shoe; not detected contact'},
                  'independent_human_reference':False, 'automatic_contact_detection':False,
                  'contact_status_counts':counts, 'samples':len(rows),
                  'proxy_available_samples':sum(r['proxy_shoes_px'] is not None for r in rows),
                  'eligible_samples':counts['both_grounded'], 'eligible_proxy_samples':eligible_predictions,
                  'conditional_midpoint_error':error_summary(pose_errors),
                  'box_bottom_midpoint_error':error_summary(box_errors),
                  'wall_s':time.perf_counter()-started, 'results':rows,
                  'limitations':['Assistant reference only; no independent accuracy claim',
                    'Court positions use reviewed both-grounded states: contact gate is not automated',
                    'One tuning segment, unvalidated tracker identity and manual calibration',
                    'No held-out test, heatmap, coaching output or agreed acceptance gate']}
        (args.output/'results.json').write_text(json.dumps(report,indent=2,allow_nan=False),encoding='utf-8')
        print(json.dumps({k:v for k,v in report.items() if k != 'results'},indent=2))
    except (OSError,ValueError,KeyError) as error:
        parser.exit(1,f'Foot experiment failed: {error}\n')


if __name__ == '__main__':
    main()
