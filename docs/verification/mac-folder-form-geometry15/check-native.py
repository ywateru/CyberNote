"""Checks saved offscreen WK metrics; no render/build/GUI operation."""
from pathlib import Path
import json
from PIL import Image

out = Path(__file__).resolve().parent
j = json.loads((out / 'final-native.json').read_text())
u = {v['selector']: v for v in j['metrics']['units']}
p = u['.smart-form']['rect']
assert j['status'] == 'metrics-ok' and j['appActive'] is False
assert not j['webViewAttachedToWindow']
# WebKit may allocate an invisible internal TUINSWindow without our helper
# constructing/ordering/activating any NSWindow. Do not confuse count with GUI use.
assert all(not w['visible'] and not w['key'] and not w['main'] for w in j['windowDiagnostics'])
assert j['metrics']['devicePixelRatio'] == 2 and j['snapshotPixels'] == [2176, 1320]
assert not j['metrics']['requests']
assert [p['width'], p['height']] == [400, 207]
local = {k: {'x': v['rect']['x'] - p['x'], 'y': v['rect']['y'] - p['y'],
             'width': v['rect']['width'], 'height': v['rect']['height']} for k, v in u.items()}
assert local['.smart-name input']['y'] == 56 and local['.smart-name input']['height'] == 24
assert local['.smart-make input'] == {'x': 20, 'y': 96, 'width': 16, 'height': 16}
assert local['footer'] == {'x': 20, 'y': 146, 'width': 360, 'height': 41}
assert local['footer button'] == {'x': 212, 'y': 163, 'width': 80, 'height': 24}
assert u['footer']['styles']['borderTopWidth'] == '0.5px'
box = tuple(round(x * 2) for x in [p['x'], p['y'], p['x'] + p['width'], p['y'] + p['height']])
Image.open(out / 'final-native.png').crop(box).save(out / 'final-native-form.png')
result = {'status': 'pass', 'mapping': 'WK CSS to snapshot factor 2; runtime09 baseline independently reproduced',
          'panelSnapshotCrop': box, 'localCssRects': local,
          'originalSnapshotTargets': {'panel': [800, 414], 'checkbox': [40, 192, 72, 224],
                                      'footerLine': [40, 292, 760, 293],
                                      'cancel': [424, 326, 584, 374], 'ok': [600, 326, 760, 374]},
          'windowDiagnostics': j['windowDiagnostics'],
          'limits': 'Nonpersistent offscreen WK, serialized actual production React DOM and complete CSS; no installed package/native input/overall pixel PASS.'}
path = out / 'native-geometry-result.json'
with path.open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print('PASS saved actual WK geometry; 400x207 CSS, 800x414 snapshot crop; no visible/key/main window')
