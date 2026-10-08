"""Small geometry check for the local upload demo."""
import numpy as np
from court import calibrate
from upload_demo import mapped_people

matrix = calibrate([[0, 0], [100, 0], [100, 100], [0, 100]])
result = mapped_people([
    {'box_xywh': [40, 60, 10, 20]},
    {'box_xywh': [40, 10, 10, 20]},
    {'box_xywh': [120, 10, 10, 20]},
    {'box_xywh': [-5, 10, 20, 20]},
], matrix, 100, 100)
assert [person['side'] for person in result] == ['near', 'far', 'far']
assert np.allclose(result[0]['court'], [.45, .8])
assert np.allclose(result[2]['box'], [0, .1, .15, .2])
try:
    calibrate([[0, 0], [100, 100], [100, 0], [0, 100]])
except ValueError:
    pass
else:
    raise AssertionError('Crossed court corners must be rejected')
print('Upload mapping checks passed')
