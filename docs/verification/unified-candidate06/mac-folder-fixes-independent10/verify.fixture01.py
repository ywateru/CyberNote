"""Read-only package18 review. No Git, builds, launches or shared-cache traversal."""
from pathlib import Path
import ast, datetime, hashlib, json, os, re, stat, struct, subprocess, sys, time, zipfile

ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
BASE=ROOT/'docs/verification/unified-candidate06'
SOURCE='de372d31e0578a7f2619413c0abde6a8439bb3c6'
PRODUCT='5cf86b16c5dc6f122b9789ee1b5181000616a533a211b8f6099881feab9b6a74'
INPUT='f8f53954584ba4c7712dc271ddcb515c9faf8be51fcb64838e4ab7236684ad0e'
CERT='e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'
CONFIG={
 'mac':('mac-folder-fixes-build10','mac-folder-fixes-independent10','fe317d0ab73b237370e50f48d3c681b2927b47efc69ca77353da5141660d9a87','8387338c17069116fb9e87bef95680c04dabc5e1a40039f111cd7f26615f75aa','7700e1bc4bccf2ccdea995918a2e7e626692eba630f4b5a5fd2fec2961caaf73'),
 'android':('android-folder-fixes-build06','android-folder-fixes-independent06','74ebef00dc96fd4bbd39ed1df3e7d3d08ffb7d3f0824b8e1647f3f85a827c7a0','fd06fe550ba7dff31c5a8a1e628a3a821425b45a671312dcddf8fb794ca5cca5','fe8f7ec76d92e7d64a0c102c5caaefb6ae9a560dcb5a306163fd380f9377de97')}
stage=sys.argv[1];run_name,out_name,FREEZE,BUILD,COLLECT=CONFIG[stage]
RUN=BASE/run_name;ATT=RUN/(stage+'-attempt01');ART=ROOT/'artifacts/unified-candidate06'/run_name/(stage+'-attempt01');OUT=BASE/out_name
checks=[]
def digest(b):return hashlib.sha256(b).hexdigest()
def hash_stream(s):
 h=hashlib.sha256()
 while True:
  b=s.read(1024*1024)
  if not b:break
  h.update(b)
 return h.hexdigest()
def ident(p):
 with p.open('rb') as s:h=hash_stream(s)
 return {'path':str(p),'bytes':p.stat().st_size,'sha256':h}
def relident(p):return {**ident(p),'path':str(p.relative_to(ROOT))}
def load(p):return json.loads(p.read_text())
def record(name,d):
 with (OUT/name).open('x') as s:s.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def check(name,condition):
 checks.append({'name':name,'passed':bool(condition)})
 if not condition:raise AssertionError(name)
def aggregate(rows):return digest(''.join(r['sha256']+'  '+r['path']+'\n' for r in rows).encode())
def tree(p):
 rows=[]
 for q in sorted(p.rglob('*')):
  mode=q.lstat().st_mode
  check('regular bundle entry '+str(q.relative_to(p)),stat.S_ISREG(mode) or stat.S_ISDIR(mode))
  if q.is_file():rows.append({**ident(q),'path':str(q.relative_to(p)),'type':'file','mode':stat.S_IMODE(mode)})
 return rows
def snapshot(p):
 s=p.stat();r={'kind':'directory' if p.is_dir() else 'file','device':s.st_dev,'inode':s.st_ino,'mode':stat.S_IMODE(s.st_mode)}
 if p.is_dir():r.update(directories=[{'path':str(q.relative_to(p)),'mode':stat.S_IMODE(q.stat().st_mode)} for q in sorted(p.rglob('*')) if q.is_dir()],files=tree(p))
 else:r.update({k:v for k,v in ident(p).items() if k!='path'})
 return r
def fresh(argv,expected):
 env=os.environ.copy();env['JAVA_HOME']='/opt/zerobrew/opt/openjdk@17'
 start=time.monotonic();r=subprocess.run(argv,cwd=ROOT,env=env,capture_output=True,text=True,timeout=30)
 value={'argv':argv,'exitCode':r.returncode,'elapsedSeconds':round(time.monotonic()-start,3),'deadlineSeconds':30,'stdout':r.stdout,'stderr':r.stderr}
 check('fresh signature exit '+str(argv),r.returncode==expected)
 return value
