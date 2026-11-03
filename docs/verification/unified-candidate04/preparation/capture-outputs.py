#!/usr/bin/env python3
"""Future artifact preservation. Failed attempts remain intact; no install/launch."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile
import common as c

p = argparse.ArgumentParser()
p.add_argument('stage', choices=['mac', 'android'])
p.add_argument('expected_head')
p.add_argument('run_directory', type=Path)
p.add_argument('attempt')
a = p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]+', a.attempt):
    raise SystemExit('Attempt must be a simple unique identifier')
run = a.run_directory.resolve()
attempt = run / (a.stage + '-' + a.attempt)
built = json.loads((attempt / 'result.json').read_text())
if built.get('exitCode') != 0 or any(k in built for k in ['error', 'invalidated', 'offlineMarkerMissing']):
    raise SystemExit('Failed/invalidated build; raw logs retained, no successful identity claim')
before = json.loads((run / 'source-inputs-before.json').read_text())
if before['head'] != a.expected_head or built.get('expectedHead') != a.expected_head or built.get('sourceAggregate') != before['aggregate'] or built.get('stage') != a.stage:
    raise SystemExit('Build attempt does not match authorized stage/SHA/frozen inputs')
after = c.capture(a.expected_head)
c.write_new(attempt / 'inputs-before-collection.json', after)
if not all(c.same_inputs(before, after).values()):
    raise SystemExit('Input/source/environment changed after build')
c.check_space()
result = {'at': c.now(), 'stage': a.stage, 'expectedHead': a.expected_head, 'sourceAggregate': before['aggregate'], 'buildAttempt': str(attempt), 'features': 'default; no proof/config feature override', 'listedInputsUnchanged': True, 'dist': c.tree(c.ROOT / 'dist')}
prefix = '/private/tmp/notes-unified-candidate04-' + run.name + '-'
if a.stage == 'mac':
    source = c.ROOT / 'src-tauri/target/release/bundle/macos/备忘录.app'
    executable = source / 'Contents/MacOS/notes-clone'
    exe = c.identity(executable)
    preserved = Path(prefix + 'mac-original-' + exe['sha256'][:8] + '.app')
    archive = preserved.with_suffix('.zip')
    if preserved.exists() or archive.exists():
        raise SystemExit('Refuse overwrite preserved bundle/archive')
    subprocess.run(['/usr/bin/ditto', str(source), str(preserved)], check=True)
    files = c.tree(source)
    if files != c.tree(preserved):
        raise SystemExit('Preserved bundle mismatch')
    subprocess.run(['/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(preserved), str(archive)], check=True)
    signature = [c.command(['/usr/bin/codesign', '-d', '--verbose=4', str(preserved)]), c.command(['/usr/bin/codesign', '-d', '--entitlements', '-', str(preserved)]), c.command(['/usr/bin/codesign', '-d', '-r-', str(preserved)]), c.command(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(preserved)])]
    result.update({'sourceApp': str(source), 'preservedApp': str(preserved), 'executable': exe, 'bundleFiles': files, 'preservedBundleMatches': True, 'archive': c.identity(archive), 'signatureCommands': signature})
else:
    source = c.ROOT / 'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk'
    apk = c.identity(source)
    preserved = Path(prefix + 'android-' + apk['sha256'][:8] + '.apk')
    if preserved.exists():
        raise SystemExit('Refuse overwrite preserved APK')
    shutil.copy2(source, preserved)
    if c.sha_file(preserved) != apk['sha256']:
        raise SystemExit('Preserved APK mismatch')
    entries = []
    with zipfile.ZipFile(preserved) as z:
        for item in sorted(z.infolist(), key=lambda x: x.filename):
            if item.is_dir():
                continue
            digest = hashlib.sha256()
            with z.open(item) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
            entries.append({'path': item.filename, 'bytes': item.file_size, 'compressedBytes': item.compress_size, 'sha256': digest.hexdigest()})
    models = [e for e in entries if e['path'].startswith('assets/mlkit-google-ocr-models/')]
    expected = {m['path']: (m['bytes'], m['sha256']) for archive in before['ocrCache'] for m in archive['models']}
    actual = {m['path']: (m['bytes'], m['sha256']) for m in models}
    env = __import__('os').environ.copy()
    env.update(before['effectiveBuildEnvironment'])
    env['PATH'] = env['JAVA_HOME'] + '/bin:' + env['PATH']
    signature = c.command([env['ANDROID_HOME'] + '/build-tools/36.0.0/apksigner', 'verify', '--verbose', '--print-certs', str(preserved)], env=env)
    result.update({'apk': apk, 'preservedApk': c.identity(preserved), 'allZipEntries': entries, 'abis': sorted({e['path'].split('/')[1] for e in entries if e['path'].startswith('lib/') and e['path'].endswith('.so')}), 'ocrModels': models, 'ocrModelBytes': sum(e['bytes'] for e in models), 'ocrModelsExactlyMatchCachedAars': bool(expected) and actual == expected, 'signature': signature, 'limits': 'APK bytes/models/library/config evidence only. No device install, runtime loading, first-offline recognition, UI or interaction claim.'})
c.write_new(run / (a.stage + '-original-identity.json'), result)
print({k: v for k, v in result.items() if k not in ['bundleFiles', 'allZipEntries', 'dist', 'ocrModels']})
if a.stage == 'android' and (result['signature']['exit'] != 0 or not result['ocrModelsExactlyMatchCachedAars']):
    raise SystemExit('APK retained with failed signature/model acceptance; inspect identity, do not claim candidate ready')
