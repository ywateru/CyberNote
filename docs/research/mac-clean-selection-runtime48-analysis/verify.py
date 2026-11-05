"""Read-only evidence checks and own-directory reports; no image generation."""
from pathlib import Path
from io import BytesIO
from datetime import datetime, timezone
import hashlib
import json
import re
from PIL import Image, ImageCms, ImageChops

O = Path(__file__).resolve().parent
R = O.parents[2]
checks = []
def check(name, value):
    checks.append({'name': name, 'pass': bool(value)})
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name, data):
    (O / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

opened = json.loads((O / 'input-open.json').read_text())
closed = []
for item in opened['files']:
    p = R / item['path']
    v = {'path': item['path'], 'bytes': p.stat().st_size, 'sha256': sha(p), 'mtimeNs': p.stat().st_mtime_ns}
    check('protected input:' + item['path'], v == item)
    closed.append(v)
check('32 protected inputs', len(closed) == opened['count'] == 32)
save('input-close.json', {'root': str(R), 'at': datetime.now(timezone.utc).isoformat(),
                        'count': len(closed), 'files': closed, 'unchanged': closed == opened['files']})
S = R / 'docs/research/mac-clean-selection-runtime48'
index = json.loads((S / 'evidence-index.json').read_text())
check('48 frozen index identity', sha(S / 'evidence-index.json') == '1dc6997273b1bcf39845f229e8d848843b421838200878c727c013d1caca79ff')
check('48 index member count', len(index['files']) == index['count'] == 27 and index['pathsRelativeTo'] == 'evidence directory')
for item in index['files']:
    p = S / item['path']
    check('48 member:' + item['path'], p.stat().st_size == item['bytes'] and sha(p) == item['sha256'])

d = json.loads((O / 'measurements.json').read_text())
initial = json.loads((O / 'measurements-before-visual-qualification.json').read_text())
restored = json.loads(json.dumps(d))
restored.pop('samplingQualification'); restored.pop('savedProcessIdentity')
restored['status'] = initial['status']
for record in restored['measurements'].values():
    record.pop('threeHostProductComparisonUsable')
check('qualification preserves initial numeric result', restored == initial)
check('nine endpoints', len(d['sources']) == len(d['measurements']) == 9)
for h, pid, exe, suffix in [
    ('mac13', 81681, 'b24f87623e49781859166d798dec052cb987692469ad2741847392b13e127812', 'mac-typography-keyboard-build13/mac-attempt02/mac-sealed.app/Contents/MacOS/notes-clone'),
    ('mac14', 81752, 'c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f', 'mac-ordinary-loop-build14/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone')]:
    p = json.loads((S / (h + '-process.json')).read_text())
    check('saved accurate process identity:' + h, d['identity'][h + 'SavedPID'] == pid
          and p == d['savedProcessIdentity'][h] and p['sha256'] == exe and p['exe'].endswith(suffix)
          and p['process'] == [str(pid) + ' ' + p['exe']])
check('saved old process absence', d['savedProcessIdentity']['mac13']['previousMac14PID81260Absent']
      and d['savedProcessIdentity']['mac14']['previousMac13PID81681Absent'])

for name, s in d['sources'].items():
    h, state = name.split('-')
    orig = h == 'original'
    bbox = [0, 0, 800, 414] if orig else [688, 453, 1488, 867]
    check('source SHA:' + name, sha(R / s['path']) == s['sourceSHA256'])
    with Image.open(R / s['path']) as im:
        im.load()
        check('JPEG420 ICC and size:' + name, im.format == s['format'] == 'JPEG'
              and list(im.size) == s['sourcePixels'] == ([800, 414] if orig else [2176, 1320])
              and [list(x) for x in im.layer] == s['jpegComponents'] == [[1, 2, 2, 0], [2, 1, 1, 1], [3, 1, 1, 1]]
              and len(im.info['icc_profile']) == s['iccBytes'] == 4064
              and hashlib.sha256(im.info['icc_profile']).hexdigest() == s['iccSHA256'] == '2b131b3ddbafff098096955b9e3a868ed9c261e5829a83704206086ca754c7bf')
    check('recorded fixed triple geometry:' + name, s['crop'] == bbox and s['cropPixels'] == [800, 414]
          and list(s['geometryByThreshold']) == ['190', '195', '200']
          and all(v['bbox'] == bbox for v in s['geometryByThreshold'].values())
          and s['search'] == ([0, 0, 800, 414] if orig else [650, 400, 1520, 900])
          and s['seed'] == ([400, 207] if orig else [1088, 720]))
    ax = (R / s['axPath']).read_text()
    match = re.search(r'Selected text: ```\n(.*?)\n```', ax, re.S)
    selected = match.group(1) if match else None
    check('saved AX homology:' + name, selected == s['selectedText'] == {'all': '新建文件夹', 'partial': '建文', 'natural': None}[state]
          and s['requestedUTF16Selection'] == {'all': [0, 5], 'partial': [1, 3], 'natural': [5, 5]}[state]
          and (state != 'natural' or 'focused UI element' in ax))
    check('visual qualification:' + name, d['samplingQualification'][state]['threeHostComparisonUsable']
          and d['measurements'][name]['threeHostProductComparisonUsable'])
    check('same rule core721 selected289:' + name, d['measurements'][name]['core']['commonNineEndpointPixels'] == 721
          and d['measurements'][name]['core']['partialSelectedCorePixels'] == 289)

pngs = []
for p in sorted(O.glob('*.png')):
    with Image.open(p) as im:
        im.load()
        desc = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(BytesIO(im.info['icc_profile']))).strip()
        expected = [2400, 1320] if p.name.startswith('three-host') else [950, 1170] if p.name.startswith('glyphs') else [800, 414]
        check('PNG decode size ICC:' + p.name, im.format == 'PNG' and list(im.size) == expected and 'sRGB' in desc)
        pngs.append({'path': str(p.relative_to(R)), 'pixels': list(im.size), 'iccDescription': desc, 'sha256': sha(p)})