def protect():
 paths={BASE/'folder-fixes18-preparation'/(stage+'-authorization.json')}
 for d in [RUN,ART]:paths.update(q for q in d.rglob('*') if q.is_file())
 return [relident(p) for p in sorted(paths)]
def common():
 f=load(RUN/'input-freeze.json');b=load(ATT/'result.json');c=load(ATT/'collection/result.json');a=load(BASE/'folder-fixes18-preparation'/(stage+'-authorization.json'))
 for p,h in [(RUN/'input-freeze.json',FREEZE),(ATT/'result.json',BUILD),(ATT/'collection/result.json',COLLECT)]:check('exact evidence '+p.name,ident(p)['sha256']==h)
 check('exact nine-field authorization',len(a)==9 and f['authorization']==a and a['stage']==stage and a['root']==str(ROOT) and a['sourceHead']==SOURCE and a['productAggregate']==PRODUCT and a['runDirectory']==str(RUN) and a['artifactDirectory']==str(ART.parent) and a['inputPaths']==[x['path'] for x in f['files']] and a['productPaths']==[x['path'] for x in f['productFiles']])
 check('exact source stage aggregate chain',f['head']==SOURCE and f['stage']==stage and f['productAggregate']==PRODUCT and f['aggregate']==INPUT and all(x['expectedHead']==SOURCE and x['stage']==stage and x['freezeSha256']==FREEZE and x['productAggregate']==PRODUCT and x['sourceAggregate']==INPUT for x in [b,c]))
 summary=load(RUN/'freeze-summary.json');approval=load(RUN/'root-freeze-review.json')
 check('freeze summary identity',summary['sourceHead']==SOURCE and summary['freeze']==ident(RUN/'input-freeze.json') and summary['productAggregate']==PRODUCT and summary['inputAggregate']==INPUT)
 check('root exact START record',approval['sourceHead']==SOURCE and approval['freezeSha256']==FREEZE and approval['differences']==[] and approval['productAggregate']==PRODUCT and approval['aggregate']==INPUT and approval['effectiveBuildEnvironment']==f['effectiveBuildEnvironment'] and approval['decision'].startswith('START canonical attempt01'))
 check('ordered timestamps',summary['at']<=b['startedAt']<b['endedAt']<=c['startedAt']<c['endedAt'])
 check('exact build collector linkage',c['buildResult']==ident(ATT/'result.json') and c['buildNonce']==b['nonce'] and re.fullmatch('[0-9a-f]{32}',b['nonce']) and b['attempt']==str(ATT) and b['command']==(['pnpm','mac:build'] if stage=='mac' else ['pnpm','android:build','--debug']) and c['artifactDirectory']==str(ART))
 check('build success bounded no residual',b['exitCode']==0 and b['ownedGroupStopped'] is True and b['remainingOwnedGroupMembers']==[] and b['supplementalInputsUnchanged'] is True and all(b['inputComparisons'].values()) and b['deadlineSeconds']==600 and b['elapsedSeconds']<600 and b['minimumFreeBytes']>=2*1024**3 and not any(k in b for k in ['error','invalidated','offlineMarkerMissing','cleanupError','stopReason','groupCleanupError']))
 check('collector success',c['ready'] is True and c['supplementalInputsUnchangedDuringCollection'] is True and all(c['inputComparisons'].values()) and not any(k in c for k in ['error','invalidated','cleanupError','stopReason','groupCleanupError']))
 for name in ['inputs-before.json','inputs-after.json','collection/inputs-before-collection.json','collection/inputs-after-collection.json']:
  v=load(ATT/name);check('full frozen snapshot '+name,all(v[k]==value for k,value in f.items() if k!='at'))
 current=[]
 for row in f['files']:
  p=ROOT/row['path'];v=relident(p)
  if p.is_symlink():v['symlinkTarget']=os.readlink(p)
  check('current frozen input '+row['path'],v==row);current.append(v)
 check('all320 exact inputs',len(current)==320 and aggregate(current)==INPUT)
 cmap={r['path']:r for r in current}
 check('all301 exact products',len(f['productFiles'])==301 and all(cmap[r['path']]==r for r in f['productFiles']) and aggregate(f['productFiles'])==PRODUCT)
 for row in f['tools']:check('canonical tool '+row['path'],{**ident(BASE/'preparation'/row['path']),'path':row['path']}==row)
 oldfreeze=load(BASE/('mac-smart-u-build09' if stage=='mac' else 'android-smart-u-build05')/'input-freeze.json')
 check('canonical tools unchanged from independently reviewed package',f['tools']==oldfreeze['tools'] and len(f['tools'])==7)
 check('exact isolated output records',load(ATT/'output-isolation.json')==b['outputIsolation'] and load(ATT/'generated-outputs.json')==b['generatedOutputs'] and b['outputIsolation']['policy']=='atomic-rename-final-output-and-dist' and b['outputIsolation']['sourcePathsAbsentBeforeCommand'] is True)
 for row in b['outputIsolation']['outputs']:check('preserved prior full identity '+row['name'],snapshot(Path(row['preserved']))==row['before'])
 prior=b['outputIsolation']['outputs'][0]['before'];new=b['generatedOutputs'][0]['snapshot']
 check('new product distinct inode',prior['device']==new['device'] and prior['inode']!=new['inode'])
 for command in c['commands']:
  check('raw command log '+Path(command['log']).name,Path(command['log']).read_text()==command['stdout'])
  check('bounded completed recorded command '+Path(command['log']).name,command['ownedGroupStopped'] is True and command['remainingOwnedGroupMembers']==[] and command['minimumFreeBytes']>=2*1024**3 and command['elapsedSeconds']<600 and not any(k in command for k in ['error','stopReason','groupCleanupError']))
 check('exact environment frozen and actual',f['effectiveBuildEnvironment']==b['explicitEnvironmentOverrides'])
 log=(ATT/'build.txt').read_text();check('raw log no download/cache reuse',re.search(r'\bDownloading\b|reusing\s+(?:the\s+)?configuration cache|configuration cache(?: entry)?\s+(?:was\s+)?reused',log,re.I) is None)
 return f,b,c,current
