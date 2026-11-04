"""Resume only final preservation and owned-group checks after ps permission denial; no package checks repeated."""
from pathlib import Path
import runpy,json,subprocess,datetime,ast
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');OUT=ROOT/'docs/verification/unified-candidate06/android-folder-visual-independent07'
n=runpy.run_path(str(OUT/'verify.py'),run_name='independent_resume_definition');load=n['load'];ident=n['ident'];relident=n['relident'];aggregate=n['aggregate'];BASE=n['BASE'];RUN=n['RUN'];ATT=n['ATT'];ART=n['ART']
checks=load(OUT/'attempt01-failure.json')['checks']
assert len(checks)==387 and all(r['passed']for r in checks)
def check(name,ok):
 checks.append({'name':name,'passed':bool(ok)})
 if not ok:raise AssertionError(name)
f=load(RUN/'input-freeze.json');b=load(ATT/'result.json');c=load(ATT/'collection/result.json');initial=load(OUT/'input-manifest.json')
argv=['/bin/ps','-axo','pid=,pgid=,comm='];p=subprocess.run(argv,capture_output=True,text=True,timeout=15)
check('fresh owned group process query succeeded',p.returncode==0)
groups={b['ownedProcessGroup']}|{r['ownedProcessGroup']for r in c['commands']}
remaining=[r.strip()for r in p.stdout.splitlines()if len(r.split(None,2))>=2 and int(r.split(None,2)[1])in groups]
check('fresh no recorded build or collector groups remain',not remaining)
(OUT/'fresh-owned-group-check.json').write_text(json.dumps({'argv':argv,'exitCode':p.returncode,'checkedOwnedGroupIds':sorted(groups),'remainingOwnedGroupMembers':remaining,'stderr':p.stderr,'scope':'Only matching owned process groups retained; other process rows discarded.'},indent=2)+'\n')
check('all345 original protected files unchanged',len(initial['files'])==345 and all(relident(ROOT/r['path'])==r for r in initial['files']))
current=[]
import os
for r in f['files']:
 p=ROOT/r['path'];v=relident(p)
 if p.is_symlink():v['symlinkTarget']=os.readlink(p)
 current.append(v)
check('all322 frozen current inputs unchanged at close',current==f['files']and aggregate(current)==n['INPUT'])
(OUT/'input-close.json').write_text(json.dumps({'protectedFileCount':345,'protectedChanged':[],'currentInputCount':322,'currentInputsChanged':[],'checkedOwnedGroupIds':sorted(groups),'remainingOwnedGroupMembers':remaining},indent=2)+'\n')
prior=BASE/'android-smart-u-independent05/verify.py';scope=n.copy()
for node in ast.parse(prior.read_text()).body:
 if isinstance(node,ast.FunctionDef)and node.name in ['read_lp','sequences','v2_certificates']:exec(compile(ast.Module(body=[node],type_ignores=[]),str(prior),'exec'),scope)
# Pure certificate parse reconstructs the detail already independently checked by the completed package gate.
v2=scope['v2_certificates'](ART/'android-original.apk');models=c['ocrModels'];rows=c['allZipEntries']
result={'status':'pass','stop':True,'conclusion':'PASS: accurate Android07 source, content, isolation, offline-model and signature gates','sourceHead':n['SOURCE'],'freezeSha256':n['FREEZE'],'productFiles':303,'inputFiles':322,'productAggregate':n['PRODUCT'],'inputAggregate':n['INPUT'],'checks':checks,'assertions':len(checks),'failed':0,'protectedFiles':345,'apk':ident(ART/'android-original.apk'),'zipEntryCount':len(rows),'zipEntryAggregate':aggregate(rows),'elfLibraries':[r['path']for r in rows if r['path'].startswith('lib/')and r['path'].endswith('.so')],'models':models,'modelCount':len(models),'modelBytes':sum(r['bytes']for r in models),'v2CertificateParse':v2,'freshSignatureCheck':ident(OUT/'fresh-signature-check.json'),'freshOwnedGroupCheck':ident(OUT/'fresh-owned-group-check.json'),'temporaryInitAbsent':True,'priorInode':b['outputIsolation']['outputs'][0]['before']['inode'],'newInode':b['generatedOutputs'][0]['snapshot']['inode'],'fixtureContinuation':'attempt01 completed387 package assertions and fresh signature; final ps query denied by host. Narrow authorized process query and initial/final input preservation completed in finish.py, without repeating package tests or mutating package. Original failure preserved.','limits':['Source identity supplied by root, exact authorization/freeze/snapshots/current322 hashes; no independent Git object proof.','No build, sign, launch, GUI/ADB, install, DB, download or shared-cache operations.','Frozen model/cache records compared; shared cache not re-probed.','Compressed embedded frontend not independently decoded/rebuilt.','Package certificate compatibility does not prove device upgrade/runtime/native selection/persistence/pixel behavior.'],'sharedTargetAndCache':'not acquired; no build/cache use; resources released'}
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'pass','assertions':len(checks),'protectedFiles':345,'result':ident(OUT/'result.json')}))
