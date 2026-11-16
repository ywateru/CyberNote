import { parseAgentWindowEvent, parseAgentWindowReply, parseAgentReplyReceipt, type AgentWindowEvent, type AgentWindowReply } from "./agent-window";
import { appearancePatch } from "./themes/appearance";
import { presentationPatch } from "./presentation/model";
import { listen } from "@tauri-apps/api/event";
import { AccessChanged } from "./access-client";
import { validateDataManagement, type DataManagementSnapshot } from "./data-management";
import { MetadataGate, MetadataStale } from "./metadata-client";
import {
  parseFolder,
  parseSmartQuery,
  validateWorkspace,
} from "./smart-folders";
import { AccessGate } from "./access-client";
import { secureId } from "./secure-id";
import { attachmentRecordedAt } from "./recording-metadata";
import { attachmentMime } from "./attachment-mime";
import { parseSyncWindowEvent, parseSyncWindowReceipt, type SyncWindowEvent, type SyncWindowReply } from "./network-sync";
import type { AttachmentOperationResult } from "./attachment-submission";
import type {
  AccessEvent,
  AccessState,
  ActionDelivery,
  CommitReceipt,
  MetadataEvent,
  MetadataState,
} from "./types";
import { invoke as nativeInvoke, isTauri } from "@tauri-apps/api/core";
import { createProofInvoker, proofReceive, proofVerdict } from "./proof-access";
import {
  blankDoc,
  documentText,
  type Attachment,
  type Note,
  type Workspace,
  type Settings,
} from "./types";
export const native = isTauri();
const invoke =
  import.meta.env.VITE_ACCESS_BOUNDARY_PROOF === "1" && native
    ? createProofInvoker(nativeInvoke)
    : nativeInvoke;
