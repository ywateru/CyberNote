import subprocess,json,hashlib,os,time,sys,uuid,shutil
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone')
out=root/'docs/verification/sync90/android-build'
artifact=root/'artifacts/sync90'
if out.exists(): raise SystemExit('Refuse overwrite existing Android result')
out.mkdir(parents=True); artifact.mkdir(parents=True,exist_ok=True)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def tree(folder):
 return [{'path':str(p.relative_to(folder)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(folder.rglob('*')) if p.is_file() and not p.is_symlink()]
paths=subprocess.check_output(['git','ls-files','-z','--','src','src-tauri','plugins','package.json','pnpm-lock.yaml','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','index.html','.cargo'],cwd=root).decode().split('\0')
def inputs():
 return [{'path':p,'bytes':(root/p).stat().st_size,'sha256':sha(root/p)} for p in sorted(filter(None,paths)) if (root/p).is_file()]
result={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'inputBefore':inputs(),'commands':[],'deviceOperations':[]}
(out/'build-driver.py').write_bytes(Path(__file__).read_bytes())
def save(): (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
def run(name,args,env=None,required=True):
 started=time.monotonic()
 with (out/(name+'.log')).open('w') as log: completed=subprocess.run(args,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 row={'name':name,'command':args,'exitCode':completed.returncode,'wallSeconds':round(time.monotonic()-started,3)}
 result['commands'].append(row);save();print(json.dumps(row,ensure_ascii=False),flush=True)
 if required and completed.returncode: raise RuntimeError(name+' failed; see '+str(out/(name+'.log')))
 return row
nonce=uuid.uuid4().hex
init=Path('/private/tmp/notes-scan-gradle-home/init.d')/('sync90-offline-'+nonce+'.gradle')
init_text='gradle.startParameter.offline = true\ngradle.startParameter.maxWorkerCount = 2\nprintln("SYNC90_OFFLINE=" + gradle.startParameter.offline + " workers=" + gradle.startParameter.maxWorkerCount + " nonce='+nonce+'")\n'
try:
 source=root/'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk'
 previous=artifact/'prior-android-output.apk'
 if source.exists():
  result['previousOutput']={'bytes':source.stat().st_size,'sha256':sha(source)}
  source.rename(previous)
 result['sourceAbsentBeforeBuild']=not source.exists()
 env=os.environ.copy()
 overrides={'ANDROID_HOME':'/Users/water/Library/Android/sdk','NDK_HOME':'/Users/water/Library/Android/sdk/ndk/27.2.12479018','JAVA_HOME':'/opt/zerobrew/opt/openjdk@17','GRADLE_USER_HOME':'/private/tmp/notes-scan-gradle-home','CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'2','GRADLE_RO_DEP_CACHE':'/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro','GRADLE_OPTS':'-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false'}
 env.update(overrides);result['environmentOverrides']=overrides
 init.parent.mkdir(exist_ok=True,parents=True)
 with init.open('x') as f: f.write(init_text)
 result['scopedInit']={'path':str(init),'sha256':sha(init),'text':init_text}
 run('android-build',['pnpm','android:build','--debug'],env=env)
 result['inputAfter']=inputs();result['inputUnchanged']=result['inputBefore']==result['inputAfter']
 if not result['inputUnchanged']: raise RuntimeError('Build inputs changed')
 if not source.is_file(): raise RuntimeError('No fresh APK')
 target=artifact/'备忘录-Android20.apk'
 if target.exists(): raise RuntimeError('Refuse artifact overwrite')
 shutil.copy2(source,target)
 result['apk']={'path':str(target),'bytes':target.stat().st_size,'sha256':sha(target)}
 shutil.copytree(root/'dist',artifact/'android-dist')
 result['distFiles']=tree(artifact/'android-dist');result['frontendSnapshot']=str(artifact/'android-dist')
 sdk=Path(overrides['ANDROID_HOME'])
 signer=sdk/'build-tools/36.0.0/apksigner'
 if not signer.is_file(): signer=next(reversed(sorted(sdk.glob('build-tools/*/apksigner'))))
 run('apk-signature',[str(signer),'verify','--verbose','--print-certs',str(target)])
 result['status']='pass';result['limits']=['APK build/signature only; no installation, existing Android device or provider runtime actions.']
except Exception as error:
 result['status']='failed';result['error']=str(error);save();raise
finally:
 if init.exists() and init.read_text()==init_text: init.unlink(); result['scopedInitRemoved']=True
 save()
print(json.dumps({'status':result['status'],'apk':result.get('apk')},ensure_ascii=False),flush=True)
