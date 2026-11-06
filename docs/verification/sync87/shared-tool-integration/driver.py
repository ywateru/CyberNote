import subprocess,json,time,concurrent.futures
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone');out=Path('/private/tmp/sync87-main-shared-tool-integration')
code="import {sourceFingerprint} from './scripts/debug/source-identity.mjs'; console.log(JSON.stringify(await sourceFingerprint(process.cwd())))"
def source():return json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=root,text=True))
before=source()
def run(name,args):
 start=time.monotonic()
 with (out/(name+'.stdout.log')).open('w') as a,(out/(name+'.stderr.log')).open('w') as b:r=subprocess.run(args,cwd=root,stdout=a,stderr=b)
 row={'name':name,'args':args,'exitCode':r.returncode,'wallSeconds':time.monotonic()-start};print(json.dumps(row),flush=True);return row
commands=[('notes',['node','scripts/debug/cli.mjs','group','notes','--out',str(out/'notes')]),('lan',['node','scripts/debug/sync87-routes.mjs','/private/tmp/sync86-transport-build11/notes-current-attachment-transport',str(root),str(out/'lan'),'lan','333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800'])]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:rows=list(pool.map(lambda x:run(*x),commands))
after=source();result={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'before':before,'after':after,'inputUnchanged':before==after,'runs':rows,'status':'pass' if before==after and all(r['exitCode']==0 for r in rows) else 'failed'}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');raise SystemExit(0 if result['status']=='pass' else 1)
