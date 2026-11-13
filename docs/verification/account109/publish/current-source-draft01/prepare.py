"""Exact committed source DRAFT; local-only, no installs/builds/remotes."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import stat
import subprocess
import time

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = Path(__file__).resolve().parent
REF = '9010c5bada147936c9f3e8db8159ef777d3bbb87'
TARGET = Path('/private/tmp/account109-source-9010c5ba-DRAFT-20261113-01')
ENV = dict(os.environ, GIT_OPTIONAL_LOCKS='0', GIT_CONFIG_COUNT='2',
           GIT_CONFIG_KEY_0='gc.auto', GIT_CONFIG_VALUE_0='0',
           GIT_CONFIG_KEY_1='maintenance.auto', GIT_CONFIG_VALUE_1='false',
           PYTHONDONTWRITEBYTECODE='1')
COMMANDS = []


def sha(b):
    return hashlib.sha256(b).hexdigest()


def save(name, obj):
    (OUT / name).write_text(json.dumps(obj, indent=2, sort_keys=True) + '\n')


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', '--no-optional-locks', *args], cwd=cwd, env=ENV)


def run(label, argv, cwd=ROOT):
    started = time.monotonic()
    p = subprocess.run(argv, cwd=cwd, env=ENV, capture_output=True, timeout=60)
    COMMANDS.append(dict(label=label, argv=argv, cwd=str(cwd), exitCode=p.returncode,
                         seconds=round(time.monotonic() - started, 3),
                         stdoutSha256=sha(p.stdout), stderrSha256=sha(p.stderr)))
    save('commands.json', COMMANDS)
    # Commands are reviewed finite local publishers, not app/provider subprocesses.
    if p.returncode:
        save('failure.json', dict(stage=label, exitCode=p.returncode,
                                 rawOutputSuppressed=True))
        raise RuntimeError('Finite local preparation failure: ' + label)
    (OUT / (label + '.stdout.txt')).write_bytes(p.stdout)
    (OUT / (label + '.stderr.txt')).write_bytes(p.stderr)
    print(label + ': PASS', flush=True)
    return p.stdout


def snapshot(base, payload=False):
    entries = {}
    for path in [base, *sorted(base.rglob('*'))]:
        rel = '.' if path == base else path.relative_to(base).as_posix()
        if payload and (rel == '.git' or rel.startswith('.git/')):
            continue
        st = path.lstat()
        if payload and stat.S_ISDIR(st.st_mode):
            continue
        entry = dict(mode=f'{stat.S_IMODE(st.st_mode):04o}')
        if not payload:
            entry.update(mtimeNs=st.st_mtime_ns, ctimeNs=st.st_ctime_ns)
        if stat.S_ISREG(st.st_mode):
            entry.update(type='file', bytes=st.st_size, sha256=sha(path.read_bytes()))
        elif stat.S_ISDIR(st.st_mode):
            entry.update(type='directory')
        elif stat.S_ISLNK(st.st_mode) and not payload:
            entry.update(type='symlink', targetSha256=sha(os.readlink(path).encode()))
        else:
            raise RuntimeError('Unexpected filesystem type')
        entries[rel] = entry
    return entries


def seal(entries):
    return dict(entries=len(entries), sha256=sha(json.dumps(
        entries, sort_keys=True, separators=(',', ':')).encode()))


assert not TARGET.exists()
assert git('rev-parse', '--verify', REF + '^{commit}').decode().strip() == REF
old_roots = sorted(p for p in Path('/private/tmp').glob('account109-source-*') if p.is_dir())
old_before = {str(p): seal(snapshot(p)) for p in old_roots}
save('old-roots-before.json', old_before)
print('Protected prior roots snapshotted: ' + str(len(old_roots)), flush=True)
refresh = json.loads(run('manifest-dryrun', ['node', 'scripts/publish/manifest.mjs', '--ref', REF]))
assert refresh['changes'] == []
dry = json.loads(run('export-dryrun', ['node', 'scripts/publish/export.mjs', '--ref', REF,
                                     '--target', str(TARGET), '--expected-target', str(TARGET)]))
free_before = shutil.disk_usage(TARGET.parent).free
assert free_before > 2 * dry['bytes'] + 32 * 1024 * 1024, 'Insufficient finite export disk budget'
analysis = """
import {planExport,digest} from './scripts/publish/export.mjs';
const p=planExport(process.cwd(),'9010c5bada147936c9f3e8db8159ef777d3bbb87');
console.log(JSON.stringify(Object.fromEntries([...p.files].sort(([a],[b])=>a.localeCompare(b,'en')).map(([name,b])=>
 [name,{type:'file',mode:p.modes.get(name)==='100755'?'0755':'0644',bytes:b.length,sha256:digest(b)}])),null,2));
