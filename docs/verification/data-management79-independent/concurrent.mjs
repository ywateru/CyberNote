import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [root,out]=process.argv.slice(2).map(x=>resolve(x));await mkdir(out,{recursive:true});
const {openRuntime,api,idle}=await import(pathToFileURL(join(root,'scripts/debug/runtime.mjs')));
const {sourceFingerprint}=await import(pathToFileURL(join(root,'scripts/debug/source-identity.mjs')));
const {chooseFiles,tinyPNG}=await import(pathToFileURL(join(root,'scripts/debug/mobile-attachments.mjs')));
const {startSurfaceTrace,stopSurfaceTrace}=await import(pathToFileURL(join(root,'scripts/debug/data-management.mjs')));
const before=await sourceFingerprint(root),started=performance.now();let rt,releases=[],result={};
try{rt=await openRuntime({root});await chooseFiles(rt.page,[{name:'old-concurrent.png',mimeType:'image/png',buffer:tinyPNG}]);await idle(rt.page);
const base=rt.backend.call.bind(rt.backend);let entered=0;rt.backend.call=async(c,a)=>{const row=await base(c,a);if(c==='load_workspace'){const number=++entered;if(number<=2)await new Promise(done=>releases.push(done));}return row;};
await startSurfaceTrace(rt.page);const choosing=chooseFiles(rt.page,[{name:'new-concurrent.png',mimeType:'image/png',buffer:tinyPNG}]);await choosing;
for(let n=0;n<100&&entered<1;n++)await rt.page.waitForTimeout(10);assert.equal(entered,1);
await rt.page.evaluate(async metadata=>window.__DEBUG_PLATFORM__.emit('notes-metadata',{metadata}),{...rt.backend.state().metadata,sessionId:'independent-foreign-notification'});
await rt.page.waitForSelector('.access-cover');
releases.shift()();for(let n=0;n<100&&entered<2;n++)await rt.page.waitForTimeout(10);assert.equal(entered,2);
const coverHeld=await rt.page.evaluate(async()=>{const rows=[];for(let i=0;i<6;i++){await new Promise(requestAnimationFrame);rows.push({cover:!!document.querySelector('.access-cover'),hidden:getComputedStyle(document.querySelector('.tiptap')).visibility==='hidden'});}return rows;});
assert(coverHeld.every(x=>x.cover&&x.hidden),'stale quiet response cannot drop the stronger held request cover');releases.shift()();await idle(rt.page);const trace=await stopSurfaceTrace(rt.page);assert.equal(await rt.page.locator('.access-cover').count(),0);assert.equal(rt.errors.length,0);
result={status:'PASS',checks:3,coverHeld,trace,pageErrors:rt.errors,calls:rt.backend.calls};
}catch(error){result={...result,status:'FAIL',error:error.message,stack:error.stack};process.exitCode=1;}
finally{for(const release of releases)release();await rt?.cleanup();const after=await sourceFingerprint(root);result={...result,before,after,sourceUnchanged:before.sha256===after.sha256,runnerSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),completeWallMs:performance.now()-started};await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,error:result.error,sourceUnchanged:result.sourceUnchanged,completeWallMs:result.completeWallMs}));}
