import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";

// Execute the actual App recording-parent closures and production submission,
// bridge, authority and SaveQueue implementations. Only platform/host I/O is
// controlled; no copied recording-parent algorithm or mounted UI is substituted.
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
const { enqueueSave } = await production("save-queue");
const { SaveRevisions } = await production("save-revisions");
const { documentsEqual } = await production("document-equality");
const { documentText } = await production("types");
const source = await readFile("src/App.tsx", "utf8");
hashes.App = createHash("sha256").update(source).digest("hex");
const ast = ts.createSourceFile(
  "App.tsx",
  source,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
function unique(matches, label) {
  assert.equal(matches.length, 1, `unique actual App ${label}`);
  return matches[0];
}
function declaration(name) {
  return unique(
    nodes.filter(
      (node) =>
        ts.isVariableDeclaration(node) && node.name.getText(ast) === name,
    ),
    name,
  );
}
function assignment(name) {
  return (
    unique(
      nodes.filter(
        (node) =>
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          node.left.getText(ast) === name,
      ),
      name,
    ).getText(ast) + ";"
  );
}
function execute(body, env) {
  const js = ts.transpileModule(body, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return Function("env", `with(env) { ${js} }`)(env);
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
  for (let turn = 0; turn < 300 && !predicate(); turn++)
    await Promise.resolve();
  assert(predicate(), message);
};
const outcome = (promise) =>
  promise.then(
    () => ({ success: true }),
    (error) => ({ success: false, message: error.message }),
  );
const actualNames = [
  "fail",
  "hydrate",
  "flush",
  "refresh",
  "saveDoc",
  "validatePickerTarget",
  "awaitAttachmentDocumentAck",
  "submitAttachmentBatch",
  "retryAttachments",
  "discardUninsertedAttachments",
  "capturePickerTarget",
  "finishRecording",
  "recordingReferenced",
  "sealRecording",
  "cancelRecording",
  "submitRecording",
  "openRecording",
  "nativeSelection",
];
const effect = unique(
  nodes.filter(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "useEffect" &&
      node.arguments[0]?.getText(ast).includes(".onCloseRequested"),
  ),
  "unique close effect",
);
const targetEffect = unique(
  nodes.filter(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "useEffect" &&
      node.arguments[0]
        ?.getText(ast)
        .includes("ticket.batch.target.scope !== pickerRuntime.current.scope"),
  ),
  "target lifecycle effect",
);
const normalClick = unique(
  nodes.filter(
    (node) =>
      ts.isJsxAttribute(node) &&
      node.name.getText(ast) === "onClick" &&
      node.initializer?.getText(ast).includes("openRecording();"),
  ),
  "ordinary recording entry",
).initializer.expression;
const panel = unique(
  nodes.filter(
    (node) =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(ast) === "RecordingPanel",
  ),
  "RecordingPanel",
);
const panelAttribute = (name) =>
  unique(
    panel.attributes.properties.filter(
      (node) => ts.isJsxAttribute(node) && node.name.getText(ast) === name,
    ),
    `Panel ${name}`,
  ).initializer.expression;
assert.equal(
  panelAttribute("key").getText(ast),
  "recording.batch.operationIds[0]",
);
function fixture(options = {}) {
  const access = {
    sessionId: "recording-session",
    epoch: 4,
    notes: {
      "note-a": { epoch: 7, authorized: true },
      "note-b": { epoch: 3, authorized: true },
    },
    suspended: [],
    operationId: null,
  };
  bridge.accessGate.state = access;
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { group: "block", content: "text*" },
      text: {},
      attachment: {
        group: "block",
        atom: true,
        attrs: { id: {}, kind: {}, name: {} },
      },
    },
  });
  const initial = { type: "doc", content: [{ type: "paragraph" }] };
  const note = (id) => ({
    id,
    document: structuredClone(initial),
    locked: false,
    deletedAt: null,
    revision: 0,
  });
  const backend = {
    notes: [note("note-a"), note("note-b")],
    folders: [],
    attachments: [],
    settings: {},
    access,
  };
  const journal = new Map(),
    calls = [],
    readers = [];
  let closeHandler,
    destroyed = 0,
    api;
  const env = {
    AttachmentSubmission,
    documentReferencesAttachment,
    TrustedSynchronization,
    rebindAttachmentTarget,
    enqueueSave,
    documentsEqual,
    documentText,
    ...bridge,
    secureId: () => `operation-${++env.ids}`,
    ids: 0,
    errText: (error) => error.message,
    useCallback: (fn) => fn,
    queues: { current: new Map() },
    pendingDocs: { current: new Map() },
    saveFailures: { current: new Map() },
    revisions: { current: new SaveRevisions() },
    externalVersions: { current: new Map() },
    blockedNotes: { current: new Set() },
    attachmentSubmissions: { current: new Map() },
    attachmentBatches: { current: new Set() },
    recordingTicket: { current: null },
    recordingLifecycle: { current: null },
    pickerRuntime: { current: null },
    nativeEditorOwners: { current: new WeakMap() },
    nativeDocumentVersions: { current: new WeakMap() },
    wsRef: { current: structuredClone(backend) },
    clearSensitive: {
      current: () =>
        assert.fail(
          "controlled fixture did not request access hydration destruction",
        ),
    },
    initializedSelection: { current: false },
    synchronizingRef: { current: false },
    synchronizeRef: { current: null },
    synchronization: new TrustedSynchronization(),
    nativeAssert: { current: null },
    nativeHandler: { current: null },
    androidBack: { current: null },
    native: true,
    separate: null,
    nativeScope: "scope-a",
    noteId: "note-a",
    page: "editor",
    mobile: true,
    loading: false,
    synchronizing: false,
    syncError: "",
    accessSuspended: [],
    draw: null,
    record: false,
    modal: null,
    menu: "media",
    showFind: false,
    searching: false,
    view: "list",
    galleryEditor: false,
    current: backend.notes[0],
    ws: structuredClone(backend),
    error: "",
    saving: 0,
    insertCalls: 0,
    setWs: (update) => {
      env.ws = typeof update === "function" ? update(env.ws) : update;
    },
    setError: (value) => {
      env.error = value;
    },
    setSaving: (update) => {
      env.saving = typeof update === "function" ? update(env.saving) : update;
    },
    setMenu: (value) => {
      env.menu = value;
      render();
    },
    setRecord: (value) => {
      env.record = value;
      render();
    },
    setSettings: () => {},
    setFolderId: () => {},
    setNoteId: () => {},
    setPage: () => {},
    setLoading: () => {},
    setWorkspaceLoaded: () => {},
    setSynchronizing: (value) => {
      env.synchronizing = value;
    },
    setSyncError: (value) => {
      env.syncError = value;
    },
    setAccessSuspended: (value) => {
      env.accessSuspended = value;
    },
    setEditing: () => {},
    setShowFind: () => {},
    document: {
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    getCurrentWindow: () => ({
      onCloseRequested: async (fn) => {
        closeHandler = fn;
        return () => {};
      },
      destroy: async () => {
        destroyed++;
      },
    }),
    flushFail: false,
  };
  const editor = {
    isDestroyed: false,
    isEditable: true,
    state: EditorState.create({ schema, doc: schema.nodeFromJSON(initial) }),
    getJSON: () => editor.state.doc.toJSON(),
    view: {
      dispatch: (tr) => {
        editor.state = editor.state.apply(tr);
      },
    },
    chain: () => {
      let content;
      const chain = {
        focus: () => chain,
        insertContent: (value) => {
          content = value;
          return chain;
        },
        run: () => {
          env.insertCalls++;
          if (options.insertFalse) return false;
          if (options.insertThrowBefore)
            throw Error("insert failed before dispatch");
          editor.state = editor.state.apply(
            editor.state.tr.insert(
              editor.state.doc.content.size,
              schema.nodeFromJSON(content),
            ),
          );
          env.nativeDocumentVersions.current.set(
            editor,
            (env.nativeDocumentVersions.current.get(editor) || 0) + 1,
          );
          // Actual Editor onChange boundary: call production App saveDoc with the
          // real PM document. Editor DOM/commands and backend I/O remain controlled.
          void api.saveDoc("note-a", editor.getJSON());
          if (options.insertThrowAfter)
            throw Error("insert failed after dispatch");
          return true;
        },
      };
      return chain;
    },
  };
  env.editor = editor;
  env.nativeEditorOwners.current.set(editor, "note-a");
  env.nativeDocumentVersions.current.set(editor, 0);
  function render() {
    execute(
      [
        `const attachmentBaseAvailable = ${declaration("attachmentBaseAvailable").initializer.getText(ast)};`,
        `const pickerBaseAvailable = ${declaration("pickerBaseAvailable").initializer.getText(ast)};`,
        assignment("pickerRuntime.current"),
      ].join("\n"),
      env,
    );
  }
  globalThis.FileReader = class {
    readAsDataURL(file) {
      this.file = file;
      readers.push(this);
      if (!options.holdReader) queueMicrotask(() => this.complete());
    }
    complete() {
      this.result = "data:audio/webm;base64,YWN0dWFsLWZpbGUtYm91bmRhcnk=";
      this.onload();
    }
  };
  globalThis.__attachmentBridgeBoundary = {
    invoke: async (command, params) => {
      calls.push({
        command,
        operationId: params?.operationId,
        noteId: params?.noteId || params?.action?.id,
      });
      if (command === "load_workspace") {
        if (options.loadFailure) throw Error("workspace unavailable");
        if (options.refreshFailure && backend.notes[0].revision > 0)
          throw Error("refresh unavailable after ACK");
        return structuredClone(backend);
      }
      if (command === "register_save_intent") return;
      if (command === "workspace_action") {
        assert.equal(params.action.type, "saveNote");
        if (options.saveWait) await options.saveWait.promise;
        if (options.saveFailures > 0) {
          options.saveFailures--;
          throw Error("durable save rejected");
        }
        const row = backend.notes.find((n) => n.id === params.action.id);
        row.document = structuredClone(params.action.document);
        row.revision++;
        for (const item of journal.values())
          if (
            item.noteId === row.id &&
            documentReferencesAttachment(row.document, item.attachment)
          )
            item.status = "committed";
        return { ...structuredClone(row), access };
      }
      if (command === "store_attachment_operation") {
        if (options.storeWait) await options.storeWait.promise;
        const attachment = {
          id: "audio-attachment",
          noteId: params.noteId,
          kind: "audio",
          displayName: params.name,
          mime: params.mime,
          size: 24,
          relativePath: "controlled/audio.webm",
        };
        const result = {
          operationId: params.operationId,
          noteId: params.noteId,
          status: "stored",
          attachment,
          access,
        };
        journal.set(params.operationId, result);
        backend.attachments = [attachment];
        if (options.afterStore) options.afterStore(env);
        if (options.rejectStore) {
          options.rejectStore = false;
          throw Error("stored but response lost");
        }
        return structuredClone(result);
      }
      if (command === "query_attachment_operation")
        return structuredClone(
          journal.get(params.operationId) || {
            operationId: params.operationId,
            noteId: params.noteId,
            status: "notPersisted",
            access,
          },
        );
      if (command === "cancel_attachment_operation") {
        if (options.cancelDeferred)
          return {
            operationId: params.operationId,
            noteId: params.noteId,
            status: "deferred",
            reason: "save_pending",
            access,
          };
        const stored = journal.get(params.operationId);
        if (stored?.status === "committed") return structuredClone(stored);
        const status = journal.delete(params.operationId)
          ? "aborted"
          : "notPersisted";
        return {
          operationId: params.operationId,
          noteId: params.noteId,
          status,
          access,
        };
      }
      throw Error(`unexpected actual bridge command ${command}`);
    },
  };
  render();
  const code = [
    ...actualNames.map(
      (name) =>
        `const ${name} = ${declaration(name).initializer.getText(ast)};`,
    ),
    assignment("synchronizeRef.current"),
    assignment("recordingLifecycle.current"),
    assignment("nativeAssert.current"),
    assignment("nativeHandler.current"),
    assignment("androidBack.current"),
    `return {${actualNames.join(",")}};`,
  ].join("\n");
  api = execute(code, env);
  const file = { name: "新录音.webm", type: "audio/webm", size: 24 };
  const open = (nativeEntry = false) => {
    if (nativeEntry) {
      env.menu = null;
      render();
      const context = {
        noteId: env.noteId,
        scope: env.nativeScope,
        stamp: bridge.accessGate.stamp(env.noteId),
        editor,
        bookmark: editor.state.selection.getBookmark(),
        documentVersion: 0,
      };
      env.nativeHandler.current(
        { kind: "menu", command: "recordAudio" },
        context,
        1,
      );
    } else
      execute(`return (${normalClick.getText(ast)})();`, { ...env, ...api });
    assert(
      env.recordingTicket.current,
      "actual entry created recording ticket",
    );
    return env.recordingTicket.current;
  };
  const props = (ticket) =>
    execute(
      `return {onDone: ${panelAttribute("onDone").getText(ast)}, onCancel: ${panelAttribute("onCancel").getText(ast)}};`,
      { ...env, ...api, recording: ticket },
    );
  const mountClose = () =>
    execute(`return (${effect.arguments[0].getText(ast)})();`, {
      ...env,
      ...api,
    });
  return {
    env,
    api,
    editor,
    file,
    open,
    props,
    options,
    calls,
    journal,
    backend,
    readers,
    render,
    mountClose,
    get closeHandler() {
      return closeHandler;
    },
    get destroyed() {
      return destroyed;
    },
    targetChanged: () =>
      execute(`return (${targetEffect.arguments[0].getText(ast)})();`, {
        ...env,
        ...api,
      }),
    counts: () => ({
      stores: calls.filter((c) => c.command === "store_attachment_operation")
        .length,
      queries: calls.filter((c) => c.command === "query_attachment_operation")
        .length,
      cancels: calls.filter((c) => c.command === "cancel_attachment_operation")
        .length,
      saves: calls.filter((c) => c.command === "workspace_action").length,
      inserts: env.insertCalls,
      batches: env.attachmentBatches.current.size,
      submissions: env.attachmentSubmissions.current.size,
      journal: journal.size,
      record: env.record,
      active: !!env.recordingTicket.current,
    }),
  };
}
// App fixture prefix is copied byte-for-byte from the frozen author's harness.
// Cases below are independently authored. All parent callbacks and the Panel
// cancel callback are extracted from frozen production AST, not reimplemented.
const independentResults = [];
const check = async (name, fn) => {
  independentResults.push({ name, pass: true, ...(await fn()) });
};
await check("actual Panel cancel closes admission and parent UI before waiting for held IPC; duplicate cancellation coalesces", async () => {
  const storeWait = deferred(), f = fixture({ storeWait }), ticket = f.open();
  const result = outcome(f.props(ticket).onDone(f.file));
  await until(() => f.counts().stores === 1, "held store");
  const panelSource = await readFile("src/RecordingPanel.tsx", "utf8");
  hashes.RecordingPanel = createHash("sha256").update(panelSource).digest("hex");
  const panelAst = ts.createSourceFile("RecordingPanel.tsx", panelSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const matches = [];
  const walk = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(panelAst) === "cancel") matches.push(node);
    ts.forEachChild(node, walk);
  };
  walk(panelAst);
  assert.equal(matches.length, 1);
  const live = { current: true }, events = [];
  const cancel = execute(`return ${matches[0].initializer.getText(panelAst)};`, {
    live,
    clearDeadline: () => events.push("deadline"),
    clock: { current: { pause: () => events.push("clock") } },
    session: { current: { dispose: () => events.push("dispose") } },
    onCancel: () => {
      assert.equal(live.current, false);
      events.push("parent");
      f.props(ticket).onCancel();
    },
  });
  cancel();
  cancel();
  assert.deepEqual(events, ["deadline", "clock", "dispose", "parent"]);
  assert.equal(f.env.record, false);
  assert.equal(ticket.accepting, false);
  assert.equal(f.env.recordingTicket.current, ticket);
  const first = f.api.cancelRecording(ticket), second = f.api.cancelRecording(ticket);
  assert.equal(first, second);
  assert.equal(f.counts().cancels, 0);
  assert.equal(f.counts().submissions, 1);
  storeWait.resolve();
  assert.equal((await result).success, false);
  await first;
  assert.equal(f.counts().cancels, 1);
  assert.equal(f.counts().inserts, 0);
  assert.equal(f.counts().active, false);
  return { events, counts: f.counts() };
});
await check("idle Panel cancellation has no storage or queued work and immediately releases current ticket", async () => {
  const f = fixture(), ticket = f.open();
  await f.api.cancelRecording(ticket);
  assert.equal(f.counts().active, false);
  assert.equal(f.counts().record, false);
  assert.equal(f.counts().stores, 0);
  assert.equal(f.counts().cancels, 0);
  const next = f.open();
  assert.notEqual(next, ticket);
  await f.api.cancelRecording(next);
  return { counts: f.counts() };
});
await check("close during inserted held SaveQueue ACK waits for same running callback without self-wait", async () => {
  const saveWait = deferred(), f = fixture({ saveWait }), ticket = f.open();
  const result = outcome(f.props(ticket).onDone(f.file));
  await until(() => f.calls.some(c => c.command === "workspace_action"), "held body ACK");
  const cleanup = f.mountClose();
  let prevented = 0, closed = false;
  const closing = f.closeHandler({ preventDefault: () => prevented++ }).then(() => { closed = true; });
  assert.equal(prevented, 1);
  assert.equal(ticket.accepting, false);
  assert.equal(f.env.record, false);
  assert.equal(f.destroyed, 0);
  assert.equal(closed, false);
  assert.equal(f.counts().cancels, 0);
  saveWait.resolve();
  assert.equal((await result).success, true);
  await closing;
  assert.equal(f.destroyed, 1);
  assert.equal(f.counts().stores, 1);
  assert.equal(f.counts().inserts, 1);
  assert.equal(f.counts().saves, 1);
  assert.equal(f.counts().cancels, 0);
  cleanup();
  return { prevented, closed, counts: f.counts() };
});
await check("close with persistently failing body ACK retains original ticket, pending body and operation; later global retry recovers once", async () => {
  const f = fixture({ saveFailures: 100 }), ticket = f.open();
  assert.equal((await outcome(f.props(ticket).onDone(f.file))).success, false);
  f.mountClose();
  const failedClose = await outcome(f.closeHandler({ preventDefault: () => {} }));
  // Existing close listener reports through fail and keeps the window open.
  assert.equal(failedClose.success, true);
  assert.match(f.env.error, /尚未保存|未确认保存|durable save rejected/);
  assert.equal(f.destroyed, 0);
  assert.equal(f.counts().active, true);
  assert.equal(f.env.pendingDocs.current.size, 1);
  assert.equal(f.counts().submissions, 1);
  assert.equal(f.counts().cancels, 0);
  f.options.saveFailures = 0;
  await f.api.retryAttachments();
  assert.equal(f.counts().stores, 1);
  assert.equal(f.counts().inserts, 1);
  assert.equal(f.backend.notes[0].revision, 1);
  assert.equal(f.counts().active, false);
  return { counts: f.counts() };
});
await check("cancel after local insertion during held ACK preserves exact pending document and never cancels its attachment", async () => {
  const saveWait = deferred(), f = fixture({ saveWait, saveFailures: 2 }), ticket = f.open();
  const result = outcome(f.props(ticket).onDone(f.file));
  await until(() => f.calls.some(c => c.command === "workspace_action"), "held pending body");
  const document = f.env.pendingDocs.current.get("note-a");
  const cancellation = outcome(f.api.cancelRecording(ticket));
  assert.equal(f.env.record, false);
  assert.equal(ticket.batch.cancelRequested, undefined);
  assert.equal(f.counts().cancels, 0);
  saveWait.resolve();
  assert.equal((await result).success, false);
  const cancelled = await cancellation;
  assert.equal(cancelled.success, false);
  assert.match(cancelled.message, /待保存正文/);
  assert.equal(f.env.pendingDocs.current.get("note-a"), document);
  assert.equal(f.counts().cancels, 0);
  f.options.saveFailures = 0;
  await f.api.retryAttachments();
  assert.equal(f.backend.notes[0].revision, 1);
  assert.equal(f.counts().stores, 1);
  assert.equal(f.counts().inserts, 1);
  return { cancelled, counts: f.counts() };
});
console.log(JSON.stringify({ tests: independentResults.length, results: independentResults, sourceHashes: hashes,
  boundary: "Independent cases; author's frozen AST/production-helper fixture reused. Real Panel cancel AST also executed. React setters, Editor command host, FileReader, native IPC/backend and window controlled; no mounted App, device, DB or valid media claim."
}, null, 2));
