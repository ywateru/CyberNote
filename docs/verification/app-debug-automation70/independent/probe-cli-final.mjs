import {spawnSync,execFileSync} from 'node:child_process';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const base=resolve('docs/verification/app-debug-automation70/independent/final-cli');await mkdir(base,{recursive:true});
const cases=[['execute-proto',['execute','note.create','{"__proto__":"x"}']],['script-proto',{__raw:'[{"command":"note.create","args":{"__proto__":"x"}}]'}],...[[null,'null'],[false,'false'],[0,'zero'],['','empty']].map(([args,name])=>['script-'+name,{steps:[{command:'note.create',args}]}])];
const records=[];
for(const [name,input]of cases){let args;if(Array.isArray(input))args=input;else {const path=resolve(base,name+'.steps.json');await writeFile(path,input.__raw||JSON.stringify(input.steps));args=['script',path]}
const out=resolve(base,name); const start=performance.now();const r=spawnSync(process.execPath,['scripts/debug/cli.mjs',...args,'--out',out],{encoding:'utf8'});await writeFile(resolve(base,name+'.stdout'),r.stdout||'');await writeFile(resolve(base,name+'.stderr'),r.stderr||'');const failure=JSON.parse(await readFile(resolve(out,'failure.json'),'utf8'));assert.equal(r.status,1);assert.match(r.stderr,/INVALID_ARGUMENT/);assert.equal(failure.workspaceCounts.notes,2);assert.equal(failure.workspaceCounts.attachments,0);records.push({name,status:r.status,elapsedMs:Math.round(performance.now()-start),workspaceCounts:failure.workspaceCounts,message:failure.message,sourceInputs:failure.sourceInputs});}
const result={pass:true,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),records};await writeFile(resolve(base,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
