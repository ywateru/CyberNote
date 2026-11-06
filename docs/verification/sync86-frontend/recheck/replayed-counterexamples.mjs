import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state } from "/private/tmp/apple-notes-sync86-frontend/scripts/debug/runtime.mjs";
import { sourceFingerprint } from "/private/tmp/apple-notes-sync86-frontend/scripts/debug/source-identity.mjs";
const before=await sourceFingerprint(process.cwd()), started=performance.now(), observations=[], htmls=[];
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
 htmls.push(['search-typing.html',await page.locator('.app').evaluate(n=>n.outerHTML)]);await end(a);const afterTyping=await state(page);observations.push({case:'Original typed query replays after terminal',pass:afterTyping.selection.noteId==='note-b'&&afterTyping.selection.query==='Fixture B'});
 await search.fill('Fixture B');await idle(page);assert.equal((await state(page)).selection.noteId,'note-b');
 const b=await prepare('note-b');hold=true;await page.keyboard.press('Escape');await wait(()=>!!releaseCancel);
 const escaped=await state(page);observations.push({case:'Escape leaves search before terminal cancellation',expectedNote:'note-b',actualNote:escaped.selection.noteId,frozen:escaped.quietWindow.frozen,replyPending:!!releaseCancel,pass:escaped.selection.noteId==='note-b'});
 htmls.push(['search-escape.html',await page.locator('.app').evaluate(n=>n.outerHTML)]);await end(b);const afterEscape=await state(page);observations.push({case:'Original Escape replays after terminal',pass:afterEscape.selection.noteId==='note-a'&&afterEscape.selection.query===''&&!afterEscape.selection.searching});
 // Search clear and folder clicks are captured and replayed after receipt.
 await search.fill('Fixture B');await idle(page);const clearOp=await prepare('note-b');hold=true;await page.getByRole('button',{name:'清除搜索',exact:true}).click();await wait(()=>!!releaseCancel);observations.push({case:'Search clear click waits for terminal receipt',pass:(await state(page)).selection.noteId==='note-b'});await end(clearOp);
 const folderOp=await prepare('note-a');hold=true;const oldFolder=(await state(page)).selection.folderId;await page.getByRole('button',{name:/全部备忘录/}).click();await wait(()=>!!releaseCancel);observations.push({case:'Folder filter click waits for terminal receipt',pass:(await state(page)).selection.folderId===oldFolder});await end(folderOp);
 const arrows=await prepare('note-a');await page.locator('.note-row[data-note-id="note-a"]').focus();await page.keyboard.press('ArrowDown');observations.push({case:'List ArrowDown has no selection route in this UI and leaves owner stable',pass:(await state(page)).selection.noteId==='note-a'});await end(arrows);
 // Frozen PM body is protected from real keyboard writes as well as direct commands.
 const c=await prepare('note-a');hold=true;const body=await page.locator('[data-mobile-editor-note="note-a"] .tiptap').innerText();await page.locator('[data-mobile-editor-note="note-a"] .tiptap').focus();await page.keyboard.type('MUSTNOTWRITE');
 observations.push({case:'Actual keyboard cannot write target body while frozen',pass:await page.locator('[data-mobile-editor-note="note-a"] .tiptap').innerText()===body});await end(c);
 // Quit is a real listener path, held until cancellation terminates.
 const d=await prepare('note-a');hold=true;const quitting=page.evaluate(()=>window.__DEBUG_PLATFORM__.quitIntent());await wait(()=>!!releaseCancel);const during=await state(page);
 observations.push({case:'Quit waits for terminal cancellation receipt',pass:during.quietWindow.frozen&&!during.quietWindow.blocked});hold=false;releaseCancel();releaseCancel=undefined;await quitting;
 observations.push({case:'Quit admission blocks the quiet probe snapshot',pass:(await state(page)).quietWindow.blocked});
} catch(error){observations.push({error:error.message,stack:error.stack,pass:false});}
finally {releaseCancel?.();await runtime?.cleanup();for(const [name,html] of htmls)await writeFile(resolve('/private/tmp/sync86-frontend-recheck/replayed-'+name),html);const after=await sourceFingerprint(process.cwd());const report={before,after,sourceChanged:before.sha256!==after.sha256,elapsedMs:Math.round(performance.now()-started),naturalExit:observations.some(o=>!o.pass)?1:0,scope:'Real React/Tiptap DOM and keyboard handlers with explicit JS notes-sync/IPC fixture; no Rust/device proof',observations,pageErrors:runtime?.errors};await writeFile(resolve('/private/tmp/sync86-frontend-recheck/replayed-counterexamples.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.naturalExit;}
