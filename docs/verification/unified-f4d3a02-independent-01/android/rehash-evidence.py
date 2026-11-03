import json,hashlib,pathlib,subprocess
r=pathlib.Path('.');out=r/'docs/verification/unified-f4d3a02-independent-01/android';head='f4d3a0273de35e7fc4e59c595630ba76aa9a900b';p=r/'docs/verification/f07-audio-integration/build-candidate01/source-inputs-before.json';d=json.loads(p.read_text());checks=[]
for f in d['files']:
 v=subprocess.run(['git','show',head+':'+f['path']],capture_output=True)
 if v.returncode==0:b=v.stdout;source='frozen git blob'
 else:b=(r/f['path']).read_bytes();source='untracked/generated/dependency current file'
 sha=hashlib.sha256(b).hexdigest();checks.append({'path':f['path'],'source':source,'matches':sha==f['sha256'] and len(b)==f['bytes'],'sha256':sha,'bytes':len(b)})
agg=hashlib.sha256(''.join(x['sha256']+'  '+x['path']+'\n' for x in checks).encode()).hexdigest();assert all(x['matches'] for x in checks);assert agg==d['aggregate'];mr=[]
for sub in ['build-candidate01','android-developer01']:
 folder=r/'docs/verification/f07-audio-integration'/sub;manifest=json.loads((folder/'manifest.json').read_text());fs=manifest['files'] if 'files' in manifest else [{'path':p,**m} for p,m in manifest.items()];matches=[]
 for f in fs:
  b=(folder/f['path']).read_bytes();matches.append({'path':f['path'],'matches':len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']})
 assert all(x['matches'] for x in matches);mr.append({'directory':str(folder),'count':len(fs),'allMatched':True,'files':matches})
result={'sourceHead':head,'sourceInputCount':len(checks),'aggregate':agg,'allMatched':True,'sourceFiles':checks,'developerEvidenceManifests':mr,'harnessNote':'Initial inline rehash reached manifest parser and raised KeyError files because build manifest uses a path-map while developer manifest uses a files array. No device action or source change. This script explicitly supports both actual schemas; all inputs and manifests re-read once.','scope':'Tracked inputs checked against frozen source blobs, generated/dependency inputs against actual files; does not imply complete reproducible build.'};(out/'31-source-evidence-rehash.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'sourceCount':len(checks),'aggregate':agg,'manifests':[{k:v for k,v in x.items() if k!='files'} for x in mr]},indent=2))
