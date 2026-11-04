import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";

// Regression derived from the independent 607950a FileReader cancellation
// reproduction. Execute unchanged AST-extracted App closures and production
// helpers/bridge. Only browser and native I/O boundaries are controlled.
const hashes = {},
  modules = new Map();
async function production(name) {
  if (modules.has(name)) return modules.get(name).exports;
  const source = await readFile(`src/${name}.ts`, "utf8");
  hashes[name] = createHash("sha256").update(source).digest("hex");
  let output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const dependency of [
    "access-client",
    "secure-id",
    "proof-access",
    "types",
    "document-equality",
    "recording-metadata",
    "audio-playback",
  ]) {
    if (!output.includes(`"./${dependency}"`)) continue;
    await production(dependency);
    output = output.replaceAll(
      `"./${dependency}"`,
      JSON.stringify(modules.get(dependency).url),
    );
  }
  output = output.replaceAll(
    "import.meta.env.VITE_ACCESS_BOUNDARY_PROOF",
    '"0"',
  );
  for (const [specifier, code] of [
    [
      "@tauri-apps/api/core",
      "export const isTauri = () => true; export const invoke = (...args) => globalThis.__attachmentBridgeBoundary.invoke(...args);",
    ],
    ["@tauri-apps/api/event", "export const listen = async () => () => {};"],
  ])
    output = output.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(
        `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`,
      ),
    );
  const url = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
  const exports = await import(url);
  modules.set(name, { url, exports });
  return exports;
}
const { AttachmentSubmission, documentReferencesAttachment } = await production(
  "attachment-submission",
);
const { TrustedSynchronization } = await production("trusted-synchronization");
const { rebindAttachmentTarget } = await production("attachment-target");
const bridge = await production("bridge");
const source = await readFile("src/App.tsx", "utf8");
hashes.App = createHash("sha256").update(source).digest("hex");
const ast = ts.createSourceFile(
  "App.tsx",
  source,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);
