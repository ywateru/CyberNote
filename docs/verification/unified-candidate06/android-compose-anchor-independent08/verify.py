"""Read-only exact Android08 package review. No Git, builds, launches or shared-cache traversal."""
from pathlib import Path
import ast, datetime, hashlib, json, os, re, stat, struct, subprocess, sys, time, zipfile

ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
BASE=ROOT/'docs/verification/unified-candidate06'
SOURCE='182464bcc3055caadcd78fe4c7ce1a0ec31eea6a'
PRODUCT='6b1cda6557ff292326617bd2fdf8750ba37d700eb460e2d6cdb1ac2da80848ad'
INPUT='0769da604be0d4d3087771b948477e9c96c45992f0e75b81298465cdaa9d290e'
CERT='e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'
stage='android';FREEZE='2e2c4ebe4d434ad73f7aa1492b95e60190130c5127738d8993f19489c7bb64a9';BUILD='b503e1847917cd1ea719fb3527f59a2188e18b70f203eca6541a9c0a4226d660';COLLECT='94d33d04157762c95f849813a74ace05d1b4fd01cc2cfd20049b6a51c73a0f63'
RUN=BASE/'android-compose-anchor-build08';ATT=RUN/'android-attempt01';ART=ROOT/'artifacts/unified-candidate06/android-compose-anchor-build08/android-attempt01';OUT=BASE/'android-compose-anchor-independent08'
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
 paths={BASE/'typography-compose-keyboard36-preparation'/(stage+'-authorization.json')}
 for d in [RUN,ART]:paths.update(q for q in d.rglob('*') if q.is_file())
 paths.update(ROOT/r['path'] for r in load(RUN/'input-freeze.json')['files'])
 paths.update([BASE/'android-folder-visual-independent07/verify.py',BASE/'android-paper-selection-independent03/verify-embedded-assets.mjs',BASE/'mac-typography-keyboard-build13/input-freeze.json',OUT/'verify.py',OUT/'verify-embedded-assets.mjs',BASE/'android-smart-u-independent05/verify.py',BASE/'android-folder-visual-build07/android-attempt01/result.json',BASE/'android-folder-visual-build07/android-attempt01/collection/result.json',ROOT/'artifacts/unified-candidate06/android-folder-visual-build07/android-attempt01/android-original.apk'])
 return [relident(p) for p in sorted(paths)]
