import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { Schema, Fragment, Slice } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";

const modules = new Map(),
  hashes = {};
async function production(path) {
  path = resolve(path);
  if (modules.has(path)) return modules.get(path).exports;
  const source = await readFile(path, "utf8");
  hashes[path.replace(process.cwd() + "/", "")] = createHash("sha256")
    .update(source)
    .digest("hex");
  let output = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replaceAll("import.meta.env.VITE_ACCESS_BOUNDARY_PROOF", '"0"');
  for (const match of [...output.matchAll(/from ["']([^"']+)["']/g)]) {
    const name = match[1];
    let url;
    if (name.startsWith(".")) {
      let file = resolve(dirname(path), name);
      if (!file.endsWith(".ts")) {
        const directory = await stat(file).then(
          (value) => value.isDirectory(),
          () => false,
        );
        file += directory ? "/index.ts" : ".ts";
      }
      await production(file);
      url = modules.get(file).url;
    } else if (name === "@tauri-apps/api/core")
      url =
        "data:text/javascript;base64," +
        Buffer.from(
          "export const isTauri=()=>true; export const invoke=(...args)=>globalThis.__ocrBoundary.invoke(...args);",
        ).toString("base64");
    else if (name === "@tauri-apps/api/event")
      url =
        "data:text/javascript;base64," +
        Buffer.from("export const listen=async()=>()=>{};").toString("base64");
    else throw Error("Unexpected runtime import " + name);
    output = output
      .replaceAll(JSON.stringify(name), JSON.stringify(url))
      .replaceAll("'" + name + "'", JSON.stringify(url));
  }
  const url =
    "data:text/javascript;base64," + Buffer.from(output).toString("base64");
  const exports = await import(url);
  modules.set(path, { exports, url });
  return exports;
}
const { OcrHost, ocrParagraphs } = await production("src/ocr-host.ts");
const { ocrNative, selectedOcrImage, MAX_OCR_IMAGE_BYTES } =
  await production("src/ocr-native.ts");
const { TrustedSynchronization } = await production(
  "src/trusted-synchronization.ts",
);
const { rebindAttachmentTarget } = await production("src/attachment-target.ts");
const { enqueueSave } = await production("src/save-queue.ts");
const { SaveRevisions } = await production("src/save-revisions.ts");
const { documentsEqual } = await production("src/document-equality.ts");
const { documentText } = await production("src/types.ts");
const bridge = await production("src/bridge.ts");
const source = await readFile("src/App.tsx", "utf8");
hashes["src/App.tsx"] = createHash("sha256").update(source).digest("hex");
const ast = ts.createSourceFile(
    "App.tsx",
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  ),
  nodes = [];
function visit(n) {
  nodes.push(n);
  ts.forEachChild(n, visit);
}
visit(ast);
const unique = (values, label) => {
  assert.equal(values.length, 1, label);
  return values[0];
};
const declaration = (name) =>
  unique(
    nodes.filter(
      (n) => ts.isVariableDeclaration(n) && n.name.getText(ast) === name,
    ),
    name,
  );
const assignment = (name) =>
  unique(
    nodes.filter(
      (n) =>
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        n.left.getText(ast) === name,
    ),
    name,
  ).getText(ast) + ";";
const execute = (code, env) =>
  Function(
    "env",
    `with(env){${ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText}}`,
  )(env);
