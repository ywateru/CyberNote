import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { pathToFileURL } from "node:url";
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
    "recording-metadata",
    "audio-playback",
    "note-tags",
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
const { editorSaveSnapshot } = await production("editor-save-snapshot");
const { documentText } = await production("types");
const { attachmentRecordedAt } = await production("recording-metadata");
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
export function fixture(options = {}) {
  const [NOTE_A, NOTE_B] = options.noteIds || ["note-a", "note-b"];
  const access = options.backend?.access || {
    sessionId: "recording-session",
    epoch: 4,
    notes: {
      [NOTE_A]: { epoch: 7, authorized: true },
      [NOTE_B]: { epoch: 3, authorized: true },
    },
    suspended: [],
    operationId: null,
  };
  bridge.accessGate.state = access;
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { group: "block", content: "text*" },
      heading: {
        group: "block",
        content: "text*",
        attrs: { level: { default: 1 } },
      },
      text: {},
      attachment: {
        group: "block",
        atom: true,
        attrs: { id: {}, kind: {}, name: {} },
      },
    },
  });
  const initial = options.backend?.notes[0].document || {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
  const note = (id) => ({
    id,
    document: structuredClone(initial),
    locked: false,
    deletedAt: null,
    revision: 0,
  });
  const backend = options.backend || {
    notes: [note(NOTE_A), note(NOTE_B)],
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
    attachmentRecordedAt,
    documentReferencesAttachment,
    TrustedSynchronization,
    rebindAttachmentTarget,
    enqueueSave,
    documentsEqual,
    editorSaveSnapshot,
    documentText,
    ...bridge,
    secureId: options.secureId || (() => `operation-${++env.ids}`),
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
    ocrOperation: { current: null },
    ocrLifecycle: {
      current: { active: () => false, close: async () => {}, detach() {} },
    },
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
    noteId: NOTE_A,
    page: "editor",
    mobile: true,
    loading: false,
    synchronizing: false,
    syncError: "",
    accessSuspended: [],
    draw: null,
    record: false,
    ocr: null,
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
          void api.saveDoc(NOTE_A, editor.getJSON());
          if (options.insertThrowAfter)
            throw Error("insert failed after dispatch");
          return true;
        },
      };
      return chain;
    },
  };
  env.editor = editor;
  env.nativeEditorOwners.current.set(editor, NOTE_A);
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
    async complete() {
      this.result = options.invoke
        ? `data:${this.file.type};base64,${Buffer.from(await this.file.arrayBuffer()).toString("base64")}`
        : "data:audio/webm;base64,YWN0dWFsLWZpbGUtYm91bmRhcnk=";
      this.onload();
    }
  };
  globalThis.__attachmentBridgeBoundary = {
    invoke: async (command, params) => {
      calls.push({
        command,
        operationId: params?.operationId,
        noteId: params?.noteId || params?.action?.id,
        params: structuredClone(params),
      });
      if (options.invoke) {
        if (command === "store_attachment_operation" && options.storeWait)
          await options.storeWait.promise;
        if (
          command === "load_workspace" &&
          options.refreshFailure &&
          backend.notes.find((n) => n.id === NOTE_A)?.revision > 0
        )
          throw Error("refresh unavailable after ACK");
        if (command === "workspace_action" && options.saveFailures > 0) {
          options.saveFailures--;
          throw Error("durable save rejected");
        }
        const result = await options.invoke(command, params);
        if (command === "load_workspace")
          Object.assign(backend, structuredClone(result));
        if (
          command === "workspace_action" &&
          params.action.type === "saveNote"
        ) {
          const index = backend.notes.findIndex((n) => n.id === result.id);
          backend.notes[index] = structuredClone(result);
        }
        if (command === "store_attachment_operation") {
          journal.set(params.operationId, structuredClone(result));
          backend.attachments.push(structuredClone(result.attachment));
          if (options.afterStore) options.afterStore(env);
          if (options.rejectStore) {
            options.rejectStore = false;
            throw Error("stored but response lost");
          }
        }
        return result;
      }
      if (command === "load_workspace") {
        if (options.loadFailure) throw Error("workspace unavailable");
        if (
          options.refreshFailure &&
          backend.notes.find((n) => n.id === NOTE_A)?.revision > 0
        )
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
          ...(params.recordedAt === undefined
            ? {}
            : { recordedAt: params.recordedAt }),
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
    result: Object.freeze({ file, recordedAt: 1793743199123 }),
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
export { bridge, hashes };
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const results = [];
  async function test(name, run) {
    const details = await run();
    results.push({ name, pass: true, ...details });
  }
  const previousReader = globalThis.FileReader;
  try {
    await test("recording result rejects invalid/changed dates before persistence; exact File/date retry survives", async () => {
      const f = fixture({ saveFailures: 2 }),
        ticket = f.open(),
        props = f.props(ticket);
      for (const date of [undefined, null, "2026", 1.5, -1, 253402300800000])
        await assert.rejects(props.onDone({ ...f.result, recordedAt: date }));
      assert.equal(f.counts().stores, 0);
      await assert.rejects(props.onDone(f.result));
      await assert.rejects(
        props.onDone({ ...f.result, recordedAt: f.result.recordedAt + 1 }),
        /开始时间已改变/,
      );
      await props.onDone(f.result);
      assert.equal(f.counts().stores, 1);
      assert.equal(f.backend.attachments[0].recordedAt, f.result.recordedAt);
    });
    await test("ordinary and native entries capture explicit original note, editor, bookmark and operation before Done", async () => {
      const entries = [];
      for (const nativeEntry of [false, true]) {
        const f = fixture(),
          ticket = f.open(nativeEntry);
        assert.equal(ticket.batch.target.noteId, "note-a");
        assert.equal(ticket.batch.target.editor, f.editor);
        assert(ticket.batch.target.bookmark);
        assert.deepEqual(ticket.batch.operationIds, ["operation-1"]);
        assert.equal(f.env.pickerRuntime.current.available, false);
        assert.equal(f.env.pickerRuntime.current.recordingAvailable, true);
        assert.throws(() => f.api.capturePickerTarget(), /不可添加附件/);
        await f.props(ticket).onDone(f.result);
        assert.equal(f.backend.notes[0].revision, 1);
        assert.equal(f.env.record, false);
        assert.equal(f.counts().stores, 1);
        assert.equal(f.counts().inserts, 1);
        entries.push({ nativeEntry, counts: f.counts() });
      }
      return { entries };
    });
    await test("actual parent Done remains pending and Panel stays open until real App SaveQueue ACK", async () => {
      const saveWait = deferred(),
        f = fixture({ saveWait }),
        ticket = f.open();
      let done = false;
      const pending = f
        .props(ticket)
        .onDone(f.result)
        .then(() => {
          done = true;
        });
      await until(
        () => f.calls.some((c) => c.command === "workspace_action"),
        "save request dispatched",
      );
      assert.equal(done, false);
      assert.equal(f.env.record, true);
      assert.equal(
        f.env.attachmentSubmissions.current.values().next().value.documentAck,
        false,
      );
      saveWait.resolve();
      await pending;
      assert.equal(done, true);
      assert.equal(f.env.record, false);
      return { counts: f.counts() };
    });
    await test("duplicate Done coalesces and a different final File is rejected without another operation", async () => {
      const storeWait = deferred(),
        f = fixture({ storeWait }),
        ticket = f.open(),
        props = f.props(ticket);
      const first = props.onDone(f.result),
        second = props.onDone(f.result);
      assert.equal(first, second);
      assert.equal(
        (await outcome(props.onDone({ ...f.result, file: { ...f.file } })))
          .success,
        false,
      );
      await until(
        () => f.calls.some((c) => c.command === "store_attachment_operation"),
        "store dispatched",
      );
      storeWait.resolve();
      await first;
      assert.equal(f.counts().stores, 1);
      assert.equal(f.counts().inserts, 1);
      return { counts: f.counts() };
    });
    await test("body ACK failure rejects to Panel and same File retry saves the same inserted attachment", async () => {
      const f = fixture({ saveFailures: 2 }),
        ticket = f.open(),
        props = f.props(ticket);
      const failed = await outcome(props.onDone(f.result));
      assert.equal(failed.success, false);
      assert.match(failed.message, /durable save rejected/);
      assert.equal(f.env.record, true);
      assert.equal(f.env.pendingDocs.current.size, 1);
      const operation = f.env.attachmentSubmissions.current.get("operation-1");
      assert.equal(operation.inserted, true);
      assert.equal(operation.documentAck, false);
      await props.onDone(f.result);
      assert.equal(operation.documentAck, true);
      assert.equal(f.counts().stores, 1);
      assert.equal(f.counts().inserts, 1);
      assert.equal(f.backend.notes[0].revision, 1);
      return { failed, counts: f.counts() };
    });
    await test("ACK then refresh failure resolves, closes Panel and global retry only refreshes", async () => {
      const f = fixture({ refreshFailure: true }),
        ticket = f.open();
      await f.props(ticket).onDone(f.result);
      const operation = f.env.attachmentSubmissions.current.get("operation-1");
      assert.equal(operation.documentAck, true);
      assert.equal(operation.refreshed, false);
      assert.equal(f.env.record, false);
      assert.match(f.env.error, /正文已保存.*刷新失败/);
      const before = f.counts();
      f.options.refreshFailure = false;
      await f.api.retryAttachments();
      assert.equal(f.counts().stores, before.stores);
      assert.equal(f.counts().inserts, before.inserts);
      assert.equal(f.counts().saves, before.saves);
      assert.equal(f.counts().submissions, 0);
      return { before, after: f.counts() };
    });
    for (const mode of [
      "insertFalse",
      "insertThrowBefore",
      "insertThrowAfter",
    ]) {
      await test(`${mode} rejects to Panel and same operation retry inserts at most once`, async () => {
        const f = fixture({ [mode]: true }),
          ticket = f.open(),
          props = f.props(ticket);
        const failed = await outcome(props.onDone(f.result));
        assert.equal(failed.success, false);
        assert.equal(f.env.record, true);
        f.options[mode] = false;
        await props.onDone(f.result);
        assert.equal(f.counts().stores, 1);
        assert.equal(
          f.backend.notes[0].document.content.filter(
            (n) => n.type === "attachment",
          ).length,
          1,
        );
        assert.equal(f.counts().inserts, mode === "insertThrowAfter" ? 1 : 2);
        return { failed, counts: f.counts() };
      });
    }
    await test("stored response rejected by actual bridge is recovered by query of the same operation", async () => {
      const f = fixture({
          afterStore: () => bridge.invalidateAccessRequests(),
        }),
        ticket = f.open();
      await f.props(ticket).onDone(f.result);
      assert.equal(f.counts().stores, 1);
      assert.equal(f.counts().queries, 1);
      assert.equal(f.counts().inserts, 1);
      return { counts: f.counts() };
    });
    await test("other overlays and stale ticket cannot obtain the own-recording exemption", async () => {
      const f = fixture(),
        ticket = f.open();
      f.env.modal = "settings";
      f.render();
      const failed = await outcome(f.props(ticket).onDone(f.result));
      assert.equal(failed.success, false);
      assert.equal(f.counts().stores, 0);
      f.env.modal = null;
      f.render();
      await f.api.cancelRecording(ticket);
      const next = f.open();
      assert.notEqual(ticket, next);
      const late = await outcome(f.props(ticket).onDone(f.result));
      assert.equal(late.success, false);
      assert.equal(f.env.recordingTicket.current, next);
      assert.equal(f.counts().stores, 0);
      await f.api.cancelRecording(next);
      return { failed, late, counts: f.counts() };
    });
    for (const change of ["note", "editor", "epoch"]) {
      await test(`late store after original ${change} changes cannot insert or retarget`, async () => {
        const storeWait = deferred(),
          f = fixture({ storeWait }),
          ticket = f.open(),
          pending = outcome(f.props(ticket).onDone(f.result));
        await until(() => f.counts().stores === 1, "store pending");
        if (change === "note") {
          f.env.noteId = "note-b";
          f.env.nativeScope = "scope-b";
          f.env.current = f.backend.notes[1];
          f.render();
          f.targetChanged();
        }
        if (change === "editor") {
          f.editor.isDestroyed = true;
          f.targetChanged();
        }
        if (change === "epoch")
          bridge.accessGate.invalidate({
            ...bridge.accessGate.state,
            epoch: 5,
            notes: {
              ...bridge.accessGate.state.notes,
              "note-a": { epoch: 8, authorized: true },
            },
          });
        storeWait.resolve();
        const failed = await pending;
        assert.equal(failed.success, false);
        assert.equal(f.counts().inserts, 0);
        assert.equal(f.backend.notes[1].revision, 0);
        assert.equal(f.counts().journal, 1);
        return { failed, counts: f.counts() };
      });
    }
    await test("cancel during actual FileReader seals before waiting and retains ownership for store then cancel", async () => {
      const f = fixture({ holdReader: true }),
        ticket = f.open(),
        pending = outcome(f.props(ticket).onDone(f.result));
      await until(() => f.readers.length === 1, "FileReader started");
      const cancelling = f.api.cancelRecording(ticket);
      let ended = false;
      cancelling.finally(() => {
        ended = true;
      });
      assert.equal(ticket.accepting, false);
      assert.equal(f.env.record, false);
      assert.equal(f.env.recordingTicket.current, ticket);
      assert.equal(f.counts().cancels, 0);
      assert.equal(ended, false);
      f.readers[0].complete();
      assert.equal((await pending).success, false);
      await cancelling;
      assert.deepEqual(
        f.calls
          .filter((c) => c.command.includes("attachment_operation"))
          .map((c) => c.command),
        ["store_attachment_operation", "cancel_attachment_operation"],
      );
      assert.equal(f.counts().journal, 0);
      assert.equal(f.counts().active, false);
      assert.equal(f.counts().inserts, 0);
      return { counts: f.counts() };
    });
    await test("actual Panel cancel callback hides sealed Panel and deferred cancellation stays recoverable", async () => {
      const storeWait = deferred(),
        f = fixture({ storeWait, cancelDeferred: true }),
        ticket = f.open(),
        props = f.props(ticket),
        pending = outcome(props.onDone(f.result));
      await until(() => f.counts().stores === 1, "store pending");
      props.onCancel();
      assert.equal(f.env.record, false);
      assert.equal(ticket.accepting, false);
      storeWait.resolve();
      await pending;
      await until(
        () => f.env.error.includes("保留待恢复"),
        "actual onCancel reports deferred error",
      );
      assert.equal(f.counts().submissions, 1);
      assert.equal(f.counts().active, true);
      assert.throws(() => f.api.openRecording(), /尚未核定/);
      f.options.cancelDeferred = false;
      await f.api.retryAttachments();
      assert.equal(f.counts().journal, 0);
      assert.equal(f.counts().active, false);
      return { counts: f.counts() };
    });
    await test("actual Android Back prevents late store insertion and preserves cancellation identity", async () => {
      const storeWait = deferred(),
        f = fixture({ storeWait }),
        ticket = f.open(),
        pending = outcome(f.props(ticket).onDone(f.result));
      await until(() => f.counts().stores === 1, "store pending");
      f.env.androidBack.current();
      assert.equal(f.env.record, false);
      assert.equal(ticket.accepting, false);
      storeWait.resolve();
      await pending;
      await until(
        () => !f.env.recordingTicket.current,
        "Back cancellation settled",
      );
      assert.equal(f.counts().inserts, 0);
      assert.equal(f.counts().journal, 0);
      return { counts: f.counts() };
    });
    await test("cancel with pending local reference preserves attachment then global retry obtains body ACK", async () => {
      const f = fixture({ saveFailures: 2 }),
        ticket = f.open();
      assert.equal(
        (await outcome(f.props(ticket).onDone(f.result))).success,
        false,
      );
      assert.equal(f.counts().inserts, 1);
      const failed = await outcome(f.api.cancelRecording(ticket));
      assert.equal(failed.success, false);
      assert.match(failed.message, /待保存正文/);
      assert.equal(f.counts().cancels, 0);
      assert.equal(f.counts().journal, 1);
      assert.equal(f.env.pendingDocs.current.size, 1);
      assert.equal(f.env.record, false);
      await f.api.retryAttachments();
      assert.equal(f.backend.notes[0].revision, 1);
      assert.equal(f.counts().stores, 1);
      assert.equal(f.counts().inserts, 1);
      assert.equal(f.counts().active, false);
      return { failed, counts: f.counts() };
    });
    await test("access suspension seals admission synchronously; late store cannot insert or cancel under other authority", async () => {
      const storeWait = deferred(),
        f = fixture({ storeWait }),
        ticket = f.open(),
        pending = outcome(f.props(ticket).onDone(f.result));
      await until(() => f.counts().stores === 1, "store pending");
      f.backend.access.operationId = "shield";
      f.backend.access.suspended = ["note-a"];
      bridge.accessGate.invalidate(f.backend.access);
      f.env.recordingLifecycle.current.suspend(["note-a"]);
      f.env.blockedNotes.current.add("note-a");
      storeWait.resolve();
      await pending;
      await until(() => !!f.env.error, "suspension cancellation reports error");
      assert.equal(ticket.accepting, false);
      assert.equal(f.counts().inserts, 0);
      assert.equal(f.counts().journal, 1);
      assert.equal(f.counts().cancels, 0);
      return { counts: f.counts() };
    });
    await test("existing close listener waits for pending recording body ACK and idle window remains unblocked", async () => {
      const f = fixture({ saveFailures: 2 }),
        ticket = f.open();
      await outcome(f.props(ticket).onDone(f.result));
      const cleanup = f.mountClose();
      let prevented = 0;
      await f.closeHandler({
        preventDefault: () => {
          prevented++;
        },
      });
      assert.equal(prevented, 1);
      assert.equal(f.destroyed, 1);
      assert.equal(f.backend.notes[0].revision, 1);
      cleanup();
      const idle = fixture();
      idle.mountClose();
      let idlePrevented = 0;
      await idle.closeHandler({
        preventDefault: () => {
          idlePrevented++;
        },
      });
      assert.equal(idlePrevented, 0);
      const storeWait = deferred(),
        waiting = fixture({ storeWait });
      const waitingTicket = waiting.open(),
        submitted = outcome(
          waiting.props(waitingTicket).onDone(waiting.result),
        );
      waiting.mountClose();
      await until(
        () => waiting.counts().stores === 1,
        "close while actual store is waiting",
      );
      let waitingPrevented = 0;
      const closed = waiting.closeHandler({
        preventDefault: () => {
          waitingPrevented++;
        },
      });
      assert.equal(waiting.destroyed, 0);
      assert.equal(waitingTicket.accepting, false);
      storeWait.resolve();
      assert.equal((await submitted).success, false);
      await closed;
      assert.equal(waitingPrevented, 1);
      assert.equal(waiting.destroyed, 1);
      assert.equal(waiting.counts().inserts, 0);
      assert.equal(waiting.counts().journal, 0);
      return {
        prevented,
        destroyed: f.destroyed,
        idlePrevented,
        counts: f.counts(),
      };
    });
    await test("existing effect cleanup seals detached recording against late FileReader/store completion", async () => {
      const f = fixture({ holdReader: true }),
        ticket = f.open(),
        cleanup = f.mountClose(),
        pending = outcome(f.props(ticket).onDone(f.result));
      await until(() => f.readers.length === 1, "reader waiting");
      cleanup();
      assert.equal(ticket.accepting, false);
      assert.equal(ticket.detached, true);
      f.readers[0].complete();
      assert.equal((await pending).success, false);
      assert.equal(f.counts().inserts, 0);
      assert.equal(f.counts().submissions, 1);
      assert.equal(f.counts().journal, 1);
      return { counts: f.counts() };
    });
  } finally {
    globalThis.FileReader = previousReader;
    delete globalThis.__attachmentBridgeBoundary;
  }
  console.log(
    JSON.stringify(
      {
        tests: results.length,
        results,
        sourceHashes: hashes,
        execution:
          "AST-extracted actual App ordinary/native entry, Panel callbacks, submit/cancel, original target validation, hydration, saveDoc/SaveQueue, retry/Back/close/unmount; production AttachmentSubmission, bridge, AccessGate, TrustedSynchronization and PM documents/bookmarks.",
        limitations: [
          "No mounted App, native window, microphone, encoded audio, Rust DB or device. FileReader, invoke/backend responses, Editor command host and React setters controlled.",
          "Final File-shaped fixture and audio payload do not establish recording validity, audibility or media playback. Actual Panel/RecordingSession are unchanged and not mounted in this parent-boundary check.",
        ],
      },
      null,
      2,
    ),
  );
}
