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
import { installControlledRecording } from "../../../scripts/recording-platform-fixture.mjs";
const output = resolve(
  process.argv[2] || "docs/verification/mobile-recording-save57/components",
);
await mkdir(output, { recursive: true });
const baseline = execFileSync(
  "git",
  ["show", "9167db94908ac635b026220e782878447c9e16a7:src/App.tsx"],
  { encoding: "utf8" },
);
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import App from'/src/App.tsx';import'/src/style.css';
const h=window.host={calls:[],loads:[],validations:[],submitted:[],gate:[],waits:0,errors:[],journal:new Map(),holdLoads:false,saveFailures:0};
const note=(id,text)=>({id,folderId:'default',title:text,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]},createdAt:1,updatedAt:1,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:1});
h.backend={notes:[note('note-a','Original A'),note('note-b','Original B')],folders:[{id:'default',name:'备忘录',kind:'default',parentId:null,sortOrder:0,createdAt:1},{id:'trash',name:'最近删除',kind:'trash',parentId:null,sortOrder:9,createdAt:1}],attachments:[],settings:{selectedFolder:'default',selectedNote:'note-a'},access:{sessionId:'controlled-native-session',epoch:1,notes:{'note-a':{epoch:0,authorized:true},'note-b':{epoch:0,authorized:true}},suspended:[],operationId:null},metadata:{sessionId:'controlled-native-session',sequence:0}};
const snapshot=()=>structuredClone(h.backend);const tagged=value=>({...value,access:structuredClone(h.backend.access),metadata:structuredClone(h.backend.metadata)});
h.listeners=new Map();h.window={label:'main',listen:async(name,handler)=>{h.listeners.set(name,handler);return()=>h.listeners.delete(name)},onCloseRequested:async fn=>{h.close=fn;return()=>{}},onFocusChanged:async()=>()=>{},hide:async()=>{},show:async()=>{},setFocus:async()=>{},destroy:async()=>{h.destroyed=true},close:async()=>{},isFocused:async()=>true};
h.invoke=async(command,args)=>{h.calls.push({command,args});if(command==='load_workspace'){if(h.holdLoads)await new Promise(resolve=>h.loads.push({release:resolve}));return h.lastRead=snapshot()}if(command==='register_save_intent'||command==='acknowledge_access')return;if(command==='workspace_action'){const a=args.action;if(a.type==='settings'){Object.assign(h.backend.settings,a.settings);return tagged(snapshot())}if(a.type!=='saveNote')throw Error('unexpected action '+a.type);if(h.saveFailures>0){h.saveFailures--;throw Error('controlled document ACK failure')}if(h.holdSave)await new Promise(resolve=>h.releaseSave=resolve);const n=h.backend.notes.find(n=>n.id===a.id);n.document=structuredClone(a.document);n.revision++;h.backend.metadata.sequence++;for(const op of h.journal.values())if(JSON.stringify(n.document).includes(op.attachment.id))op.status='committed';return tagged(structuredClone(n))}if(command==='store_attachment_operation'){if(h.holdStore)await new Promise(resolve=>h.releaseStore=resolve);const attachment={id:'saved-audio',noteId:args.noteId,kind:'audio',displayName:args.name,mime:args.mime,size:12,relativePath:'controlled/audio.webm',recordedAt:args.recordedAt};const op={operationId:args.operationId,noteId:args.noteId,status:'stored',attachment};h.journal.set(op.operationId,op);h.backend.attachments.push(attachment);h.backend.metadata.sequence++;if(h.rejectStoreResponse){h.rejectStoreResponse=false;throw Error('controlled stored response lost')}return tagged(structuredClone(op))}if(command==='query_attachment_operation'||command==='cancel_attachment_operation'){const op=h.journal.get(args.operationId);if(command==='cancel_attachment_operation'&&op){op.status='aborted';h.backend.attachments=[]}return tagged(op?structuredClone(op):{operationId:args.operationId,noteId:args.noteId,status:'notPersisted'})}if(command==='read_attachment')return tagged({data:'c3ludGhldGlj',mime:'audio/webm;codecs=opus',name:'新录音.webm',recordedAt:h.backend.attachments[0]?.recordedAt});throw Error('unexpected IPC '+command)};
const root=createRoot(document.querySelector('#root'));h.unmount=()=>flushSync(()=>root.unmount());root.render(<App/>);`;
const modules = {
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
          code = code.replace(
            marker,
            `  window.host.app={get editor(){return pickerRuntime.current.editor},get ticket(){return recordingTicket.current},get scope(){return pickerRuntime.current.scope},get pending(){return pendingDocs.current},get gate(){return editorGate},get access(){return accessGate},get owners(){return nativeEditorOwners.current},get sync(){return synchronization},seal:()=>sealRecording(recordingTicket.current),cancel:()=>cancelRecording(),select:id=>setNoteId(id),save:(id,doc)=>saveDoc(id,doc)};\n` +
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
let browser, page;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const open = async (old = false) => {
    oldSource = old;
    vite.moduleGraph.invalidateAll();
    await page?.close();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
    });
    await context.addInitScript(installControlledRecording);
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (
        url.startsWith(origin) ||
        url.startsWith("data:") ||
        url.startsWith("blob:")
      )
        return route.continue();
      errors.push("external " + url);
      return route.abort();
    });
    await page.goto(origin + "/__check");
    await page.locator(".folder-row").filter({ hasText: "全部备忘录" }).click();
    await page.locator(".note-row").filter({ hasText: "Original A" }).click();
    await page.locator(".tiptap:visible").waitFor();
    await page.getByRole("button", { name: "添加附件", exact: true }).click();
    await page.getByRole("button", { name: "录音", exact: true }).click();
    await page.locator(".recording-primary").waitFor();
    await page.locator(".recording-primary").click();
    await page.waitForFunction(() => window.platform.starts === 1);
    await page.evaluate(() => window.platform.advance(6000));
    await page.locator(".recording-primary").click();
    await page.getByRole("button", { name: "继续录音", exact: true }).waitFor();
    await page.evaluate(() => {
      const r = window.platform.recorders[0];
      r.ondataavailable({
        data: new Blob(["controlled prefix"], { type: r.mimeType }),
      });
    });
    return context;
  };
  const done = async () => {
    await page.evaluate(() => {
      window.host.holdLoads = true;
      window.host.startFile = window.host.app.ticket.file;
    });
    await page.locator(".recording-done").click();
    await page.evaluate(() => {
      const r = window.platform.recorders[0];
      r.ondataavailable({
        data: new Blob(["controlled encoded boundary"], { type: r.mimeType }),
      });
      r.onstop();
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
  const retry = async () => {
    await page
      .getByRole("button", { name: "重试保存录音", exact: true })
      .click();
  };
  const state = () =>
    page.evaluate(() => {
      const h = window.host;
      return {
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
        document: h.backend.notes[0].document,
        ticket: !!h.app?.ticket,
        panel: !!document.querySelector(".recording-sheet"),
        sameFile: h.submitted.every(
          (s) =>
            s.file === h.submitted[0].file &&
            s.operation === h.submitted[0].operation,
        ),
        submitted: h.submitted.length,
        text: document.body.innerText,
      };
    });
  const test = async (name, run) => {
    if (
      process.env.SAVE57_CHECK_FILTER &&
      !new RegExp(process.env.SAVE57_CHECK_FILTER).test(name)
    )
      return;
    console.log("RUN " + name);
    await run();
    checks.push(name);
  };
  await test("same actual mounted App scenario rejects unchanged target on baseline at temporary isEditable=false", async () => {
    const context = await open(true);
    await done();
    await release();
    await page
      .locator(".recording-notice")
      .filter({ hasText: "原附件目标" })
      .waitFor();
    const o = await state();
    assert.equal(o.stores, 0);
    assert.equal(o.validations[0].available, false);
    assert.equal(o.validations[0].editable, false);
    assert.equal(o.panel, true);
    for (const key of [
      "current",
      "sameEditor",
      "sameScope",
      "sameOwner",
      "sameVersion",
      "sameExternal",
      "sameDocument",
      "sameTrusted",
    ])
      assert.equal(o.validations[0][key], true, key);
    observations.push({ baseline: o });
    await context.close();
  });
  await test("unchanged mobile recording waits for actual Host/Gate commit before both store boundaries and closes only after document ACK", async () => {
    const context = await open();
    await page.evaluate(() => (window.host.holdSave = true));
    await done();
    await release();
    await page.waitForFunction(() => !!window.host.releaseSave);
    let o = await state();
    assert.equal(o.stores, 1);
    assert.equal(o.saves, 1);
    assert.equal(o.waits, 2);
    assert(o.validations.every((v) => v.available && v.editable));
    assert.equal(o.ticket, true);
    assert.equal(o.panel, true);
    await page.evaluate(() => window.host.releaseSave());
    await page.waitForFunction(() => !window.host.app.ticket);
    o = await state();
    assert.equal(o.panel, false);
    assert.equal(o.stores, 1);
    assert.equal(o.saves, 1);
    assert.equal(JSON.stringify(o.document).split("saved-audio").length - 1, 1);
    observations.push({ fixed: o });
    await context.close();
  });
  for (const change of [
    "scope",
    "owner",
    "editor-document",
    "trusted-raw",
    "global-epoch",
    "note-epoch",
    "unauthorized",
    "destroy",
    "sync-invalidated",
  ])
    await test(
      "commit wait preserves strict rejection for " + change,
      async () => {
        const context = await open();
        await done();
        await page.evaluate((change) => {
          window.host.onWait = () => {
            const h = window.host,
              a = h.app,
              t = a.ticket.batch.target;
            if (change === "scope") a.select("note-b");
            if (change === "owner") a.owners.set(a.editor, "note-b");
            if (change === "editor-document")
              a.editor.commands.insertContent(" changed");
            if (change === "trusted-raw")
              h.lastRead.notes[0].document.attrs = { unexpected: true };
            if (change === "global-epoch") a.access.state.epoch++;
            if (change === "note-epoch") a.access.state.notes["note-a"].epoch++;
            if (change === "unauthorized")
              a.access.state.notes["note-a"].authorized = false;
            if (change === "destroy") a.editor.destroy();
            if (change === "sync-invalidated") a.sync.invalidate();
          };
        }, change);
        await release();
        await page.waitForFunction(
          () =>
            !window.host.app.ticket?.accepting ||
            document.querySelector(".recording-notice[role=alert]")
              ?.textContent,
        );
        const o = await state();
        assert.equal(o.stores, 0);
        assert.equal(o.saves, change === "editor-document" ? 1 : 0);
        assert.equal(JSON.stringify(o.document).includes("saved-audio"), false);
        if (
          !["scope", "note-epoch", "unauthorized", "destroy"].includes(change)
        )
          assert.equal(o.ticket, true);
        observations.push({ change, validation: o.validations.at(-1) });
        await context.close();
      },
    );
  await test("stored response loss revalidates through actual commit before same-operation authoritative query recovery", async () => {
    const context = await open();
    await page.evaluate(() => (window.host.rejectStoreResponse = true));
    await done();
    await release();
    await page.waitForFunction(() => !window.host.app.ticket);
    const o = await state();
    assert.equal(o.stores, 1);
    assert.equal(o.queries, 1);
    assert.equal(o.saves, 1);
    assert.equal(o.waits, 3);
    assert(o.validations.every((v) => v.available && v.editable && v.current));
    assert.equal(JSON.stringify(o.document).split("saved-audio").length - 1, 1);
    await context.close();
  });
  await test("stored attachment remains same operation and File after second-boundary rejection and retry", async () => {
    const context = await open();
    await page.evaluate(() => {
      window.host.holdStore = true;
    });
    await done();
    await release();
    await page.waitForFunction(() => !!window.host.releaseStore);
    await page.evaluate(() => {
      const h = window.host;
      h.savedFile = h.app.ticket.file;
      h.savedOperation = h.app.ticket.batch.operationIds[0];
      h.holdLoads = true;
      h.releaseStore();
    });
    await page.waitForFunction(() => window.host.loads.length === 1);
    await page.evaluate(() => {
      window.host.onWait = () =>
        window.host.app.owners.set(window.host.app.editor, "note-b");
    });
    await release();
    await page
      .locator(".recording-notice")
      .filter({ hasText: "原附件目标" })
      .waitFor();
    let o = await state();
    assert.equal(o.stores, 1);
    assert.equal(o.saves, 0);
    await page.evaluate(() =>
      window.host.app.owners.set(window.host.app.editor, "note-a"),
    );
    await retry();
    await page.waitForFunction(() => !window.host.app.ticket);
    o = await state();
    assert.equal(o.stores, 1);
    assert.equal(o.saves, 1);
    assert.equal(o.sameFile, true);
    assert.equal(o.submitted, 2);
    assert.equal(
      await page.evaluate(() =>
        window.host.journal.has(window.host.savedOperation),
      ),
      true,
    );
    await context.close();
  });
  await test("document ACK failure retains File and operation; retry confirms existing node without another store or insert", async () => {
    const context = await open();
    await page.evaluate(() => (window.host.saveFailures = 2));
    await done();
    await release();
    await page.waitForFunction(() =>
      document
        .querySelector(".recording-notice")
        ?.textContent.includes("ACK failure"),
    );
    const before = await page.evaluate(() => {
      const t = window.host.app.ticket;
      window.host.savedFile = t.file;
      window.host.savedOperation = t.batch.operationIds[0];
      return { json: t.batch.target.editor.getJSON(), file: !!t.file };
    });
    assert(before.file);
    await retry();
    await page.waitForFunction(() => !window.host.app.ticket);
    const o = await state();
    assert.equal(o.stores, 1);
    assert.equal(o.saves, 3);
    assert.equal(o.sameFile, true);
    assert.equal(o.submitted, 2);
    assert.equal(JSON.stringify(o.document).split("saved-audio").length - 1, 1);
    assert.equal(
      await page.evaluate(() =>
        window.host.journal.has(window.host.savedOperation),
      ),
      true,
    );
    await context.close();
  });
  await test("cancel during stored second-boundary commit wait aborts running submit and completes legitimate sealed cancellation", async () => {
    const context = await open();
    await page.evaluate(() => (window.host.holdStore = true));
    await done();
    await release();
    await page.waitForFunction(() => !!window.host.releaseStore);
    await page.evaluate(() => {
      const h = window.host;
      h.holdLoads = true;
      h.releaseStore();
    });
    await page.waitForFunction(() => window.host.loads.length === 1);
    await page.evaluate(
      () =>
        (window.host.onWait = () => {
          window.host.app.cancel().then(
            () => (window.host.cancelled = true),
            (e) => (window.host.cancelled = String(e)),
          );
        }),
    );
    await release();
    await page.waitForFunction(() => window.host.cancelled !== undefined);
    assert.equal(await page.evaluate(() => window.host.cancelled), true);
    const o = await state();
    assert.equal(o.stores, 1);
    assert.equal(o.saves, 0);
    assert.equal(o.ticket, false);
    assert.equal(
      await page.evaluate(
        () =>
          window.host.calls.filter(
            (c) => c.command === "cancel_attachment_operation",
          ).length,
      ),
      1,
    );
    await context.close();
  });
  for (const action of ["seal", "unmount"])
    await test(
      action + " during actual commit wait settles without storage or hanging",
      async () => {
        const context = await open();
        await done();
        await page.evaluate((action) => {
          window.host.onWait = () => {
            if (action === "seal") window.host.app.seal();
            else window.host.unmount();
          };
        }, action);
        await release();
        if (action === "seal")
          await page.waitForFunction(() =>
            document
              .querySelector(".recording-notice")
              ?.textContent.includes("已关闭"),
          );
        else await page.waitForFunction(() => !document.querySelector(".app"));
        assert.equal(
          await page.evaluate(
            () =>
              window.host.calls.filter(
                (c) => c.command === "store_attachment_operation",
              ).length,
          ),
          0,
        );
        await context.close();
      },
    );
  await test("independent genuine readonly Host commit settles then rejects without restoring editability or storage", async () => {
    const context = await open();
    await done();
    await page.evaluate(() => {
      window.host.onWait = () => {
        const a = window.host.app;
        a.gate.restore(a.editor, false, true);
      };
    });
    await release();
    await page.locator(".recording-notice").filter({hasText:"原附件目标"}).waitFor();
    const o = await state();
    assert.equal(o.waits, 1);
    assert.equal(o.stores, 0);
    assert.equal(o.saves, 0);
    assert.equal(o.ticket, true);
    assert.equal(o.panel, true);
    assert.equal(o.validations.length, 1);
    assert.equal(o.validations[0].current, true);
    assert.equal(o.validations[0].sameEditor, true);
    assert.equal(o.validations[0].sameScope, true);
    assert.equal(o.validations[0].sameOwner, true);
    assert.equal(o.validations[0].sameDocument, true);
    assert.equal(o.validations[0].sameTrusted, true);
    assert.equal(o.validations[0].available, false);
    assert.equal(o.validations[0].editable, false);
    assert.equal(await page.evaluate(()=>window.host.app.editor.isEditable), false);
    assert.equal(JSON.stringify(o.document).includes("saved-audio"), false);
    observations.push({independentReadonly:o});
    await context.close();
  });
  assert.deepEqual(errors, []);
  const result = {
    status: "pass",
    filter: process.env.SAVE57_CHECK_FILTER ?? null,
    checks,
    errors,
    observations,
    limits: [
      "Actual React App/Host/Gate/NoteEditor/Panel and production bridge/authority/attachment/SaveQueue; native IPC and hardware controlled.",
      "Baseline App uses exact git 9167db9; test transforms only observe checks/gate and inject one-shot actions at real wait admission. No product algorithm replaced.",
      "No native GUI, device, database, local audio file, valid encoded audio or pixel/playability claim.",
    ],
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify({ status: result.status, checks }));
} catch (error) {
  if (page && !page.isClosed())
    await writeFile(
      resolve(output, "failure-observation.json"),
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.body.innerText,
          validations: window.host?.validations,
          calls: window.host?.calls,
          waits: window.host?.waits,
        })),
        null,
        2,
      ) + "\n",
    );
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        checks,
        errors,
        observations,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await vite.close();
}
