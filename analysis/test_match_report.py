import json
import unittest
from unittest.mock import patch
from match_report import batches, fits, parse_report, messages, generate_answer, CONTEXT, OUTPUT_TOKENS


class Tokenizer:
    def apply_chat_template(self, rows, **kwargs):
        return list(range(len(json.dumps(rows))))


class ReportTests(unittest.TestCase):
    def test_context_splitting_preserves_every_event_and_bin(self):
        rally = {'hitPoses': [{'frame': i, 'angles': {'Left elbow': 110}, 'padding': 'x'*500} for i in range(39)],
                 'movement': {'timeline': [{'start': i, 'padding': 'x'*300} for i in range(74)]}}
        parts = list(batches(rally, Tokenizer()))
        self.assertGreater(len(parts), 1)
        self.assertEqual([e for p in parts for e in p['hitPoses']], rally['hitPoses'])
        self.assertEqual([e for p in parts for e in p['movement']['timeline']], rally['movement']['timeline'])
        self.assertTrue(all(fits(Tokenizer(), p) for p in parts))
        self.assertEqual(list(batches({'hitPoses': [], 'movement': {'timeline': []}}, Tokenizer())),
                         [{'hitPoses': [], 'movement': {'timeline': []}}])
        with self.assertRaisesRegex(ValueError, 'no evidence was dropped'):
            list(batches({'hitPoses': [], 'movement': {'timeline': []}, 'tooBig': 'x'*CONTEXT}, Tokenizer()))

    def test_schema_and_uncertainty_keep_measured_angles_in_appendix(self):
        prompt = messages({'angles': {'Left elbow': None}})
        self.assertIn('Body angles alone cannot establish shot intent', prompt[0]['content'])
        self.assertIn('Between-point walking/tossing is excluded', prompt[0]['content'])
        self.assertIn('null is unknown', prompt[0]['content'])
        self.assertIn('Never say lack of verified impact caused or classified the loss', prompt[0]['content'])
        self.assertIn('Only attribute a measurement to its own time', prompt[0]['content'])
        for bad in ('{}', json.dumps(dict(summary='', observations='x', training='x', uncertainty='x'))):
            with self.assertRaises(ValueError): parse_report(bad)
        answer = dict(summary='Clip only.', observations='Arm raised at 30.033 s. The elbow is 99.9 degrees.',
                      training='Practice a split step for two sets of six repetitions.', uncertainty='Intent unknown.')
        self.assertEqual(parse_report(json.dumps(answer))['observations'], 'Arm raised at 30.033 s.')
        answer['observations'] = 'The elbow is 99.9 degrees.'
        with self.assertRaisesRegex(ValueError, 'only unsupported'): parse_report(json.dumps(answer))

    def test_one_text_only_request_has_schema_and_timings_and_rejects_incomplete_output(self):
        answer = dict(summary='Clip only.', observations='Arm raised at 30.033 s.',
                      training='Practice a split step for two sets of six repetitions.', uncertainty='Intent unknown.')
        result = {'done': True, 'done_reason': 'stop', 'message': {'content': json.dumps(answer)},
                  'total_duration': 1000000000, 'prompt_eval_count': 400}
        log = []
        with patch('match_report.ollama', return_value=result) as call:
            self.assertEqual(generate_answer(Tokenizer(), {}, request_log=log), answer)
            call.assert_called_once()
            payload = call.call_args.args[1]
            self.assertTrue(all(set(m) == {'role', 'content'} and isinstance(m['content'], str) for m in payload['messages']))
            self.assertEqual(payload['format']['required'], list(answer))
            self.assertEqual(payload['keep_alive'], '5m')
            self.assertEqual(payload['options']['num_predict'], OUTPUT_TOKENS)
            self.assertEqual(log[0]['timings']['total_duration'], result['total_duration'])
            result['done_reason'] = 'length'
            with self.assertRaisesRegex(ValueError, 'incomplete'): generate_answer(Tokenizer(), {})
        with self.assertRaisesRegex(ValueError, 'no evidence was dropped'):
            generate_answer(Tokenizer(), {'oversize': 'x'*CONTEXT})

    def test_one_wording_correction_preserves_primary_measurements_and_rejects_second_failure(self):
        answer = dict(summary='User-marked loss.', observations='At 1.25 s, the arm is raised.',
                      training='Try two sets of six shadow-footwork repetitions.', uncertainty='Intent and impact unknown.')
        bad = {**answer, 'observations': 'The elbow is 99.9 degrees.'}
        response = lambda a: {'done': True, 'done_reason': 'stop', 'message': {'content': json.dumps(a)}}
        source = {'id': 3, 'outcome': 'lost', 'outcomeSource': 'user_marked',
                  'hitPoses': [{'time': 1.25, 'pose': 'Raised arm', 'angles': {'Left elbow': 110}}],
                  'movement': {'trackedSeconds': 1, 'timeline': [{'start': 1, 'end': 2, 'nearTracked': 1, 'nearPoses': 1, 'shuttleVisible': 2}]}}
        log = []
        with patch('match_report.ollama', side_effect=[response(bad), response(answer)]) as call:
            self.assertEqual(generate_answer(Tokenizer(), source, request_log=log), answer)
            self.assertEqual(call.call_count, 2)
            self.assertEqual([r['repair'] for r in log], [False, True])
            self.assertIn('"Left elbow":110', log[0]['request']['messages'][1]['content'])
            self.assertNotIn('"Left elbow":110', log[1]['request']['messages'][1]['content'])
            self.assertIn('"time":1.25', log[1]['request']['messages'][1]['content'])
            self.assertIn('"shuttleVisible":2', log[1]['request']['messages'][1]['content'])
        with patch('match_report.ollama', side_effect=[response(bad), response(bad)]) as call:
            with self.assertRaisesRegex(ValueError, 'after one correction'): generate_answer(Tokenizer(), source)
            self.assertEqual(call.call_count, 2)
        with self.assertRaisesRegex(ValueError, 'coordinates'):
            parse_report(json.dumps({**answer, 'observations': 'Shuttle at [0.3, 0.4].'}))


if __name__ == '__main__': unittest.main()
