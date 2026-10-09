"""Download only official pinned safetensors and processor assets into ignored data."""
import hashlib
import json

from huggingface_hub import snapshot_download

from shot_coach import MODEL, MODEL_DIR, REVISION


if __name__ == '__main__':
    snapshot_download(MODEL, revision=REVISION, local_dir=MODEL_DIR,
                      allow_patterns=['*.json', '*.safetensors', '*.txt'])
    required = ['config.json', 'tokenizer_config.json', 'preprocessor_config.json', 'model.safetensors']
    if any(not (MODEL_DIR / name).is_file() for name in required):
        raise RuntimeError('Incomplete model snapshot; provenance was not written')
    hashes = {}
    for path in MODEL_DIR.glob('*'):
        if path.is_file() and path.name != 'provenance.json':
            with path.open('rb') as source:
                hashes[path.name] = hashlib.file_digest(source, 'sha256').hexdigest()
    (MODEL_DIR / 'provenance.json').write_text(json.dumps({'model': MODEL, 'revision': REVISION, 'sha256': hashes}, indent=2))
    print(json.dumps({'model': MODEL, 'revision': REVISION, 'files': len(hashes)}))
