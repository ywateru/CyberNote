import type { Editor } from "@tiptap/core";
import { Fragment, type Node } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";

const tableTextOrigins = new WeakMap<
  Editor,
  { doc: Node; from: number; to: number; table: Node }
>();
// Keep aligned with store/archive/document.rs (root depth 0).
const MAX_DOCUMENT_NODES = 100_000;
const MAX_DOCUMENT_DEPTH = 64;
const MAX_TABLE_CELLS = MAX_DOCUMENT_NODES;
type Budget = { nodes: number; depth: number; valid: boolean };
const subtreeBudgets = new WeakMap<Node, Budget>();

function nodeBudget(node: Node): Budget {
  const cached = subtreeBudgets.get(node);
  if (cached) return cached;
  let nodes = 1,
    depth = 0,
    valid = true;
  node.forEach((child) => {
    const budget = nodeBudget(child);
    nodes += budget.nodes;
    depth = Math.max(depth, budget.depth + 1);
    valid &&= budget.valid;
  });
  if (node.type.spec.tableRole === "table") {
    let width = 0;
    node.forEach((row) => {
      let columns = 0;
      row.forEach((cell) => {
        columns += Number(cell.attrs.colspan ?? 1);
      });
      width = Math.max(width, columns);
    });
    valid &&= width * node.childCount <= MAX_TABLE_CELLS;
  }
  const budget = {
    nodes,
    depth,
    valid: valid && nodes <= MAX_DOCUMENT_NODES && depth <= MAX_DOCUMENT_DEPTH,
  };
  subtreeBudgets.set(node, budget);
  return budget;
}

type TextRows = { cells: string[][]; columns: number };
type ConversionPlan = TextRows & { source?: Node };
const conversionPlans = new WeakMap<
  Editor,
  { doc: Node; from: number; to: number; plan: ConversionPlan | null }
>();

/** Replace a constant-size table for fitting only. Its descendants are never
 * built in the capability projection; the actual row/cell/text budget replaces
 * the placeholder budget while measuring the fitted surrounding document. */
function fitsDocument(editor: Editor, budget: Budget): boolean {
  if (!budget.valid) return false;
  const { state } = editor;
  const schema = state.schema;
  const placeholder = schema.nodes.table.create(
    null,
    schema.nodes.tableRow.create(
      null,
      schema.nodes.tableCell.create(null, schema.nodes.paragraph.create()),
    ),
  );
  const fitted = state.tr.replaceRangeWith(
    state.selection.from,
    state.selection.to,
    placeholder,
  ).doc;
  if (fitted === state.doc) return false;
  // This fresh placeholder/fitted document never enters EditorState. Reuse the
  // immutable subtree meter, substituting only the planned table's budget.
  subtreeBudgets.set(placeholder, budget);
  return nodeBudget(fitted).valid;
}

function selectedTextRows(editor: Editor | null) {
  if (!editor || editor.isDestroyed || editor.isEditable === false) return null;
  const { state } = editor;
  if (!(state.selection instanceof TextSelection) || state.selection.empty)
    return null;
  const { from, to } = state.selection;
  let supported = true;
  state.doc.nodesBetween(from, to, (node) => {
    if (
      node.type.spec.tableRole ||
      (node.isAtom && !node.isText && node.type.name !== "hardBreak")
    ) {
      supported = false;
      return false;
    }
  });
  if (!supported) return null;
  const text = state.doc.textBetween(from, to, "\n", "\n");
  if (!text.length) return null;
  const rows = text.replace(/\r\n?/g, "\n").split("\n");
  if (rows.length > 1 && rows[rows.length - 1] === "") rows.pop();
  if (rows.length > MAX_TABLE_CELLS) return null;
  const cells = rows.map((row) => row.split("\t"));
  const columns = cells.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );
  if (cells.length * columns > MAX_TABLE_CELLS) return null;
  return { cells, columns };
}

