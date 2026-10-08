"""Local upload demo: sampled person boxes and approximate court occupancy."""
import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

from court import calibrate, project
from detect import prepare, people


def ordered_corners(corners):
    """Upright court view: two far corners above the two near corners."""
    points = np.asarray(corners, dtype=float).reshape(4, 2)
    rows = points[np.argsort(points[:, 1])]
    far = rows[:2][np.argsort(rows[:2, 0])]
    near = rows[2:][np.argsort(rows[2:, 0])[::-1]]
    return np.concatenate([far, near])


def mapped_people(detections, matrix, width, height):
    result = []
    for item in detections:
        x, y, w, h = item['box_xywh']
        point = project(matrix, [x + w / 2, y + h], 'near')
        if not np.all((point >= 0) & (point <= 1)):
            continue
        left, top, right, bottom = max(0., x), max(0., y), min(width, x+w), min(height, y+h)
        if right <= left or bottom <= top:
            continue
        result.append({'box': [left/width, top/height, (right-left)/width, (bottom-top)/height],
                       'court': point.tolist(), 'side': 'near' if point[1] >= .5 else 'far'})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--corners', type=float, nargs=8, required=True)
    args = parser.parse_args()
    corners = np.asarray(args.corners).reshape(4, 2)
    if not np.isfinite(corners).all() or np.any(corners < 0) or np.any(corners > 1):
        parser.error('Court corners must be inside the picture')
    corners = ordered_corners(corners)
    capture = cv2.VideoCapture(str(args.video))
    try:
        if not capture.isOpened():
            raise ValueError('Cannot decode this video')
        fps = capture.get(cv2.CAP_PROP_FPS)
        duration = capture.get(cv2.CAP_PROP_FRAME_COUNT) / fps if fps else 0
        if not math.isfinite(duration) or duration <= 0 or not 0 < fps <= 120:
            raise ValueError('Invalid video timing')
        # ponytail: bounded CPU demo; use a background job before analyzing full matches.
        end, sample_hz = min(30., duration), min(5., fps)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        session = ort.InferenceSession('data/models/yolox_tiny.onnx', options, providers=['CPUExecutionProvider'])
        model_input = session.get_inputs()[0]
        if model_input.shape != [1, 3, 416, 416]:
            raise ValueError('Unexpected player detector')
        samples, next_time, matrix, previous = [], 0., None, -1.
        while True:
            ok, frame = capture.read()
            if not ok:
                if previous + 1 / fps < end - 1e-3:
                    raise ValueError('Video decoding stopped early')
                break
            timestamp = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if not math.isfinite(timestamp) or timestamp <= previous:
                raise ValueError('Invalid video timestamps')
            previous = timestamp
            if timestamp >= end - 1e-6:
                break
            height, width = frame.shape[:2]
            if width * height > 3840 * 2160:
                raise ValueError('Use a video no larger than 4K')
            if matrix is None:
                matrix = calibrate(corners * [width, height], min_area_px2=width*height*.01)
            if timestamp + 1e-6 < next_time:
                continue
            tensor, ratio = prepare(frame, 416)
            boxes = people(session.run(None, {model_input.name: tensor})[0], 416, ratio)
            samples.append({'time': timestamp, 'people': mapped_people(boxes, matrix, width, height)})
            next_time += 1 / sample_hz
        if not samples:
            raise ValueError('No readable frames')
        print(json.dumps({'duration': duration, 'analyzedSeconds': end, 'sampleHz': sample_hz,
                          'width': width, 'height': height, 'samples': samples}, allow_nan=False))
    finally:
        capture.release()


if __name__ == '__main__':
    main()