"""
planned = json.loads(run('planned-inventory', ['node', '--input-type=module', '-e', analysis]))
assert len(planned) == dry['fileCount'] == 1772
exported = json.loads(run('export-apply-init', ['node', 'scripts/publish/export.mjs', '--ref', REF,
    '--target', str(TARGET), '--expected-target', str(TARGET), '--apply', '--init']))
initial = snapshot(TARGET)
payload = snapshot(TARGET, payload=True)
assert payload == planned, 'Actual payload differs from planned path/mode/size/SHA inventory'
save('draft-payload-inventory.json', payload)
verified = json.loads(run('verify-new-root', ['node', 'scripts/publish/verify.mjs', '--new-root'], TARGET))
run('version-check', ['node', 'scripts/versions.mjs', '--check'], TARGET)
identity = json.loads(run('source-identity', ['node', '--input-type=module', '-e',
    "import {sourceIdentity} from './scripts/build-info.mjs'; console.log(JSON.stringify(sourceIdentity(process.cwd(),{metadataPath:null})));"], TARGET))
assert identity['sourceDirty'] is False
assert git('remote', cwd=TARGET) == b''
assert git('rev-list', '--count', 'HEAD', cwd=TARGET).decode().strip() == '1'
root_sha = git('rev-parse', 'HEAD', cwd=TARGET).decode().strip()
root_tree = git('rev-parse', 'HEAD^{tree}', cwd=TARGET).decode().strip()
assert not git('status', '--porcelain', '--untracked-files=all', cwd=TARGET)
assert len(git('for-each-ref', '--format=%(refname)', cwd=TARGET).decode().splitlines()) == 1
assert not any(p.startswith(('docs/', 'artifacts/', 'dist/', 'target/', 'node_modules/')) for p in payload)
assert not any('/verification/' in p or p.startswith('scripts/verification/') for p in payload)
assert sum(p.endswith('.notesbackup') for p in payload) == 4
templates = {'README.md':'README.public.md', '.gitignore':'gitignore.public',
             'LICENSE':'LICENSE.project-reserved.txt', 'THIRD_PARTY_NOTICES.md':'THIRD_PARTY_NOTICES.md'}
for target, source in templates.items():
    assert (TARGET / target).read_bytes() == git('show', REF + ':scripts/publish/' + source)
workflow = (TARGET / '.github/workflows/packages.yml').read_bytes()
assert workflow == git('show', REF + ':.github/workflows/packages.yml')
w = workflow.decode()
assert 'contents: read' in w and w.count('persist-credentials: false') == 2
assert w.count('node scripts/publish/verify.mjs') == 2
assert 'test "$(uname -m)" = arm64' in w and '--all-features' not in w
assert not any(s in w for s in ['contents: write', 'id-token: write', 'git push', 'gh repo', 'gh release', 'wrangler deploy'])
upload_paths = [line.strip() for line in w.splitlines() if line.strip().startswith('release-packages/')]
assert len(upload_paths) == 8 and len(set(upload_paths)) == 8
assert all(p.endswith(('.zip', '.apk', '.json', '.sha256')) for p in upload_paths)
assert w.count('timeout-minutes: 60') == 2
save('privacy-workflow.json', dict(
    exactManifestAndCredentialPathPolicyPassed=True,
    sourceOnlyAllowlistAndDependencyClosurePassed=True,
    privateDocsEvidenceStoresAndBuildOutputsExcluded=True,
    syntheticArchiveCount=4, publicTemplateTransformsExact=True,
    scannerBoundary='Reviewed exact allowlist plus credential/path/binary/provenance scanners; not a mathematical proof that source contains no sensitive text. Fixed synthetic test fixtures and declared public runtime/provider bytes are intended inputs.',
    workflowSha256=sha(workflow), workflowUnchangedFromExactRef=True,
    contentsPermission='read', checkoutPersistCredentials=False,
    sanitizedCheckBeforeDependencyInstall=True, jobs=2, timeoutMinutesEach=60,
    realMacArm64Gate=True, explicitAndroidArm64AndPinnedToolchain=True,
    releaseUploadAllowlist=upload_paths,
    noWorkflowPublishPushDeployOrSigningClaim=True, workflowExecuted=False))
previous = Path('/private/tmp/account109-source-86cf971f-prepared-20261113-01')
if previous in old_roots:
    prior = snapshot(previous, payload=True)
    added = sorted(set(payload) - set(prior)); removed = sorted(set(prior) - set(payload))
    changed = sorted(p for p in set(prior) & set(payload) if prior[p] != payload[p])
    save('delta-vs-prior-draft.json', dict(priorRoot=str(previous), added=added, removed=removed, changed=changed))
final = snapshot(TARGET)
assert initial == final, 'Draft changed during read-only verification'
old_after = {str(p): seal(snapshot(p)) for p in old_roots}
save('old-roots-after.json', old_after)
assert old_before == old_after, 'Protected prior root changed'
receipt = dict(status='DRAFT_PREPARED_REAL_ACCEPTANCE_PENDING', sourceRef=REF,
    sourceHeadObservedAfter=git('rev-parse', 'HEAD').decode().strip(), target=str(TARGET),
    draftRootCommit=root_sha, draftTree=root_tree, export=exported,
    manifestDryRunChanges=refresh['changes'], newRootVerification=verified,
    draftSourceIdentity=identity, payloadSeal=seal(payload), initialFullSeal=seal(initial),
    finalFullSeal=seal(final), oldRootCount=len(old_roots), oldRootsUnchanged=True,
    draftUnchangedAfterInitialization=True, independentGitSingleRootMainNoRemotes=True,
    freeBytesBeforeExport=free_before, freeBytesAfter=shutil.disk_usage(TARGET.parent).free,
    boundary=dict(realAccountAcceptancePending=True, finalAccepted=False,
                  releasePublished=False, githubOrRemoteOperation=False,
                  dependencyInstall=False, productBuild=False, testsRerun=False,
                  liveNetworkDeviceAppOrOriginalStoreAccess=False),
    snapshotDefinition='Sorted relative paths, type, mode, size/SHA256 for regular files, mtime/ctime ns and symlink-target SHA256; includes root and .git; excludes access times. Payload omits directories/.git/timestamps.',
    preparedAtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat())
save('receipt.json', receipt)
print(json.dumps(dict(status=receipt['status'], target=str(TARGET), rootCommit=root_sha,
    tree=root_tree, files=exported['fileCount'], bytes=exported['bytes'],
    oldRootsUnchanged=len(old_roots), freeBytesAfter=receipt['freeBytesAfter']), indent=2), flush=True)
