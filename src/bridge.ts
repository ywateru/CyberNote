import { listen } from "@tauri-apps/api/event";
import { AccessGate } from "./access-client";
import { secureId } from "./secure-id";
import { attachmentRecordedAt } from "./recording-metadata";
import type { AttachmentOperationResult } from "./attachment-submission";
import type { AccessEvent, AccessState } from "./types";
import { invoke as nativeInvoke, isTauri } from "@tauri-apps/api/core";
import { createProofInvoker, proofReceive, proofVerdict } from "./proof-access";
import {
  blankDoc,
  documentText,
  type Attachment,
  type Note,
  type Workspace,
} from "./types";
export const native = isTauri();
const invoke =
  import.meta.env.VITE_ACCESS_BOUNDARY_PROOF === "1" && native
    ? createProofInvoker(nativeInvoke)
    : nativeInvoke;
export const accessGate = new AccessGate();
const attachmentOwners = new Map<string, string>();
export const invalidateAccessRequests = () => accessGate.invalidate();
export async function subscribeAccess(handler: (event: AccessEvent) => void) {
  if (!native) return () => {};
  return listen<AccessEvent>("notes-access", ({ payload }) => {
    if (
      import.meta.env.VITE_ACCESS_BOUNDARY_PROOF === "1" &&
      !proofReceive(payload)
    )
      return;
    accessGate.invalidate(payload.access);
    handler(payload);
  });
}
function accept<T>(
  value: T,
  stamp: ReturnType<AccessGate["stamp"]>,
  mode: "read" | "save" | "transition" = "read",
): T {
  const state = (value as { access?: AccessState }).access;
  if (!state) throw Error("后端未提供授权状态");
  try {
    accessGate.accept(state, stamp, mode);
    if (import.meta.env.VITE_ACCESS_BOUNDARY_PROOF === "1")
      proofVerdict(value, true, mode);
  } catch (error) {
    if (import.meta.env.VITE_ACCESS_BOUNDARY_PROOF === "1")
      proofVerdict(value, false, mode, error);
    throw error;
  }
  const attachments = (value as { attachments?: Attachment[] }).attachments;
  if (attachments) {
    attachmentOwners.clear();
    attachments.forEach((a) => attachmentOwners.set(a.id, a.noteId));
  }
  return value;
}
export async function registerSaveIntent(noteId: string): Promise<string> {
  const intent = secureId();
  if (native)
    await invoke("register_save_intent", {
      noteId,
      intent,
      expected: accessGate.expected(noteId),
    });
  return intent;
}
export async function acknowledgeAccess(operationId: string, success: boolean) {
  if (native) await invoke("acknowledge_access", { operationId, success });
}
export async function readNoteText(
  id: string,
): Promise<{ title: string; text: string }> {
  if (!native) {
    const n = preview.notes.find((n) => n.id === id);
    if (!n || n.locked) throw Error("请先解锁备忘录");
    return { title: n.title, text: n.plainText };
  }
  const stamp = accessGate.stamp(id);
  return accept(
    await invoke("read_note_text", { id, expected: accessGate.expected(id) }),
    stamp,
  );
}
export async function exportArchive(path: string) {
  await invoke("export_archive", { path, expected: accessGate.expected() });
}
export async function importArchive(path: string): Promise<Workspace> {
  const stamp = accessGate.stamp();
  return accept(
    await invoke("import_archive", { path, expected: accessGate.expected() }),
    stamp,
    "transition",
  );
}
const initial = (): Workspace => ({
  folders: [
    {
      id: "default",
      name: "备忘录",
      kind: "default",
      parentId: null,
      sortOrder: 0,
      createdAt: Date.now(),
    },
    {
      id: "quick",
      name: "快速备忘录",
      kind: "quick",
      parentId: null,
      sortOrder: -1,
      createdAt: Date.now(),
    },
    {
      id: "trash",
      name: "最近删除",
      kind: "trash",
      parentId: null,
      sortOrder: 9999,
      createdAt: Date.now(),
    },
  ],
  notes: [],
  attachments: [],
  settings: {},
});
function readPreview(): Workspace {
  if (native) return initial();
  try {
    return (
      JSON.parse(localStorage.getItem("notes-browser-preview") || "null") ||
      initial()
    );
  } catch {
    return initial();
  }
}
let preview: Workspace = readPreview();
const persist = () =>
  localStorage.setItem("notes-browser-preview", JSON.stringify(preview));
