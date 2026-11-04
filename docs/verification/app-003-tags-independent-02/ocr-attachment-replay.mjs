// Independent review02 targeted replay. Fixture scaffold from frozen scripts/check-tags-save-boundary.mjs; only OCR/attachment section retained; real Store refusal/retry/ACK added. Product source untouched.
// Production App/Editor with only browser-preview transport pointed at the
// exact existing production Store executable. No build, packages or native IPC.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, stat, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import ts from "typescript";
const disk = await statfs(process.cwd());
if (disk.bavail * disk.bsize < 2 * 1024 ** 3)
  throw Error("Less than 2 GiB free; browser check did not start.");
const root = process.cwd(),
  output = resolve(process.argv[2] || "artifacts/tags-repair/run01");
await mkdir(output, { recursive: true });
const binary = process.env.NOTES_TAG_STORE_BINARY;
if (!binary)
  throw Error(
    "Set NOTES_TAG_STORE_BINARY to the reviewed existing binary; do not compile.",
  );
const binaryHash = createHash("sha256")
  .update(await readFile(binary))
  .digest("hex");
assert.equal(
  binaryHash,
  "f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf",
);
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const storeRoot = resolve(output, "store"),
  records = [],
  results = [];
function storeAction(action) {
  const p = spawnSync(binary, [storeRoot], {
    input: JSON.stringify(action),
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(p.status, 0, p.stderr);
  const response = JSON.parse(p.stdout);
  records.push({ action, response });
  return response;
}
const must = (action) => {
  const result = storeAction(action);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const tag = (name) => ({ type: "noteTag", attrs: { name } });
const original = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "#UI", marks: [tag("UI对照")] },
        {
          type: "text",
          text: "对照",
          marks: [{ type: "bold" }, tag("UI对照")],
        },
        { type: "text", text: " " },
        { type: "text", text: "#Keep", marks: [tag("Keep")] },
        { type: "text", text: " " },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "after", marks: [{ type: "italic" }] }],
    },
  ],
};
const created = must({ type: "createNote" });
must({ type: "saveNote", id: created.id, revision: 0, document: original });
const seed = () => {
  const ws = must({ type: "__workspace" });
  ws.settings = {
    ...ws.settings,
    selectedFolder: "default",
    selectedNote: created.id,
  };
  return ws;
};
const appSource = await readFile("src/App.tsx", "utf8"),
  tree = ts.createSourceFile(
    "src/App.tsx",
    appSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
let ocrInsert, attachmentInsert, validatePickerTarget;
function property(object, name) {
  return object.properties
    .find((p) => p.name?.getText(tree) === name)
    ?.initializer?.getText(tree);
}
function visit(node) {
  if (ts.isNewExpression(node) && node.expression.getText(tree) === "OcrHost")
    ocrInsert = property(node.arguments[2], "insert");
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(tree) === "operation.run" &&
    ts.isObjectLiteralExpression(node.arguments[0])
  )
    attachmentInsert = property(node.arguments[0], "insert");
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(tree) === "validatePickerTarget"
  )
    validatePickerTarget = node.initializer.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(ocrInsert && attachmentInsert && validatePickerTarget);
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
const localModule = compile(`
export const bindOcrInsert=env=>{const{target,ocrParagraphs,Slice,Fragment,documentsEqual,editorSaveSnapshot,nativeDocumentVersions}=env;return (${ocrInsert});};
export const bindAttachmentInsert=env=>{const{target,documentReferencesAttachment,nativeDocumentVersions,editorSaveSnapshot}=env;return (${attachmentInsert});};
export const bindValidate=env=>{const{ocrOperation,flush,synchronizeRef,pickerRuntime,wsRef,accessGate,nativeEditorOwners,nativeDocumentVersions,externalVersions,synchronization,blockedNotes,pendingDocs,documentsEqual,editorSaveSnapshot,rebindAttachmentTarget}=env;return (${validatePickerTarget});};
`);
const entry = `
import React from'react';import{createRoot}from'react-dom/client';import App from'/src/App.tsx';import NoteEditor from'/src/Editor.tsx';import{documentTags}from'/src/note-tags.ts';import{editorSaveSnapshot}from'/src/editor-save-snapshot.ts';import{documentText}from'/src/types.ts';import{documentsEqual}from'/src/document-equality.ts';import{rebindAttachmentTarget}from'/src/attachment-target.ts';import{documentReferencesAttachment}from'/src/attachment-submission.ts';import{OcrHost}from'/src/ocr-host.ts';import{Slice,Fragment}from'@tiptap/pm/model';import{bindOcrInsert,bindAttachmentInsert,bindValidate}from'/__local-boundaries.js';import'/src/style.css';
const root=createRoot(document.getElementById('root'));window.api={documentTags,editorSaveSnapshot,documentText,documentsEqual,rebindAttachmentTarget,documentReferencesAttachment,OcrHost,Slice,Fragment,bindOcrInsert,bindAttachmentInsert,bindValidate};window.mountApp=()=>root.render(React.createElement(App));window.unmount=()=>root.render(null);window.localChanges=[];window.mountEditor=note=>{window.localNote=note;root.render(React.createElement(NoteEditor,{note,key:note.id,onChange:(id,doc)=>window.localChanges.push({id,doc}),onReady:e=>window.localEditor=e,onFocus:()=>{}}));};`;
const injection = `  if (!native) { if (a.type === 'createNote' && (window as any).__failCreate) throw Error('controlled-create-failure'); const result = await fetch('/__store-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a)}).then(r=>r.json()); ((window as any).__storeResults ||= []).push({action:a,result}); if(!result.ok)throw result.error; const latest=await fetch('/__store-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'__workspace'})}).then(r=>r.json()); if(!latest.ok)throw latest.error; preview=latest.value; persist(); return result.value as T; }\n`;
let injected = false;
const vite = await createViteServer({
  root,
  configFile: false,
  cacheDir: resolve("artifacts/tags-independent-vite-cache"),
  plugins: [
    {
      name: "real-store-transport-and-extracted-local-boundaries",
      enforce: "pre",
      resolveId(id) {
        if (["/__repair.tsx", "/__local-boundaries.js"].includes(id)) return id;
      },
      load(id) {
        if (id === "/__repair.tsx") return entry;
        if (id === "/__local-boundaries.js") return localModule;
      },
      transform(code, id) {
        if (id === resolve("src/bridge.ts")) {
          const needle = "): Promise<T> {\n  if (native) {";
          assert.equal(code.split(needle).length, 2);
          injected = true;
          return {
            code: code.replace(
              needle,
              "): Promise<T> {\n" + injection + "  if (native) {",
            ),
            map: null,
          };
        }
      },
    },
    react(),
  ],
  server: { middlewareMode: true, hmr: { host: "127.0.0.1", port: 0 } },
  appType: "custom",
});
const server = createServer(async (req, res) => {
  if (req.url === "/__store-action") {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(storeAction(JSON.parse(body))));
  } else if (req.url === "/__check") {
    res.setHeader("content-type", "text/html");
    res.end(
      await vite.transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__repair.tsx"></script>',
      ),
    );
  } else vite.middlewares(req, res);
});
let browser, page;
const errors = [];
try {
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--disk-cache-size=1048576", "--media-cache-size=1048576"],
  });
  const newPage = async (mobile = false) => {
    const p = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.route("**/*", (r) =>
      r.request().url().startsWith(origin) ||
      r.request().url().startsWith("data:")
        ? r.continue()
        : r.abort(),
    );
    await p.goto(origin + "/__check");
    await p.waitForFunction(() => window.mountApp);
    await p.evaluate(
      (ws) => localStorage.setItem("notes-browser-preview", JSON.stringify(ws)),
      seed(),
    );
    await p.reload();
    await p.waitForFunction(() => window.mountApp);
    await p.evaluate(() => window.mountApp());
    await p.waitForFunction(() => !!document.querySelector(".tiptap")?.editor);
    return p;
  };
  const stored = () =>
    must({ type: "__workspace" }).notes.find((n) => n.id === created.id);
  const settle = async (p = page) =>
    p.waitForFunction(() => !document.querySelector(".save-status"));
  // Real Editor with exact App OCR/attachment callbacks extracted from source.
  page = await browser.newPage();
  await page.goto(origin + "/__check");
  await page.waitForFunction(() => window.api);
  const localNote = { ...created, document: original, locked: false };
  await page.evaluate((n) => window.mountEditor(n), localNote);
  await page.waitForFunction(() => !!window.localEditor);
  const local = await page.evaluate(async () => {
    const api = window.api,
      e = window.localEditor,
      versions = new WeakMap();
    versions.set(e, 0);
    e.on("transaction", () => versions.set(e, (versions.get(e) || 0) + 1));
    e.commands.setTextSelection(3);
    const stamp = {
      sessionId: "local",
      epoch: 1,
      noteEpoch: 1,
      noteId: window.localNote.id,
    };
    stamp.noteId = window.localNote.id;
    const target = {
      noteId: window.localNote.id,
      scope: "scope",
      stamp,
      editor: e,
      owner: window.localNote.id,
      bookmark: e.state.selection.getBookmark(),
      documentVersion: versions.get(e),
      externalVersion: 0,
      document: e.getJSON(),
      trustedDocument: e.getJSON(),
      invalidated: false,
    };
    const originalTrusted = structuredClone(target.trustedDocument);
    const paragraphs = (text) =>
      text.split(/\r?\n/).map((text) => ({
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      }));
    const insert = api.bindOcrInsert({
      target,
      ocrParagraphs: paragraphs,
      Slice: api.Slice,
      Fragment: api.Fragment,
      documentsEqual: api.documentsEqual,
      editorSaveSnapshot: api.editorSaveSnapshot,
      nativeDocumentVersions: { current: versions },
    });
    e.view.dom.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "OCR" }),
    );
    let inserted;
    insert("OCR保全", (d) => (inserted = d));
    if (!inserted)
      throw Error(
        "Actual App OCR callback did not accept its local persisted body",
      );
    const raw = e.getJSON();
    if (!api.documentsEqual(target.document, raw))
      throw Error("OCR raw target identity changed");
    if (!api.documentsEqual(inserted, window.localChanges.at(-1).doc))
      throw Error(
        "OCR local insertedDocument differs from production onUpdate save body",
      );
    if (!api.documentsEqual(target.trustedDocument, originalTrusted))
      throw Error("OCR replaced original trusted backend identity before ACK");
    const operation = {
      target,
      insertedDocument: inserted,
      documentAck: false,
      accepting: true,
      detached: false,
    };
    const env = {
      ocrOperation: { current: operation },
      flush: async () => {
        throw Error(
          "Own exact pending OCR body must use its existing retry path",
        );
      },
      synchronizeRef: {
        current: async () => ({
          success: true,
          snapshot: {
            notes: [{ id: target.noteId, document: originalTrusted }],
          },
        }),
      },
      pickerRuntime: {
        current: {
          noteId: target.noteId,
          scope: target.scope,
          editor: e,
          ocrAvailable: true,
          available: true,
        },
      },
      wsRef: {
        current: {
          notes: [{ id: target.noteId, deletedAt: null, locked: false }],
        },
      },
      accessGate: {
        stamp: () => stamp,
        state: { operationId: null, suspended: [] },
      },
      nativeEditorOwners: { current: new WeakMap([[e, target.noteId]]) },
      nativeDocumentVersions: { current: versions },
      externalVersions: { current: new Map() },
      synchronization: { current: () => true },
      blockedNotes: { current: new Set() },
      pendingDocs: { current: new Map([[target.noteId, inserted]]) },
      documentsEqual: api.documentsEqual,
      editorSaveSnapshot: api.editorSaveSnapshot,
      rebindAttachmentTarget: api.rebindAttachmentTarget,
    };
    await api.bindValidate(env)(target, undefined, true, operation);
    const snapshot = {
      noteId: target.noteId,
      scope: target.scope,
      stamp,
      editor: e,
      owner: target.owner,
      documentVersion: target.documentVersion,
      externalVersion: 0,
      editorDocument: raw,
      trustedDocument: originalTrusted,
      trustedSynchronization: true,
      available: true,
    };
    api.rebindAttachmentTarget(target, snapshot);
    let rawRejected = false;
    try {
      api.rebindAttachmentTarget(target, {
        ...snapshot,
        editorDocument: inserted,
      });
    } catch {
      rawRejected = true;
    }
    if (api.documentsEqual(raw, inserted))
      throw Error(
        "OCR fixture must preserve an illegal raw tag during composition",
      );
    if (!rawRejected)
      throw Error("Persistent normalization weakened raw target identity");
    let ackAttempts=0, firstStoreRefusal;
    const host = new api.OcrHost("local-ocr", target, {
      native: { acknowledge: async () => ({}) },
      validate: async () => {},
      insert: () => {
        throw Error("Retry must not insert twice");
      },
      awaitDocumentAck: async (op) => {
        ackAttempts++;
        const reply=await fetch('/__store-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'saveNote',id:target.noteId,revision:ackAttempts===1?0:1,document:op.insertedDocument})}).then(r=>r.json());
        if(!reply.ok){firstStoreRefusal=reply;throw Object.assign(new Error(reply.error.message),{code:reply.error.code});}
        op.acknowledgeDocument(target.noteId,reply.value.document);
      },
      update: () => {},
    });
    host.insertedDocument = inserted;
    host.sessionId = "synthetic-local-session";
    let refused=false;
    try { await host.confirm(); } catch(error) { refused=error.code==='conflict'; }
    if(!refused||host.documentAck||host.cleaned) throw Error('Expected real Store conflict and retained retry state');
    // The first promise must leave the confirming slot before retry.
    await Promise.resolve();
    await host.confirm();
    if(ackAttempts!==2) throw Error('OCR retry did not use exactly one preserved inserted body');
    if (!host.documentAck || !host.cleaned)
      throw Error("Persisted OCR ACK did not settle");
    // A separate block attachment transaction on the same trusted live editor.
    target.bookmark = e.state.selection.getBookmark();
    const attachment = {
      id: "local-attachment",
      noteId: target.noteId,
      kind: "file",
      displayName: "synthetic.txt",
    };
    api.bindAttachmentInsert({
      target,
      documentReferencesAttachment: api.documentReferencesAttachment,
      nativeDocumentVersions: { current: versions },
      editorSaveSnapshot: api.editorSaveSnapshot,
    })(attachment);
    if (!api.documentsEqual(target.document, e.getJSON()))
      throw Error("Attachment lost raw identity");
    if (
      !api.documentsEqual(
        target.trustedDocument,
        window.localChanges.at(-1).doc,
      )
    )
      throw Error(
        "Attachment trusted body differs from production save representation",
      );
    if (!api.documentReferencesAttachment(target.trustedDocument, attachment))
      throw Error("Snapshot lost attachment reference");
    return {
      ocr: {
        raw,
        inserted,
        rawDiffers: !api.documentsEqual(raw, inserted),
        rawIdentityRejectsPersistentSubstitution: rawRejected,
        ack: host.documentAck,
        cleaned: host.cleaned,
        ackAttempts,
        firstStoreRefusal,
      },
      attachment: { raw: target.document, persisted: target.trustedDocument },
      selection: e.state.selection.toJSON(),
      composing: e.view.composing,
    };
  });
  results.push({
    name: "actual-App-OCR-and-attachment-local-snapshots-ACK-and-strict-raw-identity",
    ...local,
  });
  await page.close();
  assert.equal(injected, true);
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        status: "pass",
        sourceRoot: root,
        binary,
        binarySha256: binaryHash,
        binaryBytes: (await stat(binary)).size,
        results,
        storeRecords: records,
        errors,
        transportInjection: injection,
        extractedCallbacks: {
          ocrInsert,
          attachmentInsert,
          validatePickerTarget,
        },
        limitations: [
          "Controlled DOM composition in headless Chrome, not actual device/native IME.",
          "Only browser-preview transport uses an isolated real Store.action; native IPC and Session transport are not exercised.",
          "OCR native cleanup ports are synthetic; production local insertion/ACK/target code and real Editor are exercised; ACK body and first refusal come from actual Store.",
          "Fixture scaffold reuses frozen author script's reviewed AST extraction; reviewer independently adds real Store refusal/retry/ACK and runs only the OCR/attachment section.",
          "No native UI or pixel parity claim.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Passed ${results.length} tag save-boundary scenarios with existing real Store binary.`,
  );
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        results,
        records,
        body:
          page && !page.isClosed()
            ? await page
                .locator("body")
                .innerText()
                .catch(() => null)
            : null,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
