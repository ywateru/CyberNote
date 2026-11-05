from pathlib import Path
import json,hashlib,subprocess,datetime
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
AUTHOR='7243c649862181d35aa94063149e30653593d7dc'
EVIDENCE='7309ab1cca2fda917889c09e1db1ebd7abb04c88'
PREFIX='docs/verification/mac-recording-media67/author/'
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def obj(path,commit=EVIDENCE):return git('show',commit+':'+path)
def sha(data):return hashlib.sha256(data).hexdigest()
def load(path):return json.loads(obj(PREFIX+path))
assert git('rev-parse',EVIDENCE+'^').decode().strip()==AUTHOR
assert git('diff','--name-only',AUTHOR+'^',AUTHOR).decode().splitlines()==['src/use-attachment-media.ts']
changed=git('diff','--name-only',AUTHOR,EVIDENCE).decode().splitlines()
assert len(changed)==22 and all(p.startswith(PREFIX) or p=='scripts/check-recording-media67.mjs' for p in changed)
manifest=load('evidence-manifest.json');assert manifest['sourceCommit']==AUTHOR
rows=[]
for row in manifest['files']:
 data=obj(PREFIX+row['path']);assert len(data)==row['bytes'] and sha(data)==row['sha256'],row['path']
 disk=Path('/private/tmp/apple-notes-mac-recording-media67-01')/PREFIX/row['path'];assert disk.read_bytes()==data,row['path']
 rows.append(row)
assert len(rows)==20
actual=git('ls-tree','-r','--name-only',EVIDENCE,PREFIX).decode().splitlines()
assert set(actual)=={PREFIX+r['path'] for r in rows}|{PREFIX+'evidence-manifest.json'}
source=load('source-manifest.json');assert source['sourceCommit']==AUTHOR
preserved=[]
for group in ['productFiles','preservedProductionSources','runnersAndDependencies']:
 for row in source[group]:
  data=obj(row['path']);assert sha(data)==row['sha256']
  if row['path']!='scripts/check-recording-media67.mjs':assert data==(ROOT/row['path']).read_bytes()
  if row.get('unchangedFromBase'):
   assert obj(row['path'],source['baseCommit'])==data;preserved.append(row['path'])
checks=[]
for name,num,mode in [('baseline-attempt03/result.json',3,'baseline'),('candidate-attempt02/result.json',25,'candidate'),('strict-lifetime/result.json',2,'strict')]:
 d=load(name);assert len(d['checks'])==num,(name,d.keys());assert d['pass'] and not d['pageErrors']
 checks.append({'path':PREFIX+name,'bytes':len(obj(PREFIX+name)),'sha256':sha(obj(PREFIX+name)),'checkCount':num,'declaredPass':True,'mode':mode,'keys':list(d)})
result={'status':'pass-author-evidence-identity-only','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'product':AUTHOR,'evidenceCommit':EVIDENCE,'files':rows,'manifestSha256':sha(obj(PREFIX+'evidence-manifest.json')),'sourceManifestSha256':sha(obj(PREFIX+'source-manifest.json')),'preservedProductionFiles':preserved,'observedResults':checks,'limits':['Read-only hash/schema/source-binding audit; author results do not replace independent controlled runs.','Author intermediate runner revisions not separately frozen, as expressly disclosed in source manifest; final runner identity is not retroactively assigned to old attempts.','No application, GUI, device, native build, signing, permissions or actual audio operation.']}
(OUT/'author-evidence-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':result['status'],'evidenceFiles':len(rows),'preservedSources':len(preserved),'authorDeclaredChecks':[x['checkCount'] for x in checks]}))
