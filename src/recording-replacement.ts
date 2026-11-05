import type { Editor } from "@tiptap/core";
import type { SelectionBookmark } from "@tiptap/pm/state";
import type { Attachment } from "./types";

/** Never fall back to a cursor insertion when the previous card was removed. */
export function replaceRecordingAttachment(
  editor: Editor,
  bookmark: SelectionBookmark,
  attachment: Attachment,
  previous?: Attachment,
) {
  if (!previous) {
    const selection = bookmark.resolve(editor.state.doc);
    if (
      !editor.commands.insertContentAt(
        { from: selection.from, to: selection.to },
        {
          type: "attachment",
          attrs: {
            id: attachment.id,
            name: attachment.displayName,
            kind: attachment.kind,
          },
        },
        { updateSelection: false },
      )
    )
      throw Error("原编辑器未接受录音，音频仍保留。");
    return;
  }
  const matches: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "attachment" && node.attrs.id === previous.id) {
      if (node.attrs.kind !== "audio")
        throw Error("原录音节点类型已改变，原音频仍保留。");
      matches.push(pos);
    }
  });
  if (matches.length !== 1)
    throw Error("原录音节点已移除或重复，音频仍保留；不会重新插入。");
  const node = editor.state.doc.nodeAt(matches[0])!;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(matches[0], undefined, {
      ...node.attrs,
      id: attachment.id,
      name: attachment.displayName,
      kind: "audio",
    }),
  );
}

export function recordingAttachmentReferencedOnce(
  editor: Editor,
  attachment: Attachment,
) {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (
      node.type.name === "attachment" &&
      node.attrs.id === attachment.id &&
      node.attrs.kind === "audio"
    )
      count++;
  });
  return count === 1;
}
