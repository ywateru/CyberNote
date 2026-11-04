from pathlib import Path
import datetime,hashlib,json,shutil,subprocess
r=Path.cwd();o=Path(__file__).resolve().parent
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,x):
 if p.exists():raise RuntimeError('Preserve existing evidence: '+str(p))
 p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def ident(p):return {'path':str(p.relative_to(r)),'bytes':p.stat().st_size,'sha256':h(p)}
assert not (o/'output-manifest.json').exists()
assert shutil.disk_usage(r).free>=2*1024**3
expected={'plugins/tauri-plugin-notes-ui/macos/toolbar.m':'be75271f92f9e3d58476962d1a06d7c4a4285c68d5bafa1c9e2d25151a2825c0','src/style.css':'eeff3cc31a139fe48543ed9f7daf013c470fee5d703968acdb61d5c583f7262d','src/App.tsx':'6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4'}
for p,want in expected.items():assert h(r/p)==want,p
assert h(o/'product.patch')=='0d8fc16f581cc21d6da4ef24e14cef72186cf28655bd1020c4faca021f36c87e'
for name in ['strict-objc','controller13','frontend-build-final','production-layout02','webkit-render05-final','final-raster-analysis']:
 assert json.loads((o/(name+'.json')).read_text())['exitCode']==0,name
assert json.loads((o/'webkit05/result.json').read_text())['status']=='pass'
assert json.loads((o/'webkit05/measurements.json').read_text())['threshold160SameBboxAsOriginal']
subprocess.run(['git','diff','--check','--',*list(expected)[:2]],check=True)
opened=json.loads((o/'inputs-open.json').read_text());changes=[]
for row in opened['trackedInputs']:
 p=r/row['path'];actual=h(p) if p.is_file() else None
 if actual!=row['sha256']:changes.append({'path':row['path'],'beforeSha256':row['sha256'],'afterSha256':actual})
assert {x['path'] for x in changes if not x['path'].startswith('docs/')}==set(expected)-{'src/App.tsx'}
shutil.copyfile(o/'source-audit.json',o/'source-audit-initial15.json')
(o/'source-audit.json').unlink()
dump(o/'source-audit.json',{'headNow':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'trackedChangesSinceOpen':changes,'productPathsExact':True,'expectedFinalProducts':expected,'rootContractChanges':'root explicitly approved final15.25/top9.5 and edited task/UI docs while author worked','statusNow':subprocess.check_output(['git','status','--short'],text=True),'freeBytes':shutil.disk_usage(r).free})
paths=[r/p for p in expected]+[r/'docs/plan/tasks/app-001-list-heading07.md',r/'docs/ui/macos.md',r/'docs/research/mac-list-heading-readiness07/analysis.md',r/'docs/research/mac-list-heading-readiness07/measurements.json',r/'docs/research/mac-list-heading-readiness07/input-manifest.json',r/'docs/research/mac-list-heading-readiness07/output-manifest.json',r/'docs/verification/mac-sidebar-optical06-runtime-01/17-original-visible228.cua-image']
dump(o/'inputs-final.json',{'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Final products, root approved contract, fixed readonly research and original reference','files':[ident(p) for p in paths]})
rows=[]
for p in sorted(o.rglob('*')):
 if p.is_file() and p.name!='output-manifest.json':rows.append({'path':str(p.relative_to(o)),'bytes':p.stat().st_size,'sha256':h(p)})
aggregate=hashlib.sha256(''.join(f"{x['path']}\t{x['bytes']}\t{x['sha256']}\n" for x in rows).encode()).hexdigest()
dump(o/'output-manifest.json',{'sealedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':rows,'aggregateAlgorithm':'path-sorted relative path TAB bytes TAB sha256 NEWLINE, UTF-8, sha256','aggregateSha256':aggregate,'excludes':['output-manifest.json']})
print(json.dumps({'files':len(rows),'bytes':sum(x['bytes'] for x in rows),'aggregateSha256':aggregate,'manifestSha256':h(o/'output-manifest.json'),'readmeSha256':h(o/'README.md'),'productHashes':expected,'patchSha256':h(o/'product.patch')},ensure_ascii=False,indent=2))
