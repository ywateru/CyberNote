"""Read-only independent check of candidate06 list-heading-build07 preserved Mac artifacts and records.

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
OUT = ROOT / 'docs/verification/unified-candidate06/mac-list-heading-independent07'
RUN = ROOT / 'docs/verification/unified-candidate06/mac-list-heading-build07'
ATTEMPT = RUN / 'mac-attempt01'
ART = ROOT / 'artifacts/unified-candidate06/mac-list-heading-build07/mac-attempt01'
SOURCE = '8614d788745a6183542d261d1c6b6fc789084dc7'
FREEZE = 'b0bc1a2e4a6c68ead98f57cd66bd756a4a1278d9258d06d0b4ce4974a45c3a35'


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
check('exact build result SHA256', ident(ATTEMPT / 'result.json')['sha256'] == '724bb4963b0745b039b9918f69cbaebfa7394d7c644c0fc12c652b6ab0f27a8e')
check('exact collection result SHA256', ident(ATTEMPT / 'collection/result.json')['sha256'] == '8821a790de13696fd58443f04368a2e3e17033270e3e2c2da54fc2a79c12014e')
summary = load(RUN / 'freeze-summary.json')
check('freeze summary linkage', summary['sourceHead'] == SOURCE and summary['productAggregate'] == f['productAggregate'] and summary['inputAggregate'] == f['aggregate'] and summary['freeze'] == {**ident(RUN / 'input-freeze.json'), 'path': str(RUN / 'input-freeze.json')})
check('exact freeze SHA256', ident(RUN / 'input-freeze.json')['sha256'] == FREEZE)
check('exact root authorization SHA256', ident(ROOT / 'docs/verification/unified-candidate06/root-authorization-mac-list-heading-build07.json')['sha256'] == 'edfad3cb63bf6810a19faa6d7970554a52ffcc2b535b87bc413bc02eae77ee30')
check('current HEAD exact source', subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip() == SOURCE)
check('exact source and Mac stage', all(x['expectedHead'] == SOURCE and x['stage'] == 'mac' for x in (b, c)) and f['head'] == SOURCE and f['stage'] == 'mac')
check('authorization and input paths', f['authorization'] == load(ROOT / 'docs/verification/unified-candidate06/root-authorization-mac-list-heading-build07.json') and f['authorization']['sourceHead'] == SOURCE and f['authorization']['inputPaths'] == [r['path'] for r in f['files']] and f['authorization']['productPaths'] == [r['path'] for r in f['productFiles']])
check('explicit expected aggregates', f['productAggregate'] == '6f934ba2142bb716c64c792f7b2187949e8119e72b06e2239788d1dc22cc5a5b' and f['aggregate'] == '6d45cb911503c9fa0077f22f99dd351553c289f23c440d9c24a935a81646b4b3')
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
check('sealed executable expected exact bytes', c['sealed']['executable']['bytes'] == 16015072 and c['sealed']['executable']['sha256'] == '0de1ab851b06f6da59fe3d37a3843af0b0cf46557effe69d2c72bb7bcf63ffd1')
check('sealed ZIP exact expected bytes', archives['sealed']['bytes'] == 4753267 and archives['sealed']['sha256'] == '92c1ffca5e16179660eb538c9b8282b6f148f6443b9c6307b71640cac6e7af20')
check('actual collector command structure', len(c['commands']) == 13 and [x['exitCode'] for x in c['commands']] == [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])
check('exact recorded sealed signing argv', c['sealedSign']['argv'] == ['/usr/bin/codesign', '--force', '--sign', '-', '--timestamp=none', str(ART / 'mac-sealed.app')])
for i, command in enumerate(c['commands'], 1):
    check('command raw log linkage %02d' % i, Path(command['log']) == ART / ('command-%02d.txt' % i) and Path(command['log']).read_text() == command['stdout'])
    check('command completion %02d' % i, command['ownedGroupStopped'] is True and command['remainingOwnedGroupMembers'] == [] and command['exitCode'] == (1 if i == 6 else 0) and not any(k in command for k in ['error', 'stopReason', 'groupCleanupError']))
check('original strict failure retained', c['originalSignature'] == c['commands'][2:6] and c['originalSignature'][-1]['exitCode'] == 1 and 'code has no resources but signature indicates they must be present' in c['originalSignature'][-1]['stdout'])
check('sealed signing and strict pass retained', c['sealedSign'] == c['commands'][7] and c['sealedVerify'] == c['commands'][8] and c['sealedVerify']['exitCode'] == 0 and 'valid on disk' in c['sealedVerify']['stdout'] and c['sealedDisplays'] == c['commands'][9:12])
check('strict command arguments', c['originalSignature'][-1]['argv'] == ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(ART / 'mac-original.app')] and c['sealedVerify']['argv'] == ['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', str(ART / 'mac-sealed.app')])

delivery = load(RUN / 'delivery-manifest.json')
check('exact sealed author delivery manifest', ident(RUN / 'delivery-manifest.json')['sha256'] == 'eae75d5e778c009d24bfdc270cd10c9946d7cdb9ef6d1e051dbb9756837f2b93')
check('delivery exact source attempt nonce count', delivery['sourceHead'] == SOURCE and delivery['buildAttempt'] == 'mac-attempt01' and delivery['buildNonce'] == b['nonce'] and delivery['fileCount'] == len(delivery['files']) == 38)
for row in delivery['files']:
    check('sealed delivery file identity: ' + row['path'], ident(ROOT / row['path']) == row)
check('delivery complete38 aggregate', aggregate(delivery['files']) == delivery['aggregate'] == '5479a1345938ada20a9ee76d4fa197667f60e586ac6135f0205b119f6769b19c')
check('original executable explicit expected', c['original']['executable']['bytes'] == 16090480 and c['original']['executable']['sha256'] == '17db9522917a682b7f35b14d5dc4e87a811a8747b434bc9c2ed45f41a367db3b')
check('original ZIP explicit expected', archives['original']['bytes'] == 4823742 and archives['original']['sha256'] == '5e5ff5f0b1ea4c8a129425d2b29518e36f6d6d642245bf19ea172957798a9baf')

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
css = next((ROOT / 'dist' / row['path']).read_text() for row in current_dist if row['path'].endswith('.css'))
expected_rule = '.desktop.native-toolbar:not(.gallery-browse):not(.gallery-edit):not(.separate) .notes-scroll:not(.gallery)>.note-entry:first-child>.date-section{font-size:15.25px;line-height:20px;height:40px;padding-top:9.5px;border-bottom-width:.5px}'
check('new first date heading rule present in exact CSS resource', expected_rule in css)
check('native source uses new three-column heading baselines', 'self.title.frame=NSMakeRect(textX,three?11:9,titleWidth,18);' in (ROOT / 'plugins/tauri-plugin-notes-ui/macos/toolbar.m').read_text() and 'self.count.frame=NSMakeRect(textX,three?27:28,titleWidth,15);' in (ROOT / 'plugins/tauri-plugin-notes-ui/macos/toolbar.m').read_text())
check('new original differs from preserved previous executable', ident(ART / 'mac-original.app/Contents/MacOS/notes-clone')['sha256'] != ident(ATTEMPT / 'prior-outputs/application/Contents/MacOS/notes-clone')['sha256'])
check('author final README exact SHA256', ident(RUN / 'README.md')['sha256'] == 'be606d81ac3a12dcfeb1f2919f95037009569a99c1341ab492b294b62ac76822')
readback = load(RUN / 'delivery-readback.json')
check('readback build/collection exact identities', readback['buildResult'] == c['buildResult'] and readback['collectionResult'] == {**ident(ATTEMPT / 'collection/result.json'), 'path': str(ATTEMPT / 'collection/result.json')})
for row in readback['artifacts']:
    check('readback artifact actual identity: ' + row['role'], {**ident(Path(row['path'])), 'path': row['path']} == {k: v for k, v in row.items() if k != 'role'})
fresh = load(OUT / 'fresh-codesign.json')
check('fresh independent deep strict verifier passed exact app', fresh['argv'] == c['sealedVerify']['argv'] and fresh['exitCode'] == 0 and 'valid on disk' in fresh['stderr'])
initial = load(OUT / 'input-manifest.json')
check('all first-frozen author and artifact inputs unchanged at audit close', all(ident(ROOT / row['path']) == row for row in initial['files']))

evidence = [ROOT / 'docs/verification/unified-candidate06/root-authorization-mac-list-heading-build07.json', RUN / 'input-freeze.json', RUN / 'freeze-summary.json', RUN / 'delivery-manifest.json', ATTEMPT / 'result.json', ATTEMPT / 'output-isolation.json', ATTEMPT / 'generated-outputs.json', ATTEMPT / 'build.txt', ATTEMPT / 'collection/result.json'] + [ATTEMPT / p for p in snapshot_names] + sorted(ART.glob('command-*.txt'))
result = {'schema': 1, 'startedAt': started, 'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'conclusion': 'PASS: preserved Mac artifact bytes and recorded source/signature provenance', 'sourceHead': SOURCE, 'freezeSHA256': FREEZE, 'productFiles': 238, 'inputFiles': 302, 'productAggregate': f['productAggregate'], 'inputAggregate': f['aggregate'], 'diskFreeBefore': free, 'checks': checks, 'bundles': bundles, 'archives': archives, 'sourceEvidence': [ident(p) for p in evidence], 'originalStrictExitCodeRecorded': 1, 'sealedStrictExitCodeRecorded': 0, 'limits': 'No build/sign/launch command executed. Fresh independent read-only codesign --verify --deep --strict passed exact sealed app. Other signature records independently linked to raw existing logs. Current dist resources matched, but embedded compressed resource bytes not independently decoded. No target/cache read. No GUI, user-directory, persistence, TCC, DeveloperID, notarization, Android or pixel acceptance.'}
with (OUT / 'result.json').open('x') as stream:
    stream.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'conclusion': result['conclusion'], 'checks': len(checks), 'result': ident(OUT / 'result.json')}, ensure_ascii=False))
