import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import ts from "typescript";
import { Editor } from "@tiptap/core";
import { history, undo, redo } from "@tiptap/pm/history";

const output = resolve("artifacts/search-selection");
await mkdir(output, { recursive: true });
async function productionModule(name) {
  const path = resolve(output, `${name}.mjs`);
  await writeFile(
    path,
    ts.transpileModule(await readFile(`src/${name}.ts`, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
  return import(pathToFileURL(path));
}
const { projectSearchNote } = await productionModule("search-selection");
const { toolbarState } = await productionModule("native-toolbar-state");
const { createEditorExtensions } = await productionModule("editor-schema");
const results = [];
function check(name, run) {
  run();
  results.push({ name, pass: true });
}
const selection = {
  searching: true,
  baseNoteId: "original",
  searchNoteId: null,
  resultIds: ["match"],
};
check("unique result, zero result, clear preserve the base selection", () => {
  const original = structuredClone(selection);
  assert.equal(projectSearchNote(selection), "match");
  assert.equal(projectSearchNote({ ...selection, resultIds: [] }), null);
  assert.equal(
    projectSearchNote({ ...selection, searching: false, resultIds: [] }),
    "original",
  );
  assert.deepEqual(selection, original);
});
check("explicit result selection is limited to actual matches", () => {
  assert.equal(
    projectSearchNote({
      ...selection,
      searchNoteId: "B",
      resultIds: ["A", "B"],
    }),
    "B",
  );
  assert.equal(
    projectSearchNote({
      ...selection,
      searchNoteId: "gone",
      resultIds: ["A", "B"],
    }),
    null,
  );
  assert.equal(
    projectSearchNote({ ...selection, searchNoteId: "gone", resultIds: ["B"] }),
    "B",
  );
});
check("mobile and independent-note paths keep their real selection", () => {
  assert.equal(
    projectSearchNote({ ...selection, searching: false, resultIds: [] }),
    "original",
  );
  assert.equal(
    projectSearchNote({ ...selection, searching: false, baseNoteId: null }),
    null,
  );
});
check(
  "zero-result native actions disabled and global new-note/search enabled",
  () => {
    const state = toolbarState({
      layout: "threeColumn",
      sidebar: true,
      settings: {},
      folderTitle: "搜索结果",
      folderCount: 0,
      query: "QA-NO-MATCH",
      searchAck: 3,
      available: true,
      editable: false,
      current: undefined,
      editor: null,
    });
    for (const name of [
      "format",
      "checklist",
      "table",
      "attachment",
      "share",
      "more",
    ])
      assert.equal(
        state.actions.find((a) => a.action === name)?.enabled,
        false,
        name,
      );
    assert.equal(
      state.actions.find((a) => a.action === "newNote")?.enabled,
      true,
    );
    assert.equal(state.search.enabled, true);
    const visit = (entry) => {
      if (entry.kind === "item")
        assert.equal(entry.enabled, false, entry.command);
      if (entry.kind === "submenu") entry.items.forEach(visit);
    };
    for (const owner of ["format", "attachment", "more"])
      state.menus.find((menu) => menu.owner === owner)?.items.forEach(visit);
  },
);
check(
  "installed Tiptap parking primitive keeps full document and Undo/Redo",
  () => {
    let updates = 0;
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "原正文" }] },
      ],
    };
    // Real production schema and installed Tiptap/ProseMirror, using Tiptap's
    // supported headless state. This does not mount React or prove native UI.
    const editor = new Editor({
      element: null,
      extensions: createEditorExtensions(),
      content: doc,
      onUpdate: () => updates++,
    });
    editor.view.updateState(editor.state.reconfigure({ plugins: [history()] }));
    editor.view.dispatch(editor.state.tr.insertText("，待保存", 4));
    const edited = editor.getJSON();
    const pending = new Map([["original", edited]]);
    const state = editor.state;
    assert.equal(updates, 1);
    editor.setEditable(false, false);
    assert.equal(editor.isEditable, false);
    assert.equal(projectSearchNote({ ...selection, resultIds: [] }), null);
    assert.equal(editor.state, state);
    assert.deepEqual(editor.getJSON(), edited);
    assert.equal(updates, 1);
    assert.equal(pending.get("original"), edited);
    assert.equal(
      projectSearchNote({ ...selection, searching: false }),
      "original",
    );
    editor.setEditable(true, false);
    assert.equal(editor.isEditable, true);
    assert.equal(editor.state, state);
    assert.equal(updates, 1);
    assert.equal(
      undo(editor.state, (tr) => editor.view.dispatch(tr)),
      true,
    );
    assert.equal(editor.state.doc.textContent, "原正文");
    assert.equal(
      redo(editor.state, (tr) => editor.view.dispatch(tr)),
      true,
    );
    assert.deepEqual(editor.getJSON(), edited);
  },
);
console.log(JSON.stringify({ tests: results.length, results }, null, 2));
