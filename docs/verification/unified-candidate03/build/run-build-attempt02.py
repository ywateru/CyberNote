#!/usr/bin/env python3
"""Serial build entry point; requires an already-authorized exact input freeze."""
import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/unified-candidate03/build'
parser = argparse.ArgumentParser()
parser.add_argument('stage', choices=['mac', 'android'])
parser.add_argument('expected_head')
args = parser.parse_args()
os.chdir(ROOT)
before = json.loads((OUT / 'source-inputs-before.json').read_text())
if before['headAtCapture'] != args.expected_head:
    raise SystemExit('Refuse build: frozen HEAD differs from authorization')
guard = OUT / ('source-inputs-guard-' + args.stage + '-attempt02.json')
subprocess.run(['python3', str(OUT / 'capture-inputs.py'), args.expected_head, str(guard), '--mode', 'guard'], check=True)
current = json.loads(guard.read_text())
if before['files'] != current['files'] or before['relevantEnvironment'] != current['relevantEnvironment'] or before['effectiveAndroidScriptEnvironment'] != current['effectiveAndroidScriptEnvironment']:
    raise SystemExit('Refuse build: frozen inputs/environment changed')
free = shutil.disk_usage(ROOT).free
if free < 2 * 1024**3:
    raise SystemExit('Refuse stage: less than 2 GiB available; preserve evidence and reassess resources')
command = {'mac': ['pnpm', 'mac:build'], 'android': ['pnpm', 'android:build', '--debug']}[args.stage]
log = OUT / (args.stage + '-build-attempt02.txt')
exit_file = OUT / (args.stage + '-build-attempt02-exit.json')
if log.exists() or exit_file.exists():
    raise SystemExit('Refuse overwrite: retain existing attempt and name any new attempt explicitly')
start = datetime.datetime.now(datetime.timezone.utc).isoformat()
print('Starting ' + args.stage + ': ' + ' '.join(command), flush=True)
with log.open('x') as output:
    code = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT).returncode
result = {'stage': args.stage, 'command': command, 'expectedHead': args.expected_head,
          'sourceAggregate': before['aggregate'], 'startedAt': start,
          'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'diskFreeBefore': free, 'diskFreeAfter': shutil.disk_usage(ROOT).free, 'exitCode': code}
exit_file.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result), flush=True)
raise SystemExit(code)
