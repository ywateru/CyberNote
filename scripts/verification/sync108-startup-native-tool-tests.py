#!/usr/bin/env python3
"""Tool-only cleanup regression probes; Python children are not native Apps."""
import copy
import importlib.util
import json
from pathlib import Path
import select
import subprocess
import sys

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("startup_native", Path(__file__).with_name("sync108-startup-native.py"))
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)
checks = []


def verify(name, process, expected):
    record = {}
    try:
        cleanup = tool.stop_owned(process, record, term_timeout=0.1, kill_timeout=2)
        for key, value in expected.items():
            assert cleanup[key] == value, (name, key, cleanup)
        snapshot = copy.deepcopy(record)
        assert tool.stop_owned(process, record) is cleanup
        assert record == snapshot, "Repeated stop must retain first cleanup facts"
        checks.append({"case": name, "passed": True, "cleanup": cleanup})
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=2)
        if process.stdout:
            process.stdout.close()


normal = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
verify("normal owned SIGTERM and idempotence", normal,
       {"preExitCode": None, "sentSignals": ["SIGTERM"], "finalReturnCode": -15, "forcedKill": False, "passed": True})

stubborn = subprocess.Popen([sys.executable, "-u", "-c",
                            "import signal; signal.signal(signal.SIGTERM, signal.SIG_IGN); print('ready', flush=True); signal.pause()"], stdout=subprocess.PIPE)
try:
    assert select.select([stubborn.stdout], [], [], 3)[0], "Child readiness timeout"
    assert stubborn.stdout.readline() == b"ready\n"
except BaseException:
    stubborn.kill()
    stubborn.wait(timeout=2)
    stubborn.stdout.close()
    raise
verify("SIGTERM ignored then actual SIGKILL", stubborn,
       {"preExitCode": None, "sentSignals": ["SIGTERM", "SIGKILL"], "finalReturnCode": -9, "forcedKill": True, "passed": False})

early = subprocess.Popen([sys.executable, "-c", "raise SystemExit(7)"])
early.wait(timeout=3)
verify("unexpected pre-cleanup exit", early,
       {"preExitCode": 7, "unexpectedExit": True, "sentSignals": [], "finalReturnCode": 7, "forcedKill": False, "passed": False})


class BrokenCleanup:
    def poll(self):
        return None

    def terminate(self):
        raise OSError("tool-only injected terminate error")

    def kill(self):
        raise OSError("tool-only injected kill error")


record = {}
failed = tool.stop_owned(BrokenCleanup(), record)
assert failed["errors"] == ["OSError", "OSError"]
assert failed["sentSignals"] == [] and failed["finalReturnCode"] is None and not failed["passed"]
checks.append({"case": "injected cleanup errors", "passed": True, "cleanup": failed})

for process_cleanup, errors, expected in [(checks[0]["cleanup"], [], True),
                                          (checks[1]["cleanup"], [], False),
                                          (checks[2]["cleanup"], [], False),
                                          (checks[0]["cleanup"], [{"stage": "cache"}], False)]:
    report = {"checksComplete": True, "checks": [{"passed": True}],
              "processes": [{"cleanup": process_cleanup}], "ownedCachesRemoved": True, "cleanupErrors": errors}
    tool.finalize_report(report)
    assert report["passed"] is expected, report
checks.append({"case": "final result includes cleanup and rejects forced kill, pre-exit, cache errors", "passed": True})
print(json.dumps({"boundary": "tool-only Python child processes and injected cleanup error; no native App assertion", "passed": True, "checks": checks}, indent=2))
