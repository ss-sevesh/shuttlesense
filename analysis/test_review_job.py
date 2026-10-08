"""Check real report adaptation without invoking expensive model inference."""
import json
from pathlib import Path
import tempfile
from unittest.mock import patch, Mock
import cv2

from review_job import far_roi, review_data, write_json, inspect, shot_reason, CACHE

hit={'shot_status':'review_required','confidence':.25,'raw_shot_type':'clear','predicted_side':'near','side':'near'}
assert 'threshold' in shot_reason(hit) and 'side' not in shot_reason(hit)
hit.update(confidence=.8,predicted_side='far')
assert 'side' in shot_reason(hit)
hit.update(predicted_side=None,raw_shot_type='unknown')
assert 'unknown' in shot_reason(hit)

for width,height,fps in ((7680,4320,30),(832,464,240)):
    capture=Mock()
    capture.isOpened.return_value=True
    values={cv2.CAP_PROP_FRAME_WIDTH:width,cv2.CAP_PROP_FRAME_HEIGHT:height,cv2.CAP_PROP_FPS:fps,cv2.CAP_PROP_FRAME_COUNT:fps*10}
    capture.get.side_effect=values.__getitem__
    with patch('review_job.cv2.VideoCapture',return_value=capture):
        try: inspect(Path('test.mp4'),[.3,.2,.7,.2,.9,.9,.1,.9])
        except ValueError as error: assert '4K' in str(error)
        else: raise AssertionError('Oversized video was accepted')
    capture.release.assert_called_once()

roi=far_roi([[100,100],[300,100],[450,400],[20,400]],500,500)
assert all(isinstance(n,int) for n in roi) and roi[0]>=0 and roi[1]>=0
assert roi[0]+roi[2]<=500 and roi[1]+roi[3]<=500
assert roi[1]<=100 and roi[1]+roi[3]>=250
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory)/'status.json'
    write_json(path,{'stage':'Pose ready','progress':50})
    assert json.loads(path.read_text())['progress']==50
    assert not path.with_suffix('.tmp').exists()
if (CACHE/'players.json').exists():
    def load(name): return json.loads((CACHE/name).read_text(encoding='utf-8'))
    poses,shuttle,fused=load('players.json'),load('shuttle.json'),load('final-v2/results.json')
    data=review_data(poses,shuttle,fused,'test.mp4',True,'original-sha')
    assert len(data['analysisSha256'])==64
    assert review_data(poses,shuttle,fused,'renamed.mp4',True,'original-sha')['analysisSha256']==data['analysisSha256']
    changed=json.loads(json.dumps(fused)); changed['hits'][0]['time_s']+=.01
    assert review_data(poses,shuttle,changed,'test.mp4',True,'original-sha')['analysisSha256']!=data['analysisSha256']
    assert review_data(poses,shuttle,fused,'test.mp4',True,'different-sha')['analysisSha256']!=data['analysisSha256']
    changed_corners=json.loads(json.dumps(poses['settings']['corners_px'])); changed_corners[0][0]+=.5
    assert review_data(poses,shuttle,fused,'test.mp4',True,'original-sha',changed_corners)['analysisSha256']!=data['analysisSha256']
    assert data['duration']==320.5 and len(data['samples'])==4808
    assert len(data['shots'])==111 and sum(s['predictedType'] is not None for s in data['shots'])==23
    assert len(data['rallies'])==7 and all(r['end'] is None for r in data['rallies'])
    assert data['metrics']['shuttleDetected']==2403
    assert any(s['reason'].startswith('Player identity') for s in data['shots'])
    assert len(data['samples'][0]['people'][0]['landmarks'])==33
    assert 'measurements' in data['samples'][0]['people'][0]
    json.dumps(data,allow_nan=False)
print('Review job ROI, atomic JSON and available real-report adaptation passed.')