export const accessGate = new AccessGate();
export const metadataGate = new MetadataGate();
const attachmentOwners = new Map<string, string>();
export const invalidateAccessRequests = () => accessGate.invalidate();
export async function subscribeNetworkSync(handler: (event: SyncWindowEvent) => void, onError: (error: unknown) => void) {
  if (!native) return () => {};
  return listen<unknown>("notes-sync", ({ payload }) => {
    try { handler(parseSyncWindowEvent(payload)); } catch (error) { onError(error); }
  });
}
export async function replyNetworkSync(reply: SyncWindowReply) {
  if (!native) throw Error("同步窗口协调需要本机应用");
  return parseSyncWindowReceipt(await invoke("sync_window_reply", { reply, expected: accessGate.expected() }), reply.operationId);
}
export async function subscribeAgentWindow(handler: (event: AgentWindowEvent) => void, onError: (error: unknown) => void) {
  if (!native) return () => {};
  return listen<unknown>("notes-agent", ({ payload }) => {
    try { handler(parseAgentWindowEvent(payload)); } catch (error) { onError(error); }
  });
}
export async function replyAgentWindow(reply: AgentWindowReply) {
  if (!native) throw Error("外部写窗口协调需要本机应用");
  return parseAgentReplyReceipt(await invoke("agent_window_reply", { reply: parseAgentWindowReply(reply), expected: accessGate.expected() }), reply.operationId);
}
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
export async function subscribeMetadata(
  handler: (event: MetadataEvent) => void,
) {
  if (!native) return () => {};
  return listen<MetadataEvent>("notes-metadata", ({ payload }) => {
    try {
      metadataGate.observe(payload.metadata, accessGate.state?.sessionId);
    } catch {
      handler(payload);
      return;
    } // Unknown process requires trusted synchronization.
    handler(payload);
  });
}
export function markWorkspaceApplied(value: Workspace) {
  metadataGate.markApplied(value.metadata);
  attachmentOwners.clear();
  value.attachments.forEach((a) => attachmentOwners.set(a.id, a.noteId));
}
function accept<T>(
  value: T,
  stamp: ReturnType<AccessGate["stamp"]>,
  mode: "read" | "save" | "transition" = "read",
): T {
  const state = (value as { access?: AccessState }).access;
  if (!state) throw Error("后端未提供授权状态");
  try {
    // Validate both gates before publishing either global access state or caches.
    // Same-epoch old workspaces may omit a newly created note's access entry.
    accessGate.accept(state, stamp, mode, false);
    const metadata = (value as { metadata?: MetadataState }).metadata;
    metadataGate.observe(metadata, state.sessionId);
    if (mode !== "save" && !metadataGate.canPublish(metadata))
      throw new MetadataStale();
    accessGate.accept(state, stamp, mode);
    if (import.meta.env.VITE_ACCESS_BOUNDARY_PROOF === "1")
      proofVerdict(value, true, mode);
  } catch (error) {
    if (import.meta.env.VITE_ACCESS_BOUNDARY_PROOF === "1")
      proofVerdict(value, false, mode, error);
    throw error;
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
export async function getDataManagement(): Promise<DataManagementSnapshot> {
  if (!native) throw Error("请在已安装的应用中查看真实本地文件信息");
  const stamp = accessGate.stamp();
  return validateDataManagement(accept(await invoke<DataManagementSnapshot>("get_data_management", { expected: accessGate.expected() }), stamp));
}
export async function exportAttachment(id: string, path: string): Promise<{ name: string; bytes: number; mime: string }> {
  const owner = attachmentOwners.get(id);
  if (!owner) throw Error("附件不存在，请刷新后重试");
  const stamp = accessGate.stamp(owner);
  const result = await invoke<{ name: string; bytes: number; mime: string }>("export_attachment", { id, path, expected: accessGate.expected(owner) });
  const now = accessGate.stamp(owner);
  if (stamp.generation !== now.generation || stamp.sessionId !== now.sessionId || stamp.epoch !== now.epoch || stamp.noteEpoch !== now.noteEpoch) throw new AccessChanged();
  if (!result || typeof result.name !== "string" || typeof result.mime !== "string" || !Number.isSafeInteger(result.bytes) || result.bytes < 0) throw Error("附件导出回执无效");
  return result;
}
export async function desktopAttachmentAction(id: string, action: "copy" | "open" | "reveal" | "share") {
  const owner = attachmentOwners.get(id);
  if (!native || !owner) throw Error("请在桌面应用中操作此附件");
  const stamp = accessGate.stamp(owner);
  await invoke("attachment_desktop", { id, action, expected: accessGate.expected(owner) });
  if (JSON.stringify(stamp) !== JSON.stringify(accessGate.stamp(owner))) throw new AccessChanged();
}
export async function readClipboardAttachments(noteId: string): Promise<File[]> {
  const stamp = accessGate.stamp(noteId);
  const value = await invoke<{ files: { name: string; mime: string; data: string }[] }>("attachment_desktop", {
    action: "readClipboard", noteId, expected: accessGate.expected(noteId),
  });
  if (JSON.stringify(stamp) !== JSON.stringify(accessGate.stamp(noteId))) throw new AccessChanged();
  return value.files.map(f => new File([Uint8Array.from(atob(f.data), c => c.charCodeAt(0))], f.name, { type: attachmentMime(f.mime, f.data) }));
}
export async function exportArchive(path: string) {
  await invoke("export_archive", { path, expected: accessGate.expected() });
}
export async function importArchive(
  path: string,
): Promise<ActionDelivery<Workspace>> {
  const stamp = accessGate.stamp();
  return deliverAction<Workspace>(stamp, "transition", () =>
    invoke("import_archive", { path, expected: accessGate.expected() }),
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
let previewSequence = 0;
const persist = (candidate: Workspace = preview) =>
  localStorage.setItem("notes-browser-preview", JSON.stringify(candidate));
export async function loadWorkspace(trusted = false): Promise<Workspace> {
  const stamp = accessGate.stamp();
  if (native) {
    const value = validateWorkspace(await invoke<Workspace>("load_workspace"));
    if (
      trusted &&
      stamp.generation === accessGate.generation &&
      value.access?.sessionId !== accessGate.state?.sessionId
    )
      accessGate.state = undefined;
    return accept(value, stamp);
  }
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
  value.metadata = { sessionId: "browser-preview", sequence: previewSequence };
  accessGate.accept(value.access, stamp);
  metadataGate.observe(value.metadata, value.access.sessionId);
  return value;
}
async function deliverAction<T>(
  stamp: ReturnType<AccessGate["stamp"]>,
  mode: "read" | "save" | "transition",
  run: () => Promise<T>,
): Promise<ActionDelivery<T>> {
  let value: T;
  try {
    value = await run();
    if (value && typeof value === "object" && "folders" in value)
      value = validateWorkspace(value as unknown as Workspace) as T;
  } catch (error) {
    const commit = (
      error as { commit?: { metadata: MetadataState; receipt: CommitReceipt } }
    )?.commit;
    if (!commit) throw error;
    let accessAccepted = false;
    if (mode === "save" && accessGate.state) {
      try {
        accessGate.accept(accessGate.state, stamp, "save");
        accessAccepted = true;
      } catch {}
    }
    try {
      metadataGate.observe(commit.metadata, accessGate.state?.sessionId);
    } catch {}
    return { ...commit, accessAccepted, maintenanceError: error };
  }
  const response = value as {
    receipt?: CommitReceipt;
    metadata?: MetadataState;
  };
  let accepted = false;
  try {
    accept(value, stamp, mode);
    accepted = true;
  } catch (error) {
    if (error instanceof MetadataStale) accepted = true;
    // The committed result/ID survives rejection of its access or metadata snapshot.
  }
  return {
    receipt: response.receipt,
    metadata: response.metadata,
    accessAccepted: accepted,
    ...(accepted &&
    (mode === "save" || metadataGate.canPublish(response.metadata))
      ? { value }
      : {}),
  };
}
export async function action<T = Workspace>(
  a: Record<string, unknown>,
): Promise<ActionDelivery<T>> {
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
    return deliverAction<T>(
      stamp,
      a.type === "saveNote" ? "save" : transition ? "transition" : "read",
      () =>
        invoke<T>("workspace_action", {
          action: a,
          expected: accessGate.expected(
            a.type === "recoverConflictCopy" && typeof a.id === "string"
              ? a.id
              : undefined,
          ),
        }),
    );
  }
  const n = preview.notes.find((x) => x.id === a.id);
  let result: unknown;
  switch (a.type) {
    case "createSmartFolder": {
      const input = a.input as { name: string; query: unknown };
      const folder = parseFolder({
        id: secureId(),
        name: input.name.trim(),
        parentId: null,
        kind: "smart",
        sortOrder: Date.now(),
        createdAt: Date.now(),
        query: parseSmartQuery(input.query),
        definitionRevision: 1,
      });
      preview.folders.push(folder);
      result = folder;
      break;
    }
    case "updateSmartFolder": {
      const input = a.input as {
        id: string;
        name: string;
        query: unknown;
        expectedDefinitionRevision: number;
      };
      const previous = preview.folders.find((f) => f.id === input.id);
      if (
        previous?.kind !== "smart" ||
        previous.definitionRevision !== input.expectedDefinitionRevision
      )
        throw Object.assign(Error("智能文件夹已改变，请重新载入"), {
          code: "smart_conflict",
        });
      const folder = parseFolder({
        ...previous,
        name: input.name.trim(),
        query: parseSmartQuery(input.query),
        definitionRevision: previous.definitionRevision + 1,
      });
      preview.folders = preview.folders.map((f) =>
        f.id === folder.id ? folder : f,
      );
      result = folder;
      break;
    }
    case "deleteSmartFolder": {
      const input = a.input as {
        id: string;
        expectedDefinitionRevision: number;
      };
      const previous = preview.folders.find((f) => f.id === input.id);
      if (
        previous?.kind !== "smart" ||
        previous.definitionRevision !== input.expectedDefinitionRevision
      )
        throw Object.assign(Error("智能文件夹已改变，请重新载入"), {
          code: "smart_conflict",
        });
      preview.folders = preview.folders.filter((f) => f.id !== input.id);
      break;
    }
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
        kind: "normal" as const,
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
    case "settings": {
      // Persist the validated candidate before publishing it as authority. A
      // quota failure must leave the next partial intent based on old storage.
      const candidate = { ...preview, settings: { ...preview.settings, ...presentationPatch(preview.settings, appearancePatch(preview.settings, a.settings as Settings)) } };
      persist(candidate);
      preview = candidate;
      break;
    }
    case "lockNote":
    case "unlockNote":
    case "removeLock":
      throw Error("笔记加密需在已安装的 Mac/Android 应用中使用");
  }
  if (a.type !== "settings") {
    persist();
    previewSequence++;
  }
  const value = structuredClone(result || preview) as T;
  const current = await loadWorkspace();
  const createdId = [
    "createNote",
    "createFolder",
    "createSmartFolder",
    "recoverConflictCopy",
  ].includes(String(a.type))
    ? (value as { id?: string }).id
    : undefined;
  return {
    value,
    accessAccepted: true,
    metadata: current.metadata,
    receipt: { changes: [], ...(createdId ? { createdId } : {}) },
  };
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
  const mime = attachmentMime(file.type, data);
  if (native) {
    const stamp = accessGate.stamp(noteId);
    const attachment: Attachment = accept(
      await invoke("store_attachment", {
        noteId,
        expected: accessGate.expected(noteId),
        name: file.name,
        mime,
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
    kind: mime.startsWith("image/")
      ? "image"
      : mime.startsWith("audio/")
        ? "audio"
        : mime.startsWith("video/")
          ? "video"
          : "file",
    relativePath: "",
    mime,
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
  const mime = attachmentMime(file.type, data);
  const result = accept<AttachmentOperationResult>(
    await invoke("store_attachment_operation", {
      operationId,
      noteId,
      name: file.name,
      mime,
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
export type AttachmentSourcePurpose = "original" | "thumbnail";
export type AttachmentSourceGrant = {
  leaseId: string; url: string; mime: string; bytes: number; name: string;
  width: number | null; height: number | null;
  attachmentId: string; noteId: string; purpose: AttachmentSourcePurpose;
};
export async function releaseAttachmentSource(leaseId: string): Promise<void> {
  if (!native) throw Object.assign(Error("媒体租约需要本机应用"), { code: "media_unavailable" });
  await invoke("release_attachment_source", { leaseId });
}
export async function acquireAttachmentSource(
  id: string, purpose: AttachmentSourcePurpose, pixels?: number,
): Promise<AttachmentSourceGrant> {
  if (!native) throw Object.assign(Error("本地媒体服务不可用"), { code: "media_unavailable" });
  const owner = attachmentOwners.get(id);
  if (!owner) throw Object.assign(Error("附件不存在"), { code: "not_found" });
  if (purpose !== "original" && purpose !== "thumbnail" ||
      purpose === "original" && pixels !== undefined ||
      purpose === "thumbnail" && (!Number.isSafeInteger(pixels) || pixels! < 1 || pixels! > 1024))
    throw Object.assign(Error("媒体用途或缩略图尺寸无效"), { code: "invalid" });
  const stamp = accessGate.stamp(owner);
  const result = await invoke<AttachmentSourceGrant>("acquire_attachment_source", {
    id, purpose, pixels: pixels ?? null, expected: accessGate.expected(owner),
  });
  // Even malformed/stale responses may already own a native lease. Never
  // publish them, and always ask the issuing real window to release them.
  try {
    const url = new URL(result.url);
    const positive = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
    if (!/^[a-f0-9]{32}$/.test(result.leaseId) || url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" || !url.port || url.username || url.password ||
        url.pathname !== `/media/${result.leaseId}` || url.search || url.hash ||
        result.attachmentId !== id || result.noteId !== owner || result.purpose !== purpose ||
        attachmentOwners.get(id) !== owner || typeof result.mime !== "string" || !result.mime ||
        typeof result.name !== "string" || !Number.isSafeInteger(result.bytes) || result.bytes < 0 ||
        (purpose === "thumbnail" ? result.mime !== "image/png" || !positive(result.width) || !positive(result.height) ||
          result.width! > pixels! || result.height! > pixels! : result.width !== null || result.height !== null))
      throw Object.assign(Error("媒体租约回执无效"), { code: "invalid" });
    accept(result, stamp);
    return result;
  } catch (error) {
    if (result && typeof result.leaseId === "string" && /^[a-f0-9]{32}$/.test(result.leaseId)) {
      // A rejected grant stays rejected even if IPC cleanup itself fails.
      // Native revocation/expiry remains the final cleanup backstop.
      try { await releaseAttachmentSource(result.leaseId); } catch { /* no publication */ }
    }
    throw error;
  }
}
export async function clearAttachmentMediaCache(): Promise<void> {
  if (!native) throw Object.assign(Error("缩略图缓存需要本机应用"), { code: "media_unavailable" });
  const stamp = accessGate.stamp();
  const result = accept(await invoke<{ cleared: boolean }>("clear_attachment_media_cache", {
    expected: accessGate.expected(),
  }), stamp);
  if (result.cleared !== true) throw Error("缩略图缓存清理回执无效");
}
export async function readAttachment(id: string): Promise<{
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
    r.onerror = () => reject(r.error || Error("无法读取附件文件，请重试"));
    r.onabort = () => reject(Error("附件读取已中断，文件已保留，请重试"));
    r.readAsDataURL(file);
  });
}