def macho(a,b):
 check('thin arm64 Mach-O headers',struct.unpack_from('<II',a)==struct.unpack_from('<II',b)==(0xfeedfacf,0x100000c))
 n=struct.unpack_from('<I',a,16)[0];off=32;sig=[];link=[]
 for i in range(n):
  cmd,size=struct.unpack_from('<II',a,off);check('same load command structure '+str(i),struct.unpack_from('<II',b,off)==(cmd,size) and size>=8)
  if cmd==0x1d:sig.append(off)
  if cmd==0x19 and a[off+8:off+24].rstrip(b'\0')==b'__LINKEDIT':link.append(off)
  off+=size
 check('one code signature and LINKEDIT',len(sig)==len(link)==1)
 so=sig[0];lo=link[0];start1,size1=struct.unpack_from('<II',a,so+8);start2,size2=struct.unpack_from('<II',b,so+8)
 check('signature is tail with same start',start1==start2 and start1+size1==len(a) and start2+size2==len(b))
 check('LINKEDIT ends at signature tail',all(struct.unpack_from('<Q',v,lo+40)[0]+struct.unpack_from('<Q',v,lo+48)[0]==len(v) for v in [a,b]))
 x=bytearray(a[:start1]);y=bytearray(b[:start2]);allowed=[(lo+32,8),(lo+48,8),(so+12,4)]
 for off,size in allowed:x[off:off+size]=b'\0'*size;y[off:off+size]=b'\0'*size
 check('entire nonsignature executable identical except signature size fields',x==y)
 return {'signatureOffset':start1,'originalSignatureBytes':size1,'sealedSignatureBytes':size2,'normalizedPayloadSha256':digest(x),'permittedLoadCommandFields':[{'offset':o,'bytes':s} for o,s in allowed]}
