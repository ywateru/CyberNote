from pathlib import Path
import hashlib,json,subprocess
r=Path.cwd();a=r/'docs/verification/app-001-sidebar-drag-selection08';o=Path(__file__).resolve().parent
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def dump(n,d):
 p=o/n;assert not p.exists();p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def ident(p):return dict(path=str(p.relative_to(r)),bytes=p.stat().st_size,sha256=H(p))
m=json.loads((a/'output-manifest.json').read_text());assert len(m['files'])==m['fileCount']==9
assert {str(p.relative_to(r)) for p in a.iterdir() if p.is_file() and p.name!='output-manifest.json'}=={x['path'] for x in m['files']}
for row in m['files']:
 p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256'],p
paths={a/'output-manifest.json',*[r/x['path'] for x in m['files']],r/'src/App.tsx',r/'src/style.css',r/'plugins/tauri-plugin-notes-ui/macos/toolbar.m',r/'docs/plan/tasks/app-001-sidebar-drag-selection08.md',r/'docs/ui/macos.md',r/'package.json',r/'pnpm-lock.yaml'}
inputs=[ident(p) for p in sorted(paths)];dump('inputs-open.json',dict(files=inputs,authorManifestSha256=H(a/'output-manifest.json')))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();assert head=='8614d788745a6183542d261d1c6b6fc789084dc7'
baseline=subprocess.check_output(['git','show',head+':src/App.tsx']);candidate=(r/'src/App.tsx').read_bytes();assert hashlib.sha256(candidate).hexdigest()=='fc5a7eba1c5a43e4f05b99142c6fc5deb35554b2e71a9b243127ba1020967894'
anchor=b'      onPointerDown={(e) => {\n        drag.current = { x: e.clientX, w: width };'
assert baseline.count(anchor)==1 and baseline.replace(anchor,anchor.replace(b'\n        drag',b'\n        e.preventDefault();\n        drag'))==candidate
assert hashlib.sha256(baseline).hexdigest()=='6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4'
for file in ['src/style.css','plugins/tauri-plugin-notes-ui/macos/toolbar.m']:
 assert subprocess.check_output(['git','show',head+':'+file])==(r/file).read_bytes()
patch=subprocess.check_output(['git','diff','--','src/App.tsx']);assert patch==(a/'product.patch').read_bytes()
p=subprocess.run(['git','diff','--check','--','src/App.tsx'],text=True,capture_output=True);assert p.returncode==0 and p.stdout==p.stderr==''
# Read-only rerun exact real production component harness. No transpilation cache or disk output from harness.
outputs={}
for label,args in [('baseline',['--baseline']),('candidate',[])]:
 argv=['node',str(a/'check-production.mjs'),*args];p=subprocess.run(argv,text=True,capture_output=True,timeout=30)
 dump(label+'-run.json',dict(argv=argv,exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr));assert p.returncode==0 and not p.stderr
 d=json.loads(p.stdout);old=json.loads((a/(label+'-result.json')).read_text());assert d==old
 assert d['actualProductionCallSites']==2 and d['sourceHead']==head and d['sourceSha256']==hashlib.sha256(baseline if label=='baseline' else candidate).hexdigest()
 outputs[label]=d
for old,new in zip(outputs['baseline']['results'],outputs['candidate']['results']):
 assert old['name']==new['name'] and old['pass'] and new['pass'];assert old['downDefaultPrevented'] is False and new['downDefaultPrevented'] is True
 assert {k:v for k,v in old.items() if k!='downDefaultPrevented'}=={k:v for k,v in new.items() if k!='downDefaultPrevented'}
 assert new['capture']==[19,20,21]
 if new['name']=='sidebar-resize':assert new['changedWidths']==[248,213,180,360] and new['endWidths']==[248,180,360]
 else:assert new['name']=='list-resize' and new['changedWidths']==[300,265,220,440] and new['endWidths']==[300,220,440]
assert all(x['exitCode']==0 for x in json.loads((a/'verification.json').read_text())['commands'])
assert '✓ built in' in (a/'pnpm-build.txt').read_text()
for row in inputs:
 p=r/row['path'];assert p.stat().st_size==row['bytes'] and H(p)==row['sha256'],p
dump('inputs-close.json',dict(files=inputs,unchangedCount=len(inputs),allUnchanged=True))
dump('result.json',dict(verdict='SOURCE-READY_NO_BLOCKER',sourceHead=head,candidateAppSha256=H(r/'src/App.tsx'),authorFilesVerified=9,authorManifestSha256=H(a/'output-manifest.json'),authorAggregateDeclared=m['aggregate'],authorAggregateFormula='Not stated in manifest; per-file identities and exact set independently verified. No inferred aggregate recipe claimed.',inputs=len(inputs),singleInsertionExact=True,unchangedControlFiles=['src/style.css','plugins/tauri-plugin-notes-ui/macos/toolbar.m'],independentActualProductionReplay=['baseline sidebar','baseline list','candidate sidebar','candidate list'],replayExactToAuthor=True,limits=['React server render + controlled Node cancelable Event/capture/settings, no browser default text selection gesture.','Full production ResizeHandle function and both real App JSX sites executed, but no complete live App rerender/editor selection/IME verification.','Existing cancel/lost-capture/multipointer semantics unchanged and not expanded.','Root exact-package Computer Use still required for no new selected DOM text and preservation of prior editor selection.','No GUI/ADB/platform build/shared cache/product edit/stage/commit; author frontend build record inspected, not repeated.']))
print(json.dumps(dict(verdict='SOURCE-READY_NO_BLOCKER',authorFiles=9,inputs=len(inputs),independentComponentReplays=4,candidateAppSha256=H(r/'src/App.tsx')),ensure_ascii=False))
