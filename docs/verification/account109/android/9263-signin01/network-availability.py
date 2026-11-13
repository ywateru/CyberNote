"""Serial-scoped command inventory only; never emits raw device output."""
from pathlib import Path
import datetime
import json
import subprocess

OUT = Path(__file__).resolve().parent
OUTPUT = Path('/private/tmp/account109-android-real-9263-jwks01')
ADB = '/Users/water/Library/Android/sdk/platform-tools/adb'
SERIAL = '98895a3147304c3132'


def capture(command):
    return subprocess.run([ADB, '-s', SERIAL, 'shell', command], capture_output=True,
                          text=True, timeout=15)


if __name__ == '__main__':
    names = ['toybox', 'curl', 'wget', 'openssl', 'nslookup', 'getent', 'timeout', 'nc', 'ping', 'ip', 'getprop', 'settings']
    command = ('for probe_name in ' + ' '.join(names) +
               '; do if command -v "$probe_name" >/dev/null 2>&1; then echo "$probe_name=1"; else echo "$probe_name=0"; fi; done')
    inventory = capture(command)
    found = dict(line.split('=', 1) for line in inventory.stdout.splitlines() if '=' in line)
    available = {name: found.get(name) == '1' for name in names}
    applets = capture('toybox') if available['toybox'] else None
    words = applets.stdout.split() if applets else []
    report = {'schema': 1, 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'serial': SERIAL, 'commandAvailable': available,
              'toyboxAppletAvailable': {name: name in words for name in names if name != 'toybox'},
              'networkRequestsPerformed': False, 'rawOutputRetained': False}
    for directory in [OUT, OUTPUT]:
        (directory / 'network-availability.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
