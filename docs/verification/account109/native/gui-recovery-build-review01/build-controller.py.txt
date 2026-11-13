import os,json,subprocess,hashlib,pathlib,shutil,signal,time
root=pathlib.Path('/private/tmp/cybernote-account109-gui-reauth-01')
out=pathlib.Path('/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-10814415-debug-e2e-02')
target='/private/tmp/cybernote-account109-mac-ec4348c6-target-01'
source='10814415ca088273bacc311d192b9605bda16775'
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
git=lambda *a:subprocess.check_output(['git',*a],cwd=root,text=True).strip()
assert git('rev-parse','HEAD')==source and not git('status','--porcelain','--untracked-files=normal')
assert not out.exists();out.mkdir(parents=True)
env={k:os.environ[k] for k in ['PATH','HOME','USER','LOGNAME','TMPDIR','LANG','LC_ALL','CARGO_HOME','RUSTUP_HOME'] if k in os.environ}
env.update(NODE_ENV='development',VITE_NOTES_DEBUG='1',CYBERNOTE_BUILD_TARGET='macos',CARGO_TARGET_DIR=target,CARGO_BUILD_JOBS='2',CARGO_PROFILE_DEV_DEBUG='0',CARGO_PROFILE_TEST_DEBUG='0',CARGO_INCREMENTAL='0',CARGO_NET_OFFLINE='true')
files=git('ls-files','--cached','--others','--exclude-standard').splitlines()
assert not [p for p in files if pathlib.Path(p).name.startswith('.env')]
locks=['pnpm-lock.yaml','src-tauri/Cargo.lock','crates/account-auth/Cargo.lock','services/coordinator/package-lock.json']
identity=lambda:json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {sourceIdentity} from './scripts/build-info.mjs';console.log(JSON.stringify(sourceIdentity(process.cwd(),{metadataPath:null})));"],cwd=root,env=env,text=True))
r={'schema':1,'kind':'debug-e2e-candidate','status':'building','sourceRevision':source,'sourceRoot':str(root),'sourceTree':git('rev-parse','HEAD^{tree}'),'sourceBefore':identity(),'lockfilesBefore':{p:sha(root/p) for p in locks},'cargoTarget':target,'buildFlags':{k:v for k,v in env.items() if k not in ['PATH','HOME','USER','LOGNAME','TMPDIR','LANG','LC_ALL','CARGO_HOME','RUSTUP_HOME']},'commands':[],'appLaunched':False,'adbUsed':False,'originalStoresOpened':False}
r['toolchain']={name:subprocess.check_output(cmd,cwd=root,env=env,text=True).strip() for name,cmd in {'node':['node','--version'],'pnpm':['pnpm','--version'],'cargo':['cargo','--version'],'rustc':['rustc','-vV'],'developerDirectory':['xcode-select','-p'],'sdk':['xcrun','--sdk','macosx','--show-sdk-version']}.items()}
save=lambda:(out/'build-record.json').write_text(json.dumps(r,indent=2)+'\n')
save()
def step(name,cmd,timeout=1200):
 log=out/(name+'.log');began=time.time()
 with log.open('wb') as f:
  p=subprocess.Popen(cmd,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try: code=p.wait(timeout=timeout)
  except subprocess.TimeoutExpired:
   os.killpg(p.pid,signal.SIGTERM)
   try:code=p.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);code=p.wait(timeout=10)
   r['commands'].append({'name':name,'command':cmd,'exitCode':code,'timedOut':True,'logSha256':sha(log)});save();raise
 r['commands'].append({'name':name,'command':cmd,'exitCode':code,'durationSeconds':round(time.time()-began,3),'logSha256':sha(log)});save()
 print(name,code,flush=True);assert code==0,name+' failed'
try:
 step('frontend-build',['pnpm','build'])
 step('compiled-capability',['node','scripts/debug/account-native-capability.mjs'])
 step('native-build',['cargo','build','--manifest-path','src-tauri/Cargo.toml','--features','sync-e2e,tauri/custom-protocol','--locked','--offline'])
 binary=out/'notes-clone';shutil.copy2(pathlib.Path(target)/'debug/notes-clone',binary)
 step('embedded-identity',['node','scripts/publish/package-identity.mjs',str(binary),target+'/debug/build'])
 r['identityReceipt']=json.loads((out/'embedded-identity.log').read_text())
 r['binary']={'path':str(binary),'sha256':sha(binary),'bytes':binary.stat().st_size,'architecture':subprocess.check_output(['file','-b',str(binary)],text=True).strip()}
 r['sourceAfter']=identity();r['lockfilesAfter']={p:sha(root/p) for p in locks}
 assert r['sourceBefore']==r['sourceAfter'] and r['lockfilesBefore']==r['lockfilesAfter'] and not r['sourceAfter']['sourceDirty']
 assert git('rev-parse','HEAD')==source and not git('status','--porcelain','--untracked-files=normal')
 shutil.copy2(root/'dist/build-info.json',out/'frontend-build-info.json')
 r['status']='passed-build-and-embedded-identity-only';save();print(json.dumps(r['binary']),flush=True)
except BaseException as e:
 r['status']='fail';r['failure']=str(e)[:200];save();raise
