import { save } from "@tauri-apps/plugin-dialog";
import { exportAttachment, native, readAttachment } from "./bridge";

/** All three image/file surfaces share the same original-byte export path. */
const pending = new Map<string, Promise<boolean>>();
export const attachmentExportPending = () => pending.size > 0;
export function saveAttachmentOriginal(id: string, name: string, current?: () => boolean): Promise<boolean> {
  const existing = pending.get(id);
  if (existing) return existing;
  const work = writeOriginal(id, name, current);
  pending.set(id, work);
  void work.finally(() => { if (pending.get(id) === work) pending.delete(id); }).catch(() => {});
  return work;
}
async function writeOriginal(id: string, name: string, current?: () => boolean): Promise<boolean> {
  const allowed = () => !current || current();
  if (!allowed()) return false;
  if (!native) {
    const value = await readAttachment(id);
    if (!allowed()) return false;
    const link = document.createElement("a");
    link.href = `data:${value.mime};base64,${value.data}`;
    link.download = value.name;
    link.click();
    return true;
  }
  const path = await save({ defaultPath: name });
  if (path === null) return false;
  if (!allowed()) return false;
  // The bridge captures fresh original-owner authority after the picker returns.
  await exportAttachment(id, path);
  return true;
}
