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
const { editorSaveSnapshot } = await production("src/editor-save-snapshot.ts");
const { tagSelectionAfterAccess } = await production("src/note-tags.ts");
const { documentText } = await production("src/types.ts");
const { shouldClearSearchAfterAccessChange } = await production(
  "src/search-selection.ts",
);
const { SearchEditorGate } = await production("src/search-editor-gate.ts");
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
  "clearTagComposition",
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
  "restoreEditor",
  "retryAttachments",
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
    editorSaveSnapshot,
    tagSelectionAfterAccess,
    documentText,
    shouldClearSearchAfterAccessChange,
    editorGate: new SearchEditorGate(),
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
    tagCompositionTarget: { current: null },
    tagCompositionNavigation: { current: 0 },
    updateTagComposition() {},
    attachmentSubmissions: { current: new Map() },
    attachmentBatches: { current: [] },
    pickerTargets: { current: new Map() },
    nativeToolbar: { current: null },
    barrierEditor: { current: null },
    formatTarget: { current: null },
    paperTarget: { current: null },
    accessHandler: { current: null },
    blankDoc: { type: "doc", content: [{ type: "paragraph" }] },
    desktopSearch: false,
    filter: "",
    tagFilter: undefined,
    ocrOperation: { current: null },
    ocr: null,
    ocrState: null,
    recordingTicket: { current: null },
    recordingLifecycle: {
      current: {
        active: () => false,
        close: async () => {},
        detach() {},
        suspend() {},
      },
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
    setTagFilter(value) {
      env.tagFilter =
        typeof value === "function" ? value(env.tagFilter) : value;
    },
    setNativeSearchAck() {},
    setModalValue() {},
    setDraw() {},
    setShowFind() {},
    setFind() {},
    setContextNote() {},
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
    setEditable(value) {
      editor.isEditable = value;
    },
    destroy() {
      editor.isDestroyed = true;
    },
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
  env.editorsRef = { current: new Map([["a", editor]]) };
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
      if (command === "acknowledge_access") {
        calls.at(-1).success = args.success;
        return;
      }
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
        if (options.cancelWait) await options.cancelWait.promise;
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
    mountAccess: () =>
      execute(
        assignment("clearSensitive.current") +
          assignment("accessHandler.current"),
        env,
      ),
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
await test("ordinary/native entries freeze same original target, selection and operation, disable generic picker", async () => {
  for (const nativeEntry of [false, true]) {
    const f = fixture(),
      op = f.open(nativeEntry);
    assert.equal(op.target.noteId, "a");
    assert.equal(op.target.editor, f.editor);
    assert.equal(op.target.bookmark.resolve(f.editor.state.doc).from, 7);
    assert.equal(op.operationId, "operation-1");
    assert.throws(() => f.api.capturePickerTarget(), /不可添加附件/);
    await f.api.cancelOcr();
    assert.equal(f.env.ocrOperation.current, null);
  }
});
await test("actual typed guest Mac selected image, Android picker, and ready camera paths preserve real text; camera does not finish twice", async () => {
  for (const kind of ["file", "image", "camera"]) {
    const f = fixture(),
      op = await f.recognized(kind);
    assert.equal(op.state.text, "第一行\n\n第二行<script>");
    assert.equal(
      f.calls.filter((c) => c.operation === "finish").length,
      kind === "camera" ? 0 : 1,
    );
    await f.api.cancelOcr();
    assert.equal(f.sessions.size, 0);
  }
});
await test("actual PM insertion is one transaction with blank lines and literal text; waits body ACK before native cleanup", async () => {
  const wait = deferred(),
    f = fixture({ saveWait: wait }),
    op = await f.recognized();
  const first = op.confirm(),
    same = op.confirm();
  assert.equal(first, same);
  await flush();
  assert.equal(f.env.dispatches, 1);
  assert.equal(op.documentAck, false);
  assert.equal(f.calls.filter((c) => c.operation === "acknowledge").length, 0);
  wait.resolve();
  await first;
  assert.equal(op.documentAck, true);
  assert.equal(op.cleaned, true);
  assert.equal(f.env.dispatches, 1);
  assert.match(
    documentText(f.backend.notes[0].document),
    /第一行\n\n第二行<script>/,
  );
  assert.ok(documentsEqual(f.editor.getJSON(), f.backend.notes[0].document));
});
await test("failed body save retries same operation/result and exact pending body without reinsertion", async () => {
  const f = fixture({ saveFailures: 3 }),
    op = await f.recognized();
  await assert.rejects(f.api.confirmOcr(op), /body save failed/);
  assert.equal(op.documentAck, false);
  assert.ok(op.insertedDocument);
  assert.equal(f.sessions.size, 1);
  const target = op.target;
  f.options.saveFailures = 0;
  await f.api.confirmOcr(op);
  assert.equal(op.target, target);
  assert.equal(f.env.dispatches, 1);
  assert.equal(f.env.ocrOperation.current, null);
  assert.equal(f.backend.notes[0].revision, 1);
});
await test("cleanup failure is saved separately and retry never inserts or saves again", async () => {
  const f = fixture({ cleanupFailures: 1 }),
    op = await f.recognized();
  await assert.rejects(
    f.api.confirmOcr(op),
    (error) => error.message === "cleanup failed",
  );
  assert.equal(op.documentAck, true);
  assert.equal(op.state.phase, "cleanup-pending");
  const saves = f.calls.filter((c) => c.command === "workspace_action").length;
  await f.api.confirmOcr(op);
  assert.equal(f.env.dispatches, 1);
  assert.equal(
    f.calls.filter((c) => c.command === "workspace_action").length,
    saves,
  );
  assert.equal(f.sessions.size, 0);
});
for (const kind of ["empty", "nativeFailure"])
  await test(kind + " is explicit and never inserts a fake node", async () => {
    const f = fixture({ [kind]: true }),
      op = f.open();
    await op.process({ kind: "image" });
    assert.equal(op.state.phase, kind === "empty" ? "empty" : "failed");
    await assert.rejects(op.confirm());
    assert.equal(f.env.dispatches, 0);
    await f.api.cancelOcr();
    assert.equal(f.sessions.size, 0);
  });
for (const kind of ["image", "camera"])
  await test(
    kind +
      " selection cancellation is distinct and can retry without leaking native sessions",
    async () => {
      const f = fixture({ selectionCancelled: true }),
        op = f.open();
      await op.process({ kind });
      assert.equal(op.state.phase, "choose");
      assert.match(op.state.error, /cancelled/);
      await op.process({ kind });
      assert.equal(op.state.phase, "recognized");
      await f.api.cancelOcr();
      assert.equal(f.sessions.size, 0);
    },
  );
for (const change of [
  "note",
  "locked",
  "document",
  "scope",
  "bookmark",
  "epoch",
  "syncFailure",
])
  await test(
    change + " target invalidation rejects late confirmation",
    async () => {
      const f = fixture(),
        op = await f.recognized();
      if (change === "note") {
        f.env.noteId = "b";
        f.env.current = f.backend.notes[1];
      }
      if (change === "locked") {
        f.backend.notes[0].locked = true;
        f.backend.access.notes.a.authorized = false;
      }
      if (change === "document") {
        f.editor.state = f.editor.state.apply(
          f.editor.state.tr.insertText("changed"),
        );
      }
      if (change === "scope") f.env.nativeScope = "other";
      if (change === "bookmark")
        op.target.bookmark = {
          resolve() {
            throw Error("bookmark invalid");
          },
        };
      if (change === "epoch") f.backend.access.notes.a.epoch++;
      if (change === "syncFailure") f.options.syncFailure = true;
      f.render();
      await assert.rejects(f.api.confirmOcr(op));
      assert.equal(f.env.dispatches, 0);
      assert.equal(
        f.calls.filter((c) => c.operation === "acknowledge").length,
        0,
      );
      await f.api.cancelOcr();
    },
  );
await test("cancel seals before pending native work, waits its terminal result, then cancels same session without insertion", async () => {
  const wait = deferred(),
    f = fixture({ recognizeWait: wait }),
    op = f.open();
  const processing = op.process({ kind: "image" });
  await flush();
  const cancelling = f.api.cancelOcr();
  assert.equal(op.accepting, false);
  assert.equal(f.calls.filter((c) => c.operation === "cancel").length, 0);
  wait.resolve();
  await Promise.all([processing, cancelling]);
  assert.equal(f.env.dispatches, 0);
  assert.equal(f.sessions.size, 0);
  await assert.rejects(op.confirm());
});
await test("cancel after insertion preserves failed pending body and original result for same save retry", async () => {
  const f = fixture({ saveFailures: 3 }),
    op = await f.recognized();
  await assert.rejects(f.api.confirmOcr(op));
  await assert.rejects(f.api.cancelOcr(), /待保存正文/);
  assert.equal(f.sessions.size, 1);
  assert.equal(f.env.dispatches, 1);
  f.options.saveFailures = 0;
  await f.api.confirmOcr(op);
  assert.equal(f.env.dispatches, 1);
  assert.equal(f.sessions.size, 0);
});
await test("dispatch throw after real mutation retains transaction identity and never reinserts", async () => {
  const f = fixture({ throwAfter: true }),
    op = await f.recognized();
  await assert.rejects(f.api.confirmOcr(op), /dispatch after/);
  assert.ok(op.insertedDocument);
  f.options.throwAfter = false;
  await f.api.confirmOcr(op);
  assert.equal(f.env.dispatches, 1);
});
await test("wrong note or wrong durable document cannot acknowledge OCR operation", async () => {
  const f = fixture({ saveFailures: 3 }),
    op = await f.recognized();
  await assert.rejects(f.api.confirmOcr(op));
  op.acknowledgeDocument("b", op.insertedDocument);
  op.acknowledgeDocument("a", {
    type: "doc",
    content: [{ type: "paragraph" }],
  });
  assert.equal(op.documentAck, false);
  f.options.saveFailures = 0;
  await f.api.confirmOcr(op);
});
await test("one actual history transaction supports Undo/Redo and persists through original queue", async () => {
  const f = fixture(),
    op = await f.recognized();
  await f.api.confirmOcr(op);
  assert.equal(undo(f.editor.state, f.editor.view.dispatch), true);
  await f.env.queues.current.get("a");
  assert.equal(documentText(f.backend.notes[0].document), "prefixsuffix");
  assert.equal(redo(f.editor.state, f.editor.view.dispatch), true);
  await f.env.queues.current.get("a");
  assert.match(
    documentText(f.backend.notes[0].document),
    /第一行\n\n第二行<script>/,
  );
});
await test("actual old selected-file callback retains its captured OCR owner and cannot feed a newer target", async () => {
  const f = fixture(),
    old = f.open();
  const callback = unique(
    nodes.filter(
      (node) =>
        ts.isJsxAttribute(node) &&
        node.name.getText(ast) === "onFile" &&
        node.parent.parent.tagName?.getText(ast) === "OcrPanel",
    ),
    "actual OCR file callback",
  ).initializer.expression;
  const onFile = execute("return (" + callback.getText(ast) + ");", {
    ...f.env,
    ocr: old,
  });
  await f.api.cancelOcr(old);
  const next = f.open();
  onFile(f.sourceFile);
  await flush();
  assert.equal(f.calls.filter((call) => call.operation === "begin").length, 0);
  assert.equal(f.env.ocrOperation.current, next);
  assert.equal(next.state.phase, "choose");
  await f.api.cancelOcr(next);
});
await test("bounded Mac File bridge rejects zero/oversize/non-image before reader or plugin invocation", async () => {
  for (const file of [
    { size: 0, type: "image/png" },
    { size: MAX_OCR_IMAGE_BYTES + 1, type: "image/png" },
    { size: 5, type: "text/plain" },
  ])
    await assert.rejects(selectedOcrImage(file));
  const f = fixture({ readerFailure: true });
  await assert.rejects(selectedOcrImage(f.sourceFile), /读取/);
});
await test("existing close owner seals OCR synchronously and awaits native completion/cleanup before destroy", async () => {
  const wait = deferred(),
    f = fixture({ recognizeWait: wait }),
    op = f.open();
  const work = op.process({ kind: "image" });
  await flush();
  const cleanup = f.mountClose();
  let prevented = 0;
  const closing = f.env.closeHandler({ preventDefault: () => prevented++ });
  assert.equal(op.accepting, false);
  assert.equal(f.closed, 0);
  wait.resolve();
  await Promise.all([work, closing]);
  assert.equal(prevented, 1);
  assert.equal(f.closed, 1);
  assert.equal(f.sessions.size, 0);
  assert.equal(f.env.dispatches, 0);
  cleanup();
});
await test("existing close owner retries same pending OCR body before cleanup; persistent failure keeps window open", async () => {
  const f = fixture({ saveFailures: 3 }),
    op = await f.recognized();
  await assert.rejects(f.api.confirmOcr(op));
  const cleanup = f.mountClose();
  await f.env.closeHandler({ preventDefault() {} });
  assert.equal(f.closed, 0);
  assert.equal(f.sessions.size, 1);
  assert.equal(f.env.dispatches, 1);
  f.options.saveFailures = 0;
  await f.env.closeHandler({ preventDefault() {} });
  assert.equal(f.closed, 1);
  assert.equal(f.sessions.size, 0);
  assert.equal(f.env.dispatches, 1);
  cleanup();
});
await test("actual target-change effect seals processing and never retargets late OCR result", async () => {
  const wait = deferred(),
    f = fixture({ recognizeWait: wait }),
    op = f.open();
  const work = op.process({ kind: "image" });
  await flush();
  f.env.noteId = "b";
  f.env.nativeScope = "scope-b";
  f.env.current = f.backend.notes[1];
  f.render();
  f.targetChanged();
  assert.equal(op.accepting, false);
  wait.resolve();
  await work;
  await flush();
  assert.equal(f.env.dispatches, 0);
  assert.equal(f.sessions.size, 0);
  assert.equal(f.env.ocrOperation.current, null);
});
await test("suspension and actual close-effect unmount seal late result and clean only original session", async () => {
  for (const action of ["suspend", "unmount"]) {
    const wait = deferred(),
      f = fixture({ recognizeWait: wait }),
      op = f.open();
    const work = op.process({ kind: "image" });
    await flush();
    if (action === "suspend") f.env.ocrLifecycle.current.suspend(["a"]);
    else {
      const cleanup = f.mountClose();
      cleanup();
    }
    assert.equal(op.accepting, false);
    assert.equal(op.detached, true);
    wait.resolve();
    await work;
    await flush();
    assert.equal(f.env.dispatches, 0);
    assert.equal(f.sessions.size, 0);
  }
});
await test("normal saved and cancelled completion erase React preview and terminal Host text before releasing owner", async () => {
  for (const saved of [false, true]) {
    const f = fixture({ text: "sensitive-terminal-text" }),
      op = await f.recognized();
    if (saved) await f.api.confirmOcr(op);
    else await f.api.cancelOcr(op);
    assert.equal(f.env.ocrOperation.current, null);
    assert.equal(f.env.ocr, null);
    assert.equal(f.env.ocrState.text, "");
    assert.equal(f.env.ocrState.error, "");
    assert.equal(op.state.text, "");
    assert.equal(op.state.error, "");
    f.env.ocrLifecycle.current.suspend(["a"]);
    assert.equal(f.env.ocrState.text, "");
    assert.equal(f.sessions.size, 0);
    if (saved)
      assert.match(
        documentText(f.backend.notes[0].document),
        /sensitive-terminal-text/,
      );
  }
});
await test("suspend erases React text and error synchronously while original delayed cancellation keeps its resource owner", async () => {
  const wait = deferred(),
    f = fixture({ text: "sensitive-cancelling-text", cancelWait: wait }),
    op = await f.recognized();
  f.env.ocrState = { ...f.env.ocrState, error: "sensitive-preview-error" };
  f.env.ocrLifecycle.current.suspend(["a"]);
  assert.deepEqual(f.env.ocrState, { phase: "choose", text: "", error: "" });
  assert.equal(f.env.ocr, null);
  assert.equal(f.env.ocrOperation.current, op);
  assert.equal(op.detached, true);
  await flush();
  assert.equal(f.sessions.size, 1);
  wait.resolve();
  await flush();
  assert.equal(f.sessions.size, 0);
  assert.equal(f.env.ocrOperation.current, null);
  assert.equal(f.env.ocrState.text, "");
  assert.equal(op.state.text, "");
});
await test("actual access prepare then commit clears preview before delayed cancellation and destroys only original editor", async () => {
  const wait = deferred(),
    f = fixture({ text: "sensitive-commit-text", cancelWait: wait }),
    op = await f.recognized();
  f.mountAccess();
  f.env.accessHandler.current({
    phase: "prepare",
    noteIds: ["a"],
    operationId: "access-commit",
  });
  assert.equal(f.env.ocrState.text, "");
  assert.equal(f.env.ocrState.error, "");
  assert.equal(f.editor.isEditable, false);
  await flush();
  assert.ok(
    f.calls.some(
      (call) => call.command === "acknowledge_access" && call.success,
    ),
  );
  const access = structuredClone(f.backend.access);
  access.notes.a = { epoch: 4, authorized: false };
  f.backend.access = access;
  f.backend.notes[0].locked = true;
  f.backend.notes[0].document = f.env.blankDoc;
  f.env.accessHandler.current({
    phase: "commit",
    noteIds: ["a"],
    operationId: "access-commit",
    access,
  });
  assert.equal(f.editor.isDestroyed, true);
  assert.equal(f.env.ocrState.text, "");
  wait.resolve();
  await flush();
  assert.equal(f.sessions.size, 0);
  assert.equal(f.env.ocrOperation.current, null);
  assert.equal(f.env.ocrState.text, "");
  assert.equal(op.state.text, "");
  assert.equal(f.env.dispatches, 0);
});
await test("actual clearSensitive without prepare erases recognized preview and terminal result", async () => {
  const f = fixture({ text: "sensitive-direct-clear" }),
    op = await f.recognized();
  f.mountAccess();
  f.env.clearSensitive.current(["a"]);
  assert.equal(f.env.ocr, null);
  assert.equal(f.env.ocrState.text, "");
  assert.equal(f.editor.isDestroyed, true);
  await flush();
  assert.equal(f.sessions.size, 0);
  assert.equal(op.state.text, "");
});
await test("actual prepare failure and abort preserve unACKed body and same operation for generic save retry without preview resurrection", async () => {
  const f = fixture({ text: "pending-private-body", saveFailures: 3 }),
    op = await f.recognized();
  await assert.rejects(f.api.confirmOcr(op));
  const pending = structuredClone(f.env.pendingDocs.current.get("a")),
    sessionId = op.sessionId;
  f.mountAccess();
  f.env.accessHandler.current({
    phase: "prepare",
    noteIds: ["a"],
    operationId: "access-abort",
  });
  await flush();
  assert.ok(
    f.calls.some(
      (call) => call.command === "acknowledge_access" && call.success === false,
    ),
  );
  assert.equal(f.env.ocrState.text, "");
  assert.equal(f.env.ocrOperation.current, op);
  assert.equal(op.sessionId, sessionId);
  assert.equal(op.documentAck, false);
  assert.deepEqual(f.env.pendingDocs.current.get("a"), pending);
  assert.deepEqual(f.editor.getJSON(), pending);
  assert.equal(f.sessions.size, 1);
  f.env.accessHandler.current({
    phase: "abort",
    noteIds: ["a"],
    operationId: "access-abort",
    access: f.backend.access,
  });
  await flush();
  assert.equal(f.editor.isDestroyed, false);
  assert.equal(f.editor.isEditable, true);
  assert.equal(f.env.ocr, null);
  assert.equal(f.env.ocrState.text, "");
  f.options.saveFailures = 0;
  await f.api.retryAttachments();
  assert.equal(f.env.dispatches, 1);
  assert.deepEqual(f.backend.notes[0].document, pending);
  assert.equal(f.env.pendingDocs.current.size, 0);
  assert.equal(f.sessions.size, 0);
  assert.equal(op.documentAck, true);
  assert.equal(op.state.text, "");
  assert.equal(f.env.ocrOperation.current, null);
  assert.equal(f.env.ocrState.text, "");
});
await test("ACKed cleanup failure retains same session across prepare and retries cleanup without body save or preview refill", async () => {
  const f = fixture({ text: "saved-private-body", cleanupFailures: 2 }),
    op = await f.recognized();
  await assert.rejects(f.api.confirmOcr(op));
  const saved = structuredClone(f.backend.notes[0].document),
    sessionId = op.sessionId;
  const saves = f.calls.filter(
    (call) => call.command === "workspace_action",
  ).length;
  f.mountAccess();
  f.env.accessHandler.current({
    phase: "prepare",
    noteIds: ["a"],
    operationId: "access-cleanup",
  });
  await flush();
  assert.equal(op.documentAck, true);
  assert.equal(op.cleaned, false);
  assert.equal(op.sessionId, sessionId);
  assert.equal(f.env.ocrOperation.current, op);
  assert.equal(f.env.ocrState.text, "");
  assert.equal(f.env.ocrState.error, "");
  await f.api.retryAttachments();
  assert.equal(
    f.calls.filter((call) => call.command === "workspace_action").length,
    saves,
  );
  assert.equal(f.env.dispatches, 1);
  assert.deepEqual(f.backend.notes[0].document, saved);
  assert.equal(f.sessions.size, 0);
  assert.equal(op.state.text, "");
  assert.equal(f.env.ocrOperation.current, null);
  assert.equal(f.env.ocrState.text, "");
});
await test("actual access prepare/commit and close-effect unmount reject pending OCR text and cannot refill cleared UI", async () => {
  for (const action of ["prepare", "commit", "unmount"]) {
    const wait = deferred(),
      f = fixture({ text: "late-private-result", recognizeWait: wait }),
      op = f.open();
    const work = op.process({ kind: "image" });
    await flush();
    if (action === "unmount") f.mountClose()();
    else {
      f.mountAccess();
      f.env.accessHandler.current({
        phase: action,
        noteIds: ["a"],
        operationId: "access-late",
        access: f.backend.access,
      });
    }
    assert.equal(f.env.ocrState.text, "");
    assert.equal(f.env.ocrState.error, "");
    assert.equal(f.env.ocr, null);
    wait.resolve();
    await work;
    await flush();
    assert.equal(f.env.dispatches, 0);
    assert.equal(f.sessions.size, 0);
    assert.equal(f.env.ocrState.text, "");
    assert.equal(op.state.text, "");
  }
});
await test("actual unmount erases a recognized preview immediately and Host result only after same-session cleanup", async () => {
  const wait = deferred(),
    f = fixture({ text: "unmounted-private-text", cancelWait: wait }),
    op = await f.recognized();
  f.mountClose()();
  assert.equal(f.env.ocrState.text, "");
  assert.equal(f.env.ocrState.error, "");
  assert.equal(f.env.ocr, null);
  assert.equal(op.detached, true);
  await flush();
  assert.equal(f.sessions.size, 1);
  wait.resolve();
  await flush();
  assert.equal(f.sessions.size, 0);
  assert.equal(op.state.text, "");
  assert.equal(f.env.ocrState.text, "");
});
await test("unrelated target suspend and actual clearSensitive preserve current OCR owner and preview", async () => {
  const f = fixture({ text: "current-note-a-preview" }),
    op = await f.recognized();
  const state = structuredClone(f.env.ocrState),
    sessionId = op.sessionId;
  f.env.ocrLifecycle.current.suspend(["b"]);
  f.mountAccess();
  f.env.clearSensitive.current(["b"]);
  assert.equal(f.env.ocrOperation.current, op);
  assert.equal(f.env.ocr, op);
  assert.equal(op.accepting, true);
  assert.equal(op.detached, false);
  assert.deepEqual(f.env.ocrState, state);
  assert.equal(op.sessionId, sessionId);
  assert.equal(f.sessions.size, 1);
  assert.equal(f.editor.isDestroyed, false);
  await f.api.cancelOcr(op);
});
await test("old terminal finish and captured update callback cannot erase or refill a later valid OCR owner", async () => {
  const f = fixture({ text: "old-owner-text" }),
    old = await f.recognized();
  await f.api.cancelOcr(old);
  f.options.text = "new-owner-text";
  const next = await f.recognized(),
    state = structuredClone(f.env.ocrState);
  f.api.finishOcr(old);
  old.ports.update({
    phase: "recognized",
    text: "late-old-owner-text",
    error: "old-error",
  });
  f.api.processOcr(old, { kind: "file", file: f.sourceFile });
  await assert.rejects(f.api.confirmOcr(old));
  await flush();
  assert.equal(f.env.ocrOperation.current, next);
  assert.equal(f.env.ocr, next);
  assert.deepEqual(f.env.ocrState, state);
  assert.equal(f.env.ocrState.text, "new-owner-text");
  assert.equal(next.accepting, true);
  assert.equal(f.sessions.size, 1);
  await f.api.cancelOcr(next);
});
console.log(
  JSON.stringify(
    {
      kind: "actual-App-OCR-closures-production-controller-guest-bridge-queue-PM",
      status: "pass",
      checks: checks.length,
      results: checks,
      sourceHashes: hashes,
      limits: [
        "AST-extracted actual App closures; production OcrHost, typed notes-scan guest/adapter, authority, trusted sync, bridge, SaveQueue and actual PM transaction/history",
        "Controlled native OCR results/permission/selection/DB responses/FileReader and Editor dispatch host; no mounted App, actual native OCR, Rust DB/device, camera hardware, cold start or original pixel acceptance",
      ],
    },
    null,
    2,
  ),
);
