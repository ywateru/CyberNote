// Real production Editor and App in an isolated offline headless browser.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error("Use existing browser and Playwright; no downloads.");
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(process.argv[2] || "artifacts/tags-browser");
await mkdir(output, { recursive: true });
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';import NoteEditor from '/src/Editor.tsx';import App from '/src/App.tsx';import{documentTags,projectTags,tagSelectionAfterAccess}from'/src/note-tags.ts';import{documentText}from'/src/types.ts';import{action}from'/src/bridge.ts';import'/src/style.css';
window.tags={documentTags,projectTags,tagSelectionAfterAccess,documentText};window.action=action;window.changes=[];window.editors={};
const root=createRoot(document.getElementById('root'));
window.mount=(notes)=>root.render(React.createElement('div',{},...notes.map(note=>React.createElement(NoteEditor,{key:note.id,note,onChange:(id,doc)=>window.changes.push({id,doc}),onReady:e=>window.editors[note.id]=e,onFocus:()=>{}}))));
window.mountApp=()=>root.render(React.createElement(App));window.unmount=()=>root.render(null);
`;
const vite = await createViteServer({
  root: process.cwd(),
  configFile: false,
  cacheDir: resolve("artifacts/tags-browser-cache"),
  plugins: [
    react(),
    {
      name: "tags-check",
      resolveId(id) {
        if (id === "/__tags.tsx") return id;
      },
      load(id) {
        if (id === "/__tags.tsx") return entry;
      },
    },
  ],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__check") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><div id="root"></div><script type="module" src="/__tags.tsx"></script>',
      )
      .then((x) => res.end(x));
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
const note = (id, text = "", locked = false) => ({
  id,
  folderId: "default",
  document: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      },
    ],
  },
  title: text || "新备忘录",
  plainText: text,
  createdAt: 1,
  updatedAt: 1,
  pinned: false,
  deletedAt: null,
  originalFolderId: null,
  locked,
  paperStyle: "plain",
  revision: 0,
});
const tagDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "#UI",
          marks: [{ type: "noteTag", attrs: { name: "UI对照" } }],
        },
        {
          type: "text",
          text: "对照",
          marks: [
            { type: "bold" },
            { type: "noteTag", attrs: { name: "UI对照" } },
          ],
        },
        { type: "text", text: " " },
      ],
    },
  ],
};
const results = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (r) =>
    r.request().url().startsWith(origin) ||
    r.request().url().startsWith("data:")
      ? r.continue()
      : r.abort(),
  );
  await page.goto(origin + "/__check");
  await page.waitForFunction(() => window.mount);
  const mount = async (notes) => {
    await page.evaluate(() => window.unmount());
    await page.waitForFunction(() => !document.querySelector(".tiptap"));
    await page.evaluate((notes) => window.mount(notes), notes);
    await page.waitForFunction(
      (ids) =>
        ids.every(
          (id) => !!window.editors[id] && !window.editors[id].isDestroyed,
        ),
      notes.map((n) => n.id),
    );
  };
  const snapshot = () =>
    page.evaluate(() => {
      const e = window.editors.a;
      return {
        doc: e.getJSON(),
        tags: window.tags.documentTags(e.getJSON()),
        text: window.tags.documentText(e.getJSON()),
        selection: e.state.selection.toJSON(),
        changes: window.changes.length,
      };
    });
  await mount([note("a"), note("b")]);
  await page.locator(".tiptap").first().click();
  await page.keyboard.insertText("#UI对照");
  assert.deepEqual((await snapshot()).tags, []);
  await page.keyboard.type(" ");
  let snap = await snapshot();
  assert.deepEqual(snap.tags, ["UI对照"]);
  assert.equal(snap.doc.content[0].content.at(-1).text, " ");
  results.push({ name: "real-text-input-ASCII-space", ...snap });
  await page.evaluate(() => window.editors.a.commands.undo());
  assert.deepEqual((await snapshot()).tags, []);
  await page.evaluate(() => window.editors.a.commands.redo());
  assert.deepEqual((await snapshot()).tags, ["UI对照"]);
  results.push({ name: "undo-redo", ok: true });
  await page.evaluate(() => {
    let e = window.editors.a;
    e.view.dispatch(e.state.tr.insertText("x", 4));
  });
  assert.deepEqual((await snapshot()).tags, []);
  assert.ok((await snapshot()).text.includes("x"));
  assert.equal(await page.evaluate(() => window.editors.b.getText()), "");
  results.push({
    name: "internal-edit-removes-mark-keeps-text-two-editor-isolation",
    ok: true,
  });
  // Actual plain clipboard paste into the production first-paste handler.
  await mount([note("paste")]);
  await page.locator(".tiptap").click();
  await page.evaluate(() => {
    const d = new DataTransfer();
    d.setData("text/plain", "#UI对照");
    document.querySelector(".tiptap").dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: d,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.keyboard.type(" ");
  assert.deepEqual(
    await page.evaluate(() =>
      window.tags.documentTags(window.editors.paste.getJSON()),
    ),
    ["UI对照"],
  );
  results.push({ name: "plain-paste-then-real-space", ok: true });
  for (const [id, text, code] of [
    ["hash", "#", false],
    ["inline", "a#b", false],
    ["digits", "#123", false],
    ["long", "#" + "A".repeat(65), false],
    ["invalid", "#a🙂", false],
    ["code", "#UI对照", true],
  ]) {
    await mount([note(id)]);
    await page.locator(".tiptap").click();
    if (code)
      await page.evaluate(
        (id) => window.editors[id].commands.setCodeBlock(),
        id,
      );
    await page.keyboard.insertText(text);
    await page.keyboard.type(" ");
    assert.deepEqual(
      await page.evaluate(
        (id) => window.tags.documentTags(window.editors[id].getJSON()),
        id,
      ),
      [],
    );
    results.push({ name: "no-submit-" + id, ok: true });
  }
  await mount([{ ...note("a"), document: tagDoc }]);
  await page.evaluate(() => {
    const e = window.editors.a;
    e.commands.setTextSelection({ from: 2, to: 4 });
    e.commands.setLink({ href: "https://example.invalid" });
  });
  snap = await snapshot();
  assert.deepEqual(snap.tags, []);
  assert.ok(JSON.stringify(snap.doc).includes("link"));
  assert.equal(snap.text, "#UI对照");
  results.push({
    name: "partial-link-wins-clears-whole-tag-keeps-bold-text",
    ...snap,
  });
  await mount([{ ...note("a"), document: tagDoc }]);
  await page.evaluate(() => {
    const e = window.editors.a;
    e.commands.setTextSelection(4);
    e.commands.splitBlock();
  });
  assert.deepEqual((await snapshot()).tags, []);
  results.push({ name: "split-block-clears-both-fragments", ok: true });
  for (const [operation, run] of [
    ["before", (e) => e.view.dispatch(e.state.tr.insertText("x", 1))],
    ["after", (e) => e.view.dispatch(e.state.tr.insertText("x", 6))],
    ["delete", (e) => e.view.dispatch(e.state.tr.delete(3, 4))],
    [
      "code",
      (e) => {
        e.commands.setTextSelection({ from: 2, to: 4 });
        e.commands.setCode();
      },
    ],
    [
      "codeblock",
      (e) => {
        e.commands.setTextSelection(3);
        e.commands.setCodeBlock();
      },
    ],
    [
      "replace-selection",
      (e) => {
        e.commands.setTextSelection({ from: 2, to: 4 });
        e.commands.insertContent("changed");
      },
    ],
  ]) {
    await mount([{ ...note("a"), document: tagDoc }]);
    await page.evaluate((source) => {
      const run = (0, eval)(`(${source})`);
      run(window.editors.a);
    }, String(run));
    const value = await snapshot();
    assert.deepEqual(
      value.tags,
      operation === "before" || operation === "after" ? ["UI对照"] : [],
    );
    results.push({ name: "whole-span-edit-" + operation, ...value });
  }
  await mount([note("a", "#UI对照")]);
  await page.locator(".tiptap").click();
  await page.evaluate(() => {
    const e = window.editors.a;
    e.commands.setTextSelection("end");
    e.view.dom.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "对照" }),
    );
    const handled = e.view.someProp("handleTextInput", (f) =>
      f(e.view, e.state.selection.from, e.state.selection.to, " "),
    );
    window.composingHandled = !!handled;
  });
  assert.equal(await page.evaluate(() => window.composingHandled), false);
  assert.deepEqual((await snapshot()).tags, []);
  await page.evaluate(() =>
    window.editors.a.view.dom.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "对照" }),
    ),
  );
  await page.keyboard.type(" ");
  assert.deepEqual((await snapshot()).tags, ["UI对照"]);
  results.push({ name: "composition-native-events-space-after-end", ok: true });
  await mount([note("locked", "#UI对照", true)]);
  await page.locator(".tiptap").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" ");
  assert.deepEqual(
    await page.evaluate(() =>
      window.tags.documentTags(window.editors.locked.getJSON()),
    ),
    [],
  );
  results.push({ name: "locked-no-submit", ok: true });
  await mount([note("a", "#UI对照")]);
  await page.evaluate(() => {
    const e = window.editors.a;
    e.commands.setTextSelection("end");
    e.setEditable(false);
  });
  assert.equal(
    await page.evaluate(() => {
      let e = window.editors.a;
      return (
        e.view.someProp("handleTextInput", (f) =>
          f(e.view, e.state.selection.from, e.state.selection.to, " "),
        ) || false
      );
    }),
    false,
  );
  results.push({ name: "readonly-no-submit", ok: true });
  // Pure production projection, with distinct legal pending/authorized bodies.
  const projection = await page.evaluate(
    ({ tagDoc, note }) => {
      const a = { ...note, id: "a", document: tagDoc },
        b = { ...a, id: "b" },
        locked = { ...a, id: "locked", locked: true },
        deleted = { ...a, id: "trash", deletedAt: 1 };
      const ws = {
        notes: [a, b, locked, deleted],
        folders: [],
        attachments: [],
        settings: {},
        access: {
          sessionId: "s",
          epoch: 1,
          notes: { locked: { epoch: 1, authorized: true } },
          suspended: [],
          operationId: null,
        },
      };
      const initial = window.tags.projectTags(ws);
      const prepare = window.tags.projectTags(ws, ["a", "b"]);
      return {
        catalog: initial.catalog,
        prepare: prepare.catalog,
        selected: window.tags.tagSelectionAfterAccess("UI对照", ws, ["a", "b"]),
        sameName: window.tags.tagSelectionAfterAccess("UI对照", ws, ["a"]),
      };
    },
    { tagDoc, note: note("base") },
  );
  assert.deepEqual(projection, {
    catalog: [["UI对照", 2]],
    prepare: [],
    selected: null,
    sameName: "UI对照",
  });
  results.push({ name: "authorized-projection-access-barrier", ...projection });
  // Real App renders local workspace, uses real optimistic saves and filters.
  await page.evaluate(() => window.unmount());
  const appNotes = [
    {
      ...note("tag-a"),
      document: tagDoc,
      plainText: "#UI对照",
      title: "#UI对照",
    },
    note("plain", "ordinary #not-a-tag"),
  ];
  const workspace = {
    notes: appNotes,
    attachments: [],
    folders: [
      {
        id: "default",
        name: "备忘录",
        kind: "default",
        parentId: null,
        sortOrder: 0,
        createdAt: 1,
      },
      {
        id: "trash",
        name: "最近删除",
        kind: "trash",
        parentId: null,
        sortOrder: 9,
        createdAt: 1,
      },
    ],
    settings: { selectedFolder: "default", selectedNote: "tag-a" },
  };
  await page.evaluate(
    (ws) => localStorage.setItem("notes-browser-preview", JSON.stringify(ws)),
    workspace,
  );
  await page.reload();
  await page.waitForFunction(() => window.mountApp);
  await page.evaluate(() => window.mountApp());
  await page.getByRole("button", { name: "#UI对照", exact: true }).waitFor();
  await page.getByRole("button", { name: "#UI对照", exact: true }).click();
  assert.equal(await page.locator(".note-row").count(), 1);
  assert.equal(await page.locator(".tiptap:visible").count(), 1);
  const parkedIdentity = await page.evaluate(() => {
    const e = document.querySelector(".tiptap").editor;
    window.appEditor = e;
    return !!e;
  });
  assert.equal(parkedIdentity, true);
  await page.evaluate(() => {
    const e = window.appEditor;
    e.view.dispatch(e.state.tr.insertText("x", 4));
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".note-row").length === 0,
  );
  assert.equal(await page.locator(".tiptap:visible").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "清除标签筛选" }).count(),
    1,
  );
  assert.equal(await page.evaluate(() => window.appEditor.isEditable), false);
  await page.getByRole("button", { name: "清除标签筛选" }).click();
  await page.waitForFunction(
    () => !!document.querySelector('.tiptap:not([contenteditable="false"])'),
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector(".tiptap").editor === window.appEditor,
    ),
    true,
  );
  await page.evaluate(() => window.appEditor.commands.undo());
  await page.getByRole("button", { name: "#UI对照", exact: true }).waitFor();
  results.push({
    name: "actual-App-last-reference-empty-park-clear-restores-instance-history",
    ok: true,
  });
  await page.getByRole("button", { name: "#UI对照", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索备忘录" }).fill("absent");
  await page.waitForFunction(
    () => document.querySelectorAll(".note-row").length === 0,
  );
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".note-row").length === 1,
  );
  results.push({ name: "actual-App-tag-and-text-search-clear", ok: true });
  await page.waitForFunction(() => !document.querySelector(".save-status"));
  await page.evaluate(async () => {
    await window.action({ type: "deleteNote", id: "tag-a" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".note-row").length === 0,
  );
  assert.equal(
    await page.getByRole("button", { name: "清除标签筛选" }).count(),
    1,
  );
  await page.evaluate(async () => {
    await window.action({ type: "restoreNote", id: "tag-a" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".note-row").length === 1,
  );
  await page.getByRole("button", { name: "#UI对照", exact: true }).waitFor();
  results.push({
    name: "actual-App-delete-restore-keeps-filter-empty-then-rebuilds",
    ok: true,
  });
  await page
    .locator(".folder-row")
    .filter({ hasText: /^备忘录/ })
    .first()
    .click();
  assert.equal(await page.locator(".note-row").count(), 2);
  results.push({ name: "actual-App-physical-folder-clears-tag", ok: true });
  await page.evaluate(() => {
    // Fail actual registerSaveIntent before bridge mutation, as on a device
    // with an unavailable secure identifier provider. No product callback mock.
    crypto.randomUUID = () => {
      throw Error("controlled-save-failure");
    };
    const e = document.querySelector(".tiptap").editor;
    e.commands.focus("end");
  });
  await page.locator(".tiptap:visible").click();
  await page.evaluate(() =>
    document.querySelector(".tiptap").editor.commands.setTextSelection("end"),
  );
  await page.keyboard.insertText(" #Pending");
  await page.keyboard.type(" ");
  await writeFile(
    resolve(output, "save-failure-debug.json"),
    JSON.stringify(
      await page.evaluate(() => ({
        docs: [...document.querySelectorAll(".tiptap")].map((x) =>
          x.editor.getJSON(),
        ),
        text: document.body.innerText,
      })),
      null,
      2,
    ),
  );
  await page.getByRole("button", { name: "#Pending", exact: true }).waitFor();
  await page.getByText("controlled-save-failure", { exact: false }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("notes-browser-preview"))
        .notes.find((n) => n.id === "tag-a")
        .plainText.includes("#Pending"),
    ),
    false,
  );
  results.push({
    name: "actual-App-pending-tag-preserved-with-save-registration-error-without-durable-write",
    ok: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        results,
        errors,
        sourceRoot: process.cwd(),
        limitations: [
          "Headless Chromium, not native runtime or pixel parity.",
          "Composition events are controlled browser events; real Android/iOS IME remains unknown.",
          "Access projection tested through production pure module; multiwindow native event transport remains covered by existing access checks.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Passed ${results.length} production tag checks: ${output}`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
