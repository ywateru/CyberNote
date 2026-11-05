from pathlib import Path
import datetime,hashlib,json,os,zipfile
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=Path(__file__).resolve().parent
RUN=ROOT/'docs/verification/unified-candidate06/mac-recording-quit-build21/mac-attempt01'
ART=ROOT/'artifacts/unified-candidate06/mac-recording-quit-build21/mac-attempt01'
load=lambda p:json.loads(p.read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
def snapshot(p):
 assert p.is_dir() and not p.is_symlink(),str(p)
 rows=[]
 for q in sorted(p.rglob('*')):
  assert not q.is_symlink(),str(q)
  row={'path':str(q.relative_to(p)),'mode':q.stat().st_mode&0o777,'type':'directory' if q.is_dir() else 'file'}
  if q.is_file():row.update(bytes=q.stat().st_size,sha256=sha(q.read_bytes()))
  else:assert q.is_dir(),str(q)
  rows.append(row)
 return {'device':p.stat().st_dev,'inode':p.stat().st_ino,'mode':p.stat().st_mode&0o777,'tree':rows}
b=load(RUN/'result.json');c=load(RUN/'collection/result.json')
result={'status':'pass','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only supplementary full directory/mode and actual sealing delta checks; no app, device, build or signing execution.','generated':[],'preserved':[],'bundles':{}}
for label,items in [('generated',b['generatedOutputs']),('preserved',b['outputIsolation']['outputs'])]:
 for row in items:
  p=Path(row['source'] if label=='generated' else row['preserved']);expected=row['snapshot'] if label=='generated' else row['before']
  snap=snapshot(p)
  assert all(snap[k]==expected[k] for k in ['device','inode','mode'])
  files=[r for r in snap['tree'] if r['type']=='file']
  dirs=[{k:r[k] for k in ['path','mode']} for r in snap['tree'] if r['type']=='directory']
  assert files==expected['files'] and dirs==expected['directories'],str(p)
  result[label].append({'path':str(p),**snap,'exactRecordedFullSnapshot':True})
for kind in ['original','sealed']:
 p=ART/f'mac-{kind}.app';snap=snapshot(p)
 expected_dirs=['Contents','Contents/MacOS']+(['Contents/_CodeSignature'] if kind=='sealed' else [])
 dirs=[r for r in snap['tree'] if r['type']=='directory']
 assert dirs==[{'path':d,'mode':0o755,'type':'directory'} for d in expected_dirs]
 assert snap['mode']==0o755
 assert [r for r in snap['tree'] if r['type']=='file']==c[kind]['bundleFiles']
 with zipfile.ZipFile(c[kind]['archive']['path']) as z:
  name=f'mac-{kind}.app'
  ordinary_dirs=[i.filename for i in z.infolist() if i.is_dir() and not i.filename.startswith('__MACOSX/')]
  assert sorted(ordinary_dirs)==sorted([name+'/']+[name+'/'+d+'/' for d in expected_dirs]),ordinary_dirs
 result['bundles'][kind]={'path':str(p),**snap,'archiveDirectoryEntriesExact':True}
old={r['path']:r for r in c['original']['bundleFiles']};new={r['path']:r for r in c['sealed']['bundleFiles']}
actual=[{'path':p,'before':old.get(p),'after':new.get(p)} for p in sorted(set(old)|set(new)) if old.get(p)!=new.get(p)]
assert actual==c['sealingChanges']
assert {r['path'] for r in actual}=={'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'}
result['actualSealingDelta']=actual
(OUT/'package-tree-readonly-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'pass','generatedFullTrees':len(result['generated']),'preservedFullTrees':len(result['preserved']),'bundleFullTrees':2,'actualSealingDeltaPaths':[r['path'] for r in actual]}))
