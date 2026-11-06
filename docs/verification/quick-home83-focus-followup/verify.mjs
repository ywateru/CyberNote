import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { openRuntime, api, idle, saveJSON, snapshot } from '../../../scripts/debug/runtime.mjs';
import { sourceFingerprint } from '../../../scripts/debug/source-identity.mjs';
import { runStorageOverview } from '../../../scripts/debug/storage-overview.mjs';
const output=resolve('docs/verification/quick-home83-focus-followup/frozen-storage');
await mkdir(output,{recursive:true});
const root=process.cwd(),before=await sourceFingerprint(root),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const runtime=await openRuntime({mobile:true});
const checks=[],started=performance.now();
const check=(label,passed)=>{if(!passed)throw Error(label);checks.push(label);};
const command=async(id,args={})=>{const value=await api(runtime.page,id,args);await idle(runtime.page);return value.result;};
let failure;
try {
 await runStorageOverview(runtime,{command,check,output});
 check('No uncaught application page errors',runtime.errors.length===0);
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const paths=execFileSync('git',['ls-files','src'],{encoding:'utf8'}).trim().split('\n').sort();
 const productFiles=[];
 for(const path of paths){const baseline=hash(execFileSync('git',['show','d73e1f30:'+path]));const current=hash(await readFile(path));productFiles.push({path,baseline,current,equal:baseline===current});}
 check('Every tracked src file is byte-identical to accepted quick-home83 product d73e1f30',productFiles.every(row=>row.equal));
 const after=await sourceFingerprint(root);
 check('Fingerprint inputs remain unchanged during focused storage validation',before.sha256===after.sha256);
 await saveJSON(resolve(output,'summary.json'),{head,before,after,checks,passedChecks:checks.length,elapsedMs:Math.round(performance.now()-started),productBaseline:'d73e1f30',productFiles,pageErrors:runtime.errors,scope:runtime.metadata});
 console.log(JSON.stringify({head,passedChecks:checks.length,source:after.sha256,pageErrors:runtime.errors,scope:runtime.metadata}));
}catch(error){failure=error;await saveJSON(resolve(output,'failure.json'),{message:error.message,stack:error.stack,checks,pageErrors:runtime.errors});await saveJSON(resolve(output,'failure.snapshot.json'),await snapshot(runtime.page,{selector:'.app',maxChars:30000}));await runtime.page.screenshot({path:resolve(output,'failure.png')});throw error;}
finally{await runtime.cleanup();}
