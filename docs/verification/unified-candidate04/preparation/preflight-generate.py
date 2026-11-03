#!/usr/bin/env python3
"""Future root-authorized generation/check only; never run as preparation audit."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import common as c

p = argparse.ArgumentParser()
p.add_argument('expected_head')
p.add_argument('output_directory', type=Path)
p.add_argument('--execute-authorized-preflight', action='store_true')
a = p.parse_args()
if not a.execute_authorized_preflight:
    raise SystemExit('Requires separate root authorization; no generation performed')
if len(a.expected_head) != 40 or c.git('rev-parse', 'HEAD').strip() != a.expected_head:
    raise SystemExit('Exact reviewed SHA required')
if c.git('diff', 'HEAD', '--name-only').strip():
    raise SystemExit('Tracked tree must be clean before preflight')
if any(os.environ.get(k) is not None for k in c.RELEVANT):
    raise SystemExit('Unexpected pre-existing config/target/feature override')
untracked = c.git('ls-files', '--others', '--exclude-standard', '-z').split('\0')
if any(p and (p.startswith(c.PREFIXES) or p in c.NAMES) for p in untracked):
    raise SystemExit('Untracked product inputs must be resolved first')
a.output_directory.mkdir(parents=True, exist_ok=False)
record = {'at': c.now(), 'head': a.expected_head, 'exitCode': None, 'scope': 'One authorized normal tauri-build generation/check, not a unified candidate build or source freeze'}
before = None
try:
    before = {r: {**c.identity(c.ROOT / r), 'text': (c.ROOT / r).read_text()} for r in c.GENERATED}
    c.write_new(a.output_directory / 'generated-before.json', before)
    env = os.environ.copy()
    effective = c.effective_environment()
    env.update(effective)
    # tauri-build 2.6.3 tracks TAURI_CONFIG. This proposed empty merge uses its normal
    # generator path; the actual log/outputs must confirm whether the cached build script reran.
    env.update({'TAURI_ANDROID_PROJECT_PATH': str(c.ROOT / 'src-tauri/gen/android'), 'TAURI_CONFIG': '{}'})
    cmd = ['cargo', 'check', '--manifest-path', 'src-tauri/Cargo.toml', '--target', 'aarch64-linux-android', '--locked', '--offline']
    record.update({'command': cmd, 'explicitEnvironment': {k: env[k] for k in [*effective, 'TAURI_ANDROID_PROJECT_PATH', 'TAURI_CONFIG']}, 'freeBefore': c.check_space()})
    with (a.output_directory / 'check.txt').open('x') as log:
        record['exitCode'] = subprocess.run(cmd, cwd=c.ROOT, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
except BaseException as error:
    record['error'] = repr(error)
finally:
    try:
        after = {r: {**c.identity(c.ROOT / r), 'text': (c.ROOT / r).read_text()} for r in c.GENERATED}
        c.write_new(a.output_directory / 'generated-after.json', after)
        record['generatedChanged'] = [r for r in c.GENERATED if before is None or before[r] != after[r]]
        record['notesScanSettingsPresent'] = 'tauri-plugin-notes-scan' in after[c.GENERATED[0]]['text']
        record['notesScanDependencyPresent'] = 'tauri-plugin-notes-scan' in after[c.GENERATED[1]]['text']
        record['trackedDiffAfter'] = c.git('diff', 'HEAD', '--name-only').splitlines()
        record['headAfter'] = c.git('rev-parse', 'HEAD').strip()
    except BaseException as error:
        record['afterCaptureError'] = repr(error)
    record['endedAt'] = c.now()
    record['boundary'] = 'Preserve/review generated changes separately. If tracked files changed, root must resolve/commit and authorize the resulting exact SHA before final capture. Never bless preflight inputs as final freeze.'
    c.write_new(a.output_directory / 'result.json', record)
print(json.dumps(record, ensure_ascii=False, indent=2))
raise SystemExit(0 if record['exitCode'] == 0 and record.get('notesScanSettingsPresent') and record.get('notesScanDependencyPresent') and not any(k in record for k in ['error', 'afterCaptureError']) else 1)
