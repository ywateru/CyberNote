import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";

const out = resolve("docs/verification/app-001-paper-same-style-selection03/identity-adapted02");
await mkdir(out, { recursive: true });
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
const importSource = (source) =>
  import(
    `data:text/javascript;base64,${Buffer.from(compile(source)).toString("base64")}`
  );
const { documentsEqual } = await importSource(
  await readFile("src/document-equality.ts", "utf8"),
);
const { SaveRevisions } = await importSource(
  await readFile("src/save-revisions.ts", "utf8"),
);
const { AccessGate } = await importSource(
  await readFile("src/access-client.ts", "utf8"),
);
for (const name of ["editor-schema", "note-tag-extension", "note-tags"]) {
  const compiled = compile(await readFile(`src/${name}.ts`, "utf8"))
    .replaceAll('"./note-tag-extension"', '"./note-tag-extension.mjs"')
    .replaceAll('"./note-tags"', '"./note-tags.mjs"');
  await writeFile(resolve(out, name + ".mjs"), compiled);
}
const { createEditorExtensions } = await import(
  pathToFileURL(resolve(out, "editor-schema.mjs"))
);
const schema = getSchema(createEditorExtensions());
const fixture = JSON.parse(
  await readFile(
    "docs/verification/app-001-fix-03/fixtures/valid-rich.document.json",
    "utf8",
  ),
);
const rich = schema.nodeFromJSON(fixture);
rich.check();
const reorder = (value) =>
  Array.isArray(value)
    ? value.map(reorder)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, child]) => [key, reorder(child)]),
        )
      : value;
const original = rich.toJSON();
const reordered = reorder(original);
const results = [];
function test(name, fn) {
  fn();
  results.push({ name, status: "pass" });
}
test("real rich schema document: recursive object key reorder is equal", () => {
  schema.nodeFromJSON(reordered).check();
  assert.notEqual(JSON.stringify(original), JSON.stringify(reordered));
  assert(documentsEqual(original, reordered));
});
for (const [name, change] of [
  ["text", (d) => (d.content[0].content[0].text += "!")],
  ["node type", (d) => (d.content[0].type = "paragraph")],
  ["node attribute", (d) => (d.content[0].attrs.level = 2)],
  [
    "nested mark attribute",
    (d) => (d.content[1].content[0].marks[1].attrs.color = "#ff0000"),
  ],
  ["nested list attribute", (d) => (d.content[2].attrs.listStyle = "bullet")],
  ["boolean attribute", (d) => (d.content[3].content[0].attrs.checked = false)],
  ["content array order", (d) => d.content.reverse()],
  ["mark array order", (d) => d.content[1].content[0].marks.reverse()],
  ["missing content", (d) => delete d.content[1].content],
  ["array length", (d) => d.content.pop()],
]) {
  test(`real document change remains different: ${name}`, () => {
    const changed = structuredClone(original);
    change(changed);
    assert(!documentsEqual(original, changed));
    assert(!documentsEqual(changed, original));
  });
}
for (const [name, a, b] of [
  [
    "missing vs null",
    { type: "paragraph" },
    { type: "paragraph", attrs: null },
  ],
  [
    "missing vs explicit undefined",
    { type: "paragraph" },
    { type: "paragraph", attrs: undefined },
  ],
  ["null vs empty object", { attrs: null }, { attrs: {} }],
  ["number vs string", { attrs: { level: 1 } }, { attrs: { level: "1" } }],
  ["object vs array", { attrs: {} }, { attrs: [] }],
  [
    "nested arrays",
    {
      attrs: {
        points: [
          [1, 2],
          [3, 4],
        ],
      },
    },
    {
      attrs: {
        points: [
          [2, 1],
          [3, 4],
        ],
      },
    },
  ],
]) {
  test(`strict JSON boundary: ${name}`, () => assert(!documentsEqual(a, b)));
}

