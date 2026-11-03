import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";

/** Keep every cell-internal LF, trailing empty cell, and final row LF. */
export function convertTableToText(editor: Editor): boolean {
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
