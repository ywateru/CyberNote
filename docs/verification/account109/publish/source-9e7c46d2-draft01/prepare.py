"""One local exact-source DRAFT; no install, clone, build or external operation."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import stat
import subprocess
import time

SOURCE = Path('/private/tmp/cybernote-account109-gui-startup-9e7c46d2-01')
REF = '9e7c46d2fcc8ed31bf1210ce4272f73edffe9143'
TARGET = Path('/private/tmp/account109-source-9e7c46d2-DRAFT-20261113-01')
OLD = Path('/private/tmp/account109-source-9010c5ba-DRAFT-20261113-01')
OUT = Path(__file__).resolve().parent
ENV = {k: os.environ[k] for k in ('PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL') if k in os.environ}
ENV.update(GIT_OPTIONAL_LOCKS='0', GIT_CONFIG_COUNT='2', GIT_CONFIG_KEY_0='gc.auto',
           GIT_CONFIG_VALUE_0='0', GIT_CONFIG_KEY_1='maintenance.auto', GIT_CONFIG_VALUE_1='false')
COMMANDS = []
sha = lambda b: hashlib.sha256(b).hexdigest()
canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def git(*args, cwd=SOURCE):
    return subprocess.check_output(['git', '--no-optional-locks', *args], cwd=cwd, env=ENV)


def run(label, argv, cwd=SOURCE, retain_stdout=True):
    began = time.monotonic()
    result = subprocess.run(argv, cwd=cwd, env=ENV, capture_output=True, timeout=60)
    COMMANDS.append(dict(label=label, argv=argv, cwd=str(cwd), exitCode=result.returncode,
                         seconds=round(time.monotonic()-began, 3), stdoutBytes=len(result.stdout),
                         stdoutSha256=sha(result.stdout), stderrSha256=sha(result.stderr)))
    save('commands.json', COMMANDS)
    if result.returncode:
        save('failure.json', dict(stage=label, exitCode=result.returncode, rawOutputSuppressed=True))
        raise RuntimeError('Finite local export failure: ' + label)
    if retain_stdout:
        (OUT / (label + '.stdout.txt')).write_bytes(result.stdout)
    assert not result.stderr, 'Unexpected finite tool stderr: ' + label
    print(label + ': PASS', flush=True)
    return result.stdout


def payload(base):
    entries = {}
    for folder, dirs, files in os.walk(base, followlinks=False):
        if Path(folder) == base:
            dirs[:] = [d for d in dirs if d != '.git']
        for name in dirs:
            assert not (Path(folder) / name).is_symlink()
        for name in files:
            path = Path(folder) / name
            s = path.lstat()
            assert stat.S_ISREG(s.st_mode) and not path.is_symlink()
            entries[path.relative_to(base).as_posix()] = dict(
                type='file', mode=f'{stat.S_IMODE(s.st_mode):04o}', bytes=s.st_size, sha256=sha(path.read_bytes()))
    return entries


def seal(base):
    """Full root + .git metadata/content seal, no atime or retained file list."""
    digest = hashlib.sha256()
    count = 0
    for path in [base, *sorted(base.rglob('*'))]:
        s = path.lstat()
        row = dict(path='.' if path == base else path.relative_to(base).as_posix(),
                   mode=stat.S_IMODE(s.st_mode), mtimeNs=s.st_mtime_ns, ctimeNs=s.st_ctime_ns)
        if stat.S_ISREG(s.st_mode):
            h = hashlib.sha256()
            with path.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024*1024), b''):
                    h.update(chunk)
            row.update(type='file', bytes=s.st_size, sha256=h.hexdigest())
        elif stat.S_ISDIR(s.st_mode):
            row['type'] = 'directory'
        elif stat.S_ISLNK(s.st_mode):
            row.update(type='symlink', targetSha256=sha(os.readlink(path).encode()))
        else:
            raise RuntimeError('Unexpected filesystem type')
        digest.update(canonical(row) + b'\n')
        count += 1
    return dict(entries=count, sha256=digest.hexdigest())


assert not TARGET.exists() and not TARGET.is_symlink()
assert SOURCE.resolve() == SOURCE and OLD.is_dir() and not OLD.is_symlink()
assert git('rev-parse', 'HEAD').decode().strip() == REF
assert not git('status', '--porcelain', '--untracked-files=normal')
assert not list(SOURCE.glob('.env*'))
free_before = shutil.disk_usage(TARGET.parent).free
assert free_before >= 10 * 1024**3
tools = ['scripts/publish/export.mjs', 'scripts/publish/verify.mjs', 'scripts/publish/manifest.mjs',
         'scripts/publish/policy.mjs', 'scripts/publish/history.mjs', 'scripts/publish/package-transform.mjs',
         'scripts/publish/README.md', 'scripts/publish/manifest.json', 'scripts/build-info.mjs', 'scripts/versions.mjs']
tool_hashes = {}
for path in tools:
    data = (SOURCE / path).read_bytes()
    assert data == git('show', REF + ':' + path)
    tool_hashes[path] = sha(data)
old_before = seal(OLD)
refresh = json.loads(run('manifest-dryrun', ['node', 'scripts/publish/manifest.mjs', '--ref', REF]))
assert refresh['changes'] == []
dry = json.loads(run('export-dryrun', ['node', 'scripts/publish/export.mjs', '--ref', REF,
    '--target', str(TARGET), '--expected-target', str(TARGET)]))
assert free_before > 2 * dry['bytes'] + 10 * 1024**3
analysis = """
import {planExport,digest} from './scripts/publish/export.mjs';
const p=planExport(process.cwd(),'9e7c46d2fcc8ed31bf1210ce4272f73edffe9143');
console.log(JSON.stringify(Object.fromEntries([...p.files].map(([name,b])=>
 [name,{type:'file',mode:p.modes.get(name)==='100755'?'0755':'0644',bytes:b.length,sha256:digest(b)}]))));
