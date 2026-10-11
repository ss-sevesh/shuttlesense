"""Install and verify the optional pinned local embedding/chat models."""
import hashlib
import json
from pathlib import Path
import os
import subprocess
from rag_chat import api, config, ready


def install():
    for kind in ('embedding', 'text'):
        model = config()[kind]
        subprocess.run(['ollama', 'pull', model['name']], check=True,
                       env={**os.environ, 'OLLAMA_HOST': '127.0.0.1:11434'})
        tags = api('tags')['models']
        if not any(t['name'] == model['name'] and t['digest'] == model['manifestDigest'] for t in tags):
            raise ValueError('Official tag changed; expected pinned manifest. Do not use this model.')
        modelfile = api('show', {'model': model['name']})['modelfile']
        expected = {model['sha256']}
        if 'projectorSha256' in model:
            expected.add(model['projectorSha256'])
        sources = [Path(line.removeprefix('FROM ').strip('"')) for line in modelfile.splitlines() if line.startswith('FROM ')]
        if {source.name.removeprefix('sha256-') for source in sources} != expected:
            raise ValueError('Unexpected model blobs; do not use this model.')
        for source in sources:
            with source.open('rb') as handle:
                if hashlib.file_digest(handle, 'sha256').hexdigest() != source.name.removeprefix('sha256-'):
                    raise ValueError('Model checksum mismatch; do not use this model.')
    ready()
    print(json.dumps({'embedding': config()['embedding'], 'text': config()['text'], 'checksumVerified': True}))


if __name__ == '__main__':
    install()
