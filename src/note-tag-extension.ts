import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { Mapping } from "@tiptap/pm/transform";
import { validTagName } from "./note-tags";

const key = new PluginKey("notesCommittedTags");

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
  // Observe candidate Enter before the existing list/table/base keymaps.
  priority: 1100,
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
  addProseMirrorPlugins() {
    const editor = this.editor;
    const allowCommit = this.options.allowCommit;
    const writable = () => !editor.isDestroyed && editor.isEditable;
    type EnterCandidate = NonNullable<ReturnType<typeof candidateAt>> & {
      state: EditorState;
    };
    let entering: EnterCandidate | undefined;
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
        state.doc.descendants((parent, pos) => {
          if (!parent.inlineContent) return;
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
              tr.removeMark(start, end, state.schema.marks.noteTag);
            name = undefined;
            text = "";
            start = end = 0;
            legal = true;
          };
          parent.forEach((child: PMNode, offset) => {
            const tag = child.marks.find(
              (mark) => mark.type.name === "noteTag",
            );
            if (!child.isText || !tag || tag.attrs.name !== name) finish();
            if (tag) {
              if (!end) start = pos + 1 + offset;
              end = pos + 1 + offset + child.nodeSize;
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
          return false;
        });
        return tr.steps.length ? tr : null;
      },
    });
    return [plugin];
  },
});
