from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys, time

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'docs/verification/app-smart-u-platform-ui09/source-identity.json'
PRIOR = json.loads(BASE.read_text())
BINARY = ROOT / 'src-tauri/target/debug/notes-u-session-transport'
EXPECTED_BINARY = '943c2aa1a53828087037cdcec3ebf4f9db68aecef13d2fd35076d4450a344fd4'
PROBES = [ROOT / 'docs/verification/app-smart-u-platform-ui09-independent' / p for p in ('check-extra-contract.mjs', 'check-extra-ui.mjs')]
PATHS = sorted({ROOT / p for p in PRIOR['sourceFiles']} | set(PROBES) | {OUT / 'run.py'})

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def sources():
    return {str(p.relative_to(ROOT)): sha(p) for p in PATHS}

assert sha(BINARY) == EXPECTED_BINARY
assert all(sha(ROOT / p) == h for p, h in PRIOR['sourceFiles'].items() if p.startswith('src-tauri/'))
assert shutil.disk_usage(ROOT).free >= 2 * 1024**3
attempt = OUT / sys.argv[1]
attempt.mkdir()
before = sources()
record = {'baseHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
          'sourceBefore': before, 'reusedManifestSha256': sha(BASE), 'binaryBefore': sha(BINARY),
          'argv': sys.argv[2:], 'jobs': 2, 'offline': True, 'timeoutSeconds': 600,
          'freeBefore': shutil.disk_usage(ROOT).free}
(attempt / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
env = dict(os.environ, CARGO_NET_OFFLINE='true', CARGO_BUILD_JOBS='2', CARGO_TARGET_DIR=str(ROOT / 'src-tauri/target'),
           PLAYWRIGHT_CORE_PATH='/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs',
           CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
start = time.monotonic()
try:
    with (attempt / 'output.txt').open('xb') as log:
        code = subprocess.run(sys.argv[2:], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600).returncode
except subprocess.TimeoutExpired:
    code = 124
record.update(exitCode=code, seconds=round(time.monotonic() - start, 3), sourceAfter=sources(),
              binaryAfter=sha(BINARY), freeAfter=shutil.disk_usage(ROOT).free)
record['sourceUnchanged'] = record['sourceBefore'] == record['sourceAfter']
(attempt / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({k: record[k] for k in ('exitCode', 'seconds', 'sourceUnchanged', 'freeAfter')}))
raise SystemExit(code)
