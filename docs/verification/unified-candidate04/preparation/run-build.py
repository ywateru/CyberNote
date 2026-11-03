#!/usr/bin/env python3
"""Explicit future build only. Serial, offline, exact freeze, immutable attempt logs."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import common as c

p = argparse.ArgumentParser()
p.add_argument('stage', choices=['mac', 'android'])
p.add_argument('expected_head')
p.add_argument('run_directory', type=Path)
p.add_argument('attempt', help='new identifier; existing attempt directories are never reused')
p.add_argument('--allow-scoped-gradle-offline-init', action='store_true', help='explicitly authorize one temporary init.d file in the selected existing shared cache')
a = p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]+', a.attempt):
    raise SystemExit('Attempt must be a simple unique identifier')
run = a.run_directory.resolve()
before = json.loads((run / 'source-inputs-before.json').read_text())
if before['head'] != a.expected_head:
    raise SystemExit('Frozen SHA differs from authorization')
if a.stage == 'android' and not (run / 'mac-sealed-identity.json').is_file():
    raise SystemExit('Mac collection/sealing must complete before Android')
if a.stage == 'android' and not a.allow_scoped_gradle_offline_init:
    raise SystemExit('Offline Gradle enforcement requires explicitly reviewed scoped init; do not build online')
attempt = run / (a.stage + '-' + a.attempt)
attempt.mkdir(parents=True, exist_ok=False)
result = {'startedAt': c.now(), 'stage': a.stage, 'expectedHead': a.expected_head, 'sourceAggregate': before['aggregate'], 'attempt': str(attempt), 'exitCode': None}
init = None
init_created = False
with Path('/private/tmp/notes-unified-candidate04-build.lock').open('a') as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current = c.capture(a.expected_head)
        c.write_new(attempt / 'inputs-before.json', current)
        checks = c.same_inputs(before, current)
        if not all(checks.values()):
            raise RuntimeError('Frozen inputs/environment changed: ' + repr(checks))
        result['diskFreeBefore'] = c.check_space()
        env = os.environ.copy()
        env.update(before['effectiveBuildEnvironment'])
        result['explicitEnvironmentOverrides'] = before['effectiveBuildEnvironment']
        if a.stage == 'android':
            # CLI runner arguments are not assumed to be Gradle arguments. This init executes before settings.
            # No pre-existing configuration is replaced; root must serialize all Gradle users of this cache.
            init = c.CACHE / 'init.d' / ('candidate04-offline-' + a.attempt + '.gradle')
            init.parent.mkdir(exist_ok=True)
            text = 'gradle.startParameter.offline = true\ngradle.startParameter.maxWorkerCount = 2\nprintln("CANDIDATE04_OFFLINE=" + gradle.startParameter.offline)\n'
            with init.open('x') as stream:
                stream.write(text)
            init_created = True
            result['temporaryGradleInit'] = c.identity(init)
        cmd = {'mac': ['pnpm', 'mac:build'], 'android': ['pnpm', 'android:build', '--debug']}[a.stage]
        result['command'] = cmd
        with (attempt / 'build.txt').open('x') as log:
            result['exitCode'] = subprocess.run(cmd, cwd=c.ROOT, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
        if a.stage == 'android' and 'CANDIDATE04_OFFLINE=true' not in (attempt / 'build.txt').read_text(errors='replace'):
            result['offlineMarkerMissing'] = True
        after = c.capture(a.expected_head)
        c.write_new(attempt / 'inputs-after.json', after)
        result['inputComparisons'] = c.same_inputs(before, after)
        if not all(result['inputComparisons'].values()):
            result['invalidated'] = 'Listed inputs changed; retain raw changes, do not bless or overwrite freeze'
    except BaseException as error:
        result['error'] = repr(error)
    finally:
        if init_created and init is not None and init.exists():
            init.unlink()  # Only this attempt's self-created temporary init, never cache/build cleanup.
            result['temporaryGradleInitRemoved'] = True
        result['endedAt'] = c.now()
        result['diskFreeAfter'] = __import__('shutil').disk_usage(c.ROOT).free
        c.write_new(attempt / 'result.json', result)
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if result.get('exitCode') == 0 and not any(k in result for k in ['error', 'invalidated', 'offlineMarkerMissing']) else 1)
