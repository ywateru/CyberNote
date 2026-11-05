#!/usr/bin/env python3
"""Read fixed Android13 evidence/APKs. Writes only this independent directory."""
from pathlib import Path
import ast,datetime,hashlib,json,os,re,stat,subprocess,zipfile
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone')
OUT=Path(__file__).resolve().parent
RUN=ROOT/'docs/verification/unified-candidate06/android-recording-wave-build13'
ATT=RUN/'android-attempt01'
AUTH=ROOT/'docs/verification/unified-candidate06/recording-wave60-preparation/android-authorization.json'
SOURCE='a236b311d7d6dcb33b0ee4f16977ebe2d2adf8ac'
FREEZE='67e9f04668c9d4e9049249d3326f9faf4ea84adff644e92914f665888a5df01e'
APK=ROOT/'artifacts/unified-candidate06/android-recording-wave-build13/android-attempt01/android-original.apk'
APK_SHA='60aa7ff23ccc91e18fd027b1bb0a9d1ce21b01410275b86f05cccee40f15358b'
checks=[]
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def load(p):return json.loads(Path(p).read_text())
def write(name,data): (OUT/name).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
def check(name,condition,detail=None):
 checks.append({'name':name,'pass':bool(condition),'detail':detail})
 assert condition,name
 print('PASS',name,flush=True)
def identity(p,relative=None):return {'path':str(p)if relative is None else relative,'bytes':Path(p).stat().st_size,'sha256':sha(p)}
def aggregate(rows):return hashlib.sha256(''.join(row['sha256']+'  '+row['path']+'\n'for row in rows).encode()).hexdigest()
def tree(p):
 result=[]
 for f in sorted(Path(p).rglob('*')):
  rel=str(f.relative_to(p))
  if f.is_symlink():
   target=os.readlink(f);result.append({'path':rel,'type':'symlink','target':target,'sha256':hashlib.sha256(target.encode()).hexdigest()})
  elif f.is_file():result.append({**identity(f,rel),'type':'file','mode':f.stat().st_mode&0o777})
 return result
def snapshot(p,kind):
 p=Path(p)
 check('no symlink output ancestors '+str(p),not any(x.is_symlink()for x in [p,*p.parents]))
 s=p.stat();result={'kind':kind,'device':s.st_dev,'inode':s.st_ino,'mode':s.st_mode&0o777}
 if kind=='file':result.update(bytes=s.st_size,sha256=sha(p))
 else:result.update(directories=sorted([{'path':str(d.relative_to(p)),'mode':d.stat().st_mode&0o777}for d in p.rglob('*')if d.is_dir()and not d.is_symlink()],key=lambda r:r['path']),files=tree(p))
 return result
def ziprows(p,prefix=None):
 result=[]
 with zipfile.ZipFile(p)as z:
  names=z.namelist();check('ZIP unique names '+str(p),len(names)==len(set(names)))
  for i in sorted(z.infolist(),key=lambda i:i.filename):
   if i.is_dir()or(prefix and not i.filename.startswith(prefix)):continue
   h=hashlib.sha256()
   with z.open(i)as f:
    for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
   result.append({'path':i.filename,'bytes':i.file_size,'compressedBytes':i.compress_size,'sha256':h.hexdigest()})
 return result

