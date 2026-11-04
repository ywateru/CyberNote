from pathlib import Path
import datetime
import hashlib
import json
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
RUNTIME = ROOT / 'docs/verification/candidate06-mac-sidebar-menu-runtime-02'
MIN_FREE = 2 * 1024**3
assert shutil.disk_usage(OUT).free >= MIN_FREE

def digest(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}

def write(name, value):
    assert shutil.disk_usage(OUT).free >= MIN_FREE
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def record(name):
    return json.loads((RUNTIME / name).read_text())

checks = []
def check(name, condition, evidence):
    checks.append({'name': name, 'pass': bool(condition), 'evidence': evidence})
    assert condition, name

ax = {p.name: p.read_text() for p in RUNTIME.glob('*.ax.txt')}
visible = ['01-new-visible.ax.txt', '05-menu-restored.ax.txt',
           '15-list-restored.ax.txt', '16-list-direct-restored.ax.txt',
           '18-cold-loaded.ax.txt', '21-cold-restored.ax.txt']
hidden = ['03-menu-hidden-direct-toggle.ax.txt', '06-toolbar-hidden.ax.txt',
          '08-gallery-hidden.ax.txt', '11-expanded-hidden.ax.txt',
          '19-cold-hidden.ax.txt']
body = 'QA-WIDE-20261104-05\n宽三栏工具栏与搜索对照。\n仅本地合成内容。'
for name in visible:
    check('visible sidebar and same three-line editor: ' + name,
          'button 快速备忘录 3' in ax[name] and body in ax[name]
          and 'button 显示或隐藏文件夹' in ax[name], [name])
for name in hidden:
    check('hidden sidebar retains direct toggle: ' + name,
          'button 快速备忘录 3' not in ax[name]
          and 'button 显示或隐藏文件夹' in ax[name], [name])
for name in ['02-visible-menu-hide-label.ax.txt', '10-gallery-visible-menu.ax.txt',
             '22-cold-visible-menu.ax.txt']:
    check('visible menu says hide: ' + name,
          '隐藏文件夹, ID: customAction:' in ax[name]
          and '显示文件夹, ID: customAction:' not in ax[name], [name])
for name in ['04-hidden-menu-show-label.ax.txt', '07-refocused-hidden-menu.ax.txt',
             '12-expanded-hidden-menu.ax.txt', '20-cold-hidden-menu.ax.txt']:
    check('hidden menu says show: ' + name,
          '显示文件夹, ID: customAction:' in ax[name]
          and '隐藏文件夹, ID: customAction:' not in ax[name], [name])
check('gallery browse restored sidebar and same synthetic card text',
      'button 快速备忘录 3' in ax['09-gallery-restored.ax.txt']
      and all(s in ax['09-gallery-restored.ax.txt'] for s in body.splitlines()),
      ['08-gallery-hidden.ax.txt', '09-gallery-restored.ax.txt', '10-gallery-visible-menu.ax.txt'])
check('gallery expanded retains back button and same editor through restore',
      all('button 返回画廊' in ax[n] and body in ax[n]
          for n in ['11-expanded-hidden.ax.txt', '13-expanded-menu-restored.ax.txt'])
      and 'button 快速备忘录 3' in ax['13-expanded-menu-restored.ax.txt'],
      ['11-expanded-hidden.ax.txt', '12-expanded-hidden-menu.ax.txt', '13-expanded-menu-restored.ax.txt'])

start = record('01-process-identity.json')
cold = record('18-cold-process-identity.json')
exe = ROOT / 'artifacts/unified-candidate06/mac-menu-build02/mac-attempt01/mac-sealed.app/Contents/MacOS/notes-clone'
expected_sha = '731695caf7c83a3db3bfd047da9705e0e73fd4791f048b7f21e4c9a17e502ffb'
expected_head = 'b5063fd246c3433881ce9c35729389a7d87e0f2e'
exe_identity = digest(exe)
check('exact preserved executable and recorded source',
      exe_identity['bytes'] == start['bytes'] == cold['bytes'] == 16013344
      and exe_identity['sha256'] == start['sha256'] == cold['sha256'] == expected_sha
      and start['sourceHead'] == cold['sourceHead'] == expected_head,
      ['01-process-identity.json', '18-cold-process-identity.json'])