const closeEffect = unique(
  nodes.filter(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "useEffect" &&
      node.arguments[0]?.getText(ast).includes(".onCloseRequested"),
  ),
  "single close owner",
).arguments[0];
const targetEffect = unique(
  nodes.filter(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "useEffect" &&
      node.arguments[0]
        ?.getText(ast)
        .includes("operation.target.scope !== pickerRuntime.current.scope"),
  ),
  "OCR target effect",
).arguments[0];
const names = [
  "fail",
  "hydrate",
  "flush",
  "refresh",
  "saveDoc",
  "validatePickerTarget",
  "capturePickerTarget",
  "finishOcr",
  "cancelOcr",
  "retryOcr",
  "confirmOcr",
  "awaitOcrDocumentAck",
  "openOcr",
  "processOcr",
  "nativeSelection",
];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = async () => {
  for (let i = 0; i < 150; i++) await Promise.resolve();
};
const checks = [];
const test = async (name, run) => {
  await run();
  checks.push(name);
};
function fixture(options = {}) {
  const access = {
    sessionId: "process-ocr",
    epoch: 4,
    notes: {
      a: { epoch: 3, authorized: true },
      b: { epoch: 2, authorized: true },
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
    },
  });
  const initial = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "prefixsuffix" }] },
    ],
  };
  const backend = {
    notes: ["a", "b"].map((id) => ({
      id,
      document: structuredClone(initial),
      revision: 0,
      locked: false,
      deletedAt: null,
    })),
    attachments: [],
    folders: [],
    settings: {},
    access,
  };
  const calls = [],
    sessions = new Map();
  let api,
    closed = 0,
    sessionCount = 0;
  const env = {
    ...bridge,
    OcrHost,
    ocrParagraphs,
    ocrNative,
    Fragment,
    Slice,
    TrustedSynchronization,
    rebindAttachmentTarget,
    enqueueSave,
    documentsEqual,
    documentText,
    secureId: () => `operation-${++env.ids}`,
    ids: 0,
    errText: (e) => e.message,
    useCallback: (fn) => fn,
    queues: { current: new Map() },
    pendingDocs: { current: new Map() },
    saveFailures: { current: new Map() },
    revisions: { current: new SaveRevisions() },
    externalVersions: { current: new Map() },
    blockedNotes: { current: new Set() },
    attachmentSubmissions: { current: new Map() },
    ocrOperation: { current: null },
    ocr: null,
    ocrState: null,
    recordingTicket: { current: null },
    recordingLifecycle: {
      current: { active: () => false, close: async () => {}, detach() {} },
    },
    ocrLifecycle: { current: null },
    nativeEditorOwners: { current: new WeakMap() },
    nativeDocumentVersions: { current: new WeakMap() },
    pickerRuntime: { current: null },
    wsRef: { current: structuredClone(backend) },
    synchronization: new TrustedSynchronization(),
    synchronizeRef: { current: null },
    synchronizingRef: { current: false },
    initializedSelection: { current: true },
    clearSensitive: { current: () => assert.fail("unexpected access clear") },
    nativeAssert: { current: null },
    nativeHandler: { current: null },
    androidBack: { current: null },
    native: true,
    nativeScope: "scope",
    noteId: "a",
    page: "editor",
    mobile: true,
    loading: false,
    synchronizing: false,
    accessSuspended: [],
    draw: null,
    record: false,
    modal: null,
    menu: "media",
    showFind: false,
    searching: false,
    view: "list",
    galleryEditor: false,
    separate: null,
    current: backend.notes[0],
    ws: structuredClone(backend),
    saving: 0,
    error: "",
    dispatches: 0,
    setWs: (v) => {
      env.ws = typeof v === "function" ? v(env.ws) : v;
    },
    setError: (v) => {
      env.error = v;
    },
    setSaving: (v) => {
      env.saving = typeof v === "function" ? v(env.saving) : v;
    },
    setSettings() {},
    setSynchronizing: (v) => {
      env.synchronizing = v;
    },
    setSyncError() {},
    setAccessSuspended: (v) => {
      env.accessSuspended = v;
    },
    setWorkspaceLoaded() {},
    setMenu: (v) => {
      env.menu = v;
    },
    setOcr: (v) => {
      env.ocr = v;
      render();
    },
    setOcrState: (v) => {
      env.ocrState = v;
    },
    setEditing() {},
    setRecord: (v) => {
      env.record = v;
    },
    setModal: (v) => {
      env.modal = v;
    },
    setSearching() {},
    setQuery() {},
    setFilter() {},
    setNativeSearchAck() {},
    getCurrentWindow: () => ({
      onCloseRequested: async (fn) => {
        env.closeHandler = fn;
        return () => {};
      },
      destroy: async () => {
        closed++;
      },
    }),
    document: { addEventListener() {}, removeEventListener() {} },
  };
  const editor = {
    isDestroyed: false,
    isEditable: true,
    schema,
    state: EditorState.create({
      schema,
      doc: schema.nodeFromJSON(initial),
      plugins: [history()],
    }),
    commands: { blur() {} },
    getJSON: () => editor.state.doc.toJSON(),
    view: {
      dispatch: (tr) => {
        if (options.throwBefore) throw Error("dispatch before");
        editor.state = editor.state.apply(tr);
        if (tr.docChanged) {
          env.dispatches++;
          env.nativeDocumentVersions.current.set(
            editor,
            (env.nativeDocumentVersions.current.get(editor) || 0) + 1,
          );
          void api.saveDoc("a", editor.getJSON());
        }
        if (options.throwAfter && tr.docChanged) throw Error("dispatch after");
      },
    },
  };
  editor.state = editor.state.apply(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 7)),
  );
  env.editor = editor;
  env.nativeEditorOwners.current.set(editor, "a");
  env.nativeDocumentVersions.current.set(editor, 0);
  function render() {
    execute(
      `const attachmentBaseAvailable=${declaration("attachmentBaseAvailable").initializer.getText(ast)};const pickerBaseAvailable=${declaration("pickerBaseAvailable").initializer.getText(ast)};${assignment("pickerRuntime.current")}`,
      env,
    );
  }
  globalThis.FileReader = class {
    readAsDataURL(file) {
      if (options.readerFailure) {
        queueMicrotask(() => this.onerror());
        return;
      }
      void file.arrayBuffer().then((bytes) => {
        this.result = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
        this.onload();
      });
    }
  };
  globalThis.__ocrBoundary = {
    invoke: async (command, args) => {
      calls.push({
        command,
        operation: args?.request?.operation,
        noteId: args?.action?.id,
        sessionId: args?.request?.sessionId,
      });
      if (command === "load_workspace") {
        if (options.syncFailure) throw Error("sync failed");
        return structuredClone(backend);
      }
      if (command === "register_save_intent") return;
      if (command === "workspace_action") {
        assert.equal(args.action.type, "saveNote");
        if (options.saveWait) await options.saveWait.promise;
        if (options.saveFailures > 0) {
          options.saveFailures--;
          throw Error("body save failed");
        }
        const row = backend.notes.find((n) => n.id === args.action.id);
        row.document = structuredClone(args.action.document);
        row.revision++;
        return { ...structuredClone(row), access };
      }
      assert.equal(command, "plugin:notes-scan|execute");
      const r = args.request;
      if (r.operation === "begin") {
        const value = {
          version: 1,
          sessionId: `native-session-${++sessionCount}`,
          mode: r.mode,
          state: "draft",
          createdAt: 0,
          updatedAt: 0,
          files: [],
          pages: [],
          ocr: null,
          pdfToken: null,
        };
        sessions.set(value.sessionId, value);
        return structuredClone(value);
      }
      const s = sessions.get(r.sessionId);
      if (!s) throw { code: "session_missing", message: "session missing" };
      if (r.operation === "get") return structuredClone(s);
      if (["pickImage", "ingestImage", "openCamera"].includes(r.operation)) {
        if (options.selectionWait) await options.selectionWait.promise;
        if (options.selectionCancelled) {
          options.selectionCancelled = false;
          if (r.operation === "openCamera") sessions.delete(r.sessionId);
          throw { code: "cancelled", message: "selection cancelled" };
        }
        if (r.operation === "ingestImage")
          assert.equal(
            r.data,
            Buffer.from("user-selected-image").toString("base64"),
          );
        s.files = [
          {
            token: "image-token",
            mime: "image/png",
            size: 20,
            width: 300,
            height: 300,
          },
        ];
        if (r.operation === "openCamera") {
          s.state = "ready";
          s.ocr = {
            status: options.empty ? "empty" : "recognized",
            text: options.empty
              ? ""
              : (options.text ?? "第一行\n\n第二行<script>"),
          };
        }
        return structuredClone(s);
      }
      if (r.operation === "recognize") {
        if (options.recognizeWait) await options.recognizeWait.promise;
        if (options.nativeFailure)
          throw { code: "ocr_failed", message: "native OCR failed" };
        assert.equal(r.fileToken, "image-token");
        s.ocr = {
          status: options.empty ? "empty" : "recognized",
          text: options.empty
            ? ""
            : (options.text ?? "第一行\n\n第二行<script>"),
        };
        return structuredClone(s);
      }
      if (r.operation === "finish") {
        assert.equal(s.state, "draft");
        s.state = "ready";
        return structuredClone(s);
      }
      if (r.operation === "acknowledge") {
        assert.ok(
          backend.notes[0].revision > 0,
          "no native ack before actual body ACK",
        );
        if (options.cleanupFailures > 0) {
          options.cleanupFailures--;
          throw { code: "cleanup_failed", message: "cleanup failed" };
        }
        sessions.delete(r.sessionId);
        return { removed: true };
      }
      if (r.operation === "cancel") {
        sessions.delete(r.sessionId);
        return { removed: true };
      }
      throw Error("unexpected native operation " + r.operation);
    },
  };
  render();
  api = execute(
    [
      ...names.map(
        (n) => `const ${n}=${declaration(n).initializer.getText(ast)};`,
      ),
      assignment("synchronizeRef.current"),
      assignment("ocrLifecycle.current"),
      assignment("nativeAssert.current"),
      assignment("nativeHandler.current"),
      assignment("androidBack.current"),
      `return {${names.join(",")}};`,
    ].join("\n"),
    env,
  );
  Object.assign(env, api);
  const sourceFile = new File(["user-selected-image"], "selected.png", {
    type: "image/png",
  });
  return {
    env,
    api,
    editor,
    backend,
    calls,
    sessions,
    options,
    render,
    sourceFile,
    mountClose: () =>
      execute("return (" + closeEffect.getText(ast) + ")();", env),
    targetChanged: () => execute("(" + targetEffect.getText(ast) + ")();", env),
    get closed() {
      return closed;
    },
    open(nativeEntry = false) {
      if (nativeEntry) {
        env.menu = null;
        env.nativeHandler.current(
          { kind: "menu", command: "recognizeImageText" },
          {
            noteId: "a",
            scope: env.nativeScope,
            stamp: bridge.accessGate.stamp("a"),
            editor,
            bookmark: editor.state.selection.getBookmark(),
            documentVersion:
              env.nativeDocumentVersions.current.get(editor) || 0,
          },
          1,
        );
      } else api.openOcr();
      return env.ocrOperation.current;
    },
    async recognized(kind = "image") {
      const op = this.open();
      await op.process(kind === "file" ? { kind, file: sourceFile } : { kind });
      assert.equal(op.state.phase, "recognized");
      return op;
    },
  };
}

// Independent companion to the active-operation invalidation failure.
const f = fixture({text: "合成已完成OCR文字-ACCESS-REVOKE"});
const op = await f.recognized();
await f.api.confirmOcr(op);
assert.equal(f.env.ocrOperation.current, null);
assert.equal(f.env.ocr, null);
f.env.ocrLifecycle.current.suspend(["a"]);
await flush();
console.log(JSON.stringify({
  case: "completed OCR has no owner left for later target suspension, but preview cache must be erased",
  scope: "Actual App confirm/finish/suspend closures, actual SaveQueue and controlled DB/native replies; no real lock/device",
  documentAck: op.documentAck,
  cleaned: op.cleaned,
  currentOperation: f.env.ocrOperation.current,
  visiblePanel: f.env.ocr !== null,
  nativeSessions: f.sessions.size,
  retainedReactOcrState: f.env.ocrState,
},null,2));
assert.equal(f.env.ocrState.text, "", "completed OCR preview must be cleared before its target ownership disappears");
