import json
import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace
import numpy as np
from match_report import batches, parse_report, report_prompt, generate_answer


class ReportTests(unittest.TestCase):
    def test_all_events_and_time_bins_are_retained_in_bounded_batches(self):
        rally = {'hitPoses': list(range(39)), 'movement': {'timeline': list(range(74))}}
        parts = list(batches(rally))
        self.assertEqual([e for part in parts for e in part['hitPoses']], rally['hitPoses'])
        self.assertEqual([e for part in parts for e in part['movement']['timeline']], rally['movement']['timeline'])
        self.assertTrue(all(len(p['hitPoses']) <= 4 and len(p['movement']['timeline']) <= 8 for p in parts))

    def test_prompt_and_schema_do_not_claim_angle_based_intent_or_ground_impact(self):
        prompt = report_prompt({'rallyId': 3, 'angles': {'Left elbow': None}})
        self.assertIn('Body angles alone cannot establish shot intent', prompt)
        self.assertIn('Between-point walking/tossing is excluded', prompt)
        self.assertIn('null is unknown', prompt)
        with self.assertRaises(ValueError): parse_report('{}')
        with self.assertRaises(ValueError): parse_report(json.dumps(dict(summary='', observations='x', training='x', uncertainty='x')))
        answer = dict(summary='Clip only.', observations='Arm raised at 30.033 s. The elbow is 99.9 degrees.', training='Practice a split step.', uncertainty='Intent unknown.')
        self.assertEqual(parse_report(json.dumps(answer))['observations'], 'Arm raised at 30.033 s.')
        answer['observations'] = 'The elbow is 99.9 degrees.'
        with self.assertRaisesRegex(ValueError, 'only unsupported'): parse_report(json.dumps(answer))

    def test_short_sections_keep_complete_sentences_and_context_overflow_fails(self):
        class Batch(dict):
            def to(self, *args): return self
        processor = MagicMock()
        processor.return_value = Batch(input_ids=np.array([[1, 2]]))
        answer = dict(summary='Clip only.', observations='Arm raised at 30.033 s. Later at 31.567 s.', training='Consider split-step practice.', uncertainty='Intent unknown.')
        processor.batch_decode.side_effect = [[value+' Incomplete trailing'] for value in answer.values()]
        model = MagicMock(); model.generate.return_value = np.array([[1, 2, 3]])
        torch = SimpleNamespace(inference_mode=MagicMock())
        transformers = SimpleNamespace(StoppingCriteria=object, StoppingCriteriaList=list)
        with patch.dict('sys.modules', {'torch': torch,'transformers':transformers}):
            self.assertEqual(generate_answer(processor, model, {}), answer)
            self.assertEqual(model.generate.call_count, 4)
            processor.batch_decode.side_effect = [['Clip only.'],['The elbow is 99.9 degrees.'],['Arm raised at 30.033 s.'],['Practice a split step.'],['Intent unknown.']]
            requests = []
            rewritten = generate_answer(processor,model,{},request_log=requests)
            self.assertEqual(rewritten['observations'],'Arm raised at 30.033 s.')
            self.assertEqual(sum(bool(r.get('rewrite')) for r in requests),1)
            self.assertIn('Remove all numerical',requests[2]['systemPrompt'])
            self.assertNotIn('99.9 degrees',requests[2]['prompt'])
            processor.return_value = Batch(input_ids=np.zeros((1,16001)))
            with self.assertRaisesRegex(ValueError, 'no evidence was dropped'): generate_answer(processor, model, {})


if __name__ == '__main__': unittest.main()
