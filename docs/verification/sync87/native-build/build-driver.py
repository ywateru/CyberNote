import subprocess,json,hashlib,os,time,sys
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone')
out=root/'docs/verification/sync87/native-build'
artifact=root/'artifacts/sync87'
if out.exists(): raise SystemExit('Refuse overwrite existing Mac build evidence')
for name in ['mac-original.app','备忘录.app','备忘录-Mac27.zip','mac-dist']:
 if (artifact/name).exists(): raise SystemExit('Refuse overwrite existing Mac artifact: '+name)
out.mkdir(parents=True);artifact.mkdir(parents=True,exist_ok=True)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def manifest(folder):
 return [{'path':str(p.relative_to(folder)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(folder.rglob('*')) if p.is_file() and not p.is_symlink()]
paths=subprocess.check_output(['git','ls-files','-z','--','src','src-tauri','plugins','package.json','pnpm-lock.yaml','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','index.html','.cargo'],cwd=root).decode().split('\0')
def inputs():
 return [{'path':p,'bytes':(root/p).stat().st_size,'sha256':sha(root/p)} for p in sorted(filter(None,paths)) if (root/p).is_file()]
result={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'inputBefore':inputs(),'artifactDirectory':str(artifact),'commands':[]}
(out/'build-driver.py').write_bytes(Path(__file__).read_bytes())
def save(): (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
def run(name,args,env=None,required=True):
 started=time.monotonic()
 with (out/(name+'.log')).open('w') as log: completed=subprocess.run(args,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 row={'name':name,'command':args,'exitCode':completed.returncode,'wallSeconds':round(time.monotonic()-started,3)}
 result['commands'].append(row);save();print(json.dumps(row,ensure_ascii=False),flush=True)
 if required and completed.returncode: raise RuntimeError(name+' failed; see '+str(out/(name+'.log')))
 return row
try:
 build_env=os.environ.copy();build_env['CARGO_NET_OFFLINE']='true'
 result['buildEnvironment']={'CARGO_NET_OFFLINE':'true'}
 run('mac-build',['pnpm','mac:build'],env=build_env)
 result['inputAfter']=inputs();result['inputUnchanged']=result['inputBefore']==result['inputAfter']
 if not result['inputUnchanged']: raise RuntimeError('Build inputs changed')
 source=root/'src-tauri/target/release/bundle/macos/备忘录.app'
 raw=artifact/'mac-original.app';sealed=artifact/'备忘录.app';archive=artifact/'备忘录-Mac27.zip'
 run('copy-original',['ditto',str(source),str(raw)])
 result['originalFiles']=manifest(raw)
 run('verify-original',['codesign','--verify','--deep','--strict','--verbose=4',str(raw)],required=False)
 run('copy-derived',['ditto',str(raw),str(sealed)])
 run('sign-derived',['codesign','--force','--sign','-','--timestamp=none',str(sealed)])
 run('verify-derived',['codesign','--verify','--deep','--strict','--verbose=4',str(sealed)])
 run('inspect-derived',['codesign','-dv','--verbose=4',str(sealed)])
 result['derivedFiles']=manifest(sealed)
 before={p['path']:p for p in result['originalFiles']};after={p['path']:p for p in result['derivedFiles']}
 result['changedPaths']=[p for p in sorted(set(before)|set(after)) if before.get(p)!=after.get(p)]
 if not set(result['changedPaths']) <= {'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'}: raise RuntimeError('Unexpected signed resource changes')
 result['originalUnchanged']=manifest(raw)==result['originalFiles']
 if not result['originalUnchanged']: raise RuntimeError('Original copy changed')
 run('archive',['ditto','-c','-k','--sequesterRsrc','--keepParent',str(sealed),str(archive)])
 result['archive']={'path':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive)}
 result['executable']={'path':str(sealed/'Contents/MacOS/notes-clone'),'sha256':sha(sealed/'Contents/MacOS/notes-clone')}
 run('copy-frontend',['ditto',str(root/'dist'),str(artifact/'mac-dist')])
 result['frontendFiles']=manifest(artifact/'mac-dist');result['frontendSnapshot']=str(artifact/'mac-dist');result['status']='pass'
 result['limits']=['Local arm64 ad-hoc build and strict signature verification; no notarization, installation or runtime/whole-window pixel acceptance.','Build inputs and command/source provenance recorded; not a hermetic OS/toolchain/dependency reproducibility proof.']
except Exception as error:
 result['status']='failed';result['error']=str(error);save();raise
save();print(json.dumps({'status':result['status'],'app':str(sealed),'archive':result['archive']},ensure_ascii=False),flush=True)
