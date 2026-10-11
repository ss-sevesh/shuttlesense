from contextlib import closing
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from qdrant_client import QdrantClient
import rag_chat as rag


class RagTests(unittest.TestCase):
    def test_persistence_isolation_stale_replacement_and_deletion(self):
        dimensions = rag.config()['embedding']['dimensions']
        with tempfile.TemporaryDirectory() as path, patch.object(rag, 'embed', side_effect=lambda rows, **kw: [[1.] + [0.] * (dimensions - 1) for _ in rows]):
            with closing(QdrantClient(path=path)) as client:
                rag.replace_sources(client, 'A', 'old', [{'id': 'a', 'text': 'original'}])
                rag.replace_sources(client, 'B', 'current', [{'id': 'b', 'text': 'other recording'}])
            with closing(QdrantClient(path=path)) as client:
                self.assertEqual(rag.retrieve(client, 'question', 'A', 'old')[0]['id'], 'a')
                self.assertEqual(rag.retrieve(client, 'question', 'A', 'current'), [])
                rag.replace_sources(client, 'A', 'current', [{'id': 'new', 'text': 'updated'}])
                self.assertEqual(rag.retrieve(client, 'question', 'A', 'old'), [])
                self.assertEqual(rag.retrieve(client, 'question', 'B', 'current')[0]['id'], 'b')
                rag.replace_sources(client, 'A', 'current', [])
                self.assertEqual(rag.retrieve(client, 'question', 'A', 'current'), [])

    def test_embedding_failure_preserves_previous_index(self):
        with closing(QdrantClient(':memory:')) as client, patch.object(rag, 'embed', return_value=[[1.] + [0.] * 1023]):
            rag.replace_sources(client, 'A', 'old', [{'id': 'a', 'text': 'original'}])
            with patch.object(rag, 'embed', side_effect=ValueError('missing model')):
                with self.assertRaises(ValueError):
                    rag.replace_sources(client, 'A', 'new', [{'id': 'b', 'text': 'new'}])
            self.assertEqual(rag.retrieve(client, 'question', 'A', 'old')[0]['id'], 'a')

    def test_shared_query_vector_keeps_recording_and_reference_filters(self):
        vector = [1.] + [0.] * 1023
        with closing(QdrantClient(':memory:')) as client, patch.object(rag, 'embed', return_value=[vector]):
            rag.replace_sources(client, 'A', 'current', [{'id': 'a', 'text': 'recording'}])
            rag.replace_sources(client, 'references', 'guidance', [{'id': 'ref', 'text': 'reference'}])
            with patch.object(rag, 'embed', side_effect=AssertionError('Question must not be embedded twice')):
                self.assertEqual(rag.retrieve(client, 'question', 'A', 'current', query_vector=vector)[0]['id'], 'a')
                self.assertEqual(rag.retrieve(client, 'question', 'references', 'guidance', query_vector=vector)[0]['id'], 'ref')
                self.assertEqual(rag.retrieve(client, 'question', 'A', 'stale', query_vector=vector), [])

    def test_gpu_lock_never_steals_existing_work_and_releases_on_failure(self):
        with tempfile.TemporaryDirectory() as path, patch.object(rag, 'ROOT', Path(path)):
            active = Path(path) / 'data/analysis-jobs/active.json'
            with rag.gpu_lock():
                original = active.read_text()
                with self.assertRaisesRegex(ValueError, 'busy'):
                    with rag.gpu_lock():
                        self.fail('Competing work acquired lock')
                self.assertEqual(active.read_text(), original)
            self.assertFalse(active.exists())
            with self.assertRaises(ValueError):
                with rag.gpu_lock():
                    raise ValueError('worker failed')
            self.assertFalse(active.exists())

    def test_answer_citations_and_unload_on_failure(self):
        sources = [{'id': 'a', 'text': 'User marked lost.'}]
        for citations in ([], ['invented']):
            with patch.object(rag, 'api', side_effect=[{'message': {'content': json.dumps({'answer': 'Lost.', 'citations': citations})}}, {}]) as api:
                with self.assertRaises(ValueError):
                    rag.answer('Outcome?', sources)
                request = api.call_args_list[0].args[1]
                self.assertFalse(request['think'])
                self.assertEqual(request['format']['properties']['citations']['items']['enum'], ['a'])
                self.assertEqual(api.call_args.args, ('generate', {'model': rag.config()['text']['name'], 'keep_alive': 0}))
        self.assertEqual(rag.answer('Anything?', [])['citations'], [])

    def test_embedding_dimension_and_manifest_changes_fail_closed(self):
        with patch.object(rag, 'api', return_value={'embeddings': [[0.]]}):
            with self.assertRaisesRegex(ValueError, 'dimensions'):
                rag.embed(['question'])
        with patch.object(rag, 'api', return_value={'models': []}):
            with self.assertRaisesRegex(ValueError, 'manifest'):
                rag.ready()

    def test_chat_identity_and_no_thinking_readiness_fail_closed(self):
        cfg = rag.config()
        def response(path, payload=None):
            if path == 'tags':
                return {'models': [{'name': cfg[k]['name'], 'digest': cfg[k]['manifestDigest']} for k in ('embedding', 'text')]}
            if payload['model'] == cfg['embedding']['name']:
                return {'modelfile': 'FROM sha256-' + cfg['embedding']['sha256']}
            return {'modelfile': 'FROM sha256-' + cfg['text']['sha256'] + '\nFROM sha256-' + cfg['text']['projectorSha256'], 'thinking': {'values': [False, True]}}
        with patch.object(rag, 'api', side_effect=response):
            rag.ready()
        with patch.object(rag, 'api', side_effect=lambda path, payload=None: {**response(path, payload), 'thinking': {'values': [True]}}):
            with self.assertRaisesRegex(ValueError, 'thinking disabled'):
                rag.ready()


if __name__ == '__main__':
    unittest.main()
