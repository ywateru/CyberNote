from pathlib import Path
import json,hashlib
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2]
def identity(path):
 b=path.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def matches(record,path):
 a=identity(path);return a['bytes']==record['bytes']and a['sha256']==record['sha256']
d=json.loads((OUT/'input-manifest.json').read_text());selected=[{'path':f['path'],'matches':matches(f,ROOT/f['path'])}for f in d['files']]
freezePath=ROOT/'docs/verification/unified-candidate06/android-folder-visual-build07/input-freeze.json';freeze=json.loads(freezePath.read_text());product={'count':len(freeze['productFiles']),'aggregateFromFreeze':freeze['productAggregate'],'mismatches':[f['path']for f in freeze['productFiles']if not matches(f,ROOT/f['path'])]}
sealed=[]
for name in ['docs/verification/android-folder-fixes-runtime18','docs/verification/mobile-folder-visual28','docs/verification/mobile-folder-visual28-independent','docs/research/android-folders-readiness27']:
 path=ROOT/name/'evidence-index.json';idx=json.loads(path.read_text());entries=idx['files']if'files'in idx else[{'path':k,**v}for k,v in idx.items()];errors=[]
 for f in entries:
  target=ROOT/f['path']
  if not target.exists():target=path.parent/f['path']
  if not matches(f,target):errors.append(f['path'])
 sealed.append({'index':str(path.relative_to(ROOT)),'entries':len(entries),'indexSha256':identity(path)['sha256'],'mismatches':errors})
before=identity(ROOT/'docs/verification/android-folder-visual-runtime29/00-before-upgrade.png')
r={'selectedAnalysisInputs':selected,'frozenProductFiles':product,'sealedEvidence':sealed,'beforeUpgradePNG':before}
assert all(z['matches']for z in selected)and not product['mismatches']and all(not z['mismatches']for z in sealed)
assert before['sha256']=='c404c76ad9f22256c884b84429654739502c043a8cc19685cd82a61d4943af77'
(OUT/'input-close.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'selectedInputs':len(selected),'productFiles':product['count'],'sealedEvidence':sealed,'allMatch':True},indent=2))
