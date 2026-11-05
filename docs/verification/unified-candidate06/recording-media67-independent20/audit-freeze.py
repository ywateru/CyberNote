#!/usr/bin/env python3
"""Independent read-only Mac20 freeze/source/input audit. Does not build/run apps."""
import datetime,hashlib,json,os,subprocess,zipfile
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone');out=Path(__file__).resolve().parent
freeze_path=root/'docs/verification/unified-candidate06/mac-recording-media-build20/input-freeze.json';prep=root/'docs/verification/unified-candidate06/recording-media67-preparation'
source='b455c14093b7a717a0a6e810b30d19301296e448';expected_hash='051ad9000605d9883596090dec6618d1121d99f24379b138c145771e3df97da2'
hash=lambda b:hashlib.sha256(b).hexdigest()
def ident(p):
 p=Path(p);d=hashlib.sha256()
 with p.open('rb')as stream:
  for b in iter(lambda:stream.read(1024*1024),b''):d.update(b)
 return {'bytes':p.stat().st_size,'sha256':d.hexdigest()}
def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
def load(p):return json.loads(Path(p).read_text())
def aggregate(rows):return hash(''.join(r['sha256']+'  '+r['path']+'\n'for r in rows).encode())
checks=[]
def check(label,condition):
 assert condition,label;checks.append(label)
def rows_at(base,rows):
 result=[]
 for row in rows:
  p=base/row['path'];v={'path':row['path'],**ident(p)}
  if p.is_symlink():v['symlinkTarget']=os.readlink(p)
  assert v==row,(str(p),row,v)
  result.append(v)
 return result
started=datetime.datetime.now(datetime.timezone.utc).isoformat();head=git('rev-parse','HEAD');status=git('status','--porcelain','--untracked-files=no');f=load(freeze_path);a=load(prep/'mac-authorization.json');plan=load(prep/'input-plan.json');cap=load(prep/'command-capability-audit.json');old_auth=load(root/'docs/verification/unified-candidate06/recording-sidebar66-preparation/mac-authorization.json');old_freeze=load(root/'docs/verification/unified-candidate06/mac-recording-sidebar-build19/input-freeze.json')
check('exact freeze350994bytes/SHA',ident(freeze_path)=={'bytes':350994,'sha256':expected_hash});check('rootHEAD sourceb455c140',head==source==f['head']==a['sourceHead']==plan['sourceHead']==cap['sourceHead']);check('tracked root/index clean',status=='')
check('nine-field authorization exact',set(a)=={'schema','stage','root','sourceHead','productAggregate','productPaths','inputPaths','runDirectory','artifactDirectory'}and a==f['authorization']and a['root']==str(root)and a['stage']=='mac'and a['schema']==1)
for label,paths,rows in [('product',a['productPaths'],f['productFiles']),('input',a['inputPaths'],f['files'])]:
 check(label+' paths sorted unique',paths==sorted(set(paths))and paths==[r['path']for r in rows]);check(label+' paths safe',all(not Path(p).is_absolute()and '..'not in Path(p).parts for p in paths));rows_at(root,rows);checks.append(label+' every current byte/hash and symlink target match')
check('361products382inputs',len(f['productFiles'])==361 and len(f['files'])==382);check('product aggregate exact',aggregate(f['productFiles'])==f['productAggregate']==a['productAggregate']==plan['productAggregate']=='c12780c3f0049592fa035e6c64f39a3d9df40b054249ee7194abc49a205f4c3d');check('input aggregate exact',aggregate(f['files'])==f['aggregate']==plan['inputAggregate']=='7ba3010f9b9fdc0f2f72aebc391d0a4bcdbf9f45575b6396e70a04cfe63ddf00');check('plan exact rows',f['productFiles']==plan['productFiles']and f['files']==plan['inputFiles'])
oldprod=set(old_auth['productPaths']);oldinputs=set(old_auth['inputPaths']);prod=set(a['productPaths']);inputs=set(a['inputPaths']);deleted={'src-tauri/capabilities/macos-recording-access.json','src-tauri/capabilities/recording-window.json'}
check('full Mac19 product/input union retained, historical2deletions absent',not(oldprod-prod) and not(oldinputs-inputs) and all(not(root/p).exists() for p in deleted));check('deleted2notin newauthorization',not(deleted&prod)and not(deleted&inputs));check('3added paths exact plan',sorted(prod-oldprod)==plan['addedProductPaths']and sorted(inputs-oldinputs)==plan['addedInputPaths']and len(prod-oldprod)==3)
oldrows={r['path']:r for r in old_freeze['files']};inputrows={r['path']:r for r in f['files']};oldonly=oldinputs-oldprod
check('21historicalinputonlyunchanged',len(oldonly)==21 and inputs-prod==oldonly and all(oldrows[p]==inputrows[p]for p in oldonly))
tracked=git('ls-tree','-r','--name-only',source).splitlines();rules=plan['construction'];selected={p for p in tracked if any(p.startswith(prefix)for prefix in rules['prefixes'])or p in rules['names']};plugins={str(p.relative_to(root))for p in(root/'plugins').rglob('*')if p.is_file()and not(set(p.relative_to(root/'plugins').parts)&set(rules['pluginExclusions']))};computed=oldprod|selected|plugins|set(plan['explicitProductExceptions']);check('independently rebuilt complete product set',prod==computed);check('all77plugin files frozen',len(plugins)==77 and plugins<=prod)
trackedset=set(tracked);trackedProduct=sorted(prod&trackedset)
for p in trackedProduct:
 b=subprocess.check_output(['git','show',source+':'+p],cwd=root);assert ident(root/p)=={'bytes':len(b),'sha256':hash(b)},p
