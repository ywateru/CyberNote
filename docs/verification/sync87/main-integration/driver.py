import subprocess,json,time,hashlib,os,concurrent.futures
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone')
out=Path('/private/tmp/sync87-main-integration-final01')
def sources():
 paths=subprocess.check_output(['git','ls-files','-z','--','src','src-tauri','plugins','scripts/debug','scripts/sync84','scripts/sync-network-test','scripts/native','package.json','pnpm-lock.yaml','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','index.html','.cargo'],cwd=root).decode().split('\0')
 rows=[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in sorted(filter(None,paths)) if (root/p).is_file()]
 return {'files':rows,'sha256':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()}
before=sources(); head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n')
def run(name,args,env=None):
 start=time.monotonic()
 with (out/(name+'.log')).open('w') as f: result=subprocess.run(args,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
 row={'name':name,'args':args,'exitCode':result.returncode,'wallSeconds':round(time.monotonic()-start,3),'environmentOverrides':{k:env[k] for k in ['CARGO_NET_OFFLINE','CARGO_TARGET_DIR','CARGO_BUILD_JOBS'] if env and k in env}}
 (out/(name+'-run.json')).write_text(json.dumps(row,indent=2)+'\n');print(json.dumps(row),flush=True)
 return row
rows=[]
def frontend():
 rows.append(run('build',['pnpm','build']))
 if rows[-1]['exitCode']: return
 for name,args in [('production',['check-production','--production','dist']),('desktop',['all']),('mobile-notes',['group','notes','--mobile']),('mobile-recording',['group','recording','--mobile']),('mobile-attachments',['group','attachments','--mobile']),('mobile-sync-settings',['group','sync-settings','--mobile'])]:
  rows.append(run(name,['node','scripts/debug/cli.mjs',*args,'--out',str(out/name)]))
  if rows[-1]['exitCode']: return
def rust():
 for name,manifest,target in [('store','docs/verification/sync84-core-independent-01/runner/Cargo.toml','/private/tmp/apple-notes-sync84-target'),('network','scripts/sync-network-test/Cargo.toml','/private/tmp/apple-notes-sync85-target')]:
  env=os.environ.copy();env.update({'CARGO_NET_OFFLINE':'true','CARGO_TARGET_DIR':target,'CARGO_BUILD_JOBS':'2'})
  rows.append(run(name,['cargo','test','--offline','--locked','--manifest-path',manifest],env))
  if rows[-1]['exitCode']: return
 env=os.environ.copy();env.update({'CARGO_NET_OFFLINE':'true','CARGO_BUILD_JOBS':'2'})
 rows.append(run('tauri-check',['cargo','check','--offline','--locked','--manifest-path','src-tauri/Cargo.toml'],env))
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 futures=[pool.submit(frontend),pool.submit(rust)]
 for future in futures: future.result()
after=sources();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n')
result={'head':head,'runs':rows,'inputUnchanged':before==after,'status':'pass' if before==after and len(rows)==10 and all(r['exitCode']==0 for r in rows) else 'failed'}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n'); print(json.dumps(result),flush=True)
raise SystemExit(0 if result['status']=='pass' else 1)
