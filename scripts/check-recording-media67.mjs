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
  process.argv[2] || "docs/verification/mac-recording-media67/author/app",
);
await mkdir(output, { recursive: true });
const entryBase = `import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import App from'/src/App.tsx';import NoteEditor from'/src/Editor.tsx';import{useAttachmentMedia}from'/src/use-attachment-media';import * as bridge from'/src/bridge';import'/src/style.css';
window.__TAURI_INTERNALS__={};Object.defineProperty(navigator,'platform',{value:'MacIntel'});
const h=window.host={calls:[],loads:[],validations:[],submitted:[],gate:[],waits:0,errors:[],journal:new Map(),holdLoads:false,saveFailures:0};
const note=(id,text)=>({id,folderId:'default',title:text,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:text+'。'}]}]},createdAt:1,updatedAt:1,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:1});
h.backend={notes:[note('note-a','Original A'),note('note-b','Original B')],folders:[{id:'default',name:'备忘录',kind:'default',parentId:null,sortOrder:0,createdAt:1},{id:'trash',name:'最近删除',kind:'trash',parentId:null,sortOrder:9,createdAt:1}],attachments:[],settings:{selectedFolder:'default',selectedNote:'note-a'},access:{sessionId:'controlled-native-session',epoch:1,notes:{'note-a':{epoch:0,authorized:true},'note-b':{epoch:0,authorized:true}},suspended:[],operationId:null},metadata:{sessionId:'controlled-native-session',sequence:0}};
const snapshot=()=>structuredClone(h.backend);const tagged=value=>({...value,access:structuredClone(h.backend.access),metadata:structuredClone(h.backend.metadata)});
h.listeners=new Map();h.window={label:'main',listen:async(name,handler)=>{h.listeners.set(name,handler);return()=>h.listeners.delete(name)},onCloseRequested:async fn=>{h.close=fn;return()=>{}},onFocusChanged:async()=>()=>{},hide:async()=>{},show:async()=>{},setFocus:async()=>{},destroy:async()=>{h.destroyed=true},close:async()=>{},isFocused:async()=>true};
h.invoke=async(command,args)=>{h.calls.push({command,args});if(command==='register_recording_local'){if(h.local){if(h.local.sessionId!==args.sessionId||h.local.operationId!==args.operationId||h.started)throw Error('conflicting native registration')}else{if(h.nativeQuit)throw Error('new registration forbidden during Quit');h.local={...args,owner:'main',incarnation:'controlled-native-incarnation'};h.started=false}if(h.registerResponseFailures){h.registerResponseFailures--;throw Error('controlled successful registration response lost')}return h.local}if(command==='recording_local_release'&&!h.local&&h.completedRelease&&args.sessionId===h.completedRelease.sessionId&&args.operationId===h.completedRelease.operationId&&args.incarnation===h.completedRelease.incarnation&&args.saved===h.completedRelease.saved&&args.revision===h.completedRelease.revision)return;if(command.startsWith('recording_local_')){if(!h.local||args.sessionId!==h.local.sessionId||args.operationId!==h.local.operationId||args.incarnation!==h.local.incarnation)throw Error('stale native local identity');if(command==='recording_local_started'){h.started=true;if(h.holdStarted)await new Promise(resolve=>h.releaseStarted=resolve);return}if(command==='recording_local_validate')return;if(command==='recording_local_revision'){if(h.revisionFailure){h.revisionFailure=false;throw Error('controlled native revision response failure')}if(args.revision!==(h.nativeRevision||0)+1&&args.revision!==h.nativeRevision)throw Error('inexact native revision');h.nativeRevision=args.revision;h.nativeFinal=args.finalIntent;if(h.revisionLostResponse){h.revisionLostResponse=false;throw Error('controlled committed native revision response lost')}return}if(command==='recording_local_release'){if(h.cleanupFailures){h.cleanupFailures--;throw Error('controlled native cleanup failure')}if(args.saved&&(!h.nativeFinal||args.revision!==h.nativeRevision))throw Error('final ACK missing');h.completedRelease=args;h.local=null;if(h.cleanupLostResponse){h.cleanupLostResponse=false;throw Error('controlled completed native cleanup response lost')}return}}if(command==='recording_quit_sealed'){h.nativeQuit=true;h.sealed=args.id;if(!h.holdReady)h.listeners.get('notes-recording-quit-ready')?.({payload:{id:args.id}});return}if(command==='recording_quit_ack'){h.quitAcks=(h.quitAcks||[]).concat([args]);if(!args.success)h.listeners.get('notes-recording-quit-cancelled')?.({payload:{id:args.id}});return}if(command==='plugin:notes-ui|recording_access'){if(h.holdAccess)await new Promise(resolve=>h.releaseAccess=resolve);return{status:'authorized'}};if(command==='load_workspace'){if(h.holdLoads)await new Promise(resolve=>h.loads.push({release:resolve}));return h.lastRead=snapshot()}if(command==='register_save_intent'||command==='acknowledge_access')return;if(command==='workspace_action'){const a=args.action;if(a.type==='settings'){Object.assign(h.backend.settings,a.settings);return tagged(snapshot())}if(a.type!=='saveNote')throw Error('unexpected action '+a.type);if(h.saveFailures>0){h.saveFailures--;throw Error('controlled document ACK failure')}if(h.holdSave)await new Promise(resolve=>h.releaseSave=resolve);const n=h.backend.notes.find(n=>n.id===a.id);n.document=structuredClone(a.document);n.revision++;h.backend.metadata.sequence++;return tagged(structuredClone(n))}if(command==='store_attachment_operation'){if(h.storeFailures){h.storeFailures--;throw Error('controlled store failure')}if(h.holdStore)await new Promise(resolve=>h.releaseStore=resolve);const attachment={id:'saved-'+args.operationId,noteId:args.noteId,kind:'audio',displayName:args.name,mime:args.mime,size:atob(args.data).length,relativePath:'controlled/audio.webm',recordedAt:args.recordedAt};const op={operationId:args.operationId,noteId:args.noteId,status:'stored',attachment};h.journal.set(op.operationId,op);h.backend.attachments.push(attachment);h.backend.metadata.sequence++;if(h.rejectStoreResponse){h.rejectStoreResponse=false;throw Error('controlled stored response lost')}return tagged(structuredClone(op))}if(command==='query_attachment_operation'||command==='cancel_attachment_operation'){if(h.queryFailures){h.queryFailures--;throw Error('controlled query failure')}const op=h.journal.get(args.operationId);if(command==='query_attachment_operation'&&op&&JSON.stringify(h.backend.notes.find(n=>n.id===op.noteId)?.document).includes(op.attachment.id))op.status='committed';if(command==='cancel_attachment_operation'&&op){op.status='aborted';h.backend.attachments=[]}return tagged(op?structuredClone(op):{operationId:args.operationId,noteId:args.noteId,status:'notPersisted'})}if(command==='read_attachment'){const store=h.calls.find(c=>c.command==='store_attachment_operation'&&'saved-'+c.args.operationId===args.id)?.args;return tagged({data:store?.data||'',mime:store?.mime||'audio/wav',name:'新录音.wav',recordedAt:store?.recordedAt})};throw Error('unexpected IPC '+command)};
h.context=new AudioContext({sampleRate:48000});await h.context.resume();h.destination=h.context.createMediaStreamDestination();h.osc=h.context.createOscillator();h.osc.frequency.value=440;h.osc.connect(h.destination);h.osc.start();h.streams=0;h.starts=0;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{h.streams++;h.pendingStream=h.destination.stream.clone();if(h.holdStream)await new Promise(resolve=>h.releaseStream=resolve);return h.pendingStream}});const NativeRecorder=MediaRecorder;window.MediaRecorder=class extends NativeRecorder{start(...args){h.starts++;return super.start(...args)}};const decode=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=async function(...args){if(h.decodeFailures){h.decodeFailures--;throw Error('controlled decode failure')}return decode.apply(this,args)};const root=createRoot(document.querySelector('#root'));h.unmount=()=>flushSync(()=>root.unmount());root.render(<App/>);`;
// All production bridge/gate/hook/NodeView code stays intact. The trace wraps
// public gate methods without changing their result; native IPC and media are
// synthetic. A held read retains the metadata snapshot from its actual request.
const fixture = `
h.trace=[];h.reads=[];h.plan=[];h.urls=[];h.revoked=[];h.pendingReads=new Map();
const clone=value=>structuredClone(value);
const gate=bridge.metadataGate;const canPublish=gate.canPublish.bind(gate);
gate.canPublish=state=>{const accepted=canPublish(state);h.trace.push({event:'metadata-verdict',sequence:state?.sequence,observed:gate.observed,applied:gate.applied,accepted});return accepted};
const stamp=bridge.accessGate.stamp.bind(bridge.accessGate);
bridge.accessGate.stamp=noteId=>{const value=stamp(noteId);h.trace.push({event:'access-stamp',...value});return value};
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=createURL(blob);h.urls.push({url,size:blob.size,type:blob.type});h.trace.push({event:'url-created',url,size:blob.size});return url};
URL.revokeObjectURL=url=>{h.revoked.push(url);h.trace.push({event:'url-revoked',url});revokeURL(url)};
const samples=24000,buffer=new ArrayBuffer(44+samples*2),view=new DataView(buffer),bytes=new Uint8Array(buffer);
const text=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i)};
text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples*2,true);for(let i=0;i<samples;i++)view.setInt16(44+i*2,Math.sin(i*440*2*Math.PI/24000)*8000,true);
h.syntheticData=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
const rawInvoke=h.invoke;
h.invoke=async(command,args)=>{
 if(command!=='read_attachment'){
  const value=await rawInvoke(command,args);
  const pendingFinal=h.reads[h.finalRead];
  if(command==='recording_local_validate'&&h.holdPostAckValidation&&pendingFinal&&h.pendingReads.has(h.finalRead)&&h.backend.metadata.sequence>pendingFinal.sequence){h.holdPostAckValidation=false;h.trace.push({event:'post-ack-validation-held',generation:bridge.accessGate.generation,sequence:h.backend.metadata.sequence});await new Promise(resolve=>h.releaseValidation=resolve);}
  if(command==='workspace_action'&&args.action.type==='saveNote')h.trace.push({event:'body-ack',noteId:args.action.id,sequence:value.metadata.sequence});
  if(command==='recording_local_release')h.trace.push({event:'native-release',saved:args.saved,revision:args.revision});
  return value;
 }
 h.calls.push({command,args});const index=h.reads.length;
 const attachment=h.backend.attachments.find(a=>a.id===args.id);
 if(!attachment)throw Error('附件不存在');
 const note=h.backend.notes.find(n=>n.id===attachment.noteId),access=h.backend.access;
 const store=h.calls.find(c=>c.command==='store_attachment_operation'&&'saved-'+c.args.operationId===args.id)?.args;
 const value={data:store?.data||h.syntheticData,mime:store?.mime||'audio/wav',name:store?.name||attachment.displayName,recordedAt:attachment.recordedAt,access:clone(access),metadata:clone(h.backend.metadata)};
 const request={index,id:args.id,expected:clone(args.expected),sequence:value.metadata.sequence,generation:bridge.accessGate.generation};h.reads.push(request);h.trace.push({event:'read-request',...request});
 if(!access.notes[attachment.noteId]?.authorized||note.locked)throw Error('备忘录已锁定，不能读取附件');
 if(args.expected.sessionId!==access.sessionId||args.expected.epoch!==access.epoch||args.expected.noteEpoch!==access.notes[attachment.noteId].epoch)throw Error('原生授权身份已改变');
 const plan=h.plan.shift();
 if(plan==='lookalike')throw Object.assign(Error('列表已有新的变化，请重新同步'),{code:'metadata_stale'});
 if(plan==='unreadable')throw Error('受控附件不可读');
 if(plan==='bad-date')value.recordedAt='not-a-valid-recording-date';
 if(plan==='hold')await new Promise((resolve,reject)=>h.pendingReads.set(index,{resolve,reject}));
 h.pendingReads.delete(index);h.trace.push({event:'read-response',index,id:args.id,sequence:value.metadata.sequence});return value;
};
h.releaseRead=index=>h.pendingReads.get(index)?.resolve();
h.advance=async()=>{const n=h.backend.notes[0];await bridge.action({type:'saveNote',id:n.id,document:clone(n.document),revision:n.revision});h.trace.push({event:'metadata-advanced',observed:gate.observed,applied:gate.applied});};
h.accessEvent=()=>h.listeners.get('notes-access')?.({payload:{access:clone(h.backend.access)}});
h.mediaNote=(id='asset-a',kind='audio')=>({...clone(h.backend.notes[0]),document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Synthetic media boundary'}]},{type:'attachment',attrs:{id,name:id==='asset-a'?'Synthetic A.wav':'Synthetic B.wav',kind}},{type:'paragraph'}]}});
const onReady=e=>h.editor=e;
function Probe({id,kind}){const value=useAttachmentMedia(id,kind);h.hook=value;return <div data-hook-media={!!value.media} data-hook-error={value.error}><button onClick={value.retry}>manual hook retry</button>{value.error}</div>}
h.mount=(mode='media',id='asset-a',kind='audio')=>flushSync(()=>{const child=mode==='hook'?<Probe id={id} kind={kind}/>:<div className={h.mobile?'app mobile':'app'}><NoteEditor note={h.mediaNote(id,kind)} onReady={onReady} onChange={()=>{h.unexpectedEdits=(h.unexpectedEdits||0)+1}} onFocus={()=>{}}/></div>;root.render(h.strict?<React.StrictMode>{child}</React.StrictMode>:child)});
h.changeAsset=(id,kind='audio')=>{const a=h.backend.attachments.find(a=>a.id===id);if(kind!=='audio'){a.kind=kind;delete a.recordedAt;}const e=h.editor;let found=false;e.state.doc.descendants((node,pos)=>{if(!found&&node.type.name==='attachment'){found=true;e.view.dispatch(e.state.tr.setNodeMarkup(pos,undefined,{...node.attrs,id,kind}));}})};
h.inspect=()=>({reads:clone(h.reads),trace:clone(h.trace),urls:clone(h.urls),revoked:clone(h.revoked),pending:[...h.pendingReads.keys()],observed:gate.observed,applied:gate.applied,accessGeneration:bridge.accessGate.generation,doc:h.editor?.getJSON(),hookError:h.hook?.error,hookMedia:!!h.hook?.media});
const mode=new URL(location.href).searchParams.get('mode');
if(mode==='app')root.render(<App/>);else{
 h.backend.attachments=['asset-a','asset-b'].map(id=>({id,noteId:'note-a',kind:'audio',displayName:id==='asset-a'?'Synthetic A.wav':'Synthetic B.wav',mime:'audio/wav',size:buffer.byteLength,relativePath:'synthetic.wav',recordedAt:1793865600000}));
 bridge.markWorkspaceApplied(await bridge.loadWorkspace());await bridge.subscribeAccess(()=>{});h.ready=true;
}
`;
const entry = entryBase.replace("root.render(<App/>);", fixture);
assert(entry.includes("h.pendingReads=new Map()"));
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
  if (req.url?.split("?")[0] === "/__check") {
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
const baseline = process.argv.includes("--baseline");
const strictOnly = process.argv.includes("--strict-only");
const checks = [], observations = [], pageErrors = [];
let browser, context, page;
const check = (name, pass) => {
  assert(pass, name);
  checks.push({ name, pass: true });
};
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const fresh = async (mode = "media", mobile = false) => {
    await context?.close();
    context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    page = await context.newPage();
    page.on("pageerror", error => pageErrors.push(String(error)));
    await page.goto(origin + "/__check?mode=" + mode);
    if (mode !== "app") await page.waitForFunction(() => window.host.ready);
  };
  const snapshot = () => page.evaluate(() => window.host.inspect());
  const pending = index => page.waitForFunction(i => window.host.pendingReads.has(i), index);
  const release = index => page.evaluate(i => window.host.releaseRead(i), index);
  const advance = () => page.evaluate(() => window.host.advance());
  const mounted = async (plan = [], mode = "media", mobile = false) => {
    await fresh(mode, mobile);
    await page.evaluate(({ plan, mode, mobile }) => {
      const h = window.host;
      h.plan = plan;
      h.mobile = mobile;
      h.mount(mode);
    }, { plan, mode, mobile });
  };
  const audioReady = () => page.waitForFunction(() => {
    const audio = document.querySelector(".attachment-node.audio audio");
    return audio && Number.isFinite(audio.duration) && audio.duration > 0;
  });

  // The same full production App used by sidebar66: only IPC/hardware are
  // controlled. Hold final attachment bytes and the post-body-ACK native
  // validation response so the read encounters a metadata-only change before
  // the next trusted synchronization changes access generation. Then finish
  // the actual final lifecycle and reveal the persistent card.
  if (!strictOnly) {
  await fresh("app");
  await page.locator(".folder-row").filter({ hasText: "全部备忘录" }).click();
  await page.locator(".note-row").filter({ hasText: "Original A" }).click();
  await page.locator(".tiptap:visible").waitFor();
  await page.evaluate(() => window.host.app.open());
  await page.locator(".recording-dock .recording-primary").click();
  await page.waitForFunction(() => document.querySelector('[data-recording-state="recording"]'));
  await page.waitForTimeout(250); // Obtain a finite synthetic encoder segment.
  await page.locator(".recording-dock .recording-primary").click();
  await page.waitForFunction(() => document.querySelector('[data-recording-state="paused"]'));
  await page.locator(".recording-dock .recording-primary").click();
  await page.waitForFunction(() => document.querySelector('[data-recording-state="recording"]'));
  await page.waitForTimeout(250);
  await page.locator(".recording-dock .recording-primary").click();
  await page.waitForFunction(() => document.querySelector('[data-recording-state="paused"]'));
  const finalRead = await page.evaluate(() => {
    const h = window.host;
    h.plan = ["hold"];
    h.holdPostAckValidation = true;
    h.finalRead = h.reads.length;
    h.trace.push({ event: "begin-final-close", readIndex: h.finalRead });
    return h.finalRead;
  });
  await page.locator(".recording-dock .recording-cancel").click();
  await pending(finalRead);
  await page.waitForFunction(() => !!window.host.releaseValidation);
  let s = await snapshot();
  const held = s.reads[finalRead];
  check("real final body ACK advances metadata while native response gate retains the original access generation",
    held.sequence < s.observed && held.generation === s.accessGeneration && await page.locator("[data-recording-live-card]").count() === 1);
  await release(finalRead);
  if (baseline) await page.waitForFunction(() => document.querySelector(".attachment-node.audio")?.textContent.includes("列表已有新的变化"));
  else await audioReady();
  await page.evaluate(() => window.host.releaseValidation());
  await page.waitForFunction(() => !window.host.app.ticket);
  check("real final cleanup removes overlay and sidebar only after body and native final acknowledgement",
    await page.evaluate(() => window.host.completedRelease?.saved === true && window.host.completedRelease.revision === 3) &&
    await page.locator("[data-recording-live-card]").count() === 0 && await page.locator(".recording-dock").count() === 0);
  if (baseline) {
    await page.locator(".attachment-node.audio").getByRole("alert").filter({ hasText: "列表已有新的变化" }).waitFor();
    s = await snapshot();
    check("baseline reproduces user-visible MetadataStale with manual retry and no automatic read",
      s.reads.length === finalRead + 1 && await page.getByRole("button", { name: "重试录音", exact: true }).isVisible() &&
      await page.locator(".attachment-node.audio .audio-card").count() === 0);
    await page.screenshot({ path: resolve(output, "baseline-stale-visible.png") });
    observations.push({ scenario: "baseline-real-final-handoff", ...s });
  } else {
    await audioReady();
    s = await snapshot();
    const next = s.reads[finalRead + 1];
    check("actual MediaView discards stale final read and automatically starts a fresh fully gated read",
      !!next && next.id === held.id && next.sequence > held.sequence && s.reads.length === finalRead + 2 &&
      s.trace.some(e => e.event === "metadata-verdict" && !e.accepted && e.sequence === held.sequence) &&
      await page.getByRole("button", { name: "重试录音", exact: true }).count() === 0);
    const writes = await page.evaluate(() => {
      const h = window.host;
      return { stores: h.calls.filter(c => c.command === "store_attachment_operation").length,
        body: h.backend.notes[0].document,
        other: h.backend.notes[1].document,
        released: h.completedRelease,
        cards: document.querySelectorAll(".attachment-node.audio").length };
    });
    check("stale media recovery performs no recording write, version, or duplicate-node repair",
      writes.stores === 3 && writes.released.revision === 3 && writes.cards === 1 &&
      JSON.stringify(writes.body).includes(held.id) && !JSON.stringify(writes.other).includes("saved-"));
    await page.locator(".audio-play-toggle").click();
    await page.waitForFunction(() => {
      const audio = document.querySelector(".attachment-node.audio audio");
      return !audio.paused && audio.currentTime > 0;
    });
    check("first persistent card after overlay removal can play synthetic final WAV without manual retry", true);
    await page.locator(".audio-play-toggle").click();
    await page.screenshot({ path: resolve(output, "final-persistent-card.png") });
    observations.push({ scenario: "real-final-handoff", ...s, writes });

    await mounted(["hold", "hold"]);
    await pending(0); await advance(); await release(0); await pending(1);
    await advance(); await release(1); await audioReady(); s = await snapshot();
    check("two stale reads are rejected before third read supplies the only created media URL",
      s.reads.length === 3 && s.reads.map(r => r.sequence).join() === "0,1,2" && s.urls.length === 1 &&
      s.trace.filter(e => e.event === "metadata-verdict" && !e.accepted).length === 2 &&
      s.trace.filter(e => e.event === "access-stamp" && e.noteId === "note-a").length === 5);
    observations.push({ scenario: "two-stale-then-success", ...s });

    await mounted(["hold", "hold", "hold"]);
    for (let i = 0; i < 3; i++) { await pending(i); await advance(); await release(i); }
    await page.locator(".attachment-node.audio").getByRole("alert").waitFor(); s = await snapshot();
    check("three total stale attempts terminate visibly without allocating media or continuing automatically",
      s.reads.length === 3 && s.urls.length === 0 && await page.getByRole("button", { name: "重试录音", exact: true }).isVisible());
    await page.getByRole("button", { name: "重试录音", exact: true }).click(); await audioReady(); s = await snapshot();
    check("explicit manual retry after exhaustion owns a new version and can load a fresh authorized response",
      s.reads.length === 4 && s.reads[3].sequence === 3 && s.urls.length === 1);
    observations.push({ scenario: "exhaustion-manual-retry", ...s });

    for (const failure of ["lookalike", "unreadable", "bad-date"]) {
      await mounted([failure]);
      await page.locator(".attachment-node.audio").getByRole("alert").waitFor(); s = await snapshot();
      check("non-typed " + failure + " error remains visible after exactly one read", s.reads.length === 1 && s.urls.length === 0);
      observations.push({ scenario: failure, ...s });
    }

    await mounted(["hold"]); await pending(0);
    await page.evaluate(() => window.host.accessEvent()); await release(0);
    await page.locator(".attachment-node.audio").getByRole("alert").filter({ hasText: "授权状态已改变" }).waitFor(); s = await snapshot();
    check("real AccessChanged rejects in-flight response without metadata retry or media publication", s.reads.length === 1 && s.urls.length === 0);
    observations.push({ scenario: "access-generation-changed", ...s });

    for (const state of ["locked", "revoked"]) {
      await mounted(["hold"]); await pending(0); await advance();
      await page.evaluate(state => {
        const h = window.host;
        if (state === "locked") h.backend.notes[0].locked = true;
        h.backend.access.notes["note-a"].authorized = false;
      }, state);
      await release(0);
      await page.locator(".attachment-node.audio").getByRole("alert").filter({ hasText: "不能读取附件" }).waitFor(); s = await snapshot();
      check("fresh read after stale stops at native " + state + " denial without a third try", s.reads.length === 2 && s.urls.length === 0);
      observations.push({ scenario: state, ...s });
    }

    for (const change of ["id", "kind", "unmount"]) {
      await mounted(["hold"]); await pending(0); await advance();
      await page.evaluate(change => {
        const h = window.host;
        if (change === "unmount") h.unmount();
        else h.changeAsset(change === "id" ? "asset-b" : "asset-a", change === "kind" ? "file" : "audio");
      }, change);
      if (change === "id") await audioReady();
      if (change === "kind") await page.waitForFunction(() => document.querySelector(".attachment-node.file .file-card")?.getAttribute("href")?.startsWith("data:"));
      const before = await snapshot(); await release(0);
      await page.waitForFunction(() => window.host.trace.some(e => e.event === "read-response" && e.index === 0));
      // Drain actual promise continuations and the next task; no timing sleep.
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0))); s = await snapshot();
      check(change + " invalidates old stale response without old retry, URL, or failure publication",
        s.reads.length === (change === "unmount" ? 1 : 2) && s.urls.length === before.urls.length &&
        await page.getByRole("button", { name: "重试录音", exact: true }).count() === 0);
      observations.push({ scenario: "changed-" + change, ...s });
    }

    for (const change of ["id", "kind", "unmount"]) {
      await mounted(["hold"]); await pending(0);
      await page.evaluate(change => {
        const h = window.host;
        if (change === "unmount") h.unmount();
        else h.changeAsset(change === "id" ? "asset-b" : "asset-a", change === "kind" ? "file" : "audio");
      }, change);
      if (change === "id") await audioReady();
      if (change === "kind") await page.waitForFunction(() => document.querySelector(".attachment-node.file .file-card")?.getAttribute("href")?.startsWith("data:"));
      const before = await snapshot(); await release(0);
      await page.waitForFunction(() => window.host.trace.some(e => e.event === "read-response" && e.index === 0));
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0))); s = await snapshot();
      check(change + " discards even a fully gate-accepted late response before it can allocate an old media URL",
        s.reads.length === (change === "unmount" ? 1 : 2) && s.urls.length === before.urls.length &&
        await page.getByRole("button", { name: "重试录音", exact: true }).count() === 0);
      observations.push({ scenario: "accepted-late-" + change, ...s });
    }

    await mounted(["hold", "hold"], "hook"); await pending(0); await advance();
    await page.getByRole("button", { name: "manual hook retry", exact: true }).click(); await pending(1);
    await release(0); await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0))); s = await snapshot();
    check("manual new version cancels old pending stale attempt before its automatic retry", s.reads.length === 2 && s.urls.length === 0);
    await release(1); await page.waitForFunction(() => window.host.hook.media); s = await snapshot();
    check("new manual version alone publishes its accepted media", s.reads.length === 2 && s.urls.length === 1 && !s.hookError);
    observations.push({ scenario: "manual-version-pending", ...s });

    await mounted(); await audioReady();
    await page.locator(".audio-play-toggle").click();
    await page.waitForFunction(() => !document.querySelector("audio").paused);
    await page.evaluate(() => { window.host.oldAudio = document.querySelector("audio"); window.host.changeAsset("asset-b"); });
    await audioReady(); s = await snapshot();
    const switched = await page.evaluate(() => ({ paused: window.host.oldAudio.paused, src: window.host.oldAudio.getAttribute("src") }));
    check("accepted attachment identity replacement stops old playback and revokes its source before keeping the new source",
      s.urls.length === 2 && s.revoked.length === 1 && s.urls[0].url === s.revoked[0] && switched.paused && switched.src === null);
    await page.evaluate(() => window.host.unmount());
    await page.waitForFunction(() => !document.querySelector("audio")); s = await snapshot();
    const cleaned = await page.evaluate(() => ({ paused: window.host.oldAudio.paused, src: window.host.oldAudio.getAttribute("src") }));
    check("unmount stops playback and revokes each accepted object URL exactly once",
      s.urls.length === 2 && s.revoked.length === 2 && new Set(s.revoked).size === 2 && s.urls.every(value => s.revoked.includes(value.url)) && cleaned.paused && cleaned.src === null);
    observations.push({ scenario: "accepted-url-cleanup", ...s, cleaned });

    await mounted(["hold"], "media", true); await pending(0); await advance(); await release(0); await audioReady();
    await page.locator(".audio-title-toggle").tap();
    await page.getByRole("slider", { name: "播放进度" }).waitFor();
    await page.locator(".audio-play-toggle").tap();
    await page.waitForFunction(() => !document.querySelector("audio").paused);
    await page.locator(".audio-play-toggle").tap(); s = await snapshot();
    check("shared mobile NodeView recovers stale media and retains touch expand/play/pause without document edits",
      s.reads.length === 2 && s.urls.length === 1 && await page.evaluate(() => !window.host.unexpectedEdits && document.querySelector("audio").paused));
    await page.screenshot({ path: resolve(output, "mobile-persistent-card.png") });
    observations.push({ scenario: "mobile-shared-media", ...s });
  }
  } else {
    await fresh("hook");
    await page.evaluate(() => { const h = window.host; h.strict = true; h.mount("hook"); });
    await page.waitForFunction(() => window.host.hook.media);
    const s = await snapshot();
    check("development StrictMode replay discards first lifetime response and creates one accepted source",
      s.reads.length === 2 && s.urls.length === 1 && !s.hookError);
    await page.evaluate(() => window.host.unmount());
    const cleaned = await snapshot();
    check("StrictMode surviving lifetime releases its only media URL once on unmount",
      cleaned.revoked.length === 1 && cleaned.revoked[0] === cleaned.urls[0].url);
    observations.push({ scenario: "strict-lifetime-replay", ...cleaned });
  }
  assert.deepEqual(pageErrors, []);
  await writeFile(resolve(output, "result.json"), JSON.stringify({
    pass: true, mode: strictOnly ? "strict-lifetime" : baseline ? "baseline-expected-defect" : "candidate", checks, observations, pageErrors,
  }, null, 2) + "\n");
  console.log(JSON.stringify({ pass: true, mode: strictOnly ? "strict-lifetime" : baseline ? "baseline-expected-defect" : "candidate", checks }));
} catch (error) {
  await writeFile(resolve(output, "failure.json"), JSON.stringify({
    error: String(error), stack: error.stack, checks, observations, pageErrors,
    current: await page?.evaluate(() => ({ text: document.body.innerText, ...window.host?.inspect() })).catch(() => null),
  }, null, 2) + "\n");
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await vite.close();
}