check('11 derived PNGs', len(pngs) == 11)
with Image.open(O / 'mac13-natural-form-srgb.png') as a, Image.open(O / 'mac14-natural-form-srgb.png') as b:
    natural_srgb_equal = ImageChops.difference(a.convert('RGB'), b.convert('RGB')).getbbox() is None
check('natural entire sRGB form identical', natural_srgb_equal)
save('png-qa.json', {'method': 'Existing PNG decode/metadata and exact natural RGB comparison, no rendering',
                     'visualObservation': 'Native3x3 and nearest2x montages independently inspected: no visible name pointer/grey halo in any48 endpoint',
                     'naturalEntireFormSrgbIdentical': natural_srgb_equal, 'files': pngs})
m = d['measurements']; c = d['mac13vsMac14']; partial = d['partialSpans']
check('all MAE finite improvement', m['mac13-all']['errors']['name']['fullRoiMAESrgb'] == 12.19550922213312
      and m['mac14-all']['errors']['name']['fullRoiMAESrgb'] == 9.367816091954023)
check('all adverse160 and bbox retained', m['mac13-all']['errors']['name']['maskXor']['srgb']['160'] == 195
      and m['mac14-all']['errors']['name']['maskXor']['srgb']['160'] == 197
      and m['mac13-all']['ink']['name']['raw']['160']['bbox'] == [142, 125, 268, 149]
      and m['mac14-all']['ink']['name']['raw']['160']['bbox'] == [142, 125, 269, 149])
check('partial selected improvement retained', partial['mac13']['selectedJianWen']['fullRoiMAESrgb'] == 14.55948121645796
      and partial['mac14']['selectedJianWen']['fullRoiMAESrgb'] == 11.581097197376268)
check('partial unselected adverse value retained', partial['mac13']['unselectedJiaJia']['fullRoiMAESrgb'] == 11.828191741813004
      and partial['mac14']['unselectedJiaJia']['fullRoiMAESrgb'] == 11.837209302325581)
check('natural entire raw form unchanged', c['natural']['fullFormRawChangedPixels'] == 0)
check('all states label equality', all(c[state][roi][key] == 0 for state in ['all', 'partial', 'natural']
      for roi in ['nameLabel', 'smartLabel'] for key in ['rawChangedPixels', 'srgbChangedPixels']))
check('natural residual retained', all(m[h + '-natural']['errors']['name']['fullRoiMAESrgb'] == 8.93576965669989
      and m[h + '-natural']['errors']['name']['maskXor']['raw']['160'] == 193 for h in ['mac13', 'mac14']))
check('label residual raw1606 and24 retained', all(m[h + '-' + state]['errors'][roi]['maskXor']['raw']['160'] == expected
      for h in ['mac13', 'mac14'] for state in ['all', 'partial', 'natural']
      for roi, expected in [('nameLabel', 6), ('smartLabel', 24)]))
failed = [x for x in checks if not x['pass']]
result = {'status': 'PASS' if not failed else 'FAIL', 'scope': 'Saved evidence consistency only; no pixel parity, keyboard or cross-platform PASS',
          'checks': len(checks), 'passed': len(checks) - len(failed), 'failed': failed,
          'protectedInputs': len(closed), 'protectedInputsUnchanged': closed == opened['files'],
          'visualQualification': 'Three states usable; no visible name pointer/halo in existing48 montages',
          'natural13vs14': 'Entire raw and sRGB800x414 forms identical; original residual persists',
          'history47': 'Input method, index, numeric data, and conclusions remain unchanged; contaminated47 metrics are not rewritten',
          'details': checks}
save('result.json', result)
print(json.dumps({k: v for k, v in result.items() if k != 'details'}, ensure_ascii=False, indent=2))
raise SystemExit(bool(failed))
