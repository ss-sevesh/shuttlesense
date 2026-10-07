"""Run with python analysis/test_foot_pose.py; no model download required."""
import numpy as np
from foot_pose import prepare_pose, decode_pose, foot_proxy


def main():
    image = np.full((240,320,3), [10,20,30], dtype=np.uint8)
    tensor, center, scale = prepare_pose(image,[40,40,80,160])
    np.testing.assert_allclose(center,[80,120])
    np.testing.assert_allclose(scale,[150,200])
    np.testing.assert_allclose(tensor[0,:,128,96],
                               (np.array([30,20,10])-[123.675,116.28,103.53])/[58.395,57.12,57.375],rtol=1e-6)
    sx,sy = np.zeros((1,133,384)),np.zeros((1,133,512))
    sx[:,:,240],sy[:,:,320] = .8,.6
    points,scores = decode_pose((sx,sy),center,scale)
    np.testing.assert_allclose(points,np.tile([98.75,145],(133,1)))
    np.testing.assert_allclose(scores,.6)
    points[17:23] = [[10,20],[14,20],[12,26],[30,40],[34,40],[32,46]]
    np.testing.assert_allclose(foot_proxy(points,scores,[320,240],.3),[[12,22],[32,42]])
    scores[22] = .29
    assert foot_proxy(points,scores,[320,240],.3) is None
    scores[22] = .6
    points[17,0] = 320
    assert foot_proxy(points,scores,[320,240],.3) is None
    for box in ([0,0,0,10],[0,0,float('nan'),10],[1,2,3]):
        try:
            prepare_pose(image,box)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid box accepted')
    sx[0,0,0] = np.nan
    try:
        decode_pose((sx,sy),center,scale)
    except ValueError:
        pass
    else:
        raise AssertionError('Nonfinite output accepted')
    print('Foot pose RGB, aspect ratio, SimCC decoding, proxy and invalid-input checks passed.')


if __name__ == '__main__':
    main()
