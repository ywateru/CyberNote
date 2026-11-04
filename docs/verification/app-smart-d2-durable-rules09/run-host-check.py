#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,os,shutil,signal,subprocess,time
root=Path(__file__).resolve().parents[3]
out=Path(__file__).resolve().parent/'host-check01'
if out.exists(): raise SystemExit('Preserve existing evidence')
if shutil.disk_usage(root).free < 2*1024**3: raise SystemExit('Less than 2 GiB available')
out.mkdir()
sources=sorted((root/'src-tauri/src').rglob('*.rs'))
def hashes(): return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
command=['cargo','check','--locked','--offline','--lib','--manifest-path','src-tauri/Cargo.toml']
record={'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceBefore':hashes(),'command':command,'jobs':2,'timeoutSeconds':600,'freeBefore':shutil.disk_usage(root).free,'kind':'host library compile check; no application packaging or installation'}
(out/'result.json').write_text(json.dumps(record,indent=2)+'\n')
start=time.monotonic()
with (out/'cargo-check.txt').open('wb') as log:
 process=subprocess.Popen(command,cwd=root,env=dict(os.environ,CARGO_NET_OFFLINE='true',CARGO_BUILD_JOBS='2',CARGO_TARGET_DIR=str(root/'src-tauri/target')),stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:
  code=process.wait(timeout=600)
  record['timedOut']=False
 except subprocess.TimeoutExpired:
  record['timedOut']=True
  os.killpg(process.pid,signal.SIGTERM)
  try: process.wait(timeout=10)
  except subprocess.TimeoutExpired:
   os.killpg(process.pid,signal.SIGKILL)
   process.wait()
  code=124
record.update(exitCode=code,seconds=round(time.monotonic()-start,3),sourceAfter=hashes(),freeAfter=shutil.disk_usage(root).free)
record['sourceUnchanged']=record['sourceBefore']==record['sourceAfter']
(out/'result.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['exitCode','seconds','sourceUnchanged','timedOut','freeAfter']}))
raise SystemExit(code)