def mac(f,b,c):
 bundles={};archives={}
 for name in ['original','sealed']:
  app=ART/('mac-'+name+'.app');rows=tree(app);bundles[name]=rows
  check('complete '+name+' bundle',rows==c[name]['bundleFiles'] and aggregate(rows)==c[name]['bundleAggregate'])
  check('exact '+name+' executable',ident(app/'Contents/MacOS/notes-clone')==c[name]['executable'])
  archive=ART/('mac-'+name+'.zip');check('exact '+name+' ZIP',ident(archive)==c[name]['archive']);archives[name]=ident(archive)
  with zipfile.ZipFile(archive) as z:
   items=z.infolist();check(name+' ZIP no duplicates',len(items)==len({i.filename for i in items}));payload={}
   for item in items:
    data=z.read(item)
    if item.is_dir() or item.filename.startswith('__MACOSX/'):continue
    check(name+' ZIP rooted in bundle',item.filename.startswith(app.name+'/'))
    payload[item.filename[len(app.name)+1:]]={'bytes':len(data),'sha256':digest(data),'mode':stat.S_IMODE(item.external_attr>>16)}
   check(name+' complete ZIP payload CRC hash mode',payload=={r['path']:{k:r[k] for k in ['bytes','sha256','mode']} for r in rows})
 check('exact expected sealed ZIP',archives['sealed']['bytes']==4866538 and archives['sealed']['sha256']=='6961ea84ef4f9c047a72c119f3417218400a0beaa2bda6d42beef05351b4dc29')
 check('exact expected sealed executable',c['sealed']['executable']['sha256']=='56742e3842b3e3aca03a3bbd3f7fed92f017d5446578334dd7a6cf1b861e1d67')
 check('original matches generated build',bundles['original']==b['buildOutputIdentity']['bundleFiles']==b['generatedOutputs'][0]['snapshot']['files'] and c['preservedOriginalUnchanged'] is True)
 # Android followed Mac and atomically preserved the Mac dist before generating its own.
 android=load(BASE/'android-folder-fixes-build06/android-attempt01/result.json')
 macdist=android['outputIsolation']['outputs'][1]
 check('Mac new dist preserved intact by next Android build',macdist['before']==b['generatedOutputs'][1]['snapshot'] and snapshot(Path(macdist['preserved']))==macdist['before'])
 old={r['path']:r for r in bundles['original']};new={r['path']:r for r in bundles['sealed']}
 changes=[{'path':p,'before':old.get(p),'after':new.get(p)} for p in sorted(old.keys()|new.keys()) if old.get(p)!=new.get(p)]
 check('only executable and CodeResources sealing differences',changes==c['sealingChanges'] and {r['path'] for r in changes}=={'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'})
 m=macho((ART/'mac-original.app/Contents/MacOS/notes-clone').read_bytes(),(ART/'mac-sealed.app/Contents/MacOS/notes-clone').read_bytes())
 check('recorded original strict failure and sealed pass',len(c['commands'])==13 and [x['exitCode'] for x in c['commands']]==[0,0,0,0,0,1,0,0,0,0,0,0,0] and c['originalSignature']==c['commands'][2:6] and c['sealedSign']==c['commands'][7] and c['sealedVerify']==c['commands'][8])
 calls=[fresh(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',str(ART/('mac-'+n+'.app'))],1 if n=='original' else 0) for n in ['original','sealed']]
 check('fresh original exact strict failure', 'code has no resources but signature indicates they must be present' in calls[0]['stderr'])
 check('fresh sealed strict valid','valid on disk' in calls[1]['stderr'])
 calls.append(fresh(['/usr/bin/codesign','-d','--verbose=4',str(ART/'mac-sealed.app')],0))
 check('fresh adhoc bundle arm64 identity',all(x in calls[2]['stderr'] for x in ['Identifier=com.local.notesclone','Signature=adhoc','TeamIdentifier=not set','(arm64)']))
 record('fresh-signature-checks.json',{'commands':calls})
 oldbuild=load(BASE/'mac-smart-u-build09/mac-attempt01/result.json')
 check('old Mac09 output precisely preserved',b['outputIsolation']['outputs'][0]['before']==oldbuild['generatedOutputs'][0]['snapshot'])
 check('new original executable changed from old',c['original']['executable']['sha256']!=oldbuild['buildOutputIdentity']['bundleFiles'][1]['sha256'])
 return {'bundles':{n:{'files':rows,'aggregate':aggregate(rows)} for n,rows in bundles.items()},'archives':archives,'machoSignatureOnlyProof':m,'freshSignatureCheck':ident(OUT/'fresh-signature-checks.json'),'priorInode':b['outputIsolation']['outputs'][0]['before']['inode'],'newInode':b['generatedOutputs'][0]['snapshot']['inode']}
def android(f,b,c):
 # Reuse the previously audited bounded APK-v2 parser, copying only pure parsing functions.
 prior=BASE/'android-smart-u-independent05/verify.py';treeast=ast.parse(prior.read_text());scope=globals().copy()
 for node in treeast.body:
  if isinstance(node,ast.FunctionDef) and node.name in ['read_lp','sequences','v2_certificates']:exec(compile(ast.Module(body=[node],type_ignores=[]),str(prior),'exec'),scope)
 v2cert=scope['v2_certificates'];apk=ART/'android-original.apk';identity=ident(apk)
 check('exact accurate APK',identity==c['preservedApk'] and identity['bytes']==179247354 and identity['sha256']=='8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac')
 generated=b['generatedOutputs'][0];check('fresh APK exact final output',snapshot(Path(generated['source']))==generated['snapshot'] and ident(Path(generated['source']))==b['buildOutputIdentity']==c['apk'])
 check('current complete generated dist',snapshot(ROOT/'dist')==b['generatedOutputs'][1]['snapshot'])
 rows=[];elf=[]
 with zipfile.ZipFile(apk) as z:
  items=z.infolist();check('APK no duplicate ZIP names',len(items)==len({i.filename for i in items}))
  for item in sorted(items,key=lambda x:x.filename):
   if item.is_dir():continue
   with z.open(item) as stream:h=hash_stream(stream)
   rows.append({'path':item.filename,'bytes':item.file_size,'compressedBytes':item.compress_size,'sha256':h})
   if item.filename.startswith('lib/') and item.filename.endswith('.so'):
    with z.open(item) as stream:header=stream.read(20)
    check('ELF64 AArch64 '+item.filename,header[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',header,18)[0]==183);elf.append(item.filename)
 check('all1066 ZIP members streamed CRC hashes',len(rows)==1066 and rows==c['allZipEntries'])
 models=[r for r in rows if r['path'].startswith('assets/mlkit-google-ocr-models/')];expected={r['path']:(r['bytes'],r['sha256']) for aar in f['ocrCache'] for r in aar['models']}
 check('25 exact frozen OCR model bytes',len(models)==len(expected)==25 and {r['path']:(r['bytes'],r['sha256']) for r in models}==expected and models==c['ocrModels'] and sum(r['bytes'] for r in models)==c['ocrModelBytes']==2490310 and c['ocrModelsExactlyMatchCachedAars'] is True)
 check('only arm64 four libraries',len(elf)==4 and sorted({p.split('/')[1] for p in elf})==c['abis']==['arm64-v8a'] and 'lib/arm64-v8a/libnotes_clone_lib.so' in elf)
 v2=v2cert(apk);check('single exact DER certificate',[[r['sha256'] for r in signer] for signer in v2['signerCertificates']]==[[CERT]])
 oldapk=ROOT/'artifacts/unified-candidate06/android-smart-u-build05/android-attempt01/android-original.apk';old=load(BASE/'android-smart-u-build05/android-attempt01/collection/result.json')
 check('old05 APK preserved identity',ident(oldapk)==old['preservedApk'])
 check('upgrade certificate compatibility',v2cert(oldapk)['signerCertificates']==v2['signerCertificates'] and c['candidate04UpgradeCertificateMatches'] is True and c['signerCertificateSha256']==[CERT])
 check('prior05 inode exact',b['outputIsolation']['outputs'][0]['before']==load(BASE/'android-smart-u-build05/android-attempt01/result.json')['generatedOutputs'][0]['snapshot'])
 sig=fresh(['/Users/water/Library/Android/sdk/build-tools/36.0.0/apksigner','verify','--verbose','--print-certs',str(apk)],0)
 check('fresh valid v2 single expected signer','Verified using v2 scheme (APK Signature Scheme v2): true' in sig['stdout'] and 'Number of signers: 1' in sig['stdout'] and re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)\s*$',sig['stdout'],re.M)==[CERT]);record('fresh-signature-check.json',sig)
 log=(ATT/'build.txt').read_text();marker='CANDIDATE06_OFFLINE=true workers=2 configurationCacheJvmProperty=false nonce='+b['nonce'];markers=[{'line':i,'text':s.strip()} for i,s in enumerate(log.splitlines(),1) if 'CANDIDATE06_OFFLINE=' in s]
 check('real exact current initialization markers twice',len(markers)==2 and all(r['text']==marker for r in markers) and b['androidOfflineProof']=={'nonce':b['nonce'],'offline':True,'workers':2,'configurationCacheJvmProperty':'false','markerCount':2})
 check('actual Android native build completion','> node scripts/android.mjs build --debug' in log and '> tauri android build --debug --target aarch64 --apk' in log and 'Finished 1 APK at:' in log)
 commonast=ast.parse((BASE/'preparation/common.py').read_text());ns={'re':re}
 node=next(n for n in commonast.body if isinstance(n,ast.FunctionDef) and n.name=='android_offline_init');exec(compile(ast.Module(body=[node],type_ignores=[]),'copied-pure-init','exec'),ns);initbytes=ns['android_offline_init'](b['nonce']).encode()
 init=b['temporaryGradleInit'];cleanup=b['temporaryGradleInitBeforeCleanup']
 check('owned temporary init exact identity and removed',b['temporaryGradleInitRemoved'] is True and cleanup['regularFile'] is True and all(cleanup[k]==v for k,v in init.items()) and init['bytes']==len(initbytes)==576 and init['sha256']==digest(initbytes) and init['path'].endswith('candidate06-offline-'+b['nonce']+'.gradle') and not Path(init['path']).exists())
 check('Android actual required environment',b['explicitEnvironmentOverrides']['GRADLE_OPTS']=='-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false' and b['explicitEnvironmentOverrides']['CARGO_NET_OFFLINE']=='true' and b['explicitEnvironmentOverrides']['CARGO_BUILD_JOBS']=='2')
 return {'apk':identity,'zipEntryCount':len(rows),'zipEntryAggregate':aggregate(rows),'elfLibraries':elf,'models':models,'modelCount':len(models),'modelBytes':sum(r['bytes'] for r in models),'v2CertificateParse':v2,'rawInitMarkers':markers,'temporaryInitAbsent':True,'freshSignatureCheck':ident(OUT/'fresh-signature-check.json'),'priorInode':b['outputIsolation']['outputs'][0]['before']['inode'],'newInode':b['generatedOutputs'][0]['snapshot']['inode']}
def main():
 started=datetime.datetime.now(datetime.timezone.utc).isoformat();initial=protect();record('input-manifest.json',{'files':initial,'count':len(initial)})
 f,b,c,current=common();detail=mac(f,b,c) if stage=='mac' else android(f,b,c)
 # No shared-cache enumeration: inspect only exact recorded process-group IDs.
 processrows=subprocess.check_output(['/bin/ps','-axo','pid=,pgid=,comm='],text=True).splitlines();groups={b['ownedProcessGroup']}|{x['ownedProcessGroup'] for x in c['commands']}
 remaining=[r.strip() for r in processrows if len(r.split(None,2))>=2 and int(r.split(None,2)[1]) in groups]
 check('fresh no recorded build or collector groups remain',remaining==[])
 check('all protected evidence files unchanged',all(relident(ROOT/r['path'])==r for r in initial))
 check('all320 frozen current inputs unchanged at close',all(({**relident(ROOT/r['path']),**({'symlinkTarget':os.readlink(ROOT/r['path'])} if (ROOT/r['path']).is_symlink() else {})})==r for r in current))
 record('input-close.json',{'protectedFileCount':len(initial),'protectedChanged':[],'currentInputCount':len(current),'currentInputsChanged':[],'checkedOwnedGroupIds':sorted(groups),'remainingOwnedGroupMembers':remaining})
 result={'schema':1,'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'conclusion':'PASS: accurate '+stage+' package18 source/bytes/isolation/signature gates','sourceHead':SOURCE,'freezeSha256':FREEZE,'productFiles':301,'inputFiles':320,'productAggregate':PRODUCT,'inputAggregate':INPUT,'checks':checks,'assertions':len(checks),'failed':0,'protectedFiles':len(initial),**detail,'limits':'No Git or independent commit-object proof: exact authorized source ID linked through root-reviewed freeze and all snapshots; all320 current input bytes rehashed. No build, sign, launch, GUI/ADB, DB, install, download or shared cache traversal/cleanup. Only exact recorded output paths read. SDK/environment/cache/model records compared across frozen snapshots; cache contents not re-probed. Embedded compressed frontend not independently decoded/rebuilt. No runtime, persistence, native selection, pixel, DeveloperID or notarization acceptance.','stop':True,'sharedTargetAndCache':'not acquired; no build/cache use; resources released'}
 record('result.json',result);print(json.dumps({'conclusion':result['conclusion'],'assertions':len(checks),'protectedFiles':len(initial),'result':ident(OUT/'result.json')},ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except BaseException as e:
  record('attempt01-failure.json',{'error':repr(e),'checks':checks});raise
