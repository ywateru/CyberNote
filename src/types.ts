import type { AppearanceV2 } from "./themes/appearance";
import type { InterfaceDetails } from "./interface-details";
import type { FontSize } from "./font-size";
import type { JSONContent } from "@tiptap/react";
export type TagMode = "allSelected" | "anySelected" | "anyTag" | "noTags";
export type SmartRule =
  | { type: "tags"; mode: "allSelected" | "anySelected"; names: string[] }
  | { type: "tags"; mode: "anyTag" | "noTags" }
  | { type: "pinned"; value: boolean };
export interface SmartQuery {
  version: 1;
  combine: "all" | "any";
  rules: SmartRule[];
}
interface FolderFields {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: number;
}
export interface PhysicalFolder extends FolderFields {
  kind: "default" | "normal" | "quick" | "trash";
  parentId: string | null;
}
export interface SmartFolder extends FolderFields {
  kind: "smart";
  parentId: null;
  query: SmartQuery;
  definitionRevision: number;
}
export type Folder = PhysicalFolder | SmartFolder;
export interface Note {
  id: string;
  folderId: string;
  document: JSONContent;
  title: string;
  plainText: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  deletedAt: number | null;
  originalFolderId: string | null;
  locked: boolean;
  paperStyle: string;
  revision: number;
  sealed?: unknown;
}
export interface Attachment {
  /** Derived public metadata; never persisted or part of the sync wire. */
  internal?: boolean;
  id: string;
  noteId: string;
  kind: string;
  relativePath: string;
  mime: string;
  displayName: string;
  size: number;
  recordedAt?: number | null;
}
export interface Settings {
  interfaceDetails?: InterfaceDetails;
  interfaceFontSize?: FontSize;
  editorFontSize?: FontSize;
  appearance?: AppearanceV2;
  theme?: "system" | "light" | "dark";
  view?: "list" | "gallery";
  sort?: "updated" | "created" | "title";
  sidebarWidth?: number;
  macSidebarVisible?: boolean;
  listWidth?: number;
  selectedFolder?: string;
  selectedNote?: string;
  groupDates?: boolean;
  [key: string]: unknown;
}
export interface Workspace {
  folders: Folder[];
  notes: Note[];
  attachments: Attachment[];
  settings: Settings;
  access?: AccessState;
  metadata?: MetadataState;
}
export interface MetadataState {
  sessionId: string;
  sequence: number;
}
export interface CommittedChange {
  kind: "note" | "folder" | "attachment";
  id: string;
  revision?: number;
}
export interface CommitReceipt {
  changes: CommittedChange[];
  createdId?: string;
}
export interface MetadataEvent {
  metadata: MetadataState;
  changes: CommittedChange[];
}
export interface ActionDelivery<T> {
  value?: T;
  receipt?: CommitReceipt;
  metadata?: MetadataState;
  accessAccepted: boolean;
  maintenanceError?: unknown;
}
export interface AccessState {
  sessionId: string;
  epoch: number;
  notes: Record<string, { epoch: number; authorized: boolean }>;
  suspended: string[];
  operationId: string | null;
}
export interface AccessEvent {
  phase: "prepare" | "commit" | "abort";
  operationId: string;
  noteIds: string[];
  access: AccessState;
}
export interface DrawingStroke {
  color: string;
  width: number;
  points: [number, number][];
  tool: "pen" | "marker" | "eraser";
}
export const blankDoc: JSONContent = {
  type: "doc",
  content: [{ type: "heading", attrs: { level: 1 } }],
};
export function documentText(doc: JSONContent): string {
  let s = "";
  function walk(n: JSONContent) {
    if (n.text) s += n.text;
    n.content?.forEach(walk);
    if (
      ["paragraph", "heading", "listItem", "taskItem", "tableRow"].includes(
        n.type || "",
      )
    )
      s += "\n";
  }
  walk(doc);
  return s.trimEnd();
}
