from pathlib import Path
import subprocess,json,sys,time
out=Path('docs/verification/mac-ordinary-tab-loop37');attempt=sys.argv[1];start=time.time()
with (out/('native-rust-run-'+attempt+'.log')).open('w') as log:
 p=subprocess.Popen([str((out/'native-rust-chain').resolve())],stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 try:code=p.wait(timeout=25);status='finished'
 except subprocess.TimeoutExpired:
  p.terminate()
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:p.kill();p.wait()
  code=p.returncode;status='timeout'
(out/('native-rust-run-'+attempt+'.json')).write_text(json.dumps({'status':status,'exit':code,'pid':p.pid,'elapsed':time.time()-start},indent=2)+'\n')
raise SystemExit(0 if status=='finished' and code==0 else 1)
