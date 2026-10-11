import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import download_bst


class DownloadBSTTests(unittest.TestCase):
    def test_check_only_rejects_missing_without_network(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(download_bst, 'MODEL_DIR', Path(directory)), patch.object(download_bst.urllib.request, 'urlopen') as request:
            with self.assertRaisesRegex(ValueError, 'Missing or modified'):
                download_bst.main(True)
            request.assert_not_called()

    def test_checksum_failure_keeps_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'model').mkdir()
            target = root / 'model/bst.py'
            target.write_bytes(b'existing')
            response = io.BytesIO(b'wrong download')
            response.headers = {'Content-Type': 'text/plain'}
            with patch.object(download_bst, 'MODEL_DIR', root), patch.object(download_bst, 'FILES', {'model/bst.py': hashlib.sha256(b'expected').hexdigest()}), patch.object(download_bst.urllib.request, 'urlopen', return_value=response):
                with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                    download_bst.main()
            self.assertEqual(target.read_bytes(), b'existing')

    def test_verified_download_and_check_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            response = io.BytesIO(b'expected')
            response.headers = {'Content-Type': 'text/plain'}
            with patch.object(download_bst, 'MODEL_DIR', root), patch.object(download_bst, 'FILES', {'model/bst.py': hashlib.sha256(b'expected').hexdigest()}), patch.object(download_bst.urllib.request, 'urlopen', return_value=response) as request:
                download_bst.main()
                self.assertEqual((root / 'model/bst.py').read_bytes(), b'expected')
                download_bst.main(True)
                self.assertEqual(request.call_count, 1)


    def test_drive_confirmation_installs_verified_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'model').mkdir()
            form = io.BytesIO(b'<input name="uuid" value="abc-123">')
            form.headers = {'Content-Type': 'text/html'}
            checkpoint = io.BytesIO(b'checkpoint')
            checkpoint.headers = {'Content-Type': 'application/octet-stream'}
            with patch.object(download_bst, 'MODEL_DIR', root), patch.object(download_bst, 'FILES', {'weight.pt': hashlib.sha256(b'checkpoint').hexdigest()}), patch.object(download_bst.urllib.request, 'urlopen', side_effect=[form, checkpoint]) as request:
                download_bst.main()
                self.assertEqual((root / 'weight.pt').read_bytes(), b'checkpoint')
                self.assertIn('confirm=t&uuid=abc-123', request.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