function conversionPlan(editor: Editor | null): ConversionPlan | null {
  if (!editor || editor.isDestroyed || editor.isEditable === false) return null;
  const { doc, selection } = editor.state;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const { from, to } = selection;
  const cached = conversionPlans.get(editor);
  if (cached?.doc === doc && cached.from === from && cached.to === to)
    return cached.plan;
  const origin = tableTextOrigins.get(editor);
  const source =
    origin && origin.from === from && origin.to === to && origin.doc.eq(doc)
      ? origin.table
      : undefined;
  // Exact-origin content uses its real table structure, even if delimiters
  // inside one cell would exceed the ordinary-text grid budget.
  const rows = source ? { cells: [], columns: 0 } : selectedTextRows(editor);
  let plan: ConversionPlan | null = null;
  if (rows) {
    let nonempty = 0;
    for (const row of rows.cells)
      for (const cell of row) if (cell.length) nonempty++;
    const budget = source
      ? nodeBudget(source)
      : {
          nodes:
            1 +
            rows.cells.length +
            2 * rows.cells.length * rows.columns +
            nonempty,
          depth: nonempty ? 4 : 3,
          valid: true,
        };
    // The generated text is the existing selection with delimiters removed;
    // no text is added. The live Rust validator has no further text-size cap.
    if (budget.nodes <= MAX_DOCUMENT_NODES && fitsDocument(editor, budget))
      plan = { ...rows, source };
  }
  conversionPlans.set(editor, { doc, from, to, plan });
  return plan;
}

export function canConvertTextToTable(editor: Editor | null): boolean {
  return conversionPlan(editor) !== null;
}

/** Replace only the current text selection; all surrounding content is retained. */
export function convertTextToTable(editor: Editor): boolean {
  const parsed = conversionPlan(editor);
  if (!parsed) return false;
  const { state, view } = editor;
  const { from, to } = state.selection;
  const schema = state.schema;
  const table =
    parsed.source ??
    schema.nodes.table.create(
      null,
      parsed.cells.map((row) =>
        schema.nodes.tableRow.create(
          null,
          Array.from({ length: parsed.columns }, (_, column) =>
            schema.nodes.tableCell.create(
              null,
              schema.nodes.paragraph.create(
                null,
                row[column] ? schema.text(row[column]) : undefined,
              ),
            ),
          ),
        ),
      ),
    );
  const tr = closeHistory(state.tr).replaceRangeWith(from, to, table);
  if (!tr.docChanged || !nodeBudget(tr.doc).valid) return false;
  tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(from, -1))));
  view.dispatch(tr.scrollIntoView());
  view.dispatch(closeHistory(view.state.tr));
  tableTextOrigins.delete(editor);
  return true;
}

/** Keep every cell-internal LF, trailing empty cell, and final row LF. */
export function convertTableToText(editor: Editor): boolean {
  if (editor.isDestroyed || editor.isEditable === false) return false;
  const { state, view } = editor;
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== "table") depth--;
  if (!depth) return false;
  const table = $from.node(depth);
  const start = $from.before(depth);
  const rows: string[] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) =>
      cells.push(cell.textBetween(0, cell.content.size, "\n", "\n")),
    );
    rows.push(cells.join("\t"));
  });
  const text = rows.join("\n") + "\n";
  const paragraphs = text
    .split("\n")
    .map((line) =>
      state.schema.nodes.paragraph.create(
        null,
        line ? state.schema.text(line) : undefined,
      ),
    );
  const replacement = Fragment.from(paragraphs);
  const tr = closeHistory(state.tr).replaceWith(
    start,
    start + table.nodeSize,
    replacement,
  );
  tr.setSelection(
    TextSelection.create(tr.doc, start + 1, start + replacement.size - 1),
  );
  view.dispatch(tr.scrollIntoView());
  tableTextOrigins.set(editor, {
    doc: tr.doc,
    from: tr.selection.from,
    to: tr.selection.to,
    table,
  });
  // Separate the next keystroke from conversion without adding an Undo step.
  view.dispatch(closeHistory(view.state.tr));
  return true;
}

export function toggleListStyle(editor: Editor, style: "bullet" | "dash") {
  const active = editor.isActive("bulletList");
  if (active && editor.getAttributes("bulletList").listStyle === style)
    return editor.chain().toggleBulletList().run();
  const chain = editor.chain();
  if (!active) chain.toggleBulletList();
  return chain.updateAttributes("bulletList", { listStyle: style }).run();
}
