"""Bounded Node/frontend checks of a disposable independent sanitized clone."""
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import signal
import subprocess
import time

ARCHIVE = pathlib.Path(__file__).resolve().parent
DRAFT = pathlib.Path('/private/tmp/account109-source-9010c5ba-DRAFT-20261113-01')
ROOT = pathlib.Path('/private/tmp/account109-source-66ad8c52-node-preflight01')
REVISION = '66ad8c524841acd574b705ead8d08c7bb9a50ad7'
STORE = '/Users/water/Library/pnpm/store/v10'
LIMIT = 2 * 1024**3
LOCKS = ['pnpm-lock.yaml', 'src-tauri/Cargo.lock', 'crates/account-auth/Cargo.lock', 'services/coordinator/package-lock.json']
ENV = {k: os.environ[k] for k in ['PATH', 'LANG', 'LC_ALL'] if k in os.environ}
ENV.update(HOME='/var/empty', GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1',
           CI='true', COREPACK_ENABLE_NETWORK='0', PYTHONDONTWRITEBYTECODE='1',
           npm_config_userconfig='/dev/null', npm_config_offline='true')
receipt = {'schema': 1, 'kind': 'sanitized-source-draft-node-frontend-preflight',
           'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'draft': str(DRAFT), 'disposableClone': str(ROOT), 'expectedRoot': REVISION,
           'developmentBase': '6aa009b216d0fb6a64ebeb2c9c53580fe7581e38',
           'diskLimitBytes': LIMIT, 'diskPeakLogicalBytes': 0, 'diskPeakAllocatedBytes': 0,
           'diskMeasurement': 'owned clone plus receipt; conservative max of logical and allocated bytes, sampled during commands',
           'commands': [], 'status': 'running', 'environment': ENV.copy(),
           'nativeBuildRun': False, 'deviceOrUiRun': False, 'externalAccountAccess': False,
           'dependencyNetworkAllowed': False, 'oldDraftWritten': False}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save():
    (ARCHIVE / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')


def measure():
    logical = allocated = 0
    for top in [ROOT, ARCHIVE]:
        if not top.exists():
            continue
        for directory, children, files in os.walk(top, followlinks=False):
            for name in children + files:
                try:
                    stat = (pathlib.Path(directory) / name).lstat()
                    logical += stat.st_size
                    allocated += stat.st_blocks * 512
                except FileNotFoundError:
                    pass
    receipt['diskPeakLogicalBytes'] = max(receipt['diskPeakLogicalBytes'], logical)
    receipt['diskPeakAllocatedBytes'] = max(receipt['diskPeakAllocatedBytes'], allocated)
    if max(logical, allocated) > LIMIT:
        raise RuntimeError('owned disk budget exceeded; stopped before further work')


def step(name, argv, cwd=ROOT, timeout=600):
    start = time.monotonic()
    stdout = ARCHIVE / (name + '.stdout.txt')
    stderr = ARCHIVE / (name + '.stderr.txt')
    entry = {'name': name, 'argv': argv, 'cwd': str(cwd)}
    with stdout.open('wb') as out, stderr.open('wb') as err:
        process = subprocess.Popen(argv, cwd=cwd, env=ENV, stdout=out, stderr=err, start_new_session=True)
        failure = None
        try:
            while process.poll() is None:
                measure()
                if time.monotonic() - start > timeout:
                    raise RuntimeError('bounded command timeout')
                time.sleep(0.5)
            measure()
        except BaseException as error:
            failure = str(error)
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=10)
        entry.update(exitCode=process.wait(), durationSeconds=round(time.monotonic() - start, 3),
                     stdoutSha256=sha(stdout), stderrSha256=sha(stderr))
        if failure:
            entry['controllerFailure'] = failure
        receipt['commands'].append(entry)
        save()
        print(name, entry['exitCode'], flush=True)
        if failure or entry['exitCode']:
            raise RuntimeError(failure or name + ' returned nonzero')
    return stdout.read_text()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, env=ENV, text=True).strip()


def identity():
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {sourceIdentity} from './scripts/build-info.mjs'; console.log(JSON.stringify(sourceIdentity(process.cwd(),{metadataPath:null})));"],
        cwd=ROOT, env=ENV, text=True))


try:
    assert not ROOT.exists()
    save()
    step('clone', ['git', 'clone', '--no-local', str(DRAFT), str(ROOT)], cwd=ROOT.parent)
    step('remove-origin', ['git', 'remote', 'remove', 'origin'])
    assert git('rev-parse', 'HEAD') == REVISION
    assert not git('remote')
    assert not git('status', '--porcelain', '--untracked-files=all')
    assert not (ROOT / '.git/objects/info/alternates').exists()
    receipt['cloneIndependent'] = True
    receipt['rootTree'] = git('rev-parse', 'HEAD^{tree}')
    receipt['sourceBefore'] = identity()
    receipt['lockfilesBefore'] = {p: sha(ROOT / p) for p in LOCKS}
    home = ROOT / '.git/task-home'
    tmp = ROOT / '.git/task-tmp'
    home.mkdir(); tmp.mkdir()
    ENV.update(HOME=str(home), XDG_CONFIG_HOME=str(home / '.config'),
               XDG_CACHE_HOME=str(home / '.cache'), TMPDIR=str(tmp) + '/')
    receipt['environment'] = ENV.copy()
    receipt['toolchain'] = {name: subprocess.check_output(argv, cwd=ROOT, env=ENV, text=True).strip()
                           for name, argv in {'node': ['node', '--version'], 'pnpm': ['pnpm', '--version']}.items()}
    # The ordinary new-checkout gate is required before installation. The old
    # sealed root's history/inventory audit is not repeated here.
    step('verify', ['node', 'scripts/publish/verify.mjs'])
    step('install', ['pnpm', 'install', '--frozen-lockfile', '--offline', '--store-dir', STORE,
                     '--package-import-method=copy', '--side-effects-cache-readonly'])
    step('versions', ['pnpm', 'version:check'])
    step('typecheck', ['pnpm', 'typecheck'])
    step('publish-tests', ['pnpm', 'test:publish'])
    step('frontend-build', ['pnpm', 'build'])
    info = json.loads((ROOT / 'dist/build-info.json').read_text())
    receipt['frontendBuildInfo'] = info
    (ARCHIVE / 'frontend-build-info.json').write_text(json.dumps(info, indent=2) + '\n')
    receipt['status'] = 'passed-node-frontend-only'
except BaseException as error:
    receipt['status'] = 'stopped'
    receipt['failure'] = str(error)[:300]
finally:
    if (ROOT / '.git').is_dir():
        try:
            receipt['sourceAfter'] = identity()
            receipt['lockfilesAfter'] = {p: sha(ROOT / p) for p in LOCKS}
            receipt['finalGitStatus'] = git('status', '--porcelain', '--untracked-files=all')
            receipt['safeToRemoveClone'] = (receipt.get('sourceBefore') == receipt['sourceAfter']
                and receipt.get('lockfilesBefore') == receipt['lockfilesAfter']
                and not receipt['finalGitStatus'])
        except BaseException as error:
            receipt['cleanupCheckFailure'] = str(error)[:300]
            receipt['safeToRemoveClone'] = False
    receipt['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
    print('finalStatus', receipt['status'], 'safeToRemoveClone', receipt.get('safeToRemoveClone'), flush=True)
