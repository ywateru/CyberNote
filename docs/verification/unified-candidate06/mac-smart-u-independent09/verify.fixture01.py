"""Read-only independent check of candidate06 smart-u-build09 preserved Mac artifacts and records.

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
OUT = ROOT / 'docs/verification/unified-candidate06/mac-smart-u-independent09'
RUN = ROOT / 'docs/verification/unified-candidate06/mac-smart-u-build09'
ATTEMPT = RUN / 'mac-attempt01'
ART = ROOT / 'artifacts/unified-candidate06/mac-smart-u-build09/mac-attempt01'
SOURCE = '7ab867d416f48ea23913907c87fd6d058833e1cb'
FREEZE = '33d823170db2ed0685ccdbd26af6a0cd459dcc124d73f409aa28fec08c658561'


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
check('exact build result SHA256', ident(ATTEMPT / 'result.json')['sha256'] == '3f6c6d92fed343dc58361abbe384c5a8f90b84ab6c52f5a0182967799ed4f3d2')
check('exact collection result SHA256', ident(ATTEMPT / 'collection/result.json')['sha256'] == 'ff2d665c5da656fa832bc653493e59d2f6a7c0ff2f926c518250c943637897d1')
summary = load(RUN / 'freeze-summary.json')
check('freeze summary linkage', summary['sourceHead'] == SOURCE and summary['productAggregate'] == f['productAggregate'] and summary['inputAggregate'] == f['aggregate'] and summary['freeze'] == {**ident(RUN / 'input-freeze.json'), 'path': str(RUN / 'input-freeze.json')})
check('exact freeze SHA256', ident(RUN / 'input-freeze.json')['sha256'] == FREEZE)
check('exact root authorization SHA256', ident(ROOT / 'docs/verification/unified-candidate06/smart-u-device09-preparation/mac-authorization.json')['sha256'] == '23e2905c11b18a57a000fdd61d32d85849dfcc9a05497c2bbcc0c680308b6095')
check('current HEAD exact source', subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip() == SOURCE)
check('exact source and Mac stage', all(x['expectedHead'] == SOURCE and x['stage'] == 'mac' for x in (b, c)) and f['head'] == SOURCE and f['stage'] == 'mac')
check('authorization and input paths', f['authorization'] == load(ROOT / 'docs/verification/unified-candidate06/smart-u-device09-preparation/mac-authorization.json') and f['authorization']['sourceHead'] == SOURCE and f['authorization']['inputPaths'] == [r['path'] for r in f['files']] and f['authorization']['productPaths'] == [r['path'] for r in f['productFiles']])
check('explicit expected aggregates', f['productAggregate'] == 'b02f0a58b0ff5bc31cb9d09437fd73b32645b5f198d781336196fe2060b75897' and f['aggregate'] == 'abf3f38aceb7cc93100e27ca3bca1848d3d12bba5999835d2a501346522efab6')
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
check('current320 aggregate', len(current_inputs) == 320 and aggregate(current_inputs) == f['aggregate'])
current_map = {r['path']: r for r in current_inputs}
check('current301 product aggregate', len(f['productFiles']) == 301 and all(current_map[r['path']] == r for r in f['productFiles']) and aggregate(f['productFiles']) == f['productAggregate'])
git_tree = subprocess.check_output(['git', 'ls-tree', '-r', '-z', SOURCE, '--', *[r['path'] for r in f['productFiles']]], cwd=ROOT)
git_blobs = {}
for entry in git_tree.split(b'\0'):
    if entry:
        header, name = entry.split(b'\t', 1)
        git_blobs[name.decode()] = header.split()[2].decode()
check('all301 product paths in exact source commit', len(git_blobs) == 301 and set(git_blobs) == {r['path'] for r in f['productFiles']})
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
check('sealed executable expected exact bytes', c['sealed']['executable']['bytes'] == 16298512 and c['sealed']['executable']['sha256'] == '32613a70664293b214b1713293a3744570b0c13f1f37ce588267a5b162842191')
check('sealed ZIP exact expected bytes', archives['sealed']['bytes'] == 4866554 and archives['sealed']['sha256'] == '02d51696b6d350847835ec596e244c526074c4d3793e2d494dc3b0e51ae8a663')
check('actual collector command structure', len(c['commands']) == 13 and [x['exitCode'] for x in c['commands']] == [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])
check('exact recorded sealed signing argv', c['sealedSign']['argv'] == ['/usr/bin/codesign', '--force', '--sign', '-', '--timestamp=none', str(ART / 'mac-sealed.app')])
for i, command in enumerate(c['commands'], 1):
    check('command raw log linkage %02d' % i, Path(command['log']) == ART / ('command-%02d.txt' % i) and Path(command['log']).read_text() == command['stdout'])
    check('command completion %02d' % i, command['ownedGroupStopped'] is True and command['remainingOwnedGroupMembers'] == [] and command['exitCode'] == (1 if i == 6 else 0) and not any(k in command for k in ['error', 'stopReason', 'groupCleanupError']))
check('original strict failure retained', c['originalSignature'] == c['commands'][2:6] and c['originalSignature'][-1]['exitCode'] == 1 and 'code has no resources but signature indicates they must be present' in c['originalSignature'][-1]['stdout'])
check('sealed signing and strict pass retained', c['sealedSign'] == c['commands'][7] and c['sealedVerify'] == c['commands'][8] and c['sealedVerify']['exitCode'] == 0 and 'valid on disk' in c['sealedVerify']['stdout'] and c['sealedDisplays'] == c['commands'][9:12])
check('strict command arguments', c['originalSignature'][-1]['argv'] == ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(ART / 'mac-original.app')] and c['sealedVerify']['argv'] == ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(ART / 'mac-sealed.app')])

check('original executable explicit expected', c['original']['executable']['bytes'] == 16375584 and c['original']['executable']['sha256'] == '33c5635855372ec7f8fe6c6110d813366b645335b259bff549d5b6e55e1262a5')
check('original ZIP explicit expected', archives['original']['bytes'] == 4938722 and archives['original']['sha256'] == 'd935f86ab7d25c95b953fe70c6bf4c883b1837198a6006067f86d899228c8adb')

# Verify the preserved previous outputs directly, without reading target/cache.
for record in b['outputIsolation']['outputs']:
    preserved = Path(record['preserved'])
    before = record['before']
    actual = []
    directories = []
    for item in sorted(preserved.rglob('*')):
        mode = item.lstat().st_mode
        check('preserved regular entry: ' + str(item.relative_to(preserved)), stat.S_ISREG(mode) or stat.S_ISDIR(mode))
        if stat.S_ISREG(mode):
            actual.append({**ident(item), 'path': str(item.relative_to(preserved)), 'type': 'file', 'mode': stat.S_IMODE(mode)})
        elif stat.S_ISDIR(mode):
            directories.append({'path': str(item.relative_to(preserved)), 'mode': stat.S_IMODE(mode)})
    check('prior output files unchanged: ' + record['name'], actual == before['files'])
    check('prior output directories unchanged: ' + record['name'], directories == before['directories'])
    check('prior output same inode and device: ' + record['name'], preserved.stat().st_ino == before['inode'] and preserved.stat().st_dev == before['device'])
# New frontend output is outside target/cache and must match the recorded build snapshot.
current_dist = []
for item in sorted((ROOT / 'dist').rglob('*')):
    if item.is_file():
        current_dist.append({**ident(item), 'path': str(item.relative_to(ROOT / 'dist')), 'type': 'file', 'mode': stat.S_IMODE(item.stat().st_mode)})
check('current generated frontend exact complete resources', current_dist == b['dist'] == b['generatedOutputs'][1]['snapshot']['files'])
check('new original differs from preserved previous executable', ident(ART / 'mac-original.app/Contents/MacOS/notes-clone')['sha256'] != ident(ATTEMPT / 'prior-outputs/application/Contents/MacOS/notes-clone')['sha256'])
fresh=load(OUT / 'fresh-signature-checks.json')['commands']
check('fresh independent original strict failure retained',fresh[0]['argv']==c['originalSignature'][-1]['argv'] and fresh[0]['exitCode']==1 and 'code has no resources but signature indicates they must be present' in fresh[0]['stderr'])
check('fresh independent sealed deep strict verification passed',fresh[1]['argv']==c['sealedVerify']['argv'] and fresh[1]['exitCode']==0 and 'valid on disk' in fresh[1]['stderr'])
check('fresh sealed adhoc identifier and arm64',fresh[2]['exitCode']==0 and 'Identifier=com.local.notesclone' in fresh[2]['stderr'] and 'Signature=adhoc' in fresh[2]['stderr'] and 'TeamIdentifier=not set' in fresh[2]['stderr'] and '(arm64)' in fresh[2]['stderr'])
check('fresh display entitlements and requirements commands completed',fresh[3]['exitCode']==0 and fresh[4]['exitCode']==0 and fresh[5]['exitCode']==0)
# Product byte identity is also checked against the independently reviewed fix13 commit.
previous_tree=subprocess.check_output(['git','ls-tree','-r','-z','8e8fe7e320e34a2b9c27bf7c7e794662ad988da4','--',*[r['path'] for r in f['productFiles']]],cwd=ROOT)
check('all301 product blobs match reviewed fix13 commit',previous_tree==git_tree)
initial = load(OUT / 'input-manifest.json')
check('all first-frozen author and artifact inputs unchanged at audit close', all(ident(ROOT / row['path']) == row for row in initial['files']))

evidence = [ROOT / 'docs/verification/unified-candidate06/smart-u-device09-preparation/mac-authorization.json', RUN / 'input-freeze.json', RUN / 'freeze-summary.json', RUN / 'delivery-manifest.json', ATTEMPT / 'result.json', ATTEMPT / 'output-isolation.json', ATTEMPT / 'generated-outputs.json', ATTEMPT / 'build.txt', ATTEMPT / 'collection/result.json'] + [ATTEMPT / p for p in snapshot_names] + sorted(ART.glob('command-*.txt'))
result = {'schema': 1, 'startedAt': started, 'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'conclusion': 'PASS: preserved Mac artifact bytes and recorded source/signature provenance', 'sourceHead': SOURCE, 'freezeSHA256': FREEZE, 'productFiles': 301, 'inputFiles': 320, 'productAggregate': f['productAggregate'], 'inputAggregate': f['aggregate'], 'diskFreeBefore': free, 'checks': checks, 'bundles': bundles, 'archives': archives, 'sourceEvidence': [ident(p) for p in evidence], 'originalStrictExitCodeRecorded': 1, 'sealedStrictExitCodeRecorded': 0, 'limits': 'No build/sign/launch command executed. Fresh independent read-only codesign original strict failure retained and sealed --verify --deep --strict passed exact app. Other signature records independently linked to raw existing logs. Current dist resources matched, but embedded compressed resource bytes not independently decoded. No target/cache read. No GUI, user-directory, persistence, TCC, DeveloperID, notarization, Android or pixel acceptance.'}
with (OUT / 'result.json').open('x') as stream:
    stream.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'conclusion': result['conclusion'], 'checks': len(checks), 'result': ident(OUT / 'result.json')}, ensure_ascii=False))