// Extract the actual production hydrate callback and JSX key expression. This
// exercises their current code without exporting private app hooks or replacing
// the app's IPC. It does not mount React or prove installed-app editor identity.
const app = ts.createSourceFile(
  "src/App.tsx",
  await readFile("src/App.tsx", "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let hydrateCallback, createNoteCallback, editorKey;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(app) === "hydrate")
    hydrateCallback = node.initializer.arguments[0].getText(app);
  if (ts.isVariableDeclaration(node) && node.name.getText(app) === "createNote")
    createNoteCallback = node.initializer.arguments[0].getText(app);
  if (
    ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(app) === "SearchEditorHost"
  )
    editorKey = node.attributes.properties
      .find((p) => p.name?.getText(app) === "key")
      .initializer.expression.getText(app);
  ts.forEachChild(node, visit);
}
visit(app);
assert(
  hydrateCallback && createNoteCallback && editorKey,
  "Production hydrate/createNote/SearchEditorHost key not found",
);
const { bindHydrate, bindCreateNote, keyFor } = await importSource(`
  export function bindHydrate(env) {
    const {wsRef, pendingDocs, revisions, externalVersions, clearSensitive,
      setWs, setSettings, documentsEqual} = env;
    return ${hydrateCallback};
  }
  export function bindCreateNote(env) {
    const {flush, folderId, action, revisions, setWs, setNoteId, setPage,
      setGalleryEditor, setMenu, setQuery, setSearching, setEditing,
      updateSettings, setTimeout, fail, loadWorkspace, clearTagComposition, setTagFilter, setFilter} = env;
    return ${createNoteCallback};
  }
  export function keyFor(note, ws, externalVersions) { return ${editorKey}; }
`);
const baseDoc = schema.nodeFromJSON({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "FIX07-Paper-Selection" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Alpha Beta Gamma" }],
    },
  ],
});
const beta = baseDoc.firstChild.nodeSize + 7;
let state = EditorState.create({
  schema,
  doc: baseDoc,
  selection: TextSelection.create(baseDoc, beta, beta + 4),
  plugins: [history()],
});
state = state.apply(
  state.tr.addMark(beta, beta + 4, schema.marks.bold.create()),
);
const document = state.doc.toJSON();
const access = {
  sessionId: "process-A",
  epoch: 1,
  notes: { note: { epoch: 0, authorized: true } },
};
function harness(pending) {
  const wsRef = {
    current: {
      notes: [{ id: "note", document, paperStyle: "plain", revision: 1 }],
      access,
      settings: {},
    },
  };
  const externalVersions = { current: new Map() };
  const cleared = [];
  const env = {
    wsRef,
    pendingDocs: { current: new Map(pending ? [["note", pending]] : []) },
    revisions: { current: new SaveRevisions() },
    externalVersions,
    clearSensitive: { current: (ids) => cleared.push(ids) },
    setWs: (value) => {
      wsRef.current = value;
    },
    setSettings: () => {},
    documentsEqual,
  };
  const hydrate = bindHydrate(env);
  const key = () =>
    keyFor(wsRef.current.notes[0], wsRef.current, externalVersions);
  const snapshot = () => ({
    notes: [
      {
        ...wsRef.current.notes[0],
        document: reorder(document),
        paperStyle: "grid-large",
      },
    ],
    access: structuredClone(access),
    settings: {},
  });
  return { ...env, cleared, hydrate, key, snapshot };
}
test("actual hydrate: paper-only authoritative refresh preserves production key and real bookmark/history path", () => {
  const h = harness(),
    beforeKey = h.key(),
    bookmark = state.selection.getBookmark();
  h.hydrate(h.snapshot());
  assert.equal(h.key(), beforeKey);
  assert.equal(h.externalVersions.current.size, 0);
  assert.equal(h.wsRef.current.notes[0].paperStyle, "grid-large");
  assert.deepEqual(h.cleared, []);
  assert.deepEqual(
    bookmark.resolve(state.doc).toJSON(),
    state.selection.toJSON(),
  );
  let historyState = state;
  const dispatch = (tr) => {
    historyState = historyState.apply(tr);
  };
  assert(undo(historyState, dispatch));
  assert.equal(
    historyState.doc.rangeHasMark(beta, beta + 4, schema.marks.bold),
    false,
  );
  assert(redo(historyState, dispatch));
  assert.deepEqual(historyState.doc.toJSON(), state.doc.toJSON());
});
test("actual hydrate: genuinely changed authoritative document still advances editor key", () => {
  const h = harness(),
    key = h.key(),
    next = h.snapshot();
  next.notes[0].document.content[1].content[0].text += " external";
  h.hydrate(next);
  assert.notEqual(h.key(), key);
  assert.equal(h.externalVersions.current.get("note"), 1);
});
for (const [name, change] of [
  [
    "new process session",
    (a) => {
      a.sessionId = "process-B";
    },
  ],
  [
    "new note authorization epoch",
    (a) => {
      a.notes.note.epoch = 2;
    },
  ],
]) {
  test(`actual hydrate: same document cannot exempt ${name}`, () => {
    const h = harness(),
      key = h.key(),
      next = h.snapshot();
    change(next.access);
    h.hydrate(next);
    assert.deepEqual(h.cleared, [["note"]]);
    assert.notEqual(h.key(), key);
  });
}
test("actual hydrate: unauthorized authoritative snapshot cannot revive a pending document", () => {
  const h = harness(document),
    next = h.snapshot();
  next.access.notes.note.authorized = false;
  next.access.notes.note.epoch = 1;
  next.notes[0].document = { type: "doc", content: [] };
  h.hydrate(next);
  assert.deepEqual(h.cleared, [["note"]]);
  assert.deepEqual(h.wsRef.current.notes[0].document, next.notes[0].document);
});

