from pathlib import Path
import subprocess, time, hashlib, json, shutil, datetime
root=Path('/private/tmp/apple-notes-storage-overview81')
proof=root/'docs/verification/storage-overview81/recovery-fix'
proof.mkdir(parents=True, exist_ok=True)
def fingerprint():
    paths=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
    sources=[p for p in paths if p and not p.startswith('docs/')]
    files=[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in sources]
    return {'sha256':hashlib.sha256(json.dumps(files,separators=(',',':')).encode()).hexdigest(),'files':files}
before=fingerprint()
(proof/'source-before.json').write_text(json.dumps(before,indent=2)+'\n')
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip()
commands=[('typecheck',['pnpm','typecheck']),('build',['pnpm','build']),('specialist',['node','/private/tmp/storage81-recovery.mjs','/private/tmp/storage81-recovery-frozen-01'])]
results=[]
started=time.monotonic()
for name,args in commands:
    begin=time.monotonic()
    with (proof/(name+'.stdout')).open('wb') as out,(proof/(name+'.stderr')).open('wb') as err:
        run=subprocess.run(args,cwd=root,stdout=out,stderr=err)
    result={'name':name,'argv':args,'cwd':str(root),'exitCode':run.returncode,'wallMs':round((time.monotonic()-begin)*1000)}
    results.append(result)
    print(json.dumps(result),flush=True)
    if run.returncode: break
after=fingerprint()
(proof/'source-after.json').write_text(json.dumps(after,indent=2)+'\n')
report={'recordedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commit':commit,'commands':results,'wallMs':round((time.monotonic()-started)*1000),'sourceUnchanged':before==after}
(proof/'commands.json').write_text(json.dumps(report,indent=2)+'\n')
shutil.copyfile('/private/tmp/storage81-recovery-wrapper.py',proof/'frozen-wrapper.py')
shutil.copyfile('/private/tmp/storage81-recovery.mjs',proof/'browser-harness.mjs')
print(json.dumps(report),flush=True)
raise SystemExit(0 if len(results)==3 and all(r['exitCode']==0 for r in results) and before==after else 1)
