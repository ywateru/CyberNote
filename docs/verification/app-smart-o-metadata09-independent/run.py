from pathlib import Path
import hashlib,json,os,shutil,subprocess,time,sys
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=Path(__file__).resolve().parent
AUTHOR=ROOT/'docs/verification/app-smart-o-metadata09'
identity=json.loads((AUTHOR/'source-identity.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
expected=identity['sourceSha256']
def sources():return {p:sha(ROOT/p) for p in expected}
assert sources()==expected
for p,h in expected.items():assert hashlib.sha256(subprocess.check_output(['git','show','08d2206:'+p],cwd=ROOT)).hexdigest()==h,p
binary=ROOT/'src-tauri/target/debug/notes-o-session-transport'
assert sha(binary)=='036d509015f9dfde7f2fd0a82826da6e02857785a92b6bc7752d721b788e906c'
attempt=OUT/sys.argv[1];attempt.mkdir()
assert shutil.disk_usage(ROOT).free>=2*1024**3
record={'reviewedSourceCommit':'08d220664c28a7bd8647e27d3bf1e73f823c4c89','currentHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'sourceBefore':expected,'binarySha256':sha(binary),'runnerSha256':sha(OUT/'check-final-metadata.mjs'),'argv':sys.argv[2:],'jobs':2,'offline':True,'timeoutSeconds':600,'freeBefore':shutil.disk_usage(ROOT).free}
(attempt/'result.json').write_text(json.dumps(record,indent=2)+'\n')
env=dict(os.environ,CARGO_NET_OFFLINE='true',CARGO_BUILD_JOBS='2',CARGO_TARGET_DIR=str(ROOT/'src-tauri/target'),PLAYWRIGHT_CORE_PATH='/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs',CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
start=time.monotonic()
try:
    with (attempt/'output.txt').open('xb') as f:p=subprocess.run(sys.argv[2:],cwd=ROOT,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=600)
    code=p.returncode
except subprocess.TimeoutExpired:code=124
record.update(exitCode=code,seconds=round(time.monotonic()-start,3),sourceAfter=sources(),sourceUnchanged=sources()==expected,binaryAfter=sha(binary),freeAfter=shutil.disk_usage(ROOT).free)
(attempt/'result.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:record[k] for k in ['exitCode','seconds','sourceUnchanged','freeAfter']}))
raise SystemExit(code)
