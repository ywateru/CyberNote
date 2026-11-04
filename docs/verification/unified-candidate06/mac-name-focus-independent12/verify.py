"""Independent exact Mac12 review. No Git, build, signing, launch or cache mutation."""
from pathlib import Path
import datetime, hashlib, json, os, re, stat, struct, subprocess, time, zipfile

ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
BASE=ROOT/'docs/verification/unified-candidate06'
RUN=BASE/'mac-name-focus-build12'; ATT=RUN/'mac-attempt01'
ART=ROOT/'artifacts/unified-candidate06/mac-name-focus-build12/mac-attempt01'
OUT=BASE/'mac-name-focus-independent12'
SOURCE='d7423070207684c5a2bb584281350723c44e9d9c'
PRODUCT='7c83817061c438c388c9c52e8e0207ffb415a0847f9d0a320c59eac5a63363e5'
INPUT='ca8f00a42d641cd2693ce43b4794fc03e3c9315a16c7faccdf5d9c59e6f0241f'
FREEZE='529600e375e84df860a47cd6873a7aefd7faf4086ae4c5609c0b5010fea5ab9a'
checks=[]
def digest(b):return hashlib.sha256(b).hexdigest()
def hash_stream(stream):
 h=hashlib.sha256()
 for b in iter(lambda:stream.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def ident(p):
 p=Path(p)
 with p.open('rb')as s:h=hash_stream(s)
 return {'path':str(p),'bytes':p.stat().st_size,'sha256':h}
def relident(p):return {**ident(p),'path':str(p.relative_to(ROOT))}
def load(p):return json.loads(p.read_text())
def record(name,value):
 with (OUT/name).open('x')as s:s.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def check(name,ok):
 checks.append({'name':name,'passed':bool(ok)})
 if not ok:raise AssertionError(name)
def aggregate(rows):return digest(''.join(r['sha256']+'  '+r['path']+'\n'for r in rows).encode())
def tree(p):
 rows=[]
 for q in sorted(p.rglob('*')):
  mode=q.lstat().st_mode
  check('regular entry '+str(q.relative_to(p)),stat.S_ISDIR(mode)or stat.S_ISREG(mode))
  if q.is_file():rows.append({**ident(q),'path':str(q.relative_to(p)),'type':'file','mode':stat.S_IMODE(mode)})
 return rows
def snapshot(p):
 s=p.stat();return {'kind':'directory','device':s.st_dev,'inode':s.st_ino,'mode':stat.S_IMODE(s.st_mode),'directories':[{'path':str(q.relative_to(p)),'mode':stat.S_IMODE(q.stat().st_mode)}for q in sorted(p.rglob('*'))if q.is_dir()],'files':tree(p)}
def fresh(argv,expected):
 start=time.monotonic();r=subprocess.run(argv,cwd=ROOT,capture_output=True,text=True,timeout=30)
 v={'argv':argv,'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-start,'stdout':r.stdout,'stderr':r.stderr}
 signatureCalls.append(v);check('fresh signature expected exit '+str(argv),r.returncode==expected);return v
def macho(a,b):
 check('thin arm64 MachO',struct.unpack_from('<II',a)==struct.unpack_from('<II',b)==(0xfeedfacf,0x100000c))
 off=32;sig=[];link=[]
 for i in range(struct.unpack_from('<I',a,16)[0]):
  cmd,size=struct.unpack_from('<II',a,off);check('same load command structure '+str(i),struct.unpack_from('<II',b,off)==(cmd,size)and size>=8)
  if cmd==0x1d:sig.append(off)
  if cmd==0x19 and a[off+8:off+24].rstrip(b'\0')==b'__LINKEDIT':link.append(off)
  off+=size
 check('one signature and LINKEDIT',len(sig)==len(link)==1)
 so=sig[0];lo=link[0];start1,size1=struct.unpack_from('<II',a,so+8);start2,size2=struct.unpack_from('<II',b,so+8)
 check('same signature tail start',start1==start2 and start1+size1==len(a)and start2+size2==len(b))
 check('LINKEDIT tail ends at signature',all(struct.unpack_from('<Q',v,lo+40)[0]+struct.unpack_from('<Q',v,lo+48)[0]==len(v)for v in [a,b]))
 x=bytearray(a[:start1]);y=bytearray(b[:start2]);allowed=[(lo+32,8),(lo+48,8),(so+12,4)]
 for offset,size in allowed:x[offset:offset+size]=b'\0'*size;y[offset:offset+size]=b'\0'*size
 check('entire nonsignature payload equal with only size fields normalized',x==y)
 return {'signatureOffset':start1,'originalSignatureBytes':size1,'sealedSignatureBytes':size2,'normalizedPayloadSHA256':digest(x),'allowedSizeFields':allowed}

signatureCalls=[]
def main():
 f=load(RUN/'input-freeze.json');b=load(ATT/'result.json');c=load(ATT/'collection/result.json');a=load(BASE/'name-mobile29-preparation/mac-authorization.json')
 check('exact authorization SHA',ident(BASE/'name-mobile29-preparation/mac-authorization.json')['sha256']=='965a2f0f485c3a9594359775bbe394f9e51c2abdfc23c37c469c29faf9712d95')
 check('exact freeze SHA',ident(RUN/'input-freeze.json')['sha256']==FREEZE)
 check('exact build result SHA',ident(ATT/'result.json')['sha256']=='47c289291dd359d94390c9eb049ab506db215325a525d3b4907ca966bea3be11')
 check('exact collection result SHA',ident(ATT/'collection/result.json')['sha256']=='ad229e00bf49b87788c76d3225be7d58017ff51953df8121999a43ce0b802a56')
 check('exact nine-field authorization',len(a)==9 and f['authorization']==a and a['stage']=='mac'and a['root']==str(ROOT)and a['sourceHead']==SOURCE and a['productAggregate']==PRODUCT and a['runDirectory']==str(RUN)and a['artifactDirectory']==str(ART.parent)and a['productPaths']==[r['path']for r in f['productFiles']]and a['inputPaths']==[r['path']for r in f['files']])
 check('source identity chain',f['head']==SOURCE and f['stage']=='mac'and f['productAggregate']==PRODUCT and f['aggregate']==INPUT and all(x['expectedHead']==SOURCE and x['stage']=='mac'and x['freezeSha256']==FREEZE and x['productAggregate']==PRODUCT and x['sourceAggregate']==INPUT for x in [b,c]))
 summary=load(RUN/'freeze-summary.json');review=load(RUN/'root-freeze-review.json')
 check('root freeze review',review['freezeSha256']==FREEZE and review['sourceHead']==SOURCE and review['productAggregate']==PRODUCT and review['inputAggregate']==INPUT and review['productFiles']==303 and review['inputFiles']==322 and review['mismatches']==[]and all(review['checks'].values()))
 check('freeze summary',summary['sourceHead']==SOURCE and summary['freeze']==ident(RUN/'input-freeze.json')and summary['productAggregate']==PRODUCT and summary['inputAggregate']==INPUT)
 check('ordered freeze build collect and honest postcollect root record',summary['at']<b['startedAt']<b['endedAt']<=c['startedAt']<c['endedAt']<=review['at'] and 'before build' in review['recordTiming'] and 'after collect' in review['recordTiming'])
 check('build collect exact linkage',c['buildResult']==ident(ATT/'result.json')and c['buildNonce']==b['nonce']and re.fullmatch('[0-9a-f]{32}',b['nonce'])and b['command']==['pnpm','mac:build']and b['attempt']==str(ATT)and c['artifactDirectory']==str(ART))
 check('successful bounded build',b['exitCode']==0 and b['ownedGroupStopped']and not b['remainingOwnedGroupMembers']and b['supplementalInputsUnchanged']and all(b['inputComparisons'].values())and b['deadlineSeconds']==600 and b['elapsedSeconds']<600 and b['minimumFreeBytes']>=2*1024**3 and not any(k in b for k in ['error','invalidated','cleanupError','stopReason','groupCleanupError']))
 check('collector ready all comparisons',c['ready']and c['supplementalInputsUnchangedDuringCollection']and all(c['inputComparisons'].values())and not any(k in c for k in ['error','invalidated','cleanupError','stopReason','groupCleanupError']))
 for name in ['inputs-before.json','inputs-after.json','collection/inputs-before-collection.json','collection/inputs-after-collection.json']:
  s=load(ATT/name);check('full frozen snapshot '+name,all(s[k]==v for k,v in f.items()if k!='at'))
 current=[]
 for r in f['files']:
  p=ROOT/r['path'];value=relident(p)
  if p.is_symlink():value['symlinkTarget']=os.readlink(p)
  check('current frozen input '+r['path'],value==r);current.append(value)
 check('all322 current files aggregate',len(current)==322 and aggregate(current)==INPUT)
 cmap={r['path']:r for r in current};check('all303 product files aggregate',len(f['productFiles'])==303 and all(cmap[r['path']]==r for r in f['productFiles'])and aggregate(f['productFiles'])==PRODUCT)
 expected={'src/App.tsx':'d7b20f13b2ee076ab2708c0e837be60f8b2387a2bdeccc6d2fa8ae9e06526911','src/types.ts':'0bba2d1b9c0f46388d4a8a7b643e826517faf0e1b4018d947526b737c427a159','src/sidebar-preference.ts':'02efda1c3dd671475fd4c0c229b6aa242c0ec1485253ad2a0371721cb2c4a13d','src/smart-folders.css':'cdbfde60942488be5e9b4002924162d4d21850a1d71fc352176e86cb122a160c','src/smart-draft.ts':'a97480a10d85fcb50091987af187d0132608528349748f6488715988004abca6','src/style.css':'5a2b7d26059476f68ebc88319467acd339bee3acf299e6f20007459eb0b35c25','src/MobileFolderIcons.tsx':'bcfb1e37dc95761342ec3c4669c3444a432c7236c90ea239160f5b9d4283395f','src/SmartFolderForm.tsx':'b2e4d60e5cbe0265b1bca7a67cd5c2d7412b3697e34152d870c0d0344770c15c'}
 check('reviewed26/28 and preserved products exact',all(cmap[p]['sha256']==v for p,v in expected.items()))
 for r in f['tools']:check('exact canonical tool '+r['path'],{**ident(BASE/'preparation'/r['path']),'path':r['path']}==r)
 check('seven canonical tools',len(f['tools'])==7)
 check('offline jobs2 actual environment',f['effectiveBuildEnvironment']==b['explicitEnvironmentOverrides']and b['explicitEnvironmentOverrides']['CARGO_NET_OFFLINE']=='true'and b['explicitEnvironmentOverrides']['CARGO_BUILD_JOBS']=='2')
 # Compare frozen dependency facts across snapshots, without walking any shared cache.
 modelRows=[m for aar in f['ocrCache']for m in aar['models']]
 check('25 unique frozen model member records',len(modelRows)==len({m['path']for m in modelRows})==25 and sum(m['bytes']for m in modelRows)==2490310)
 check('supplemental overlay aggregate',aggregate(f['supplementalInputs']['overlayFiles'])==f['supplementalInputs']['overlayAggregate'])
 log=(ATT/'build.txt').read_text();check('raw build no download or reused configuration cache',not re.search(r'\bDownloading\b|reusing\s+(?:the\s+)?configuration cache|configuration cache(?: entry)?\s+(?:was\s+)?reused',log,re.I))
 check('actual production frontend and mac build log','> tsc -b && vite build'in log and 'Finished 1 bundle at:'in log and 'Compiling notes-clone v0.1.0'in log and 'index-BHqD24ML.css'in log and 'index-DLxI8T6h.js'in log)
 check('canonical isolated output evidence',load(ATT/'output-isolation.json')==b['outputIsolation']and load(ATT/'generated-outputs.json')==b['generatedOutputs']and b['outputIsolation']['policy']=='atomic-rename-final-output-and-dist'and b['outputIsolation']['sourcePathsAbsentBeforeCommand'])
 for r in b['outputIsolation']['outputs']:check('preserved prior full inode mode file identity '+r['name'],snapshot(Path(r['preserved']))==r['before'])
 preservedDist=next(r for r in load(BASE/'android-folder-visual-build07/android-attempt01/output-isolation.json')['outputs']if r['name']=='dist')
 check('Android07 atomically preserves exact Mac12 dist snapshot',preservedDist['before']==b['generatedOutputs'][1]['snapshot']and snapshot(Path(preservedDist['preserved']))==preservedDist['before'])
 for r in b['generatedOutputs']:
  actual=Path(preservedDist['preserved'])if r['source']==str(ROOT/'dist')else Path(r['source'])
  check('actual generated full identity '+r['source'],snapshot(actual)==r['snapshot'])
 oldbuild=load(BASE/'mac-ordinary-sidebar-build11/mac-attempt01/result.json')
 check('prior Mac11 app precisely preserved',b['outputIsolation']['outputs'][0]['before']==oldbuild['generatedOutputs'][0]['snapshot'])
 check('new bundle inode distinct',b['outputIsolation']['outputs'][0]['before']['inode']!=b['generatedOutputs'][0]['snapshot']['inode'])
 check('current dist matches complete build generated output and collection snapshots',tree(Path(preservedDist['preserved']))==b['dist']==b['generatedOutputs'][1]['snapshot']['files']and all(load(ATT/name)['files']==f['files']for name in ['collection/inputs-before-collection.json','collection/inputs-after-collection.json']))
 bundles={};archives={}
 for name in ['original','sealed']:
  app=ART/f'mac-{name}.app';rows=tree(app);bundles[name]=rows
  check('complete '+name+' bundle inventory',rows==c[name]['bundleFiles']and aggregate(rows)==c[name]['bundleAggregate'])
  check('exact '+name+' executable',ident(app/'Contents/MacOS/notes-clone')==c[name]['executable'])
  archive=ART/f'mac-{name}.zip';archives[name]=ident(archive);check('exact '+name+' ZIP',archives[name]==c[name]['archive'])
  with zipfile.ZipFile(archive)as z:
   items=z.infolist();check(name+' ZIP unique names',len(items)==len({i.filename for i in items}));payload={}
   for item in items:
    data=z.read(item)
    if item.is_dir()or item.filename.startswith('__MACOSX/'):continue
    check(name+' ZIP bundle root',item.filename.startswith(app.name+'/')and'..'not in Path(item.filename).parts)
    payload[item.filename[len(app.name)+1:]]={'bytes':len(data),'sha256':digest(data),'mode':stat.S_IMODE(item.external_attr>>16)}
   check(name+' exact ZIP content CRC hashes and modes',payload=={r['path']:{k:r[k]for k in ['bytes','sha256','mode']}for r in rows})
 check('original expected executable and ZIP',c['original']['executable']['sha256']=='085d1fc6a9dfd324523c0ea7bff28446ad45de85fcc956b8f8b382822cb97a68'and archives['original']['sha256']=='9969f0bb1d92699dbbb8cc0b09e981b9c12811bfa10bd8030d0f66d080c5da2a')
 check('sealed expected executable',c['sealed']['executable']['sha256']=='2549c676034aad46f9dd3189c9023549f829a8a53045b821491856050682e9f2')
 check('sealed expected ZIP',archives['sealed']['sha256']=='0eed58ebbd774e9043c7e05638054e15b6ef02ff17de2c9e4c29293dd1030601')
 check('sealed expected bundle aggregate',aggregate(bundles['sealed'])=='a991365719577ca9c0218fbd49af2d5351094f193689d9781988e6f1f794f3cb')
 check('original equals actual newly generated output',bundles['original']==b['buildOutputIdentity']['bundleFiles']==b['generatedOutputs'][0]['snapshot']['files']and c['preservedOriginalUnchanged'])
 old={r['path']:r for r in bundles['original']};new={r['path']:r for r in bundles['sealed']};changes=[{'path':p,'before':old.get(p),'after':new.get(p)}for p in sorted(old.keys()|new.keys())if old.get(p)!=new.get(p)]
 check('only signature executable and CodeResources differences',changes==c['sealingChanges']and{r['path']for r in changes}=={'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'})
 proof=macho((ART/'mac-original.app/Contents/MacOS/notes-clone').read_bytes(),(ART/'mac-sealed.app/Contents/MacOS/notes-clone').read_bytes())
 check('original failure and sealed success retained',len(c['commands'])==13 and[x['exitCode']for x in c['commands']]==[0,0,0,0,0,1,0,0,0,0,0,0,0]and c['originalSignature']==c['commands'][2:6]and c['sealedSign']==c['commands'][7]and c['sealedVerify']==c['commands'][8])
 for cmd in c['commands']:
  check('raw command log '+Path(cmd['log']).name,Path(cmd['log']).read_text()==cmd['stdout'])
  check('bounded completed command '+Path(cmd['log']).name,cmd['ownedGroupStopped']and not cmd['remainingOwnedGroupMembers']and cmd['minimumFreeBytes']>=2*1024**3 and cmd['elapsedSeconds']<600 and not any(k in cmd for k in ['error','stopReason','groupCleanupError']))
 original=fresh(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',str(ART/'mac-original.app')],1)
 check('fresh exact original resource failure','code has no resources but signature indicates they must be present'in original['stderr'])
 sealed=fresh(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',str(ART/'mac-sealed.app')],0);check('fresh sealed valid','valid on disk'in sealed['stderr'])
 display=fresh(['/usr/bin/codesign','-d','--verbose=4',str(ART/'mac-sealed.app')],0)
 check('fresh adhoc arm64 bundle identity',all(x in display['stderr']for x in ['Identifier=com.local.notesclone','Signature=adhoc','TeamIdentifier=not set','(arm64)','CDHash=4ec45f3ffee91a0363ad7eb73aad080932d0c3cb']))
 record('fresh-signature-checks.json',{'commands':signatureCalls})
 android=load(BASE/'android-folder-fixes-build06/android-attempt01/collection/result.json');apk=ROOT/'artifacts/unified-candidate06/android-folder-fixes-build06/android-attempt01/android-original.apk'
 check('Android06 old source and APK preserved',android['expectedHead']=='de372d31e0578a7f2619413c0abde6a8439bb3c6'and ident(apk)==android['preservedApk']and ident(apk)['sha256']=='8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac')
 import plistlib
 plist1=plistlib.loads((ART/'mac-original.app/Contents/Info.plist').read_bytes());plist2=plistlib.loads((ART/'mac-sealed.app/Contents/Info.plist').read_bytes())
 check('same bundle plist identity and deployment metadata',plist1==plist2 and plist1['CFBundleIdentifier']=='com.local.notesclone'and plist1['CFBundleExecutable']=='notes-clone'and plist1['LSMinimumSystemVersion']=='12.0')
 record('bundle-metadata.json',{'plist':plist1,'scope':'Metadata facts only; no compatibility or permission runtime acceptance.'})
 manifest=load(OUT/'input-manifest.json');check('all initial protected files unchanged',all(relident(ROOT/r['path'])==r for r in manifest['files']))
 check('all322 frozen inputs unchanged at close',all({**relident(ROOT/r['path']),**({'symlinkTarget':os.readlink(ROOT/r['path'])}if(ROOT/r['path']).is_symlink()else{})}==r for r in current))
 record('input-close.json',{'protectedFiles':manifest['fileCount'],'protectedChanged':[],'currentInputFiles':322,'currentInputsChanged':[]})
 result={'status':'pass','stop':True,'sourceHeadSuppliedByRoot':SOURCE,'gitObjectRead':False,'freezeSHA256':FREEZE,'productFiles':303,'inputFiles':322,'productAggregate':PRODUCT,'inputAggregate':INPUT,'protectedFiles':manifest['fileCount'],'checks':checks,'assertions':len(checks),'failed':0,'bundleInventories':bundles,'archives':archives,'machoSignatureOnlyProof':proof,'frozenModelFacts':{'members':25,'bytes':2490310,'scope':'Frozen cache/model records matched across snapshots; cache not traversed or re-probed. No Mac model inclusion claim.'},'limits':['No independent Git object proof; fixed source ID linked via authorization/root freeze and322 actual current hashes.','No frontend rebuild or decoding of compressed embedded assets; production build log/dist/source correspondence checked.','Original strict failure retained, derived adhoc strict pass only; no DeveloperID, notarization or TCC acceptance.','No build, sign, launch, GUI/ADB/userDB/install/download/shared-cache operations.','Android06 artifact preserved at old de372d31 source; no new Android build or parity inference.','No runtime, sidebar persistence, native menu, immediate CmdQ, media or full pixel acceptance.']}
 record('result.json',result);print(json.dumps({'status':'pass','assertions':len(checks),'protectedFiles':manifest['fileCount'],'resultSHA256':ident(OUT/'result.json')['sha256']}))
if __name__=='__main__':
 try:main()
 except BaseException as error:
  record('attempt02-failure.json',{'error':repr(error),'checks':checks,'freshSignatureCommands':signatureCalls});raise
