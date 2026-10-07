"""One check for real occupancy accounting, orientation and gaps."""
from copy import deepcopy

from movement_preview import occupancy


def main():
    tracks = {'player_id': 'test', 'settings': {'start_s': 0, 'end_s': 5}, 'samples': [
        {'time_s': t, 'proposal_available': box is not None, 'proposed_box_xywh': box}
        for t, box in [(0, [10, 10, 10, 10]), (1, [10, 10, 10, 10]),
                       (2, None), (3, [120, 10, 10, 10])]]}
    corners = [[0, 0], [100, 0], [100, 100], [0, 100]]
    result = occupancy(tracks, corners, 0, 5, 1, 'near')
    assert result['mapped_s'] == 2 and result['outside_s'] == 1 and result['missing_s'] == 2
    assert result['grid_seconds'][1][0] == 2 and result['contact_verified'] is False
    assert occupancy(tracks, corners, 0, 5, 1, 'far')['grid_seconds'][6][5] == 2
    invalid = deepcopy(tracks)
    invalid['samples'][1]['time_s'] = 0
    try:
        occupancy(invalid, corners, 0, 5, 1, 'near')
    except ValueError:
        pass
    else:
        raise AssertionError('Duplicate timestamps accepted')
    print('PASS: occupancy duration, off-court exclusion, missing frames, orientation and duplicate rejection')


if __name__ == '__main__':
    main()
