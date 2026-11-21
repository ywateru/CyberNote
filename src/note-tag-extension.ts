import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { Mapping } from "@tiptap/pm/transform";
import { validTagName } from "./note-tags";

const key = new PluginKey("notesCommittedTags");

type Range = { from: number; to: number };
type RangeStep = {
  from?: number;
  to?: number;
  pos?: number;
  gapFrom?: number;
  gapTo?: number;
};

function clampRange(range: Range, size: number): Range {
  const from = Math.max(0, Math.min(range.from, size));
  const to = Math.max(0, Math.min(range.to, size));
  return from <= to ? { from, to } : { from: to, to: from };
}

function mergeRanges(ranges: readonly Range[], size: number): Range[] {
  const ordered = ranges
    .map((range) => clampRange(range, size))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Range[] = [];
  for (const range of ordered) {
    const last = merged.at(-1);
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

/** Map prior dirty ranges and collect only the steps' actual edit ranges. */
function dirtyRanges(
  transactions: readonly Transaction[],
  previous: readonly Range[],
): Range[] {
  let ranges = [...previous];
  for (const transaction of transactions) {
    ranges = ranges.map((range) => ({
      from: transaction.mapping.map(range.from, -1),
      to: transaction.mapping.map(range.to, 1),
    }));
    transaction.steps.forEach((step, index) => {
      const source = step as RangeStep;
      const positions = [
        source.from,
        source.to,
        source.gapFrom,
        source.gapTo,
        source.pos,
      ].filter(
        (position): position is number =>
          typeof position === "number" && Number.isSafeInteger(position),
      );
      if (!positions.length) {
        ranges.push({ from: 0, to: transaction.doc.content.size });
        return;
      }
      const mapping = transaction.mapping.slice(index);
      ranges.push({
        from: mapping.map(Math.min(...positions), -1),
        to: mapping.map(Math.max(...positions), 1),
      });
    });
  }
  return mergeRanges(ranges, transactions.at(-1)?.doc.content.size ?? 0);
}

/** The complete text blocks touched by a set of document ranges. */
export function tagTextblocks(
  doc: PMNode,
  ranges: readonly Range[],
): { from: number; to: number }[] {
  const blocks = new Map<number, { from: number; to: number }>();
  const addAt = (position: number) => {
    let pos = Math.max(0, Math.min(position, doc.content.size));
    for (let attempt = 0; attempt < 2; attempt++) {
      const $pos = doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0; depth--) {
        const node = $pos.node(depth);
        if (!node.isTextblock) continue;
        const from = $pos.before(depth);
        blocks.set(from, { from, to: from + node.nodeSize });
        return;
      }
      if (!pos) return;
      pos--;
    }
  };
  for (const range of mergeRanges(ranges, doc.content.size)) {
    addAt(range.from);
    addAt(range.to);
    if (range.from === range.to) continue;
    doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (!node.isTextblock) return true;
      blocks.set(pos, { from: pos, to: pos + node.nodeSize });
      return false;
    });
  }
  return [...blocks.values()].sort((a, b) => a.from - b.from);
}

function cleanTagsInRanges(
  state: EditorState,
  ranges: readonly Range[],
  transaction: Transaction,
) {
  for (const block of tagTextblocks(state.doc, ranges)) {
    const parent = state.doc.nodeAt(block.from);
    if (!parent?.inlineContent) continue;
    let name: unknown,
      text = "",
      start = 0,
      end = 0,
      legal = true;
    const finish = () => {
      if (
        end > start &&
        (!legal || !validTagName(name) || text !== `#${name}`)
      )
        transaction.removeMark(
          start,
          end,
          state.schema.marks.noteTag,
        );
      name = undefined;
      text = "";
      start = end = 0;
      legal = true;
    };
    parent.forEach((child: PMNode, offset) => {
      const tag = child.marks.find((mark) => mark.type.name === "noteTag");
      if (!child.isText || !tag || tag.attrs.name !== name) finish();
      if (tag) {
        if (!end) start = block.from + 1 + offset;
        end = block.from + 1 + offset + child.nodeSize;
        name = tag.attrs.name;
        text += child.text || "";
        legal =
          legal &&
          child.isText &&
          !parent.type.spec.code &&
          !child.marks.some((mark) =>
            ["link", "code"].includes(mark.type.name),
          );
      }
    });
    finish();
  }
}

// Only the token immediately before the cursor is eligible. Never search old
// uncommitted text elsewhere in the document.
function candidateAt(doc: PMNode, to: number) {
  const $pos = doc.resolve(to);
  if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return;
  const before = $pos.parent.textBetween(
    0,
    $pos.parentOffset,
    "\ufffc",
    "\ufffc",
  );
  const match = /(?:^|\s)#([^\s#]+)$/.exec(before);
  if (!match || !validTagName(match[1])) return;
  const from = to - match[1].length - 1;
  let ordinary = true;
  doc.nodesBetween(from, to, (node) => {
    if (
      node.isInline &&
      (!node.isText ||
        node.marks.some((m) =>
          ["link", "code", "noteTag"].includes(m.type.name),
        ))
    )
      ordinary = false;
  });
  return ordinary ? { from, to, name: match[1] } : undefined;
}

