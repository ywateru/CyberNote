// Narrow reproduction of the author's captured-target failure. No guard or
// product source is replaced. --sequence retains the original 43-check prefix.
import assert from 'node:assert/strict';
import { openRuntime, api, idle, state, saveJSON } from '../debug/runtime.mjs';
import { runMobileAttachments, chooseFiles, tinyPNG } from '../debug/mobile-attachments.mjs';
import { startSurfaceTrace, stopSurfaceTrace } from '../debug/data-management.mjs';
import { sourceFingerprint } from '../debug/source-identity.mjs';
import { mkdir } from 'node:fs/promises';
const sequence=process.argv.includes('--sequence');
const output=`artifacts/media99ui-independent/picker-${sequence?'sequence':'fresh'}`;
await mkdir(output,{recursive:true});
const before=await sourceFingerprint(process.cwd());
const runtime=await openRuntime({mobile:true}),{page,backend}=runtime,checks=[],rounds=[];
const command=async(id,args={})=>{const value=await api(page,id,args);await idle(page);return value.result;};
const add=async name=>{await chooseFiles(page,[{name,mimeType:'image/png',buffer:tinyPNG}]);await idle(page);await page.waitForFunction(()=>[...document.querySelectorAll('.image-open img')].every(x=>x.naturalWidth>0));};
try{
 if(sequence){await runMobileAttachments(runtime,{command,check:(name,value)=>{assert(value,name);checks.push(name);},output:output+'/prefix'});await runtime.reset();}
 for(let i=0;i<(sequence?1:3);i++){
  if(i)await runtime.reset();await command('note.select',{id:'note-a'});
  await add('existing79.png');backend.configure({delay:{load:300,store:80}});
  await startSurfaceTrace(page);await add('new79.png');const trace=await stopSurfaceTrace(page);
  assert.equal(backend.workspace.attachments.length,2);assert((await state(page)).save.pending===0);
  backend.configure({delay:{load:0,store:0}});await command('data.open');
  const summary=await page.locator('.storage-summary').count(),categories=await page.locator('.storage-category').count(),files=await page.locator('.data-file').count();
  assert.equal(summary,1);assert.equal(categories,7);assert.equal(files,0);
  rounds.push({i,passed:true,trace,summary,categories,files,state:await state(page),calls:backend.calls});
 }
 const after=await sourceFingerprint(process.cwd());assert.equal(after.sha256,before.sha256,'product/test source changed while browser ran');
 await saveJSON(output+'/result.json',{passed:true,sequence,checks,rounds,sourceBefore:before,sourceAfter:after,scope:runtime.metadata});
 console.log('MEDIA99UI independent picker:',sequence?'43-check prefix + exact add pair':rounds.length+' exact add pairs','and unique storage summary passed');
}catch(error){await saveJSON(output+'/failure.json',{error:error.stack,checks,rounds,state:await state(page),calls:backend.calls,sourceBefore:before});throw error;}
finally{await runtime.cleanup();}
