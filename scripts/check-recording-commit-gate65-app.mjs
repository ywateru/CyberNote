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
import { installControlledRecording } from "./recording-platform-fixture.mjs";
const output = resolve(
  process.argv[2] || "docs/verification/mac-recording-commit-gate65/author/app",
);
await mkdir(output, { recursive: true });
const baseline = execFileSync("git", ["show", "0633b0ec:src/App.tsx"], {
  encoding: "utf8",
});
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import App from'/src/App.tsx';import'/src/style.css';
const h=window.host={calls:[],loads:[],validations:[],submitted:[],gate:[],waits:0,errors:[],journal:new Map(),holdLoads:false,saveFailures:0};
const note=(id,text)=>({id,folderId:'default',title:text,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:text+'。'}]}]},createdAt:1,updatedAt:1,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:1});
h.backend={notes:[note('note-a','Original A'),note('note-b','Original B')],folders:[{id:'default',name:'备忘录',kind:'default',parentId:null,sortOrder:0,createdAt:1},{id:'trash',name:'最近删除',kind:'trash',parentId:null,sortOrder:9,createdAt:1}],attachments:[],settings:{selectedFolder:'default',selectedNote:'note-a'},access:{sessionId:'controlled-native-session',epoch:1,notes:{'note-a':{epoch:0,authorized:true},'note-b':{epoch:0,authorized:true}},suspended:[],operationId:null},metadata:{sessionId:'controlled-native-session',sequence:0}};
const snapshot=()=>structuredClone(h.backend);const tagged=value=>({...value,access:structuredClone(h.backend.access),metadata:structuredClone(h.backend.metadata)});
h.listeners=new Map();h.window={label:'main',listen:async(name,handler)=>{h.listeners.set(name,handler);return()=>h.listeners.delete(name)},onCloseRequested:async fn=>{h.close=fn;return()=>{}},onFocusChanged:async()=>()=>{},hide:async()=>{},show:async()=>{},setFocus:async()=>{},destroy:async()=>{h.destroyed=true},close:async()=>{},isFocused:async()=>true};
h.invoke=async(command,args)=>{h.calls.push({command,args});if(command==='register_recording_window')return{...args,owner:'main',child:'recording-'+args.sessionId};if(command==='recording_window_message')return;if(command==='load_workspace'){if(h.holdLoads)await new Promise(resolve=>h.loads.push({release:resolve}));return h.lastRead=snapshot()}if(command==='register_save_intent'||command==='acknowledge_access')return;if(command==='workspace_action'){const a=args.action;if(a.type==='settings'){Object.assign(h.backend.settings,a.settings);return tagged(snapshot())}if(a.type!=='saveNote')throw Error('unexpected action '+a.type);if(h.saveFailures>0){h.saveFailures--;throw Error('controlled document ACK failure')}if(h.holdSave)await new Promise(resolve=>h.releaseSave=resolve);const n=h.backend.notes.find(n=>n.id===a.id);n.document=structuredClone(a.document);n.revision++;h.backend.metadata.sequence++;return tagged(structuredClone(n))}if(command==='store_attachment_operation'){if(h.holdStore)await new Promise(resolve=>h.releaseStore=resolve);const attachment={id:'saved-'+args.operationId,noteId:args.noteId,kind:'audio',displayName:args.name,mime:args.mime,size:atob(args.data).length,relativePath:'controlled/audio.webm',recordedAt:args.recordedAt};const op={operationId:args.operationId,noteId:args.noteId,status:'stored',attachment};h.journal.set(op.operationId,op);h.backend.attachments.push(attachment);h.backend.metadata.sequence++;if(h.rejectStoreResponse){h.rejectStoreResponse=false;throw Error('controlled stored response lost')}return tagged(structuredClone(op))}if(command==='query_attachment_operation'||command==='cancel_attachment_operation'){const op=h.journal.get(args.operationId);if(command==='query_attachment_operation'&&op&&JSON.stringify(h.backend.notes.find(n=>n.id===op.noteId)?.document).includes(op.attachment.id))op.status='committed';if(command==='cancel_attachment_operation'&&op){op.status='aborted';h.backend.attachments=[]}return tagged(op?structuredClone(op):{operationId:args.operationId,noteId:args.noteId,status:'notPersisted'})}if(command==='read_attachment')return tagged({data:'c3ludGhldGlj',mime:'audio/webm;codecs=opus',name:'新录音.webm',recordedAt:h.backend.attachments[0]?.recordedAt});throw Error('unexpected IPC '+command)};
const root=createRoot(document.querySelector('#root'));h.unmount=()=>flushSync(()=>root.unmount());root.render(<App/>);`;
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
let oldSource = false;
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
          if (oldSource) code = baseline;
          code = code.replace(
            "    const { file } = result;",
            "    window.host.submitted.push({file:result.file,operation:ticket.batch.operationIds[0]});\n    const { file } = result;",
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
            `  window.host.app={get editor(){return pickerRuntime.current.editor},get ticket(){return recordingTicket.current},get scope(){return pickerRuntime.current.scope},get pending(){return pendingDocs.current},get gate(){return editorGate},get access(){return accessGate},get owners(){return nativeEditorOwners.current},get external(){return externalVersions.current},get sync(){return synchronization},open:()=>openRecording(),submit:r=>submitRecordingRevision(recordingTicket.current,r),check:()=>validateRecordingTarget(recordingTicket.current,false),seal:()=>sealRecording(recordingTicket.current),cancel:()=>cancelRecording(),select:id=>setNoteId(id),save:(id,doc)=>saveDoc(id,doc)};\n` +
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
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const open = async (old = false) => {
    oldSource = old;
    vite.moduleGraph.invalidateAll();
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
        e = h.app.editor;
      const end = e.state.doc.content.size - 1;
      e.commands.setTextSelection({ from: end - 1, to: end });
      h.initial = {
        editor: e,
        document: JSON.stringify(e.getJSON()),
        selection: e.state.doc.textBetween(
          e.state.selection.from,
          e.state.selection.to,
        ),
      };
      h.app.open();
      await h.app.ticket.opening;
      h.result = Object.freeze({
        file: new File([new Uint8Array(100)], "合成.wav", {
          type: "audio/wav",
        }),
        recordedAt: 1793743199123,
        revision: 1,
        intent: "checkpoint",
      });
    });
    assert.equal(
      await page.evaluate(() => window.host.initial.selection),
      "。",
    );
  };
  const start = async () => {
    await page.evaluate(() => {
      const h = window.host;
      h.holdLoads = true;
      h.completed = false;
      h.submission = h.app
        .submit(h.result)
        .then(
          () => (h.outcome = { saved: true }),
          (e) => (h.outcome = { saved: false, error: e.message }),
        )
        .finally(() => (h.completed = true));
    });
    await page.waitForFunction(() => window.host.loads.length === 1);
    await page.waitForFunction(() => !window.host.app.editor.isEditable);
  };
  const release = async () =>
    page.evaluate(() => {
      const h = window.host;
      h.holdLoads = false;
      h.loads.shift().release();
    });
  const state = () =>
    page.evaluate(() => {
      const h = window.host;
      return {
        outcome: h.outcome,
        validations: h.validations,
        waits: h.waits,
        gate: h.gate,
        stores: h.calls.filter(
          (c) => c.command === "store_attachment_operation",
        ).length,
        saves: h.calls.filter(
          (c) =>
            c.command === "workspace_action" &&
            c.args.action.type === "saveNote",
        ).length,
        queries: h.calls.filter(
          (c) => c.command === "query_attachment_operation",
        ).length,
        sameEditor: h.app.editor === h.initial.editor,
        document: h.backend.notes[0].document,
        active: !!h.app.ticket,
      };
    });
  await open(true);
  await start();
  await release();
  await page.waitForFunction(() => window.host.completed);
  const baselineState = await state();
  assert.equal(baselineState.outcome.saved, false);
  assert.match(baselineState.outcome.error, /原录音笔记、编辑器或授权已改变/);
  assert.equal(baselineState.stores, 0);
  assert(
    baselineState.validations.some(
      (v) =>
        !v.editable &&
        v.active &&
        v.sameEditor &&
        v.sameOwner &&
        v.sameVersion &&
        v.sameExternal &&
        v.sameDocument &&
        v.sameTrusted &&
        v.trusted &&
        v.session &&
        v.epoch &&
        v.noteEpoch &&
        !v.operation &&
        !v.suspended &&
        !v.destroyed,
    ),
  );
  checks.push({
    name: "exact Mac18 source reproduces first checkpoint gate rejection solely during unchanged active Host temporary editability",
    pass: true,
  });
  observations.push({ baseline: baselineState });
  if (!process.argv.includes("--baseline-only")) {
    await open();
    await start();
    await release();
    await page.waitForFunction(() => window.host.completed);
    const fixed = await state();
    assert(fixed.outcome.saved);
    assert(fixed.waits >= 3);
    assert(fixed.sameEditor);
    assert.equal(
      fixed.document.content.filter((n) => n.type === "attachment").length,
      1,
    );
    assert.equal(fixed.stores, 1);
    assert.equal(fixed.active, true);
    checks.push({
      name: "actual App/Host/Gate waits committed active editor then saves original punctuation selection without weakening target checks",
      pass: true,
    });
    observations.push({ candidate: fixed });
  }
  if (!process.argv.includes("--baseline-only")) {
    for (const change of [
      "owner",
      "epoch",
      "external",
      "operation",
      "suspend",
      "seal",
      "unmount",
    ]) {
      await open();
      await start();
      await page.evaluate((change) => {
        const h = window.host;
        h.onWait = () => {
          if (change === "owner") h.app.owners.set(h.app.editor, "note-b");
          if (change === "epoch") h.app.access.state.notes["note-a"].epoch++;
          if (change === "external") h.app.external.set("note-a", 1);
          if (change === "operation")
            h.app.access.state.operationId = "controlled-access-change";
          if (change === "suspend") h.app.access.state.suspended.push("note-a");
          if (change === "seal") h.app.seal();
          if (change === "unmount") h.unmount();
        };
      }, change);
      await release();
      await page.waitForFunction(() => window.host.completed);
      const changed = await state();
      assert.equal(changed.outcome.saved, false);
      assert.equal(changed.stores, 0);
      checks.push({
        name:
          "real Host commit wait retains rejection/cancellation for " + change,
        pass: true,
      });
      observations.push({ change, state: changed });
    }
  }
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
        snapshot: await page
          ?.evaluate(() => ({
            validations: window.host?.validations,
            calls: window.host?.calls,
            gate: window.host?.gate,
            text: document.body.innerText,
          }))
          .catch(() => null),
        errors,
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
