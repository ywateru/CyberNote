from pathlib import Path
import hashlib,json,shutil,struct,subprocess,os,zipfile
root=Path('/private/tmp/cybernote-account109-login-surfaces')
out=Path('/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/android-88b2dabe-debug-01')
target=Path('/private/tmp/cybernote-account109-mac-ec4348c6-target-01')
source='88b2dabe4bb898b0bf225e913883b43ed2cac865'
assert json.loads((out/'build-record.json').read_text())['status']=='build-only-passed'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==source
apk=root/'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk'
copy=out/'CyberNote-account109-debug.apk'
assert not copy.exists()
shutil.copy2(apk,copy)
def sha(data):return hashlib.sha256(data).hexdigest()
libs={}
with zipfile.ZipFile(copy) as z:
 names=z.namelist()
 for name in names:
  if not(name.startswith('lib/') and name.endswith('.so')):continue
  b=z.read(name)
  assert b[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',b,18)[0]==183,name
  libs[name]={'bytes':len(b),'sha256':sha(b)}
  if name.endswith('/libnotes_clone_lib.so'):
   assert b==(target/'aarch64-linux-android/debug/libnotes_clone_lib.so').read_bytes()
   assert b'https://cybernote-sync.aixgg.com' in b
   assert b'https://cybernote-sync.vercel.app' in b
  if name.endswith('/libcloudflared.so'):
   vendor=list((root/'vendor/cybergrid-sdk/provider-assets/android-arm64/jniLibs').glob('*/libcloudflared.so'))
   assert len(vendor)==1 and b==vendor[0].read_bytes()
 assert any(b'Lcom/local/notesauth/NotesAuthPlugin;' in z.read(n) for n in names if n.startswith('classes') and n.endswith('.dex'))
args=['node','scripts/publish/package-identity.mjs',str(target/'aarch64-linux-android/debug/libnotes_clone_lib.so'),str(target/'aarch64-linux-android/debug/build')]
identity=subprocess.check_output(args,cwd=root)
(out/'embedded-identity.json').write_bytes(identity)
android_tools=Path('/Users/water/Library/Android/sdk/build-tools/36.0.0')
badging=subprocess.check_output([str(android_tools/'aapt2'),'dump','badging',str(copy)],text=True)
assert "package: name='com.local.notesclone.account109'" in badging
assert "launchable-activity: name='com.local.notesclone.MainActivity'" in badging
assert 'application-debuggable' in badging
(out/'badging.txt').write_text(badging)
env=os.environ.copy();env['JAVA_HOME']='/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
signature=subprocess.check_output([str(android_tools/'apksigner'),'verify','--verbose','--print-certs',str(copy)],env=env,text=True)
assert 'CN=Android Debug' in signature
(out/'signature.txt').write_text(signature)
info=json.loads((root/'dist/build-info.json').read_text())
assert info['sourceRevision']==source and not info['sourceDirty'] and info['target']=='android'
record={'schema':1,'sourceRevision':source,'apk':{'path':str(copy),'bytes':copy.stat().st_size,'sha256':sha(copy.read_bytes())},'nativeLibraries':libs,'frontendBuildInfo':info,'allPackagedLibrariesElf64Aarch64':True,'packagedAppLibraryEqualsCargoOutput':True,'cloudflaredEqualsPinnedVendorBytes':True,'embeddedIdentityVerified':True,'nativeAuthPluginInDex':True,'newTransportAndOldEnrollmentIssuerLiteralsPresent':True,'debugSignatureVerified':True,'appLaunched':False,'adbUsed':False}
(out/'package-record.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record['apk'],indent=2))
