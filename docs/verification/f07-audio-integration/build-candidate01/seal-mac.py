import datetime,hashlib,json,os,subprocess
from pathlib import Path
out=Path('/Users/water/work/2026/Apple-Notes-Clone/docs/verification/f07-audio-integration/build-candidate01')
source=Path('/private/tmp/notes-f07-audio-mac-candidate01-f71efb72.app')
derived=Path('/private/tmp/notes-f07-audio-mac-candidate01-sealed.app')
if derived.exists():raise SystemExit('Refuse overwrite '+str(derived))
def sha(b):return hashlib.sha256(b).hexdigest()
def files(root):
 rows=[]
 for p in sorted(root.rglob('*')):
  rel=str(p.relative_to(root))
  if p.is_symlink():rows.append({'path':rel,'type':'symlink','target':os.readlink(p),'sha256':sha(os.readlink(p).encode())})
  elif p.is_file():b=p.read_bytes();rows.append({'path':rel,'type':'file','bytes':len(b),'sha256':sha(b)})
 return rows
def identity(p):b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':sha(b)}
before=files(source)
subprocess.run(['ditto',str(source),str(derived)],check=True)
sign=subprocess.run(['codesign','--force','--sign','-','--timestamp=none',str(derived)],capture_output=True,text=True)
verify=subprocess.run(['codesign','--verify','--deep','--strict','--verbose=4',str(derived)],capture_output=True,text=True)
inspect=subprocess.run(['codesign','-dv','--verbose=4',str(derived)],capture_output=True,text=True)
(out/'mac-derived-codesign.txt').write_text('sign exit '+str(sign.returncode)+'\n'+sign.stdout+sign.stderr+'\nverify exit '+str(verify.returncode)+'\n'+verify.stdout+verify.stderr+'\ninspect exit '+str(inspect.returncode)+'\n'+inspect.stdout+inspect.stderr)
if sign.returncode or verify.returncode:raise SystemExit('Derived signing/strict verification failed')
after=files(derived);assert files(source)==before
old={x['path']:x for x in before};new={x['path']:x for x in after}
changes=[{'path':p,'before':old.get(p),'after':new.get(p)} for p in sorted(set(old)|set(new)) if old.get(p)!=new.get(p)]
allowed={'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'}
assert set(x['path'] for x in changes)<=allowed
archive=derived.with_suffix('.zip');subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(derived),str(archive)],check=True)
result={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceApp':str(source),'preservedUnsignedBaselineUnchanged':True,'derivedApp':str(derived),'signCommand':['codesign','--force','--sign','-','--timestamp=none',str(derived)],'signExit':sign.returncode,'strictVerifyExit':verify.returncode,'executable':identity(derived/'Contents/MacOS/notes-clone'),'files':after,'bundleFileBytes':sum(x.get('bytes',0) for x in after),'bundleAggregate':sha(''.join(x['sha256']+'  '+x['path']+'\n' for x in after).encode()),'changes':changes,'unchangedResourcePaths':[p for p in sorted(set(old)&set(new)) if old[p]==new[p]],'archive':identity(archive),'signingScope':'Local adhoc complete bundle signature only; no developer certificate, notarization or distribution acceptance claim','sourceProductEdits':False}
(out/'mac-derived-identity.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['files','changes']},ensure_ascii=False,indent=2))
