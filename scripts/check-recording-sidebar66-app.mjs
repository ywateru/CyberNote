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
  process.argv[2] || "docs/verification/mac-recording-sidebar66/author/app",
);
await mkdir(output, { recursive: true });
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import App from'/src/App.tsx';import'/src/style.css';
const h=window.host={calls:[],loads:[],validations:[],submitted:[],gate:[],waits:0,errors:[],journal:new Map(),holdLoads:false,saveFailures:0};
const note=(id,text)=>({id,folderId:'default',title:text,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:text+'。'}]}]},createdAt:1,updatedAt:1,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:1});
h.backend={notes:[note('note-a','Original A'),note('note-b','Original B')],folders:[{id:'default',name:'备忘录',kind:'default',parentId:null,sortOrder:0,createdAt:1},{id:'trash',name:'最近删除',kind:'trash',parentId:null,sortOrder:9,createdAt:1}],attachments:[],settings:{selectedFolder:'default',selectedNote:'note-a'},access:{sessionId:'controlled-native-session',epoch:1,notes:{'note-a':{epoch:0,authorized:true},'note-b':{epoch:0,authorized:true}},suspended:[],operationId:null},metadata:{sessionId:'controlled-native-session',sequence:0}};
const snapshot=()=>structuredClone(h.backend);const tagged=value=>({...value,access:structuredClone(h.backend.access),metadata:structuredClone(h.backend.metadata)});
h.listeners=new Map();h.window={label:'main',listen:async(name,handler)=>{h.listeners.set(name,handler);return()=>h.listeners.delete(name)},onCloseRequested:async fn=>{h.close=fn;return()=>{}},onFocusChanged:async()=>()=>{},hide:async()=>{},show:async()=>{},setFocus:async()=>{},destroy:async()=>{h.destroyed=true},close:async()=>{},isFocused:async()=>true};
h.invoke=async(command,args)=>{h.calls.push({command,args});if(command==='register_recording_local'){h.local={...args,owner:'main',incarnation:'controlled-native-incarnation'};return h.local}if(command==='recording_local_release'&&!h.local&&h.completedRelease&&args.sessionId===h.completedRelease.sessionId&&args.operationId===h.completedRelease.operationId&&args.incarnation===h.completedRelease.incarnation&&args.saved===h.completedRelease.saved&&args.revision===h.completedRelease.revision)return;if(command.startsWith('recording_local_')){if(!h.local||args.sessionId!==h.local.sessionId||args.operationId!==h.local.operationId||args.incarnation!==h.local.incarnation)throw Error('stale native local identity');if(command==='recording_local_started'){h.started=true;return}if(command==='recording_local_validate')return;if(command==='recording_local_revision'){if(h.revisionFailure){h.revisionFailure=false;throw Error('controlled native revision response failure')}if(args.revision!==(h.nativeRevision||0)+1&&args.revision!==h.nativeRevision)throw Error('inexact native revision');h.nativeRevision=args.revision;h.nativeFinal=args.finalIntent;if(h.revisionLostResponse){h.revisionLostResponse=false;throw Error('controlled committed native revision response lost')}return}if(command==='recording_local_release'){if(h.cleanupFailures){h.cleanupFailures--;throw Error('controlled native cleanup failure')}if(args.saved&&(!h.nativeFinal||args.revision!==h.nativeRevision))throw Error('final ACK missing');h.completedRelease=args;h.local=null;if(h.cleanupLostResponse){h.cleanupLostResponse=false;throw Error('controlled completed native cleanup response lost')}return}}if(command==='recording_quit_sealed'){h.sealed=args.id;if(!h.holdReady)h.listeners.get('notes-recording-quit-ready')?.({payload:{id:args.id}});return}if(command==='recording_quit_ack'){h.quitAcks=(h.quitAcks||[]).concat([args]);if(!args.success)h.listeners.get('notes-recording-quit-cancelled')?.({payload:{id:args.id}});return}if(command==='plugin:notes-ui|recording_access')return{status:'authorized'};if(command==='load_workspace'){if(h.holdLoads)await new Promise(resolve=>h.loads.push({release:resolve}));return h.lastRead=snapshot()}if(command==='register_save_intent'||command==='acknowledge_access')return;if(command==='workspace_action'){const a=args.action;if(a.type==='settings'){Object.assign(h.backend.settings,a.settings);return tagged(snapshot())}if(a.type!=='saveNote')throw Error('unexpected action '+a.type);if(h.saveFailures>0){h.saveFailures--;throw Error('controlled document ACK failure')}if(h.holdSave)await new Promise(resolve=>h.releaseSave=resolve);const n=h.backend.notes.find(n=>n.id===a.id);n.document=structuredClone(a.document);n.revision++;h.backend.metadata.sequence++;return tagged(structuredClone(n))}if(command==='store_attachment_operation'){if(h.storeFailures){h.storeFailures--;throw Error('controlled store failure')}if(h.holdStore)await new Promise(resolve=>h.releaseStore=resolve);const attachment={id:'saved-'+args.operationId,noteId:args.noteId,kind:'audio',displayName:args.name,mime:args.mime,size:atob(args.data).length,relativePath:'controlled/audio.webm',recordedAt:args.recordedAt};const op={operationId:args.operationId,noteId:args.noteId,status:'stored',attachment};h.journal.set(op.operationId,op);h.backend.attachments.push(attachment);h.backend.metadata.sequence++;if(h.rejectStoreResponse){h.rejectStoreResponse=false;throw Error('controlled stored response lost')}return tagged(structuredClone(op))}if(command==='query_attachment_operation'||command==='cancel_attachment_operation'){if(h.queryFailures){h.queryFailures--;throw Error('controlled query failure')}const op=h.journal.get(args.operationId);if(command==='query_attachment_operation'&&op&&JSON.stringify(h.backend.notes.find(n=>n.id===op.noteId)?.document).includes(op.attachment.id))op.status='committed';if(command==='cancel_attachment_operation'&&op){op.status='aborted';h.backend.attachments=[]}return tagged(op?structuredClone(op):{operationId:args.operationId,noteId:args.noteId,status:'notPersisted'})}if(command==='read_attachment'){const store=h.calls.find(c=>c.command==='store_attachment_operation'&&'saved-'+c.args.operationId===args.id)?.args;return tagged({data:store?.data||'',mime:store?.mime||'audio/wav',name:'新录音.wav',recordedAt:store?.recordedAt})};throw Error('unexpected IPC '+command)};
h.context=new AudioContext({sampleRate:48000});await h.context.resume();h.destination=h.context.createMediaStreamDestination();h.osc=h.context.createOscillator();h.osc.frequency.value=440;h.osc.connect(h.destination);h.osc.start();h.streams=0;h.starts=0;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{h.streams++;return h.destination.stream}});const NativeRecorder=MediaRecorder;window.MediaRecorder=class extends NativeRecorder{start(...args){h.starts++;return super.start(...args)}};const decode=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=async function(...args){if(h.decodeFailures){h.decodeFailures--;throw Error('controlled decode failure')}return decode.apply(this,args)};const root=createRoot(document.querySelector('#root'));h.unmount=()=>flushSync(()=>root.unmount());root.render(<App/>);`;
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
const checks = [],
  errors = [],
  observations = [];
let browser, page, context;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const open = async () => {
    await context?.close();
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(origin + "/__check");
    await page.locator(".folder-row").filter({ hasText: "全部备忘录" }).click();
    await page.locator(".note-row").filter({ hasText: "Original A" }).click();
    await page.locator(".tiptap:visible").waitFor();
    await page.evaluate(async () => {
      const h = window.host,
        e = h.app.editor,
        end = e.state.doc.content.size - 1;
      e.commands.setTextSelection({ from: end - 1, to: end });
      h.original = e;
      h.app.open();
      await h.app.ticket.opening;
    });
    await page.locator(".recording-dock .recording-primary").waitFor();
  };
  const start = async () => {
    await page.locator(".recording-dock .recording-primary").click();
    await page.waitForFunction(() =>
      document.querySelector(
        '.recording-dock [data-recording-state="recording"]',
      ),
    );
    await page.waitForTimeout(350);
  };
  const pause = async () => {
    await page.evaluate(() => window.host.app.ticket.local.handle.toggle());
    await page.waitForFunction(() =>
      document.querySelector('.recording-dock [data-recording-state="paused"]'),
    );
  };
  const close = async () => {
    await page.evaluate(() => {
      const h = window.host;
      h.closed = false;
      h.closeError = null;
      h.closing = h.app.close().then(
        () => (h.closed = true),
        (e) => (h.closeError = e.message),
      );
    });
  };
  const state = () =>
    page.evaluate(() => {
      const h = window.host;
      return {
        streams: h.streams,
        starts: h.starts,
        active: !!h.app.ticket,
        closed: h.closed,
        closeError: h.closeError,
        destroyed: h.destroyed || false,
        local: !!h.local,
        phase: document.querySelector(".recording-dock [data-recording-state]")
          ?.dataset.recordingState,
        calls: h.calls.map((c) => ({
          ...c,
          args: c.args?.data
            ? { ...c.args, data: undefined, dataLength: c.args.data.length }
            : c.args,
        })),
        submissions: h.submitted.map((r) => ({
          revision: r.revision,
          intent: r.intent,
          size: r.file.size,
          recordedAt: r.recordedAt,
        })),
        notes: h.backend.notes.map((n) => ({ id: n.id, document: n.document })),
        selection: h.app.editor?.state.selection.toJSON(),
        editable: h.app.editor?.isEditable,
        inert: document.querySelector(".app")?.hasAttribute("inert"),
        waits: h.waits,
        quitAcks: h.quitAcks || [],
      };
    });
  const savedCards = (s) =>
    s.notes[0].document.content.filter((n) => n.type === "attachment");
  const count = (s, c) => s.calls.filter((x) => x.command === c).length;
  const check = (name, result) => {
    assert(result, name);
    checks.push({ name, pass: true });
  };

  await open();
  await start();
  await page.evaluate(() => {
    const h = window.host;
    h.original.commands.insertContentAt(1, "A local ");
    h.ticket = h.app.ticket;
    h.handle = h.ticket.local.handle;
    h.app.open();
    h.app.select("note-b");
  });
  await page.waitForFunction(
    () => window.host.app.editor !== window.host.original,
  );
  await page.evaluate(() => {
    const h = window.host,
      e = h.app.editor;
    e.commands.insertContent(" B edit");
    e.commands.setTextSelection(3);
    h.focus = e.view.dom;
    e.view.focus();
    h.beforeSelection = JSON.stringify(e.state.selection.toJSON());
  });
  await pause();
  let s = await state();
  check(
    "actual App/Host/Editor/SaveQueue direct Panel first checkpoint commits original A while B remains editable",
    savedCards(s).length === 1 && s.editable && !s.inert && s.waits >= 3,
  );
  check(
    "first cumulative complete WAV and local-only registration, no child renderer IPC",
    s.submissions[0].size > 44 &&
      count(s, "register_recording_local") === 1 &&
      !s.calls.some((c) => /recording_window/.test(c.command)),
  );
  check(
    "checkpoint preserves B focus and selection",
    await page.evaluate(
      () =>
        document.activeElement === window.host.focus &&
        JSON.stringify(window.host.app.editor.state.selection.toJSON()) ===
          window.host.beforeSelection,
    ),
  );
  await page.evaluate(() => {
    const h = window.host;
    h.app.search("Original");
    h.osc.frequency.value = 880;
  });
  await page.waitForTimeout(100);
  check(
    "search and parked original Host keep the exact local ticket and capture handle",
    await page.evaluate(
      () =>
        window.host.ticket === window.host.app.ticket &&
        window.host.handle === window.host.app.ticket.local.handle,
    ),
  );
  await page.evaluate(() => window.host.app.ticket.local.handle.toggle());
  await page.waitForTimeout(400);
  await pause();
  s = await state();
  check(
    "resume reuses one stream, cumulative WAV grows and exactly one acknowledged A card is replaced",
    s.streams === 1 &&
      s.starts === 2 &&
      s.submissions[1].size > s.submissions[0].size &&
      savedCards(s).length === 1 &&
      s.submissions[1].recordedAt === s.submissions[0].recordedAt,
  );
  await page.evaluate(() => {
    const h = window.host;
    h.app.editor.view.focus();
    h.beforePhase = document.querySelector(
      ".recording-dock [data-recording-state]",
    ).dataset.recordingState;
  });
  await page.keyboard.press("Escape");
  check(
    "body/editor Escape is not intercepted by recording",
    await page.evaluate(
      () =>
        !!window.host.app.ticket &&
        document.querySelector(".recording-dock [data-recording-state]").dataset
          .recordingState === window.host.beforePhase,
    ),
  );
  const wave = await page.evaluate(async () => {
    const h = window.host,
      context = new AudioContext({ sampleRate: 24000 });
    try {
      const first = await context.decodeAudioData(
        await h.submitted[0].file.arrayBuffer(),
      );
      const secondBytes = await h.submitted[1].file.arrayBuffer();
      const second = await context.decodeAudioData(secondBytes.slice(0)),
        pcm = second.getChannelData(0),
        header = new DataView(secondBytes);
      const frequency = (start, end) => {
        let crossings = 0;
        for (let i = start + 1; i < end; i++)
          if (pcm[i - 1] <= 0 && pcm[i] > 0) crossings++;
        return (crossings * 24000) / (end - start);
      };
      return {
        firstFrames: first.length,
        frames: second.length,
        f1: frequency(
          Math.floor(first.length * 0.2),
          Math.floor(first.length * 0.8),
        ),
        f2: frequency(
          first.length + Math.floor((second.length - first.length) * 0.2),
          first.length + Math.floor((second.length - first.length) * 0.8),
        ),
        rate: header.getUint32(24, true),
        channels: header.getUint16(22, true),
        bits: header.getUint16(34, true),
        data: header.getUint32(40, true),
        size: secondBytes.byteLength,
      };
    } finally {
      await context.close();
    }
  });
  check(
    "actual direct App WAV decodes cumulative 440/880 Hz segments with complete mono 24 kHz/16 bit header",
    wave.frames > wave.firstFrames &&
      Math.abs(wave.f1 - 440) < 12 &&
      Math.abs(wave.f2 - 880) < 18 &&
      wave.rate === 24000 &&
      wave.channels === 1 &&
      wave.bits === 16 &&
      wave.data + 44 === wave.size,
  );
  observations.push({ wave });
  await page.locator(".recording-dock .recording-cancel").focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.host.app.ticket);
  s = await state();
  check(
    "sidebar-scoped Escape awaits final, releases native guard, and reveals only latest durable card",
    !s.active &&
      !s.local &&
      s.submissions.at(-1).intent === "final" &&
      savedCards(s).length === 1,
  );
  observations.push({ navigation: s });

  await open();
  await start();
  await page.evaluate(() => (window.host.holdStore = true));
  await page.evaluate(() => window.host.app.ticket.local.handle.toggle());
  await page.waitForFunction(() => !!window.host.releaseStore);
  check(
    "sidebar close stays actionable while checkpoint is busy",
    await page.locator(".recording-dock .recording-cancel").isEnabled(),
  );
  await page.locator(".recording-dock .recording-cancel").click();
  await page.evaluate(() => {
    const h = window.host,
      handle = h.app.ticket.local.handle;
    h.c1 = handle.close();
    h.c2 = handle.close();
    h.sameClose = h.c1 === h.c2;
    h.c1.then(
      () => (h.finished = true),
      (e) => (h.closeError = e.message),
    );
  });
  check(
    "busy/reentrant close shares actual promise and waits for in-flight checkpoint",
    await page.evaluate(
      () =>
        window.host.sameClose &&
        !window.host.finished &&
        !!window.host.app.ticket,
    ),
  );
  await page.evaluate(() => {
    window.host.holdStore = false;
    window.host.releaseStore();
  });
  await page.waitForFunction(() => window.host.finished);
  s = await state();
  check(
    "close queued during checkpoint persists checkpoint then exact final without second capture",
    s.submissions.map((r) => r.intent).join(",") === "checkpoint,final" &&
      s.streams === 1 &&
      savedCards(s).length === 1 &&
      !s.active,
  );
  observations.push({ busyClose: s });

  await open();
  await start();
  await pause();
  await page.evaluate(() => (window.host.cleanupFailures = 1));
  await close();
  await page.waitForFunction(() => !!window.host.closeError);
  s = await state();
  const beforeCleanup = count(s, "store_attachment_operation"),
    beforeRevision = s.submissions.length;
  check(
    "final persisted plus cleanup failure retains sidebar, native session, and error",
    s.active &&
      s.local &&
      s.phase === "retry" &&
      s.submissions.at(-1).intent === "final",
  );
  await close();
  await page.waitForFunction(() => window.host.closed);
  s = await state();
  check(
    "cleanup retry performs no second revision/store/insertion",
    s.submissions.length === beforeRevision &&
      count(s, "store_attachment_operation") === beforeCleanup &&
      !s.active &&
      savedCards(s).length === 1,
  );
  observations.push({ cleanup: s });
  await open();
  await start();
  await pause();
  await page.evaluate(() => (window.host.cleanupLostResponse = true));
  await close();
  await page.waitForFunction(() => !!window.host.closeError);
  const lostCleanup = await state();
  check(
    "lost native release response retains UI after native terminal receipt",
    lostCleanup.active && !lostCleanup.local && lostCleanup.phase === "retry",
  );
  await close();
  await page.waitForFunction(() => window.host.closed);
  s = await state();
  check(
    "exact terminal receipt recovers lost cleanup response without resubmitting final revision",
    !s.active &&
      s.submissions.length === lostCleanup.submissions.length &&
      count(s, "store_attachment_operation") ===
        count(lostCleanup, "store_attachment_operation"),
  );
  observations.push({ lostCleanup, recovered: s });

  for (const mutation of ["remove", "undo", "duplicate"]) {
    await open();
    await start();
    await pause();
    await page.evaluate((mutation) => {
      const e = window.host.original;
      if (mutation === "undo") {
        if (!e.commands.undo()) throw Error("real editor Undo unavailable");
      } else {
        const doc = e.getJSON(),
          card = doc.content.find((n) => n.type === "attachment");
        doc.content = doc.content.filter((n) => n.type !== "attachment");
        if (mutation === "duplicate")
          doc.content.push(card, structuredClone(card));
        e.commands.setContent(doc);
      }
    }, mutation);
    await close();
    await page.waitForFunction(() => !!window.host.closeError);
    s = await state();
    check(
      "actual Editor " +
        mutation +
        " of previous acknowledged card refuses replacement and retains audio",
      s.active &&
        s.local &&
        s.phase === "retry" &&
        savedCards(s).length === (mutation === "duplicate" ? 2 : 0) &&
        !s.notes[1].document.content.some((n) => n.type === "attachment"),
    );
    observations.push({ mutation, state: s });
  }

  for (const failure of [
    "store",
    "save",
    "query",
    "decode",
    "revision",
    "revision-lost",
  ]) {
    await open();
    await start();
    await page.evaluate((f) => {
      const h = window.host;
      if (f === "store") h.storeFailures = 1;
      if (f === "save") h.saveFailures = 10;
      if (f === "query") h.queryFailures = 1;
      if (f === "decode") h.decodeFailures = 1;
      if (f === "revision") h.revisionFailure = true;
      if (f === "revision-lost") h.revisionLostResponse = true;
    }, failure);
    await close();
    await page.waitForFunction(() => !!window.host.closeError);
    const failed = await state();
    check(
      failure + " failure retains original sidebar/audio and rejects close",
      failed.active && failed.local && failed.phase === "retry",
    );
    await page.evaluate(() => (window.host.saveFailures = 0));
    await close();
    await page.waitForFunction(() => window.host.closed);
    const retried = await state();
    check(
      failure + " retry completes same revision/File identity and one A card",
      !retried.active &&
        savedCards(retried).length === 1 &&
        (await page.evaluate(() => {
          const r = window.host.submitted;
          return r.length < 2 || r[0].file === r[1].file;
        })),
    );
    observations.push({ failure, failed, retried });
  }

  for (const change of ["owner", "epoch", "external", "operation", "suspend"]) {
    await open();
    await start();
    await page.evaluate((change) => {
      const h = window.host;
      h.onWait = () => {
        if (change === "owner") h.app.owners.set(h.original, "note-b");
        if (change === "epoch") h.app.access.state.notes["note-a"].epoch++;
        if (change === "external") h.app.external.set("note-a", 1);
        if (change === "operation")
          h.app.access.state.operationId = "controlled-revocation";
        if (change === "suspend") h.app.suspend(["note-a"]);
      };
    }, change);
    await close();
    await page.waitForFunction(() => !!window.host.closeError);
    const failed = await state();
    check(
      "actual Host wait " +
        change +
        " rejects before store and preserves desktop audio",
      failed.active &&
        failed.local &&
        count(failed, "store_attachment_operation") === 0 &&
        failed.phase === "retry",
    );
    observations.push({ change, failed });
  }

  await open();
  await start();
  await page.evaluate(() => (window.host.holdStore = true));
  await page.evaluate(() => {
    const h = window.host;
    h.mainClose = h.close({
      preventDefault() {
        h.prevented = true;
      },
    });
  });
  await page.waitForFunction(() => !!window.host.releaseStore);
  s = await state();
  check(
    "main close synchronously seals body/native admission and awaits final instead of hiding",
    s.inert && !s.editable && !s.destroyed && s.active,
  );
  await page.evaluate(() => {
    window.host.holdStore = false;
    window.host.releaseStore();
  });
  await page.waitForFunction(() => window.host.destroyed);
  s = await state();
  check(
    "main close destroys only after real final/document/native ACK",
    !s.active && !s.local && s.submissions.at(-1).intent === "final",
  );
  observations.push({ mainClose: s });

  await open();
  await start();
  await page.evaluate(() => {
    const h = window.host;
    h.cleanupFailures = 1;
    h.mainClose = h.close({ preventDefault() {} });
  });
  await page.waitForFunction(() =>
    document.querySelector('.recording-dock [data-recording-state="retry"]'),
  );
  s = await state();
  check(
    "failed main close cancels destruction, restores legal editing, retains retry sidebar",
    !s.destroyed && s.active && s.editable && !s.inert,
  );
  observations.push({ mainCloseFailure: s });

  await open();
  await start();
  await page.evaluate(() => {
    const h = window.host;
    h.holdReady = true;
    h.quitWork = h.listeners.get("notes-recording-quit")({
      payload: { id: "quit-66" },
    });
  });
  await page.waitForFunction(() => window.host.sealed === "quit-66");
  s = await state();
  check(
    "Quit seals actual App before any final/store until all native document participants are ready",
    s.inert &&
      !s.editable &&
      s.submissions.length === 0 &&
      count(s, "store_attachment_operation") === 0,
  );
  await page.evaluate(() =>
    window.host.listeners.get("notes-recording-quit-cancelled")({
      payload: { id: "quit-66" },
    }),
  );
  await page.waitForFunction(
    () => !document.querySelector(".app").hasAttribute("inert"),
  );
  s = await state();
  check(
    "native timeout/cancellation restores legal editing, keeps active audio, and never sends successful stale Quit ACK",
    s.active && s.editable && !s.quitAcks.some((a) => a.success),
  );
  await page.evaluate(() =>
    window.host.listeners.get("notes-recording-quit-ready")({
      payload: { id: "quit-66" },
    }),
  );
  await page.waitForTimeout(50);
  s = await state();
  check(
    "late ready from expired Quit cannot finalize or re-exit",
    s.active &&
      s.submissions.length === 0 &&
      !s.quitAcks.some((a) => a.success),
  );
  observations.push({ quitCancel: s });
  await page.evaluate(() => {
    const h = window.host;
    h.holdReady = false;
    h.quitWork = h.listeners.get("notes-recording-quit")({
      payload: { id: "quit-67" },
    });
  });
  await page.waitForFunction(() =>
    window.host.quitAcks?.some((a) => a.id === "quit-67" && a.success),
  );
  s = await state();
  check(
    "fresh Quit requires final plus cleanup/document ACK before exact successful participant ACK",
    !s.active &&
      !s.local &&
      s.quitAcks.some((a) => a.id === "quit-67" && a.success),
  );
  observations.push({ quitSuccess: s });

  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify({ pass: true, checks, observations, errors }, null, 2),
  );
  console.log(JSON.stringify({ pass: true, checks }));
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        checks,
        observations,
        errors,
        snapshot: await page
          ?.evaluate(() => ({
            calls: window.host?.calls,
            text: document.body.innerText,
          }))
          .catch(() => null),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await vite.close();
}
