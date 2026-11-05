from pathlib import Path
import json,hashlib,subprocess,zipfile,stat,struct,os,re,datetime
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone');DOC=ROOT/'docs/verification/unified-candidate06';OUT=DOC/'recording-visual5859-independent';HEAD='fa21657bc116431324d85b18fcbe9e1d328471fb'
def load(p):return json.loads(p.read_text())
def sha(data):return hashlib.sha256(data).hexdigest()
def fileid(p):
 p=Path(p);h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return {'path':str(p),'bytes':p.stat().st_size,'sha256':h.hexdigest()}
def aggregate(rows):return sha(''.join(r['sha256']+'  '+r['path']+'\n'for r in rows).encode())
def verify_id(row):
 a=fileid(row['path']);assert a['bytes']==row['bytes']and a['sha256']==row['sha256'];return a
def rows_actual(base,rows):
 for r in rows:
  p=Path(base)/r['path'];a=fileid(p);assert a['bytes']==r['bytes']and a['sha256']==r['sha256'],str(p)
  if 'mode'in r:assert stat.S_IMODE(p.stat().st_mode)==r['mode'],str(p)
 return len(rows)
def command(argv,expected=0,env=None):
 r=subprocess.run(argv,cwd=ROOT,capture_output=True,text=True,timeout=45,env=env);entry={'argv':argv,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr};commands.append(entry);assert r.returncode==expected,entry;return entry
commands=[];result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'read-only build/source/artifact identities; no native builds, shared-cache invocation, GUI, devices, microphone, media or DB','expectedHead':HEAD,'stages':{}}
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==HEAD
assert subprocess.check_output(['git','diff','HEAD','--name-only'],cwd=ROOT,text=True).strip()==''
plan=load(DOC/'recording-visual5859-preparation/input-plan.json');assert plan['sourceHead']==HEAD
freezes=[];builds=[];collects=[]
for stage,dirname,attempt in [('mac','mac-recording-visual-build17','mac-attempt01'),('android','android-recording-visual-build12','android-attempt01')]:
 run=DOC/dirname;ap=run/attempt;auth=load(DOC/'recording-visual5859-preparation'/f'{stage}-authorization.json');fr=load(run/'input-freeze.json');summary=load(run/'freeze-summary.json');review=load(run/'root-freeze-review.json');build=load(ap/'result.json');col=load(ap/'collection/result.json');iso=load(ap/'output-isolation.json')
 fhash=fileid(run/'input-freeze.json')['sha256'];assert fhash==review['freezeSha256']==build['freezeSha256']==col['freezeSha256']
 assert auth==fr['authorization'];assert auth['sourceHead']==fr['head']==summary['sourceHead']==review['sourceHead']==build['expectedHead']==col['expectedHead']==HEAD
 assert stage==auth['stage']==fr['stage']==build['stage']==col['stage'];assert len(fr['productFiles'])==len(auth['productPaths'])==333;assert len(fr['files'])==len(auth['inputPaths'])==352
 assert [r['path']for r in fr['productFiles']]==auth['productPaths'];assert [r['path']for r in fr['files']]==auth['inputPaths']
 assert aggregate(fr['productFiles'])==fr['productAggregate']==auth['productAggregate']==plan['productAggregate']==build['productAggregate']==col['productAggregate']
 assert aggregate(fr['files'])==fr['aggregate']==plan['inputAggregate']==build['sourceAggregate']==col['sourceAggregate']
 assert review['productAggregate']==summary['productAggregate']==fr['productAggregate'];assert review['inputAggregate']==summary['inputAggregate']==fr['aggregate']
 snapshots=[]
 for rel in ['inputs-before.json','inputs-after.json','collection/inputs-before-collection.json','collection/inputs-after-collection.json']:
  s=load(ap/rel);assert {k:v for k,v in s.items()if k!='at'}=={k:v for k,v in fr.items()if k!='at'},rel;snapshots.append({'path':str(ap/rel),**fileid(ap/rel)})
 assert all(build['inputComparisons'].values())and all(col['inputComparisons'].values());assert build['supplementalInputsUnchanged']and col['supplementalInputsUnchangedDuringCollection']
 assert build['exitCode']==0 and build['ownedGroupStopped']and not build['remainingOwnedGroupMembers'];assert col['ready']and col['buildNonce']==build['nonce'];verify_id(col['buildResult'])
 assert iso['sourcePathsAbsentBeforeCommand']and iso==build['outputIsolation'];assert load(ap/'generated-outputs.json')==build['generatedOutputs']
 for tool in fr['tools']:rows_actual(DOC/'preparation',[tool])
 actual_count=rows_actual(ROOT,fr['files']);plugin_count=sum(p.startswith('plugins/')for p in auth['productPaths']);assert plugin_count==plan['pluginCount']==76
 prior=load(Path(plan['preservedCompleteInputBase']));assert set(auth['productPaths'])-set(prior['productPaths'])==set(plan['newProductsFromAndroid11']);assert not set(prior['productPaths'])-set(auth['productPaths'])
 assert set(auth['inputPaths'])-set(prior['inputPaths'])==set(plan['newProductsFromAndroid11']);assert not set(prior['inputPaths'])-set(auth['inputPaths'])
 generated=build['generatedOutputs'];assert generated[1]['snapshot']['files']==build['dist']
 result['stages'][stage]={'freezeSHA256':fhash,'productCount':333,'inputCount':352,'pluginCount':plugin_count,'productAggregate':fr['productAggregate'],'sourceAggregate':fr['aggregate'],'actualInputFilesMatched':actual_count,'allSavedSnapshotsEqualToFreezeExcludingTimestamp':True,'savedSnapshotIdentities':snapshots,'allSevenBuildToolHashesMatch':True,'previousCompleteInputBasePreservedPlusExactlyTwoVisualChecks':True,'buildExit':0,'buildSeconds':build['elapsedSeconds'],'inputComparisonsAllTrue':True,'buildNonce':build['nonce'],'collectionBuildResultIdentity':col['buildResult'],'outputIsolationConfirmed':True,'collectionReady':True,'scope':fr['scope']}
 freezes.append(fr);builds.append(build);collects.append(col)
