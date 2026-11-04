"""Read frozen local AX/JPEG/process evidence; no app/platform/GUI operations."""
from pathlib import Path
from PIL import Image
import datetime
import hashlib
import json
import re
import shutil

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
SOURCE = ROOT / 'docs/verification/candidate06-mac-sidebar-runtime-01'
OUT = ROOT / 'docs/verification/candidate06-mac-sidebar-independent-01'
BODY = 'QA-WIDE-20261104-05\n宽三栏工具栏与搜索对照。\n仅本地合成内容。'


def identity(p, base):
    return {'path': str(p.relative_to(base)), 'bytes': p.stat().st_size,
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}


def aggregate(rows):
    return hashlib.sha256(''.join(r['sha256'] + '  ' + r['path'] + '\n' for r in rows).encode()).hexdigest()


def source_snapshot():
    return [identity(p, SOURCE) for p in sorted(SOURCE.rglob('*')) if p.is_file()]


checks = []


def check(name, value):
    checks.append({'name': name, 'pass': bool(value)})
    if not value:
        raise AssertionError(name)


started = datetime.datetime.now(datetime.timezone.utc).isoformat()
free = shutil.disk_usage(OUT).free
check('free>=2GiB', free >= 2 * 1024**3)
before = source_snapshot()
ax = {}
for p in sorted(SOURCE.glob('*.ax.txt')):
    text = p.read_text()
    ax[int(p.name[:2])] = {'path': p.name, 'text': text,
        'directToggle': bool(re.search(r'^\t\d+ button 显示或隐藏文件夹$', text, re.M)),
        'sidebarVisible': 'button 快速备忘录 3' in text and 'text 在我的 Mac 上' in text,
        'nativeNewFolder': bool(re.search(r'^\t\d+ button 新建文件夹$', text, re.M)),
        'backToGallery': bool(re.search(r'^\t\d+ button 返回画廊$', text, re.M)),
        'exactThreeLineEditorValue': bool(re.search(r'(?:备忘录正文, Value: |Note Body Text View.*?Value: )' + re.escape(BODY), text)),
        'qaGalleryCard': 'button QA-WIDE-20261104-05 宽三栏工具栏与搜索对照。 仅本地合成内容。 QA-WIDE-20261104-05' in text,
        'selectedFolderCount': 'Value: Notes Clone UI 对照 3 个备忘录' in text}
images = []
for p in sorted(SOURCE.glob('*.cua-image')):
    with Image.open(p) as im:
        im.load()
        images.append({**identity(p, SOURCE), 'format': im.format,
                       'width': im.width, 'height': im.height, 'mode': im.mode})
check('20 original JPEG images decode', len(images) == 20 and all(i['format'] == 'JPEG' and (SOURCE / i['path']).read_bytes().startswith(b'\xff\xd8') for i in images))
check('22 AX records', len(ax) == 22)
for start, hidden, restored, mode in [(3,4,5,'list'), (8,9,10,'wide-list'), (11,12,13,'gallery'), (14,15,16,'expanded-gallery'), (19,20,21,'cold-list')]:
    check(mode + ' visible hidden restored sidebar', [ax[n]['sidebarVisible'] for n in (start, hidden, restored)] == [True, False, True])
    check(mode + ' direct native toggle throughout', all(ax[n]['directToggle'] for n in (start, hidden, restored)))
    check(mode + ' native new folder absent while hidden', [ax[n]['nativeNewFolder'] for n in (start, hidden, restored)] == [True, False, True])
    check(mode + ' same selected folder count', all(ax[n]['selectedFolderCount'] for n in (start, hidden, restored)))
    if mode != 'gallery':
        check(mode + ' exact same three-line visible editor value', all(ax[n]['exactThreeLineEditorValue'] for n in (start, hidden, restored)))
    else:
        check(mode + ' exact QA card label maintained', all(ax[n]['qaGalleryCard'] for n in (start, hidden, restored)))