def common():
 f=load(RUN/'input-freeze.json');b=load(ATT/'result.json');c=load(ATT/'collection/result.json');a=load(BASE/'typography-compose-keyboard36-preparation'/(stage+'-authorization.json'))
 for p,h in [(RUN/'input-freeze.json',FREEZE),(ATT/'result.json',BUILD),(ATT/'collection/result.json',COLLECT)]:check('exact evidence '+p.name,ident(p)['sha256']==h)
 check('exact root authorization SHA',ident(BASE/'typography-compose-keyboard36-preparation/android-authorization.json')['sha256']=='a74155b8c71c84b5741764ff34c495de91b44f5d36e513827eb21cb62b04c288')
 check('exact supplied build nonce',b['nonce']=='953d1fffad4a48b5af33a7fe5441d704')
 check('exact nine-field authorization',len(a)==9 and f['authorization']==a and a['stage']==stage and a['root']==str(ROOT) and a['sourceHead']==SOURCE and a['productAggregate']==PRODUCT and a['runDirectory']==str(RUN) and a['artifactDirectory']==str(ART.parent) and a['inputPaths']==[x['path'] for x in f['files']] and a['productPaths']==[x['path'] for x in f['productFiles']])
 check('exact source stage aggregate chain',f['head']==SOURCE and f['stage']==stage and f['productAggregate']==PRODUCT and f['aggregate']==INPUT and all(x['expectedHead']==SOURCE and x['stage']==stage and x['freezeSha256']==FREEZE and x['productAggregate']==PRODUCT and x['sourceAggregate']==INPUT for x in [b,c]))
 summary=load(RUN/'freeze-summary.json');approval=load(RUN/'root-freeze-review.json')
 check('freeze summary identity',summary['sourceHead']==SOURCE and summary['freeze']==ident(RUN/'input-freeze.json') and summary['productAggregate']==PRODUCT and summary['inputAggregate']==INPUT)
 check('root exact START record',approval['sourceHead']==SOURCE and approval['freezeSha256']==FREEZE and approval['mismatches']==[] and approval['productAggregate']==PRODUCT and approval['inputAggregate']==INPUT and approval['productFiles']==304 and approval['inputFiles']==323 and all(approval['checks'].values()) and 'Canonical android attempt01 build then collect only' in approval['rootBuildAuthorization'])
 check('ordered timestamps',summary['at']<=approval['at']<b['startedAt']<b['endedAt']<=c['startedAt']<c['endedAt'])
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
 check('all323 exact inputs',len(current)==323 and aggregate(current)==INPUT)
 cmap={r['path']:r for r in current}
 check('all304 exact products',len(f['productFiles'])==304 and all(cmap[r['path']]==r for r in f['productFiles']) and aggregate(f['productFiles'])==PRODUCT)
 for row in f['tools']:check('canonical tool '+row['path'],{**ident(BASE/'preparation'/row['path']),'path':row['path']}==row)
 check('seven exact canonical tools frozen by root',len(f['tools'])==7)
 macfreeze=load(BASE/'mac-typography-keyboard-build13/input-freeze.json')
 check('same reviewed Mac13 complete product and input identity',f['head']==macfreeze['head']and f['files']==macfreeze['files']and f['productFiles']==macfreeze['productFiles']and f['productAggregate']==macfreeze['productAggregate']and f['aggregate']==macfreeze['aggregate'])
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
def android(f,b,c):
 # Reuse the previously audited bounded APK-v2 parser, copying only pure parsing functions.
 prior=BASE/'android-smart-u-independent05/verify.py';treeast=ast.parse(prior.read_text());scope=globals().copy()
 for node in treeast.body:
  if isinstance(node,ast.FunctionDef) and node.name in ['read_lp','sequences','v2_certificates']:exec(compile(ast.Module(body=[node],type_ignores=[]),str(prior),'exec'),scope)
 v2cert=scope['v2_certificates'];apk=ART/'android-original.apk';identity=ident(apk)
 check('exact accurate APK',identity==c['preservedApk'] and identity['bytes']==179247354 and identity['sha256']=='a7ba557478e42da0a7f0e387a772bf764b067bfe082553e765603ca700385632')
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
 oldapk=ROOT/'artifacts/unified-candidate06/android-folder-visual-build07/android-attempt01/android-original.apk';old=load(BASE/'android-folder-visual-build07/android-attempt01/collection/result.json')
 check('old07 APK preserved identity',ident(oldapk)==old['preservedApk'])
 check('upgrade certificate compatibility',v2cert(oldapk)['signerCertificates']==v2['signerCertificates'] and c['candidate04UpgradeCertificateMatches'] is True and c['signerCertificateSha256']==[CERT])
 check('prior07 inode exact',b['outputIsolation']['outputs'][0]['before']==load(BASE/'android-folder-visual-build07/android-attempt01/result.json')['generatedOutputs'][0]['snapshot'])
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
 f,b,c,current=common();detail=android(f,b,c)
 record('package-checkpoint.json',{'startedAt':started,'checks':checks,'detail':detail,'current':current,'protectedFiles':len(initial),'status':'package checks complete; separate process and closing checks pending'})
 print(json.dumps({'status':'PACKAGE_CHECKPOINT','assertions':len(checks),'protectedFiles':len(initial)}))
if __name__=='__main__':
 try:main()
 except BaseException as e:
  record('attempt01-failure.json',{'error':repr(e),'checks':checks});raise
