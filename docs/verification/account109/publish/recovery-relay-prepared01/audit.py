"""Local-only preparation of one exact source export; no test/build/network run."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import stat
import subprocess
import time

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = Path(__file__).resolve().parent
REF = '86cf971f925e375b63caa6771abe211f470dee43'
EQUIVALENT = 'ec4147b6fdd7656a794f126d5860ca60eec891b6'
TARGET = Path('/private/tmp/account109-source-86cf971f-prepared-20261113-01')
PRIOR = Path('/private/tmp/account109-source-3192943d-prepared-20261113-01')
ENV = os.environ.copy()
ENV.update({'GIT_CONFIG_COUNT': '2', 'GIT_CONFIG_KEY_0': 'gc.auto',
            'GIT_CONFIG_VALUE_0': '0', 'GIT_CONFIG_KEY_1': 'maintenance.auto',
            'GIT_CONFIG_VALUE_1': 'false', 'GIT_OPTIONAL_LOCKS': '0',
            'PYTHONDONTWRITEBYTECODE': '1'})


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, env=ENV)


def inventory(base, payload=False):
    result = {}
    for path in sorted(base.rglob('*')):
        rel = path.relative_to(base).as_posix()
        if payload and (rel == '.git' or rel.startswith('.git/')):
            continue
        s = path.lstat()
        if payload:
            if stat.S_ISDIR(s.st_mode):
                continue
            assert stat.S_ISREG(s.st_mode), rel
            result[rel] = {'mode': f'{stat.S_IMODE(s.st_mode):04o}',
                           'bytes': s.st_size, 'sha256': sha(path.read_bytes())}
        else:
            entry = {'mode': f'{stat.S_IMODE(s.st_mode):04o}',
                     'mtimeNs': s.st_mtime_ns, 'ctimeNs': s.st_ctime_ns}
            if stat.S_ISREG(s.st_mode):
                entry.update(type='file', bytes=s.st_size, sha256=sha(path.read_bytes()))
            elif stat.S_ISDIR(s.st_mode):
                entry.update(type='directory')
            elif stat.S_ISLNK(s.st_mode):
                entry.update(type='symlink', targetSha256=sha(os.readlink(path).encode()))
            else:
                raise AssertionError('Unexpected filesystem entry: ' + rel)
            result[rel] = entry
    return result


def seal(value):
    return {'sha256': sha(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()),
            'entries': len(value)}


commands = {}


def run(label, argv, cwd=ROOT):
    start = time.monotonic()
    result = subprocess.run(argv, cwd=cwd, env=ENV, capture_output=True, timeout=60)
    (OUT / (label + '.stdout.txt')).write_bytes(result.stdout)
    (OUT / (label + '.stderr.txt')).write_bytes(result.stderr)
    commands[label] = {'argv': argv, 'cwd': str(cwd), 'exitCode': result.returncode,
                       'elapsedSeconds': round(time.monotonic() - start, 3)}
    save('commands.json', commands)
    assert result.returncode == 0, label
    print(label + ': PASS', flush=True)
    return result.stdout


assert not TARGET.exists()
assert git('rev-parse', '--verify', REF + '^{commit}').decode().strip() == REF
assert all(p.startswith('docs/') for p in git('diff', '--name-only', EQUIVALENT, REF).decode().splitlines())
tools = ['scripts/publish/' + name for name in ['export.mjs', 'manifest.mjs', 'policy.mjs',
         'history.mjs', 'verify.mjs', 'package-transform.mjs']]
tools += ['scripts/build-info.mjs', 'scripts/versions.mjs']
tool_hashes = {}
for name in tools:
    expected = git('show', REF + ':' + name)
    assert (ROOT / name).read_bytes() == expected, name
    tool_hashes[name] = sha(expected)
save('executed-tool-hashes.json', tool_hashes)

old_roots = sorted(p for p in Path('/private/tmp').glob('account109-source-*') if p.is_dir())
assert PRIOR in old_roots
old_before = {str(p): seal(inventory(p)) for p in old_roots}
save('old-roots-before.json', old_before)

analysis = f"""
import {{planExport,digest}} from {json.dumps((ROOT/'scripts/publish/export.mjs').as_uri())};
const current=planExport({json.dumps(str(ROOT))},{json.dumps(REF)});
const prior=planExport({json.dumps(str(ROOT))},{json.dumps(EQUIVALENT)});
function describe(p) {{ return Object.fromEntries([...p.files].sort(([a],[b])=>a.localeCompare(b,'en')).map(([name,bytes])=>[name,{{mode:p.modes.get(name)==='100755'?'0755':'0644',bytes:bytes.length,sha256:digest(bytes)}}])); }}
const a=describe(current),b=describe(prior);
if(JSON.stringify(a)!==JSON.stringify(b)) throw Error('Requested ref export differs from ec4147b6');
if(Object.keys(a).length!==1771) throw Error('Unexpected inventory count');
console.log(JSON.stringify({{sourceCommit:current.tree.commit,equivalentRef:prior.tree.commit,identicalExportBytesAndModes:true,files:a,manifest:current.manifest}},null,2));
"""
plan = json.loads(run('committed-plan-comparison', ['node', '--input-type=module', '-e', analysis]))
save('source-payload-inventory.json', plan['files'])
assert plan['files']['vendor/cybergrid-sdk/src/tests.rs']['sha256'] == 'c45f8ce2cce31da0643ff5c7835ad8ac30ab3c5853c58c11a2957a2b64d196c2'
refresh = json.loads(run('manifest-dryrun', ['node', 'scripts/publish/manifest.mjs', '--ref', REF]))
assert refresh['changes'] == []
dry = json.loads(run('export-dryrun', ['node', 'scripts/publish/export.mjs', '--ref', REF,
    '--target', str(TARGET), '--expected-target', str(TARGET)]))
assert dry['fileCount'] == 1771 and dry['dryRun']
exported = json.loads(run('export-apply-init', ['node', 'scripts/publish/export.mjs', '--ref', REF,
    '--target', str(TARGET), '--expected-target', str(TARGET), '--apply', '--init']))
initial = inventory(TARGET)
save('new-root-initial-seal.json', seal(initial))
payload = inventory(TARGET, payload=True)
assert payload == plan['files']
prior_payload = inventory(PRIOR, payload=True)
added = sorted(set(payload) - set(prior_payload))
removed = sorted(set(prior_payload) - set(payload))
changed = sorted(k for k in set(payload) & set(prior_payload) if payload[k] != prior_payload[k])
assert not added and not removed
assert changed == ['scripts/publish/manifest.json', 'vendor/cybergrid-sdk/src/tests.rs'], changed
old_manifest = json.loads((PRIOR / 'scripts/publish/manifest.json').read_text())
new_manifest = json.loads((TARGET / 'scripts/publish/manifest.json').read_text())
assert set(old_manifest['files']) == set(new_manifest['files'])
manifest_pins = sorted(k for k in old_manifest['files'] if old_manifest['files'][k] != new_manifest['files'][k])
assert manifest_pins == ['vendor/cybergrid-sdk/src/tests.rs']
for key in set(old_manifest) | set(new_manifest):
    if key != 'files':
        assert old_manifest.get(key) == new_manifest.get(key), key
save('export-diff.json', {'priorTarget': str(PRIOR), 'added': added, 'removed': removed,
    'changed': changed, 'manifestPinsChanged': manifest_pins,
    'ownershipRuntimePolicyDeclarationsUnchanged': True,
    'details': {k: {'before': prior_payload[k], 'after': payload[k]} for k in changed}})
verified = json.loads(run('new-root-verify', ['node', 'scripts/publish/verify.mjs', '--new-root'], TARGET))
run('versions', ['node', 'scripts/versions.mjs', '--check'], TARGET)
identity = json.loads(run('source-identity', ['node', '--input-type=module', '-e',
    "import {sourceIdentity} from './scripts/build-info.mjs'; console.log(JSON.stringify(sourceIdentity(process.cwd(),{metadataPath:null})));"], TARGET))
assert not identity['sourceDirty']
final = inventory(TARGET)
assert initial == final, 'New sealed root changed during read-only checks'
old_after = {str(p): seal(inventory(p)) for p in old_roots}
save('old-roots-after.json', old_after)
assert old_before == old_after, 'Prior root changed'
prior_tests = json.loads((ROOT / 'docs/verification/account109/publish/relay-source-check01/result.json').read_text())
assert prior_tests['sourceCommit'] == EQUIVALENT and prior_tests['tests']['pass'] == 19
receipt = {'status': 'prepared-draft-not-final-accepted',
    'preparedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceRef': REF, 'sourceHeadObservedAfter': git('rev-parse', 'HEAD').decode().strip(),
    'equivalentExportRef': EQUIVALENT, 'identicalExportBytesAndModesToEquivalentRef': True,
    'target': str(TARGET), 'export': exported, 'newRootVerification': verified,
    'sourceIdentity': identity, 'initialSeal': seal(initial), 'finalSeal': seal(final),
    'sourcePayloadSeal': seal(payload), 'priorRootsCount': len(old_roots),
    'oldRootsUnchanged': old_before == old_after, 'candidateUnchangedAfterInitialization': initial == final,
    'changedExportPathsVs319': changed, 'manifestPinsChanged': manifest_pins,
    'sourceManifestSha256': sha(git('show', REF + ':scripts/publish/manifest.json')),
    'exportManifestSha256': sha((TARGET / 'scripts/publish/manifest.json').read_bytes()),
    'existingPublishingTests': {'sourceRef': EQUIVALENT, 'result': prior_tests['tests'],
        'evidence': '../relay-source-check01/result.json', 'rerunHere': False},
    'sealDefinition': 'SHA256 of UTF-8 JSON with sorted keys and compact separators. Full inventories include relative paths, entry types, modes, mtime/ctime nanoseconds and regular-file size/SHA256 (symlink target SHA256); exclude atime. Payload includes only non-.git regular-file paths/modes/size/SHA256.',
    'processOnlyGitControls': {k: ENV[k] for k in ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_KEY_1', 'GIT_CONFIG_VALUE_1', 'GIT_OPTIONAL_LOCKS', 'PYTHONDONTWRITEBYTECODE']},
    'acceptanceBoundary': {'finalAccepted': False, 'realDeviceAcceptancePending': True,
        'remoteOrGithubOperation': False, 'networkOrLiveTest': False, 'testsRerun': False,
        'dependencyInstallOrBuild': False, 'deviceOrRuntimeAccess': False, 'committed': False}}
save('receipt.json', receipt)
print(json.dumps({'status': receipt['status'], 'root': verified['history'],
    'files': exported['fileCount'], 'bytes': exported['bytes'], 'priorRootsUnchanged': len(old_roots),
    'changedExportPathsVs319': changed, 'sourceIdentity': identity,
    'fullSeal': seal(final), 'payloadSeal': seal(payload)}, indent=2), flush=True)
