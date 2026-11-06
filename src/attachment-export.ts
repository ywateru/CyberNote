import { save } from "@tauri-apps/plugin-dialog";
import { exportAttachment, native, readAttachment } from "./bridge";

/** All three image/file surfaces share the same original-byte export path. */
export async function saveAttachmentOriginal(id: string, name: string): Promise<boolean> {
  if (!native) {
    const value = await readAttachment(id);
    const link = document.createElement("a");
    link.href = `data:${value.mime};base64,${value.data}`;
    link.download = value.name;
    link.click();
    return true;
  }
  const path = await save({ defaultPath: name });
  if (path === null) return false;
  // The bridge captures fresh original-owner authority after the picker returns.
  await exportAttachment(id, path);
  return true;
}