export async function loadWorkspace(): Promise<Workspace> {
  const stamp = accessGate.stamp();
  if (native) return accept(await invoke("load_workspace"), stamp);
  const value = structuredClone(preview);
  value.access = {
    sessionId: "browser-preview",
    epoch: 1,
    notes: Object.fromEntries(
      value.notes.map((n) => [n.id, { epoch: 0, authorized: !n.locked }]),
    ),
    suspended: [],
    operationId: null,
  };
  accessGate.accept(value.access, stamp);
  return value;
}
export async function action<T = Workspace>(
  a: Record<string, unknown>,
): Promise<T> {
  if (native) {
    const stamp = accessGate.stamp(typeof a.id === "string" ? a.id : undefined);
    const transition = [
      "lockNote",
      "unlockNote",
      "removeLock",
      "closeLocks",
      "deleteNote",
      "purgeNote",
      "deleteFolder",
    ].includes(String(a.type));
    const value = await invoke<T>("workspace_action", {
      action: a,
      expected: accessGate.expected(
        a.type === "recoverConflictCopy" && typeof a.id === "string"
          ? a.id
          : undefined,
      ),
    });
    return accept(
      value,
      stamp,
      a.type === "saveNote" ? "save" : transition ? "transition" : "read",
    );
  }
  const n = preview.notes.find((x) => x.id === a.id);
  let result: unknown;
  switch (a.type) {
    case "createNote": {
      const note: Note = {
        id: secureId(),
        folderId: String(a.folderId || "default"),
        document: structuredClone(blankDoc),
        title: "新备忘录",
        plainText: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        deletedAt: null,
        originalFolderId: null,
        locked: false,
        paperStyle: "plain",
        revision: 0,
      };
      preview.notes.unshift(note);
      result = note;
      break;
    }
    case "saveNote":
      if (n) {
        if (n.revision !== a.revision) throw Error("版本冲突");
        n.document = a.document as Note["document"];
        n.plainText = documentText(n.document);
        n.title = n.plainText.split("\n")[0] || "新备忘录";
        n.revision++;
        n.updatedAt = Date.now();
        result = n;
      }
      break;
    case "patchNote":
      if (n) {
        if (a.pinned !== undefined) n.pinned = Boolean(a.pinned);
        if (a.folderId) n.folderId = String(a.folderId);
        if (a.paperStyle) n.paperStyle = String(a.paperStyle);
        n.revision++;
        result = n;
      }
      break;
    case "deleteNote":
      if (n) {
        n.originalFolderId = n.folderId;
        n.folderId = "trash";
        n.deletedAt = Date.now();
        n.revision++;
      }
      break;
    case "restoreNote":
      if (n) {
        n.folderId = n.originalFolderId || "default";
        n.deletedAt = null;
        n.revision++;
      }
      break;
    case "purgeNote":
      preview.notes = preview.notes.filter((x) => x.id !== a.id);
      break;
    case "createFolder": {
      const f = {
        id: secureId(),
        name: String(a.name),
        kind: "normal",
        parentId: (a.parentId as string | null) || null,
        sortOrder: Date.now(),
        createdAt: Date.now(),
      };
      preview.folders.push(f);
      result = f;
      break;
    }
    case "renameFolder": {
      const f = preview.folders.find((x) => x.id === a.id);
      if (f) f.name = String(a.name);
      break;
    }
    case "deleteFolder":
      preview.folders = preview.folders.filter((x) => x.id !== a.id);
      preview.notes.forEach((x) => {
        if (x.folderId === a.id) {
          x.folderId = "trash";
          x.deletedAt = Date.now();
          x.originalFolderId = "default";
        }
      });
      break;
    case "settings":
      preview.settings = { ...preview.settings, ...(a.settings as object) };
      break;
    case "lockNote":
    case "unlockNote":
    case "removeLock":
      throw Error("笔记加密需在已安装的 Mac/Android 应用中使用");
  }
  persist();
  return structuredClone(result || preview) as T;
}
export async function storeAttachment(
  noteId: string,
  file: File,
  recordedAt?: number,
): Promise<Attachment> {
  const date = attachmentRecordedAt(
    recordedAt,
    file.type.startsWith("audio/") ? "audio" : "file",
  );
  if (native && date !== undefined)
    throw Error("录音日期必须通过原附件持久操作提交");
  const data = await fileBase64(file);
  if (native) {
    const stamp = accessGate.stamp(noteId);
    const attachment: Attachment = accept(
      await invoke("store_attachment", {
        noteId,
        expected: accessGate.expected(noteId),
        name: file.name,
        mime: file.type || "application/octet-stream",
        data,
      }),
      stamp,
    );
    attachmentOwners.set(attachment.id, noteId);
    return attachment;
  }
  const a: Attachment = {
    id: secureId(),
    noteId,
    kind: file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "file",
    relativePath: "",
    mime: file.type,
    displayName: file.name,
    size: file.size,
    ...(date === undefined ? {} : { recordedAt: date }),
  };
  preview.attachments.push(a);
  localStorage.setItem(`preview-file-${a.id}`, data);
  persist();
  return a;
}
export async function storeAttachmentOperation(
  operationId: string,
  noteId: string,
  file: File,
  recordedAt?: number,
): Promise<AttachmentOperationResult> {
  if (!native) throw Error("附件持久提交请在已安装的应用中使用");
  // Capture before file reading: a focus/access change during FileReader
  // must reject the result, even if the backend has already stored bytes.
  const stamp = accessGate.stamp(noteId);
  const expected = accessGate.expected(noteId);
  const date = attachmentRecordedAt(
    recordedAt,
    file.type.startsWith("audio/") ? "audio" : "file",
  );
  const data = await fileBase64(file);
  const result = accept<AttachmentOperationResult>(
    await invoke("store_attachment_operation", {
      operationId,
      noteId,
      name: file.name,
      mime: file.type || "application/octet-stream",
      data,
      expected,
      ...(date === undefined ? {} : { recordedAt: date }),
    }),
    stamp,
  );
  if (result.attachment)
    attachmentOwners.set(result.attachment.id, result.attachment.noteId);
  return result;
}
async function attachmentOperationCommand(
  command: "query_attachment_operation" | "cancel_attachment_operation",
  operationId: string,
  noteId: string,
): Promise<AttachmentOperationResult> {
  if (!native) throw Error("附件持久提交请在已安装的应用中使用");
  const stamp = accessGate.stamp(noteId);
  const result = accept<AttachmentOperationResult>(
    await invoke(command, {
      operationId,
      noteId,
      expected: accessGate.expected(noteId),
    }),
    stamp,
  );
  if (result.attachment)
    attachmentOwners.set(result.attachment.id, result.attachment.noteId);
  return result;
}
export const queryAttachmentOperation = (operationId: string, noteId: string) =>
  attachmentOperationCommand("query_attachment_operation", operationId, noteId);
export const cancelAttachmentOperation = (
  operationId: string,
  noteId: string,
) =>
  attachmentOperationCommand(
    "cancel_attachment_operation",
    operationId,
    noteId,
  );
export async function readAttachment(
  id: string,
): Promise<{
  data: string;
  mime: string;
  name: string;
  recordedAt?: number | null;
}> {
  if (native) {
    const noteId = attachmentOwners.get(id);
    if (!noteId) throw Error("附件不存在");
    const stamp = accessGate.stamp(noteId);
    return accept(
      await invoke("read_attachment", {
        id,
        expected: accessGate.expected(noteId),
      }),
      stamp,
    );
  }
  const a = preview.attachments.find((x) => x.id === id);
  return {
    data: localStorage.getItem(`preview-file-${id}`) || "",
    mime: a?.mime || "",
    name: a?.displayName || "",
    recordedAt: attachmentRecordedAt(a?.recordedAt, a?.kind || "file"),
  };
}
export function fileBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
