import json
import unittest
from unittest.mock import patch
from match_report import batches, fits, parse_report, messages, generate_answer, validate_grounding, recording_summary, CONTEXT, OUTPUT_TOKENS


class Tokenizer:
    def apply_chat_template(self, rows, **kwargs):
        return list(range(len(json.dumps(rows))))


class ReportTests(unittest.TestCase):
    def test_recording_summary_covers_mixed_outcomes_without_guessing_unknowns(self):
        summary = recording_summary({'duration': 84}, [{'outcome': 'lost'}, {'outcome': 'unknown'}])
        for fact in ('84-second', '2 completed or verified', '1 user-marked loss', '0 user-marked wins', '1 unknown'):
            self.assertIn(fact, summary)

    def test_hyphenated_practice_doses_are_valid_but_timestamps_are_not(self):
        answer = dict(summary='Outcome unknown.', observations='Tracked estimates only.',
                      training='', uncertainty='Contact and intent are unverified.')
        for dose in ('10-repetition drill', '30-second practice', 'two-minute practice'):
            self.assertEqual(parse_report(json.dumps({**answer, 'training': dose}))['training'], dose)
        with self.assertRaisesRegex(ValueError, 'practice dose'):
            parse_report(json.dumps({**answer, 'training': 'Review the attempt at 80.533 seconds.'}))

    def test_ending_prose_must_discuss_shuttle_at_its_own_time(self):
        evidence = {'ending': {'evidence': {'time': 39.466667,'distancePx':48.1076}}, 'endingContext': []}
        for text in ('At 30.033 s, the arm is overhead.', 'At 39.467 s, the arm is raised.',
                     'At 39.467 s the shuttle is camera-left, indicating a late attempt.'):
            with self.assertRaises(ValueError): validate_grounding({'observations': text}, evidence)
        validate_grounding({'observations': 'At 39.467 s, the tracked shuttle is camera-left of the near player, with a wrist proxy gap of 48.1 px. Contact remains unknown.'}, evidence)
        with self.assertRaisesRegex(ValueError,'not supplied'):
            validate_grounding({'observations':'At 39.467 s, the shuttle gap is 625.1 px.'},evidence)
        with self.assertRaisesRegex(ValueError,'boundary'):
            validate_grounding({'summary':'The rally ends with a marked loss at 39.467 seconds.',
                                'observations':'At 39.467 s, the shuttle gap is 48.1 px.'}, {**evidence,'end':40.2})
        validate_grounding({'summary':'The rally ends with a user-marked loss; visible wrist movement at 39.467 seconds is unconfirmed.',
                            'observations':'At 39.467 s, the shuttle gap is 48.1 px.'},{**evidence,'end':40.2})

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
        with self.assertRaisesRegex(ValueError,'Lateness'):
            parse_report(json.dumps({**answer,'training':'Practise for late shuttle approaches.'}))
        with self.assertRaisesRegex(ValueError,'practice dose'):
            parse_report(json.dumps({**answer,'training':'Practice the positioning shown at 80.533 seconds.'}))
        self.assertIn('10 times',parse_report(json.dumps({**answer,'training':'Repeat the camera-right shadow step 10 times.'}))['training'])
        self.assertIn('late rally',parse_report(json.dumps({**answer,'training':'Repeat the shadow step 10 times for positioning during late rally sequences.'}))['training'])
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
