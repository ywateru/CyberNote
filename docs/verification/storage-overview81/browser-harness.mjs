import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root='/private/tmp/apple-notes-storage-overview81';
const {openRuntime,api,idle,saveJSON}=await import(pathToFileURL(resolve(root,'scripts/debug/runtime.mjs')));
const {runStorageOverview}=await import(pathToFileURL(resolve(root,'scripts/debug/storage-overview.mjs')));
const output=process.argv[2];await mkdir(output);
const started=performance.now(),checks=[];let runtime,error;
try{runtime=await openRuntime({root,keep:true});await runStorageOverview(runtime,{output,check:(name,condition)=>{assert(condition,name);checks.push(name);},command:async(name,args={})=>{const result=await api(runtime.page,name,args);await idle(runtime.page);return result.result;}});}catch(e){error=e.stack;console.error(error);if(runtime){await runtime.page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});await saveJSON(resolve(output,'failure-state.json'),await runtime.page.evaluate(()=>({html:document.querySelector('.data-management')?.outerHTML,body:document.body.innerText})));}}finally{const directory=runtime?.directory;if(runtime)await runtime.cleanup();await saveJSON(resolve(output,'report.json'),{checks,error,pageErrors:runtime?.errors,wallMs:Math.round(performance.now()-started),directory});console.log(JSON.stringify({checks:checks.length,error,output}));if(error)process.exitCode=1;}
