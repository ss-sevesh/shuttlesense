"""Download the official TrackNetV3 inference files into ignored data/models/."""
import base64
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
import zipfile


def main():
    output = Path('data/models/tracknetv3')
    output.mkdir(parents=True, exist_ok=True)
    api = 'https://api.github.com/repos/qaz812345/TrackNetV3'
    with urllib.request.urlopen(api + '/commits/master', timeout=30) as response:
        revision = json.load(response)['sha']
    for name in ('model.py', 'LICENSE'):
        with urllib.request.urlopen(api + '/contents/' + name + '?ref=' + revision, timeout=30) as response:
            content = json.load(response)
        (output / name).write_bytes(base64.b64decode(content['content']))
    archive = output / 'TrackNetV3_ckpts.zip'
    file_id = '1CfzE87a0f6LhBp0kniSl1-89zaLCZ8cA'
    url = 'https://drive.usercontent.google.com/download?'
    params = {'id': file_id, 'export': 'download'}
    if not archive.exists():
        with urllib.request.urlopen(url + urllib.parse.urlencode(params), timeout=30) as response:
            initial = response.read()
        partial = archive.with_suffix('.partial')
        if initial.startswith(b'PK'):
            partial.write_bytes(initial)
        else:
            match = re.search(r'name="uuid" value="([a-f0-9-]+)"', initial.decode('utf-8'))
            if not match:
                raise ValueError('Official Google Drive confirmation form was not found')
            params.update(confirm='t', uuid=match[1])
            with urllib.request.urlopen(url + urllib.parse.urlencode(params), timeout=60) as response, partial.open('wb') as file:
                while chunk := response.read(1024 * 1024):
                    file.write(chunk)
        if not zipfile.is_zipfile(partial):
            raise ValueError('Checkpoint download is not a ZIP archive')
        partial.replace(archive)
    with zipfile.ZipFile(archive) as bundle:
        for name in ('TrackNet_best.pt', 'InpaintNet_best.pt'):
            matches = [entry for entry in bundle.infolist() if Path(entry.filename).name == name]
            if len(matches) != 1 or matches[0].file_size > 200 * 1024 * 1024:
                raise ValueError('Unexpected checkpoint archive contents')
            (output / name).write_bytes(bundle.read(matches[0]))
    (output / 'provenance.json').write_text(json.dumps({'repository': api, 'revision': revision,
                                                     'checkpoint_drive_id': file_id}, indent=2))
    print('Official TrackNetV3 files ready:', output, 'revision', revision, flush=True)


if __name__ == '__main__':
    main()
