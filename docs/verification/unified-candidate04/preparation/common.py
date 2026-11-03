"""Evidence helpers. Importing this module never builds, freezes or contacts devices."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[4]
PREP = Path(__file__).resolve().parent
OLD = ROOT / 'docs/verification/unified-candidate03/build/source-inputs-before.json'
CACHE = Path('/private/tmp/notes-scan-gradle-home')
EXCLUDE = {'target', 'build', '.gradle', '.kotlin', '.tauri', '.cache', 'node_modules', '.git'}
PREFIXES = ('src/', 'src-tauri/', 'scripts/', 'assets/', 'patches/', 'plugins/')
NAMES = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'index.html', 'tsconfig.json', 'vite.config.ts', '.npmrc', '.cargo/config', '.cargo/config.toml', 'rust-toolchain', 'rust-toolchain.toml'}
RELEVANT = ['VITE_ACCESS_BOUNDARY_PROOF', 'TAURI_CONFIG', 'TAURI_ENV_PLATFORM', 'TAURI_ANDROID_PROJECT_PATH', 'CARGO_BUILD_TARGET', 'CARGO_TARGET_DIR', 'RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS']
GENERATED = ['src-tauri/gen/android/tauri.settings.gradle', 'src-tauri/gen/android/app/tauri.build.gradle.kts']

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def identity(path):
    path = Path(path)
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': sha_file(path)}

def write_new(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def command(args, env=None):
    result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True)
    return {'argv': [str(a) for a in args], 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True)

def files_under(path):
    path = Path(path)
    for directory, names, files in os.walk(path):
        names[:] = sorted(n for n in names if n not in EXCLUDE)
        for name in sorted(files):
            if name != '.DS_Store':
                yield Path(directory) / name

def effective_environment():
    sdk = Path(os.environ.get('ANDROID_HOME', '/Users/water/Library/Android/sdk'))
    ndk = Path(os.environ.get('NDK_HOME', ''))
    if not os.environ.get('NDK_HOME') or not ndk.is_dir():
        ndk = sdk / 'ndk/27.2.12479018'
    java = Path(os.environ.get('JAVA_HOME', '/opt/zerobrew/opt/openjdk@17'))
    required = [sdk / 'build-tools/36.0.0/apksigner', sdk / 'platforms/android-36/android.jar', ndk, java / 'bin/java', CACHE]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        raise RuntimeError('Missing existing tools/cache; no acquisition allowed: ' + repr(missing))
    return {'ANDROID_HOME': str(sdk), 'NDK_HOME': str(ndk), 'JAVA_HOME': str(java), 'GRADLE_USER_HOME': str(CACHE), 'CARGO_NET_OFFLINE': 'true', 'CARGO_BUILD_JOBS': '2'}

def model_cache():
    rows = []
    base = CACHE / 'caches/modules-2/files-2.1'
    for group in ['com.google.mlkit', 'com.google.android.gms']:
        parent = base / group
        if not parent.exists():
            continue
        for module in sorted(parent.iterdir()):
            if 'text-recognition' not in module.name:
                continue
            for archive in sorted(module.rglob('*.aar')):
                models = []
                with zipfile.ZipFile(archive) as z:
                    for entry in sorted(z.infolist(), key=lambda e: e.filename):
                        if entry.filename.startswith('assets/mlkit-google-ocr-models/') and not entry.is_dir():
                            with z.open(entry) as stream:
                                digest = hashlib.sha256()
                                for block in iter(lambda: stream.read(1024 * 1024), b''):
                                    digest.update(block)
                            models.append({'path': entry.filename, 'bytes': entry.file_size, 'sha256': digest.hexdigest()})
                rows.append({**identity(archive), 'models': models})
    return rows

def resource_paths():
    plugin = ROOT / 'plugins/tauri-plugin-notes-scan'
    result = {'pluginSourceFiles': [str(p.relative_to(ROOT)) for p in files_under(plugin)], 'androidDefaultSourceRoots': [str(plugin / 'android/src/main/java'), str(plugin / 'android/src/main/res'), str(plugin / 'android/src/main/assets')], 'gradleRouting': {}, 'modelCache': model_cache(), 'diskFree': shutil.disk_usage(ROOT).free, 'rootAndTmpSameDevice': ROOT.stat().st_dev == Path('/private/tmp').stat().st_dev}
    for relative in GENERATED + ['plugins/tauri-plugin-notes-scan/android/build.gradle.kts', 'plugins/tauri-plugin-notes-scan/build.rs']:
        p = ROOT / relative
        result['gradleRouting'][relative] = {**identity(p), 'text': p.read_text()}
    result['scanInGeneratedSettings'] = 'tauri-plugin-notes-scan' in (ROOT / GENERATED[0]).read_text()
    result['scanInGeneratedAppDependency'] = 'tauri-plugin-notes-scan' in (ROOT / GENERATED[1]).read_text()
    result['modelFiles'] = sum(len(a['models']) for a in result['modelCache'])
    result['modelBytes'] = sum(m['bytes'] for a in result['modelCache'] for m in a['models'])
    return result

def capture(expected_head):
    head = git('rev-parse', 'HEAD').strip()
    if len(expected_head) != 40 or head != expected_head:
        raise RuntimeError('Exact authorized 40-character HEAD required')
    dirty = git('diff', 'HEAD', '--name-only').splitlines()
    if dirty:
        raise RuntimeError('Tracked changes before capture: ' + repr(dirty))
    flags = {k: os.environ.get(k) for k in RELEVANT}
    if any(v is not None for v in flags.values()):
        raise RuntimeError('Unexpected feature/config/target overrides: ' + repr(flags))
    tracked = set(git('ls-files', '-z').split('\0')) - {''}
    untracked = set(git('ls-files', '--others', '--exclude-standard', '-z').split('\0')) - {''}
    unexpected = sorted(p for p in untracked if p.startswith(PREFIXES) or p in NAMES)
    if unexpected:
        raise RuntimeError('Untracked product inputs: ' + repr(unexpected))
    previous = json.loads(OLD.read_text())
    paths = {x['path'] for x in previous['files']}
    paths.update(p for p in tracked if p.startswith(PREFIXES) or p in NAMES)
    # Include ignored plugin resources/models/native/permissions/locks too; never recurse build/target.
    for plugin in ['plugins/tauri-plugin-notes-ui', 'plugins/tauri-plugin-notes-scan']:
        paths.update(str(p.relative_to(ROOT)) for p in files_under(ROOT / plugin))
    paths.update(GENERATED)
    missing = [p for p in sorted(paths) if not (ROOT / p).is_file()]
    if missing:
        raise RuntimeError('Previously listed or current inputs missing: ' + repr(missing))
    routing = resource_paths()
    if not routing['scanInGeneratedSettings'] or not routing['scanInGeneratedAppDependency']:
        raise RuntimeError('Required generated notes-scan registration is stale; run separately authorized recorded preflight before final freeze')
    if not routing['modelFiles']:
        raise RuntimeError('Existing bundled OCR models not found in selected cache; no download allowed')
    rows = [{**identity(ROOT / p), 'path': p} for p in sorted(paths)]
    aggregate = hashlib.sha256(''.join(x['sha256'] + '  ' + x['path'] + '\n' for x in rows).encode()).hexdigest()
    effective = effective_environment()
    versions = [command(args) for args in [['node', '--version'], ['pnpm', '--version'], ['cargo', '--version'], ['rustc', '--version'], [effective['JAVA_HOME'] + '/bin/java', '-version']]]
    return {'at': now(), 'head': head, 'count': len(rows), 'aggregate': aggregate, 'files': rows, 'toolVersions': versions, 'relevantEnvironment': flags, 'selectedParentEnvironment': {k: os.environ.get(k) for k in ['JAVA_HOME', 'NDK_HOME', 'ANDROID_HOME', 'GRADLE_USER_HOME', 'CARGO_NET_OFFLINE', 'CARGO_BUILD_JOBS', 'GRADLE_OPTS', 'JAVA_OPTS', 'JAVA_TOOL_OPTIONS']}, 'effectiveBuildEnvironment': effective, 'ocrCache': routing['modelCache'], 'scope': 'Listed product/source/plugin resources plus all candidate03 generated Android and patched dependency inputs, and cached OCR AAR/model bytes. Excludes build/target/cache outputs. Not complete SDK/OS/transitive dependency reproducibility.'}

def same_inputs(before, after):
    keys = ['head', 'files', 'toolVersions', 'relevantEnvironment', 'selectedParentEnvironment', 'effectiveBuildEnvironment', 'ocrCache']
    return {key: before[key] == after[key] for key in keys}

def check_space():
    free = shutil.disk_usage(ROOT).free
    if free < 2 * 1024**3:
        raise RuntimeError('Less than 2 GiB available; stop without clean/download/target copy')
    return free

def tree(path):
    path = Path(path)
    rows = []
    for p in sorted(path.rglob('*')):
        rel = str(p.relative_to(path))
        if p.is_symlink():
            target = os.readlink(p)
            rows.append({'path': rel, 'type': 'symlink', 'target': target, 'sha256': hashlib.sha256(target.encode()).hexdigest()})
        elif p.is_file():
            rows.append({**identity(p), 'path': rel, 'type': 'file'})
    return rows
