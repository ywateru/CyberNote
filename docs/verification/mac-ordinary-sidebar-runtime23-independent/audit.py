"""Finite static audit; never launches applications or executes the image analyzer."""
from pathlib import Path
from datetime import datetime
import hashlib
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
RUNTIME = ROOT / 'docs/verification/mac-ordinary-sidebar-runtime23'
RESEARCH = ROOT / 'docs/research/mac-ordinary-surface25-runtime-analysis'
PACKAGE = ROOT / 'docs/verification/unified-candidate06/mac-ordinary-sidebar-independent11'
EXE = ROOT / 'artifacts/unified-candidate06/mac-ordinary-sidebar-build11/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone'
EXE_SHA = '3cc7188dff3213fdf1e7ca7c85373d3fe937ff8de8158fb187cb8679614e200d'
SOURCE = '94fbbb36fe94a7f291edf34e618091a0cec8da63'
checks = []

def load(p):
    return json.loads(p.read_text())

def save(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

def record(p):
    b = p.read_bytes()
    return {'path': str(p.relative_to(ROOT)), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}

def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})

protected = set()
for directory, expected in [(RUNTIME, 59), (RESEARCH, 12), (PACKAGE, 12)]:
    p = directory / 'evidence-index.json'
    d = load(p)
    protected.add(p)
    check('indexed count ' + directory.name, len(d['files']) == expected)
    for row in d['files']:
        f = (ROOT if directory == PACKAGE else directory) / row['path']
        protected.add(f)
        actual = record(f)
        check('index hash ' + str(f.relative_to(ROOT)), all(actual[k] == row[k] for k in ['bytes', 'sha256']))
for row in load(RESEARCH / 'input-manifest.json')['inputs']:
    p = ROOT / row['path']
    protected.add(p)
    actual = record(p)
    check('research input ' + row['path'], all(actual[k] == row[k] for k in ['bytes', 'sha256']))
protected.add(EXE)
initial = [record(p) for p in sorted(protected)]
save('input-initial.json', {'scope': 'Selected static evidence inputs, not a repeat of the 486 package checks', 'at': datetime.now().astimezone().isoformat(), 'files': initial})
check('sealed runtime index exact', record(RUNTIME / 'evidence-index.json')['sha256'] == 'ae016160625668f328aa5be970a956d82d79ec34c6128e7fafa2d8dde7f99951')
check('current executable exact accepted Mac11', record(EXE)['sha256'] == EXE_SHA)
p = load(PACKAGE / 'result.json')
check('accepted independent package source and result', p['status'] == 'pass' and p['failed'] == 0 and p['assertions'] == 486 and p['sourceHeadSuppliedByRoot'] == SOURCE)
check('accepted bundle inventory executable', next(x for x in p['bundleInventories']['sealed'] if x['path'] == 'Contents/MacOS/notes-clone')['sha256'] == EXE_SHA)

def ax(prefix):
    return next(RUNTIME.glob(prefix + '-*.ax.txt')).read_text()

visible = ['05', '08', '11', '17', '22', '24', '32']
hidden = ['06', '10', '18', '20', '28']
body = ['QA-SMART-U09-Mac-Tag', '本地智能文件夹验收。', '#QASmartU09']
counts = ['全部备忘录 41', 'QA-SMART-U09-Mac-R18 0', 'QA-SMART-U09-Mac-Selected 1', 'Notes Clone UI 对照 8']
for prefix in visible + hidden:
    t = ax(prefix)
    check(prefix + ' full AX body and toolbar toggle', t.startswith('Window:') and 'diff from' not in t and all(s in t for s in body) and 'button 显示或隐藏文件夹' in t)
    check(prefix + ' sidebar layout', all(s in t for s in counts) and 'button 新建文件夹' in t and t.count('splitter 调整分栏宽度') == 2 if prefix in visible else all(s not in t for s in counts) and 'button 新建文件夹' not in t and t.count('splitter 调整分栏宽度') == 1)