# Verify all333 product bytes against exact Git objects without running project code.
paths=freezes[0]['authorization']['productPaths'];batch=''.join(HEAD+':'+p+'\n'for p in paths).encode();raw=subprocess.check_output(['git','cat-file','--batch'],input=batch,cwd=ROOT);pos=0
for r in freezes[0]['productFiles']:
 end=raw.index(b'\n',pos);header=raw[pos:end].split();assert header[1]==b'blob';size=int(header[2]);data=raw[end+1:end+1+size];assert size==r['bytes']and sha(data)==r['sha256'];pos=end+size+2
assert freezes[0]['productFiles']==freezes[1]['productFiles']and freezes[0]['files']==freezes[1]['files'];assert builds[0]['dist']==builds[1]['dist'];assert builds[0]['endedAt']<builds[1]['startedAt'];assert collects[0]['endedAt']<builds[1]['startedAt']
result['sameSourceAndDist']={'head':HEAD,'all333ProductsMatchGit':True,'all352InputRowsSameAcrossPlatforms':True,'distFourFilesIdentical':True,'serialBuildAndCollectionTimes':True}
# Mac preserved original and separate local adhoc derivative.
mac=collects[0];bundles={}
for key,pathkey in [('original','preservedApp'),('sealed','derivedApp')]:
 d=mac[key];base=Path(d[pathkey]);rows=d['bundleFiles'];assert {str(p.relative_to(base))for p in base.rglob('*')if p.is_file()}=={r['path']for r in rows};rows_actual(base,rows);assert aggregate(rows)==d['bundleAggregate'];verify_id(d['archive']);verify_id(d['executable'])
 with zipfile.ZipFile(d['archive']['path'])as z:
  for r in rows:
   name=base.name+'/'+r['path'];data=z.read(name);assert len(data)==r['bytes']and sha(data)==r['sha256']
 info=__import__('plistlib').loads((base/'Contents/Info.plist').read_bytes());assert info['CFBundleIdentifier']=='com.local.notesclone';header=(base/'Contents/MacOS/notes-clone').read_bytes()[:32];assert struct.unpack('<I',header[:4])[0]==0xfeedfacf;assert struct.unpack('<I',header[4:8])[0]==0x100000c
 bundles[key]={'files':rows,'aggregate':d['bundleAggregate'],'archive':d['archive'],'architecture':'arm64','bundleIdentifier':info['CFBundleIdentifier']}
