import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state } from '../../../../scripts/debug/runtime.mjs';
import { sourceFingerprint } from '../../../../scripts/debug/source-identity.mjs';
const before=await sourceFingerprint(process.cwd()), started=performance.now(), observations=[];
let runtime, releaseCancel;
const wait=async fn=>{const until=performance.now()+3000;while(!await fn()){if(performance.now()>until)throw Error('Condition timeout');await new Promise(r=>setTimeout(r,10));}};
try {
 runtime=await openRuntime(); const {page,backend}=runtime, original=backend.call.bind(backend);let hold=false;const replies=[];
 backend.call=async(command,args)=>{if(command!=='sync_window_reply')return original(command,args);replies.push(args.reply);if(args.reply.ready===false&&hold)await new Promise(r=>releaseCancel=r);return {ok:true,value:{operationId:args.reply.operationId,outcome:args.reply.ready===false?'abort':'pending'},events:[]};};
 const emit=event=>page.evaluate(event=>window.__DEBUG_PLATFORM__.emit('notes-sync',event),event);
 const prepare=async id=>{const operationId=randomUUID();await emit({phase:'prepare',sessionId:backend.sessionId,operationId,noteIds:[id]});await wait(()=>replies.some(r=>r.operationId===operationId&&r.ready===true));return operationId;};
 const end=async operationId=>{hold=false;releaseCancel?.();releaseCancel=undefined;await emit({phase:'release',sessionId:backend.sessionId,operationId,outcome:'abort'});await idle(page);};
 // A normal HTML search field is already focused when the backend begins prepare.
 const search=page.getByRole('textbox',{name:'搜索备忘录'});await search.focus();await idle(page);
 const a=await prepare('note-a');hold=true;await search.fill('Fixture B');await wait(()=>!!releaseCancel);
 const typed=await state(page);observations.push({case:'HTML search typing before terminal cancellation',expectedNote:'note-a',actualNote:typed.selection.noteId,frozen:typed.quietWindow.frozen,replyPending:!!releaseCancel,pass:typed.selection.noteId==='note-a'});
 await writeFile(resolve('docs/verification/sync86-frontend/independent/search-typing.html'),await page.locator('.app').evaluate(n=>n.outerHTML));await end(a);
 await search.fill('Fixture B');await idle(page);assert.equal((await state(page)).selection.noteId,'note-b');
 const b=await prepare('note-b');hold=true;await page.keyboard.press('Escape');await wait(()=>!!releaseCancel);
 const escaped=await state(page);observations.push({case:'Escape leaves search before terminal cancellation',expectedNote:'note-b',actualNote:escaped.selection.noteId,frozen:escaped.quietWindow.frozen,replyPending:!!releaseCancel,pass:escaped.selection.noteId==='note-b'});
 await writeFile(resolve('docs/verification/sync86-frontend/independent/search-escape.html'),await page.locator('.app').evaluate(n=>n.outerHTML));await end(b);
 // Frozen PM body is protected from real keyboard writes as well as direct commands.
 const c=await prepare('note-a');hold=true;const body=await page.locator('[data-mobile-editor-note="note-a"] .tiptap').innerText();await page.locator('[data-mobile-editor-note="note-a"] .tiptap').focus();await page.keyboard.type('MUSTNOTWRITE');
 observations.push({case:'Actual keyboard cannot write target body while frozen',pass:await page.locator('[data-mobile-editor-note="note-a"] .tiptap').innerText()===body});await end(c);
 // Quit is a real listener path, held until cancellation terminates.
 const d=await prepare('note-a');hold=true;const quitting=page.evaluate(()=>window.__DEBUG_PLATFORM__.quitIntent());await wait(()=>!!releaseCancel);const during=await state(page);
 observations.push({case:'Quit waits for terminal cancellation receipt',pass:during.quietWindow.frozen&&!during.quietWindow.blocked});hold=false;releaseCancel();releaseCancel=undefined;await quitting;await idle(page);
 observations.push({case:'Quit admission blocks the quiet probe snapshot',pass:(await state(page)).quietWindow.blocked});
} catch(error){observations.push({error:error.message,stack:error.stack,pass:false});}
finally {releaseCancel?.();const after=await sourceFingerprint(process.cwd());const report={before,after,sourceChanged:before.sha256!==after.sha256,elapsedMs:Math.round(performance.now()-started),naturalExit:observations.some(o=>!o.pass)?1:0,scope:'Real React/Tiptap DOM and keyboard handlers with explicit JS notes-sync/IPC fixture; no Rust/device proof',observations,pageErrors:runtime?.errors};await writeFile(resolve('docs/verification/sync86-frontend/independent/counterexamples.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.naturalExit;await runtime?.cleanup();}
