"""Install the pinned text-only report GGUF and matching tokenizer into local Ollama."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

from huggingface_hub import hf_hub_download, snapshot_download

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / 'analysis/report_model.json').read_text(encoding='utf-8'))
MODEL_DIR = ROOT / 'data/models/match-report-qwen3-4b'


if __name__ == '__main__':
    path = Path(hf_hub_download(CONFIG['quantizationRepository'], CONFIG['filename'],
                              revision=CONFIG['quantizationRevision'], local_dir=MODEL_DIR))
    with path.open('rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != CONFIG['sha256']:
            raise ValueError('Report model checksum mismatch; model was not imported.')
    snapshot_download(CONFIG['model'], revision=CONFIG['revision'], local_dir=MODEL_DIR / 'tokenizer',
                      allow_patterns=['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json'])
    modelfile = MODEL_DIR / 'Modelfile'
    modelfile.write_text(f'FROM "{path.as_posix()}"\nPARAMETER num_ctx 16384\n', encoding='utf-8')
    executable = shutil.which('ollama')
    if not executable:
        raise ValueError('Install Ollama and start ollama serve, then rerun this installer.')
    subprocess.run([executable, 'create', CONFIG['ollamaModel'], '-f', str(modelfile)], check=True,
                   env={**os.environ, 'OLLAMA_HOST': '127.0.0.1:11434'})
    (MODEL_DIR / 'provenance.json').write_text(json.dumps(CONFIG, indent=2), encoding='utf-8')
    print(json.dumps(CONFIG))
