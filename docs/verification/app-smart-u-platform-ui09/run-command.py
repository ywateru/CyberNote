from pathlib import Path
import hashlib, json, os, shutil, subprocess, sys, time
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
run=OUT/sys.argv[1];run.mkdir()
assert shutil.disk_usage(ROOT).free>=2*1024**3
paths=list((ROOT/'src').rglob('*'))+list((ROOT/'src-tauri/src').rglob('*'))
paths+=[ROOT/'package.json',ROOT/'pnpm-lock.yaml',ROOT/'src-tauri/Cargo.toml',ROOT/'src-tauri/Cargo.lock',ROOT/'docs/fixtures/smart-projection09.json',ROOT/'scripts/check-smart-contract.mjs',ROOT/'scripts/check-smart-ui.mjs',OUT/'transport.rs',OUT/'run-command.py',OUT/'run-rust.py',OUT/'harness/Cargo.toml',OUT/'harness/Cargo.lock',OUT/'harness/src/main.rs']
def hashes():return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths) if p.is_file()}
record={'argv':sys.argv[2:],'cwd':str(ROOT),'sourceBefore':hashes(),'timeoutSeconds':600,'jobs':2,'offline':True,'freeBefore':shutil.disk_usage(ROOT).free}
env=dict(os.environ,CARGO_NET_OFFLINE='true',CARGO_BUILD_JOBS='2',CARGO_TARGET_DIR=str(ROOT/'src-tauri/target'),PLAYWRIGHT_CORE_PATH='/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs',CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
start=time.monotonic()
try:
 with (run/'output.txt').open('xb') as log:code=subprocess.run(sys.argv[2:],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=600).returncode
except subprocess.TimeoutExpired:code=124
record.update(exitCode=code,seconds=round(time.monotonic()-start,3),sourceAfter=hashes(),freeAfter=shutil.disk_usage(ROOT).free)
record['sourceUnchanged']=record['sourceBefore']==record['sourceAfter']
(run/'result.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['exitCode','seconds','sourceUnchanged','freeAfter']}))
raise SystemExit(code)
