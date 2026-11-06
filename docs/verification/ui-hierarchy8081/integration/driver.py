import subprocess,sys,json,time,tempfile
from pathlib import Path
root=Path('/Users/water/work/2026/Apple-Notes-Clone')
out=Path(tempfile.mkdtemp(prefix='notes-ui8081-root-',dir='/private/tmp'))
source_code="import {sourceFingerprint} from './scripts/debug/source-identity.mjs'; console.log(JSON.stringify(await sourceFingerprint(process.cwd())))"
def fingerprint():
 return json.loads(subprocess.check_output(['node','--input-type=module','-e',source_code],cwd=root,text=True))
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
result={'head':head,'output':str(out),'start':fingerprint(),'runs':[]}
print('OUTPUT '+str(out),flush=True)
commands=[('build',['pnpm','build']),('production',['pnpm','debug','check-production','--production','dist','--out',str(out/'production')]),('desktop',['pnpm','test:debug','--out',str(out/'desktop')])]
for group in ['notes','recording','attachments']:
 commands.append(('mobile-'+group,['pnpm','debug','group',group,'--mobile','--out',str(out/('mobile-'+group))]))
failed=False
for name,command in commands:
 started=time.monotonic()
 with (out/(name+'.log')).open('w') as log:
  completed=subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT)
 row={'name':name,'command':command,'exitCode':completed.returncode,'wallSeconds':round(time.monotonic()-started,3),'log':str(out/(name+'.log'))}
 result['runs'].append(row);print(json.dumps(row),flush=True)
 if completed.returncode:
  failed=True;break
result['end']=fingerprint();result['inputUnchanged']=result['start']==result['end'];result['status']='pass' if not failed and result['inputUnchanged'] else 'failed'
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':result['status'],'output':str(out),'inputUnchanged':result['inputUnchanged']}),flush=True)
sys.exit(0 if result['status']=='pass' else 1)
