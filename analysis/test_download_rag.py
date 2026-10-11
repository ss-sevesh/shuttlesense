import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import download_rag as download


class InstallerTests(unittest.TestCase):
    def test_custom_chat_tag_reuses_report_installer_and_checks_the_blob(self):
        report=json.loads((Path(download.__file__).parent/'report_model.json').read_text())
        for present in (True,False):
            with self.subTest(present=present),tempfile.TemporaryDirectory() as directory:
                digest=hashlib.sha256(b'fixture').hexdigest()
                blob=Path(directory)/('sha256-'+digest);blob.write_bytes(b'fixture')
                models={key:{'name':report['ollamaModel'] if key=='text' else 'fixture-embedding','sha256':digest,'manifestDigest':'pinned'} for key in ('text','embedding')}
                installed=present
                def run(args,**kwargs):
                    nonlocal installed
                    if args[0]!='ollama':
                        self.assertEqual(Path(args[1]).name,'download_report_model.py');installed=True
                def api(path,payload=None):
                    if path=='tags':return {'models':[{'name':model['name'],'digest':'pinned'} for key,model in models.items() if key=='embedding' or installed]}
                    return {'modelfile':'FROM '+str(blob)}
                with patch.object(download,'config',return_value=models),patch.object(download,'api',side_effect=api),patch.object(download,'ready'),patch.object(download.subprocess,'run',side_effect=run) as calls:
                    download.install()
                self.assertEqual(calls.call_args_list[0].args[0],['ollama','pull','fixture-embedding'])
                self.assertEqual(calls.call_count,1 if present else 2)
                blob.write_bytes(b'corrupt')
                with patch.object(download,'config',return_value=models),patch.object(download,'api',side_effect=api),patch.object(download.subprocess,'run'):
                    with self.assertRaisesRegex(ValueError,'checksum'):download.install()


if __name__=='__main__':unittest.main()
