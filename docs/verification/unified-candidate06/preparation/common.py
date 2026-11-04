"""Candidate06 boundary helpers. Import has no tool, device or build side effects."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import time
import zipfile

MIN_FREE = 2 * 1024**3
DEADLINE = 600
CACHE = Path('/private/tmp/notes-scan-gradle-home')
OVERLAY = Path('/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro')
LOCK = Path('/private/tmp/notes-unified-candidate04-build.lock')
GENERATED = ['src-tauri/gen/android/tauri.settings.gradle', 'src-tauri/gen/android/app/tauri.build.gradle.kts']
PATCHED_DEPENDENCY = 'node_modules/.pnpm/prosemirror-view@1.42.9_patch_hash=d108f8a44a6a15b29cd7c7460f2aa5bd9d7bcb12510acabe6bfa1d159932161d/node_modules/prosemirror-view/'
PATCHED_INPUTS = [PATCHED_DEPENDENCY + p for p in ['dist/index.cjs', 'dist/index.d.ts', 'dist/index.js', 'src/index.ts', 'src/input.ts']]
PREFIXES = ('src/', 'src-tauri/', 'scripts/', 'assets/', 'patches/', 'plugins/')
NAMES = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'index.html', 'tsconfig.json', 'vite.config.ts', '.npmrc', '.cargo/config', '.cargo/config.toml', 'rust-toolchain', 'rust-toolchain.toml'}
EXCLUDE = {'target', 'build', '.gradle', '.kotlin', '.tauri', '.cache', 'node_modules', '.git'}
FORBIDDEN = ['TAURI_CONFIG', 'TAURI_ENV_PLATFORM', 'TAURI_ANDROID_PROJECT_PATH', 'CARGO_BUILD_TARGET', 'CARGO_TARGET_DIR', 'RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'JAVA_OPTS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS', 'GRADLE_PROJECT_', 'CARGO_ENCODED_RUSTDOCFLAGS', 'RUSTDOCFLAGS', 'CARGO_BUILD_RUSTFLAGS', 'RUSTC_WRAPPER', 'RUSTC_WORKSPACE_WRAPPER']
PARENT = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'DEVELOPER_DIR', 'SDKROOT', 'MACOSX_DEPLOYMENT_TARGET', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'NDK_HOME', 'JAVA_HOME', 'GRADLE_USER_HOME', 'GRADLE_RO_DEP_CACHE', 'GRADLE_OPTS', 'CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'CARGO_NET_OFFLINE', 'CARGO_BUILD_JOBS', 'CI']
CERT = 'e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'
EXPECTED_OVERLAY = {
 'modules-2/metadata-2.107/module-artifact.bin': (18667, '55b0eeb6b0400be7162efe79646c630f6c05b88165f1e89e946e252f169d2654'),
 'modules-2/files-2.1/androidx.lifecycle/lifecycle-livedata/2.10.0/ce0b5f930a64679a621c8bc67c060a7820c0a57b/lifecycle-livedata-2.10.0.aar': (55037, '3e8c009fc88da1c52e4ed05a81269d5ac9bd405046f300307f5e3a17e201a6df')}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def identity(path):
    p = Path(path)
    return {'path': str(p), 'bytes': p.stat().st_size, 'sha256': sha_file(p)}


def write_new(path, value):
    path = Path(path)
    check_space(path.parent)
    with path.open('x') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def record_new(path, value):
    """Emergency evidence must survive even when the 2GiB guard has fired."""
    with Path(path).open('x') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def load(path):
    return json.loads(Path(path).read_text())


def check_space(path):
    free = shutil.disk_usage(path).free
    if free < MIN_FREE:
        raise RuntimeError('disk-guard: less than 2GiB; retain evidence and caches')
    return free


def aggregate(rows):
    return hashlib.sha256(''.join(r['sha256'] + '  ' + r['path'] + '\n' for r in rows).encode()).hexdigest()


def relative_paths(value):
    if not isinstance(value, list) or not value or value != sorted(set(value)):
        raise ValueError('Paths must be an explicit nonempty sorted unique list')
    for item in value:
        if not isinstance(item, str) or not item or Path(item).is_absolute() or '..' in Path(item).parts or str(Path(item)) != item:
            raise ValueError('Invalid source-relative input: ' + repr(item))
    return value


def inside(path, parent):
    path = Path(path)
    if not path.is_absolute() or path.is_symlink() or path.resolve() != path:
        raise ValueError('Output/root must be canonical absolute path: ' + str(path))
    if path == parent or parent not in path.parents:
        raise ValueError('Output outside authorized candidate06 boundary: ' + str(path))
    return path


def authorization(path):
    a = load(path)
    required = {'schema', 'stage', 'root', 'sourceHead', 'productAggregate', 'productPaths', 'inputPaths', 'runDirectory', 'artifactDirectory'}
    if set(a) != required or a['schema'] != 1 or a['stage'] not in ('mac', 'android'):
        raise ValueError('Explicit schema1 authorization fields required; unknown fields rejected')
    if not re.fullmatch('[0-9a-f]{40}', a['sourceHead']) or not re.fullmatch('[0-9a-f]{64}', a['productAggregate']):
        raise ValueError('Exact40 source SHA and SHA256 product aggregate required')
    root = Path(a['root'])
    if not root.is_absolute() or root.resolve() != root or not root.is_dir():
        raise ValueError('Canonical existing absolute source root required')
    relative_paths(a['productPaths']); relative_paths(a['inputPaths'])
    if not set(a['productPaths']) <= set(a['inputPaths']):
        raise ValueError('Product inputs must be included in complete explicit input list')
    inside(a['runDirectory'], root / 'docs/verification/unified-candidate06')
    inside(a['artifactDirectory'], root / 'artifacts/unified-candidate06')
    return a


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root, text=True)


def rows(root, paths):
    result = []
    for relative in paths:
        p = root / relative
        if not p.is_file():
            raise RuntimeError('Missing declared input: ' + relative)
        row = {**identity(p), 'path': relative}
        if p.is_symlink():
            row['symlinkTarget'] = os.readlink(p)
        result.append(row)
    return result


def effective_environment(stage):
    env = {'ANDROID_HOME': '/Users/water/Library/Android/sdk',
           'NDK_HOME': '/Users/water/Library/Android/sdk/ndk/27.2.12479018',
           'JAVA_HOME': '/opt/zerobrew/opt/openjdk@17', 'GRADLE_USER_HOME': str(CACHE),
           'CARGO_NET_OFFLINE': 'true', 'CARGO_BUILD_JOBS': '2'}
    if stage == 'android':
        env.update(GRADLE_RO_DEP_CACHE=str(OVERLAY), GRADLE_OPTS='-Dorg.gradle.daemon=false')
    required = [Path(env['ANDROID_HOME']) / 'platforms/android-36/android.jar', Path(env['ANDROID_HOME']) / 'build-tools/36.0.0/apksigner', Path(env['NDK_HOME']), Path(env['JAVA_HOME']) / 'bin/java', CACHE]
    if any(not p.exists() for p in required):
        raise RuntimeError('Existing tool/cache missing; acquisition forbidden')
    return env


def tree(path):
    path = Path(path)
    if not path.is_dir():
        raise RuntimeError('Missing bundle/directory: ' + str(path))
    result = []
    for p in sorted(path.rglob('*')):
        relative = str(p.relative_to(path))
        if p.is_symlink():
            target = os.readlink(p)
            result.append({'path': relative, 'type': 'symlink', 'target': target, 'sha256': hashlib.sha256(target.encode()).hexdigest()})
        elif p.is_file():
            result.append({**identity(p), 'path': relative, 'type': 'file', 'mode': p.stat().st_mode & 0o777})
    if not result:
        raise RuntimeError('Empty bundle/directory: ' + str(path))
    return result


def zip_entries(path):
    result = []
    with zipfile.ZipFile(path) as z:
        names = [i.filename for i in z.infolist()]
        if len(names) != len(set(names)):
            raise RuntimeError('Duplicate ZIP entries rejected')
        for item in sorted(z.infolist(), key=lambda i: i.filename):
            if item.is_dir():
                continue
            digest = hashlib.sha256()
            with z.open(item) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
            result.append({'path': item.filename, 'bytes': item.file_size, 'compressedBytes': item.compress_size, 'sha256': digest.hexdigest()})
    return result


def supplemental():
    files = []
    if not OVERLAY.is_dir() or OVERLAY.is_symlink() or OVERLAY.stat().st_mode & 0o222:
        raise RuntimeError('Overlay root must exist, be real and read-only')
    for p in sorted(OVERLAY.rglob('*')):
        if p.is_symlink() or p.stat().st_mode & 0o222:
            raise RuntimeError('Overlay must be real and read-only: ' + str(p))
        if p.is_file():
            rel = str(p.relative_to(OVERLAY)); item = identity(p)
            if EXPECTED_OVERLAY.get(rel) != (item['bytes'], item['sha256']):
                raise RuntimeError('Unexpected overlay bytes: ' + rel)
            files.append({**item, 'path': rel})
    if {r['path'] for r in files} != set(EXPECTED_OVERLAY):
        raise RuntimeError('Incomplete overlay')
    wrapper = CACHE / 'wrapper/dists/gradle-9.6.1-bin/4ticwg1pgcbps2hj28r8so764'
    distribution = wrapper / 'gradle-9.6.1'
    ok = wrapper / 'gradle-9.6.1-bin.zip.ok'
    if not (distribution / 'bin/gradle').is_file() or not ok.is_file():
        raise RuntimeError('Proven complete wrapper distribution absent; no retry/download')
    return {'overlayFiles': files, 'overlayAggregate': aggregate(files), 'distributionPath': str(distribution),
            'distributionResolved': str(distribution.resolve()), 'distributionFiles': tree(distribution),
            'okFile': identity(ok), 'okResolved': str(ok.resolve())}


def model_cache():
    result = []
    base = CACHE / 'caches/modules-2/files-2.1'
    for group in ['com.google.mlkit', 'com.google.android.gms']:
        parent = base / group
        if not parent.is_dir():
            continue
        for module in sorted(parent.iterdir()):
            if 'text-recognition' in module.name:
                for aar in sorted(module.rglob('*.aar')):
                    result.append({**identity(aar), 'models': [r for r in zip_entries(aar) if r['path'].startswith('assets/mlkit-google-ocr-models/')]})
    models = {r['path']: (r['bytes'], r['sha256']) for a in result for r in a['models']}
    if len(models) != 25:
        raise RuntimeError('Expected exactly25 distinct cached OCR models; no download')
    return result


def capture(a):
    root = Path(a['root'])
    if git(root, 'rev-parse', 'HEAD').strip() != a['sourceHead']:
        raise RuntimeError('Source SHA differs from authorization')
    if git(root, 'diff', 'HEAD', '--name-only'):
        raise RuntimeError('Tracked working tree/index dirty; do not ignore documentation changes')
    forbidden = {k: v for k, v in os.environ.items() if k in FORBIDDEN or k.startswith(('VITE_', 'TAURI_', 'CARGO_TARGET_', 'CARGO_PROFILE_', 'ORG_GRADLE_PROJECT_'))}
    if forbidden:
        raise RuntimeError('Proof/config/compiler overrides rejected: ' + repr(sorted(forbidden)))
    tracked = set(git(root, 'ls-files', '-z').split('\0')) - {''}
    untracked = set(git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')) - {''}
    if any(p.startswith(PREFIXES) or p in NAMES for p in untracked):
        raise RuntimeError('Untracked product inputs')
    mandatory = {p for p in tracked if p.startswith(PREFIXES) or p in NAMES}
    mandatory.update(GENERATED)
    mandatory.update(PATCHED_INPUTS)
    for plugin in ['plugins/tauri-plugin-notes-ui', 'plugins/tauri-plugin-notes-scan']:
        for directory, names, files in os.walk(root / plugin):
            names[:] = sorted(n for n in names if n not in EXCLUDE)
            mandatory.update(str((Path(directory) / f).relative_to(root)) for f in files if f != '.DS_Store')
    if not mandatory <= set(a['inputPaths']):
        raise RuntimeError('Explicit complete input list omits source/generated/plugin inputs: ' + repr(sorted(mandatory - set(a['inputPaths']))))
    if any('tauri-plugin-notes-scan' not in (root / p).read_text() for p in GENERATED):
        raise RuntimeError('Scan registration absent; separately authorized generation required')
    product = rows(root, a['productPaths'])
    if aggregate(product) != a['productAggregate']:
        raise RuntimeError('Product aggregate differs from root authorization')
    effective = effective_environment(a['stage'])
    versions = []
    for argv in [['node', '--version'], ['pnpm', '--version'], ['cargo', '--version'], ['rustc', '--version'], [effective['JAVA_HOME'] + '/bin/java', '-version']]:
        r = subprocess.run(argv, cwd=root, capture_output=True, text=True, timeout=30)
        if r.returncode:
            raise RuntimeError('Tool identity command failed: ' + repr(argv))
        versions.append({'argv': argv, 'exit': r.returncode, 'stdout': r.stdout, 'stderr': r.stderr})
    files = rows(root, a['inputPaths'])
    prep = Path(__file__).resolve().parent
    return {'at': now(), 'schema': 1, 'authorization': a, 'head': a['sourceHead'], 'stage': a['stage'],
            'productFiles': product, 'productAggregate': aggregate(product), 'files': files, 'aggregate': aggregate(files),
            'toolVersions': versions, 'tools': rows(prep, sorted(p.name for p in prep.glob('*.py'))),
            'selectedParentEnvironment': {k: os.environ.get(k) for k in PARENT},
            'effectiveBuildEnvironment': effective, 'ocrCache': model_cache(),
            'supplementalInputs': supplemental(),
            'scope': 'Explicit listed source/dependency/generated inputs and tool/version/environment/OCR/distribution/overlay identity; not complete OS/SDK/transitive reproducibility.'}


def same_inputs(before, after):
    return {k: before[k] == after[k] for k in before if k != 'at'}


def frozen(a, digest):
    if not re.fullmatch('[0-9a-f]{64}', digest):
        raise ValueError('Explicit root-reviewed freeze file SHA256 required')
    path = Path(a['runDirectory']) / 'input-freeze.json'
    if sha_file(path) != digest:
        raise RuntimeError('Freeze file bytes differ from authorization')
    before = load(path)
    if before['authorization'] != a:
        raise RuntimeError('Freeze belongs to a different authorization')
    return before


def success(result):
    return result.get('exitCode') == 0 and result.get('supplementalInputsUnchanged') is True and result.get('inputComparisons') and all(result['inputComparisons'].values()) and not any(k in result for k in ['error', 'invalidated', 'offlineMarkerMissing', 'cleanupError', 'stopReason'])


def inspect_init(path):
    info = path.lstat()
    item = {'path': str(path), 'device': info.st_dev, 'inode': info.st_ino, 'bytes': info.st_size, 'regularFile': stat.S_ISREG(info.st_mode)}
    if item['regularFile']:
        item['sha256'] = sha_file(path)
    return item


def cleanup_owned_init(path, owned):
    outcome = {'temporaryGradleInitRemoved': False}
    try:
        current = inspect_init(path)
        outcome['temporaryGradleInitBeforeCleanup'] = current
        if not current['regularFile'] or not owned or any(current.get(k) != owned.get(k) for k in ['device', 'inode', 'bytes', 'sha256']):
            raise RuntimeError('Temporary init changed; preserve without deletion')
        latest = path.lstat()
        if not stat.S_ISREG(latest.st_mode) or (latest.st_dev, latest.st_ino) != (owned['device'], owned['inode']):
            raise RuntimeError('Temporary init replaced before deletion; preserve')
        path.unlink()
        outcome['temporaryGradleInitRemoved'] = True
    except BaseException as error:
        outcome['cleanupError'] = repr(error)
    return outcome


def stop_owned(process, result):
    """Caller creates a fresh session. Never accept an externally supplied PID."""
    for sig, timeout in [(signal.SIGTERM, 5), (signal.SIGKILL, 5)]:
        try:
            os.killpg(process.pid, sig)
            result.setdefault('terminationSignals', []).append(sig.name)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            continue
        # Kill lingering descendants even if the leader exited after TERM.
        if sig == signal.SIGTERM:
            try:
                os.killpg(process.pid, signal.SIGKILL)
                result.setdefault('terminationSignals', []).append('SIGKILL descendants')
            except ProcessLookupError:
                pass
        return
    raise RuntimeError('Owned build process did not exit')


def monitored(argv, root, env, log_path, result, deadline=DEADLINE, free=check_space, poll=0.2):
    """Fixed callers use600s; short values only for controlled Python boundary checks."""
    if not 0 < deadline <= DEADLINE:
        raise ValueError('Deadline must be positive and at most600s')
    result['diskFreeBefore'] = free(root)
    result['minimumFreeBytes'] = result['diskFreeBefore']
    result['deadlineSeconds'] = deadline
    with Path(log_path).open('x') as log:
        process = subprocess.Popen(argv, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        result['ownedProcessGroup'] = process.pid
        start = time.monotonic()
        try:
            while True:
                try:
                    result['minimumFreeBytes'] = min(result['minimumFreeBytes'], free(root))
                except RuntimeError:
                    result['stopReason'] = 'disk-guard'
                content = Path(log_path).read_text(errors='replace')
                if re.search(r'Fetching distribution|Downloading https?://|Download https?://', content):
                    result['stopReason'] = 'download-prompt'
                if time.monotonic() - start >= deadline:
                    result['stopReason'] = 'deadline'
                if result.get('stopReason'):
                    if process.poll() is None:
                        stop_owned(process, result)
                    break
                if process.poll() is not None:
                    break
                time.sleep(poll)
        except BaseException:
            if process.poll() is None:
                stop_owned(process, result)
            raise
        finally:
            result['elapsedSeconds'] = round(time.monotonic() - start, 3)
            result['exitCode'] = process.wait(timeout=5)
    if result.get('stopReason'):
        raise RuntimeError('Owned command stopped: ' + result['stopReason'])


def lock_build():
    lock = LOCK.open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BaseException:
        lock.close()
        raise
    return lock
