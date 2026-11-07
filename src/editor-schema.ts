import {
  Extension,
  Node,
  mergeAttributes,
  type NodeViewRenderer,
} from "@tiptap/core";
import { NoteTag } from "./note-tag-extension";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, TextSelection } from "@tiptap/pm/state";

const LiteralTab = Extension.create({
  name: "notesLiteralTab",
  // Table navigation and list indentation retain their normal first chance.
  priority: 50,
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            if (
              event.key !== "Tab" ||
              event.shiftKey ||
              event.ctrlKey ||
              event.altKey ||
              event.metaKey ||
              event.isComposing ||
              event.keyCode === 229 ||
              view.composing ||
              editor.isDestroyed ||
              !editor.isEditable ||
              !(view.state.selection instanceof TextSelection) ||
              !view.state.selection.$from.parent.isTextblock ||
              !view.state.selection.$to.parent.isTextblock ||
              view.state.selection.$from.parent.type.spec.code ||
              view.state.selection.$to.parent.type.spec.code
            )
              return false;
            view.dispatch(view.state.tr.insertText("\t").scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});

const ListStyle = Extension.create({
  name: "notesListStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["bulletList"],
        attributes: {
          listStyle: {
            default: "bullet",
            parseHTML: (element) =>
              element.getAttribute("data-list-style") === "dash"
                ? "dash"
                : "bullet",
            renderHTML: (attrs) => ({ "data-list-style": attrs.listStyle }),
          },
        },
      },
    ];
  },
});

// This factory is used by the real editor and the archive schema crosscheck.
// Node-view implementations affect rendering only; their schema is shared.
export const AttachmentNode = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: "" },
      name: { default: "附件" },
      kind: { default: "file" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-attachment]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-attachment": "" })];
  },
});
export const DrawingNode = Node.create({
  name: "drawing",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { strokes: { default: [] } };
  },
  parseHTML() {
    return [{ tag: "div[data-drawing]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-drawing": "" })];
  },
});
export function createEditorExtensions(
  views: Partial<Record<"attachment" | "drawing", NodeViewRenderer>> = {},
  options: { allowTags?: boolean } = {},
) {
  const withView = (node: Node, view?: NodeViewRenderer) =>
    view ? node.extend({ addNodeView: () => view }) : node;
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false },
      trailingNode: { notAfter: ["heading", "paragraph"] },
    }),
    NoteTag.configure({ allowCommit: options.allowTags !== false }),
    LiteralTab,
    ListStyle,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true } }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    withView(AttachmentNode, views.attachment),
    withView(DrawingNode, views.drawing),
    Placeholder.configure({ placeholder: "" }),
  ];
}