check('hidden menu offers show', '显示文件夹' in ax('07') and '隐藏文件夹' not in ax('07'))
check('visible menu offers hide', '隐藏文件夹' in ax('09') and '显示文件夹' not in ax('09'))
check('07 and09 have no screenshot artifacts', not list(RUNTIME.glob('07-*.cua-image')) and not list(RUNTIME.glob('09-*.cua-image')))
check('03 prior AX is no-change diff only', 'no change' in ax('03').lower() or 'no changes' in ax('03').lower())
check('default selected name', 'Selected text:' in ax('12') and '新建文件夹' in ax('12'))
for prefix, state in [('14', 0), ('15', 1), ('16', 0)]:
    check(prefix + ' retains draft and checkbox', '名称, Value: QA-SURFACE-23-CANCEL' in ax(prefix) and 'checkbox 制作智能文件夹, Value: ' + str(state) in ax(prefix))
check('smart controls only15', '过滤条件类型, Value: 标签' in ax('15') and '标签模式, Value: 所有已选' in ax('15') and '过滤条件类型' not in ax('14') and '过滤条件类型' not in ax('16'))
check('cancelled draft absent visible endpoint', 'QA-SURFACE-23-CANCEL' not in ax('17') and 'container 新建文件夹' not in ax('17'))

process_names = ['05a-mac11-process.json', '19-normal-hidden-quit-process.json', '21-normal-hidden-relaunched-process.json', '23-normal-visible-quit-process.json', '25-normal-visible-relaunched-process.json', '27-fast-hidden-quit-process.json', '29-fast-hidden-relaunched-process.json', '31-fast-visible-quit-process.json', '33-final-process.json']
expected_pids = [[45493], [], [45907], [], [45957], [], [46007], [], [46056]]
processes = [load(RUNTIME / n) for n in process_names]
for name, d, expected in zip(process_names, processes, expected_pids):
    check(name + ' exact identity', d['executable'] == str(EXE) and d['exists'] and d['sha256'] == EXE_SHA and d['psExit'] == 0 and d['stderr'] == '' and [r['pid'] for r in d['matchingRows']] == expected and all(r['executable'] == str(EXE) for r in d['matchingRows']))
times = [datetime.fromisoformat(d['at']) for d in processes]
check('process records chronologically ordered', all(a < b for a, b in zip(times, times[1:])))
timed = []
for filename, before_i, empty_i, after_i, expected_gap in [('26-fast-hide-quit-action.json', 4, 5, 6, 29), ('30-fast-show-quit-action.json', 6, 7, 8, 758)]:
    d = load(RUNTIME / filename)
    start, click, quit_ = [datetime.fromisoformat(d[k].replace('Z', '+00:00')) for k in ['startedAt', 'clickReturnedAt', 'quitReturnedAt']]
    gap = round((quit_ - click).total_seconds() * 1000)
    check(filename + ' bounded order and recorded gap', times[before_i] < start < click < quit_ < times[empty_i] < times[after_i] and d['noInterveningObservation'] is True and d['sequence'][1] == 'Cmd+Q' and gap == expected_gap)
    timed.append({'file': filename, 'toolReturnGapMs': gap, 'deliveryLatencyProven': False})

images = []
for pth in sorted(RUNTIME.glob('*.cua-image')) + sorted(RESEARCH.glob('*.png')):
    with Image.open(pth) as im:
        im.load()
        images.append({'path': str(pth.relative_to(ROOT)), 'format': im.format, 'size': list(im.size), 'iccBytes': len(im.info.get('icc_profile', b'')), 'iccSha256': hashlib.sha256(im.info.get('icc_profile', b'')).hexdigest()})
        check('decode ' + pth.name, im.format == ('PNG' if pth.suffix == '.png' else 'JPEG'))
for row in load(RESEARCH / 'evidence-index.json')['decodedImages']:
    actual = next(x for x in images if x['path'] == str((RESEARCH / row['path']).relative_to(ROOT)))
    check('research PNG metadata ' + row['path'], actual['size'] == row['size'] and actual['iccBytes'] == row['iccBytes'])
