"""Verify sealed saved observations only; no resampling or image generation."""
from pathlib import Path
from datetime import datetime, timezone
from io import BytesIO
import hashlib
import json
import re
from PIL import Image, ImageCms

O = Path(__file__).resolve().parent
R = O.parents[2]
checks = []

def check(name, condition):
    checks.append({'name': name, 'pass': bool(condition)})

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def save(name, value):
    (O / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

opened = json.loads((O / 'input-open.json').read_text())
closed = []
for item in opened['files']:
    p = R / item['path']
    actual = {'path': item['path'], 'bytes': p.stat().st_size,
              'sha256': digest(p), 'mtimeNs': p.stat().st_mtime_ns}
    closed.append(actual)
    check('protected:' + item['path'], actual == item)
check('protected input count 101', len(closed) == opened['count'] == 101)
save('input-close.json', {'root': str(R), 'at': datetime.now(timezone.utc).isoformat(),
                          'count': len(closed), 'files': closed,
                          'unchanged': closed == opened['files']})

index_checks = json.loads((O / 'sealed-input-index-checks.json').read_text())
for spec in index_checks:
    path = R / spec['path']
    index = json.loads(path.read_text())
    check('index SHA:' + spec['path'], digest(path) == spec['sha256'])
    check('index count:' + spec['path'], index['count'] == len(index['files']) == spec['count'])
    base = path.parent if spec['basis'] == 'evidence directory' else R
    for member in index['files']:
        p = base / member['path']
        check('index member:' + str(p.relative_to(R)),
              p.stat().st_size == member['bytes'] and digest(p) == member['sha256'])

d = json.loads((O / 'measurements.json').read_text())
before = json.loads((O / 'measurements-before-visual-qualification.json').read_text())
unqualified = json.loads(json.dumps(d))
unqualified.pop('samplingQualification')
unqualified['status'] = before['status']
for record in unqualified['measurements'].values():
    record.pop('threeHostProductComparisonUsable')
    record.pop('quality', None)
check('qualification preserves every pre-QA metric', unqualified == before)
check('exact nine endpoints', len(d['sources']) == len(d['measurements']) == 9)
check('Mac14 saved identity', d['identity']['mac14Source'] == 'd9ce9c4b864c2d05bf3d2057ec48ae65fb868a46'
      and d['identity']['mac14ExeSHA256'] == 'c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f'
      and d['identity']['mac14SavedPID'] == 81003)
icc_sha = '2b131b3ddbafff098096955b9e3a868ed9c261e5829a83704206086ca754c7bf'
png_qa = []
for name, source in d['sources'].items():
    host, state = name.split('-')
    original = host == 'original'
    expected_crop = [0, 0, 800, 414] if original else [688, 453, 1488, 867]
    expected_size = [800, 414] if original else [2176, 1320]
    check('source SHA:' + name, digest(R / source['path']) == source['sourceSHA256'])
    with Image.open(R / source['path']) as im:
        im.load()
        check('source JPEG ICC:' + name, im.format == source['format'] == 'JPEG'
              and list(im.size) == source['sourcePixels'] == expected_size
              and [list(x) for x in im.layer] == source['jpegComponents'] == [[1, 2, 2, 0], [2, 1, 1, 1], [3, 1, 1, 1]]
              and len(im.info['icc_profile']) == source['iccBytes'] == 4064
              and hashlib.sha256(im.info['icc_profile']).hexdigest() == source['iccSHA256'] == icc_sha)
    check('recorded independent geometry:' + name, source['crop'] == expected_crop
          and source['cropPixels'] == [800, 414]
          and list(source['geometryByThreshold']) == ['190', '195', '200']
          and all(x['bbox'] == expected_crop for x in source['geometryByThreshold'].values())
          and source['search'] == ([0, 0, 800, 414] if original else [650, 400, 1520, 900])
          and source['seed'] == ([400, 207] if original else [1088, 720]))
    ax = (R / source['axPath']).read_text()
    found = re.search(r'Selected text: ```\n(.*?)\n```', ax, re.S)
    selected = found.group(1) if found else None
    expected_text = {'all': '新建文件夹', 'partial': '建文', 'natural': None}[state]
    check('saved AX selection:' + name, selected == source['selectedText'] == expected_text
          and source['requestedUTF16Selection'] == {'all': [0, 5], 'partial': [1, 3], 'natural': [5, 5]}[state]
          and (state != 'natural' or 'focused UI element' in ax))
    check('endpoint comparison qualification:' + name,
          d['measurements'][name]['threeHostProductComparisonUsable'] == (state == 'all'))

for p in sorted(O.glob('*.png')):
    with Image.open(p) as im:
        im.load()
        profile = ImageCms.ImageCmsProfile(BytesIO(im.info['icc_profile']))
        size = list(im.size)
        expected = [2400, 1320] if p.name.startswith('three-host') else [950, 1170] if p.name.startswith('glyphs') else [800, 414]
        desc = ImageCms.getProfileDescription(profile).strip()
        check('existing PNG decode/size/sRGB:' + p.name, im.format == 'PNG' and size == expected and 'sRGB' in desc)
        png_qa.append({'path': str(p.relative_to(R)), 'pixels': size,
                       'iccDescription': desc, 'sha256': digest(p)})
check('11 existing PNGs', len(png_qa) == 11)
save('png-qa.json', {'method': 'Decode existing files and inspect metadata only; no generated pixels', 'files': png_qa})

m = d['measurements']
for host, core, count, bbox, mae, mask, bg in [
    ('original', [9, 1, 0], 1229, [142, 125, 268, 149], 0, [0, 0, 0], [252, 234, 193]),
    ('mac13', [40, 32, 21], 1184, [142, 125, 268, 149], 12.19550922213312, [236, 195, 206], [250, 232, 200]),
    ('mac14', [9, 0, 0], 1224, [142, 125, 269, 149], 9.367816091954023, [188, 197, 205], [250, 232, 200])]:
    v = m[host + '-all']
    check('all headline and adverse values:' + host,
          v['core']['commonNineEndpointPixels'] == 430 and v['core']['srgbMedian'] == core
          and v['ink']['name']['raw']['160'] == {'pixels': count, 'bbox': bbox}
          and v['errors']['name']['fullRoiMAESrgb'] == mae
          and list(v['errors']['name']['maskXor']['srgb'].values()) == mask
          and v['backgroundStrip']['srgbMedian'] == bg)
check('all auxiliary label equality', all(d['mac13vsMac14']['all'][roi][key] == 0
      for roi in ['nameLabel', 'smartLabel'] for key in ['rawChangedPixels', 'srgbChangedPixels']))
q = d['samplingQualification']
check('all comparison usable', q['all']['threeHostComparisonUsable'] is True)
check('partial/natural UNKNOWN retained', all(q[s]['status'] == 'UNKNOWN' and not q[s]['threeHostComparisonUsable']
      for s in ['partial', 'natural']))
check('core caution retained', '430' in q['coreCaution'] and 'halo' in q['coreCaution'])
check('contaminated adverse observations retained',
      [m[h + '-natural']['ink']['name']['raw']['160']['pixels'] for h in ['original', 'mac13', 'mac14']] == [1314, 1291, 1166]
      and d['mac13vsMac14']['natural']['fullFormRawChangedPixels'] == 15609)
failed = [c for c in checks if not c['pass']]
result = {'status': 'PASS' if not failed else 'FAIL',
          'scope': 'Evidence consistency only; no product, pixel parity, keyboard, or all-platform PASS',
          'checks': len(checks), 'passed': len(checks) - len(failed), 'failed': failed,
          'protectedInputs': 101, 'protectedInputsUnchanged': closed == opened['files'],
          'allSelected': 'Finite color improvement accepted; adverse sRGB160 XOR195->197 and raw160 bbox right+1 retained',
          'partial': 'UNKNOWN: original46/Mac13-46 pointer/halo contamination retained',
          'natural': 'UNKNOWN: original46/Mac13-46 pointer/halo contamination retained',
          'no48Read': True, 'noImageOrSamplingChange': True, 'details': checks}
save('result.json', result)
print(json.dumps({k: v for k, v in result.items() if k != 'details'}, ensure_ascii=False, indent=2))
raise SystemExit(bool(failed))
