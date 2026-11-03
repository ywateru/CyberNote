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
from recovery_common import c, supplemental

p = argparse.ArgumentParser()
p.add_argument('stage', choices=['android'])
p.add_argument('expected_head')
p.add_argument('run_directory', type=Path)
p.add_argument('attempt')
a = p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]+', a.attempt):
    raise SystemExit('Attempt must be a simple unique identifier')
run = a.run_directory.resolve()
attempt = run / (a.stage + '-' + a.attempt)
built = json.loads((attempt / 'result.json').read_text())
if built.get('exitCode') != 0 or any(k in built for k in ['error', 'invalidated', 'offlineMarkerMissing', 'cleanupError', 'stopReason']):
    raise SystemExit('Failed/invalidated build; raw logs retained, no successful identity claim')
if built.get('supplementalInputsUnchanged') is not True:
    raise SystemExit('Supplemental recovery inputs were not verified after build')
extra_before = json.loads((run / 'recovery-inputs-before.json').read_text())
before = json.loads((run / 'source-inputs-before.json').read_text())
if before['head'] != a.expected_head or built.get('expectedHead') != a.expected_head or built.get('sourceAggregate') != before['aggregate'] or built.get('stage') != a.stage:
    raise SystemExit('Build attempt does not match authorized stage/SHA/frozen inputs')
after = c.capture(a.expected_head)
c.write_new(attempt / 'inputs-before-collection.json', after)
extra_collection = supplemental(after)
c.write_new(attempt / 'recovery-inputs-before-collection.json', extra_collection)
if extra_collection != extra_before:
    raise SystemExit('Supplemental inputs changed before collection')
if not all(c.same_inputs(before, after).values()):
    raise SystemExit('Input/source/environment changed after build')
c.check_space()
result = {'at': c.now(), 'stage': a.stage, 'expectedHead': a.expected_head, 'sourceAggregate': before['aggregate'], 'buildAttempt': str(attempt), 'features': 'default; no proof/config feature override', 'listedInputsUnchanged': True, 'dist': c.tree(c.ROOT / 'dist')}
result['acceptedMacReference'] = extra_before['acceptedMacReference']
result['supplementalBuildEnvironment'] = extra_before['supplementalBuildEnvironment']
prefix = '/private/tmp/notes-unified-candidate04-' + run.name + '-'
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
extra_after = supplemental(after)
c.write_new(attempt / 'recovery-inputs-after-collection.json', extra_after)
result['supplementalInputsUnchangedDuringCollection'] = extra_before == extra_after
c.write_new(run / (a.stage + '-original-identity.json'), result)
if not result['supplementalInputsUnchangedDuringCollection']:
    raise SystemExit('Supplemental inputs changed during collection')
print({k: v for k, v in result.items() if k not in ['bundleFiles', 'allZipEntries', 'dist', 'ocrModels']})
if a.stage == 'android' and (result['signature']['exit'] != 0 or not result['ocrModelsExactlyMatchCachedAars']):
    raise SystemExit('APK retained with failed signature/model acceptance; inspect identity, do not claim candidate ready')
