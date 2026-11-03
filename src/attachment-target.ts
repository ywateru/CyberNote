import type { JSONContent } from "@tiptap/react";
import type { AccessStamp } from "./access-client";
import { documentsEqual } from "./document-equality";

export interface AttachmentTarget<Editor, Bookmark> {
  noteId: string;
  scope: string;
  stamp: AccessStamp;
  editor: Editor;
  owner: string;
  bookmark: Bookmark;
  documentVersion: number;
  externalVersion: number;
  document: JSONContent;
  trustedDocument: JSONContent;
  invalidated: boolean;
}

export interface AttachmentTargetSnapshot<Editor> {
  noteId: string | null;
  scope: string;
  stamp: AccessStamp;
  editor: Editor | null;
  owner: string | undefined;
  documentVersion: number;
  externalVersion: number;
  editorDocument: JSONContent | undefined;
  trustedDocument: JSONContent | undefined;
  trustedSynchronization: boolean;
  available: boolean;
}

/** Only a successful current trusted sync may replace a renderer generation.
 * Backend identity and the captured target/owner/document remain mandatory. */
export function rebindAttachmentTarget<Editor, Bookmark>(
  target: AttachmentTarget<Editor, Bookmark>,
  live: AttachmentTargetSnapshot<Editor>,
): AccessStamp {
  const original = target.stamp;
  const stamp = live.stamp;
  if (
    target.invalidated ||
    !live.trustedSynchronization ||
    !live.available ||
    !original.sessionId ||
    original.epoch === undefined ||
    original.noteEpoch === undefined ||
    stamp.sessionId !== original.sessionId ||
    stamp.epoch !== original.epoch ||
    stamp.noteEpoch !== original.noteEpoch ||
    stamp.noteId !== target.noteId ||
    original.noteId !== target.noteId ||
    live.noteId !== target.noteId ||
    live.scope !== target.scope ||
    live.editor !== target.editor ||
    live.owner !== target.owner ||
    target.owner !== target.noteId ||
    live.documentVersion !== target.documentVersion ||
    live.externalVersion !== target.externalVersion ||
    !live.editorDocument ||
    !live.trustedDocument ||
    !documentsEqual(target.document, live.editorDocument) ||
    !documentsEqual(target.trustedDocument, live.trustedDocument)
  )
    throw Error(
      "原附件目标、正文或授权状态已改变；已保留恢复身份，请勿关闭窗口",
    );
  return { ...stamp };
}
