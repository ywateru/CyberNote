"""Bounded candidate05 wrapper around unchanged candidate04 Mac build tool."""
import datetime
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
EXPECTED = '5201d3151462211e51d357f1f8ecc778269a3859'
MIN_FREE = 2 * 1024**3
assert shutil.disk_usage(ROOT).free >= MIN_FREE
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() == EXPECTED
command = ['python3', '-B', 'docs/verification/unified-candidate04/preparation/run-build-safe-cleanup.py',
           'mac', EXPECTED, str(OUT), 'attempt01']
record = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'command': command,
          'deadlineSeconds': 600, 'pollSeconds': 2, 'minFreeRequiredBytes': MIN_FREE,
          'samples': [], 'terminationReason': None, 'terminationSignals': []}
started = time.monotonic()
with (OUT / 'build-driver.txt').open('x') as log:
    process = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    record['ownedProcessGroup'] = process.pid
    try:
        while process.poll() is None:
            elapsed = time.monotonic() - started
            free = shutil.disk_usage(ROOT).free
            record['samples'].append({'elapsedSeconds': round(elapsed, 3), 'freeBytes': free})
            if free < MIN_FREE or elapsed >= 600:
                record['terminationReason'] = 'space-below-2GiB' if free < MIN_FREE else 'deadline-600s'
                os.killpg(process.pid, signal.SIGTERM)
                record['terminationSignals'].append('SIGTERM to owned process group')
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    record['terminationSignals'].append('SIGKILL to owned process group after 5s')
                    process.wait(timeout=5)
                break
            time.sleep(2)
        record['exitCode'] = process.wait()
    finally:
        record['elapsedSeconds'] = round(time.monotonic() - started, 3)
        record['freeBytesAfter'] = shutil.disk_usage(ROOT).free
        record['minimumObservedFreeBytes'] = min([r['freeBytes'] for r in record['samples']] + [record['freeBytesAfter']])
        record['endedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with (OUT / 'build-monitor.json').open('x') as stream:
            stream.write(json.dumps(record, indent=2) + '\n')
print(json.dumps({k: v for k, v in record.items() if k != 'samples'}, indent=2))
raise SystemExit(0 if record.get('exitCode') == 0 and not record['terminationReason'] else 1)