check('expanded gallery back button coexists with toggle', all(ax[n]['backToGallery'] and ax[n]['directToggle'] for n in (14,15,16)))
check('clone hidden menu fixed label and menu-restored sidebar', '显示/隐藏文件夹, ID: customAction:' in ax[6]['text'] and ax[7]['sidebarVisible'] and ax[7]['exactThreeLineEditorValue'] and ax[7]['directToggle'])
check('list-return snapshot matches list shape and body', ax[17]['exactThreeLineEditorValue'] and ax[17]['sidebarVisible'] and 'splitter 调整分栏宽度' in ax[17]['text'])
check('old05 hidden snapshot lacks direct toggle', not ax[2]['directToggle'] and not ax[2]['sidebarVisible'] and ax[2]['exactThreeLineEditorValue'])
check('original hidden/restored body and direct button', all(ax[n]['exactThreeLineEditorValue'] and '按钮 Description: 文件夹' in ax[n]['text'] for n in (0,1)) and '外框 文件夹' not in ax[0]['text'] and '外框 文件夹' in ax[1]['text'])
check('original restored split values228/360', '分离器 (disabled, settable, float) 228' in ax[1]['text'] and '分离器 (disabled, settable, float) 360' in ax[1]['text'])
menu_path = ROOT / 'docs/research/mac-sidebar-original-20261104-01/02-hidden-view-menu.ax.txt'
check('original menu dynamic labels evidence', '显示文件夹' in menu_path.read_text() and re.search(r'^\t\t\d+ 隐藏文件夹$', ax[22]['text'], re.M))
dimensions = {int(i['path'][:2]): [i['width'], i['height']] for i in images}
check('ordinary canvas2176x1320', all(dimensions[n] == [2176,1320] for n in (2,3,4,5,7,19,20,21)))
check('wide canvas2786x1806', all(dimensions[n] == [2786,1806] for n in (0,1,8,9,10,11,12,13,14,15,16,17)))
check('zoom canvas changed wider', dimensions[8][0] > dimensions[7][0] and dimensions[8][1] > dimensions[7][1])
processes = {p.name: json.loads(p.read_text()) for p in SOURCE.glob('*process*.json')}
p03 = processes['03-process-identity.json']
p18 = processes['18-normal-quit-process.json']
p19 = processes['19-reopen-process-identity.json']
expected_exe = str(ROOT / 'artifacts/unified-candidate06/mac-build01/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone')
expected_sha = '152ad9e5f9fe0bc6eeab2f08bb6980b2610884ec8b43f9610ad4bc0d883f7f6c'
check('exact executable identity recorded before and after', all(p['executable'] == expected_exe and p['bytes'] == 15990560 and p['sha256'] == expected_sha and expected_exe in p['runningProcess'] for p in (p03,p19)))
check('different process identity recorded after reopen', p03['oldPid'] == 72706 and p03['oldPidAbsentAfterNormalQuit'] is True and p03['runningProcess'].split()[0] == '80892' and p18['normalQuitPid'] == p19['priorPid'] == 80892 and p18['exit'] == 1 and p18['stdout'] == '' and p19['newPid'] == 82135 and p19['runningProcess'].split()[0] == '82135')
mac = json.loads((ROOT / 'docs/verification/unified-candidate06/mac-independent01/result.json').read_text())
check('recorded runtime executable matches independent complete package check', next(r for r in mac['bundles']['sealed']['files'] if r['path'] == 'Contents/MacOS/notes-clone')['sha256'] == expected_sha)
after = source_snapshot()
check('all source evidence bytes stable during review', before == after)
result = {'schema':1, 'startedAt':started, 'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'conclusion':'SUPPORTED LIMITED OBSERVATIONS; overall sidebar/pixel acceptance remains open',
    'checks':checks, 'diskFreeBefore':free, 'sourceFiles':after, 'sourceAggregate':aggregate(after),
    'sourceFileCount':len(after), 'sourceBytes':sum(r['bytes'] for r in after),
    'images':images, 'axStates':[{k:v for k,v in item.items() if k != 'text'} for item in ax.values()],
    'processRecords':processes, 'extraEvidence':[identity(menu_path,ROOT),identity(ROOT / 'docs/verification/unified-candidate06/mac-independent01/result.json',ROOT)],
    'zoomFinding':'07 JPEG2176x1320 ->08 JPEG2786x1806;09–17 same wider canvas;19–21 back2176x1320. No narrow-window acceptance, native logical frame/DPR not recorded.',
    'limits':'Snapshot sequence checked against authored action narrative; no independent live action replay. 18-process record lacks argv and alone does not establish command semantics. No complete DB/JSON, persistence/hidden-state retention, lossless pixel, continuous window/split drag or final menu-fix build acceptance.'}
with (OUT / 'result.json').open('x') as s:
    s.write(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'conclusion':result['conclusion'],'checks':len(checks),'sourceFiles':len(after),'sourceBytes':result['sourceBytes'],'sourceAggregate':result['sourceAggregate'],'result':identity(OUT / 'result.json',ROOT)},ensure_ascii=False))