function actualClosure(name, dependencies) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)
      expression = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, name);
  const js = ts.transpileModule(`const actual = ${expression};`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return new Function(...Object.keys(dependencies), js + "return actual;")(
    ...Object.values(dependencies),
  );
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const until = async (predicate, message) => {
  for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve();
  assert.ok(predicate(), message);
};
const outcome = (promise) =>
  promise.then(
    () => ({ success: true }),
    (error) => ({ success: false, message: error.message }),
  );
function fixture(options = {}) {
  const state = {
    sessionId: "cancel-session",
    epoch: 4,
    notes: { "note-a": { epoch: 7, authorized: true } },
    suspended: [],
    operationId: null,
  };
  bridge.accessGate.state = state;
  const schema = new Schema({
    nodes: {
      doc: { content: "paragraph+" },
      paragraph: { content: "text*" },
      text: {},
    },
  });
  const document = { type: "doc", content: [{ type: "paragraph" }] };
  const pm = EditorState.create({ schema, doc: schema.nodeFromJSON(document) });
  const editor = {
    isDestroyed: false,
    isEditable: true,
    state: pm,
    getJSON: () => document,
  };
  const nativeEditorOwners = { current: new WeakMap([[editor, "note-a"]]) };
  const nativeDocumentVersions = { current: new WeakMap([[editor, 0]]) };
  const target = {
    noteId: "note-a",
    scope: "scope-a",
    stamp: bridge.accessGate.stamp("note-a"),
    editor,
    owner: "note-a",
    bookmark: pm.selection.getBookmark(),
    documentVersion: 0,
    externalVersion: 0,
    document,
    trustedDocument: document,
    invalidated: false,
  };
  const synchronization = new TrustedSynchronization();
  const ws = {
    notes: [{ id: "note-a", document, locked: false, deletedAt: null }],
  };
  const runtime = {
    current: { noteId: "note-a", scope: "scope-a", editor, available: true },
  };
  const validatePickerTarget = actualClosure("validatePickerTarget", {
    flush: async () => {},
    synchronizeRef: {
      current: () =>
        synchronization.request(
          () => bridge.invalidateAccessRequests(),
          async () => ws,
          () => {},
          () => {},
        ),
    },
    pickerRuntime: runtime,
    wsRef: { current: ws },
    rebindAttachmentTarget,
    accessGate: bridge.accessGate,
    nativeEditorOwners,
    nativeDocumentVersions,
    externalVersions: { current: new Map() },
    synchronization,
    blockedNotes: { current: new Set() },
  });
  const batch = {
    target,
    operationIds: ["4b462c24-3a75-47fe-8b9f-259214cfd720"],
    files: [{ name: "a.pdf", type: "application/pdf" }],
  };
  const attachmentSubmissions = { current: new Map() },
    attachmentBatches = { current: new Set([batch]) };
  const calls = [],
    journal = new Map();
  let reader;
  globalThis.FileReader = class {
    readAsDataURL(file) {
      this.file = file;
      reader = this;
    }
    complete() {
      this.result = "data:application/pdf;base64,JVBERg==";
      this.onload();
    }
    fail() {
      this.onerror(Error("FileReader failed"));
    }
  };
  globalThis.__attachmentBridgeBoundary = {
    invoke: async (command, params) => {
      calls.push({ command, operationId: params.operationId });
      if (command === "store_attachment_operation") {
        if (options.storeWait) await options.storeWait.promise;
        const attachment = {
          id: "cancel-attachment",
          noteId: params.noteId,
          kind: "file",
          displayName: params.name,
          mime: params.mime,
          size: 4,
          relativePath: "controlled",
        };
        const result = {
          operationId: params.operationId,
          noteId: params.noteId,
          status: "stored",
          attachment,
          access: state,
        };
        journal.set(params.operationId, result);
        if (options.rejectStoreResponse)
          throw Error("stored but response rejected");
        return result;
      }
      if (command === "cancel_attachment_operation") {
        if (options.deferredCancel)
          return {
            operationId: params.operationId,
            noteId: params.noteId,
            status: "deferred",
            reason: "save_pending",
            access: state,
          };
        const status = journal.delete(params.operationId)
          ? "aborted"
          : "notPersisted";
        if (options.rejectCancelResponse) {
          options.rejectCancelResponse = false;
          bridge.invalidateAccessRequests();
        }
        return {
          operationId: params.operationId,
          noteId: params.noteId,
          status,
          access: state,
        };
      }
      throw Error(`unexpected command ${command}`);
    },
  };
  const common = {
    attachmentBatches,
    attachmentSubmissions,
    validatePickerTarget,
    AttachmentSubmission,
    native: true,
    storeAttachmentOperation: bridge.storeAttachmentOperation,
    queryAttachmentOperation: bridge.queryAttachmentOperation,
    cancelAttachmentOperation: bridge.cancelAttachmentOperation,
    documentReferencesAttachment,
    nativeDocumentVersions,
    queues: { current: new Map() },
    pendingDocs: { current: new Map() },
    saveDoc: async () => {
      throw Error("unexpected save");
    },
    refresh: async () => {},
    setMenu: () => {},
    setError: () => {},
  };
  const submit = actualClosure("submitAttachmentBatch", common),
    cancel = actualClosure("discardUninsertedAttachments", common);
  const start = async () => {
    const result = outcome(submit(batch));
    await until(() => !!reader, "actual bridge waiting on FileReader");
    const op = attachmentSubmissions.current.values().next().value;
    assert.equal(op.storageAttempted, true);
    return { op, result };
  };
  const final = () => ({
    backendStoredOperations: journal.size,
    frontendBatches: attachmentBatches.current.size,
    frontendSubmissions: attachmentSubmissions.current.size,
    targetInvalidated: target.invalidated,
  });
  return {
    start,
    cancel,
    batch,
    target,
    runtime,
    calls,
    journal,
    attachmentSubmissions,
    attachmentBatches,
    final,
    get reader() {
      return reader;
    },
  };
}
const results = [];
async function test(name, run) {
  const details = await run();
  results.push({ name, ...details });
}
const previousReader = globalThis.FileReader;
try {
  await test("cancel waits across actual FileReader before authoritative terminal cancellation", async () => {
    const f = fixture(),
      pending = await f.start();
    let cancelled = false;
    const cancellation = outcome(f.cancel()).then((r) => {
      cancelled = true;
      return r;
    });
    await until(
      () => pending.op.invalidated,
      "cancel seals admission synchronously before waiting",
    );
    assert.equal(cancelled, false);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.final(), {
      backendStoredOperations: 0,
      frontendBatches: 1,
      frontendSubmissions: 1,
      targetInvalidated: false,
    });
    f.reader.complete();
    assert.equal((await pending.result).success, false);
    assert.equal((await cancellation).success, true);
    assert.deepEqual(
      f.calls.map((x) => x.command),
      ["store_attachment_operation", "cancel_attachment_operation"],
    );
    assert.deepEqual(f.final(), {
      backendStoredOperations: 0,
      frontendBatches: 0,
      frontendSubmissions: 0,
      targetInvalidated: true,
    });
    return { calls: f.calls, final: f.final() };
  });
  await test("cancel waits for already-dispatched native IPC to settle", async () => {
    const storeWait = deferred(),
      f = fixture({ storeWait }),
      pending = await f.start();
    f.reader.complete();
    await until(() => f.calls.length === 1, "store IPC dispatched");
    const cancellation = outcome(f.cancel());
    await until(() => pending.op.invalidated, "operation sealed");
    assert.equal(f.calls.length, 1);
    assert.equal(f.attachmentSubmissions.current.size, 1);
    assert.equal(f.attachmentBatches.current.size, 1);
    storeWait.resolve();
    assert.equal((await pending.result).success, false);
    assert.equal((await cancellation).success, true);
    assert.deepEqual(
      f.calls.map((x) => x.command),
      ["store_attachment_operation", "cancel_attachment_operation"],
    );
    assert.equal(f.journal.size, 0);
    return { calls: f.calls, final: f.final() };
  });
  await test("store response loss after write still waits then cancels actual original operation", async () => {
    const f = fixture({ rejectStoreResponse: true }),
      pending = await f.start();
    const cancellation = outcome(f.cancel());
    await until(() => pending.op.invalidated, "operation sealed");
    f.reader.complete();
    assert.equal((await pending.result).success, false);
    assert.equal((await cancellation).success, true);
    assert.equal(f.journal.size, 0);
    return { calls: f.calls, final: f.final() };
  });
  await test("FileReader failure settles before notPersisted may release identity", async () => {
    const f = fixture(),
      pending = await f.start();
    const cancellation = outcome(f.cancel());
    await until(() => pending.op.invalidated, "operation sealed");
    f.reader.fail();
    assert.equal((await pending.result).success, false);
    assert.equal((await cancellation).success, true);
    assert.deepEqual(
      f.calls.map((x) => x.command),
      ["cancel_attachment_operation"],
    );
    assert.equal(f.attachmentSubmissions.current.size, 0);
    return { calls: f.calls, final: f.final() };
  });
  await test("deferred cancellation retains every unresolved identity and retries cancellation", async () => {
    const options = { deferredCancel: true },
      f = fixture(options),
      pending = await f.start();
    const cancellation = outcome(f.cancel());
    await until(() => pending.op.invalidated, "operation sealed");
    f.reader.complete();
    await pending.result;
    const cancelled = await cancellation;
    assert.equal(cancelled.success, false);
    assert.match(cancelled.message, /save_pending/);
    assert.equal(f.journal.size, 1);
    assert.equal(f.attachmentSubmissions.current.size, 1);
    assert.equal(f.attachmentBatches.current.size, 1);
    assert.equal(f.batch.cancelRequested, true);
    options.deferredCancel = false;
    await f.cancel();
    assert.equal(f.journal.size, 0);
    return { firstCancellation: cancelled, calls: f.calls, final: f.final() };
  });
  await test("cancel response rejected after backend deletion keeps identity until fresh terminal response", async () => {
    const f = fixture({ rejectCancelResponse: true }),
      pending = await f.start();
    const cancellation = outcome(f.cancel());
    await until(() => pending.op.invalidated, "operation sealed");
    f.reader.complete();
    await pending.result;
    assert.equal((await cancellation).success, false);
    assert.equal(f.journal.size, 0);
    assert.equal(f.attachmentSubmissions.current.size, 1);
    assert.equal(f.attachmentBatches.current.size, 1);
    await f.cancel();
    assert.equal(f.attachmentSubmissions.current.size, 0);
    return { calls: f.calls, final: f.final() };
  });
  await test("target invalidation while storage settles retains recovery identity and refuses unrelated authority", async () => {
    const f = fixture(),
      pending = await f.start();
    const cancellation = outcome(f.cancel());
    await until(() => pending.op.invalidated, "operation sealed");
    f.target.invalidated = true;
    f.reader.complete();
    await pending.result;
    assert.equal((await cancellation).success, false);
    assert.equal(f.journal.size, 1);
    assert.equal(f.attachmentSubmissions.current.size, 1);
    assert.equal(f.attachmentBatches.current.size, 1);
    assert.deepEqual(
      f.calls.map((x) => x.command),
      ["store_attachment_operation"],
    );
    return { calls: f.calls, final: f.final() };
  });
  await test("known local insertion rejects cancellation before sealing or backend cleanup", async () => {
    const f = fixture();
    const op = new AttachmentSubmission(
      f.batch.operationIds[0],
      "note-a",
      f.target,
      f.batch.files[0],
    );
    op.inserted = true;
    f.attachmentSubmissions.current.set(op.operationId, op);
    const cancelled = await outcome(f.cancel());
    assert.equal(cancelled.success, false);
    assert.match(cancelled.message, /已在本窗口正文/);
    assert.equal(op.invalidated, false);
    assert.equal(f.batch.cancelRequested, undefined);
    assert.equal(f.calls.length, 0);
    return { cancellation: cancelled, final: f.final() };
  });
} finally {
  globalThis.FileReader = previousReader;
  delete globalThis.__attachmentBridgeBoundary;
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      groups: results.length,
      results,
      sourceSha256: hashes,
      execution:
        "AST-extracted production App validate/submit/cancel + production submission/bridge/trusted synchronization/AccessGate + real ProseMirror bookmark; controlled FileReader/invoke; no Rust DB, device, picker or GUI acceptance.",
    },
    null,
    2,
  ),
);
