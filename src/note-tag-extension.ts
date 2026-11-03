import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { validTagName } from "./note-tags";

const key = new PluginKey("notesCommittedTags");

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
  addProseMirrorPlugins() {
    const editor = this.editor;
    const allowCommit = this.options.allowCommit;
    const writable = () => !editor.isDestroyed && editor.isEditable;
    return [
      new Plugin({
        key,
        props: {
          handleTextInput(view, from, to, text) {
            if (
              !allowCommit ||
              text !== " " ||
              view.composing ||
              !writable() ||
              from !== to
            )
              return false;
            const $pos = view.state.doc.resolve(from);
            if (!$pos.parent.isTextblock || $pos.parent.type.spec.code)
              return false;
            const before = $pos.parent.textBetween(
              0,
              $pos.parentOffset,
              "\ufffc",
              "\ufffc",
            );
            const match = /(?:^|\s)#([^\s#]+)$/.exec(before);
            if (!match || !validTagName(match[1])) return false;
            const start = from - match[1].length - 1;
            let ordinary = true;
            view.state.doc.nodesBetween(start, from, (node) => {
              if (
                node.isInline &&
                (!node.isText ||
                  node.marks.some((m) =>
                    ["link", "code", "noteTag"].includes(m.type.name),
                  ))
              )
                ordinary = false;
            });
            if (!ordinary) return false;
            view.dispatch(
              view.state.tr
                .insertText(" ", from, to)
                .addMark(
                  start,
                  from,
                  view.state.schema.marks.noteTag.create({ name: match[1] }),
                )
                .scrollIntoView(),
            );
            return true;
          },
          handleDOMEvents: {
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
        appendTransaction(transactions, _old, state) {
          if (
            !writable() ||
            editor.view.composing ||
            !transactions.some((tr) => tr.docChanged || tr.getMeta(key))
          )
            return null;
          const tr = state.tr;
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
      }),
    ];
  },
});
