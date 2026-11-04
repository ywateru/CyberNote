"""Independent exact Mac13 review. No Git/build/sign/launch/cache/target traversal."""
from pathlib import Path
import datetime, hashlib, json, os, re, stat, struct, subprocess, time, zipfile, plistlib
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
BASE=ROOT/'docs/verification/unified-candidate06'
RUN=BASE/'mac-typography-keyboard-build13'; ATT=RUN/'mac-attempt02'
ART=ROOT/'artifacts/unified-candidate06/mac-typography-keyboard-build13/mac-attempt02'
OUT=BASE/'mac-typography-keyboard-independent13'
SOURCE='182464bcc3055caadcd78fe4c7ce1a0ec31eea6a'
PRODUCT='6b1cda6557ff292326617bd2fdf8750ba37d700eb460e2d6cdb1ac2da80848ad'
INPUT='0769da604be0d4d3087771b948477e9c96c45992f0e75b81298465cdaa9d290e'
FREEZE='6da4a0f5cd6c24eee6f77560063af67519202bbba983b883772394f31f40261d'
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
 f=load(RUN/'input-freeze.json');b=load(ATT/'result.json');c=load(ATT/'collection/result.json');a=load(BASE/'typography-compose-keyboard36-preparation/mac-authorization.json')
 check('exact authorization SHA',ident(BASE/'typography-compose-keyboard36-preparation/mac-authorization.json')['sha256']=='7e64ce5e24bba53316fa28e166b438267f72fbe999d6b2df86ad6eb32b01a49f')
 check('exact freeze SHA',ident(RUN/'input-freeze.json')['sha256']==FREEZE)
 check('exact build result SHA',ident(ATT/'result.json')['sha256']=='c22e4bbdf52e82021bcda6eca7d1f836ae0d6ea9c9349d65613ca3152eea0cf9')
 check('exact collection result SHA',ident(ATT/'collection/result.json')['sha256']=='28f4fe004dcf4ce9b12f2bc2d623caf9ebaadcdfdac5661db9c4ee85612f7921')
 check('exact nine-field authorization',len(a)==9 and f['authorization']==a and a['stage']=='mac'and a['root']==str(ROOT)and a['sourceHead']==SOURCE and a['productAggregate']==PRODUCT and a['runDirectory']==str(RUN)and a['artifactDirectory']==str(ART.parent)and a['productPaths']==[r['path']for r in f['productFiles']]and a['inputPaths']==[r['path']for r in f['files']])
 check('source identity chain',f['head']==SOURCE and f['stage']=='mac'and f['productAggregate']==PRODUCT and f['aggregate']==INPUT and all(x['expectedHead']==SOURCE and x['stage']=='mac'and x['freezeSha256']==FREEZE and x['productAggregate']==PRODUCT and x['sourceAggregate']==INPUT for x in [b,c]))
 summary=load(RUN/'freeze-summary.json');review=load(RUN/'root-freeze-review.json');retry=load(RUN/'root-attempt02-authorization.json');first=load(RUN/'mac-attempt01/result.json')
 check('root freeze review',review['freezeSha256']==FREEZE and review['sourceHead']==SOURCE and review['productAggregate']==PRODUCT and review['inputAggregate']==INPUT and review['productFiles']==304 and review['inputFiles']==323 and review['mismatches']==[]and all(review['checks'].values()))
 check('freeze summary',summary['sourceHead']==SOURCE and summary['freeze']==ident(RUN/'input-freeze.json')and summary['productAggregate']==PRODUCT and summary['inputAggregate']==INPUT)
 check('ordered actual before-build freeze and retry authorization',summary['at']<review['at']<first['startedAt']<first['endedAt']<retry['at']<b['startedAt']<b['endedAt']<=c['startedAt']<c['endedAt'] and review['recordTiming']=='Created before build START.'and retry['freezeSha256']==FREEZE and retry['sourceHead']==SOURCE and retry['inputComparisonsAllTrue']and retry['supersedesFailure']is False)
 check('first attempt original failure retained',first['exitCode']is None and first['error']=="PermissionError(1, 'Operation not permitted')" and 'ownedProcessGroup'not in first and all(first['inputComparisons'].values())and first['supplementalInputsUnchanged']and not(RUN/'mac-attempt01/build.txt').exists())
 common=(BASE/'preparation/common.py').read_text();start=common.index('def run_command(')if'def run_command('in common else common.index('    process_listing()',common.index('def process_listing():')+1)
 check('canonical process permission probe precedes Popen',common.index('    process_listing()',common.index('def process_listing():')+1)<common.index('process = subprocess.Popen'))
 check('build collect exact linkage',c['buildResult']==ident(ATT/'result.json')and c['buildNonce']==b['nonce']and re.fullmatch('[0-9a-f]{32}',b['nonce'])and b['nonce']!=first['nonce']and b['command']==['pnpm','mac:build']and b['attempt']==str(ATT)and c['artifactDirectory']==str(ART))
 check('successful bounded build',b['exitCode']==0 and b['ownedGroupStopped']and not b['remainingOwnedGroupMembers']and b['supplementalInputsUnchanged']and all(b['inputComparisons'].values())and b['deadlineSeconds']==600 and b['elapsedSeconds']<600 and b['minimumFreeBytes']>=2*1024**3 and not any(k in b for k in ['error','invalidated','cleanupError','stopReason','groupCleanupError']))
 check('collector ready all comparisons',c['ready']and c['supplementalInputsUnchangedDuringCollection']and all(c['inputComparisons'].values())and not any(k in c for k in ['error','invalidated','cleanupError','stopReason','groupCleanupError']))
 for name in ['inputs-before.json','inputs-after.json','collection/inputs-before-collection.json','collection/inputs-after-collection.json']:
  s=load(ATT/name);check('full frozen snapshot '+name,all(s[k]==v for k,v in f.items()if k!='at'))
 for name in ['inputs-before.json','inputs-after.json']:
  s=load(RUN/'mac-attempt01'/name);check('first failed attempt source remains frozen '+name,all(s[k]==v for k,v in f.items()if k!='at'))
 current=[]
 for r in f['files']:
  p=ROOT/r['path'];value=relident(p)
  if p.is_symlink():value['symlinkTarget']=os.readlink(p)
  check('current frozen input '+r['path'],value==r);current.append(value)
 check('all323 current files aggregate',len(current)==323 and aggregate(current)==INPUT)
 cmap={r['path']:r for r in current};check('all304 product files aggregate',len(f['productFiles'])==304 and all(cmap[r['path']]==r for r in f['productFiles'])and aggregate(f['productFiles'])==PRODUCT)
 expected={'src/App.tsx':'d7b20f13b2ee076ab2708c0e837be60f8b2387a2bdeccc6d2fa8ae9e06526911','src/SmartFolderForm.tsx':'b2e4d60e5cbe0265b1bca7a67cd5c2d7412b3697e34152d870c0d0344770c15c','src/style.css':'5ceac05bf79ca9fa83e0237b909c76281c2b03993ab654dbc6bed37191060929','plugins/tauri-plugin-notes-ui/src/lib.rs':'37a0187328e33d26a752377ec5fa225276c2ea34847fe86b80cfbfacc14f5e78','plugins/tauri-plugin-notes-ui/src/macos.rs':'7ee071ad6796fc442edb0ca54f073d7a8133e2cce468f4a102ad8dbac6ed7c76','plugins/tauri-plugin-notes-ui/macos/keyboard.m':'7aa2d83e7cc6d1243bee60cea03e7ce685440b5b70f092661f4bc470c15f131a','plugins/tauri-plugin-notes-ui/build.rs':'0a3ef847511df8cef2f645f664a5ad5fec62d1016355b0ab80c2ada3f789ed2f','plugins/tauri-plugin-notes-ui/Cargo.toml':'ea0af0d3d408a465294b110d9a45354060ccbb48789ddd8f47a01fcbd19938b5','plugins/tauri-plugin-notes-ui/README.md':'ec59cd5d0dacef63b3b88faa17c9046d741db6f25ed2960b3a361212e00fe7da'}
 check('reviewed typography34 keyboard35 and preserved name26 products exact',all(cmap[p]['sha256']==v for p,v in expected.items()))
 for r in f['tools']:check('exact canonical tool '+r['path'],{**ident(BASE/'preparation'/r['path']),'path':r['path']}==r)
 check('seven canonical tools',len(f['tools'])==7)
 check('offline jobs2 actual environment',f['effectiveBuildEnvironment']==b['explicitEnvironmentOverrides']and b['explicitEnvironmentOverrides']['CARGO_NET_OFFLINE']=='true'and b['explicitEnvironmentOverrides']['CARGO_BUILD_JOBS']=='2')
 modelRows=[m for aar in f['ocrCache']for m in aar['models']];check('25 unique frozen model member records',len(modelRows)==len({m['path']for m in modelRows})==25 and sum(m['bytes']for m in modelRows)==2490310)
 check('supplemental overlay aggregate',aggregate(f['supplementalInputs']['overlayFiles'])==f['supplementalInputs']['overlayAggregate'])
 log=(ATT/'build.txt').read_text();check('raw build no download or reused configuration cache',not re.search(r'\bDownloading\b|reusing\s+(?:the\s+)?configuration cache|configuration cache(?: entry)?\s+(?:was\s+)?reused',log,re.I))
 check('actual production frontend native plugin and mac log',all(x in log for x in ['> tsc -b && vite build','Finished 1 bundle at:','Compiling notes-clone v0.1.0','Compiling tauri-plugin-notes-ui v0.1.0','index-CcN0EZLg.css','index-B5XVqrGq.js']))
 check('canonical isolated output evidence',load(ATT/'output-isolation.json')==b['outputIsolation']and load(ATT/'generated-outputs.json')==b['generatedOutputs']and b['outputIsolation']['policy']=='atomic-rename-final-output-and-dist'and b['outputIsolation']['sourcePathsAbsentBeforeCommand'])
 check('attempt02 starts with absent final outputs',all(r['before']is None for r in b['outputIsolation']['outputs']))
 check('first isolation raw evidence',load(RUN/'mac-attempt01/output-isolation.json')==first['outputIsolation']and first['outputIsolation']['sourcePathsAbsentBeforeCommand'])
 for r in first['outputIsolation']['outputs']:check('first attempt prior full inode mode file identity '+r['name'],snapshot(Path(r['preserved']))==r['before'])
 prior=load(BASE/'mac-name-focus-build12/mac-attempt01/generated-outputs.json')
 check('first attempt saved exact Mac12 original app',first['outputIsolation']['outputs'][0]['before']==prior[0]['snapshot'])
 check('new bundle and dist inode distinct from prior',all(old['before']['inode']!=new['snapshot']['inode']for old,new in zip(first['outputIsolation']['outputs'],b['generatedOutputs'])))
 check('generated dist exactly matches captured build manifest',b['dist']==b['generatedOutputs'][1]['snapshot']['files']and {r['path']for r in b['dist']}=={'index.html','assets/index-CcN0EZLg.css','assets/index-B5XVqrGq.js'})
 # Shared target and current dist deliberately not inspected; Android may replace them.
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
 check('original expected executable and ZIP',c['original']['executable']['sha256']=='c1b3d1fa0de4b4d0bec8031c5ce0981f98ca910a991c69b814c4f069d475f833'and archives['original']['sha256']=='c14c88272a683eeedb37c9a1ce04ad8edd6bca383b1a967fd9784588d860ffd1')
 check('sealed expected executable',c['sealed']['executable']['sha256']=='b24f87623e49781859166d798dec052cb987692469ad2741847392b13e127812')
 check('sealed expected ZIP',archives['sealed']['sha256']=='91dec624ade286756cd2eec5b8c0768c738821c8c2829b9089e42fa491001ae6')
 check('sealed expected bundle aggregate',aggregate(bundles['sealed'])=='c37691422c79458aeb1d4e4d132bcfda2c6ef63e8616cc27e5175c47e7d85953')
 check('original equals newly generated full bundle snapshot',bundles['original']==b['buildOutputIdentity']['bundleFiles']==b['generatedOutputs'][0]['snapshot']['files']and c['preservedOriginalUnchanged'])
 old={r['path']:r for r in bundles['original']};new={r['path']:r for r in bundles['sealed']};changes=[{'path':p,'before':old.get(p),'after':new.get(p)}for p in sorted(old.keys()|new.keys())if old.get(p)!=new.get(p)]
 check('only signature executable and CodeResources differences',changes==c['sealingChanges']and{r['path']for r in changes}=={'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'})
 originalBytes=(ART/'mac-original.app/Contents/MacOS/notes-clone').read_bytes();sealedBytes=(ART/'mac-sealed.app/Contents/MacOS/notes-clone').read_bytes();proof=macho(originalBytes,sealedBytes)
 markers={}
 for s in ['NotesUIKeyboardPolicy','isFullKeyboardAccessEnabled','setTabFocusesLinks:','notes_ui_keyboard_attach','notes_ui_keyboard_destroy','notes-ui: keyboard policy installation completed for ','notes-ui: keyboard policy refresh failed','NSWindowDidBecomeKeyNotification','NSApplicationDidBecomeActiveNotification','NSWindowWillCloseNotification']:
  markers[s]={'originalOffset':originalBytes.find(s.encode()),'sealedOffset':sealedBytes.find(s.encode())};check('compiled native keyboard marker '+s,markers[s]['originalOffset']>=0 and markers[s]['originalOffset']==markers[s]['sealedOffset'])
 record('native-keyboard-markers.json',{'markers':markers,'limits':'Static binary presence and exact helper source identity only; does not prove runtime installation or event delivery.'})
 check('original failure and sealed success retained',len(c['commands'])==13 and[x['exitCode']for x in c['commands']]==[0,0,0,0,0,1,0,0,0,0,0,0,0]and c['originalSignature']==c['commands'][2:6]and c['sealedSign']==c['commands'][7]and c['sealedVerify']==c['commands'][8])
 for cmd in c['commands']:
  check('raw command log '+Path(cmd['log']).name,Path(cmd['log']).read_text()==cmd['stdout'])
  check('bounded completed command '+Path(cmd['log']).name,cmd['ownedGroupStopped']and not cmd['remainingOwnedGroupMembers']and cmd['minimumFreeBytes']>=2*1024**3 and cmd['elapsedSeconds']<600 and not any(k in cmd for k in ['error','stopReason','groupCleanupError']))
 original=fresh(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',str(ART/'mac-original.app')],1);check('fresh exact original resource failure','code has no resources but signature indicates they must be present'in original['stderr'])
 sealed=fresh(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',str(ART/'mac-sealed.app')],0);check('fresh sealed valid','valid on disk'in sealed['stderr'])
 display=fresh(['/usr/bin/codesign','-d','--verbose=4',str(ART/'mac-sealed.app')],0);check('fresh adhoc arm64 identity',all(x in display['stderr']for x in ['Identifier=com.local.notesclone','Signature=adhoc','TeamIdentifier=not set','(arm64)','CDHash=21ac36c66998a188fe8a4ce000c158db49daa78d']))
 record('fresh-signature-checks.json',{'commands':signatureCalls})
 plist1=plistlib.loads((ART/'mac-original.app/Contents/Info.plist').read_bytes());plist2=plistlib.loads((ART/'mac-sealed.app/Contents/Info.plist').read_bytes());check('same bundle plist metadata',plist1==plist2 and plist1['CFBundleIdentifier']=='com.local.notesclone'and plist1['CFBundleExecutable']=='notes-clone'and plist1['LSMinimumSystemVersion']=='12.0')
 record('bundle-metadata.json',{'plist':plist1,'limits':'Metadata only; no compatibility or permission runtime acceptance.'})
 manifest=load(OUT/'input-manifest.json');close=[]
 for r in manifest['files']:
  p=ROOT/r['path'];v={**relident(p),'mtimeNs':p.stat().st_mtime_ns}
  if p.is_symlink():v['symlinkTarget']=os.readlink(p)
  check('protected unchanged '+r['path'],v==r);close.append(v)
 check('323 frozen inputs unchanged at close',all({**relident(ROOT/r['path']),**({'symlinkTarget':os.readlink(ROOT/r['path'])}if(ROOT/r['path']).is_symlink()else{})}==r for r in current))
 record('input-close.json',{'protectedFiles':manifest['fileCount'],'protectedChanged':[],'currentInputFiles':323,'currentInputsChanged':[],'files':close})
 result={'status':'PASS exact-package identity only','stop':True,'sourceHeadSuppliedByRoot':SOURCE,'gitObjectRead':False,'freezeSHA256':FREEZE,'productFiles':304,'inputFiles':323,'productAggregate':PRODUCT,'inputAggregate':INPUT,'protectedFiles':manifest['fileCount'],'checks':checks,'assertions':len(checks),'failed':0,'bundleInventories':bundles,'archives':archives,'machoSignatureOnlyProof':proof,'frozenModelFacts':{'members':25,'bytes':2490310,'scope':'Frozen records only; no cache traversal or Mac model inclusion claim.'},'limits':['No Git object proof; source ID linked via authorization/root freeze and323 actual file hashes.','No rebuild or independent compressed frontend asset decoding; source/log/dist snapshot correspondence only.','Current shared target/dist deliberately not inspected; immutable bundles and recorded generation chain checked.','Native keyboard strings/selectors present; no runtime installation, event delivery, settings switch or Option insertion acceptance.','Original strict failure retained, derived adhoc strict pass only; no DeveloperID/notarization/TCC acceptance.','No build/sign write/launch/GUI/ADB/userDB/install/download/cache traversal; no Android parity or whole UI pixel acceptance.']}
 record('result.json',result);print(json.dumps({'status':result['status'],'assertions':len(checks),'protectedFiles':manifest['fileCount'],'resultSHA256':ident(OUT/'result.json')['sha256']}))
if __name__=='__main__':
 try:main()
 except BaseException as error:
  record('attempt01-failure.json',{'error':repr(error),'checks':checks,'freshSignatureCommands':signatureCalls});raise
