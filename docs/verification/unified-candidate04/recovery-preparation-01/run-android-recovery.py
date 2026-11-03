#!/usr/bin/env python3
"""Explicit future build only. Serial, offline, exact freeze, immutable attempt logs."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import stat
import signal
import time
from recovery_common import c, supplemental

def cleanup_owned_init(path, owned):
    """Remove only the recorded file; caller must serialize shared-cache users."""
    outcome = {'temporaryGradleInitRemoved': False}

    def inspect():
        info = path.lstat()
        row = {'path': str(path), 'device': info.st_dev, 'inode': info.st_ino,
               'bytes': info.st_size, 'regularFile': stat.S_ISREG(info.st_mode)}
        if row['regularFile']:
            row['sha256'] = c.sha_file(path)
        elif stat.S_ISLNK(info.st_mode):
            row['symlinkTarget'] = os.readlink(path)
        return row

    try:
        current = inspect()
        outcome['temporaryGradleInitBeforeCleanup'] = current
        keys = ['device', 'inode', 'bytes', 'sha256']
        if not owned or not current['regularFile'] or any(current.get(key) != owned.get(key) for key in keys):
            raise RuntimeError('Temporary init identity changed; preserve it without deletion')
        # Recheck the name immediately before unlink; this does not replace cache serialization.
        latest = path.lstat()
        if (latest.st_dev, latest.st_ino) != (owned['device'], owned['inode']) or not stat.S_ISREG(latest.st_mode):
            raise RuntimeError('Temporary init was replaced before deletion; preserve it')
        path.unlink()
        outcome['temporaryGradleInitRemoved'] = True
    except BaseException as error:
        outcome['cleanupError'] = repr(error)
        try:
            outcome['temporaryGradleInitRemaining'] = inspect()
        except FileNotFoundError:
            outcome['temporaryGradleInitRemaining'] = {'path': str(path), 'exists': False}
        except BaseException as capture_error:
            outcome['temporaryGradleInitRemaining'] = {'path': str(path), 'identityCaptureError': repr(capture_error)}
    return outcome


p = argparse.ArgumentParser()
p.add_argument('stage', choices=['android'])
p.add_argument('expected_head')
p.add_argument('run_directory', type=Path)
p.add_argument('attempt', help='new identifier; existing attempt directories are never reused')
p.add_argument('--deadline-seconds', type=int, default=600)
p.add_argument('--allow-scoped-gradle-offline-init', action='store_true', help='explicitly authorize one temporary init.d file in the selected existing shared cache')
a = p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]+', a.attempt):
    raise SystemExit('Attempt must be a simple unique identifier')
run = a.run_directory.resolve()
before = json.loads((run / 'source-inputs-before.json').read_text())
if before['head'] != a.expected_head:
    raise SystemExit('Frozen SHA differs from authorization')
extra_before = json.loads((run / 'recovery-inputs-before.json').read_text())
if not 1 <= a.deadline_seconds <= 1200:
    raise SystemExit('Explicit bounded deadline must be between 1 and 1200 seconds')
if a.stage == 'android' and not a.allow_scoped_gradle_offline_init:
    raise SystemExit('Offline Gradle enforcement requires explicitly reviewed scoped init; do not build online')
attempt = run / (a.stage + '-' + a.attempt)
attempt.mkdir(parents=True, exist_ok=False)
result = {'recoveryScope': 'Android only; references accepted original Mac, not a shared complete freeze', 'startedAt': c.now(), 'stage': a.stage, 'expectedHead': a.expected_head, 'sourceAggregate': before['aggregate'], 'attempt': str(attempt), 'exitCode': None}
init = None
init_created = False
init_owned = None
with Path('/private/tmp/notes-unified-candidate04-build.lock').open('a') as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current = c.capture(a.expected_head)
        c.write_new(attempt / 'inputs-before.json', current)
        extra_current = supplemental(current)
        c.write_new(attempt / 'recovery-inputs-before.json', extra_current)
        if extra_current != extra_before:
            raise RuntimeError('Supplemental environment/cache/Mac reference changed before build')
        result['acceptedMacReference'] = extra_current['acceptedMacReference']
        checks = c.same_inputs(before, current)
        if not all(checks.values()):
            raise RuntimeError('Frozen inputs/environment changed: ' + repr(checks))
        result['diskFreeBefore'] = c.check_space()
        env = os.environ.copy()
        env.update(before['effectiveBuildEnvironment'])
        env.update(extra_before['supplementalBuildEnvironment'])
        result['supplementalBuildEnvironment'] = extra_before['supplementalBuildEnvironment']
        result['explicitEnvironmentOverrides'] = before['effectiveBuildEnvironment']
        if a.stage == 'android':
            # CLI runner arguments are not assumed to be Gradle arguments. This init executes before settings.
            # No pre-existing configuration is replaced; root must serialize all Gradle users of this cache.
            init = c.CACHE / 'init.d' / ('candidate04-offline-' + a.attempt + '.gradle')
            init.parent.mkdir(exist_ok=True)
            text = 'gradle.startParameter.offline = true\ngradle.startParameter.maxWorkerCount = 2\nprintln("CANDIDATE04_OFFLINE=" + gradle.startParameter.offline)\n'
            with init.open('x') as stream:
                init_created = True
                created = os.fstat(stream.fileno())
                init_owned = {'path': str(init), 'device': created.st_dev, 'inode': created.st_ino,
                              'bytes': len(text.encode()), 'sha256': hashlib.sha256(text.encode()).hexdigest()}
                stream.write(text)
            result['temporaryGradleInit'] = init_owned
        cmd = {'mac': ['pnpm', 'mac:build'], 'android': ['pnpm', 'android:build', '--debug']}[a.stage]
        result['command'] = cmd
        with (attempt / 'build.txt').open('x') as log:
            process = subprocess.Popen(cmd, cwd=c.ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            started = time.monotonic()
            minimum_free = result['diskFreeBefore']
            try:
                while process.poll() is None:
                    time.sleep(0.2)
                    minimum_free = min(minimum_free, __import__('shutil').disk_usage(c.ROOT).free)
                    content = (attempt / 'build.txt').read_text(errors='replace')
                    reason = None
                    if re.search(r'Fetching distribution|Downloading https?://|Download https?://', content):
                        reason = 'download-prompt'
                    elif minimum_free < 2 * 1024**3:
                        reason = 'disk-guard'
                    elif time.monotonic() - started >= a.deadline_seconds:
                        reason = 'deadline'
                    if reason:
                        result['stopReason'] = reason
                        os.killpg(process.pid, signal.SIGTERM)
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait()
                        break
            except BaseException:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                raise
            result['exitCode'] = process.returncode
            result['minimumFreeBytes'] = minimum_free
            result['deadlineSeconds'] = a.deadline_seconds
        if a.stage == 'android' and 'CANDIDATE04_OFFLINE=true' not in (attempt / 'build.txt').read_text(errors='replace'):
            result['offlineMarkerMissing'] = True
        after = c.capture(a.expected_head)
        c.write_new(attempt / 'inputs-after.json', after)
        extra_after = supplemental(after)
        c.write_new(attempt / 'recovery-inputs-after.json', extra_after)
        result['supplementalInputsUnchanged'] = extra_before == extra_after
        if not result['supplementalInputsUnchanged']:
            raise RuntimeError('Supplemental environment/cache/Mac reference changed during build')
        result['inputComparisons'] = c.same_inputs(before, after)
        if not all(result['inputComparisons'].values()):
            result['invalidated'] = 'Listed inputs changed; retain raw changes, do not bless or overwrite freeze'
    except BaseException as error:
        result['error'] = repr(error)
    finally:
        if init_created and init is not None:
            result.update(cleanup_owned_init(init, init_owned))
            if result.get('cleanupError'):
                result.setdefault('error', 'Temporary Gradle init cleanup failed; see cleanupError')
        result['endedAt'] = c.now()
        result['diskFreeAfter'] = __import__('shutil').disk_usage(c.ROOT).free
        c.write_new(attempt / 'result.json', result)
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if result.get('exitCode') == 0 and not any(k in result for k in ['error', 'invalidated', 'offlineMarkerMissing', 'cleanupError', 'stopReason']) else 1)
