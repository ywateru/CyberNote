"""Independent exact Mac14 review. No Git/build/sign/launch/cache/target traversal."""
from pathlib import Path
import datetime, hashlib, json, os, re, stat, struct, subprocess, time, zipfile, plistlib
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
BASE=ROOT/'docs/verification/unified-candidate06'
RUN=BASE/'mac-ordinary-loop-build14'; ATT=RUN/'mac-attempt01'
ART=ROOT/'artifacts/unified-candidate06/mac-ordinary-loop-build14/mac-attempt01'
OUT=BASE/'mac-ordinary-loop-independent14'
SOURCE='d9ce9c4b864c2d05bf3d2057ec48ae65fb868a46'
PRODUCT='51ef44771aff4afd0117af09f6b5de6ae928306277ef1534eb35b951b8e87b3e'
INPUT='00ec0f65421419ef9d4dfc7fdfad80f755abb599469d69382d585470c0d39a8b'
FREEZE='3adea7a3607d2247c7d34de529aab2fd38c48f160d91a6d336a0ae2e92974e94'
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
 f=load(RUN/'input-freeze.json');b=load(ATT/'result.json');c=load(ATT/'collection/result.json');a=load(BASE/'mac-ordinary-loop39-preparation/mac-authorization.json')
 check('exact authorization SHA',ident(BASE/'mac-ordinary-loop39-preparation/mac-authorization.json')['sha256']=='1725c9533201686f83ba4e93f3b6087d2501e08606745d6b1c45b0397c4bde99')
 check('exact freeze SHA',ident(RUN/'input-freeze.json')['sha256']==FREEZE)
 check('exact build result SHA',ident(ATT/'result.json')['sha256']=='99c90b6468b8911de9c569b105a2bf35e348465df18ed85ebdf3470b9d91c89f')
 check('exact collection result SHA',ident(ATT/'collection/result.json')['sha256']=='0a406e7b73e15c784f650591e426121d180feff065d02e14004d7dc0c3e9b3c3')
 check('exact nine-field authorization',len(a)==9 and f['authorization']==a and a['stage']=='mac'and a['root']==str(ROOT)and a['sourceHead']==SOURCE and a['productAggregate']==PRODUCT and a['runDirectory']==str(RUN)and a['artifactDirectory']==str(ART.parent)and a['productPaths']==[r['path']for r in f['productFiles']]and a['inputPaths']==[r['path']for r in f['files']])
 check('source identity chain',f['head']==SOURCE and f['stage']=='mac'and f['productAggregate']==PRODUCT and f['aggregate']==INPUT and all(x['expectedHead']==SOURCE and x['stage']=='mac'and x['freezeSha256']==FREEZE and x['productAggregate']==PRODUCT and x['sourceAggregate']==INPUT for x in [b,c]))
 summary=load(RUN/'freeze-summary.json');review=load(RUN/'root-freeze-review.json')
 check('root freeze review',review['freezeSha256']==FREEZE and review['head']==SOURCE and review['productAggregate']==PRODUCT and review['inputAggregate']==INPUT and review['productCount']==308 and review['inputCount']==327 and 'PASS before build START' in review['status'])
 check('freeze summary',summary['sourceHead']==SOURCE and summary['freeze']==ident(RUN/'input-freeze.json')and summary['productAggregate']==PRODUCT and summary['inputAggregate']==INPUT)
 reviewedAt=datetime.datetime.fromtimestamp((RUN/'root-freeze-review.json').stat().st_mtime,datetime.timezone.utc).isoformat()
 check('freeze review precedes START',summary['at']<reviewedAt<b['startedAt']<b['endedAt']<=c['startedAt']<c['endedAt'])
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
 check('all327 current files aggregate',len(current)==327 and aggregate(current)==INPUT)
 cmap={r['path']:r for r in current};check('all308 product files aggregate',len(f['productFiles'])==308 and all(cmap[r['path']]==r for r in f['productFiles'])and aggregate(f['productFiles'])==PRODUCT)
 reviewed37=load(ROOT/'docs/verification/mac-ordinary-tab-loop37/all-product-inputs.json')
 check('reviewed37 aggregate identity',aggregate(reviewed37['files'])=='5760f57413d117104dd2fdf3d07fffc0d41578b8d41e58a4a8c6dbefb68855f2')
 for r in reviewed37['files']:
  if r['path'] not in ['src/SmartFolderForm.tsx','src/smart-folders.css']:check('reviewed37 product retained '+r['path'],cmap[r['path']]['sha256']==r['sha256'])
 reviewed42=load(ROOT/'docs/verification/mac-ordinary-option-insertion42/product-source.json')
 check('reviewed42 aggregate',aggregate(reviewed42['files'])=='c148cd6026b1ebf923f73e92700947857bb5cd09944375d5e79105aab8b5bc9a')
 for r in reviewed42['files']:check('reviewed42 exact product '+r['path'],cmap[r['path']]['sha256']==r['sha256'])
 addition=b':root:not(.dark) .smart-mac .smart-ordinary .smart-name input:focus::selection {\n  color: #000;\n}\n'
 css=(ROOT/'src/smart-folders.css').read_bytes();css37=next(r['sha256']for r in reviewed37['files']if r['path']=='src/smart-folders.css')
 check('reviewed45 exact three-line CSS',css.count(addition)==1 and digest(css.replace(addition,b'',1))==css37)
 for r in f['tools']:check('exact canonical tool '+r['path'],{**ident(BASE/'preparation'/r['path']),'path':r['path']}==r)
 check('seven canonical tools',len(f['tools'])==7)
 check('offline jobs2 actual environment',f['effectiveBuildEnvironment']==b['explicitEnvironmentOverrides']and b['explicitEnvironmentOverrides']['CARGO_NET_OFFLINE']=='true'and b['explicitEnvironmentOverrides']['CARGO_BUILD_JOBS']=='2')
 modelRows=[m for aar in f['ocrCache']for m in aar['models']];check('25 unique frozen model member records',len(modelRows)==len({m['path']for m in modelRows})==25 and sum(m['bytes']for m in modelRows)==2490310)
 check('supplemental overlay aggregate',aggregate(f['supplementalInputs']['overlayFiles'])==f['supplementalInputs']['overlayAggregate'])
 log=(ATT/'build.txt').read_text();check('raw build no download or reused configuration cache',not re.search(r'\bDownloading\b|reusing\s+(?:the\s+)?configuration cache|configuration cache(?: entry)?\s+(?:was\s+)?reused',log,re.I))
 check('actual production frontend native plugin and mac log',all(x in log for x in ['> tsc -b && vite build','Finished 1 bundle at:','Compiling notes-clone v0.1.0','Compiling tauri-plugin-notes-ui v0.1.0','index-Ck7hzsV1.css','index-BWE62Ajh.js']))
 check('canonical isolated output evidence',load(ATT/'output-isolation.json')==b['outputIsolation']and load(ATT/'generated-outputs.json')==b['generatedOutputs']and b['outputIsolation']['policy']=='atomic-rename-final-output-and-dist'and b['outputIsolation']['sourcePathsAbsentBeforeCommand'])
 for r in b['outputIsolation']['outputs']:check('prior full inode mode file identity '+r['name'],snapshot(Path(r['preserved']))==r['before'])
 prior=load(BASE/'mac-typography-keyboard-build13/mac-attempt02/generated-outputs.json')
 check('saved exact Mac13 original app and dist',all(r['before']==p['snapshot']for r,p in zip(b['outputIsolation']['outputs'],prior)))
 check('new bundle and dist distinct inodes',all(old['before']['inode']!=new['snapshot']['inode']for old,new in zip(b['outputIsolation']['outputs'],b['generatedOutputs'])))
 check('generated dist exactly matches captured build manifest',b['dist']==b['generatedOutputs'][1]['snapshot']['files']and {r['path']for r in b['dist']}=={'index.html','assets/index-Ck7hzsV1.css','assets/index-BWE62Ajh.js'})
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
 check('original expected executable and ZIP',c['original']['executable']['sha256']=='eac006e3e922c49bc5971a935821f469649b141009fc1f323808e255a083946c'and archives['original']['sha256']=='ff445742b2e878855628de30b0a4ead18dc710a8fd4af923cca1ae73c4bf3549')
 check('sealed expected executable',c['sealed']['executable']['sha256']=='c9f7f35adc675c8058fabeb98f03fa7d1904a2c023e123cc396121264a8e211f')
 check('sealed expected ZIP',archives['sealed']['sha256']=='146fdbc67111cd1ae0779337a22af1550d1d9a446c27021bc243415f5dff0605')
 check('sealed expected bundle aggregate',aggregate(bundles['sealed'])=='8af9413d27f747233e72c537defd282bb30b64e6228972aee3eb22b7423d0aeb')
 check('original equals newly generated full bundle snapshot',bundles['original']==b['buildOutputIdentity']['bundleFiles']==b['generatedOutputs'][0]['snapshot']['files']and c['preservedOriginalUnchanged'])
 old={r['path']:r for r in bundles['original']};new={r['path']:r for r in bundles['sealed']};changes=[{'path':p,'before':old.get(p),'after':new.get(p)}for p in sorted(old.keys()|new.keys())if old.get(p)!=new.get(p)]
 check('only signature executable and CodeResources differences',changes==c['sealingChanges']and{r['path']for r in changes}=={'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'})
 originalBytes=(ART/'mac-original.app/Contents/MacOS/notes-clone').read_bytes();sealedBytes=(ART/'mac-sealed.app/Contents/MacOS/notes-clone').read_bytes();proof=macho(originalBytes,sealedBytes)
 markers={}
 for s in ['NotesUIKeyboardPolicy','isFullKeyboardAccessEnabled','setTabFocusesLinks:','notes_ui_keyboard_attach','notes_ui_keyboard_destroy','notes_ui_keyboard_navigation','notes-ui: keyboard policy installation completed for ','notes-ui: keyboard policy refresh failed','NSWindowDidBecomeKeyNotification','NSApplicationDidBecomeActiveNotification','NSWindowWillCloseNotification']:
  markers[s]={'originalOffset':originalBytes.find(s.encode()),'sealedOffset':sealedBytes.find(s.encode())};check('compiled native keyboard marker '+s,markers[s]['originalOffset']>=0 and markers[s]['originalOffset']==markers[s]['sealedOffset'])
 record('native-keyboard-markers.json',{'markers':markers,'limits':'Static binary presence and exact helper source identity only; does not prove runtime installation or event delivery.'})
 check('original failure and sealed success retained',len(c['commands'])==13 and[x['exitCode']for x in c['commands']]==[0,0,0,0,0,1,0,0,0,0,0,0,0]and c['originalSignature']==c['commands'][2:6]and c['sealedSign']==c['commands'][7]and c['sealedVerify']==c['commands'][8])
 for cmd in c['commands']:
  check('raw command log '+Path(cmd['log']).name,Path(cmd['log']).read_text()==cmd['stdout'])
  check('bounded completed command '+Path(cmd['log']).name,cmd['ownedGroupStopped']and not cmd['remainingOwnedGroupMembers']and cmd['minimumFreeBytes']>=2*1024**3 and cmd['elapsedSeconds']<600 and not any(k in cmd for k in ['error','stopReason','groupCleanupError']))
 original=fresh(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',str(ART/'mac-original.app')],1);check('fresh exact original resource failure','code has no resources but signature indicates they must be present'in original['stderr'])
 sealed=fresh(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',str(ART/'mac-sealed.app')],0);check('fresh sealed valid','valid on disk'in sealed['stderr'])
 display=fresh(['/usr/bin/codesign','-d','--verbose=4',str(ART/'mac-sealed.app')],0);check('fresh adhoc arm64 identity',all(x in display['stderr']for x in ['Identifier=com.local.notesclone','Signature=adhoc','TeamIdentifier=not set','(arm64)','CDHash=1d215208651dd7f7443ffe2ca4641dd62d0d84fc']))
 record('fresh-signature-checks.json',{'commands':signatureCalls})
 plist1=plistlib.loads((ART/'mac-original.app/Contents/Info.plist').read_bytes());plist2=plistlib.loads((ART/'mac-sealed.app/Contents/Info.plist').read_bytes());check('same bundle plist metadata',plist1==plist2 and plist1['CFBundleIdentifier']=='com.local.notesclone'and plist1['CFBundleExecutable']=='notes-clone'and plist1['LSMinimumSystemVersion']=='12.0')
 record('bundle-metadata.json',{'plist':plist1,'limits':'Metadata only; no compatibility or permission runtime acceptance.'})
 manifest=load(OUT/'input-manifest.json');close=[]
 for r in manifest['files']:
  p=ROOT/r['path'];v={**relident(p),'mtimeNs':p.stat().st_mtime_ns}
  if p.is_symlink():v['symlinkTarget']=os.readlink(p)
  check('protected unchanged '+r['path'],v==r);close.append(v)
 check('327 frozen inputs unchanged at close',all({**relident(ROOT/r['path']),**({'symlinkTarget':os.readlink(ROOT/r['path'])}if(ROOT/r['path']).is_symlink()else{})}==r for r in current))
 record('input-close.json',{'protectedFiles':manifest['fileCount'],'protectedChanged':[],'currentInputFiles':327,'currentInputsChanged':[],'files':close})
 result={'status':'PASS exact-package identity only','stop':True,'sourceHeadSuppliedByRoot':SOURCE,'gitObjectRead':False,'freezeSHA256':FREEZE,'productFiles':308,'inputFiles':327,'productAggregate':PRODUCT,'inputAggregate':INPUT,'protectedFiles':manifest['fileCount'],'checks':checks,'assertions':len(checks),'failed':0,'bundleInventories':bundles,'archives':archives,'machoSignatureOnlyProof':proof,'frozenModelFacts':{'members':25,'bytes':2490310,'scope':'Frozen records only; no cache traversal or Mac model inclusion claim.'},'limits':['No Git object proof; source ID linked via authorization/root freeze and327 actual file hashes, with reviewed37/42/45 product identity.','No rebuild or independent compressed frontend asset decoding; source/log/dist snapshot correspondence only.','Current shared target/dist deliberately not inspected; immutable bundles and recorded generation chain checked.','Native keyboard strings/selectors present; no runtime installation, event delivery, settings switch or Option insertion acceptance.','Original strict failure retained, derived adhoc strict pass only; no DeveloperID/notarization/TCC acceptance.','No build/sign write/launch/GUI/ADB/userDB/install/download/cache traversal; no Android parity or whole UI pixel acceptance.']}
 record('result.json',result);print(json.dumps({'status':result['status'],'assertions':len(checks),'protectedFiles':manifest['fileCount'],'resultSHA256':ident(OUT/'result.json')['sha256']}))
if __name__=='__main__':
 try:main()
 except BaseException as error:
  record('attempt01-failure.json',{'error':repr(error),'checks':checks,'freshSignatureCommands':signatureCalls});raise
