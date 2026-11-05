import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { pathToFileURL } from "node:url";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, redo, closeHistory } from "@tiptap/pm/history";

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
    "attachment-submission",
    "metadata-client",
    "smart-folders",
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
const { RecordingOwner } = await production("recording-coordinator");
const { RecordingRevisions } = await production("recording-revisions");
const { replaceRecordingAttachment, recordingAttachmentReferencedOnce } = await production("recording-replacement");
const { SearchEditorGate } = await production("search-editor-gate");
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
const transactionChanged = unique(
  nodes.filter(
    (node) =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(ast) === "changed" &&
      node.initializer?.getText(ast).includes("ticket?.desktop"),
  ),
  "original recording transaction mapping",
);
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
  "validateRecordingTarget",
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
  "submitRecordingRevision",
  "openRecording",
  "nativeSelection",
  "restoreEditor",
  "createNote",
  "formatCommand",
  "openSeparate",
  "onReady",
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
const quitEffect = unique(
  nodes.filter(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "useEffect" &&
      node.arguments[0]?.getText(ast).includes('"recording_quit_ack"'),
  ),
  "recording Quit effect",
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
let fixtureSerial = 0;
export function fixture(options = {}) {
  const [NOTE_A, NOTE_B] = options.noteIds || ["note-a", "note-b"];
  const access = options.backend?.access || {
    sessionId: `recording-session-${++fixtureSerial}`,
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
  backend.metadata ??= { sessionId: access.sessionId, sequence: 0 };
  const tagged = (value) => ({
    ...value,
    metadata: structuredClone(backend.metadata),
  });
  const journal = new Map(),
    calls = [],
    readers = [];
  let closeHandler,
    destroyed = 0,
    hidden = 0,
    focused = 0,
    api;
  let openedWindows = 0;
  const recordingMessages = [];
  const quitAcks = [];
  let quitHandler, quitCancelled;
  let mappedTransaction;
  const env = {
    RecordingRevisions,
    replaceRecordingAttachment,
    recordingAttachmentReferencedOnce,
    AttachmentSubmission,
    attachmentRecordedAt,
    documentReferencesAttachment,
    TrustedSynchronization,
    rebindAttachmentTarget: (target, live) => {
      try {
        return rebindAttachmentTarget(target, live);
      } catch (error) {
        if (options.debug)
          console.error(
            JSON.stringify(
              { stage: "target-check", target, live },
              (_key, value) => (value === editor ? "EDITOR" : value),
            ),
          );
        throw error;
      }
    },
    enqueueSave,
    documentsEqual,
    editorSaveSnapshot,
    documentText,
    ...bridge,
    RecordingOwner,
    decodeRecordingFile: (transfer) =>
      new File([Buffer.from(transfer.data, "base64")], transfer.name, {
        type: transfer.mime,
        lastModified: transfer.lastModified,
      }),
    recordingSend: async (_identity, message) => {
      recordingMessages.push(message);
    },
    recordingListen: async () => () => {},
    invoke: async (command, params) => {
      if (command === "recording_quit_ack") {
        quitAcks.push(params);
        return;
      }
      if (command === "register_recording_window")
        return {
          ...params,
          owner: "main",
          child: `recording-${params.sessionId}`,
        };
      if (command === "recording_window_abandon") return;
      throw Error(`unexpected recording host command ${command}`);
    },
    WebviewWindow: class {
      constructor() { openedWindows++; }
      async once(event, callback) {
        if (event === "tauri://created") queueMicrotask(callback);
        return () => {};
      }
    },
    mountRecordingCard: () => ({ update() {}, persisted() {}, dispose() {} }),
    secureId: options.secureId || (() => `operation-${++env.ids}`),
    ids: 0,
    errText: (error) => error.message,
    useCallback: (fn) => fn,
    quitState: { current: null },
    quitPending: false,
    setQuitPending: (value) => { env.quitPending = value; render(); },
    appSurface: { current: { inert: false, setAttribute() { this.inert = true; }, removeAttribute() { this.inert = false; } } },
    editorGate: new SearchEditorGate(),
    tagCompositions: { current: new Map() },
    folderId: "default",
    updateSettings: () => {},
    clearTagComposition: () => {},
    formatTarget: { current: null },
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
    recordingPanel: { current: null },
    editorsRef: { current: new Map() },
    updateRecordingOwner: () => {},
    recordingLifecycle: { current: null },
    pickerTargets: { current: new Map() },
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
    initializedSelection: { current: true },
    metadataRefreshRef: { current: async () => {} },
    ownsSidebarPreference: false,
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
    mobile: !options.desktop,
    loading: false,
    synchronizing: false,
    syncError: "",
    accessSuspended: [],
    draw: null,
    record: false,
    ocr: null,
    modal: null,
    folderForm: null,
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
    setEditors: (update) => { env.editorsRef.current = update(env.editorsRef.current); },
    setEditing: () => {},
    setShowFind: () => {},
    document: {
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    getCurrentWindow: () => ({
      listen: async (name, handler) => {
        if (name === "notes-recording-quit") quitHandler = handler;
        if (name === "notes-recording-quit-cancelled") quitCancelled = handler;
        return () => {};
      },
      onCloseRequested: async (fn) => {
        closeHandler = fn;
        return () => {};
      },
      destroy: async () => {
        destroyed++;
      },
      hide: async () => {
        hidden++;
      },
      show: async () => {},
      setFocus: async () => {
        focused++;
      },
    }),
    flushFail: false,
  };
  const editor = {
    isDestroyed: false,
    isEditable: true,
    setEditable(value) { this.isEditable = value; },
    state: EditorState.create({
      schema,
      doc: schema.nodeFromJSON(initial),
      plugins: [history()],
    }),
    getJSON: () => editor.state.doc.toJSON(),
    view: {
      composing: false,
      dispatch: (tr) => {
        editor.state = editor.state.apply(tr);
        mappedTransaction?.({ transaction: tr });
        if (tr.docChanged) void api.saveDoc(NOTE_A, editor.getJSON());
      },
    },
    chain: () => {
      let content;
      const chain = {
        focus: () => {
          focused++;
          return chain;
        },
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
  editor.commands = {
    insertContentAt(range, node, config) {
      assert.equal(config.updateSelection, false);
      env.insertCalls++;
      const tr = editor.state.tr.replaceRangeWith(
        range.from,
        range.to,
        schema.nodeFromJSON(node),
      );
      editor.view.dispatch(tr);
      return true;
    },
  };
  env.editorsRef.current.set(NOTE_A, editor);
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
      this.result = `data:${this.file.type};base64,${Buffer.from(await this.file.arrayBuffer()).toString("base64")}`;
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
        assert.equal(params.action.revision, row.revision, "real revision CAS boundary");
        row.revision++;
        backend.metadata.sequence++;
        return tagged({ ...structuredClone(row), access });
      }
      if (command === "store_attachment_operation") {
        if (options.storeWait) await options.storeWait.promise;
        const attachment = {
          id: "audio-" + params.operationId,
          noteId: params.noteId,
          kind: "audio",
          displayName: params.name,
          mime: params.mime,
          size: Buffer.from(params.data,"base64").length,
          relativePath: "controlled/" + params.operationId + ".wav",
          ...(params.recordedAt === undefined
            ? {}
            : { recordedAt: params.recordedAt }),
        };
        backend.metadata.sequence++;
        const result = {
          metadata: structuredClone(backend.metadata),
          operationId: params.operationId,
          noteId: params.noteId,
          status: "stored",
          attachment,
          access,
        };
        journal.set(params.operationId, result);
        backend.attachments.push(attachment);
        if (options.afterStore) options.afterStore(env);
        if (options.rejectStore) {
          options.rejectStore = false;
          throw Error("stored but response lost");
        }
        return structuredClone(result);
      }
      if (command === "query_attachment_operation") {
        if(options.queryWait) await options.queryWait.promise;
        if(options.queryFailure) throw Error("controlled query failure");
        const op=journal.get(params.operationId);
        if(op && backend.notes.some(n=>n.id===op.noteId && documentReferencesAttachment(n.document,op.attachment))) op.status="committed";
        options.afterQuery?.(env,op);
        return structuredClone(
          tagged(
            journal.get(params.operationId) || {
              operationId: params.operationId,
              noteId: params.noteId,
              status: "notPersisted",
              access,
            },
          ),
        );
      }
      if (command === "cancel_attachment_operation") {
        if (options.cancelDeferred)
          return tagged({
            operationId: params.operationId,
            noteId: params.noteId,
            status: "deferred",
            reason: "save_pending",
            access,
          });
        const stored = journal.get(params.operationId);
        if (stored?.status === "committed")
          return tagged(structuredClone(stored));
        const status = journal.delete(params.operationId)
          ? "aborted"
          : "notPersisted";
        return tagged({
          operationId: params.operationId,
          noteId: params.noteId,
          status,
          access,
        });
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
  mappedTransaction = execute(
    `return (${transactionChanged.initializer.getText(ast)});`,
    { ...env, instance: editor },
  );
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
      `return {onDone: ${panelAttribute("onDone").getText(ast)}, onCancel: ${panelAttribute("onCancel").getText(ast)}, onHandle: ${panelAttribute("onHandle").getText(ast)}};`,
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
    recordingMessages,
    get hidden() {
      return hidden;
    },
    get openedWindows() { return openedWindows; },
    get focused() {
      return focused;
    },
    editSource(text) {
      const tr = closeHistory(editor.state.tr).insertText(text, 1);
      editor.view.dispatch(tr);
      return api.saveDoc(NOTE_A, editor.getJSON());
    },
    undoSource() {
      assert(undo(editor.state, editor.view.dispatch));
      return api.saveDoc(NOTE_A, editor.getJSON());
    },
    redoSource() {
      assert(redo(editor.state, editor.view.dispatch));
      return api.saveDoc(NOTE_A, editor.getJSON());
    },
    mountClose,
    mountQuit: () =>
      execute(`return (${quitEffect.arguments[0].getText(ast)})();`, {
        ...env,
        ...api,
      }),
    quitAcks,
    get quitHandler() {
      return quitHandler;
    },
    cancelQuit: (id) => quitCancelled({payload:{id}}),
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