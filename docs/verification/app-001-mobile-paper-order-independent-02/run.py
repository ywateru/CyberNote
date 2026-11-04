"""One offline headless production-App run; logs exact command and environment."""
from pathlib import Path
import datetime, json, os, shutil, subprocess
ROOT = Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT = ROOT / 'docs/verification/app-001-mobile-paper-order-independent-02'
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3
env = os.environ.copy()
overrides = {'PLAYWRIGHT_CORE_PATH': '/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs',
    'CHROME_PATH': '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'PAPER_OBSERVE_SELECTION': '1'}
env.update(overrides)
cmd = ['node', str(OUT / 'check-pinned-real-app.mjs'), str(OUT / 'render-run01')]
record = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'cwd': str(ROOT), 'argv': cmd, 'environmentOverrides': overrides, 'freeBefore': shutil.disk_usage(ROOT).free}
try:
    p = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, timeout=100)
    record.update(exitCode=p.returncode, stdout=p.stdout.decode(errors='replace'), stderr=p.stderr.decode(errors='replace'))
except subprocess.TimeoutExpired as exc:
    record.update(timeoutSeconds=100, stdout=(exc.stdout or b'').decode(errors='replace'), stderr=(exc.stderr or b'').decode(errors='replace'))
finally:
    record.update(endedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), freeAfter=shutil.disk_usage(ROOT).free)
    with (OUT / 'render-command.json').open('x') as f:
        f.write(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(record, ensure_ascii=False))
raise SystemExit(record.get('exitCode', 1))
