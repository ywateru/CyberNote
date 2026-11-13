import subprocess,pathlib,hashlib,json,sys
root=pathlib.Path(sys.argv[1]); source='88b2dabe4bb898b0bf225e913883b43ed2cac865'
git=lambda *args:subprocess.check_output(['git',*args],cwd=root)
assert git('rev-parse','HEAD').decode().strip()==source
assert not git('status','--porcelain','--untracked-files=normal')
roots=['src','public','plugins','src-tauri','crates','vendor','index.html','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','patches','tsconfig.json','vite.config.ts','scripts/android.mjs','scripts/build-info.mjs','scripts/versions.mjs','scripts/release.mjs','scripts/native']
excluded={'target','node_modules','.git','.gradle','build','dist','artifacts','.DS_Store','local.properties','tauri.properties'}
generatedFiles={'src-tauri/gen/android/tauri.settings.gradle','src-tauri/gen/android/app/tauri.build.gradle.kts','src-tauri/gen/android/app/proguard-tauri.pro'}
generatedDirs=['src-tauri/gen/schemas','src-tauri/gen/android/.tauri','src-tauri/gen/android/.kotlin','src-tauri/gen/android/app/src/main/assets','src-tauri/gen/android/app/src/main/jniLibs','src-tauri/gen/android/app/src/main/java/com/local/notesclone/generated']
expected=[]
for row in git('ls-tree','-r','-z',source).split(b'\0'):
 if not row:continue
 meta,name=row.split(b'\t'); path=name.decode();parts=path.split('/')
 if not any(path==r or path.startswith(r+'/') for r in roots):continue
 if any(x in excluded for x in parts) or path.endswith(('.log','.tsbuildinfo')) or path in generatedFiles:continue
 if any(path==p or path.startswith(p+'/') for p in generatedDirs):continue
 if len(parts)>=4 and parts[0]=='plugins' and parts[2:4]==['android','.tauri']:continue
 mode,typ,oid=meta.split();assert typ==b'blob' and mode in [b'100644',b'100755']
 expected.append((path,oid.decode()))
actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {productFiles,sourceIdentity} from './scripts/build-info.mjs'; console.log(JSON.stringify({files:productFiles(process.cwd()),identity:sourceIdentity(process.cwd(),{metadataPath:null})}));"],cwd=root))
assert actual['files']==sorted(p for p,_ in expected),'Git tree vs materialized product path mismatch'
for path,oid in expected:
 p=root/path;assert p.is_file() and not p.is_symlink(),path
 assert git('hash-object','--no-filters','--',path).decode().strip()==oid,path
locks=['pnpm-lock.yaml','src-tauri/Cargo.lock','crates/account-auth/Cargo.lock','services/coordinator/package-lock.json']
for path in locks: assert (root/path).read_bytes()==git('show',source+':'+path)
result={'sourceRevision':source,'sourceTree':git('rev-parse','HEAD^{tree}').decode().strip(),'identity':actual['identity'],'fullGitTreeExpectedProductInputs':len(expected),'missingInputs':0,'changedInputBytes':0,'fourLocks':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in locks},'sparsePatterns':(root/pathlib.Path(git('rev-parse','--git-path','info/sparse-checkout').decode().strip())).read_text()}
print(json.dumps(result,indent=2))
