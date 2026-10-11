"""Model-free checks for benchmark isolation; run with Python unittest."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('benchmark', Path(__file__).with_name('benchmark-rag.py'))
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


class IsolationTests(unittest.TestCase):
    def test_restore_exact_original_and_absent_files(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'profile.json'
            path.write_bytes(b'fixture')
            benchmark.restore(path, b'original', b'fixture')
            self.assertEqual(path.read_bytes(), b'original')
            benchmark.restore(path, None, b'original')
            self.assertFalse(path.exists())

    def test_concurrent_edits_are_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'history.json'
            path.write_bytes(b'user edited')
            with self.assertRaisesRegex(RuntimeError, 'changed outside benchmark'):
                benchmark.restore(path, b'original', b'fixture')
            self.assertEqual(path.read_bytes(), b'user edited')

    def test_questions_and_ids_are_unique(self):
        self.assertEqual(len(benchmark.CASES), len({row[0] for row in benchmark.CASES}))
        self.assertTrue(all(len(row[2]) <= 1000 for row in benchmark.CASES))


if __name__ == '__main__':
    unittest.main()
