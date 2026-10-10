import unittest
from evidence_frame import allowed_frame


class EvidenceFrames(unittest.TestCase):
    def test_only_reported_contacts_and_exact_attempt_frames_are_authorized(self):
        data={'fps':30,'duration':10,'shots':[{'contact':None},{'contact':{'frames':[None,20,21]}}],
              'endingReview':[{'evidence':None},{'evidence':{'frame':200}}]}
        for frame in (20,21,200): self.assertTrue(allowed_frame(data,frame))
        for frame in (-1,0,199,201,300,True,20.0): self.assertFalse(allowed_frame(data,frame))
