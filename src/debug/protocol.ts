import type { StorageView } from "../storage-usage";
import type { JSONContent } from "@tiptap/react";
import type { FolderDraft } from "../smart-draft";
import type { Settings } from "../types";
import type { RecordingAction } from "../recording-coordinator";
import type { Command } from "./catalog";
/** Types only: importing this contract never installs the development surface. */
export type DebugErrorCode =
  | "INVALID_ARGUMENT"
  | "UNKNOWN_COMMAND"
  | "UNAVAILABLE"
  | "UNSUPPORTED"
  | "TIMEOUT"
  | "APP_ERROR";
export type DebugArgs = Record<string, unknown>;
export type DebugHandler = (args: DebugArgs) => unknown | Promise<unknown>;
export interface DebugAdapter {
  handlers: Record<string, DebugHandler>;
  state(): {
    workspace: unknown;
    editorJSON: unknown;
    error: string;
    notice: string;
    selection: Record<string, unknown>;
    save: { pending: number; queued: number; failed: number; saving: number };
    busy: boolean;
    failure: { serial: number; message: string };
    [key: string]: unknown;
  };
}
export interface DebugSnapshotOptions {
  selector?: string;
  maxChars?: number;
  maxNodes?: number;
}
export type DebugCommandArguments = {
  [
    K in
      | "app.state"
      | "app.flush"
      | "app.refresh"
      | "app.back"
      | "app.folders"
      | "editor.done"
      | "app.dismissError"
      | "note.create"
      | "note.delete"
      | "note.restore"
      | "note.purge"
      | "note.separate"
      | "note.share"
      | "folder.submit"
      | "folder.cancel"
      | "folder.refresh"
      | "folder.draft"
      | "editor.undo"
      | "editor.redo"
      | "sidebar.toggle"
      | "modal.submit"
      | "modal.cancel"
      | "attachment.retry"
      | "attachment.discard"
      | "recording.open"
      | "ocr.open"
      | "ocr.insert"
      | "ocr.retry"
      | "ocr.cancel"
      | "archive.export"
      | "archive.import"
      | "settings.open"
      | "data.open"
      | "data.refresh"
      | "image.info"
      | "image.close"
      | "app.close"
      | "app.quit"
      | "drawing.open"
      | `native.${string}`
  ]: Record<string, never>;
} & {
  "settings.tab": { tab: "settings" | "data" };
  "data.navigate": { view: StorageView };
  "data.filter": {
    query?: string;
    kind?: "all" | "image" | "audio" | "video" | "file" | "unowned";
    page?: number;
  };
  "data.exportAttachment": { id: string };
  "image.preview": { id: string };
  "image.save": { id: string };
  "folder.select": { id: string };
  "note.select": { id: string };
  "tag.select": { name: string | null };
  "note.patch": {
    pinned?: boolean;
    folderId?: string;
    paperStyle?:
      | "plain"
      | "lines-small"
      | "lines-medium"
      | "lines-large"
      | "grid-small"
      | "grid-medium"
      | "grid-large";
  };
  "folder.open": { id?: string };
  "folder.rename": { id: string };
  "folder.delete": { id: string };
  "folder.updateDraft": { draft: Partial<FolderDraft> };
  "editor.insertText": { text: string };
  "editor.setContent": { document: JSONContent };
  "editor.select": { from: number; to: number };
  "editor.format": { command: string };
  "editor.table": { action: string };
  "search.set": { query: string };
  "search.find": { query: string };
  "settings.update": {
    settings: Pick<
      Settings,
      | "theme"
      | "view"
      | "sort"
      | "groupDates"
      | "sidebarWidth"
      | "listWidth"
      | "macSidebarVisible"
    >;
  };
  "menu.open": { menu: string };
  "modal.open": { type: string; value?: string };
  "attachment.choose": { kind?: "file" | "media" | "camera" };
  "attachment.submit": {
    files: ({ name: string; mime: string } & (
      { text: string; base64?: never } | { base64: string; text?: never }
    ))[];
  };
  "recording.action": RecordingAction;
  "ocr.select": { source?: "image" | "camera" };
  "dom.click": { selector: string };
  "dom.fill": { selector: string; value: string };
  "dom.key": {
    selector: string;
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  };
};
export interface DebugAPI {
  readonly version: 1;
  list(): (Command & { available: boolean; arguments: Command["args"] })[];
  execute<C extends keyof DebugCommandArguments>(
    command: C,
    ...args: {} extends DebugCommandArguments[C]
      ? [args?: DebugCommandArguments[C]]
      : [args: DebugCommandArguments[C]]
  ): Promise<{ version: 1; command: string; result: unknown }>;
  snapshot(options?: DebugSnapshotOptions): unknown;
  waitForIdle(options?: { timeoutMs?: number }): Promise<unknown>;
}
declare global {
  interface Window {
    __NOTES_DEBUG__?: DebugAPI;
  }
}
