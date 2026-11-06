import {resolve} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openRuntime,api,idle,state,saveJSON,snapshot} from '../../../scripts/debug/runtime.mjs';
import {sourceFingerprint} from '../../../scripts/debug/source-identity.mjs';
import {runPreferences} from '../../../scripts/debug/preferences.mjs';
import {runQuickHome} from '../../../scripts/debug/quick-home.mjs';
const output=resolve('docs/verification/quick-home83-viewport-followup/frozen');
await mkdir(output,{recursive:true});
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),before=await sourceFingerprint(process.cwd());
const runtime=await openRuntime({mobile:true});
const checks=[],groups=[],boundaries=[];
const check=(label,passed)=>{if(!passed)throw Error(label);checks.push(label);};
const command=async(id,args={})=>{const v=await api(runtime.page,id,args);await idle(runtime.page);return v.result;};
try{
 for(const [name,run] of [['preferences',runPreferences],['quick-home',runQuickHome]]){
  const groupOutput=resolve(output,name);await mkdir(groupOutput,{recursive:true});
  await runtime.page.setViewportSize({width:1280,height:844});await runtime.reset();
  const polluted=await runtime.page.evaluate(()=>({width:innerWidth,mobile:document.querySelector('.app').classList.contains('mobile')}));
  check(name+' starts from real preceding 1280px desktop layout after reset',polluted.width===1280&&!polluted.mobile);
  const baseReset=runtime.reset;let entry;
  runtime.reset=async()=>{await baseReset();if(!entry){entry={actual:await runtime.page.evaluate(()=>({width:innerWidth,height:innerHeight,mobile:document.querySelector('.app').classList.contains('mobile'),settings:document.querySelectorAll('.mobile-home-settings').length})),selection:(await state(runtime.page)).selection};check(name+' entry restores declared phone viewport before cold reset',entry.actual.width===runtime.viewport.width&&entry.actual.height===runtime.viewport.height&&entry.actual.mobile&&entry.actual.settings===1&&entry.selection.page==='notes'&&entry.selection.folderId==='all'&&entry.selection.noteId===null);}};
  const started=performance.now(),first=checks.length;
  try{await run(runtime,{command,check,output:groupOutput});}finally{runtime.reset=baseReset;}
  if(!entry)throw Error(name+' failed to perform cold entry reset');
  boundaries.push({name,polluted,declaredViewport:runtime.viewport,entry});
  groups.push({name,passedChecks:checks.length-first,elapsedMs:Math.round(performance.now()-started)});
 }
 check('No uncaught application page errors',runtime.errors.length===0);
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),productFiles=[];
 for(const path of execFileSync('git',['ls-files','src'],{encoding:'utf8'}).trim().split('\n').sort()){const baseline=hash(execFileSync('git',['show','d73e1f30:'+path])),current=hash(await readFile(path));productFiles.push({path,baseline,current,equal:baseline===current});}
 check('All tracked src files remain byte-identical to accepted quick-home83 product',productFiles.every(row=>row.equal));
 const after=await sourceFingerprint(process.cwd());check('Focused boundary validation leaves source inputs unchanged',before.sha256===after.sha256);
 await saveJSON(resolve(output,'summary.json'),{head,before,after,passedChecks:checks.length,checks,groups,boundaries,productBaseline:'d73e1f30',productFiles,pageErrors:runtime.errors,scope:runtime.metadata});
 console.log(JSON.stringify({head,passedChecks:checks.length,groups,source:after.sha256,pageErrors:runtime.errors}));
}catch(error){await saveJSON(resolve(output,'failure.json'),{message:error.message,stack:error.stack,checks,pageErrors:runtime.errors});await saveJSON(resolve(output,'failure.snapshot.json'),await snapshot(runtime.page,{selector:'.app',maxChars:20000}));await runtime.page.screenshot({path:resolve(output,'failure.png')});throw error;}
finally{await runtime.cleanup();}
