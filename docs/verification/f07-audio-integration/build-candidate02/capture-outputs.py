import datetime,hashlib,json,os,shutil,subprocess,sys,zipfile
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone');os.chdir(root)
out=root/'docs/verification/f07-audio-integration/build-candidate02';stage=sys.argv[1]
def sha(data):return hashlib.sha256(data).hexdigest()
def identity(path):
 b=path.read_bytes();return {'path':str(path),'bytes':len(b),'sha256':sha(b)}
def relative_files(path):
 result=[]
 for p in sorted(path.rglob('*')):
  rel=str(p.relative_to(path))
  if p.is_symlink():result.append({'path':rel,'type':'symlink','target':os.readlink(p),'sha256':sha(os.readlink(p).encode())})
  elif p.is_file():b=p.read_bytes();result.append({'path':rel,'type':'file','bytes':len(b),'sha256':sha(b)})
 return result
def aggregate(files):return sha(''.join(f['sha256']+'  '+f['path']+'\n' for f in files).encode())
manifest=out/('source-inputs-after-'+stage+'.json')
subprocess.run(['python3',str(out/'capture-inputs.py'),'freeze',str(manifest)],check=True)
before=json.loads((out/'source-inputs-before.json').read_text());after=json.loads(manifest.read_text())
a={x['path']:(x['sha256'],x['bytes']) for x in before['files']};b={x['path']:(x['sha256'],x['bytes']) for x in after['files']}
changed=[p for p in sorted(set(a)|set(b)) if a.get(p)!=b.get(p)]
if changed or before['headAtCapture']!=after['headAtCapture']:raise SystemExit('Frozen inputs/HEAD changed: '+str(changed))
result={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'stage':stage,'headAtFreeze':before['headAtCapture'],'headAfterBuild':after['headAtCapture'],'sourceAggregate':before['aggregate'],'listedInputsUnchanged':not changed,'changedInputs':changed,'features':'default; no proof flag','dist':relative_files(root/'dist')}
if stage=='mac':
 app=root/'src-tauri/target/release/bundle/macos/备忘录.app';executable=app/'Contents/MacOS/notes-clone';exe=identity(executable)
 preserved=Path('/private/tmp/notes-f07-audio-mac-candidate02-'+exe['sha256'][:8]+'.app')
 if preserved.exists():raise SystemExit('Refuse to overwrite preserved Mac bundle '+str(preserved))
 subprocess.run(['ditto',str(app),str(preserved)],check=True)
 files=relative_files(app);preserved_files=relative_files(preserved)
 assert files==preserved_files
 archive=preserved.with_suffix('.zip');subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(preserved),str(archive)],check=True)
 signature=subprocess.run(['codesign','-dv','--verbose=4',str(preserved)],capture_output=True,text=True)
 signature_verify=subprocess.run(['codesign','--verify','--deep','--strict',str(preserved)],capture_output=True,text=True)
 (out/'mac-codesign.txt').write_text(signature.stdout+signature.stderr+'\nverify exit '+str(signature_verify.returncode)+'\n'+signature_verify.stdout+signature_verify.stderr)
 result.update({'sourceApp':str(app),'preservedApp':str(preserved),'executable':exe,'bundleFiles':files,'bundleAggregate':aggregate(files),'bundleFileBytes':sum(f.get('bytes',0) for f in files),'preservedBundleMatches':True,'archive':identity(archive),'codesignInspectExit':signature.returncode,'codesignVerifyExit':signature_verify.returncode})
else:
 apk=root/'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk';apk_id=identity(apk)
 preserved=Path('/private/tmp/notes-f07-audio-android-candidate02-'+apk_id['sha256'][:8]+'.apk')
 if preserved.exists():raise SystemExit('Refuse to overwrite preserved APK '+str(preserved))
 shutil.copy2(apk,preserved);assert identity(preserved)['sha256']==apk_id['sha256']
 with zipfile.ZipFile(apk) as z:
  names=z.namelist();selected=[]
  for name in names:
   if name.startswith('lib/') and name.endswith('.so') or name.startswith('assets/') and (name.endswith(('.js','.css','.html')) or name=='assets/tauri.conf.json'):
    content=z.read(name);selected.append({'path':name,'bytes':len(content),'sha256':sha(content)})
 result.update({'apk':apk_id,'preservedApk':identity(preserved),'selectedEntries':sorted(selected,key=lambda x:x['path']),'abis':sorted({n.split('/')[1] for n in names if n.startswith('lib/') and n.endswith('.so')})})
(out/(stage+'-build-identity.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['dist','bundleFiles','selectedEntries']},ensure_ascii=False,indent=2))
