import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {openRuntime,api,idle,state,saveJSON} from '../../../../scripts/debug/runtime.mjs';
const started=performance.now(); let r;
const expected='1fe83ec86ff41072b9bb51c44eaaea802ae4a786';
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(head,expected);
const capture=async f=>{try{return {ok:true,result:await f()}}catch(e){return {ok:false,code:e.code,message:e.message}}};
const cards=doc=>(doc?.content||[]).reduce((n,x)=>n+(x.type==='attachment'?1:cards(x)),0);
try {
 r=await openRuntime({tmp:'/private/tmp'}); const p=r.page;
 const catalog=await p.evaluate(async()=>{
  const api=window.__NOTES_DEBUG__, before=api.list().find(x=>x.id==='note.create');
  const returned=api.list(); const entry=returned.find(x=>x.id==='note.create');
  entry.description='MUTATED'; entry.args.acceptedByMutation={type:'string'}; entry.arguments.acceptedByMutation={type:'string'};
  const fresh=api.list().find(x=>x.id==='note.create'); let rejection;
  try{await api.execute('note.create',{acceptedByMutation:'x'});rejection={ok:true}}catch(e){rejection={ok:false,code:e.code,message:e.message}}
  return {originalDescription:before.description,freshDescription:fresh.description,hasMutatedArg:Object.hasOwn(fresh.args,'acceptedByMutation'),rejection};
 });
 assert.equal(catalog.freshDescription,catalog.originalDescription); assert.equal(catalog.hasMutatedArg,false); assert.equal(catalog.rejection.code,'INVALID_ARGUMENT'); assert.equal(r.backend.workspace.notes.length,2);
 await api(p,'recording.open'); await p.waitForFunction(async()=>(await window.__NOTES_DEBUG__.execute('app.state')).result.recording.state?.canToggle);
 await api(p,'recording.action',{action:'toggle'}); await p.waitForSelector('[data-recording-state="recording"]');
 await p.evaluate(()=>window.__DEBUG_PLATFORM__.advance(1500)); r.backend.configure({fail:{store:1},delay:{store:150}});
 const checkpoint=await capture(()=>api(p,'recording.action',{action:'toggle'})); assert.equal(checkpoint.ok,false); assert.equal(checkpoint.code,'APP_ERROR'); assert.ok(!checkpoint.message.includes('[object Object]'));
 const wait=await p.evaluate(async()=>{try{return {ok:true,result:await window.__NOTES_DEBUG__.waitForIdle({timeoutMs:3000})}}catch(e){return {ok:false,code:e.code,message:e.message}}});
 assert.equal(wait.code,'APP_ERROR'); await p.waitForSelector('[data-recording-state="retry"]');
 const failed=await state(p); assert.equal(failed.recording.active,true); assert.equal(failed.recording.state.hasError,true); assert.ok(!failed.recording.state.notice.includes('[object Object]')); assert.equal(r.backend.workspace.attachments.length,0); assert.ok(r.backend.local);
 r.backend.configure({fail:{store:0},delay:{store:0}}); await api(p,'recording.action',{action:'finish'}); await idle(p);
 const recovered=await state(p), note=r.backend.workspace.notes.find(x=>x.id==='note-a');
 assert.equal(recovered.recording.active,false); assert.equal(r.backend.local,null); assert.equal(cards(note.document),1); assert.equal(await p.locator('.tiptap:visible .attachment-node').count(),1); assert.ok((await p.locator('.tiptap:visible').innerText()).includes('新录音'));
 const result={pass:true,sourceHead:head,elapsedMs:Math.round(performance.now()-started),catalog,checkpoint,idle:wait,failed:{recording:failed.recording,backendAttachments:0,ownerRetained:true},recovered:{recording:recovered.recording,backendAttachments:r.backend.workspace.attachments.length,bodyCards:cards(note.document),DOMCards:await p.locator('.tiptap:visible .attachment-node').count(),body:note.document,attachments:r.backend.workspace.attachments,journal:[...r.backend.journal.values()],completion:r.backend.completed,owner:r.backend.local},pageErrors:r.errors};
 assert.deepEqual(r.errors,[]); await saveJSON('docs/verification/app-debug-automation70/independent/final-probe.json',result); console.log(JSON.stringify(result));
} finally {await r?.cleanup()}