assert builds[0]['buildOutputIdentity']['bundleFiles']==mac['original']['bundleFiles']==builds[0]['generatedOutputs'][0]['snapshot']['files']
assert {r['path']for r in mac['sealingChanges']}=={'Contents/MacOS/notes-clone','Contents/_CodeSignature/CodeResources'};assert mac['original']['bundleFiles'][0]==mac['sealed']['bundleFiles'][0]
command(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',mac['original']['preservedApp']],expected=1)
command(['/usr/bin/codesign','--verify','--deep','--strict','--verbose=4',mac['sealed']['derivedApp']])
display=command(['/usr/bin/codesign','-d','--verbose=4',mac['sealed']['derivedApp']]);assert 'Signature=adhoc'in display['stderr']and 'TeamIdentifier=not set'in display['stderr'];assert 'Identifier=com.local.notesclone'in display['stderr']
result['macArtifacts']={'bundles':bundles,'originalStrictVerifyExpectedFailurePreserved':True,'sealedStrictVerifyPass':True,'localAdhocOnly':True,'sealingChangesExactlyExecutableAndCodeResources':True,'noDeveloperIDOrNotarizationClaim':True}
# APK byte and every uncompressed ZIP entry identity; no cache execution/read needed.
android=collects[1];verify_id(android['preservedApk']);assert {k:v for k,v in android['preservedApk'].items()if k!='path'}=={k:v for k,v in builds[1]['buildOutputIdentity'].items()if k!='path'}
assert builds[1]['buildOutputIdentity']['sha256']==builds[1]['generatedOutputs'][0]['snapshot']['sha256'];assert builds[1]['temporaryGradleInitRemoved'];offline=builds[1]['androidOfflineProof'];assert offline['nonce']==builds[1]['nonce']and offline['offline']and offline['workers']==2 and offline['markerCount']==2
with zipfile.ZipFile(android['preservedApk']['path'])as z:
 rows=[];elf=[]
 for e in z.infolist():
  if e.is_dir():continue
  data=z.read(e.filename);rows.append({'path':e.filename,'bytes':len(data),'compressedBytes':e.compress_size,'sha256':sha(data)})
  if e.filename.startswith('lib/')and e.filename.endswith('.so'):
   assert data[:4]==b'\x7fELF'and data[4]==2 and data[5]==1;assert struct.unpack('<H',data[18:20])[0]==183;elf.append(e.filename)
 rows.sort(key=lambda r:r['path']);assert rows==android['allZipEntries']
 models=[r for r in rows if r['path'].startswith('assets/mlkit-google-ocr-models/')];expected={m['path']:(m['bytes'],m['sha256'])for aar in freezes[1]['ocrCache']for m in aar['models']};actual={m['path']:(m['bytes'],m['sha256'])for m in models};assert len(expected)==len(models)==25 and actual==expected;assert models==android['ocrModels'];assert sum(m['bytes']for m in models)==2490310
 abis=sorted({p.split('/')[1]for p in elf});assert abis==android['abis']==['arm64-v8a']
env=os.environ.copy();env['JAVA_HOME']='/opt/zerobrew/opt/openjdk@17';sig=command(android['signature']['argv'],env=env);assert 'Verified using v2 scheme (APK Signature Scheme v2): true'in sig['stdout'];certs=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)\s*$',sig['stdout'],re.M);assert certs==android['signerCertificateSha256']==['e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79']
result['androidArtifact']={'apk':android['preservedApk'],'allZipEntriesMatched':len(rows),'abis':abis,'elf64Aarch64Libraries':elf,'modelCount':len(models),'modelBytes':sum(m['bytes']for m in models),'modelHashesMatchFrozenCachedAarIdentities':True,'reopenedSharedCache':False,'signerCertificateSHA256':certs,'signatureV2VerifiedNow':True,'buildOfflineProof':offline,'candidate04CertificateMatchOnlyNotInstallAcceptance':True}
assert subprocess.check_output(['git','diff','HEAD','--name-only'],cwd=ROOT,text=True).strip()==''
result['verdict']='BUILD-IDENTITY-PASS';result['limits']='Exact recorded build input/product/package/signature/model/ABI identity only; no complete OS/SDK/transitive reproducibility, install, runtime, microphone/audio, ongoing recording, persistence, first-offline OCR or pixel acceptance.'
(OUT/'readonly-commands.json').write_text(json.dumps(commands,ensure_ascii=False,indent=2)+'\n');(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'verdict':result['verdict'],'sameSource':HEAD,'macOriginalZip':mac['original']['archive'],'macSealedZip':mac['sealed']['archive'],'android':android['preservedApk'],'allZipEntries':len(rows),'sourceTrackedDiffEmpty':True},ensure_ascii=False,indent=2))
