"""Exercise retries, cached answers and inference failure without loading weights."""
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import cv2
import numpy as np

from shot_coach import coach, MODEL, REVISION


class Batch(dict):
    def to(self, *args, **kwargs): return self


class CoachTests(unittest.TestCase):
    def test_retries_cache_and_failure_preserve_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'frames').mkdir()
            for frame in range(5): cv2.imwrite(str(root / 'frames' / f'{frame}.jpg'), np.zeros((16, 16, 3), dtype=np.uint8))
            (root / 'provenance.json').write_text(json.dumps({'model': MODEL, 'revision': REVISION, 'sha256': {}}))
            hit = {'side': 'near', 'track_id': 1, 'play_status': 'end_uncertain_review',
                   'contact': {'frame': 2, 'frames': list(range(5)), 'status': 'estimated', 'measurements': {'elbow': 123, 'racketFace': None}}}
            report = {'fps': 30, 'hits': [hit]}
            (root / 'fused.json').write_text(json.dumps(report))
            answer = {'shotType': 'smash', 'visibleEvidence': 'Arm visible', 'uncertainty': 'Timing uncertain', 'coaching': 'Watch the follow-through.'}
            processor = MagicMock()
            processor.return_value = Batch(input_ids=np.array([[1, 2]]))
            processor.batch_decode.side_effect = [['not JSON'], ['{}'], [json.dumps(answer)]]
            model = MagicMock()
            model.to.return_value = model
            model.eval.return_value = model
            model.generate.return_value = np.array([[1, 2, 3]])
            auto = MagicMock()
            auto.from_pretrained.return_value = model
            auto_processor = MagicMock()
            auto_processor.from_pretrained.return_value = processor
            fake_torch = SimpleNamespace(bfloat16='bf16', inference_mode=MagicMock())
            fake_transformers = SimpleNamespace(AutoProcessor=auto_processor, AutoModelForImageTextToText=auto)
            with patch.dict('sys.modules', {'torch': fake_torch, 'transformers': fake_transformers}), patch('shot_coach.MODEL_DIR', root):
                coach(root)
                saved = json.loads((root / 'fused.json').read_text())['hits'][0]
                self.assertEqual(saved['contact'], hit['contact'])
                self.assertEqual(saved['coaching']['status'], 'experimental')
                self.assertEqual(saved['coaching']['answer']['shotType'], 'unknown')
                self.assertEqual(model.generate.call_count, 3)
                coach(root)
                self.assertEqual(model.generate.call_count, 3)
                cache = next((root / 'coaching').glob('*.json'))
                cache.write_text('{broken')
                model.generate.side_effect = RuntimeError('GPU failed')
                coach(root)
                saved = json.loads((root / 'fused.json').read_text())['hits'][0]
                self.assertEqual(saved['coaching']['status'], 'unavailable')
                self.assertEqual(saved['contact'], hit['contact'])
                self.assertFalse((root / 'fused.tmp').exists())
                # Before-landing coaching uses a separate report and invalidates old prompt caches.
                landing = {'side': 'near', 'play_status': 'landing_unverified',
                           'landing': {'status': 'user_selected', 'landingFrame': 30, 'fps': 30, 'frames': list(range(5)), 'pose': []}}
                (root / 'landing.json').write_text(json.dumps({'fps': 30, 'hits': [landing]}))
                model.generate.side_effect = None
                processor.batch_decode.side_effect = None
                processor.batch_decode.return_value = [json.dumps(answer)]
                prior_calls = model.generate.call_count
                coach(root, landing=True)
                coached = json.loads((root / 'landing.json').read_text())['hits'][0]
                self.assertEqual(coached['coaching']['status'], 'experimental')
                self.assertEqual(coached['coaching']['answer']['shotType'], 'unknown')
                self.assertEqual(coached['coaching']['promptVersion'], 'before-landing-v2-loss-bounds')
                self.assertEqual(coached['landing'], landing['landing'])
                coach(root, landing=True)
                self.assertEqual(model.generate.call_count, prior_calls + 1)
                with patch('shot_coach.LANDING_PROMPT_VERSION', 'before-landing-v2'):
                    coach(root, landing=True)
                self.assertEqual(model.generate.call_count, prior_calls + 2)
                self.assertEqual(json.loads((root / 'fused.json').read_text())['hits'][0], saved)


if __name__ == '__main__': unittest.main()