export const NoteTag = Mark.create({
  name: "noteTag",
  addOptions() {
    return { allowCommit: true };
  },
  inclusive: false,
  // Link can be applied by the user first; appendTransaction then removes the
  // entire old tag span. Mutual exclusion here would prevent setLink itself.
  excludes: "noteTag code",
  addAttributes() {
    return { name: { default: undefined, isRequired: true } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-note-tag]",
        getAttrs: (element) => ({
          name: element.getAttribute("data-note-tag"),
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { name, ...rest } = HTMLAttributes;
    return [
      "span",
      mergeAttributes(rest, { "data-note-tag": name, class: "note-tag" }),
      0,
    ];
  },
  addExtensions() {
    return [NoteTagInput.configure({ allowCommit: this.options.allowCommit })];
  },
});

// Input priority is independent of the mark's schema rank, which must remain
// compatible with archived documents and the Rust schema manifest.
const NoteTagInput = Extension.create({
  name: "notesTagInput",
  priority: 1100,
  addOptions() {
    return { allowCommit: true };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const allowCommit = this.options.allowCommit;
    const writable = () => !editor.isDestroyed && editor.isEditable;
    type EnterCandidate = NonNullable<ReturnType<typeof candidateAt>> & {
      state: EditorState;
    };
    let entering: EnterCandidate | undefined;
    // Validate the loaded document once. After that, transactions only dirty
    // the blocks they actually changed. While composition is active, ranges
    // accumulate and are mapped forward for the real post-composition pass.
    let dirty: Range[] = [
      { from: 0, to: editor.state.doc.content.size },
    ];
    const enterCandidate = (view: EditorView) =>
      allowCommit && writable() && !view.composing && view.state.selection.empty
        ? candidateAt(view.state.doc, view.state.selection.from)
        : undefined;
    const plugin: Plugin = new Plugin({
      key,
      props: {
        handleKeyDown(view, event) {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.isComposing ||
            event.keyCode === 229
          )
            return false;
          const candidate = enterCandidate(view);
          if (!candidate) return false;
          entering = { ...candidate, state: view.state };
          try {
            // Execute the remaining handlers once, in their existing order.
            // This stack is the entire lifetime of the candidate; a blocked
            // Enter cannot lend it to a later transaction, even in this tick.
            let afterSelf = false;
            view.someProp("handleKeyDown", (handler) => {
              if (handler === plugin.props.handleKeyDown) {
                afterSelf = true;
                return false;
              }
              return afterSelf && handler(view, event);
            });
            // PM captureKeyDown also consumes Enter if no keymap handles it.
            // Consuming here prevents a second pass through those handlers.
            return true;
          } finally {
            entering = undefined;
          }
        },
        handleTextInput(view, from, to, text) {
          if (
            !allowCommit ||
            text !== " " ||
            view.composing ||
            !writable() ||
            from !== to
          )
            return false;
          const candidate = candidateAt(view.state.doc, from);
          if (!candidate) return false;
          view.dispatch(
            view.state.tr
              .insertText(" ", from, to)
              .addMark(
                candidate.from,
                from,
                view.state.schema.marks.noteTag.create({
                  name: candidate.name,
                }),
              )
              .scrollIntoView(),
          );
          return true;
        },
        handleDOMEvents: {
          beforeinput(view, event) {
            const input = event as InputEvent;
            if (
              input.inputType !== "insertParagraph" ||
              input.isComposing ||
              !input.cancelable ||
              !enterCandidate(view)
            )
              return false;
            // Soft keyboards need not emit keydown. PM's beforeinput handles
            // no insertParagraph, so use the same existing Enter keymaps.
            const enter = new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
            });
            const handled = view.someProp("handleKeyDown", (handler) =>
              handler(view, enter),
            );
            if (handled) input.preventDefault();
            return !!handled;
          },
          compositionend(view) {
            // Native compositionend is the release signal. A microtask lets
            // PM finish its synchronous handler; no timer guesses IME state.
            queueMicrotask(() => {
              if (writable() && !view.isDestroyed && !view.composing)
                view.dispatch(view.state.tr.setMeta(key, true));
            });
            return false;
          },
        },
      },
      appendTransaction(transactions, old, state) {
        dirty = dirtyRanges(transactions, dirty);
        const candidate = entering;
        // Tiptap's unsuccessful list commands can dispatch empty transactions
        // before the base keymap splits. Keep the candidate only across those
        // exact no-ops, within the synchronous handler stack above.
        entering =
          candidate &&
          old === candidate.state &&
          state.doc === old.doc &&
          state.selection.eq(old.selection)
            ? { ...candidate, state }
            : undefined;
        if (
          !writable() ||
          editor.view.composing ||
          !transactions.some((tr) => tr.docChanged || tr.getMeta(key))
        )
          return null;
        const tr = state.tr;
        if (candidate && old === candidate.state && state.selection.empty) {
          const mapping = new Mapping(
            transactions.flatMap((txn) => txn.mapping.maps),
          );
          const from = mapping.map(candidate.from, 1);
          const to = mapping.map(candidate.to, -1);
          const after = mapping.map(candidate.to, 1);
          const $to = state.doc.resolve(to),
            $after = state.doc.resolve(after);
          const mapped = candidateAt(state.doc, to);
          // A real Enter split inserts block boundaries at the old cursor:
          // the old token ends one textblock and the cursor starts another.
          // Text insertion, selection-only and unrelated edits cannot pass.
          if (
            to < after &&
            state.selection.from === after &&
            $to.parent.isTextblock &&
            $after.parent.isTextblock &&
            !$to.sameParent($after) &&
            $to.parentOffset === $to.parent.content.size &&
            $after.parentOffset === 0 &&
            mapped?.from === from &&
            mapped.name === candidate.name
          )
            tr.addMark(
              from,
              to,
              state.schema.marks.noteTag.create({ name: candidate.name }),
            );
        }
        if (!dirty.length)
          dirty = [{ from: state.selection.from, to: state.selection.to }];
        cleanTagsInRanges(state, dirty, tr);
        dirty = [];
        return tr.steps.length ? tr : null;
      },
    });
    return [plugin];
  },
});
