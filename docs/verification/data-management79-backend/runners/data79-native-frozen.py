import os,subprocess,time,json,hashlib,pathlib
root=pathlib.Path('/private/tmp/apple-notes-data79-backend')
out=pathlib.Path('/private/tmp/data79-native-frozen-01');out.mkdir()
base=os.environ.copy();base['CARGO_TARGET_DIR']='/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target'
ndk='/Users/water/Library/Android/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/darwin-x86_64/bin'
android={**base,'CC_aarch64_linux_android':ndk+'/aarch64-linux-android26-clang','CXX_aarch64_linux_android':ndk+'/aarch64-linux-android26-clang++','AR_aarch64_linux_android':ndk+'/llvm-ar','CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER':ndk+'/aarch64-linux-android26-clang','ANDROID_HOME':'/Users/water/Library/Android/sdk','ANDROID_NDK_HOME':'/Users/water/Library/Android/sdk/ndk/27.2.12479018'}
commands=[('mac-cargo-check',['cargo','check','--locked','--offline','--manifest-path','src-tauri/Cargo.toml'],base),('android-cargo-check',['cargo','check','--locked','--offline','--manifest-path','src-tauri/Cargo.toml','--lib','--target','aarch64-linux-android'],android)]
report={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'commands':[]}
for name,args,env in commands:
 t=time.monotonic();p=subprocess.run(args,cwd=root,env=env,capture_output=True,text=True)
 (out/(name+'.stdout')).write_text(p.stdout);(out/(name+'.stderr')).write_text(p.stderr)
 row={'name':name,'command':args,'cwd':str(root),'environment':{k:env[k] for k in env if k not in os.environ or os.environ[k]!=env[k]},'exitCode':p.returncode,'wallSeconds':time.monotonic()-t}
 report['commands'].append(row);(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(row),flush=True)
