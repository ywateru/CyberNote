import { createContext, useContext } from "react";
import type { Editor } from "@tiptap/react";
import {
  desktopAttachmentAction,
  native,
  readAttachment,
  readClipboardAttachments,
} from "./bridge";

export const AttachmentTransferContext = createContext<{
  paste: (
    editor: Editor,
    files?: readonly File[],
    place?: () => number,
  ) => void;
}>({ paste: () => {} });
export const useAttachmentTransfer = () =>
  useContext(AttachmentTransferContext);
let browserFiles: File[] = [];
export async function copyAttachmentFile(id: string) {
  if (native && /Mac/.test(navigator.platform))
    return desktopAttachmentAction(id, "copy");
  const value = await readAttachment(id);
  const file = new File(
    [Uint8Array.from(atob(value.data), (c) => c.charCodeAt(0))],
    value.name,
    { type: value.mime },
  );
  if (
    navigator.clipboard?.write &&
    typeof ClipboardItem !== "undefined" &&
    ClipboardItem.supports?.(file.type)
  ) {
    await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
  }
  browserFiles = [file];
}
export async function clipboardAttachmentFiles(
  noteId: string,
): Promise<File[]> {
  if (native && /Mac/.test(navigator.platform))
    return readClipboardAttachments(noteId);
  if (browserFiles.length) return browserFiles;
  if (!navigator.clipboard?.read) throw Error("请使用系统粘贴快捷键粘贴图片");
  const files: File[] = [];
  for (const item of await navigator.clipboard.read()) {
    const mime = item.types.find((type) => type.startsWith("image/"));
    if (mime)
      files.push(
        new File(
          [await item.getType(mime)],
          `粘贴的图片-${Date.now()}.${mime.split("/")[1].replace("+xml", "")}`,
          { type: mime },
        ),
      );
  }
  return files;
}
