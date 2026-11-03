import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";

// Compile the real production modules; all document/selection/history work is
// performed by the installed ProseMirror implementation, without DOM or mocks.
await import("./check-editor-schema.mjs");
const output = resolve("artifacts/editor-schema");
const actionPath = resolve(output, "editor-actions.mjs");
await writeFile(
  actionPath,
  ts.transpileModule(await readFile("src/editor-actions.ts", "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const { createEditorExtensions } = await import(
  pathToFileURL(resolve(output, "editor-schema.mjs"))
);
const { convertTableToText } = await import(pathToFileURL(actionPath));
const schema = getSchema(createEditorExtensions());
const text = (value) => ({
  type: "paragraph",
  ...(value ? { content: [{ type: "text", text: value }] } : {}),
});
const table = (rows) => ({
  type: "table",
  content: rows.map((row) => ({
    type: "tableRow",
    content: row.map((cell) => ({
      type: "tableCell",
      content: cell.map(text),
    })),
  })),
});
const results = [];
for (const [name, rows, expected] of [
  [
    "ordinary-2x2",
    [
      [["项目"], ["状态"]],
      [["本地保存"], ["待核对"]],
    ],
    "项目\t状态\n本地保存\t待核对\n",
  ],
  [
    "internal-LF-and-empty-last-cell",
    [
      [["A1", "A2"], ["C"]],
      [["B2"], [""]],
    ],
    "A1\nA2\tC\nB2\t\n",
  ],
]) {
  const original = schema.nodeFromJSON({
    type: "doc",
    content: [text("before"), table(rows), text("after")],
  });
  original.check();
  let pos;
  original.descendants((node, offset) => {
    if (pos === undefined && node.type.name === "tableCell") pos = offset + 2;
  });
  let state = EditorState.create({
    schema,
    doc: original,
    selection: TextSelection.create(original, pos),
    plugins: [history()],
  });
  const port = {
    get state() {
      return state;
    },
    view: {
      get state() {
        return state;
      },
      dispatch(transaction) {
        state = state.apply(transaction);
      },
    },
  };
  assert.equal(convertTableToText(port), true);
  state.doc.check();
  assert.equal(
    state.doc.textBetween(state.selection.from, state.selection.to, "\n", "\n"),
    expected,
  );
  assert.equal(state.doc.firstChild.textContent, "before");
  assert.equal(state.doc.lastChild.textContent, "after");
  const converted = state.doc.toJSON();
  const apply = (transaction) => {
    state = state.apply(transaction);
  };
  assert.equal(undo(state, apply), true);
  assert.deepEqual(
    state.doc.toJSON(),
    original.toJSON(),
    "A single Undo must restore the full original table",
  );
  assert.equal(redo(state, apply), true);
  assert.deepEqual(state.doc.toJSON(), converted);
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 1)),
  );
  assert.equal(
    convertTableToText(port),
    false,
    "Outside a table, conversion must do nothing",
  );
  results.push({
    name,
    expected,
    exactSelectedText: true,
    singleUndoRestoresTable: true,
    redoRestoresConversion: true,
    surroundingParagraphsPreserved: true,
    outsideTableNoop: true,
  });
}
await writeFile(
  resolve(output, "actions-result.json"),
  JSON.stringify({ results }, null, 2) + "\n",
);
console.log(
  "Real schema/state/history: exact table conversion, selection, one Undo/Redo and outside-table boundary passed.",
);
