#!/usr/bin/env python3
"""U2 regression: live replacement without ACK must not move/reopen either host.
Only temporary fake bundles and test-owned sleep children; never installed apps.
Run both frozen review helper and current source, preserving original negatives.
"""
import hashlib,json,os,subprocess,sys,tempfile,threading,time
from pathlib import Path
root=Path(__file__).resolve().parents[3]
checks=[]
def run(script,case):
 with tempfile.TemporaryDirectory(prefix='update-blocking-helper-') as tmp:
  base=Path(tmp);work=base/'work';work.mkdir();target=base/'CyberNote.app';stage=work/'CyberNote.app';backup=base/'old.app'
  for app,body in [(target,b'old'),(stage,b'new')]:
   f=app/'Contents/MacOS/fixture';f.parent.mkdir(parents=True);f.write_bytes(body)
  bindir=base/'bin';bindir.mkdir();(bindir/'sleep').symlink_to('/usr/bin/true')
  helper=base/'helper.sh';helper.write_text(script)
  opener=base/'opener';opener.write_text(f'''#!{sys.executable}
import os,sys,time
from pathlib import Path
work=Path(os.environ['PROOF_WORK']);body=(Path(sys.argv[2])/'Contents/MacOS/fixture').read_bytes()
with (work/'opens').open('ab') as f:f.write(body+b'\\n')
if body==b'new':
 (work/'request').touch()
 for _ in range(500):
  if (work/'launched').exists():break
  time.sleep(.002)
 else:raise SystemExit('test launch controller timeout')
 if os.environ['PROOF_CASE']=='success':(work/'ack').write_text('initialized')
 if os.environ['PROOF_CASE']=='open_error_live':raise SystemExit(1)
''');opener.chmod(0o700)
  stop=threading.Event();children=[];controller_errors=[]
  def controller():
   try:
    while not stop.is_set():
     if (work/'request').exists():
      child=subprocess.Popen(['/bin/sleep','30'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);children.append(child);(work/'launched').touch();return
     time.sleep(.002)
   except BaseException as e:controller_errors.append(repr(e))
  t=threading.Thread(target=controller);t.start()
  try:
   r=subprocess.run(['/bin/sh',str(helper),str(2**30),str(stage),str(target),str(backup),str(work),'fixture',hashlib.sha256(b'old').hexdigest(),str(opener),hashlib.sha256(b'new').hexdigest()],env=dict(os.environ,PATH=f'{bindir}:/usr/bin:/bin',PROOF_WORK=str(work),PROOF_CASE=case),capture_output=True,timeout=15)
   assert not controller_errors,controller_errors
   assert len(children)==1 and children[0].poll() is None
   phase=(work/'phase').read_text().strip();opens=(work/'opens').read_text().splitlines()
   if case=='late_ack':(work/'ack').write_text('too late');time.sleep(.02);assert (work/'phase').read_text().strip()==phase
   return {'case':case,'phase':phase,'oldReopened':'old' in opens,'target':(target/'Contents/MacOS/fixture').read_text(),'backupRetained':backup.exists(),'liveProcess':children[0].poll() is None,'exit':r.returncode}
  finally:
   stop.set();t.join(timeout=3);assert not t.is_alive()
   for child in children:
    child.terminate();child.wait(timeout=3)
old=subprocess.check_output(['git','show','cfde3810:src-tauri/src/software_update/replace.sh'],cwd=root,text=True)
baseline=run(old,'no_ack');assert baseline['oldReopened'] and baseline['phase']=='rolled_back' and baseline['liveProcess']
for case in ['no_ack','open_error_live','late_ack','success']:
 result=run((root/'src-tauri/src/software_update/replace.sh').read_text(),case)
 assert result['liveProcess'] and not result['oldReopened'] and result['target']=='new' and result['backupRetained'],result
 assert result['phase']==('complete' if case=='success' else 'recovery_required'),result
 checks.append(result)
print(json.dumps({'baselineUnsafeBehavior':baseline,'fixed':checks,'children':'All test-owned subprocesses terminated and waited; no user application or library touched.'},indent=2))
