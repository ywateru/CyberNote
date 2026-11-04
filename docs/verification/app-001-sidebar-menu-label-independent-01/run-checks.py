"""Necessary independent host checks under the already reviewed owned-group monitor."""
from pathlib import Path
import importlib.util
import json
import os
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('boundary_common', ROOT / 'docs/verification/unified-candidate06/preparation/common.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
env = os.environ.copy()
env.update(CARGO_TARGET_DIR='/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target', CARGO_NET_OFFLINE='true', CARGO_BUILD_JOBS='2')
commands = [
 ('plugin-test', ['cargo', 'test', '--manifest-path', 'plugins/tauri-plugin-notes-ui/Cargo.toml', '--locked', '--offline', '--lib']),
 ('host-check', ['cargo', 'check', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--offline', '--lib'])]
with c.lock_build():
    for name, argv in commands:
        c.check_space(OUT)
        result = {'argv': argv, 'cwd': str(ROOT), 'startedAt': c.now(), 'environmentOverrides': {k: env[k] for k in ('CARGO_TARGET_DIR', 'CARGO_NET_OFFLINE', 'CARGO_BUILD_JOBS')}}
        try:
            c.monitored(argv, ROOT, env, OUT / (name + '.txt'), result)
        finally:
            result['endedAt'] = c.now()
            c.record_new(OUT / (name + '.json'), result)
        print(json.dumps({'check': name, **result}, ensure_ascii=False), flush=True)
        if result.get('exitCode') != 0 or result.get('ownedGroupStopped') is not True or result.get('stopReason') or result.get('groupCleanupError'):
            sys.exit(1)
