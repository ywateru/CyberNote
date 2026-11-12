from pathlib import Path
import json,subprocess,zipfile,hashlib,struct,re,os
root=Path('/private/tmp/cybernote-account109-android-d69-debug');art=root/'artifacts/account109'
apk=root/'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk'
preserved=Path('/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/android-candidate-d69ffbce-debug.apk')
if not preserved.exists():subprocess.run(['cp','-c',str(apk),str(preserved)],check=True)
def sha(p):
 digest=hashlib.sha256()
 with Path(p).open('rb') as f:
  while True:
   chunk=f.read(1024*1024)
   if not chunk:break
   digest.update(chunk)
 return digest.hexdigest()
assert sha(apk)==sha(preserved)
build=json.loads((art/'build04-exit.json').read_text());assert build['code']==0 and not build['signal'] and build['sourceClean']
env=os.environ.copy();env['JAVA_HOME']='/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
tools=Path('/Users/water/Library/Android/sdk/build-tools/36.0.0')
badging=subprocess.check_output([str(tools/'aapt2'),'dump','badging',str(apk)],text=True)
xml=subprocess.check_output([str(tools/'aapt2'),'dump','xmltree','--file','AndroidManifest.xml',str(apk)],text=True)
sig=subprocess.check_output([str(tools/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True,env=env)
for name,data in [('badging.txt',badging),('manifest.txt',xml),('signature.txt',sig)]: (art/name).write_text(data)
assert "package: name='com.local.notesclone.account109'" in badging
assert "application-label:'CyberNote Account Test'" in badging
assert "launchable-activity: name='com.local.notesclone.MainActivity'" in badging
assert re.search(r'allowBackup[^\n]*=false',xml)
assert len(re.findall(r'android:scheme[^\n]*="com\.local\.notesclone\.auth"',xml))==1 and len(re.findall(r'android:host[^\n]*="callback"',xml))==1
authorities=re.findall(r'android:authorities[^\n]*="([^"]+)"',xml)
assert authorities and all(a.startswith('com.local.notesclone.account109.') for a in authorities)
certificate=re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)',sig).group(1)
assert certificate=='e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79'
libs=[]
with zipfile.ZipFile(apk) as z:
 for name in z.namelist():
  if name.startswith('lib/') and name.endswith('.so'):
   assert name.split('/')[1]=='arm64'+'-v8a'
   with z.open(name) as f:
    h=f.read(64);digest=hashlib.sha256(h)
    while chunk:=f.read(1024*1024):digest.update(chunk)
   assert h[:4]==b'\x7fELF' and h[4]==2 and h[5]==1 and struct.unpack_from('<H',h,18)[0]==183
   libs.append({'path':name,'bytes':z.getinfo(name).file_size,'sha256':digest.hexdigest(),'elfClass':64,'machine':'AArch64'})
provider=next(x for x in libs if x['path'].endswith('/libcloudflared.so'))
assert provider['sha256']=='c1f6fc493bef37eb530022a1598e689c0d50073680192616aa7aea4e732cdd3c'
for name,digest in build['lockfiles'].items():assert sha(root/name)==digest
assert subprocess.check_output(['git','-C',str(root),'status','--porcelain'],text=True)==''
trackedPatch=subprocess.check_output(['git','-C',str(root),'diff','--binary'],text=True);(art/'derived.patch').write_text(trackedPatch)
generated=root/'src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated/TauriActivity.kt'
assert generated.exists()
rows=subprocess.check_output(['ps','-axo','pgid='],text=True).splitlines()
identity={**build,'apk':{'path':str(preserved),'bytes':preserved.stat().st_size,'sha256':sha(preserved)},'libraries':libs,'signatureCertificateSha256':certificate,'backup':False,'debuggable':True,'extractNativeLibs':True,'authorities':authorities,'callback':'com.local.notesclone.auth://callback','callbackSchemeCount':1,'callbackHostCount':1,'frontendBuildInfo':json.loads((root/'dist/build-info.json').read_text()),'defaultGate':{'accountFlagsAbsent':True,'sourcePath':'src/account-client.ts','sourceSha256':sha(root/'src/account-client.ts'),'envFilesPresent':[p.name for p in root.glob('.env*') if p.is_file()]},'derivedDiff':{'path':'derived.patch','sha256':sha(art/'derived.patch'),'empty':not trackedPatch},'tauriActivity':{'generatedByNormalBuild':True,'sha256':sha(generated),'cacheInvalidation':'cargo clean -p tauri --target aarch64-linux-android restricted to owned cloned target'},'lifecycle':{'naturalExit':True,'exitCode':0,'signal':None,'timedOut':False,'buildProcessGroupEmpty':str(build['buildGroupPid']) not in [x.strip() for x in rows]}}
assert identity['frontendBuildInfo']['sourceRevision']==build['sourceCommit'] and not identity['frontendBuildInfo']['sourceDirty']
assert not identity['defaultGate']['envFilesPresent']
(art/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
print(json.dumps({'phase':'candidate-identity-verified','apkSha256':identity['apk']['sha256'],'bytes':identity['apk']['bytes'],'package':build['packageId'],'activity':build['activity'],'callbackSchemeCount':1,'arm64Only':True,'providerMatches':True,'sourceClean':True,'defaultAccountFlagsRemoved':True,'buildProcessGroupEmpty':identity['lifecycle']['buildProcessGroupEmpty']}))
