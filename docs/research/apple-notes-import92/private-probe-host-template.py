#!/usr/bin/env python3
"""Research host recipe. --inspect-only never invokes Notes; --run is explicit.
Raw source is written only to newly-created mode0600 files under a mode0700
host-created staging directory. Prints aggregate execution/mode status only.
This documents ownership/capture, not a complete production source adapter.
"""
import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import time


def owned_directory(path):
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o700):
        raise RuntimeError('private staging refused')


def private_file(path):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    return os.fdopen(os.open(path, flags, 0o600), 'wb')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('probe', choices=['readonly', 'attachments'])
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--inspect-only', action='store_true')
    args = parser.parse_args()
    if args.run == args.inspect_only:
        parser.error('choose exactly one execution mode')
    staging = Path(tempfile.mkdtemp(prefix='apple-notes-import92-private-', dir='/private/tmp'))
    os.chmod(staging, 0o700)
    owned_directory(staging)
    exports = staging / 'exports'
    exports.mkdir(mode=0o700)
    owned_directory(exports)
    choice = {'readonly': 'readonly-probe-template.js',
              'attachments': 'attachment-save-probe-template.js'}[args.probe]
    source = Path(__file__).resolve().parent / choice
    command = ['/usr/bin/osascript', '-l', 'JavaScript', str(source)]
    if args.probe == 'attachments':
        # Sole save destination comes from host, never source IDs/names/URLs.
        command.append(str(exports))
    status = {'schema': 1, 'mode': 'inspect-only' if args.inspect_only else 'run',
              'stagingOwned0700': True, 'destinationOwned0700': True,
              'sourceChoice': args.probe}
    with private_file(staging / 'raw.private.json') as stdout, private_file(staging / 'stderr.private') as stderr:
        if args.run:
            started = time.monotonic()
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                     stdout=stdout, stderr=stderr, shell=False)
            try:
                child.wait(timeout=35)
                status['exitCode'] = child.returncode
                status['timedOut'] = False
            except subprocess.TimeoutExpired:
                # Only this host-owned osascript child. Never kill Notes.
                child.kill()
                child.wait(timeout=5)
                status['timedOut'] = True
            status['elapsedSeconds'] = round(time.monotonic() - started, 3)
    status['captureFiles0600'] = all(stat.S_IMODE((staging / name).lstat().st_mode) == 0o600
                                   for name in ('raw.private.json', 'stderr.private'))
    # No source text/title/ID/filename, directory path, or exception is emitted.
    print(json.dumps(status, sort_keys=True))


if __name__ == '__main__':
    main()