check('recorded argv and distinct cold PID refer to exact executable',
      start['argv'] == cold['argv'] == ['ps', '-axo', 'pid=,lstart=,command=']
      and len(start['matchingExactExecutable']) == len(cold['matchingExactExecutable']) == 1
      and re.match(r'^85974\s', start['matchingExactExecutable'][0]) is not None
      and re.match(r'^86273\s', cold['matchingExactExecutable'][0]) is not None
      and start['matchingExactExecutable'][0].endswith(str(exe))
      and cold['matchingExactExecutable'][0].endswith(str(exe))
      and cold['priorPid'] == 85974 and cold['newPid'] == 86273,
      ['01-process-identity.json', '18-cold-process-identity.json'])
for filename, pid in [('00-prior-normal-quit.json', '82135'), ('17-normal-quit.json', '85974')]:
    q = record(filename)
    check('recorded normal CmdQ followed by exact PID absent: ' + pid,
          q['operation'] == 'normal-CmdQ-via-CUA'
          and q['argv'] == ['ps', '-p', pid, '-o', 'pid=,lstart=,command=']
          and q['exit'] == 1 and q['stdout'] == '' and q['stderr'] == '', [filename])

correction = record('14-evidence-path-correction.json')
check('21 path correction entries retain exact bytes and hashes',
      len(correction['moves']) == 21 and all(
          digest(ROOT / m['to']) == {'path': m['to'], 'bytes': m['bytes'], 'sha256': m['sha256']}
          and not (ROOT / m['from']).exists() for m in correction['moves']),
      ['14-evidence-path-correction.json'])
argv = ['git', 'diff', '--exit-code', 'HEAD', '--', 'docs/verification/candidate06-mac-sidebar-runtime-01']
proc = subprocess.run(argv, cwd=ROOT, text=True, capture_output=True)
write('old-frozen-diff.json', {'argv': argv, 'exitCode': proc.returncode,
                             'stdout': proc.stdout, 'stderr': proc.stderr})
check('old tracked frozen evidence has no diff against HEAD',
      proc.returncode == 0 and proc.stdout == '' and proc.stderr == '', ['old-frozen-diff.json'])
images = list(RUNTIME.glob('*.cua-image'))
check('all CUA image records are JPEG, no lossless pixel claim',
      len(images) == 13 and all(p.read_bytes().startswith(b'\xff\xd8\xff') for p in images),
      [p.name for p in images])
package_result = ROOT / 'docs/verification/unified-candidate06/mac-menu-independent02/result.json'
package_review = json.loads(package_result.read_text())
check('existing package independent review source linkage',
      package_review['sourceHead'] == expected_head
      and package_review['conclusion'].startswith('PASS:'), [str(package_result.relative_to(ROOT))])

inputs = [digest(p) for p in sorted(RUNTIME.iterdir()) if p.is_file()]
input_aggregate = hashlib.sha256(''.join(e['sha256'] + '  ' + e['path'] + '\n' for e in inputs).encode()).hexdigest()
write('input-files.json', {'files': inputs, 'fileCount': len(inputs),
                         'totalBytes': sum(e['bytes'] for e in inputs), 'aggregateSha256': input_aggregate})
write('result.json', {
    'schema': 'notesclone.mac.sidebar-menu.runtime-independent.v1',
    'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'conclusion': 'PASS: bounded recorded sidebar/menu runtime evidence; overall product remains partial',
    'rootStatus': 'partial', 'sourceHead': expected_head, 'executable': exe_identity,
    'recordedFirstPid': 85974, 'recordedColdPid': 86273,
    'checks': checks, 'inputAggregateSha256': input_aggregate,
    'packageIndependentResult': digest(package_result),
    'pathCorrection': {'entries': 21, 'hashesMatch': True, 'oldTrackedDiffEmpty': True,
                       'note': correction['reason']},
    'limits': ['Only recorded AX/JPEG/identity evidence reviewed; no GUI, ADB, platform command, target or build run',
               'JPEG does not establish lossless pixel equality',
               'OS frontmost/Focused event timing was not directly tracked',
               'Full DB/JSON preservation not verified; only visible same synthetic three-line editor/card text checked',
               'Hidden-state persistence across restart has no established original-app contract in this round',
               'Runtime assertions concern recorded states, not independent replay or current live PID observation',
               'Prior runtime source records preserved; 21 new records were atomically renamed as documented; rename operation is reported provenance, while current bytes and old tracked diff are independently checked'],
    'freeBytes': shutil.disk_usage(OUT).free, 'mainCommitByReviewer': False})
print(json.dumps({'checks': len(checks), 'allPass': all(c['pass'] for c in checks),
                  'runtimeFiles': len(inputs), 'runtimeBytes': sum(e['bytes'] for e in inputs),
                  'inputAggregateSha256': input_aggregate}, indent=2))
