// Real PM selections/transactions with deterministic focus/IME adapter. No OS IME claim.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { getSchema } from "@tiptap/core";
await import("./check-editor-schema.mjs");
const output = resolve("artifacts/session96");
await mkdir(output, { recursive: true });
const compiled = resolve(output, "controller.mjs");
await writeFile(
  compiled,
  ts.transpileModule(
    await readFile("src/editor-session/controller.ts", "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText,
);
const { EditorSession } = await import(pathToFileURL(compiled));
const { createEditorExtensions } = await import(
  pathToFileURL(resolve("artifacts/editor-schema/editor-schema.mjs"))
);
const schema = getSchema(createEditorExtensions());
const editor = () => {
  let state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "alpha beta" }] },
      ],
    }),
  });
  const listeners = new Map();
  const e = {
    isEditable: true,
    isDestroyed: false,
    get state() {
      return state;
    },
    view: {
      dom: { isConnected: true },
      dispatch(tr) {
        state = state.apply(tr);
        for (const fn of listeners.get("transaction") || [])
          fn({ transaction: tr });
      },
    },
    on(name, fn) {
      const set = listeners.get(name) || new Set();
      set.add(fn);
      listeners.set(name, set);
    },
    off(name, fn) {
      listeners.get(name)?.delete(fn);
    },
    destroy() {
      e.isDestroyed = true;
      for (const fn of listeners.get("destroy") || []) fn();
    },
    listeners,
  };
  return e;
};
const calls = [];
let focused = null;
const platform = {
  keyboard(show) {
    calls.push(show ? "show" : "hide");
  },
  blur(e) {
    focused = null;
    calls.push("blur");
    this.keyboard(false);
  },
  focus(e, options, current) {
    if (!current()) return false;
    focused = e;
    calls.push("focus");
    if (options.keyboard) this.keyboard(true);
    return current();
  },
};
const session = new EditorSession(platform),
  a = editor(),
  b = editor();
const context = (noteId, e, extra = {}) => ({
  noteId,
  editor: e,
  mobile: true,
  visible: true,
  blocked: false,
  authorized: true,
  owner: noteId,
  ...extra,
});
const results = [];
session.configure(context("a", a));
session.reconcile();
assert.equal(session.snapshot().body, "browse");
assert.equal(focused, null);
session.requestCreatedFocus("a", session.generation);
session.reconcile();
assert.equal(focused, a);
assert.equal(calls.at(-1), "show");
assert.equal(session.snapshot().pendingFocus, null);
results.push(
  "newly created exact authorized owner focuses and requests IME once",
);
a.view.dispatch(
  a.state.tr.setSelection(TextSelection.create(a.state.doc, 1, 6)),
);
session.openFormat();
assert.equal(session.snapshot().formatOpen, true);
assert.equal(calls.at(-1), "hide");
session.setMenu("media");
assert.equal(session.snapshot().formatOpen, true);
assert.equal(session.snapshot().menu, "media");
session.setMenu(null);
assert.equal(session.snapshot().formatOpen, true);
a.view.dispatch(
  a.state.tr.setSelection(TextSelection.create(a.state.doc, 7, 11)),
);
session.formatCommand((e) =>
  e.view.dispatch(
    e.state.tr.addMark(
      e.state.selection.from,
      e.state.selection.to,
      schema.marks.bold.create(),
    ),
  ),
);
assert.equal(a.state.doc.child(0).lastChild.text, "beta");
assert.equal(a.state.doc.child(0).lastChild.marks[0].type.name, "bold");
session.closeFormat("confirm");
assert.equal(calls.at(-1), "show");
assert.equal(session.snapshot().formatOpen, false);
session.openFormat();
session.closeFormat("back");
assert.equal(calls.at(-1), "hide");
assert.equal(session.snapshot().body, "browse");
results.push(
  "format persists through ordinary menus, follows real selection and separates manual-close/Back IME",
);
// A valid receipt changes the selected note and mounts its editor in later renders.
session.invalidate("navigation");
const receiptGeneration = session.generation;
session.requestCreatedFocus("b", receiptGeneration);
session.configure(context("b", null));
session.reconcile();
assert.equal(session.snapshot().pendingFocus?.noteId, "b");
session.configure(context("b", b));
session.reconcile();
assert.equal(focused, b);
assert.equal(session.snapshot().pendingFocus, null);
results.push(
  "valid receipt survives selected-note transition and delayed editor mount",
);
// Flush completion for a previous body owner cannot blur the new body.
const done = session.captureBodyIntent();
session.invalidate("navigation");
session.configure(context("a", a));
session.reconcile();
session.requestCreatedFocus("a", session.generation);
session.reconcile();
const beforeDone = calls.length;
session.completeBodyIntent(done);
assert.equal(focused, a);
assert.equal(calls.length, beforeDone);
results.push(
  "stale asynchronous Done completion cannot blur a newly navigated owner",
);
session.requestCreatedFocus("a", session.generation);
session.invalidate("navigation");
const boundary = calls.length;
session.configure(context("b", b));
session.reconcile();
assert.equal(session.snapshot().pendingFocus, null);
assert(!calls.slice(boundary).includes("show"));
session.requestCreatedFocus("b", session.generation);
session.configure(context("b", b, { authorized: false }));
session.reconcile();
assert.equal(focused, null);
assert.equal(session.snapshot().pendingFocus, null);
assert.equal(b.isEditable, true);
results.push(
  "navigation and access invalidate late focus without changing gate editability",
);
session.configure(context("b", b));
session.reconcile();
const drawing = {
  noteId: "b",
  editor: b,
  authority: "epoch-b",
  strokes: [],
  bookmark: b.state.selection.getBookmark(),
  originalDocument: b.state.doc,
};
assert.equal(session.openDrawing(drawing), true);
b.isEditable = false;
session.reconcile();
assert.equal(session.snapshot().drawing, drawing);
session.closeDrawing("cancel");
assert.equal(b.isEditable, false);
session.bodyFocus(true);
assert.equal(session.snapshot().body, "browse");
results.push(
  "drawing hides IME, survives its own gate freeze, and never reenables Editor on cancel",
);
b.isEditable = true;
session.recordOpened("a", true);
session.projectRecordingIndicator({ owner: "a", phase: "recording" });
session.bodyFocus(true);
session.setMenu("more");
assert.equal(session.snapshot().recording.owner, "a");
assert.equal(session.snapshot().body, "editing");
assert.equal(session.snapshot().menu, "more");
session.invalidate("navigation");
assert.equal(session.snapshot().recording.owner, "a");
assert.equal(session.snapshot().indicator.owner, "a");
session.recordClosed("b");
assert.equal(session.snapshot().recording.owner, "a");
session.recordClosed("a");
assert.equal(session.snapshot().recording, null);
results.push(
  "desktop recording presentation/owner is orthogonal to body/menu/navigation",
);
session.openFormat();
b.destroy();
assert.equal(session.snapshot().formatOpen, false);
assert.equal(calls.at(-1), "hide");
session.dispose();
assert.equal(a.listeners.get("transaction").size, 0);
assert.equal(b.listeners.get("transaction").size, 0);
results.push(
  "destroy/unmount release bookmarks, pending intents and listeners",
);
await writeFile(
  resolve(output, "state-result.json"),
  JSON.stringify(
    { passed: true, results, platform: "deterministic adapter, not OS IME" },
    null,
    2,
  ),
);
console.log(JSON.stringify({ passed: true, results }, null, 2));
