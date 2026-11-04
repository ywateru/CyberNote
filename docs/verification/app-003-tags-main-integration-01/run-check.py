from pathlib import Path
import subprocess,sys,shutil,json,datetime,os,time
root=Path(__file__).resolve().parents[3]
out=Path(__file__).resolve().parent
name=sys.argv[1]; command=sys.argv[2:]
free=shutil.disk_usage(root).free
meta={"name":name,"command":command,"cwd":str(root),"startedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"freeBefore":free}
assert free>=2*1024**3,"Less than 2 GiB; stage not started"
env=os.environ.copy();env.update(NOTES_TAG_STORE_BINARY=str(root/"src-tauri/target/debug/notes-qa-fix-store"),PLAYWRIGHT_CORE_PATH="/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs",CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
t=time.monotonic()
with (out/"raw"/(name+".txt")).open("wb") as log:
 r=subprocess.run(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
meta.update(exitCode=r.returncode,seconds=time.monotonic()-t,freeAfter=shutil.disk_usage(root).free,endedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
(out/(name+"-execution.json")).write_text(json.dumps(meta,indent=2)+"\n")
print(json.dumps(meta,indent=2));print((out/"raw"/(name+".txt")).read_text()[-3000:]);sys.exit(r.returncode)
