import os,subprocess,time,json,pathlib
root=pathlib.Path('/private/tmp/apple-notes-data79-backend');out=pathlib.Path('/private/tmp/data79-kotlin-frozen-01');out.mkdir()
env={**os.environ,'NOTES_SCAN_TAURI_ANDROID':'/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/tauri-2.12.5/mobile/android','NOTES_SCAN_GRADLE':'/Users/water/.gradle/wrapper/dists/gradle-9.6.1-bin/4ticwg1pgcbps2hj28r8so764/gradle-9.6.1/bin/gradle','ANDROID_HOME':'/Users/water/Library/Android/sdk'}
args=['bash','plugins/tauri-plugin-notes-scan/scripts/check-android.sh','--offline','testDebugUnitTest','compileDebugKotlin']
t=time.monotonic();p=subprocess.run(args,cwd=root,env=env,capture_output=True,text=True)
(out/'stdout.log').write_text(p.stdout);(out/'stderr.log').write_text(p.stderr)
report={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'command':args,'cwd':str(root),'environment':{k:env[k] for k in env if k not in os.environ or os.environ[k]!=env[k]},'gradleHome':'/private/tmp/notes-scan-gradle-home','exitCode':p.returncode,'wallSeconds':time.monotonic()-t}
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report),flush=True)
