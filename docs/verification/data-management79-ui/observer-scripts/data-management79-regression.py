import json, os, subprocess, time
root='/private/tmp/apple-notes-data79-ui'
output='/private/tmp/data-management79-ui-frozen-'+str(os.getpid())
os.makedirs(output)
fingerprint_command=['node','--input-type=module','-e','import {sourceFingerprint} from "./scripts/debug/source-identity.mjs";console.log(JSON.stringify(await sourceFingerprint(process.cwd()),null,2))']
def identity():
 return {'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'inputs':json.loads(subprocess.check_output(fingerprint_command,cwd=root,text=True))}
source_at_start=identity()
with open(output+'/source-start.json','w') as f:json.dump(source_at_start,f,indent=2)
commands=[
 ['build',['pnpm','build']],
 ['production',['pnpm','debug','check-production','--production','dist','--out',output+'/production']],
 ['desktop',['pnpm','test:debug','--out',output+'/desktop']],
 ['mobile-notes',['pnpm','debug','group','notes','--mobile','--out',output+'/mobile-notes']],
 ['mobile-recording',['pnpm','debug','group','recording','--mobile','--out',output+'/mobile-recording']],
 ['mobile-attachments',['pnpm','debug','group','attachments','--mobile','--out',output+'/mobile-attachments']]
]
results=[]
for name, command in commands:
 start=time.monotonic()
 with open(output+'/'+name+'.log','wb') as logfile:
  completed=subprocess.run(command,cwd=root,stdout=logfile,stderr=subprocess.STDOUT)
 result=dict(name=name,command=command,exitCode=completed.returncode,wallMs=round((time.monotonic()-start)*1000))
 results.append(result)
 with open(output+'/commands.json','w') as file:json.dump(dict(output=output,sourceAtStart=source_at_start,results=results),file,indent=2)
 print(json.dumps(result),flush=True)
 if completed.returncode:break
with open(output+'/source-end.json','w') as f:json.dump(identity(),f,indent=2)
print(output,flush=True)
