import os, subprocess, json, time, shutil, signal, sys
from pathlib import Path
root=Path('/private/tmp/cybernote-account109-login-surfaces-ui')
out=Path('/private/tmp/account110-staging-capability-native01')
env=os.environ.copy()
env.update(CARGO_TARGET_DIR='/private/tmp/cybernote-account109-mac-ec4348c6-target-01',CARGO_BUILD_JOBS='2',CARGO_PROFILE_DEV_DEBUG='0',CARGO_PROFILE_TEST_DEBUG='0',CARGO_INCREMENTAL='0')
name=sys.argv[1]; selector=sys.argv[2]
argv=['cargo','test','--manifest-path','src-tauri/Cargo.toml','--lib','--features','sync-e2e','--locked','--offline',selector,'--','--nocapture','--test-threads=1']
receipt={'argv':argv,'root':str(root),'base':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'environment':{k:env[k] for k in ['CARGO_TARGET_DIR','CARGO_BUILD_JOBS','CARGO_PROFILE_DEV_DEBUG','CARGO_PROFILE_TEST_DEBUG','CARGO_INCREMENTAL']},'started':time.time(),'floorBytes':6*1024**3,'initialFreeBytes':shutil.disk_usage(root).free}
(out/(name+'-command.json')).write_text(json.dumps(receipt,indent=2)+'\n')
if receipt['initialFreeBytes']<receipt['floorBytes']: raise SystemExit('disk below floor')
with (out/(name+'.log')).open('w') as log:
 p=subprocess.Popen(argv,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 receipt['pid']=p.pid
 (out/(name+'-command.json')).write_text(json.dumps(receipt,indent=2)+'\n')
 while p.poll() is None:
  if shutil.disk_usage(root).free<receipt['floorBytes']:
   receipt['diskFloorStopped']=True
   os.killpg(p.pid,signal.SIGTERM)
   p.wait();break
  time.sleep(2)
 receipt.update(exitCode=p.returncode,finished=time.time(),finalFreeBytes=shutil.disk_usage(root).free)
(out/(name+'-result.json')).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