checks.append('all'+str(len(trackedProduct))+'tracked product bytes match sourceGitobjects');tested=load(root/'docs/verification/mac-recording-media67-independent/hook-attempt04/source-binding.json');
for path,digest in tested['files'].items():assert ident(root/path)['sha256']==digest,path
checks.append('all271independently-tested product inputs still identical to 7243c649')
changed=sorted(path for path in oldinputs if oldrows[path]!=inputrows[path]);check('only hook modified among complete Mac19 inputs',changed==plan['changedExistingInputPathsFromMac19']==['src/use-attachment-media.ts'])
check('hook bytes equal exact reviewed author7243',subprocess.check_output(['git','show','7243c649862181d35aa94063149e30653593d7dc:src/use-attachment-media.ts'],cwd=root)==(root/'src/use-attachment-media.ts').read_bytes())
check('exact3script additions',set(prod-oldprod)=={'scripts/check-mac-recording-media67-final-independent.mjs','scripts/check-mac-recording-media67-independent.mjs','scripts/check-recording-media67.mjs'})
check('baseline authorization identity',ident(plan['baselineAuthorization']['path'])=={k:plan['baselineAuthorization'][k] for k in ['bytes','sha256']})
for row in f['tools']:check('build tool '+row['path'],ident(root/'docs/verification/unified-candidate06/preparation'/row['path'])=={k:row[k]for k in ['bytes','sha256']})
check('5toolversionobservationssuccessful',len(f['toolVersions'])==5 and all(r['exit']==0 for r in f['toolVersions']));check('effective environment offline/jobs2 exact',f['effectiveBuildEnvironment']=={'ANDROID_HOME':'/Users/water/Library/Android/sdk','NDK_HOME':'/Users/water/Library/Android/sdk/ndk/27.2.12479018','JAVA_HOME':'/opt/zerobrew/opt/openjdk@17','GRADLE_USER_HOME':'/private/tmp/notes-scan-gradle-home','CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'2'})
# Only read explicitly listed supplemental inputs; never invoke their executables.
s=f['supplementalInputs'];overlay=Path('/private/tmp/notes-lifecycle-cache-overlay-01/overlay-ro');rows_at(overlay,s['overlayFiles']);check('overlay2identityaggregate',len(s['overlayFiles'])==2 and aggregate(s['overlayFiles'])==s['overlayAggregate']);dist=Path(s['distributionPath']);check('distribution symlink target unchanged',str(dist.resolve())==s['distributionResolved']);distribution=[]
for row in s['distributionFiles']:
 p=dist/row['path']
 if row['type']=='symlink':v={'path':row['path'],'type':'symlink','target':os.readlink(p),'sha256':hash(os.readlink(p).encode())}
 else:v={'path':row['path'],**ident(p),'type':'file','mode':p.stat().st_mode&0o777}
 assert row==v,(row,v);distribution.append(row)
check('distribution701rowsmatch',len(distribution)==701);ok=Path(s['okFile']['path']);check('distributioncompletionmarker',ident(ok)=={k:s['okFile'][k]for k in ['bytes','sha256']}and str(ok.resolve())==s['okResolved'])
model_count=0
for row in f['ocrCache']:
 check('OCRarchive '+Path(row['path']).name,ident(row['path'])=={k:row[k]for k in ['bytes','sha256']})
 with zipfile.ZipFile(row['path'])as z:
  for model in row['models']:
   v=z.getinfo(model['path']);assert len(z.read(v))==model['bytes']and v.compress_size==model['compressedBytes']and hash(z.read(v))==model['sha256'];model_count+=1
checks.append('all'+str(model_count)+'frozenOCRmodel entries match')
capPaths=sorted(str(p.relative_to(root))for p in(root/'src-tauri/capabilities').glob('*.json'));check('all3capabilities captured',capPaths==[r['path']for r in cap['capabilitiesAfter']]and len(capPaths)==3)
for row in cap['capabilitiesAfter']:check('capability '+row['path'],ident(root/row['path'])=={k:row[k]for k in ['bytes','sha256']}and load(root/row['path'])==row['content'])
micro=load(root/'src-tauri/capabilities/macos-notes-ui.json');check('existing main/note microphone preflight permission present',micro['windows']==['main','note-*']and micro['platforms']==['macOS']and'notes-ui:allow-recording-access'in micro['permissions']);check('main/note permission byteequal Mac19',subprocess.check_output(['git','show',old_auth['sourceHead']+':src-tauri/capabilities/macos-notes-ui.json'],cwd=root)==(root/'src-tauri/capabilities/macos-notes-ui.json').read_bytes());check('no added capability grants',cap['addedPermissionGrants']==[])
check('complete3capability set byteequal Mac19',cap['capabilitiesBefore']==cap['capabilitiesAfter'] and cap['capabilitySetByteIdentical'])
check('complete handler blocks unchanged',cap['handlerBlocksBefore']==cap['handlerBlocksAfter'] and cap['handlerSourceByteIdentical'])
check('no registered recording command additions/removals',not cap['addedRegisteredRecordingCommands'] and not cap['removedRegisteredRecordingCommands'] and len(cap['retainedRegisteredRecordingCommands'])==7)
check('whole native handler/guard source byteequal Mac19',all(subprocess.check_output(['git','show',old_auth['sourceHead']+':'+path],cwd=root)==(root/path).read_bytes() for path in ['src-tauri/src/lib.rs','src-tauri/src/recording_window.rs']) and cap['nativeGuardSourceByteIdentical'])
for row in cap['microphoneGrant']['pluginPermissionResourcesUnchanged']:
 check('plugin permission resource '+row['path'],ident(root/row['path'])=={k:row[k] for k in ['bytes','sha256']} and subprocess.check_output(['git','show',old_auth['sourceHead']+':'+row['path']],cwd=root)==(root/row['path']).read_bytes())
for row in cap['reviewEvidence']:check('frozen review evidence '+row['path'],ident(root/row['path'])=={k:row[k] for k in ['bytes','sha256']})
check('media audit exact reviewed hook source',cap['mediaChange']['source']==(root/'src/use-attachment-media.ts').read_text() and ident(root/'src/use-attachment-media.ts')=={k:cap['mediaChange']['row'][k] for k in ['bytes','sha256']})
for row in cap['recordingInvokeSites']:
 lines=(root/row['path']).read_text().splitlines();line='\n'.join(lines[row['line']-1:row['line']+2]);assert row['command'] in line,(row,line)
checks.append('all11recording invoke sites current exact invocation-start lines')
for row in cap['nativeGuardReferences']:
 line=(root/row['path']).read_text().splitlines()[row['line']-1];assert row['function'] in line,(row,line)
checks.append('all15native guard functions current exact lines')
endhead=git('rev-parse','HEAD');check('HEAD unchanged during audit',head==endhead);check('tracked bytes/index remain clean',git('status','--porcelain','--untracked-files=no')=='');result={'status':'pass-freeze-only','started':started,'finished':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':source,'freeze':{'path':str(freeze_path),**ident(freeze_path)},'authorization':{'path':str(prep/'mac-authorization.json'),**ident(prep/'mac-authorization.json')},'counts':{'product':len(prod),'input':len(inputs),'trackedProduct':len(trackedProduct),'productNotGitTracked':len(prod-trackedset),'historicalInputOnly':len(oldonly),'pluginFiles':len(plugins),'testedSourceFiles':len(tested['files']),'toolFiles':len(f['tools']),'distributionFiles':len(distribution),'ocrModels':model_count},'productAggregate':f['productAggregate'],'inputAggregate':f['aggregate'],'checks':checks,'productNotGitTracked':sorted(prod-trackedset),'historicalInputOnly':sorted(oldonly),'limits':['Read-only exact freeze/source/current bytes and input identity audit. No compile, new test, signing, GUI, process or device action.','No OS/SDK/transitive reproducibility claim. Tool version observations are frozen records, not newly rerun.','Mac20 build/collection pending; no package identity, runtime/audio or pixel acceptance.','Old Mac18 process absent with exit cause/time unknown; no preservation/recovery claim. Android untouched. No actual audio read/copy/export/transcription or app/process action.']};(out/'freeze-readonly-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k in ['status','source','counts','productAggregate','inputAggregate']},indent=2))
