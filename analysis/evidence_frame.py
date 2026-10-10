"""Decode only an authorized review frame, without running models."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile

from review_job import ROOT
from shot_coach import decode_frames


def allowed_frame(data, frame):
    return (type(frame) is int and 0 <= frame < round(data['duration'] * data['fps']) and
            (any(frame in (s.get('contact') or {}).get('frames', []) for s in data['shots']) or
             any(e.get('evidence') and e['evidence']['frame'] == frame for e in data.get('endingReview', []))))


def main(directory, frame):
    directory = directory.resolve()
    if directory.parent != (ROOT / 'data/analysis-jobs').resolve(): raise ValueError('Invalid job directory')
    data = json.loads((directory / 'result.json').read_text(encoding='utf-8'))
    if not allowed_frame(data, frame): raise ValueError('Frame is not review evidence')
    with (directory / 'source.mp4').open('rb') as video:
        if hashlib.file_digest(video, 'sha256').hexdigest() != data['videoSha256']:
            raise ValueError('Source video differs from analysis')
    output = directory / 'frames'
    output.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=directory) as temporary:
        decode_frames(directory / 'source.mp4', {frame}, Path(temporary))
        os.replace(Path(temporary) / f'{frame}.jpg', output / f'{frame}.jpg')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('frame', type=int)
    args = parser.parse_args()
    main(args.directory, args.frame)
