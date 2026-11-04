"""Read-only independent check of candidate06 sidebar-build05 preserved Mac artifacts and records.

Does not import build tooling, execute platform tools, read target/cache, or launch apps.
Writes only its own new result file. ZIP members are read in memory, never extracted.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import stat
import subprocess
import zipfile

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/unified-candidate06/mac-sidebar-independent05'
RUN = ROOT / 'docs/verification/unified-candidate06/mac-sidebar-build05'
ATTEMPT = RUN / 'mac-attempt02'
ART = ROOT / 'artifacts/unified-candidate06/mac-sidebar-build05/mac-attempt02'
SOURCE = '093986d170ef279fbce0f66e59891fd5f94aecad'
FREEZE = '1060739979cefa530c3f9a50debb32091c6e5f72e7da98c6294ba4b70e42d1fe'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def ident(p):
    return {'path': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size,
            'sha256': digest(p.read_bytes())}


def load(p):
    return json.loads(p.read_text())


def aggregate(rows):
    return digest(''.join(r['sha256'] + '  ' + r['path'] + '\n' for r in rows).encode())


checks = []


def check(name, condition):
    checks.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name)


def bundle(p):
    rows = []
    for item in sorted(p.rglob('*')):
        mode = item.lstat().st_mode
        check('regular bundle entry: ' + str(item.relative_to(ART)),
              stat.S_ISREG(mode) or stat.S_ISDIR(mode))
        if stat.S_ISREG(mode):
            rows.append({**ident(item), 'path': str(item.relative_to(p)),
                         'type': 'file', 'mode': stat.S_IMODE(mode)})
    return rows


started = datetime.datetime.now(datetime.timezone.utc).isoformat()
free = shutil.disk_usage(OUT).free
check('free space >=2GiB', free >= 2 * 1024**3)
f = load(RUN / 'input-freeze.json')
b = load(ATTEMPT / 'result.json')
c = load(ATTEMPT / 'collection/result.json')
check('exact build result SHA256', ident(ATTEMPT / 'result.json')['sha256'] == 'c17d4f8a5b5228003e5887e411136fefe3807127204f6a8d3a0cac5aa55cc1d8')
check('exact collection result SHA256', ident(ATTEMPT / 'collection/result.json')['sha256'] == 'de4112837c1d56848b7440f48ac172dcd796e0ea3076b90e0a6a5386f4118aee')
summary = load(RUN / 'freeze-summary.json')
check('freeze summary linkage', summary['sourceHead'] == SOURCE and summary['productAggregate'] == f['productAggregate'] and summary['inputAggregate'] == f['aggregate'] and summary['freeze'] == {**ident(RUN / 'input-freeze.json'), 'path': str(RUN / 'input-freeze.json')})
check('exact freeze SHA256', ident(RUN / 'input-freeze.json')['sha256'] == FREEZE)
check('exact root authorization SHA256', ident(ROOT / 'docs/verification/unified-candidate06/root-authorization-mac-sidebar-build05.json')['sha256'] == '10dc74c888702d06a7dfa568c13db8e18f5b9d56d0bf35a9a4147ce9dccb01bb')
check('current HEAD exact source', subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip() == SOURCE)
check('exact source and Mac stage', all(x['expectedHead'] == SOURCE and x['stage'] == 'mac' for x in (b, c)) and f['head'] == SOURCE and f['stage'] == 'mac')
check('authorization and input paths', f['authorization'] == load(ROOT / 'docs/verification/unified-candidate06/root-authorization-mac-sidebar-build05.json') and f['authorization']['sourceHead'] == SOURCE and f['authorization']['inputPaths'] == [r['path'] for r in f['files']] and f['authorization']['productPaths'] == [r['path'] for r in f['productFiles']])
check('explicit expected aggregates', f['productAggregate'] == 'c888cc902f9f05da636c827c2b030200732967bcfd4fb52743000e877333bc60' and f['aggregate'] == 'aa8a862312b923f56bb4046dbacd780175a79bf080991647a38e5d121392ea28')
check('source/freeze/aggregate linkage', all(x['freezeSha256'] == FREEZE and x['productAggregate'] == f['productAggregate'] and x['sourceAggregate'] == f['aggregate'] for x in (b, c)))
check('build result exact collector identity', {**ident(ATTEMPT / 'result.json'), 'path': str(ATTEMPT / 'result.json')} == c['buildResult'])
check('build nonce and exact command', c['buildNonce'] == b['nonce'] and len(b['nonce']) == 32 and b['command'] == ['pnpm', 'mac:build'])
check('build success gates', b['exitCode'] == 0 and b['ownedGroupStopped'] is True and b['remainingOwnedGroupMembers'] == [] and b['generatedOutputs'] and b['supplementalInputsUnchanged'] is True and all(b['inputComparisons'].values()) and not any(k in b for k in ['error', 'invalidated', 'offlineMarkerMissing', 'cleanupError', 'stopReason', 'groupCleanupError']))
check('collector success gates', c['ready'] is True and c['preservedOriginalUnchanged'] is True and c['supplementalInputsUnchangedDuringCollection'] is True and all(c['inputComparisons'].values()) and not any(k in c for k in ['error', 'invalidated', 'cleanupError', 'stopReason', 'groupCleanupError']))
check('output provenance JSON linkage', load(ATTEMPT / 'output-isolation.json') == b['outputIsolation'] and load(ATTEMPT / 'generated-outputs.json') == b['generatedOutputs'] and b['outputIsolation']['sourcePathsAbsentBeforeCommand'] is True)
snapshot_names = ['inputs-before.json', 'inputs-after.json', 'collection/inputs-before-collection.json', 'collection/inputs-after-collection.json']
for name in snapshot_names:
    value = load(ATTEMPT / name)
    check('recorded freeze equality: ' + name, all(value[k] == v for k, v in f.items() if k != 'at'))

current_inputs = []
for row in f['files']:
    p = ROOT / row['path']
    check('input outside target/cache: ' + row['path'], not (set(p.relative_to(ROOT).parts) & {'target', '.gradle', '.cache', 'build'}))
    value = ident(p)
    if p.is_symlink():
        value['symlinkTarget'] = os.readlink(p)
    check('current input identity: ' + row['path'], value == row)
    current_inputs.append(value)
check('current302 aggregate', len(current_inputs) == 302 and aggregate(current_inputs) == f['aggregate'])
current_map = {r['path']: r for r in current_inputs}
check('current238 product aggregate', len(f['productFiles']) == 238 and all(current_map[r['path']] == r for r in f['productFiles']) and aggregate(f['productFiles']) == f['productAggregate'])
git_tree = subprocess.check_output(['git', 'ls-tree', '-r', '-z', SOURCE, '--', *[r['path'] for r in f['productFiles']]], cwd=ROOT)
git_blobs = {}
for entry in git_tree.split(b'\0'):
    if entry:
        header, name = entry.split(b'\t', 1)
        git_blobs[name.decode()] = header.split()[2].decode()
check('all238 product paths in exact source commit', len(git_blobs) == 238 and set(git_blobs) == {r['path'] for r in f['productFiles']})
for path, oid in git_blobs.items():
    p = ROOT / path
    data = os.readlink(p).encode() if p.is_symlink() else p.read_bytes()
    check('source commit blob identity: ' + path, hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == oid)
for row in f['tools']:
    check('frozen tool identity: ' + row['path'], {**ident(ROOT / 'docs/verification/unified-candidate06/preparation' / row['path']), 'path': row['path']} == row)

bundles = {}
archives = {}
for name in ('original', 'sealed'):
    app = ART / ('mac-' + name + '.app')
    rows = bundle(app)
    bundles[name] = {'files': rows, 'aggregate': aggregate(rows)}
    check(name + ' complete bundle identity', rows == c[name]['bundleFiles'] and aggregate(rows) == c[name]['bundleAggregate'])
    check(name + ' executable identity', {**ident(app / 'Contents/MacOS/notes-clone'), 'path': str(app / 'Contents/MacOS/notes-clone')} == c[name]['executable'])
    archive = ART / ('mac-' + name + '.zip')
    archives[name] = ident(archive)
    check(name + ' ZIP current identity', {**ident(archive), 'path': str(archive)} == c[name]['archive'])
    with zipfile.ZipFile(archive) as z:
        items = z.infolist()
        check(name + ' ZIP no duplicate names', len(items) == len({i.filename for i in items}))
        check(name + ' ZIP CRC', z.testzip() is None)
        payload = {}
        for item in items:
            if item.is_dir() or item.filename.startswith('__MACOSX/'):
                continue
            check(name + ' ZIP member rooted in bundle', item.filename.startswith(app.name + '/'))
            payload[item.filename[len(app.name) + 1:]] = {'bytes': item.file_size, 'sha256': digest(z.read(item)), 'mode': stat.S_IMODE(item.external_attr >> 16)}
        check(name + ' ZIP complete payload matches current bundle', payload == {r['path']: {k: r[k] for k in ('bytes', 'sha256', 'mode')} for r in rows})
        archives[name]['entries'] = [{'path': i.filename, 'bytes': i.file_size} for i in items]
check('original matches actual generated output record', bundles['original']['files'] == b['buildOutputIdentity']['bundleFiles'] == b['generatedOutputs'][0]['snapshot']['files'])
old = {r['path']: r for r in bundles['original']['files']}
new = {r['path']: r for r in bundles['sealed']['files']}
changes = [{'path': p, 'before': old.get(p), 'after': new.get(p)} for p in sorted(old.keys() | new.keys()) if old.get(p) != new.get(p)]
check('only recorded sealing changes', changes == c['sealingChanges'] and {r['path'] for r in changes} == {'Contents/MacOS/notes-clone', 'Contents/_CodeSignature/CodeResources'})
check('sealed executable expected exact bytes', c['sealed']['executable']['bytes'] == 16013696 and c['sealed']['executable']['sha256'] == '333b356ab62a0f0c55a8f67c9d7bc51bf424eb1f37dccdcb40f4b9b140bc7be7')
check('sealed ZIP exact expected bytes', archives['sealed']['bytes'] == 4751569 and archives['sealed']['sha256'] == 'ff3317642232bc1ae6aace93f910c5754b032ea086590649409790eb008d1898')
check('actual collector command structure', len(c['commands']) == 13 and [x['exitCode'] for x in c['commands']] == [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])
check('exact recorded sealed signing argv', c['sealedSign']['argv'] == ['/usr/bin/codesign', '--force', '--sign', '-', '--timestamp=none', str(ART / 'mac-sealed.app')])
for i, command in enumerate(c['commands'], 1):
    check('command raw log linkage %02d' % i, Path(command['log']) == ART / ('command-%02d.txt' % i) and Path(command['log']).read_text() == command['stdout'])
    check('command completion %02d' % i, command['ownedGroupStopped'] is True and command['remainingOwnedGroupMembers'] == [] and command['exitCode'] == (1 if i == 6 else 0) and not any(k in command for k in ['error', 'stopReason', 'groupCleanupError']))
check('original strict failure retained', c['originalSignature'] == c['commands'][2:6] and c['originalSignature'][-1]['exitCode'] == 1 and 'code has no resources but signature indicates they must be present' in c['originalSignature'][-1]['stdout'])
check('sealed signing and strict pass retained', c['sealedSign'] == c['commands'][7] and c['sealedVerify'] == c['commands'][8] and c['sealedVerify']['exitCode'] == 0 and 'valid on disk' in c['sealedVerify']['stdout'] and c['sealedDisplays'] == c['commands'][9:12])
check('strict command arguments', c['originalSignature'][-1]['argv'] == ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(ART / 'mac-original.app')] and c['sealedVerify']['argv'] == ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(ART / 'mac-sealed.app')])

evidence = [ROOT / 'docs/verification/unified-candidate06/root-authorization-mac-sidebar-build05.json', RUN / 'input-freeze.json', RUN / 'freeze-summary.json', ATTEMPT / 'result.json', ATTEMPT / 'output-isolation.json', ATTEMPT / 'generated-outputs.json', ATTEMPT / 'build.txt', ATTEMPT / 'collection/result.json'] + [ATTEMPT / p for p in snapshot_names] + sorted(ART.glob('command-*.txt'))
result = {'schema': 1, 'startedAt': started, 'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'conclusion': 'PASS: preserved Mac artifact bytes and recorded source/signature provenance', 'sourceHead': SOURCE, 'freezeSHA256': FREEZE, 'productFiles': 238, 'inputFiles': 302, 'productAggregate': f['productAggregate'], 'inputAggregate': f['aggregate'], 'diskFreeBefore': free, 'checks': checks, 'bundles': bundles, 'archives': archives, 'sourceEvidence': [ident(p) for p in evidence], 'originalStrictExitCodeRecorded': 1, 'sealedStrictExitCodeRecorded': 0, 'limits': 'No build/sign/verify/launch command executed. Signature result is independently linked to raw existing logs and exact current signed bytes; not a new codesign verification. No target/cache read. No GUI, user-directory, persistence, TCC, DeveloperID, notarization, Android or pixel acceptance.'}
with (OUT / 'result.json').open('x') as stream:
    stream.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'conclusion': result['conclusion'], 'checks': len(checks), 'result': ident(OUT / 'result.json')}, ensure_ascii=False))
