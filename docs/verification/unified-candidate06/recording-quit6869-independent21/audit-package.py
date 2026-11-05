from pathlib import Path
import hashlib,json,subprocess,zipfile,struct,datetime,os
OUT=Path(__file__).resolve().parent
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
RUN=ROOT/'docs/verification/unified-candidate06/mac-recording-quit-build21'
ART=ROOT/'artifacts/unified-candidate06/mac-recording-quit-build21/mac-attempt01'
SOURCE='bd51ae6aae37cf2f9576bf50e44e568c67a17427'
FROZEN='5a01650d4a621540eb03f3f99b2a37bae366cfaa7cdcc23fef0d1f575f98c1f4'
def sha(data):return hashlib.sha256(data).hexdigest()
def ident(p):return {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
def load(p):return json.loads(p.read_text())
def git(root,*args):return subprocess.check_output(['git',*args],cwd=root)
def agg(rows):return sha(''.join(r['sha256']+'  '+r['path']+'\n' for r in rows).encode())
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
root_start=git(ROOT,'rev-parse','HEAD').decode().strip()
independent_start=git(OUT,'rev-parse','HEAD').decode().strip()
freeze_path=RUN/'input-freeze.json';freeze=load(freeze_path)
assert ident(freeze_path)['sha256']==FROZEN
assert freeze['head']==SOURCE
assert len(freeze['authorization'])==9
assert len(freeze['productFiles'])==366 and len(freeze['files'])==387
assert agg(freeze['productFiles'])==freeze['productAggregate']
assert agg(freeze['files'])==freeze['aggregate']
records=[freeze_path,RUN/'freeze-summary.json',ROOT/'docs/verification/unified-candidate06/recording-quit68-native69-preparation/root-freeze-review.json']
snapshots=[]
for name in ['inputs-before.json','inputs-after.json','collection/inputs-before-collection.json','collection/inputs-after-collection.json']:
 p=RUN/'mac-attempt01'/name;x=load(p);records.append(p)
 compare={k:x[k]==freeze[k] for k in freeze if k!='at'}
 assert all(compare.values()),(name,compare)
 snapshots.append({'record':ident(p),'allExceptTimestampEqualFreeze':True,'comparisons':compare})
current=[]
tracked=set(git(ROOT,'ls-tree','-r','--name-only',SOURCE).decode().splitlines())
committed_count=0
input_only=[]
for r in freeze['files']:
 p=ROOT/r['path'];data=p.read_bytes()
 assert len(data)==r['bytes'] and sha(data)==r['sha256'],r['path']
 if r['path'] in tracked:
  assert git(ROOT,'show',SOURCE+':'+r['path'])==data,r['path']+' committed source mismatch'
  committed_count+=1
 else:input_only.append(r)
 current.append(r)
product_compare=[]
binding=load(ROOT/'docs/verification/mac-recording-quit6869/independent/source-binding.json')
assert binding['head']=='1ddeca7cb51727cd40203101d5447800bd43da04'
for row in binding['records']:
 data=(ROOT/row['path']).read_bytes()
 assert len(data)==row['bytes'] and sha(data)==row['sha256'],row['path']
 product_compare.append({'path':row['path'],'bytes':len(data),'sha256':sha(data)})
assert len(product_compare)==275
build_path=RUN/'mac-attempt01/result.json';collection_path=RUN/'mac-attempt01/collection/result.json'
build=load(build_path);collection=load(collection_path);records.extend([build_path,collection_path,RUN/'mac-attempt01/build.txt',RUN/'mac-attempt01/generated-outputs.json',RUN/'mac-attempt01/output-isolation.json'])
for r in [build,collection]:
 assert r['expectedHead']==SOURCE and r['freezeSha256']==FROZEN
 assert r['productAggregate']==freeze['productAggregate'] and r['sourceAggregate']==freeze['aggregate']
 assert all(r['inputComparisons'].values())
assert build['exitCode']==0 and build['ownedGroupStopped'] and not build['remainingOwnedGroupMembers']
assert collection['ready'] and collection['preservedOriginalUnchanged']
assert collection['buildNonce']==build['nonce']
assert ident(build_path)==collection['buildResult']
def inventory(app):
 result=[]
 for p in sorted(app.rglob('*')):
  assert not p.is_symlink(),str(p)
  if p.is_file():result.append({'path':str(p.relative_to(app)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes()),'type':'file','mode':p.stat().st_mode&0o777})
 return result
before={p.name:inventory(p) for p in [ART/'mac-original.app',ART/'mac-sealed.app']}
zip_results=[]
for key,appname in [('original','mac-original.app'),('sealed','mac-sealed.app')]:
 row=collection[key];app=ART/appname
 assert before[appname]==row['bundleFiles']
 assert agg(row['bundleFiles'])==row['bundleAggregate']
 assert ident(Path(row['archive']['path']))==row['archive']
 assert ident(Path(row['executable']['path']))==row['executable']
 with zipfile.ZipFile(row['archive']['path']) as z:
  names=z.namelist();assert len(names)==len(set(names))
  expected={appname+'/'+r['path']:r for r in row['bundleFiles']}
  entries=[]
  for name in names:
   assert not Path(name).is_absolute() and '..' not in Path(name).parts and '\\' not in name,name
   if name.endswith('/'):
    assert name.startswith(appname+'/') or name.startswith('__MACOSX/'),name
    continue
   data=z.read(name)
   if name in expected:
    r=expected.pop(name);assert len(data)==r['bytes'] and sha(data)==r['sha256']
   else:
    assert name.startswith('__MACOSX/'+appname+'/') and Path(name).name.startswith('._'),name
    assert data[:4]==bytes.fromhex('00051607'),name
   entries.append({'path':name,'bytes':len(data),'sha256':sha(data)})
  assert not expected
 zip_results.append({'archive':row['archive'],'allBundleEntriesMatch':True,'entries':entries})
assert collection['sealed']['archive']['sha256']=='b7a544f1c3e5f2f29d078c58f8cd02d6d559c5c15a99e646417c771f2fb14685'
assert collection['sealed']['bundleAggregate']=='16df48fa523bb25285495d49d9eb39edbefed77a0220566da69fefeafdabd34e'
assert collection['sealed']['executable']['sha256']=='b8228d203acebb4750b6b43e5f1360b2a7f62f54aeaca01721187fb3443eba73'
assert collection['original']['bundleFiles']==build['buildOutputIdentity']['bundleFiles']
assert inventory(Path(build['buildOutputIdentity']['path']))==collection['original']['bundleFiles']
for item in build['generatedOutputs']:
 assert inventory(Path(item['source']))==item['snapshot']['files']
assert load(RUN/'mac-attempt01/generated-outputs.json')==build['generatedOutputs']
assert load(RUN/'mac-attempt01/output-isolation.json')==build['outputIsolation']
for item in build['outputIsolation']['outputs']:
 p=Path(item['preserved']);snapshot=item['before']
 assert snapshot is not None
 assert inventory(p)==snapshot['files']
 dirs=[{'path':str(q.relative_to(p)),'mode':q.stat().st_mode&0o777} for q in sorted(p.rglob('*')) if q.is_dir()]
 assert dirs==snapshot['directories']
 assert p.stat().st_ino==snapshot['inode'] and p.stat().st_dev==snapshot['device'] and p.stat().st_mode&0o777==snapshot['mode']
assert build['outputIsolation']['sourcePathsAbsentBeforeCommand']
assert collection['original']['executable']['sha256']!=build['outputIsolation']['outputs'][0]['before']['files'][1]['sha256']
prior_result_path=ROOT/'docs/verification/unified-candidate06/mac-recording-media-build20/mac-attempt01/collection/result.json'
prior_result=load(prior_result_path)
assert build['outputIsolation']['outputs'][0]['before']['files']==prior_result['original']['bundleFiles']
(OUT/'prior-application-cross-reference.json').write_text(json.dumps({'status':'pass','priorApplicationFiles':build['outputIsolation']['outputs'][0]['before']['files'],'exactlyMatchesMac20OriginalBundleFiles':True,'mac20CollectionResult':ident(prior_result_path),'distBoundary':'Prior dist independently preserved and equals recorded pre-build snapshot; not asserted to be Mac20 dist.','limits':'Read-only comparison; no old app/process/runtime action.'},ensure_ascii=False,indent=2)+'\n')
assert build['nonce']=='57403b1daf814132a202d9bae1c06543'
assert build['command']==['pnpm','mac:build']
assert collection['supplementalInputsUnchangedDuringCollection']
assert len([p for p in RUN.iterdir() if p.is_dir() and p.name.startswith('mac-attempt')])==1
assert collection['original']['archive']['sha256']=='acbe7a943e384526c6327d2f0cfb0d7e82e9f2c5defd452f6cdb188379533aaf'
assert collection['original']['executable']['sha256']=='73fa5b74e71899eb49452e0998005769686b917a8a031e1e773b37f81a264f16'
commands=collection['commands'];assert len([x for x in commands if '--sign' in x['argv']])==1
assert collection['sealedSign']['exitCode']==0 and collection['sealedVerify']['exitCode']==0
assert collection['originalSignature'][-1]['exitCode']==1
assert len(commands)==13
assert all(x['ownedGroupStopped'] and not x['remainingOwnedGroupMembers'] for x in commands)
assert [x for x in commands if '--sign' in x['argv']][0]['argv'][-1]==str(ART/'mac-sealed.app')
assert {x['path'] for x in collection['sealingChanges']}=={'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'}
for x in commands:
 p=Path(x['log']);assert p.read_text()==x['stdout'];records.append(p)
def sections(path):
 data=path.read_bytes();magic,cputype,subtype,filetype,ncmds,sizeofcmds,flags,reserved=struct.unpack_from('<8I',data)
 assert magic==0xfeedfacf
 offset=32;result=[]
 for _ in range(ncmds):
  cmd,size=struct.unpack_from('<II',data,offset)
  if cmd==0x19:
   nsects=struct.unpack_from('<I',data,offset+64)[0]
   for j in range(nsects):
    pos=offset+72+j*80;sectname,segname=struct.unpack_from('<16s16s',data,pos)
    addr,length,fileoffset,align,reloff,nreloc,sectflags=struct.unpack_from('<QQIIIII',data,pos+32)
    # Zerofill sections have virtual storage only.
    content=b'' if sectflags&0xff in [1,0xc,0x12] else data[fileoffset:fileoffset+length]
    result.append({'segment':segname.rstrip(b'\0').decode(),'section':sectname.rstrip(b'\0').decode(),'length':length,'sha256':sha(content),'zeroFill':sectflags&0xff in [1,0xc,0x12]})
  offset+=size
 assert offset==32+sizeofcmds
 return result
import plistlib
original_info=plistlib.loads((ART/'mac-original.app/Contents/Info.plist').read_bytes())
sealed_info=plistlib.loads((ART/'mac-sealed.app/Contents/Info.plist').read_bytes())
assert original_info==sealed_info==plistlib.loads((Path(build['outputIsolation']['outputs'][0]['preserved'])/'Contents/Info.plist').read_bytes())
assert original_info['CFBundleIdentifier']=='com.local.notesclone'
assert original_info['NSMicrophoneUsageDescription']
original_sections=sections(ART/'mac-original.app/Contents/MacOS/notes-clone')
assert original_sections==sections(ART/'mac-sealed.app/Contents/MacOS/notes-clone')
signature=[]
for app,mode,argv,expected in [
 ('original','display',['-d','--verbose=4'],0),('original','entitlements',['-d','--entitlements','-'],0),('original','requirements',['-d','-r-'],0),('original','strict',['--verify','--deep','--strict','--verbose=4'],1),
 ('sealed','display',['-d','--verbose=4'],0),('sealed','strict',['--verify','--deep','--strict','--verbose=4'],0),
 ('sealed','entitlements',['-d','--entitlements','-'],0),('sealed','requirements',['-d','-r-'],0)]:
 cmd=['/usr/bin/codesign',*argv,str(ART/f'mac-{app}.app')]
 p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 (OUT/f'{app}-{mode}.stdout.txt').write_bytes(p.stdout);(OUT/f'{app}-{mode}.stderr.txt').write_bytes(p.stderr)
 assert p.returncode==expected,(cmd,p.returncode)
 text=(p.stdout+p.stderr).decode()
 if app=='sealed' and mode=='display':
  assert 'CDHash=658a782daeb747b08bc62092843670f7fc402b40' in text
  assert 'Identifier=com.local.notesclone' in text and 'Signature=adhoc' in text
 if app=='original' and mode=='strict':assert 'code has no resources but signature indicates they must be present' in text
 signature.append({'argv':cmd,'exitCode':p.returncode,'stdoutSha256':sha(p.stdout),'stderrSha256':sha(p.stderr)})
after={p.name:inventory(p) for p in [ART/'mac-original.app',ART/'mac-sealed.app']};assert before==after
for row in zip_results:assert ident(Path(row['archive']['path']))==row['archive']
for r in freeze['files']:assert ident(ROOT/r['path'])['sha256']==r['sha256']
result={'status':'pass','startedAt':start,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceHead':SOURCE,'rootStartingHead':root_start,'rootEndingHead':git(ROOT,'rev-parse','HEAD').decode().strip(),'independentStartingHead':independent_start,'freeze':ident(freeze_path),'productCount':366,'inputCount':387,'productAggregate':freeze['productAggregate'],'inputAggregate':freeze['aggregate'],'snapshotChecks':snapshots,'current387InputsMatch':True,'trackedInputsMatchExactSourceCommit':committed_count,'generatedInputOnlyEntries':input_only,'independentTestedSourceProductFiles':product_compare,'buildExit':build['exitCode'],'buildNonce':build['nonce'],'sourceRecords':[ident(p) for p in records],'outputIsolationAndPriorOutputsPreserved':True,'singleAttempt01SuccessfulBuild':True,'collectedOriginalEqualsFreshBuildOutput':True,'originalAndSealedBundleInventoriesBefore':before,'originalAndSealedBundleInventoriesAfter':after,'archives':zip_results,'singleRecordedAdhocSign':True,'machOSectionsByteIdentical':original_sections,'signatureReadOnlyCommands':signature,'sealedCDHash':'658a782daeb747b08bc62092843670f7fc402b40','limits':['Read-only package/source audit, no build, GUI, device, microphone, audio export, signing or permission operation.','Original strict failure reproduced and preserved; sealed local adhoc strict passes, no Developer ID or notarization claim.','Comparison covers explicit frozen inputs and recorded tools/environment only, not all OS/SDK/transitive reproducibility.','No runtime, recording persistence, WebKit, audibility or pixel acceptance; root performs separate Mac21 GUI acceptance.']}
delta=git(ROOT,'diff','--name-only',SOURCE,result['rootEndingHead']).decode().splitlines()
assert result['rootStartingHead']==SOURCE==result['rootEndingHead']
assert git(ROOT,'status','--porcelain','--untracked-files=no').strip()==b''
assert all(path.startswith('docs/') for path in delta)
result['rootSourceToObservedHeadDocumentationOnlyPaths']=delta
for item in freeze['tools']:
 p=ROOT/'docs/verification/unified-candidate06/preparation'/item['path'];data=p.read_bytes()
 assert len(data)==item['bytes'] and sha(data)==item['sha256']
result['sevenFrozenToolFilesMatchCurrentBytes']=True
(OUT/'package-readonly-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'pass','source':SOURCE,'productCount':366,'inputCount':387,'testedProductFiles':len(product_compare),'machoSections':len(original_sections),'sealedStrict':0,'originalStrict':1,'rootEnd':result['rootEndingHead']}))
