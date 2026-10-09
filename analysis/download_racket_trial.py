"""Prepare the official MMDetection 3.3.0 model in ignored local storage."""
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import urllib.request

from mmengine import Config

from racket_trial import MODEL_DIR, MODEL_NAME, MODEL_URL, digest


if __name__ == '__main__':
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    package = Path(importlib.util.find_spec('mmdet').origin).parent
    config = package / '.mim/configs/rtmdet' / (MODEL_NAME + '.py')
    cfg = Config.fromfile(config)
    cfg.model.backbone.init_cfg = None  # Complete detector weights need no extra backbone download.
    cfg.dump(str(MODEL_DIR / 'config.py'))
    weights = MODEL_DIR / 'model.pth'
    if not weights.exists():
        temporary = weights.with_suffix('.download')
        urllib.request.urlretrieve(MODEL_URL, temporary)
        temporary.replace(weights)
    manifest = {'model': MODEL_NAME, 'checkpointUrl': MODEL_URL,
                'source': 'https://github.com/open-mmlab/mmdetection/tree/v3.3.0/configs/rtmdet',
                'packages': {name: importlib.metadata.version(name) for name in ('mmdet', 'mmcv', 'mmengine', 'torch', 'torchvision', 'numpy', 'opencv-python')},
                'sha256': {path.name: digest(path) for path in (weights, MODEL_DIR / 'config.py')}}
    (MODEL_DIR / 'provenance.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, indent=2))
