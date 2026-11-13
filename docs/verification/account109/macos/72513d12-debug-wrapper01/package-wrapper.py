import pathlib,subprocess,hashlib,json,plistlib,shutil,os
source='72513d1296df4526a08834db65a3427957d3fb50'
expected='187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459'
repo=pathlib.Path(__file__).resolve().parents[5]
original=pathlib.Path('/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-72513d12-debug-e2e-01/notes-clone')
out=pathlib.Path('/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-72513d12-debug-wrapper-01')
app=out/'CyberNote-Account109-72513d12.app'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(original)==expected and original.is_file() and not original.is_symlink()
before=original.stat();assert not out.exists()
sourcePlist=subprocess.check_output(['git','show',source+':src-tauri/Info.plist'],cwd=repo)
icon=subprocess.check_output(['git','show',source+':src-tauri/icons/icon.icns'],cwd=repo)
config=json.loads(subprocess.check_output(['git','show',source+':src-tauri/tauri.conf.json'],cwd=repo))
assert not config['bundle'].get('resources') and icon[:4]==b'icns'
contents=app/'Contents';(contents/'MacOS').mkdir(parents=True);(contents/'Resources').mkdir()
exe=contents/'MacOS/notes-clone'
# macOS cp -c requests clonefile (APFS COW); failure stops rather than copying 204MB.
subprocess.run(['/bin/cp','-c','-p',str(original),str(exe)],check=True)
assert sha(exe)==expected and exe.stat().st_ino!=before.st_ino and os.access(exe,os.X_OK)
info=plistlib.loads(sourcePlist)
info.update(CFBundleDevelopmentRegion='en',CFBundleExecutable='notes-clone',CFBundleIdentifier='com.local.notesclone.account109.debug72513d12',CFBundleName='CyberNote Account109 72513d12',CFBundleDisplayName='CyberNote Account109 72513d12',CFBundlePackageType='APPL',CFBundleShortVersionString='0.1.0',CFBundleVersion='1000',CFBundleInfoDictionaryVersion='6.0',CFBundleSupportedPlatforms=['MacOSX'],CFBundleIconFile='icon.icns',LSMinimumSystemVersion=config['bundle']['macOS']['minimumSystemVersion'],LSApplicationCategoryType='public.app-category.productivity',NSHighResolutionCapable=True,NSPrincipalClass='NSApplication')
(contents/'Info.plist').write_bytes(plistlib.dumps(info,sort_keys=True));(contents/'PkgInfo').write_bytes(b'APPL????');(contents/'Resources/icon.icns').write_bytes(icon)
commands=[]
def run(name,args):
 p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 (out/(name+'.txt')).write_text(p.stdout)
 commands.append({'name':name,'argv':args,'exitCode':p.returncode,'logSha256':sha(out/(name+'.txt'))})
 return p
assert run('plist-lint',['plutil','-lint',str(contents/'Info.plist')]).returncode==0
run('original-signature',['codesign','-dvvv',str(original)])
run('wrapper-signature',['codesign','-dvvv',str(app)])
run('original-signature-verify',['codesign','--verify','--strict','--verbose=2',str(original)])
run('wrapper-signature-verify',['codesign','--verify','--strict','--verbose=2',str(app)])
assert run('linked-libraries',['otool','-L',str(exe)]).returncode==0
jxa='ObjC.import("Foundation"); const b=$.NSBundle.bundleWithPath('+json.dumps(str(app))+'); if (!b) throw Error("Missing bundle"); JSON.stringify({bundleIdentifier:ObjC.unwrap(b.bundleIdentifier),bundlePath:ObjC.unwrap(b.bundlePath),executablePath:ObjC.unwrap(b.executablePath),displayName:ObjC.unwrap(b.objectForInfoDictionaryKey("CFBundleDisplayName"))});'
p=run('nsbundle-static',['osascript','-l','JavaScript','-e',jxa]);assert p.returncode==0
bundle=json.loads(p.stdout);assert bundle['bundleIdentifier']==info['CFBundleIdentifier'] and bundle['executablePath']==str(exe)
after=original.stat();assert sha(original)==expected and (before.st_ino,before.st_size,before.st_mtime_ns,before.st_mode)==(after.st_ino,after.st_size,after.st_mtime_ns,after.st_mode)
files={str(p.relative_to(out)):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(app.rglob('*')) if p.is_file()}
receipt={'schema':1,'status':'packaged-and-static-nsbundle-checked-only','sourceRevision':source,'originalBinary':str(original),'appPath':str(app),'bundleIdentifier':info['CFBundleIdentifier'],'displayName':info['CFBundleDisplayName'],'executable':str(exe),'binarySha256':expected,'copyMethod':'APFS clonefile via cp -c -p; independent inode, no hardlink','originalInode':before.st_ino,'wrapperInode':exe.stat().st_ino,'originalBytesModeMtimeInodeUnchanged':True,'sourceUsagePlistSha256':hashlib.sha256(sourcePlist).hexdigest(),'sourceIconSha256':hashlib.sha256(icon).hexdigest(),'files':files,'nsbundle':bundle,'commands':commands,'signatureBoundary':'Original linker ad-hoc signature retained byte-for-byte. No signing identity added; wrapper is not a signed/sealed production app. Read exact verification results.','isolationBoundary':'Bundle ID/name only; compiled Tauri identifier remains com.local.notesclone. Caller must retain approved isolated store/environment. Wrapper does not isolate storage or retrofit an already-running plain process.','notPerformed':['App launch','NSWorkspace launch or registration','CUA/AX access','build','target access','signing','device/ADB','network','user app replacement','store or credential access']}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'appPath':str(app),'binarySha256':sha(exe),'bundleIdentifier':info['CFBundleIdentifier'],'commands':[{'name':c['name'],'exitCode':c['exitCode']} for c in commands]},indent=2))
