import os,subprocess,time,json,pathlib
root=pathlib.Path('/private/tmp/apple-notes-data79-backend');out=pathlib.Path('/private/tmp/data79-rust-frozen-01');out.mkdir()
env={**os.environ,'CARGO_TARGET_DIR':'/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target'}
commands=[('build',['node','scripts/debug/build-rust-attachments.mjs','/private/tmp/data79-rust-build-02']),('scenario',['node','scripts/check-data-management-rust79.mjs','/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-current-attachment-transport','/private/tmp/data79-rust-validation-04'])]
report={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'commands':[]}
for name,args in commands:
 t=time.monotonic();p=subprocess.run(args,cwd=root,env=env,capture_output=True,text=True)
 (out/(name+'.stdout')).write_text(p.stdout);(out/(name+'.stderr')).write_text(p.stderr)
 row={'name':name,'command':args,'cwd':str(root),'environment':{'CARGO_TARGET_DIR':env['CARGO_TARGET_DIR']},'exitCode':p.returncode,'wallSeconds':time.monotonic()-t}
 report['commands'].append(row);(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(row),flush=True)
 if p.returncode:break
