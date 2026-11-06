import { sourceFingerprint } from '../../../../scripts/debug/source-identity.mjs';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=process.cwd(), out=resolve('docs/verification/sync86-frontend/independent');
const before=await sourceFingerprint(root), runs=[];
for(const [name,command,args] of [
 ['fixture','node',['scripts/debug/sync-window.mjs',resolve(out,'fixture')]],
 ['notes','node',['scripts/debug/cli.mjs','group','notes','--out',resolve(out,'notes')]],
 ['build','pnpm',['build']],
 ['production','node',['scripts/debug/cli.mjs','check-production','--production','dist','--out',resolve(out,'production')]],
 ['diff-check','git',['diff','--check']]
]) {
 const started=performance.now(); let log='';
 const result=await new Promise((done)=>{ const child=spawn(command,args,{cwd:root}); child.stdout.on('data',b=>log+=b); child.stderr.on('data',b=>log+=b); child.on('close',(code,signal)=>done({code,signal})); });
 await writeFile(resolve(out,name+'.log'),log);
 const run={name,command:[command,...args],cwd:root,...result,elapsedMs:Math.round(performance.now()-started)};runs.push(run); console.log(JSON.stringify(run));
}
const after=await sourceFingerprint(root);await writeFile(resolve(out,'runs.json'),JSON.stringify({before,after,sourceChanged:before.sha256!==after.sha256,runs},null,2)+'\n');
if(runs.some(r=>r.code!==0)) process.exitCode=1;