// The installed-app failure was a newly created note whose response access was
// discarded, not an equality failure. Exercise the actual create callback before
// its first hydrate, with the existing response gate rejecting stale responses.
function creationHarness(beforeAccept, options = {}) {
  const h = harness();
  const gate = new AccessGate();
  gate.invalidate(structuredClone(access));
  const response = {
    id: "created",
    document: structuredClone(document),
    paperStyle: "plain",
    revision: 0,
    access: {
      ...structuredClone(access),
      notes: {
        ...structuredClone(access.notes),
        created: { epoch: 0, authorized: true },
      },
    },
  };
  const failures = [],
    selected = [];
  let loads = 0;
  const noOp = () => {};
  const create = bindCreateNote({
    flush: async () => {},
    folderId: "default",
    action: async () => {
      const stamp = gate.stamp();
      await beforeAccept?.(gate, h, response);
      gate.accept(response.access, stamp);
      return options.preview ? {...response, access: undefined} : response;
    },
    loadWorkspace: async () => {
      loads++;
      const stamp = gate.stamp();
      await options.beforeLoadAccept?.(gate, h, response);
      const data = {...structuredClone(h.wsRef.current), access: structuredClone(response.access)};
      gate.accept(data.access, stamp);
      return data;
    },
    clearTagComposition: noOp,
    setTagFilter: noOp,
    setFilter: noOp,
    revisions: h.revisions,
    setWs: (update) => {
      h.wsRef.current = update(h.wsRef.current);
    },
    setNoteId: (id) => selected.push(id),
    setPage: noOp,
    setGalleryEditor: noOp,
    setMenu: noOp,
    setQuery: noOp,
    setSearching: noOp,
    setEditing: noOp,
    updateSettings: noOp,
    setTimeout: noOp,
    fail: (error) => failures.push(error),
  });
  return { ...h, gate, response, failures, selected, create, loads:()=>loads };
}
async function testAsync(name, fn) {
  await fn();
  results.push({ name, status: "pass" });
}
await testAsync(
  "actual create -> first paper hydrate keeps accepted new note epoch and never clears editor",
  async () => {
    const h = creationHarness();
    await h.create();
    assert.deepEqual(h.failures, []);
    assert.deepEqual(h.selected, ["created"]);
    assert.deepEqual(h.wsRef.current.access, h.response.access);
    const beforeKey = keyFor(
      h.wsRef.current.notes[0],
      h.wsRef.current,
      h.externalVersions,
    );
    const next = structuredClone(h.wsRef.current);
    next.notes[0].document = reorder(next.notes[0].document);
    next.notes[0].paperStyle = "grid-large";
    next.notes[0].revision++;
    h.hydrate(next);
    assert.deepEqual(h.cleared, []);
    assert.equal(h.externalVersions.current.size, 0);
    assert.equal(
      keyFor(h.wsRef.current.notes[0], h.wsRef.current, h.externalVersions),
      beforeKey,
    );
  },
);
test("missing old authorization entry still triggers existing hydrate cleanup", () => {
  const h = harness(),
    next = h.snapshot();
  h.wsRef.current.access = { ...structuredClone(access), notes: {} };
  h.hydrate(next);
  assert.deepEqual(h.cleared, [["note"]]);
});
for (const [name, change] of [
  [
    "newer note/global epoch",
    (a) => {
      a.epoch++;
      a.notes.created = { epoch: 1, authorized: false };
    },
  ],
  [
    "new process session",
    (a) => {
      a.sessionId = "process-B";
    },
  ],
]) {
  await testAsync(
    `actual create rejects stale response after ${name} without replacing updated workspace`,
    async () => {
      let latest;
      const h = creationHarness((gate, current) => {
        latest = structuredClone(current.wsRef.current);
        change(latest.access);
        gate.invalidate(latest.access);
        current.wsRef.current = latest;
      });
      await h.create();
      assert.equal(h.failures.length, 1);
      assert.equal(h.failures[0].code, "access_changed");
      assert.deepEqual(h.selected, []);
      assert.equal(h.wsRef.current, latest);
      assert.equal(
        h.wsRef.current.notes.some((n) => n.id === "created"),
        false,
      );
    },
  );
}
test("actual hydrate: pending body keeps its own revision and document during external refresh", () => {
  const pending = structuredClone(document);
  pending.content[1].content[0].text += " pending";
  const h = harness(pending), before = h.key(), next = h.snapshot();
  h.revisions.current.confirmed("note", 1);
  next.notes[0].revision = 99;
  next.notes[0].document.content[1].content[0].text += " external";
  h.hydrate(next);
  assert.equal(h.key(), before);
  assert.equal(h.externalVersions.current.size, 0);
  assert.deepEqual(h.wsRef.current.notes[0].document, pending);
  assert.equal(h.pendingDocs.current.get("note"), pending);
  assert.equal(h.revisions.current.expected("note"), 1);
});
await testAsync("actual native create with access does not perform fallback load", async () => {
  const h = creationHarness(); await h.create();
  assert.equal(h.loads(), 0); assert.deepEqual(h.failures, []);
});
await testAsync("actual preview create adopts access from trusted load before first metadata refresh", async () => {
  const h = creationHarness(undefined, {preview:true}); await h.create();
  assert.equal(h.loads(), 1); assert.deepEqual(h.failures, []);
  assert.deepEqual(h.wsRef.current.access, h.response.access);
  const note = h.wsRef.current.notes.find(n=>n.id === "created");
  const before = keyFor(note, h.wsRef.current, h.externalVersions);
  const next = structuredClone(h.wsRef.current);
  next.notes.find(n=>n.id === "created").paperStyle = "grid-large";
  h.hydrate(next);
  assert.deepEqual(h.cleared, []);
  assert.equal(keyFor(h.wsRef.current.notes.find(n=>n.id === "created"),h.wsRef.current,h.externalVersions),before);
});
await testAsync("stale preview fallback response is rejected without admitting created body", async () => {
  let latest;
  const h = creationHarness(undefined, {preview:true, beforeLoadAccept:(gate,current)=>{
    latest = structuredClone(current.wsRef.current);
    latest.access.sessionId = "process-new";
    gate.invalidate(latest.access); current.wsRef.current = latest;
  }});
  await h.create(); assert.equal(h.loads(),1);
  assert.equal(h.failures.length,1); assert.equal(h.failures[0].code,"access_changed");
  assert.deepEqual(h.selected,[]); assert.equal(h.wsRef.current,latest);
  assert.equal(h.wsRef.current.notes.some(n=>n.id === "created"),false);
});
const report = {
  scope:
    "Actual JSON comparator, real schema/state/history, extracted production create/hydrate/key and existing AccessGate stale response rejection. No React mount, native IPC/device or installed-app acceptance.",
  tests: results.length,
  results,
};
await writeFile(
  resolve(out, "result.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