def main():
 a=load(AUTH);f=load(RUN/'input-freeze.json');b=load(ATT/'result.json');c=load(ATT/'collection/result.json');idx=load(RUN/'evidence-index.json')
 required={'schema','stage','root','sourceHead','productAggregate','productPaths','inputPaths','runDirectory','artifactDirectory'}
 check('authorization exactly nine fields',set(a)==required and a['schema']==1 and a['stage']=='android')
 check('exact source/root/run/artifact authorization',a['sourceHead']==SOURCE and a['root']==str(ROOT)and a['runDirectory']==str(RUN)and a['artifactDirectory']==str(ROOT/'artifacts/unified-candidate06/android-recording-wave-build13'))
 check('sorted unique explicit 334 product / 353 complete paths',all(a[k]==sorted(set(a[k]))for k in ['productPaths','inputPaths'])and len(a['productPaths'])==334 and len(a['inputPaths'])==353 and set(a['productPaths'])<=set(a['inputPaths']))
 check('freeze exact SHA and nested authorization/source',sha(RUN/'input-freeze.json')==FREEZE and f['authorization']==a and f['head']==SOURCE and f['stage']=='android')
 check('authorized Git object is a commit',subprocess.check_output(['git','cat-file','-t',SOURCE],cwd=ROOT,text=True).strip()=='commit')
 rootHeadAtStart=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 tracked=set(subprocess.check_output(['git','ls-tree','-r','--name-only',SOURCE],cwd=ROOT,text=True).splitlines())
 rows=[]; nontracked=[]
 for row in f['files']:
  p=ROOT/row['path']
  if row['path'] in tracked:
   raw=subprocess.check_output(['git','show',SOURCE+':'+row['path']],cwd=ROOT)
   actual={'path':row['path'],'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
  else:
   actual=identity(p,row['path']);nontracked.append(row['path'])
   if p.is_symlink():actual['symlinkTarget']=os.readlink(p)
  assert actual==row,row['path'];rows.append(actual)
 check('353 inputs match freeze: exact historical Git objects plus19 actual nontracked',len(rows)==353 and len(nontracked)==19 and [r['path']for r in rows]==a['inputPaths'],{'historicalTracked':334,'currentNontracked':nontracked})
 product=[r for r in rows if r['path']in set(a['productPaths'])]
 check('334 product rows and both aggregates independently recomputed',product==f['productFiles']and aggregate(product)==a['productAggregate']==f['productAggregate']and aggregate(rows)==f['aggregate'])
 for row in product:
  r=subprocess.run(['git','show',SOURCE+':'+row['path']],cwd=ROOT,capture_output=True)
  assert r.returncode==0 and len(r.stdout)==row['bytes']and hashlib.sha256(r.stdout).hexdigest()==row['sha256'],row['path']
 check('334 product bytes equal exact source Git objects',True)
 previous=load(ROOT/'docs/verification/unified-candidate06/recording-visual5859-preparation/android-authorization.json')
 check('all Android12 paths retained; only wave60 script path added',all(set(a[k])-set(previous[k])=={'scripts/check-mobile-recording-wave60.mjs'}and set(previous[k])<=set(a[k])for k in ['productPaths','inputPaths']))
 comparisons={}
 for name in ['inputs-before.json','inputs-after.json','collection/inputs-before-collection.json','collection/inputs-after-collection.json']:
  actual=load(ATT/name);comparisons[name]={key:f[key]==actual[key]for key in f if key!='at'}
  check('15 frozen fields unchanged '+name,len(comparisons[name])==15 and all(comparisons[name].values()))
 write('input-comparisons.json',comparisons);write('actual-inputs.json',{'product':product,'complete':rows,'productAggregate':aggregate(product),'inputAggregate':aggregate(rows)})
 for row in f['tools']:assert identity(ROOT/'docs/verification/unified-candidate06/preparation'/row['path'],row['path'])==row
 check('all seven frozen build-tool source files match actual bytes',len(f['tools'])==7)
 sup=f['supplementalInputs'];overlay=Path(f['effectiveBuildEnvironment']['GRADLE_RO_DEP_CACHE'])
 overlayRows=[identity(overlay/row['path'],row['path'])for row in sup['overlayFiles']]
 check('read-only overlay identities and aggregate',overlayRows==sup['overlayFiles']and aggregate(overlayRows)==sup['overlayAggregate']and all(not p.is_symlink()and not(p.stat().st_mode&0o222)for p in [overlay,*overlay.rglob('*')]))
 check('all 701 Gradle distribution rows match actual bytes/modes',str(Path(sup['distributionPath']).resolve())==sup['distributionResolved']and tree(sup['distributionPath'])==sup['distributionFiles']and len(sup['distributionFiles'])==701)
 check('Gradle distribution completion marker exact identity',identity(sup['okFile']['path'])==sup['okFile']and str(Path(sup['okFile']['path']).resolve())==sup['okResolved'])
 prefix='assets/mlkit-google-ocr-models/';models={}
 for aar in f['ocrCache']:
  assert identity(aar['path'])=={k:aar[k]for k in ['path','bytes','sha256']}
  aarModels=ziprows(aar['path'],prefix);assert aarModels==aar['models'];models.update({m['path']:(m['bytes'],m['sha256'])for m in aarModels})
 check('four exact frozen OCR AARs; independently rehashed 25 models',len(f['ocrCache'])==4 and len(models)==25)
 check('build and collector exact source/freeze/aggregates',all(x['expectedHead']==SOURCE and x['freezeSha256']==FREEZE and x['productAggregate']==aggregate(product)and x['sourceAggregate']==aggregate(rows)for x in [b,c]))
 check('successful bounded owned build and ready collector',b['command']==['pnpm','android:build','--debug']and b['exitCode']==0 and b['ownedGroupStopped']and not b['remainingOwnedGroupMembers']and b['elapsedSeconds']<600 and c['ready']and not any(k in b for k in ['error','invalidated','offlineMarkerMissing','cleanupError','stopReason','groupCleanupError']))
 nonce=b['nonce'];log=(ATT/'build.txt').read_text();markers=[l.strip()for l in log.splitlines()if 'CANDIDATE06_OFFLINE='in l]
 expected='CANDIDATE06_OFFLINE=true workers=2 configurationCacheJvmProperty=false nonce='+nonce
 proof={'nonce':nonce,'offline':True,'workers':2,'configurationCacheJvmProperty':'false','markerCount':len(markers)}
 check('current nonce offline/workers2/cache-false from raw build log',bool(re.fullmatch('[0-9a-f]{32}',nonce))and markers==[expected,expected]and proof==b['androidOfflineProof']and c['buildNonce']==nonce and not re.search(r'reusing\s+(?:the\s+)?configuration cache|configuration cache(?: entry)?\s+(?:was\s+)?reused',log,re.I))
 check('child environment exactly frozen',b['explicitEnvironmentOverrides']==f['effectiveBuildEnvironment']and f['effectiveBuildEnvironment']['CARGO_NET_OFFLINE']=='true'and f['effectiveBuildEnvironment']['GRADLE_OPTS']=='-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false')
 method=next(n for n in ast.parse((ROOT/'docs/verification/unified-candidate06/preparation/common.py').read_text()).body if isinstance(n,ast.FunctionDef)and n.name=='android_offline_init');ns={'re':re};exec(compile(ast.Module(body=[method],type_ignores=[]),'frozen-init-pure-function','exec'),ns)
 init=ns['android_offline_init'](nonce).encode();record=b['temporaryGradleInit'];clean=b['temporaryGradleInitBeforeCleanup']
 check('owned temporary init identity, exact generated bytes and cleanup',record['sha256']==hashlib.sha256(init).hexdigest()and record['bytes']==len(init)and all(clean[k]==v for k,v in record.items())and clean['regularFile']and b['temporaryGradleInitRemoved']and not Path(record['path']).exists())
 isolation=load(ATT/'output-isolation.json');generated=load(ATT/'generated-outputs.json')
 check('generated/isolation JSON exactly matches build result',isolation==b['outputIsolation']and generated==b['generatedOutputs']and isolation['policy']=='atomic-rename-final-output-and-dist'and isolation['sourcePathsAbsentBeforeCommand']and len(generated)==2)
 for old,new in zip(isolation['outputs'],generated):
  check('preserved prior '+old['name']+' exact device/inode/bytes/mode',snapshot(old['preserved'],old['kind'])==old['before'])
  if old['name']=='application':
   check('fresh generated application exact device/inode/bytes/mode',snapshot(new['source'],old['kind'])==new['snapshot']and new['snapshot']['inode']!=old['before']['inode'])
  else:
   write('later-root-dist-observation.json',{'recordedAtAndroid13':new,'observedAfterTask63Merge':snapshot(new['source'],old['kind']),'rootHeadObserved':rootHeadAtStart,'limit':'Current mutable dist may be rebuilt after APK13; not used to bind historical APK13. Historical fresh snapshot independently cross-checks collector and preserved APK assets below.'})
   check('historical fresh dist has separate inode and equals build-dist record',new['snapshot']['inode']!=old['before']['inode']and new['snapshot']['files']==b['dist'])
 check('collector all 15 comparisons and supplemental invariance',len(c['inputComparisons'])==15 and all(c['inputComparisons'].values())and c['supplementalInputsUnchangedDuringCollection']and len(b['inputComparisons'])==15 and all(b['inputComparisons'].values())and b['supplementalInputsUnchanged'])
 check('collector build-result reference actual bytes',c['buildResult']==identity(ATT/'result.json'))
 check('exact APK size and SHA',APK.stat().st_size==180721914 and sha(APK)==APK_SHA and identity(APK)==c['preservedApk']and sha(c['apk']['path'])==APK_SHA)
 entries=ziprows(APK);write('apk-entries.json',entries)
 abis=sorted({e['path'].split('/')[1]for e in entries if e['path'].startswith('lib/')and e['path'].endswith('.so')});apkmodels=[e for e in entries if e['path'].startswith(prefix)]
 check('independent APK entire ZIP bytes equal all 1066 collector rows',entries==c['allZipEntries']and len(entries)==1066)
 entryMap={e['path']:e for e in entries}
 for row in b['dist']:
  member=entryMap['assets/'+row['path']]
  assert member['bytes']==row['bytes']and member['sha256']==row['sha256'],row['path']
 check('all four historical built dist files match exact APK13 assets',len(b['dist'])==4)
 check('arm64-v8a only and 25 exact cached OCR models',abis==c['abis']==['arm64-v8a']and apkmodels==c['ocrModels']and {m['path']:(m['bytes'],m['sha256'])for m in apkmodels}==models and sum(m['bytes']for m in apkmodels)==c['ocrModelBytes']==2490310)
 signer='/Users/water/Library/Android/sdk/build-tools/36.0.0/apksigner';signatures=[]
 for label,path in [('android13',APK),('candidate04',ROOT/'artifacts/unified-candidate04/NotesClone-android-arm64.apk')]:
  argv=[signer,'verify','--verbose','--print-certs',str(path)]
  r=subprocess.run(argv,capture_output=True,text=True,env={**os.environ,'JAVA_HOME':'/opt/zerobrew/opt/openjdk@17'},timeout=30)
  record={'label':label,'argv':argv,'exit':r.returncode,'apk':identity(path),'stdout':r.stdout,'stderr':r.stderr};signatures.append(record)
  assert r.returncode==0 and 'Verified using v2 scheme (APK Signature Scheme v2): true'in r.stdout
  record['certificates']=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]+)$',r.stdout,re.M)
 check('actual apksigner v2 signature and exact existing candidate04 signer',signatures[0]['certificates']==signatures[1]['certificates']==c['signerCertificateSha256']==['e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'])
 write('independent-signatures.json',signatures)
 check('sealed build evidence index exact authorized SHA',sha(RUN/'evidence-index.json')=='be7a51267edca42cbe36aa1162c3922e96455328ad3409e246edd413c363fff5')
 actualIndex=[identity(ROOT/row['path'],row['path'])for row in idx['files']]
 check('15 actual indexed files incl13docs+2artifacts byte-identical',actualIndex==idx['files']and len(actualIndex)==15 and sum(x['path'].startswith('docs/')for x in actualIndex)==13 and sum(x['path'].startswith('artifacts/')for x in actualIndex)==2)
 write('verified-build-index.json',{'index':identity(RUN/'evidence-index.json'),'files':actualIndex})
 check('historical source exists; freeze/APK remain unchanged after review',sha(RUN/'input-freeze.json')==FREEZE and sha(APK)==APK_SHA and subprocess.check_output(['git','cat-file','-t',SOURCE],cwd=ROOT,text=True).strip()=='commit')
 write('result.json',{'status':'PASS-local-artifact-only','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'native_ui_research; neither task60 product author nor Android13 build author','sourceHead':SOURCE,'rootHeadAtStart':rootHeadAtStart,'rootHeadAtEnd':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'productScope':'APK13 contains task60, excludes later task63 source','freezeSha256':FREEZE,'apk':identity(APK),'checks':checks,'limits':'Read-only fixed files and apksigner verification only. No build, install, ADB, GUI, audio, runtime OCR, permission, recording or pixel acceptance.'})
if __name__=='__main__':
 try:main()
 except BaseException as e:
  write('failure.json',{'error':repr(e),'checks':checks});raise
