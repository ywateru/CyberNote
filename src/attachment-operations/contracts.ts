import type { Editor } from "@tiptap/core";
import type { SelectionBookmark } from "@tiptap/pm/state";
import type { AttachmentTarget } from "../attachment-target";
import type { RecordingRevisions } from "../recording-revisions";
import type { DesktopRecordingPanelHandle } from "../DesktopRecordingPanel";
import type { mountRecordingCard } from "../recording-live-card";
export type LocalRecordingIdentity = {
  sessionId: string;
  operationId: string;
  owner: string;
  incarnation: string;
};
export type PickerTarget = AttachmentTarget<Editor, SelectionBookmark>;
export type PickerBatch = {
  target: PickerTarget;
  operationIds: string[];
  files?: File[];
  cancelRequested?: boolean;
  recording?: RecordingTicket;
  insertAt?: number;
};
export type RecordingTicket = {
  revisions?: RecordingRevisions<PickerTarget>;
  batch: PickerBatch;
  accepting: boolean;
  detached: boolean;
  file?: File;
  recordedAt?: number;
  running?: Promise<void>;
  cancelling?: Promise<void>;
  desktop?: boolean;
  opening?: Promise<void>;
  registration?: {
    sessionId: string;
    operationId: string;
    error?: string;
    cancelRequested?: boolean;
    cancelling?: Promise<void>;
  };
  editorCommits?: Set<AbortController>;
  local?: {
    identity: LocalRecordingIdentity;
    handle?: DesktopRecordingPanelHandle;
    ready: Promise<DesktopRecordingPanelHandle>;
    attach: (handle: DesktopRecordingPanelHandle) => void;
    card?: ReturnType<typeof mountRecordingCard>;
  };
};