m = load(RESEARCH / 'measurements.json')
for d in m['inputs'].values():
    rec = record(ROOT / d['source'])
    im = next(x for x in images if x['path'] == d['source']) if d['source'].startswith(str(RUNTIME.relative_to(ROOT))) else None
    with Image.open(ROOT / d['source']) as source_im:
        check('measurement input metadata ' + d['source'], rec['sha256'] == d['sha256'] and list(source_im.size) == d['nativeSize'] and hashlib.sha256(source_im.info['icc_profile']).hexdigest() == d['iccSha256'])
c = m['comparisons']; ref = c['Original Apple Notes (one reference)']; old = c['Old Mac10 / runtime18']; new = c['New Mac11 / runtime23-12']
for label, d in [('old', old), ('new', new)]:
    error = sum(abs(a-b) for corner in ref['bright230CornerInsets'] for a,b in zip(ref['bright230CornerInsets'][corner], d['bright230CornerInsets'][corner]))
    check(label + ' corner JSON arithmetic', error == d['cornerAbsoluteErrorVsReference'])
check('finite median equality and remaining mask difference', new['medianSrgb'] == ref['medianSrgb'] and new['checkbox']['maskDisagreementVsReference'] == 8 and old['checkbox']['maskDisagreementVsReference'] == 616)
check('remaining text offsets and blue selection recorded', new['textInkRaw']['name']['160']['bbox'][0] - ref['textInkRaw']['name']['160']['bbox'][0] == 4 and new['textInkRaw']['smartLabel']['160']['bbox'][0] - ref['textInkRaw']['smartLabel']['160']['bbox'][0] == 2 and new['focus']['selectionTopBarSrgb'] == [184.0, 215.0, 248.0] and ref['focus']['selectionTopBarSrgb'] == [252.0, 234.0, 193.0])
check('reference remains one identical sample', record(RUNTIME / '01-original-ordinary-active.cua-image')['sha256'] == record(ROOT / 'docs/verification/mac-folder-fixes-runtime18/00-original-ordinary.cua-image')['sha256'])
for a,b in [('20-normal-relaunch-hidden.cua-image', '28-fast-relaunch-hidden.cua-image'), ('24-normal-relaunch-visible.cua-image', '32-fast-relaunch-visible-final.cua-image')]:
    check('duplicate endpoint pixels ' + a, record(RUNTIME / a)['sha256'] == record(RUNTIME / b)['sha256'])

# Reviewer contact sheets are navigation aids only; no registration or pixel analysis.
for sheet_name, prefixes in [('routes-endpoints', ['05', '06', '08', '10', '11', '17', '18', '20', '22', '24', '28', '32']), ('draft-states', ['12', '13', '14', '15', '16'])]:
    canvas = Image.new('RGB', (1200, ((len(prefixes)+2)//3)*390), '#dddddd')
    draw = ImageDraw.Draw(canvas)
    for i,prefix in enumerate(prefixes):
        pth = next(RUNTIME.glob(prefix + '-*.cua-image'))
        with Image.open(pth) as im:
            im = im.convert('RGB'); im.thumbnail((396, 360))
            x,y = (i%3)*400, (i//3)*390
            canvas.paste(im, (x,y+25)); draw.text((x+4,y+4), pth.stem, fill='black')
    canvas.save(OUT / (sheet_name + '.png'))
save('static-audit.json', {'status': 'pass' if all(x['passed'] for x in checks) else 'fail', 'scope': 'Finite static evidence audit only; no app or analyzer execution', 'sourceIdentityViaAcceptedPackage': SOURCE, 'executableSHA256': EXE_SHA, 'checks': checks, 'checkCount': len(checks), 'failed': sum(not x['passed'] for x in checks), 'processPids': expected_pids, 'timedActions': timed, 'decodedImages': images})
print(json.dumps({'checks': len(checks), 'failed': [x for x in checks if not x['passed']], 'protectedFiles': len(initial)}, ensure_ascii=False))
