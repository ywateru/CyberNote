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
const { projectSearchNote, shouldClearSearchAfterAccessChange } =
  await productionModule("search-selection");
const { SearchEditorGate } = await productionModule("search-editor-gate");
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
    const gate = new SearchEditorGate();
    gate.park(editor);
    assert.equal(editor.isEditable, false);
    gate.restore(editor, true, false);
    assert.equal(editor.isEditable, false, "late restore must remain parked");
    assert.equal(projectSearchNote({ ...selection, resultIds: [] }), null);
    assert.equal(editor.state, state);
    assert.deepEqual(editor.getJSON(), edited);
    assert.equal(updates, 1);
    assert.equal(pending.get("original"), edited);
    assert.equal(
      projectSearchNote({ ...selection, searching: false }),
      "original",
    );
    gate.activate(editor, true);
    assert.equal(
      editor.isEditable,
      false,
      "access freeze wins over visibility",
    );
    gate.activate(editor, false);
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
check(
  "unrelated parked-note access change keeps the valid visible target",
  () => {
    assert.equal(shouldClearSearchAfterAccessChange(true, "B", ["A"]), false);
    assert.equal(shouldClearSearchAfterAccessChange(true, "B", ["B"]), true);
    assert.equal(shouldClearSearchAfterAccessChange(true, null, ["A"]), true);
    assert.equal(shouldClearSearchAfterAccessChange(false, "B", ["A"]), true);
    const querySurvives = !shouldClearSearchAfterAccessChange(true, "B", ["A"]);
    assert.equal(
      projectSearchNote({
        searching: querySurvives,
        baseNoteId: "A",
        searchNoteId: null,
        resultIds: ["B"],
      }),
      "B",
    );
  },
);
check(
  "prepare then park then late abort/conflict/paper restore has one writer",
  () => {
    const create = () =>
      new Editor({
        element: null,
        extensions: createEditorExtensions(),
        content: { type: "doc", content: [{ type: "paragraph" }] },
      });
    for (const reason of [
      "access-abort",
      "conflict-copy-finally",
      "paper-close",
    ]) {
      const original = create();
      const match = create();
      const gate = new SearchEditorGate();
      original.setEditable(false, false); // Existing prepare/conflict/paper freeze.
      gate.park(original);
      gate.restore(original, true, false); // The actual shared production restore.
      assert.equal(original.isEditable, false, reason);
      assert.equal(match.isEditable, true, reason);
      gate.park(match); // Host layout cleanup freezes a removed result first.
      gate.activate(original, true);
      assert.equal(original.isEditable, false, reason);
      gate.activate(original, false);
      assert.equal(original.isEditable, true, reason);
      assert.equal(match.isEditable, false, reason);
      gate.park(original);
      gate.restore(original, false, false);
      gate.activate(original, false);
      assert.equal(
        original.isEditable,
        false,
        "explicit false is not overridden",
      );
    }
  },
);
console.log(JSON.stringify({ tests: results.length, results }, null, 2));
