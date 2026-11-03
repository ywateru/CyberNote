import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";

// Independent02 extension: reuse the frozen author fixture loader and actual
// AST-extracted App closures, with independently added reentrancy/multifile
// assertions. This is controlled source evidence, not real native IPC.
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
    submit,
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
const previousReader = globalThis.FileReader;
try {
  {
    const f = fixture();
    const pending = await f.start();
    const first = outcome(f.cancel());
    await until(() => pending.op.invalidated, "first cancellation seals admission");
    const retry = await outcome(f.submit(f.batch));
    assert.equal(retry.success, false);
    assert.match(retry.message, /取消尚未核定/);
    const second = outcome(f.cancel());
    for (let i=0;i<30;i++) await Promise.resolve();
    assert.equal(f.calls.length, 0);
    assert.equal(f.attachmentSubmissions.current.get(pending.op.operationId), pending.op);
    assert.equal(f.attachmentBatches.current.has(f.batch), true);
    f.reader.complete();
    const outcomes = await Promise.all([pending.result, first, second]);
    assert.equal(outcomes[0].success, false);
    assert.ok(outcomes.slice(1).some(x => x.success));
    assert.equal(f.calls[0].command, "store_attachment_operation");
    assert.equal(f.calls.filter(x => x.command === "store_attachment_operation").length, 1);
    assert.equal(f.journal.size, 0);
    assert.equal(f.attachmentSubmissions.current.size, 0);
    assert.equal(f.attachmentBatches.current.size, 0);
    results.push({ name: "repeated cancellation and actual batch retry during FileReader settle", retry, outcomes, calls: f.calls, final: f.final() });
  }
  {
    const f = fixture();
    f.batch.files.push({ name: "b.pdf", type: "application/pdf" });
    f.batch.operationIds.push("df494f8d-1a22-430a-b619-b7c74fcc56c1");
    const pending = await f.start();
    const cancellation = outcome(f.cancel());
    await until(() => pending.op.invalidated, "multifile batch sealed");
    assert.equal(f.attachmentSubmissions.current.size, 1);
    f.reader.complete();
    assert.equal((await pending.result).success, false);
    assert.equal((await cancellation).success, true);
    assert.deepEqual(f.calls.map(x => x.operationId), [f.batch.operationIds[0], f.batch.operationIds[0]]);
    assert.deepEqual(f.calls.map(x => x.command), ["store_attachment_operation", "cancel_attachment_operation"]);
    assert.equal(f.journal.size, 0);
    assert.equal(f.attachmentSubmissions.current.size, 0);
    assert.equal(f.attachmentBatches.current.size, 0);
    results.push({ name: "sealed multi-file batch cannot start the next file after settle", calls: f.calls, final: f.final() });
  }
  {
    const f = fixture();
    const op = new AttachmentSubmission(f.batch.operationIds[0], "note-a", f.target, f.batch.files[0]);
    op.attachment = {id:"local-node", noteId:"note-a", kind:"file", displayName:"local.pdf", mime:"application/pdf", size:4, relativePath:"controlled"};
    f.target.document.content[0].content = [{type:"attachment", attrs:{id:"local-node",kind:"file"}}];
    f.attachmentSubmissions.current.set(op.operationId, op);
    assert.equal(op.inserted, false);
    const cancellation = await outcome(f.cancel());
    assert.equal(cancellation.success, false);
    assert.match(cancellation.message, /已在本窗口正文中，不能取消/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.attachmentSubmissions.current.get(op.operationId), op);
    assert.equal(f.attachmentBatches.current.has(f.batch), true);
    results.push({name:"actual local JSON reference blocks cleanup even when inserted flag is false", cancellation, final:f.final()});
  }
} finally {
  globalThis.FileReader = previousReader;
  delete globalThis.__attachmentBridgeBoundary;
}
console.log(JSON.stringify({status:"passed",groups:results.length,results,sourceSha256:hashes,fixture:"reuses frozen check-attachment-cancellation.mjs loader/controlled platform fixture only; independent assertions execute actual App closures and production helper/bridge; no Rust DB, DOM, device or picker"},null,2));
