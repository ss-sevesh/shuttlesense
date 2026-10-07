"""One runnable motion-rule check; no model required."""
import numpy as np
from foot_motion import shoe_speeds, score_rows


def main():
    positions = np.array([[[10,20],[30,40]],[[10,20],[32,40]],[[10,20],[35,40]]],dtype=float)
    np.testing.assert_allclose(shoe_speeds(positions,[1,1.1,1.2],100),[0,.3])
    assert shoe_speeds([None,positions[1],positions[2]],[1,1.1,1.2],100) is None
    rows = [{'reviewed_contact_status':s,'shoe_speeds':v} for s,v in
            [('both_grounded',[.1,.2]),('one_grounded',[.1,.8]),('airborne',[.1,.1]),
             ('both_grounded',[.8,.8]),('uncertain',[0,0]),('occluded',[0,0]),('one_grounded',None)]]
    assert score_rows(rows,.3) == dict(tp=1,fp=1,tn=1,fn=1,abstain=1,excluded=2)
    for times,height in [([1,1,1.2],100),([1,1.1,.9],100),([1,1.1,1.5],100),([1,1.1,1.2],0)]:
        try:
            shoe_speeds(positions,times,height)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid timing/height accepted')
    print('Motion, missing context, invalid timing, excluded labels and false contact checks passed.')


if __name__ == '__main__':
    main()
