"""Install the exact official BST source/checkpoint used by optional shot analysis."""
import argparse
import hashlib
from pathlib import Path
import re
import shutil
import urllib.parse
import urllib.request

REVISION = 'fb9b310bf4c8a8e3d89c75e61bc06a7ac3de62df'
ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / 'data/bst-official'
FILES = {
    'model/bst.py': '4313f9f411a90da24bfeead81f88b83894363bfd5248a75132a8c60ec3905b74',
    'model/tempose.py': '0f3274bb4c0ec1b3f4a068b066993b7f1c0d58349bb580b55d0e0919e3821bc6',
    'bst_0_JnB_bone_between_2_hits_with_max_limits_seq_100_merged_2.pt':
        'c4d41bb8248f0f79f7a7182ac2b38ec021ef51edd4978dfa31d17291b530afc8',
}


def matches(path, expected):
    if not path.is_file():
        return False
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest() == expected


def main(check_only=False):
    for name, expected in FILES.items():
        target = MODEL_DIR / name
        if matches(target, expected):
            continue
        if check_only:
            raise ValueError(f'Missing or modified BST file: {name}. Run setup without -CheckOnly.')
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_suffix(target.suffix + '.partial')
        if name.startswith('model/'):
            url = f'https://raw.githubusercontent.com/Va6lue/BST-Badminton-Stroke-type-Transformer/{REVISION}/stroke_classification/{name}'
        else:
            params = {'id': '1OA63gWshMGO5WT2HIshjwMAL1T5jNjIa', 'export': 'download'}
            url = 'https://drive.usercontent.google.com/download?' + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=60) as response:
            if 'text/html' in response.headers.get('Content-Type', '') and not name.startswith('model/'):
                form = response.read(1024 * 1024).decode('utf-8')
                match = re.search(r'name="uuid" value="([a-f0-9-]+)"', form)
                if not match:
                    raise ValueError('Official BST Google Drive confirmation was unavailable. Retry setup.')
                params.update(confirm='t', uuid=match[1])
                url = 'https://drive.usercontent.google.com/download?' + urllib.parse.urlencode(params)
                with urllib.request.urlopen(url, timeout=120) as download, partial.open('wb') as file:
                    shutil.copyfileobj(download, file)
            else:
                with partial.open('wb') as file:
                    shutil.copyfileobj(response, file)
        if not matches(partial, expected):
            raise ValueError(f'BST checksum mismatch: {name}; downloaded file was not installed.')
        partial.replace(target)
    if not check_only:
        (MODEL_DIR / 'model/__init__.py').touch()
    elif not (MODEL_DIR / 'model/__init__.py').is_file():
        raise ValueError('Missing BST package initializer. Run setup without -CheckOnly.')
    print('Pinned official BST source and checkpoint ready.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-only', action='store_true')
    main(parser.parse_args().check_only)
