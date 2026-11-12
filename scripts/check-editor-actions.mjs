import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection, NodeSelection } from "@tiptap/pm/state";
import { history, undo, redo, undoDepth, redoDepth } from "@tiptap/pm/history";

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
const { convertTableToText, convertTextToTable, canConvertTextToTable } = await import(pathToFileURL(actionPath));
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
    isEditable: true,
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
  assert.equal(canConvertTextToTable(port), true);
  assert.equal(convertTextToTable(port), true);
  assert.deepEqual(state.doc.toJSON(), original.toJSON(), "Immediate full-block conversion restores cell-internal lines and original structure");
  assert.equal(undo(state, apply), true);
  assert.deepEqual(state.doc.toJSON(), converted, "One undo restores the selected text block");
  assert.equal(redo(state, apply), true);
  assert.deepEqual(state.doc.toJSON(), original.toJSON());
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
function textPort(content, from, to) {
  const doc = schema.nodeFromJSON({ type: "doc", content });
  let state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to), plugins: [history()] });
  const port = { isEditable: true, get state() { return state; }, view: { get state() { return state; }, dispatch(tr) { state = state.apply(tr); } } };
  return port;
}
for (const [name, lines, expected] of [
  ["tab-lines-and-trailing-empty-cell", ["a\tb", "c\t", ""], [["a", "b"], ["c", ""]]],
  ["ragged-rows-pad-empty-cells", ["a\tb\tc", "d"], [["a", "b", "c"], ["d", "", ""]]],
  ["spaces-unicode-and-empty-row", ["中文 \t  ", "", "末尾  "], [["中文 ", "  "], ["", ""], ["末尾  ", ""]]],
]) {
  const content = [text("before"), ...lines.map(text), text("after")];
  const doc = schema.nodeFromJSON({ type: "doc", content });
  const start = doc.firstChild.nodeSize, end = doc.content.size - doc.lastChild.nodeSize;
  const port = textPort(content, start + 1, end - 1);
  const original = port.state.doc;
  assert.equal(convertTextToTable(port), true, name);
  port.state.doc.check();
  const table = port.state.doc.child(1);
  assert.equal(table.type.name, "table");
  const rows = [];
  table.forEach(row => { const values = []; row.forEach(cell => values.push(cell.textContent)); rows.push(values); });
  assert.deepEqual(rows, expected, name);
  assert.equal(port.state.doc.firstChild.textContent, "before");
  assert.equal(port.state.doc.lastChild.textContent, "after");
  const converted = port.state.doc;
  assert.equal(undo(port.state, tr => port.view.dispatch(tr)), true);
  assert.ok(port.state.doc.eq(original));
  assert.equal(redo(port.state, tr => port.view.dispatch(tr)), true);
  assert.ok(port.state.doc.eq(converted));
  results.push({ name, textToTable: true, singleUndoRedo: true, surroundingsPreserved: true });
}
const partial = textPort([text("left A\tB right")], 6, 9);
assert.equal(convertTextToTable(partial), true);
assert.equal(partial.state.doc.firstChild.textContent, "left ");
assert.equal(partial.state.doc.lastChild.textContent, " right");
assert.equal(partial.state.doc.child(1).textContent, "AB");
// Preserve merged structure only for the untouched full converted block.
const merged = textPort([text("before"), {type:"table",content:[{type:"tableRow",content:[{type:"tableCell",attrs:{colspan:2,rowspan:1,colwidth:null},content:[text("joined"),text("line")] }]},{type:"tableRow",content:[{type:"tableCell",content:[text("a")]},{type:"tableCell",content:[text("b")]}]}]}, text("after")], 12, 12);
const mergedOriginal = merged.state.doc;
assert.equal(convertTableToText(merged), true);
assert.equal(convertTextToTable(merged), true);
assert.ok(merged.state.doc.eq(mergedOriginal), "merged spans and internal paragraphs survive immediate roundtrip");
assert.equal(convertTableToText(merged), true);
const convertedStart = merged.state.selection.from;
merged.view.dispatch(merged.state.tr.insertText("changed", convertedStart, convertedStart + 6));
merged.view.dispatch(merged.state.tr.setSelection(TextSelection.create(merged.state.doc, convertedStart, convertedStart + 7)));
assert.equal(convertTextToTable(merged), true);
assert.equal(merged.state.doc.child(1).textContent, "changed", "stale source snapshot cannot overwrite edited selected text");
const noSelection = textPort([text("abc")], 2, 2);
assert.equal(canConvertTextToTable(noSelection), false);
assert.equal(convertTextToTable(noSelection), false);
const readonly = textPort([text("a\tb")], 1, 4); readonly.isEditable = false;
assert.equal(convertTextToTable(readonly), false);
const media = textPort([text("a"), { type: "attachment", attrs: { id: "x", name: "x", kind: "file" } }, text("b")], 1, 6);
assert.equal(convertTextToTable(media), false);
media.view.dispatch(media.state.tr.setSelection(NodeSelection.create(media.state.doc, 3)));
assert.equal(convertTextToTable(media), false);
const huge = textPort([text("\t".repeat(100000))], 1, 100001);
assert.equal(convertTextToTable(huge), false);
// The live Store budgets every document node (not only logical cells).
const nodeCount = doc => { let count=1; doc.descendants(()=>{count++;}); return count; };
const rejectUnchanged = (port, name) => {
  const before=port.state, undoBefore=undoDepth(before), redoBefore=redoDepth(before);
  assert.equal(canConvertTextToTable(port),false,name+" capability");
  assert.equal(convertTextToTable(port),false,name+" execution");
  assert.equal(port.state,before,name+" dispatches no transaction");
  assert.equal(undoDepth(port.state),undoBefore);assert.equal(redoDepth(port.state),redoBefore);
};
const manyText = Array(35000).fill("x").join("\t");
rejectUnchanged(textPort([text(manyText)],1,manyText.length+1),"nonempty cells exceed whole-document node budget");
// Padding empty cells creates paragraph/cell nodes too, even without text.
const wide="x"+"\t".repeat(999), padded=textPort([text(wide),...Array.from({length:49},()=>text("x"))],1,wide.length+1+49*3);
rejectUnchanged(padded,"ragged padding consumes real nodes");
// Use accurate positions after constructing a large unselected surrounding tree.
const surrounded=textPort([...Array.from({length:99996},()=>text("")),text("a\tb")],199993,199996);
rejectUnchanged(surrounded,"surrounding unselected paragraphs count toward limit");
const almost=Array(33332).fill("x").join("\t");
const accepted=textPort([text(almost)],1,almost.length+1);
const tableType=schema.nodes.table, createTable=tableType.create;
let tableCreations=0;tableType.create=function(...args){tableCreations++;return createTable.apply(this,args);};
try { for(let i=0;i<100;i++)assert.equal(canConvertTextToTable(accepted),true);assert.equal(tableCreations,1,"capability caches one constant-size placeholder, not generated cells"); }
finally {tableType.create=createTable;}
assert.equal(convertTextToTable(accepted),true);assert.equal(nodeCount(accepted.state.doc),99999);
const withOneExtra=textPort([text(""),text(almost)],3,almost.length+3);
assert.equal(convertTextToTable(withOneExtra),true);assert.equal(nodeCount(withOneExtra.state.doc),100000,"exact node limit remains permitted");
const withTwoExtra=textPort([text(""),text(""),text(almost)],5,almost.length+5);
rejectUnchanged(withTwoExtra,"one node beyond exact limit is rejected");
// Valid old text can be at depth 62; table structure would reach depth 65.
let nested=text("a\tb");for(let i=0;i<60;i++)nested={type:"blockquote",content:[nested]};
rejectUnchanged(textPort([nested],61,64),"replacement respects root-based maximum depth");
// A reused source must be measured as its real structure, including empty
// paragraphs and merged cells, rather than the smaller flattened text grid.
const originalOversize=textPort([{type:"table",content:[{type:"tableRow",content:[{type:"tableCell",content:[{type:"paragraph",content:Array.from({length:100000},(_,i)=>({type:"text",text:"x",...(i%2?{marks:[{type:"bold"}]}:{})}))}]}]}]}],4,4);
assert.equal(convertTableToText(originalOversize),true);
rejectUnchanged(originalOversize,"immediate origin reuse checks actual source structure");
const delimiterOrigin=textPort([{type:"table",content:[{type:"tableRow",content:[{type:"tableCell",content:[text("x"+"\t".repeat(100000))]}]}]}],4,4);
const delimiterOriginal=delimiterOrigin.state.doc;
assert.equal(convertTableToText(delimiterOrigin),true);
assert.equal(canConvertTextToTable(delimiterOrigin),true,"origin grid budget uses cells, not delimiters inside a cell");
assert.equal(convertTextToTable(delimiterOrigin),true);assert.ok(delimiterOrigin.state.doc.eq(delimiterOriginal));
results.push({name:"whole-document-budget",nonemptyPaddingSurroundingsDepthOriginChecked:true,exact100000Permitted:true,rejectionsPreserveEntireState:true,capabilityCached:true});
results.push({ name: "partial-selection-and-invalid-boundaries", partialTextPreserved: true, emptyReadonlyNodeMediaOversizeRejected: true });
await writeFile(
  resolve(output, "actions-result.json"),
  JSON.stringify({ results }, null, 2) + "\n",
);
console.log(
  "Real schema/state/history: exact table conversion, selection, one Undo/Redo and outside-table boundary passed.",
);
