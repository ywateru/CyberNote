import json, os, subprocess, time
root='/private/tmp/apple-notes-recording-indicator78'
output='/private/tmp/recording-indicator78-frozen-'+str(os.getpid())
os.makedirs(output)
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
 with open(output+'/commands.json','w') as file: json.dump(dict(output=output,results=results),file,indent=2)
 print(json.dumps(result),flush=True)
 if completed.returncode: break
print(output,flush=True)
