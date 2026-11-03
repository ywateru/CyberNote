#!/usr/bin/env python3
"""Supervise the independently-built observer with a bounded process deadline."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-dir', required=True, type=Path)
    parser.add_argument('--timeout-seconds', type=float, default=15)
    parser.add_argument('observer_arguments', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if not 0 < args.timeout_seconds <= 30:
        parser.error('timeout must be positive and no greater than 30 seconds')
    arguments = args.observer_arguments
    if arguments[:1] == ['--']:
        arguments = arguments[1:]
    if not arguments:
        parser.error('provide observer arguments after --')
    # Only this fixed observer binary is executable; there is no shell/command option.
    build = args.build_dir.resolve(strict=True)
    binary = build / 'window-capture'
    info = json.loads((build / 'build-info.json').read_text())
    scripts = Path(__file__).resolve().parent
    expected_sources = {str(path): sha(path) for path in [scripts / 'window-capture.swift', scripts / 'build-window-capture.py', scripts / 'run-window-capture.py']}
    embedded_sources = {entry['path']: entry['sha256'] for entry in info['identity']['sources']}
    if sha(binary) != info['binarySha256'] or embedded_sources != expected_sources:
        raise RuntimeError('Observer/build/source identity differs; rebuild with the independent helper')
    environment = os.environ.copy()
    environment['NOTES_CAPTURE_DEADLINE_SECONDS'] = str(args.timeout_seconds)
    environment['NOTES_CAPTURE_SUPERVISOR_PID'] = str(os.getpid())
    started = time.monotonic()
    process = subprocess.Popen([str(binary), *arguments], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment)
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=args.timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        process.kill()  # SIGKILL, not a cancellation-dependent Swift TaskGroup.
        stdout, stderr = process.communicate()
    report = {
        'supervision': {'deadlineSeconds': args.timeout_seconds, 'elapsedSeconds': time.monotonic() - started, 'timedOut': timed_out, 'termination': 'SIGKILL on timeout; observer starts no child processes'},
        'observer': {'exitCode': process.returncode, 'stdout': stdout.decode('utf-8', errors='replace'), 'stderr': stderr.decode('utf-8', errors='replace')},
        'acceptOutput': not timed_out and process.returncode == 0,
    }
    if timed_out:
        report['limitation'] = 'Do not accept any output from this interrupted attempt, including files left by SIGKILL. Preserve it as interrupted evidence; use a new output directory for any later authorized attempt. No automatic retry.'
    print(json.dumps(report, indent=2))
    return 124 if timed_out else process.returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({'status': 'supervisor_error', 'error': str(error), 'acceptOutput': False}), file=sys.stderr)
        sys.exit(2)
