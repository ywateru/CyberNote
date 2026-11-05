import {openRuntime,api,state,saveJSON} from '../../../../scripts/debug/runtime.mjs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const sourceHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const output=resolve('docs/verification/app-debug-automation70/independent/input-probe-attempt02.json');
let runtime; const observations=[];
try{
 runtime=await openRuntime({tmp:'/private/tmp'});
 for(const key of ['constructor','toString','__proto__']){
  const before=runtime.backend.workspace.notes.length;
  const result=await runtime.page.evaluate(async key=>{try{return{success:await window.__NOTES_DEBUG__.execute('note.create',JSON.parse('{"'+key+'":"not-allowed"}'))};}catch(e){return{code:e.code,message:e.message}}},key);
  observations.push({key,result,createdNotes:runtime.backend.workspace.notes.length-before});
 }
 await runtime.reset();
 const menuResult=await runtime.page.evaluate(async()=>{try{return{success:await window.__NOTES_DEBUG__.execute('menu.open',{menu:'sort'})};}catch(e){return{code:e.code,message:e.message}}});
 observations.push({menu:'sort',result:menuResult,menuSurfaces:await runtime.page.locator('.menu-sort').count()});
 for(const row of observations){if(row.key && (row.result.code!=='INVALID_ARGUMENT'||row.createdNotes!==0))throw Error('Unknown fields still accepted');}
 if(menuResult.code!=='INVALID_ARGUMENT')throw Error('Sort empty route still accepted');
 await saveJSON(output,{sourceHead,metadata:runtime.metadata,observations});
 console.log(JSON.stringify({sourceHead,observations}));
}finally{await runtime?.cleanup();}
