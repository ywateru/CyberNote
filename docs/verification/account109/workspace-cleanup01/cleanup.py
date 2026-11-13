"""Delete only the fifteen explicitly authorized generated-cache paths."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import stat
import subprocess
import time

OUT = Path(__file__).resolve().parent
SHARED = '/private/tmp/cybernote-account109-mac-ec4348c6-target-01'
ENV = dict(os.environ, GIT_OPTIONAL_LOCKS='0', PYTHONDONTWRITEBYTECODE='1')
SPECS = [
    ('cybernote-account109-auth', 'crates/account-auth/target/debug/incremental'),
    ('cybernote-account109-delivery', 'node_modules'),
    ('cybernote-account109-server', 'services/coordinator/node_modules'),
]
for name in ['cybernote-account109-android',
             'cybernote-account109-android-90b8b28b-01',
             'cybernote-account109-android-d69-debug']:
    for rel in ['src-tauri/gen/android/.gradle',
                'src-tauri/gen/android/app/build/intermediates/incremental',
                'src-tauri/gen/android/app/build/tmp',
                'src-tauri/gen/android/app/build/kotlin']:
        SPECS.append((name, rel))
assert len(SPECS) == 15


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(b):
    return hashlib.sha256(b).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def command(argv, cwd=None, timeout=30):
    return subprocess.run(argv, cwd=cwd, env=ENV, capture_output=True, timeout=timeout)


def allocated(path):
    p = command(['du', '-sk', '-P', str(path)])
    assert p.returncode == 0, 'Allocated-size check failed'
    return int(p.stdout.split()[0]) * 1024


def df():
    p = command(['/bin/df', '-kP', '/private/tmp'])
    assert p.returncode == 0, 'df failed'
    parts = p.stdout.decode().splitlines()[-1].split()
    return dict(atUtc=now(), command=['/bin/df', '-kP', '/private/tmp'],
                totalBytes=int(parts[1]) * 1024, usedBytes=int(parts[2]) * 1024,
                availableBytes=int(parts[3]) * 1024, capacity=parts[4],
                statvfsAvailableBytes=shutil.disk_usage('/private/tmp').free)


def processes():
    p = command(['ps', '-axo', 'pid=,ppid=,command='])
    assert p.returncode == 0, 'Process inventory failed'
    rows = {}
    for line in p.stdout.decode().splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) == 3:
            rows[int(parts[0])] = (int(parts[1]), parts[2])
    excluded = set()
    current = os.getpid()
    while current in rows and current not in excluded:
        excluded.add(current)
        current = rows[current][0]
    return rows, excluded


def cwd_processes(root, excluded):
    # Read process cwd metadata only; raw paths/command lines never enter evidence.
    p = command(['/usr/sbin/lsof', '-nP', '-a', '-d', 'cwd', '-Fpn'])
    assert p.returncode in (0, 1) and not p.stderr, 'cwd observation unavailable'
    matches = set()
    pid = None
    for line in p.stdout.decode().splitlines():
        if line.startswith('p') and line[1:].isdigit():
            pid = int(line[1:])
        elif line.startswith('n') and pid is not None and pid not in excluded:
            path = line[1:]
            if path == str(root) or path.startswith(str(root) + '/'):
                matches.add(pid)
    return len(matches)


def safety(root, rel, expected=None):
    path = root / rel
    assert path.is_absolute() and str(path) == os.path.realpath(path)
    # Every component must be an actual directory, never a symlink.
    for component in [path, *path.parents]:
        st = component.lstat()
        assert stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode)
    assert str(path) != SHARED and not str(path).startswith(SHARED + '/')
    current = path.stat()
    identity = dict(device=current.st_dev, inode=current.st_ino)
    if expected is not None:
        assert identity == expected, 'Path identity changed since preflight'
    tracked = command(['git', '--no-optional-locks', 'ls-files', '-z', '--', rel], root)
    assert tracked.returncode == 0 and not tracked.stdout, 'Tracked content present'
    ignored = command(['git', '--no-optional-locks', 'check-ignore', '-q', '--', rel], root)
    assert ignored.returncode == 0, 'Directory not ignored'
    rows, excluded = processes()
    process_matches = sum(pid not in excluded and str(root) in args
                          for pid, (_, args) in rows.items())
    assert process_matches == 0, 'Process arguments reference candidate worktree'
    cwd_matches = cwd_processes(root, excluded)
    assert cwd_matches == 0, 'Process cwd references candidate worktree'
    handles = command(['/usr/sbin/lsof', '-nP', '+D', str(path), '-Fp'])
    assert handles.returncode in (0, 1) and not handles.stderr, 'Open-file observation unavailable'
    assert handles.returncode == 1 and not handles.stdout, 'Open files present'
    return dict(path=str(path), root=str(root), relativePath=rel,
                realpathEqualsRequested=True, allComponentsActualDirectories=True,
                identity=identity, trackedFileCount=0, ignored=True,
                processArgumentMatches=0, processCwdMatches=0, openFileMatches=0,
                checkedAtUtc=now())


receipt = dict(schema=1, status='PREFLIGHT', startedAtUtc=now(),
               authorizedPathCount=15, sharedTargetInspected=False,
               paths=[], deletions=[], beforeDf=None)
save('receipt.json', receipt)
try:
    for name, rel in SPECS:
        root = Path('/private/tmp') / name
        checked = safety(root, rel)
        checked['beforeAllocatedBytes'] = allocated(root / rel)
        receipt['paths'].append(checked)
        save('receipt.json', receipt)
        print('Preflight passed: ' + name + '/' + rel, flush=True)
    receipt['status'] = 'ALL_FIFTEEN_PREFLIGHTS_PASSED'
    receipt['beforeAllocatedBytesTotal'] = sum(p['beforeAllocatedBytes'] for p in receipt['paths'])
    receipt['beforeDf'] = df()
    save('receipt.json', receipt)
    # All paths passed before any deletion. Recheck the exact path immediately
    # before each deletion; shutil.rmtree unlinks child symlinks without following.
    for checked in receipt['paths']:
        path = Path(checked['path'])
        final_check = safety(Path(checked['root']), checked['relativePath'], checked['identity'])
        before = allocated(path)
        started = time.monotonic()
        shutil.rmtree(path)
        assert not path.exists() and not path.is_symlink(), 'Deletion incomplete'
        receipt['deletions'].append(dict(path=str(path), finalSafetyCheckedAtUtc=final_check['checkedAtUtc'],
            immediatelyBeforeAllocatedBytes=before, afterAllocatedBytes=0,
            absentAfter=True, seconds=round(time.monotonic() - started, 3)))
        save('receipt.json', receipt)
        print('Deleted authorized cache: ' + str(path), flush=True)
    receipt['afterDf'] = df()
    receipt['afterAllocatedBytesTotal'] = 0
    receipt['dfAvailableBytesDelta'] = receipt['afterDf']['availableBytes'] - receipt['beforeDf']['availableBytes']
    receipt['status'] = 'PASS_EXACT_FIFTEEN_REMOVED'
    receipt['completedAtUtc'] = now()
    receipt['measurementBoundary'] = 'Allocated bytes are du -sk -P observations. df available delta is a separate filesystem-wide observation and is not attributed exclusively to this cleanup; concurrent writes, APFS sharing and hardlinks can affect it.'
    receipt['safetyBoundary'] = 'Point-in-time path/Git/process/cwd/open-file checks, repeated immediately before each removal; no universal filesystem lock or future inactivity claim. No candidate binaries, APK outputs, source, stores, evidence, sealed drafts or active author/reviewer directories selected.'
    save('receipt.json', receipt)
    print(json.dumps(dict(status=receipt['status'], paths=len(receipt['deletions']),
        beforeAllocatedBytes=receipt['beforeAllocatedBytesTotal'],
        afterAllocatedBytes=receipt['afterAllocatedBytesTotal'],
        dfAvailableBytesDelta=receipt['dfAvailableBytesDelta']), indent=2), flush=True)
except Exception as error:
    receipt['status'] = 'STOPPED_SAFE_CHECK_OR_EXECUTION_FAILURE'
    receipt['stoppedAtUtc'] = now()
    receipt['finiteFailureClass'] = type(error).__name__
    receipt['afterDf'] = df()
    save('receipt.json', receipt)
    print(json.dumps(dict(status=receipt['status'], failureClass=type(error).__name__,
        deletionsCompleted=len(receipt['deletions']), rawErrorSuppressed=True)), flush=True)
    raise SystemExit(1)
