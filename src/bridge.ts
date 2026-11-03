import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  blankDoc,
  documentText,
  type Attachment,
  type Note,
  type Workspace,
} from "./types";
export const native = isTauri();
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
  return native ? invoke("load_workspace") : structuredClone(preview);
}
export async function action<T = Workspace>(
  a: Record<string, unknown>,
): Promise<T> {
  if (native) return invoke("workspace_action", { action: a });
  const n = preview.notes.find((x) => x.id === a.id);
  let result: unknown;
  switch (a.type) {
    case "createNote": {
      const note: Note = {
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
): Promise<Attachment> {
  const data = await fileBase64(file);
  if (native)
    return invoke("store_attachment", {
      noteId,
      name: file.name,
      mime: file.type || "application/octet-stream",
      data,
    });
  const a: Attachment = {
    id: crypto.randomUUID(),
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
  };
  preview.attachments.push(a);
  localStorage.setItem(`preview-file-${a.id}`, data);
  persist();
  return a;
}
export async function readAttachment(
  id: string,
): Promise<{ data: string; mime: string; name: string }> {
  if (native) return invoke("read_attachment", { id });
  const a = preview.attachments.find((x) => x.id === id);
  return {
    data: localStorage.getItem(`preview-file-${id}`) || "",
    mime: a?.mime || "",
    name: a?.displayName || "",
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
