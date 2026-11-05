// Actual React App/Host/Gate/NoteEditor/Panel and production submission/bridge.
// Only native IPC and recording hardware are controlled; test taps observe the
// target check and allow one-shot actions at the real commit-wait admission.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const output = resolve(
  process.argv[2] || "docs/verification/mac-recording-sidebar66/author/blocking-fixes/app",
);
await mkdir(output, { recursive: true });
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import App from'/src/App.tsx';import'/src/style.css';
window.__TAURI_INTERNALS__={};Object.defineProperty(navigator,'platform',{value:'MacIntel'});
const h=window.host={calls:[],loads:[],validations:[],submitted:[],gate:[],waits:0,errors:[],journal:new Map(),holdLoads:false,saveFailures:0};
const note=(id,text)=>({id,folderId:'default',title:text,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:text+'。'}]}]},createdAt:1,updatedAt:1,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:1});
h.backend={notes:[note('note-a','Original A'),note('note-b','Original B')],folders:[{id:'default',name:'备忘录',kind:'default',parentId:null,sortOrder:0,createdAt:1},{id:'trash',name:'最近删除',kind:'trash',parentId:null,sortOrder:9,createdAt:1}],attachments:[],settings:{selectedFolder:'default',selectedNote:'note-a'},access:{sessionId:'controlled-native-session',epoch:1,notes:{'note-a':{epoch:0,authorized:true},'note-b':{epoch:0,authorized:true}},suspended:[],operationId:null},metadata:{sessionId:'controlled-native-session',sequence:0}};
const snapshot=()=>structuredClone(h.backend);const tagged=value=>({...value,access:structuredClone(h.backend.access),metadata:structuredClone(h.backend.metadata)});
h.listeners=new Map();h.window={label:'main',listen:async(name,handler)=>{h.listeners.set(name,handler);return()=>h.listeners.delete(name)},onCloseRequested:async fn=>{h.close=fn;return()=>{}},onFocusChanged:async()=>()=>{},hide:async()=>{},show:async()=>{},setFocus:async()=>{},destroy:async()=>{h.destroyed=true},close:async()=>{},isFocused:async()=>true};
h.invoke=async(command,args)=>{h.calls.push({command,args});if(command==='register_recording_local'){if(h.local){if(h.local.sessionId!==args.sessionId||h.local.operationId!==args.operationId||h.started)throw Error('conflicting native registration')}else{if(h.nativeQuit)throw Error('new registration forbidden during Quit');h.local={...args,owner:'main',incarnation:'controlled-native-incarnation'};h.started=false}if(h.registerResponseFailures){h.registerResponseFailures--;throw Error('controlled successful registration response lost')}return h.local}if(command==='recording_local_release'&&!h.local&&h.completedRelease&&args.sessionId===h.completedRelease.sessionId&&args.operationId===h.completedRelease.operationId&&args.incarnation===h.completedRelease.incarnation&&args.saved===h.completedRelease.saved&&args.revision===h.completedRelease.revision)return;if(command.startsWith('recording_local_')){if(!h.local||args.sessionId!==h.local.sessionId||args.operationId!==h.local.operationId||args.incarnation!==h.local.incarnation)throw Error('stale native local identity');if(command==='recording_local_started'){h.started=true;if(h.holdStarted)await new Promise(resolve=>h.releaseStarted=resolve);return}if(command==='recording_local_validate')return;if(command==='recording_local_revision'){if(h.revisionFailure){h.revisionFailure=false;throw Error('controlled native revision response failure')}if(args.revision!==(h.nativeRevision||0)+1&&args.revision!==h.nativeRevision)throw Error('inexact native revision');h.nativeRevision=args.revision;h.nativeFinal=args.finalIntent;if(h.revisionLostResponse){h.revisionLostResponse=false;throw Error('controlled committed native revision response lost')}return}if(command==='recording_local_release'){if(h.cleanupFailures){h.cleanupFailures--;throw Error('controlled native cleanup failure')}if(args.saved&&(!h.nativeFinal||args.revision!==h.nativeRevision))throw Error('final ACK missing');h.completedRelease=args;h.local=null;if(h.cleanupLostResponse){h.cleanupLostResponse=false;throw Error('controlled completed native cleanup response lost')}return}}if(command==='recording_quit_sealed'){h.nativeQuit=true;h.sealed=args.id;if(!h.holdReady)h.listeners.get('notes-recording-quit-ready')?.({payload:{id:args.id}});return}if(command==='recording_quit_ack'){h.quitAcks=(h.quitAcks||[]).concat([args]);if(!args.success)h.listeners.get('notes-recording-quit-cancelled')?.({payload:{id:args.id}});return}if(command==='plugin:notes-ui|recording_access'){if(h.holdAccess)await new Promise(resolve=>h.releaseAccess=resolve);return{status:'authorized'}};if(command==='load_workspace'){if(h.holdLoads)await new Promise(resolve=>h.loads.push({release:resolve}));return h.lastRead=snapshot()}if(command==='register_save_intent'||command==='acknowledge_access')return;if(command==='workspace_action'){const a=args.action;if(a.type==='settings'){Object.assign(h.backend.settings,a.settings);return tagged(snapshot())}if(a.type!=='saveNote')throw Error('unexpected action '+a.type);if(h.saveFailures>0){h.saveFailures--;throw Error('controlled document ACK failure')}if(h.holdSave)await new Promise(resolve=>h.releaseSave=resolve);const n=h.backend.notes.find(n=>n.id===a.id);n.document=structuredClone(a.document);n.revision++;h.backend.metadata.sequence++;return tagged(structuredClone(n))}if(command==='store_attachment_operation'){if(h.storeFailures){h.storeFailures--;throw Error('controlled store failure')}if(h.holdStore)await new Promise(resolve=>h.releaseStore=resolve);const attachment={id:'saved-'+args.operationId,noteId:args.noteId,kind:'audio',displayName:args.name,mime:args.mime,size:atob(args.data).length,relativePath:'controlled/audio.webm',recordedAt:args.recordedAt};const op={operationId:args.operationId,noteId:args.noteId,status:'stored',attachment};h.journal.set(op.operationId,op);h.backend.attachments.push(attachment);h.backend.metadata.sequence++;if(h.rejectStoreResponse){h.rejectStoreResponse=false;throw Error('controlled stored response lost')}return tagged(structuredClone(op))}if(command==='query_attachment_operation'||command==='cancel_attachment_operation'){if(h.queryFailures){h.queryFailures--;throw Error('controlled query failure')}const op=h.journal.get(args.operationId);if(command==='query_attachment_operation'&&op&&JSON.stringify(h.backend.notes.find(n=>n.id===op.noteId)?.document).includes(op.attachment.id))op.status='committed';if(command==='cancel_attachment_operation'&&op){op.status='aborted';h.backend.attachments=[]}return tagged(op?structuredClone(op):{operationId:args.operationId,noteId:args.noteId,status:'notPersisted'})}if(command==='read_attachment'){const store=h.calls.find(c=>c.command==='store_attachment_operation'&&'saved-'+c.args.operationId===args.id)?.args;return tagged({data:store?.data||'',mime:store?.mime||'audio/wav',name:'新录音.wav',recordedAt:store?.recordedAt})};throw Error('unexpected IPC '+command)};
h.context=new AudioContext({sampleRate:48000});await h.context.resume();h.destination=h.context.createMediaStreamDestination();h.osc=h.context.createOscillator();h.osc.frequency.value=440;h.osc.connect(h.destination);h.osc.start();h.streams=0;h.starts=0;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{h.streams++;h.pendingStream=h.destination.stream.clone();if(h.holdStream)await new Promise(resolve=>h.releaseStream=resolve);return h.pendingStream}});const NativeRecorder=MediaRecorder;window.MediaRecorder=class extends NativeRecorder{start(...args){h.starts++;return super.start(...args)}};const decode=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=async function(...args){if(h.decodeFailures){h.decodeFailures--;throw Error('controlled decode failure')}return decode.apply(this,args)};const root=createRoot(document.querySelector('#root'));h.unmount=()=>flushSync(()=>root.unmount());root.render(<App/>);`;
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
const server = createServer((req, res) => {
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
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const checks=[],observations=[],errors=[];let browser,context,page;
try {
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:["--autoplay-policy=no-user-gesture-required"]});
  const origin="http://127.0.0.1:"+server.address().port;
  const setup=async config=>{
    await context?.close();context=await browser.newContext({viewport:{width:1280,height:800}});page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin+'/__check');
    await page.locator('.folder-row').filter({hasText:'全部备忘录'}).click();await page.locator('.note-row').filter({hasText:'Original A'}).click();await page.locator('.tiptap:visible').waitFor();
    await page.evaluate(config=>{const h=window.host;Object.assign(h,config);h.app.open();h.ticket=h.app.ticket;h.registration=h.ticket.registration},config||{});
  };
  const inspect=()=>page.evaluate(()=>{const h=window.host;return{active:!!h.app.ticket,sameTicket:h.app.ticket===h.ticket,registration:h.app.ticket?.registration?{sessionId:h.app.ticket.registration.sessionId,operationId:h.app.ticket.registration.operationId,error:h.app.ticket.registration.error,cancelRequested:h.app.ticket.registration.cancelRequested}:null,local:!!h.local,streams:h.streams,starts:h.starts,stores:h.calls.filter(c=>c.command==='store_attachment_operation').length,calls:h.calls.map(c=>({...c,args:c.args?.data?{...c.args,data:undefined,bytes:c.args.data.length}:c.args})),released:h.completedRelease,acks:h.quitAcks||[],destroyed:!!h.destroyed,phase:document.querySelector('[data-recording-state]')?.dataset.recordingState,lateEnded:h.pendingStream?.getTracks().every(t=>t.readyState==='ended')}});
  const check=(name,pass)=>{assert(pass,name);checks.push({name,pass:true})};
  const empty=s=>s.streams===0&&s.starts===0&&s.stores===0;
  const registrations=s=>s.calls.filter(c=>c.command==='register_recording_local').map(c=>c.args);
  const sameRegistration=s=>new Set(registrations(s).map(a=>a.sessionId+'/'+a.operationId)).size===1;
  const waitFailure=()=>page.locator('.recording-dock').getByRole('alert').filter({hasText:'controlled successful registration response lost'}).waitFor();

  await setup({registerResponseFailures:1});await waitFailure();let s=await inspect();
  check('lost successful registration reply retains fixed original ticket and visible recovery UI without admitting capture',s.active&&s.sameTicket&&s.local&&!!s.registration.sessionId&&empty(s)&&await page.getByRole('button',{name:'重试准备录音',exact:true}).isVisible());
  await page.evaluate(()=>window.host.app.open());s=await inspect();check('duplicate recording entry reveals same failed registration without replacing session or operation',s.sameTicket&&registrations(s).length===1);
  await page.getByRole('button',{name:'重试准备录音',exact:true}).click();await page.locator('.recording-dock .recording-primary').waitFor();s=await inspect();
  check('explicit retry recovers same unstarted native identity and mounts exactly one idle Panel',sameRegistration(s)&&registrations(s).length===2&&s.phase==='idle'&&empty(s));
  await page.locator('.recording-dock .recording-cancel').click();await page.waitForFunction(()=>!window.host.app.ticket);s=await inspect();
  check('recovered idle Panel closes with exact no-audio release and no final revision',!s.local&&empty(s)&&s.released.saved===false&&s.released.revision===0);observations.push({retry:s});

  await setup({registerResponseFailures:1});await waitFailure();await page.getByRole('button',{name:'取消准备录音',exact:true}).click();await page.waitForFunction(()=>!window.host.app.ticket);s=await inspect();
  check('visible cancel recovers original orphan registration then releases empty without mounting recorder',sameRegistration(s)&&registrations(s).length===2&&!s.local&&empty(s)&&s.released.saved===false);observations.push({cancel:s});

  await setup({registerResponseFailures:2});await waitFailure();await page.getByRole('button',{name:'取消准备录音',exact:true}).click();await page.getByRole('button',{name:'重试取消录音',exact:true}).waitFor();s=await inspect();
  check('failed cancellation recovery keeps visible cancel intent and same immutable registration',s.active&&s.sameTicket&&s.local&&s.registration.cancelRequested&&sameRegistration(s)&&empty(s)&&!await page.locator('.recording-primary').count());
  await page.getByRole('button',{name:'重试取消录音',exact:true}).click();await page.waitForFunction(()=>!window.host.app.ticket);s=await inspect();check('explicit cancellation retry resolves repeated registration response loss safely',!s.local&&sameRegistration(s)&&registrations(s).length===3&&empty(s));observations.push({cancelRetry:s});

  await setup({registerResponseFailures:1});await waitFailure();await page.evaluate(()=>{const h=window.host;h.closeWork=h.close({preventDefault(){h.prevented=true}})});await page.waitForFunction(()=>window.host.destroyed);s=await inspect();check('main close recovers registration and confirms empty cleanup before destroying owner',!s.active&&!s.local&&empty(s)&&s.released.saved===false&&sameRegistration(s));observations.push({mainClose:s});

  await setup({registerResponseFailures:1});await waitFailure();await page.evaluate(()=>{const h=window.host;h.quitWork=h.listeners.get('notes-recording-quit')({payload:{id:'quit-lost-registration'}})});await page.waitForFunction(()=>window.host.quitAcks?.some(a=>a.success));s=await inspect();check('CmdQ participant path recovers exact unstarted registration during sealed Quit and clears guard before exact ACK',!s.active&&!s.local&&empty(s)&&s.released.saved===false&&sameRegistration(s)&&s.acks.some(a=>a.id==='quit-lost-registration'&&a.success));observations.push({quit:s});

  for(const gate of ['Access','Stream','Started']) {
    await setup({['hold'+gate]:true});await page.locator('.recording-dock .recording-primary').click();await page.waitForFunction(gate=>typeof window.host['release'+gate]==='function',gate);
    await page.locator('.recording-dock .recording-cancel').click();await page.waitForFunction(()=>!window.host.app.ticket,null,{timeout:1500});s=await inspect();
    check('requesting close cancels pending '+gate+' promptly and confirms no-audio terminal without waiting for permission',!s.active&&!s.local&&s.starts===0&&s.stores===0&&s.released.saved===false&&s.released.revision===0&&(gate==='Stream'?s.streams===1:s.streams===0));
    await page.evaluate(gate=>window.host['release'+gate](),gate);await page.waitForTimeout(150);s=await inspect();
    check('late '+gate+' completion cannot start capture, create File/card, or re-register; late stream is stopped',!s.active&&!s.local&&s.starts===0&&s.stores===0&&(gate==='Stream'?s.lateEnded:s.streams===0));observations.push({gate,state:s});
  }

  await setup({holdAccess:true,cleanupFailures:1});await page.locator('.recording-dock .recording-primary').click();await page.waitForFunction(()=>!!window.host.releaseAccess);await page.locator('.recording-dock .recording-cancel').click();await page.waitForFunction(()=>document.querySelector('[data-recording-state="retry"]'));s=await inspect();
  check('empty cleanup failure retains retry sidebar and native guard after cancelling authorization',s.active&&s.local&&empty(s));await page.evaluate(()=>window.host.releaseAccess());await page.waitForTimeout(100);s=await inspect();check('late authorization after failed cleanup cannot restart cancelled preparation',empty(s)&&s.phase==='retry');await page.locator('.recording-dock .recording-cancel').click();await page.waitForFunction(()=>!window.host.app.ticket);s=await inspect();check('empty cleanup retry releases exact session without storing audio',!s.local&&empty(s)&&s.released.saved===false);observations.push({emptyCleanup:s});

  await setup();await page.locator('.recording-dock .recording-primary').click();await page.waitForFunction(()=>document.querySelector('[data-recording-state="recording"]'));await page.waitForTimeout(300);await page.locator('.recording-dock .recording-cancel').click();await page.waitForFunction(()=>!window.host.app.ticket);s=await inspect();check('already recorded audio still follows real final WAV/document ACK path rather than empty cancellation',!s.local&&s.starts===1&&s.stores===1&&s.released.saved===true&&s.released.revision===1);observations.push({recorded:s});
  assert.deepEqual(errors,[]);await writeFile(resolve(output,'result.json'),JSON.stringify({pass:true,checks,observations,errors},null,2));console.log(JSON.stringify({pass:true,checks}));
} catch(error) {await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error),stack:error.stack,checks,observations,errors,snapshot:await page?.evaluate(()=>({text:document.body.innerText,calls:window.host?.calls,active:!!window.host?.app?.ticket})).catch(()=>null)},null,2));throw error}
finally{await browser?.close();await new Promise(r=>server.close(r));await vite.close()}
