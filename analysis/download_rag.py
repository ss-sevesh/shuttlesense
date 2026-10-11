"""Install and verify the optional pinned Ollama embedding model."""
import hashlib
import json
from pathlib import Path
import os
import subprocess
from rag_chat import api, config, ready


def install():
    model = config()['embedding']
    subprocess.run(['ollama', 'pull', model['name']], check=True,
                   env={**os.environ, 'OLLAMA_HOST': '127.0.0.1:11434'})
    tags = api('tags')['models']
    if not any(t['name'] == model['name'] and t['digest'] == model['manifestDigest'] for t in tags):
        raise ValueError('Official embedding tag changed; expected pinned manifest. Do not index with this model.')
    modelfile = api('show', {'model': model['name']})['modelfile']
    source = next(line.removeprefix('FROM ').strip('"') for line in modelfile.splitlines() if line.startswith('FROM '))
    with Path(source).open('rb') as handle:
        if hashlib.file_digest(handle, 'sha256').hexdigest() != model['sha256']:
            raise ValueError('Embedding checksum mismatch; do not index with this model.')
    ready()
    print(json.dumps({'embedding': model, 'checksumVerified': True}))


if __name__ == '__main__':
    install()
