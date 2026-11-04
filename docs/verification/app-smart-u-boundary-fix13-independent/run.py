from pathlib import Path
import hashlib,json,os,shutil,subprocess,time,sys
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=Path(__file__).resolve().parent
MANIFEST=ROOT/'docs/verification/app-smart-u-boundary-fix13/source-identity.json'
FIXED='8e8fe7e320e34a2b9c27bf7c7e794662ad988da4'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(MANIFEST)=='0940c3cb398ae82cf703f60136dbaa10614975d77f08f99fa7532e8dc3ce59ad'
expected=json.loads(MANIFEST.read_text())['sourceFiles']
def sources():return {p:sha(ROOT/p) for p in expected}
assert sources()==expected
binary=ROOT/'src-tauri/target/debug/notes-u-session-transport'
assert sha(binary)=='943c2aa1a53828087037cdcec3ebf4f9db68aecef13d2fd35076d4450a344fd4'
attempt=OUT/sys.argv[1];attempt.mkdir()
assert shutil.disk_usage(ROOT).free>=2*1024**3
record={'reviewedSourceCommit':FIXED,'currentHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'manifestSha256':sha(MANIFEST),'sourceBefore':expected,'binarySha256':sha(binary),'argv':sys.argv[2:],'jobs':2,'offline':True,'timeoutSeconds':600,'freeBefore':shutil.disk_usage(ROOT).free}
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
