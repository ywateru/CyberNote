"""Independent Python-only reproductions. Never runs pnpm, platform tools or signing."""
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
PREP = HERE.parent / 'preparation'
sys.path.insert(0, str(PREP))
import common as c

spec = importlib.util.spec_from_file_location('runner', PREP / 'run-build.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def leader_exited_child_alive():
    with tempfile.TemporaryDirectory(prefix='candidate06-independent-child-') as tmp:
        root = Path(tmp).resolve()
        pidfile = root / 'child.pid'
        # The leader exits successfully while its child remains in its new group.
        code = '''import os,time
pid=os.fork()
if pid:
    os._exit(0)
open(%r,'w').write(str(os.getpid()))
print('Downloading https://controlled.invalid',flush=True)
time.sleep(10)
''' % str(pidfile)
        record = {}
        caught = None
        try:
            try:
                c.monitored([sys.executable, '-B', '-c', code], root,
                            os.environ.copy(), root / 'command.txt', record,
                            deadline=2, poll=0.1)
            except RuntimeError as error:
                caught = repr(error)
            child_pid = int(pidfile.read_text())
            try:
                os.kill(child_pid, 0)
                child_alive = True
            except ProcessLookupError:
                child_alive = False
            try:
                os.killpg(record['ownedProcessGroup'], 0)
                group_alive = True
            except ProcessLookupError:
                group_alive = False
            return {'record': record, 'caught': caught, 'childAliveAfterReturn': child_alive,
                    'ownedGroupAliveAfterReturn': group_alive,
                    'log': (root / 'command.txt').read_text(),
                    'cleanup': 'Finally signals only this controlled newly created group; no external PID/group.'}
        finally:
            if record.get('ownedProcessGroup'):
                try:
                    os.killpg(record['ownedProcessGroup'], signal.SIGKILL)
                except ProcessLookupError:
                    pass


def unchanged_old_output():
    with tempfile.TemporaryDirectory(prefix='candidate06-independent-stale-') as tmp:
        root = Path(tmp).resolve()
        run = root / 'docs/verification/unified-candidate06/controlled'
        run.mkdir(parents=True)
        output = root / 'src-tauri/target/release/bundle/macos/备忘录.app/Contents/MacOS/notes-clone'
        output.parent.mkdir(parents=True)
        output.write_bytes(b'CONTROLLED OLD OUTPUT; NOT A REAL APPLICATION')
        dist = root / 'dist/index.html'
        dist.parent.mkdir()
        dist.write_text('CONTROLLED OLD DIST')
        prior = {'inode': output.stat().st_ino, 'mtimeNs': output.stat().st_mtime_ns,
                 'sha256': c.sha_file(output)}
        a = dict(schema=1, stage='mac', root=str(root), sourceHead='a' * 40,
                 productAggregate='b' * 64, productPaths=['src/a'], inputPaths=['src/a'],
                 runDirectory=str(run), artifactDirectory=str(root/'artifacts/unified-candidate06/controlled'))
        before = {'at': 'controlled', 'authorization': a, 'aggregate': 'c' * 64,
                  'effectiveBuildEnvironment': {}, 'supplementalInputs': {'controlled': True}}
        original_monitor = c.monitored
        calls = []

        def python_only(argv, cwd, env, log, result):
            calls.append({'requestedButNotExecuted': argv,
                          'actual': [sys.executable, '-B', '-c', 'print("CONTROLLED NO-OP: no build or output writes")']})
            return original_monitor(calls[-1]['actual'], cwd, env, log, result, deadline=2, poll=0.02)

        with patch.object(c, 'authorization', return_value=a), \
             patch.object(c, 'frozen', return_value=before), \
             patch.object(c, 'capture', return_value=before), \
             patch.object(c, 'lock_build', return_value=contextlib.nullcontext()), \
             patch.object(c, 'monitored', side_effect=python_only), \
             patch.object(sys, 'argv', ['run-build.py', '--authorization', str(root/'controlled.json'),
                                      '--freeze-sha256', 'd'*64, '--attempt', 'old-output',
                                      '--exclusive-target-and-cache']):
            try:
                runner.main()
            except SystemExit as error:
                exit_code = error.code
        result = json.loads((run/'mac-old-output/result.json').read_text())
        after = {'inode': output.stat().st_ino, 'mtimeNs': output.stat().st_mtime_ns,
                 'sha256': c.sha_file(output)}
        return {'runnerExit': exit_code, 'runnerSuccess': bool(c.success(result)),
                'oldOutputIdentityUnchanged': prior == after, 'before': prior, 'after': after,
                'result': result, 'calls': calls,
                'scope': 'Authorization/capture/lock patched to isolate artifact provenance. Real monitor runs only a fresh Python no-op. No actual pnpm/build/signing/cache.'}


result = {'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
          'leaderExitedChildAlive': leader_exited_child_alive(),
          'unchangedOldOutput': unchanged_old_output()}
out = HERE / 'reproduction-result.json'
with out.open('x') as stream:
    stream.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'result': str(out), 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(),
                  'childAliveAfterReturn': result['leaderExitedChildAlive']['childAliveAfterReturn'],
                  'runnerAcceptedUnchangedOldOutput': result['unchangedOldOutput']['runnerSuccess'] and result['unchangedOldOutput']['oldOutputIdentityUnchanged']}, ensure_ascii=False))