"""
planned = json.loads(run('planned-inventory-in-memory', ['node', '--input-type=module', '-e', analysis], retain_stdout=False))
assert len(planned) == dry['fileCount']
exported = json.loads(run('export-apply-init', ['node', 'scripts/publish/export.mjs', '--ref', REF,
    '--target', str(TARGET), '--expected-target', str(TARGET), '--apply', '--init']))
initial_seal = seal(TARGET)
actual = payload(TARGET)
assert actual == planned
verified = json.loads(run('verify-new-root', ['node', 'scripts/publish/verify.mjs', '--new-root'], TARGET))
run('version-check', ['node', 'scripts/versions.mjs', '--check'], TARGET)
identity = json.loads(run('source-identity', ['node', '--input-type=module', '-e',
    "import {sourceIdentity} from './scripts/build-info.mjs'; console.log(JSON.stringify(sourceIdentity(process.cwd(),{metadataPath:null})));"], TARGET))
assert identity['sourceDirty'] is False
root_sha = git('rev-parse', 'HEAD', cwd=TARGET).decode().strip()
tree_sha = git('rev-parse', 'HEAD^{tree}', cwd=TARGET).decode().strip()
assert verified['historyChecked'] and verified['history']['rootCommit'] == root_sha
assert not git('status', '--porcelain', '--untracked-files=all', cwd=TARGET)
assert not any(p.startswith(('docs/', 'artifacts/', 'dist/', 'target/', 'node_modules/')) or '/verification/' in p for p in actual)
assert sum(p.endswith('.notesbackup') for p in actual) == 4
assert not any((TARGET / p).exists() for p in ('node_modules', 'dist', 'target'))
for public, template in {'README.md':'README.public.md', '.gitignore':'gitignore.public',
                         'LICENSE':'LICENSE.project-reserved.txt', 'THIRD_PARTY_NOTICES.md':'THIRD_PARTY_NOTICES.md'}.items():
    assert (TARGET / public).read_bytes() == git('show', REF + ':scripts/publish/' + template)
workflow = (TARGET / '.github/workflows/packages.yml').read_bytes()
assert workflow == git('show', REF + ':.github/workflows/packages.yml')
w = workflow.decode()
assert 'contents: read' in w and w.count('persist-credentials: false') == 2
assert w.count('node scripts/publish/verify.mjs') == 2 and 'test "$(uname -m)" = arm64' in w
assert '--all-features' not in w and w.count('timeout-minutes: 60') == 2
assert not any(s in w for s in ('contents: write', 'id-token: write', 'git push', 'gh repo', 'gh release', 'wrangler deploy'))
uploads = [line.strip() for line in w.splitlines() if line.strip().startswith('release-packages/')]
assert len(uploads) == len(set(uploads)) == 8
assert all(p.endswith(('.zip', '.apk', '.json', '.sha256')) for p in uploads)
prior = payload(OLD)
delta = dict(added=sorted(set(actual)-set(prior)), removed=sorted(set(prior)-set(actual)),
             changed=sorted(p for p in set(actual)&set(prior) if actual[p] != prior[p]))
assert not delta['added'] and not delta['removed'], 'Unexpected inventory addition/removal; stop for review'
final_seal = seal(TARGET)
old_after = seal(OLD)
assert initial_seal == final_seal and old_before == old_after
assert not git('status', '--porcelain', '--untracked-files=normal')
receipt = dict(schema=1, status='DRAFT_PREPARED_ACCEPTANCE_SEPARATE', sourceRef=REF,
    sourceTree=git('rev-parse', 'HEAD^{tree}').decode().strip(), sourceCheckout=str(SOURCE),
    target=str(TARGET), draftRootCommit=root_sha, draftTree=tree_sha, export=exported,
    manifestDryRunChanges=[], inventoryMatchedExactPlan=True,
    payloadSeal=dict(entries=len(actual), sha256=sha(canonical(actual))),
    draftInitialFullSeal=initial_seal, draftFinalFullSeal=final_seal, draftUnchangedAfterInitialization=True,
    newRootVerification=verified, draftSourceIdentity=identity,
    priorDraft=dict(path=str(OLD), before=old_before, after=old_after, unchanged=True, delta=delta),
    executedToolSha256=tool_hashes, freeBytesBefore=free_before, freeBytesAfter=shutil.disk_usage(TARGET.parent).free,
    privacy=dict(exactAllowlistHashPolicyAndDependencyClosurePassed=True, privateDocsEvidenceStoresBuildCachesExcluded=True,
                 syntheticArchiveCount=4, publicTransformsExact=True, workflowSha256=sha(workflow),
                 workflowExactSource=True, workflowExecuted=False, contentsPermission='read', persistCredentials=False,
                 releaseUploadAllowlist=uploads, noPublishPushDeploySigningClaim=True),
    boundary=dict(parentlessLocalDraftOnly=True, remoteOrGitHubOrActions=False, dependencyInstall=False,
                  productBuild=False, testsRerun=False, networkAppDeviceCredentialOrOriginalStoreAccess=False,
                  sharedTargetUse=False, priorNodePreflightNotReusedAsNewDraftPass=True),
    preparedAtUtc=datetime.datetime.now(datetime.timezone.utc).isoformat())
save('receipt.json', receipt)
print(json.dumps(dict(status=receipt['status'], target=str(TARGET), rootCommit=root_sha, tree=tree_sha,
                     files=exported['fileCount'], bytes=exported['bytes'], priorDraftUnchanged=True), indent=2), flush=True)
