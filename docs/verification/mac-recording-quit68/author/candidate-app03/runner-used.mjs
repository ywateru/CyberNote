// Actual React App/Host/Gate/NoteEditor/Panel and production submission/bridge.
// Only native IPC and recording hardware are controlled; test taps observe the
// target check and allow one-shot actions at the real commit-wait admission.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const binary=resolve(process.argv[3]);
const baseline=process.argv.includes("--baseline");
const native=spawn(binary,[],{stdio:["pipe","pipe","pipe"]});
let nativeBuffer="";const nativeWaiters=[];native.stdout.on("data",chunk=>{nativeBuffer+=chunk;while(nativeBuffer.includes("\n")){const i=nativeBuffer.indexOf("\n");const line=nativeBuffer.slice(0,i);nativeBuffer=nativeBuffer.slice(i+1);nativeWaiters.shift()?.resolve(JSON.parse(line));}});
const nativeErrors=[];native.stderr.on("data",b=>nativeErrors.push(String(b)));
const rpc=(command,args={})=>new Promise((resolve,reject)=>{nativeWaiters.push({resolve,reject});native.stdin.write(JSON.stringify({command,args})+"\n")});
const output = resolve(
  process.argv[2] || "docs/verification/mac-recording-sidebar66/author/app",
);
await mkdir(output, { recursive: true });
await writeFile(resolve(output,"runner-used.mjs"),await readFile(new URL(import.meta.url)));
let entry = `import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import App from'/src/App.tsx';import'/src/style.css';
const h=window.host={calls:[],loads:[],validations:[],submitted:[],gate:[],waits:0,errors:[],journal:new Map(),holdLoads:false,saveFailures:0};
const note=(id,text)=>({id,folderId:'default',title:text,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:text+'。'}]}]},createdAt:1,updatedAt:1,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:1});
h.backend={notes:[note('note-a','Original A'),note('note-b','Original B')],folders:[{id:'default',name:'备忘录',kind:'default',parentId:null,sortOrder:0,createdAt:1},{id:'trash',name:'最近删除',kind:'trash',parentId:null,sortOrder:9,createdAt:1}],attachments:[],settings:{selectedFolder:'default',selectedNote:'note-a'},access:{sessionId:'controlled-native-session',epoch:1,notes:{'note-a':{epoch:0,authorized:true},'note-b':{epoch:0,authorized:true}},suspended:[],operationId:null},metadata:{sessionId:'controlled-native-session',sequence:0}};
const snapshot=()=>structuredClone(h.backend);const tagged=value=>({...value,access:structuredClone(h.backend.access),metadata:structuredClone(h.backend.metadata)});
h.listeners=new Map();h.window={label:'main',listen:async(name,handler)=>{h.listeners.set(name,handler);return()=>h.listeners.delete(name)},onCloseRequested:async fn=>{h.close=fn;return()=>{}},onFocusChanged:async()=>()=>{},hide:async()=>{},show:async()=>{},setFocus:async()=>{},destroy:async()=>{h.destroyed=true},close:async()=>{},isFocused:async()=>true};
h.invoke=async(command,args)=>{h.calls.push({command,args});if(command==='register_recording_local'){h.local={...args,owner:'main',incarnation:'controlled-native-incarnation'};return h.local}if(command==='recording_local_release'&&!h.local&&h.completedRelease&&args.sessionId===h.completedRelease.sessionId&&args.operationId===h.completedRelease.operationId&&args.incarnation===h.completedRelease.incarnation&&args.saved===h.completedRelease.saved&&args.revision===h.completedRelease.revision)return;if(command.startsWith('recording_local_')){if(!h.local||args.sessionId!==h.local.sessionId||args.operationId!==h.local.operationId||args.incarnation!==h.local.incarnation)throw Error('stale native local identity');if(command==='recording_local_started'){h.started=true;return}if(command==='recording_local_validate')return;if(command==='recording_local_revision'){if(h.revisionFailure){h.revisionFailure=false;throw Error('controlled native revision response failure')}if(args.revision!==(h.nativeRevision||0)+1&&args.revision!==h.nativeRevision)throw Error('inexact native revision');h.nativeRevision=args.revision;h.nativeFinal=args.finalIntent;if(h.revisionLostResponse){h.revisionLostResponse=false;throw Error('controlled committed native revision response lost')}return}if(command==='recording_local_release'){if(h.cleanupFailures){h.cleanupFailures--;throw Error('controlled native cleanup failure')}if(args.saved&&(!h.nativeFinal||args.revision!==h.nativeRevision))throw Error('final ACK missing');h.completedRelease=args;h.local=null;if(h.cleanupLostResponse){h.cleanupLostResponse=false;throw Error('controlled completed native cleanup response lost')}return}}if(command==='recording_quit_sealed'){h.sealed=args.id;if(!h.holdReady)h.listeners.get('notes-recording-quit-ready')?.({payload:{id:args.id}});return}if(command==='recording_quit_ack'){h.quitAcks=(h.quitAcks||[]).concat([args]);if(!args.success)h.listeners.get('notes-recording-quit-cancelled')?.({payload:{id:args.id}});return}if(command==='plugin:notes-ui|recording_access')return{status:'authorized'};if(command==='load_workspace'){if(h.holdLoads)await new Promise(resolve=>h.loads.push({release:resolve}));return h.lastRead=snapshot()}if(command==='register_save_intent'||command==='acknowledge_access')return;if(command==='workspace_action'){const a=args.action;if(a.type==='settings'){Object.assign(h.backend.settings,a.settings);return tagged(snapshot())}if(a.type!=='saveNote')throw Error('unexpected action '+a.type);if(h.saveFailures>0){h.saveFailures--;throw Error('controlled document ACK failure')}if(h.holdSave)await new Promise(resolve=>h.releaseSave=resolve);const n=h.backend.notes.find(n=>n.id===a.id);n.document=structuredClone(a.document);n.revision++;h.backend.metadata.sequence++;return tagged(structuredClone(n))}if(command==='store_attachment_operation'){if(h.storeFailures){h.storeFailures--;throw Error('controlled store failure')}if(h.holdStore)await new Promise(resolve=>h.releaseStore=resolve);const attachment={id:'saved-'+args.operationId,noteId:args.noteId,kind:'audio',displayName:args.name,mime:args.mime,size:atob(args.data).length,relativePath:'controlled/audio.webm',recordedAt:args.recordedAt};const op={operationId:args.operationId,noteId:args.noteId,status:'stored',attachment};h.journal.set(op.operationId,op);h.backend.attachments.push(attachment);h.backend.metadata.sequence++;if(h.rejectStoreResponse){h.rejectStoreResponse=false;throw Error('controlled stored response lost')}return tagged(structuredClone(op))}if(command==='query_attachment_operation'||command==='cancel_attachment_operation'){if(h.queryFailures){h.queryFailures--;throw Error('controlled query failure')}const op=h.journal.get(args.operationId);if(command==='query_attachment_operation'&&op&&JSON.stringify(h.backend.notes.find(n=>n.id===op.noteId)?.document).includes(op.attachment.id))op.status='committed';if(command==='cancel_attachment_operation'&&op){op.status='aborted';h.backend.attachments=[]}return tagged(op?structuredClone(op):{operationId:args.operationId,noteId:args.noteId,status:'notPersisted'})}if(command==='read_attachment'){const store=h.calls.find(c=>c.command==='store_attachment_operation'&&'saved-'+c.args.operationId===args.id)?.args;return tagged({data:store?.data||'',mime:store?.mime||'audio/wav',name:'新录音.wav',recordedAt:store?.recordedAt})};throw Error('unexpected IPC '+command)};
h.context=new AudioContext({sampleRate:48000});await h.context.resume();h.destination=h.context.createMediaStreamDestination();h.osc=h.context.createOscillator();h.osc.frequency.value=440;h.osc.connect(h.destination);h.osc.start();h.streams=0;h.starts=0;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{h.streams++;return h.destination.stream}});const NativeRecorder=MediaRecorder;window.MediaRecorder=class extends NativeRecorder{start(...args){h.starts++;return super.start(...args)}};const decode=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=async function(...args){if(h.decodeFailures){h.decodeFailures--;throw Error('controlled decode failure')}return decode.apply(this,args)};const root=createRoot(document.querySelector('#root'));h.unmount=()=>flushSync(()=>root.unmount());root.render(<App/>);`;
entry+=`\nconst realInvoke=h.invoke;h.nativeLog=[];h.dispatch=r=>{h.native=r;for(const e of r.events){if(e.label&&e.label!=='main')continue;const handler=h.listeners.get(e.name);if(handler)Promise.resolve(handler({payload:e.payload})).catch(e=>h.errors.push(String(e)));}};h.nativeInvoke=async(command,args={})=>{const r=await fetch('/__native',{method:'POST',body:JSON.stringify({command,args})}).then(r=>r.json());h.nativeLog.push({command,args,response:r});h.dispatch(r);if(r.error)throw Error(r.error);return r.result;};h.invoke=async(command,args)=>{if(command==='register_recording_local'||command.startsWith('recording_local_')||command.startsWith('recording_quit_')){h.calls.push({command,args});if(command==='recording_local_release'&&h.cleanupFailures){h.cleanupFailures--;throw Error('controlled native cleanup failure')}const result=await h.nativeInvoke(command,args);if(command==='register_recording_local'){h.local=result;if(h.registerResponseFailures){h.registerResponseFailures--;throw Error('controlled successful registration response lost')}}if(command==='recording_local_release'){h.local=null;h.completedRelease=args}if(command==='recording_quit_ack')h.quitAcks=(h.quitAcks||[]).concat([args]);return result;}if(command==='workspace_action'&&args.action?.type==='saveNote'&&args.action.id==='note-a'&&JSON.stringify(args.action.document).includes('attachment')&&h.finalSaveFailures){h.finalSaveFailures--;h.calls.push({command,args});throw Error('controlled final A document ACK failure')}return realInvoke(command,args)};h.quit=()=>h.nativeInvoke('menu',{});`;
const modules = {
  "@tauri-apps/api/webviewWindow":
    "export class WebviewWindow {async once(event, callback){if(event==='tauri://created')queueMicrotask(callback);return()=>{}}}",
  "@tauri-apps/api/core":
    "export const isTauri=()=>true;export const invoke=(command,args)=>window.host.invoke(command,args)",
  "@tauri-apps/api/window":
    "export const getCurrentWindow=()=>window.host.window",
  "@tauri-apps/api/event":
    "export const listen=async(name,handler)=>{window.host.listeners.set(name,handler);return()=>window.host.listeners.delete(name)};export const emit=async()=>{};export const emitTo=async()=>{}",
  "@tauri-apps/api/app":
    "export const exit=async()=>{};export const onBackButtonPress=async()=>({unregister:()=>{}})",
};
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    {
      name: "save57-native-boundary",
      enforce: "pre",
      resolveId(id) {
        if (id === "/__save57.tsx") return id;
        if (modules[id]) return "\0save57:" + id;
      },
      load(id) {
        if (id === "/__save57.tsx") return entry;
        if (id.startsWith("\0save57:"))
          return modules[id.slice("\0save57:".length)];
      },
      transform(code, id) {
        if (id.endsWith("/src/App.tsx")) {
          code = code.replace(
            '    ticket.recordedAt = attachmentRecordedAt(result.recordedAt, "audio");',
            '    window.host.submitted.push(result);\n    ticket.recordedAt = attachmentRecordedAt(result.recordedAt, "audio");',
          );
          const marker =
            "  const recording = record ? recordingTicket.current : null;";
          assert(code.includes(marker));
          const start = code.indexOf("  const validateRecordingTarget =");
          const point = code.indexOf(
            "      if (\n        !synced.success ||",
            start,
          );
          assert(point > start);
          code =
            code.slice(0, point) +
            `      window.host.validations.push({editable:instance.isEditable,active:pickerRuntime.current.editor===instance,sameEditor:editorsRef.current.get(target.noteId)===instance,sameOwner:nativeEditorOwners.current.get(instance)===target.owner,sameVersion:(nativeDocumentVersions.current.get(instance)||0)===target.documentVersion,sameExternal:(externalVersions.current.get(target.noteId)||0)===target.externalVersion,sameDocument:documentsEqual(instance.getJSON(),target.document),sameTrusted:documentsEqual(editorSaveSnapshot(instance.getJSON()),editorSaveSnapshot(note?.document)),trusted:synced.success&&synchronization.current(synced),destroyed:instance.isDestroyed,session:stamp.sessionId===original.sessionId,epoch:stamp.epoch===original.epoch,noteEpoch:stamp.noteEpoch===original.noteEpoch,operation:!!accessGate.state?.operationId,suspended:blockedNotes.current.has(target.noteId)||!!accessGate.state?.suspended.includes(target.noteId),locked:note?.locked});\n` +
            code.slice(point);
          code = code.replace(
            marker,
            `  window.host.app={get editor(){return pickerRuntime.current.editor},get ticket(){return recordingTicket.current},get scope(){return pickerRuntime.current.scope},get pending(){return pendingDocs.current},get gate(){return editorGate},get access(){return accessGate},get owners(){return nativeEditorOwners.current},get external(){return externalVersions.current},get sync(){return synchronization},open:()=>openRecording(),submit:r=>submitRecordingRevision(recordingTicket.current,r),check:()=>validateRecordingTarget(recordingTicket.current,false),seal:()=>sealRecording(recordingTicket.current),cancel:()=>cancelRecording(),select:id=>{setQuery('');setSearching(false);setNoteId(id)},search:q=>{setQuery(q);setSearching(true)},suspend:ids=>recordingLifecycle.current.suspend(ids),close:()=>recordingLifecycle.current.close(),save:(id,doc)=>saveDoc(id,doc)};\n` +
              marker,
          );
        }
        if (id.endsWith("/src/attachment-target.ts"))
          code = code.replace(
            "  const original = target.stamp;",
            "  window.host.validations.push({available:live.available,editable:live.editor?.isEditable,current:live.trustedSynchronization,sameEditor:live.editor===target.editor,sameScope:live.scope===target.scope,sameOwner:live.owner===target.owner,sameVersion:live.documentVersion===target.documentVersion,sameExternal:live.externalVersion===target.externalVersion,sameDocument:documentsEqual(target.document,live.editorDocument),sameTrusted:documentsEqual(target.trustedDocument,live.trustedDocument),stamp:live.stamp,originalStamp:target.stamp});\n  const original = target.stamp;",
          );
        if (id.endsWith("/src/search-editor-gate.ts"))
          code = code
            .replace(
              "  park(editor: Editor): void {",
              '  park(editor: Editor): void {\n    window.host.gate.push({action:"park",editable:editor.isEditable});',
            )
            .replace(
              "  activate(editor: Editor, blocked: boolean): void {",
              '  activate(editor: Editor, blocked: boolean): void {\n    window.host.gate.push({action:"activate",blocked,editable:editor.isEditable});',
            );
        if (id.endsWith("/src/use-editor-commit.ts"))
          code = code.replace(
            "      requestCommit((value) => value + 1);",
            "      window.host.waits++; const action=window.host.onWait; window.host.onWait=null; action?.();\n      requestCommit((value) => value + 1);",
          );
        return code;
      },
    },
    react(),
  ],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer(async(req, res) => {
  if(req.url==="/__native"){let body="";for await(const c of req)body+=c;const v=JSON.parse(body);res.setHeader("Content-Type","application/json");res.end(JSON.stringify(await rpc(v.command,v.args)));return;}
  if (req.url === "/__check") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__save57.tsx"></script>',
      )
      .then((html) => res.end(html))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  } else vite.middlewares(req, res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const checks=[],observations=[],errors=[];let browser,context,page;
const check=(name,pass)=>{assert(pass,name);checks.push({name,pass:true})};
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const origin='http://127.0.0.1:'+server.address().port;
 const setup=async(config={})=>{
  await context?.close();await rpc('reset');context=await browser.newContext({viewport:{width:1280,height:800}});page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin+'/__check');
  await page.locator('.folder-row').filter({hasText:'全部备忘录'}).click();await page.locator('.note-row').filter({hasText:'Original A'}).click();await page.locator('.tiptap:visible').waitFor();
  await page.evaluate(config=>{const h=window.host;Object.assign(h,config);h.original=h.app.editor;h.app.open()},config);
  await page.locator('.recording-dock .recording-primary').waitFor();
 };
 const start=async()=>{await page.locator('.recording-dock .recording-primary').click();await page.waitForFunction(()=>document.querySelector('[data-recording-state="recording"]'));await page.waitForTimeout(220)};
 const inspect=()=>page.evaluate(()=>{const h=window.host;return{active:!!h.app.ticket,streams:h.streams,starts:h.starts,local:!!h.local,native:h.native,log:h.nativeLog,notes:h.backend.notes.map(n=>({id:n.id,document:n.document})),submissions:h.submitted.map(r=>({revision:r.revision,intent:r.intent,size:r.file.size})),calls:h.calls.map(c=>({...c,args:c.args?.data?{...c.args,data:undefined,bytes:c.args.data.length}:c.args})),inert:document.querySelector('.app').hasAttribute('inert'),editable:h.app.editor?.isEditable,phase:document.querySelector('[data-recording-state]')?.dataset.recordingState,errors:h.errors}});
 const editB=async()=>{await page.evaluate(()=>{const h=window.host;h.original.commands.insertContent(' A edited while recording');h.app.select('note-b')});await page.waitForFunction(()=>window.host.app.editor!==window.host.original);await page.evaluate(()=>window.host.app.editor.commands.insertContent(' B latest body'))};
 const quit=()=>page.evaluate(()=>window.host.quit());
 const done=()=>page.waitForFunction(()=>window.host.native?.terminated);
 const nativeLog=s=>s.log.map(x=>({command:x.command,args:x.args,response:x.response}));
 const cardCount=s=>s.notes[0].document.content.filter(n=>n.type==='attachment').length;
 const bodies=s=>JSON.stringify(s.notes[0].document).includes('A edited while recording')&&JSON.stringify(s.notes[1].document).includes('B latest body');

 await setup();await start();await editB();await quit();let s=await inspect();
 if(baseline){
  check('baseline actual App registers native local identity before capture',s.local&&s.streams===1&&s.log.some(x=>x.command==='recording_local_started'));
  check('baseline production menu declaration chooses locked predefined terminate selector',s.native.result.kind==='predefined-terminate'&&s.native.trace[0].selector==='terminate:');
  check('baseline native menu path never reaches production ExitRequested or App final listener',s.native.requests===0&&!s.native.registry.quit&&s.native.registry.localCount===1&&s.active&&s.submissions.length===0&&cardCount(s)===0);
  observations.push({baselineMissingConnection:s});
 }else{
  await done();s=await inspect();
  check('menu production callback routes through app.exit and production RunEvent guard before final ACK',s.log.some(x=>x.command==='menu'&&x.response.requests===1&&x.response.trace.some(t=>t.prevented)&&x.response.registry.localCount===1));
  check('actual App A parked while B edited reaches exact native final release then successful document quit ACK',!s.active&&!s.local&&s.native.registry.localCount===0&&s.native.terminated&&cardCount(s)===1&&bodies(s)&&s.submissions.length===1&&s.submissions[0].intent==='final');
  const q=s.log.find(x=>x.command==='menu').response.registry.quit.id;
  check('final app.exit after precise ACK is allowed and does not create another quit',s.native.requests===2&&s.native.registry.exitAllowed&&s.log.some(x=>x.command==='recording_quit_ack'&&x.args.id===q&&x.args.success));
  observations.push({menuSuccess:s});

  await setup();await start();await editB();await page.evaluate(()=>window.host.nativeInvoke('focus',{label:null}));await quit();await done();s=await inspect();check('menu Quit works with no focused window before any focus lookup',s.native.terminated&&cardCount(s)===1&&bodies(s));observations.push({noFocus:s});

  await setup();await start();await page.evaluate(()=>{window.host.holdStore=true});await quit();await page.waitForFunction(()=>!!window.host.releaseStore);s=await inspect();const id=s.native.registry.quit.id;await quit();s=await inspect();check('duplicate CmdQ shares the in-flight native quit and cannot permit exit during store',s.native.registry.quit.id===id&&!s.native.terminated&&s.native.requests===2&&s.submissions.length===1);await page.evaluate(()=>window.host.releaseStore());await done();s=await inspect();check('busy final drains once and duplicate quit does not duplicate attachment or revision',cardCount(s)===1&&s.submissions.length===1&&s.native.requests===3);observations.push({repeatBusy:s});

  for(const failure of ['decodeFailures','storeFailures','finalSaveFailures','queryFailures','cleanupFailures']){
   await setup();await start();await editB();await page.evaluate(f=>{window.host[f]=f==='finalSaveFailures'?Infinity:1},failure);await quit();await page.waitForFunction(()=>window.host.nativeLog.some(x=>x.command==='recording_quit_ack'&&!x.args.success));s=await inspect();check(failure+' prevents native quit, preserves retry owner and resumes legal editing',!s.native.terminated&&s.native.registry.localCount===1&&s.active&&!s.inert&&s.editable);const stores=s.calls.filter(c=>c.command==='store_attachment_operation').length;await page.evaluate(f=>window.host[f]=0,failure);await quit();await done();s=await inspect();check(failure+' fresh menu Quit retries to exact final ACK and unique A attachment',s.native.terminated&&!s.active&&cardCount(s)===1&&bodies(s));if(failure==='cleanupFailures')check('cleanup retry does not repeat confirmed body, attachment store or revision',s.calls.filter(c=>c.command==='store_attachment_operation').length===stores&&s.submissions.length===1);observations.push({failure,state:s});
  }

  await setup();await start();await page.evaluate(()=>window.host.nativeInvoke('add_document',{label:'note-b'}));await quit();await page.waitForFunction(()=>window.host.native?.registry.quit?.sealing?.length===1);s=await inspect();const old=s.native.registry.quit.id;check('native actual participant set holds final until every document seal arrives',s.native.registry.quit.sealing.includes('note-b')&&s.submissions.length===0&&!s.native.terminated);
  await page.evaluate(id=>window.host.nativeInvoke('expire',{id}),old);await page.waitForFunction(()=>!document.querySelector('.app').hasAttribute('inert'));const stale=await rpc('recording_quit_ack',{owner:'note-b',id:old,success:true});check('expired ACK rejected by actual wrapper and cannot allow exit',!!stale.error&&!stale.terminated);s=await inspect();check('cancelled before final leaves current audio and editing intact',s.active&&!s.inert&&s.editable&&s.submissions.length===0);observations.push({expired:s,stale});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(nativeErrors,[]);await writeFile(resolve(output,'result.json'),JSON.stringify({pass:true,baseline,checks,observations,errors,limits:'Actual App/Host/Editor/Panel/Session and exact production native command/menu/RunEvent bodies; Tauri transport/menu facade, synthetic oscillator media and in-memory persistent backend. Baseline terminate selector is source-bound and not sent to NSApplication. No GUI/device/real audio; OS behavior requires root exact-package CUA.'},null,2));console.log(JSON.stringify({pass:true,baseline,checks}));
}catch(error){await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error),stack:error.stack,checks,observations,errors,snapshot:await page?.evaluate(()=>({text:document.body.innerText,native:window.host?.native,log:window.host?.nativeLog,calls:window.host?.calls.map(c=>({...c,args:c.args?.data?{...c.args,data:undefined}:c.args}))})).catch(()=>null)},null,2));throw error}
finally{await browser?.close();native.kill();await new Promise(r=>server.close(r));await vite.close()}
