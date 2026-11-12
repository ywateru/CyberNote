import { useState } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import type { Workspace } from "../types";
import type { NativeContext } from "../platform/contracts";
import type { PickerTarget, PickerBatch, RecordingTicket } from "./contracts";
import {
  AttachmentSubmission,
  documentReferencesAttachment,
} from "../attachment-submission";
import {
  accessGate,
  native,
  storeAttachment,
  storeAttachmentOperation,
  queryAttachmentOperation,
  cancelAttachmentOperation,
} from "../bridge";
import { clipboardAttachmentFiles } from "../attachment-clipboard";
import { secureId } from "../secure-id";
import { documentsEqual } from "../document-equality";
import { editorSaveSnapshot } from "../editor-save-snapshot";
export type PickerRuntime = {
  scope: string;
  noteId: string | null;
  editor: Editor | null;
  available: boolean;
  ocrAvailable: boolean;
  recordingAvailable: boolean;
};
export type AttachmentPorts = {
  workspace(): Workspace;
  quitting(): boolean;
  synchronizing(): boolean;
  blocked(id: string): boolean;
  owner(editor: Editor): string | undefined;
  documentVersion(editor: Editor): number;
  externalVersion(id: string): number;
  pendingDocument(id: string): JSONContent | undefined;
  assertNative(context: NativeContext, editing?: boolean): void;
  validatePickerTarget(
    target: PickerTarget,
    recording?: RecordingTicket,
    sealed?: boolean,
  ): Promise<void>;
  validateRecordingTarget(
    ticket: RecordingTicket,
    sealed: boolean,
  ): Promise<void>;
  awaitDocumentAck(
    operation: AttachmentSubmission<PickerTarget>,
    target: PickerTarget,
  ): Promise<void>;
  finishRecording(ticket: RecordingTicket): void;
  cancelRecording(ticket: RecordingTicket): Promise<void>;
  refresh(): Promise<unknown>;
  closeMenu(): void;
  clearError(): void;
  fail(error: unknown): void;
  inputs(): readonly (HTMLInputElement | null)[];
  debugPending: Set<Promise<unknown>>;
};
/** Owns picker identities, batch admission/results, clipboard capture and the
 * existing AttachmentSubmission state machines. Root owns shared auth/save. */
export class AttachmentOperations {
  readonly targets = { current: new Map<HTMLInputElement, PickerBatch>() };
  readonly submissions = {
    current: new Map<string, AttachmentSubmission<PickerTarget>>(),
  };
  readonly batches = { current: new Set<PickerBatch>() };
  readonly runtime = {
    current: {
      scope: "",
      noteId: null,
      editor: null,
      available: false,
      ocrAvailable: false,
      recordingAvailable: false,
    } as PickerRuntime,
  };
  private ports: AttachmentPorts | null = null;
  configure(ports: AttachmentPorts) {
    this.ports = ports;
  }
  private live() {
    if (!this.ports) throw Error("附件操作尚未配置");
    return this.ports;
  }
  listen(inputs: readonly (HTMLInputElement | null)[]) {
    const cancelled = (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const batch = this.targets.current.get(input);
      if (batch) batch.target.invalidated = true;
      this.targets.current.delete(input);
    };
    const failed = (event: Event) =>
      this.live().fail((event as CustomEvent).detail);
    for (const input of inputs) input?.addEventListener("cancel", cancelled);
    window.addEventListener("attachment-transfer-error", failed);
    return () => {
      for (const input of inputs)
        input?.removeEventListener("cancel", cancelled);
      window.removeEventListener("attachment-transfer-error", failed);
      for (const batch of this.targets.current.values())
        batch.target.invalidated = true;
      this.targets.current.clear();
      for (const batch of this.batches.current)
        if (!batch.recording) batch.target.invalidated = true;
      for (const submission of this.submissions.current.values())
        submission.invalidate();
    };
  }
  retry = async () => {
    for (const batch of [...this.batches.current]) {
      if (batch.recording && batch.cancelRequested)
        await this.live().cancelRecording(batch.recording);
      else await this.submitAttachmentBatch(batch);
    }
  };
  submitAttachmentBatch = async (batch: PickerBatch) => {
    const p = this.live();
    if (batch.cancelRequested)
      throw Error("附件取消尚未核定，请重试取消；不会继续插入正文");
    if (!batch.files) throw Error("附件选择结果尚未提供");
    const target = batch.target;
    for (const [index, file] of batch.files.entries()) {
      if (batch.cancelRequested) throw Error("本次附件已请求取消");
      const operationId = batch.operationIds[index];
      let submission = this.submissions.current.get(operationId);
      if (!submission) {
        submission = new AttachmentSubmission(
          operationId,
          target.noteId,
          target,
          file,
          batch.recording?.recordedAt,
        );
        this.submissions.current.set(operationId, submission);
      }
      const operation = submission;
      await operation.run({
        validate: () =>
          batch.recording?.local
            ? p.validateRecordingTarget(batch.recording, operation.inserted)
            : p.validatePickerTarget(
                target,
                batch.recording,
                operation.inserted,
              ),
        storage: native
          ? {
              kind: "journal",
              store: () =>
                storeAttachmentOperation(
                  operationId,
                  target.noteId,
                  file,
                  operation.recordedAt,
                ),
              query: () => queryAttachmentOperation(operationId, target.noteId),
            }
          : {
              kind: "preview",
              store: () =>
                storeAttachment(target.noteId, file, operation.recordedAt),
            },
        insert: (attachment) => {
          const instance = target.editor;
          if (batch.recording?.local) {
            const selection = target.bookmark.resolve(instance.state.doc);
            // Map the user's current selection through a normal insertion. No
            // focus or selected-note change, including while A is parked for B.
            const inserted = instance.commands.insertContentAt(
              { from: selection.from, to: selection.to },
              {
                type: "attachment",
                attrs: {
                  id: attachment.id,
                  name: attachment.displayName,
                  kind: attachment.kind,
                },
              },
              { updateSelection: false },
            );
            if (!inserted) throw Error("原编辑器未接受录音，音频仍保留");
            return;
          }
          instance.view.dispatch(
            instance.state.tr.setSelection(
              target.bookmark.resolve(instance.state.doc),
            ),
          );
          try {
            const content = {
              type: "attachment",
              attrs: {
                id: attachment.id,
                name: attachment.displayName,
                kind: attachment.kind,
              },
            };
            const chain = instance.chain().focus();
            const insertion =
              batch.insertAt === undefined
                ? chain.insertContent(content)
                : chain.insertContentAt(batch.insertAt, content);
            const inserted = insertion
              .command(({ tr }) => {
                // Tiptap may select a just-inserted atomic block. Leaving that
                // automatic NodeSelection would replace it with the next file
                // in this batch (or the next chooser), despite no user selection.
                if (
                  tr.selection instanceof NodeSelection &&
                  tr.selection.node.type.name === "attachment" &&
                  tr.selection.node.attrs.id === attachment.id
                ) {
                  const after = tr.selection.to;
                  if (!tr.doc.resolve(after).nodeAfter?.isTextblock)
                    tr.insert(after, instance.schema.nodes.paragraph.create());
                  tr.setSelection(Selection.near(tr.doc.resolve(after), 1));
                }
                return true;
              })
              .run();
            if (!inserted)
              throw Error("编辑器未接受附件插入，已保留原附件；请重试");
            batch.insertAt = undefined;
          } finally {
            if (documentReferencesAttachment(instance.getJSON(), attachment)) {
              target.bookmark = instance.state.selection.getBookmark();
              target.documentVersion = p.documentVersion(instance);
              target.document = instance.getJSON();
              target.trustedDocument = editorSaveSnapshot(target.document);
            }
          }
        },
        references: (attachment) =>
          !target.editor.isDestroyed &&
          documentReferencesAttachment(target.editor.getJSON(), attachment),
        awaitDocumentAck: () => p.awaitDocumentAck(operation, target),
        refresh: async () => {
          if (batch.recording) p.finishRecording(batch.recording);
          await p.refresh();
        },
      });
    }
    this.batches.current.delete(batch);
    for (const operationId of batch.operationIds)
      this.submissions.current.delete(operationId);
    p.closeMenu();
  };

  discardUninsertedAttachments = async () => {
    const p = this.live();
    for (const batch of this.batches.current) {
      if (batch.recording) {
        await p.cancelRecording(batch.recording);
        continue;
      }
      await p.validatePickerTarget(batch.target);
      const operations = batch.operationIds.map((id) =>
        this.submissions.current.get(id),
      );
      if (operations.some((op) => op?.inserted))
        throw Error("附件已在本窗口正文中，须先确认保存；不会删除待保存的附件");
      // Seal admission before awaiting cancellation. A late storage/query result
      // can no longer race a safe backend cancellation and insert its old node.
      batch.cancelRequested = true;
      for (const op of operations) op?.invalidate();
      // StorageAttempted includes FileReader time, before the store IPC exists.
      // Keep every identity until all admitted work has really settled; a
      // cancel of an unknown op cannot prevent a later store for that same op.
      await Promise.all(operations.map((op) => op?.settleForCancellation()));
      await p.validatePickerTarget(batch.target);
      for (const op of operations) {
        if (!op) continue;
        if (
          op.attachment &&
          documentReferencesAttachment(
            op.target.editor.getJSON(),
            op.attachment,
          )
        )
          throw Error("附件已在本窗口正文中，不能取消");
        if (native && op.storageAttempted) {
          const result = await cancelAttachmentOperation(
            op.operationId,
            op.noteId,
          );
          if (result.status !== "aborted" && result.status !== "notPersisted")
            throw Error(
              `附件已保留待恢复（${result.reason || result.status}）`,
            );
        }
        op.invalidate();
        this.submissions.current.delete(op.operationId);
      }
      batch.target.invalidated = true;
      this.batches.current.delete(batch);
    }
    p.clearError();
  };

  fileSelected = async (
    input: HTMLInputElement,
    suppliedFiles?: readonly File[],
  ) => {
    const p = this.live();
    const files = suppliedFiles || input.files;
    const batch = this.targets.current.get(input);
    this.targets.current.delete(input);
    let debugComplete: (() => void) | undefined;
    if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
      const work = new Promise<void>((resolve) => {
        debugComplete = resolve;
      });
      p.debugPending.add(work);
      void work.finally(() => p.debugPending.delete(work));
    }
    try {
      if (!files?.length) return; // Picker cancellation has not started storage.
      if (!batch) throw Error("附件选择缺少原目标，请重新选择");
      batch.files = Array.from(files);
      for (let i = 1; i < batch.files.length; i++)
        batch.operationIds.push(secureId());
      this.batches.current.add(batch);
      await this.submitAttachmentBatch(batch);
    } catch (e) {
      if (!batch?.cancelRequested) p.fail(e);
    } finally {
      debugComplete?.();
      for (const input of p.inputs()) if (input) input.value = "";
    }
  };

  capturePickerTarget = (context?: NativeContext): PickerBatch => {
    const p = this.live();
    const live = this.runtime.current;
    const instance = context ? context.editor : live.editor;
    if (
      p.quitting() ||
      p.synchronizing() ||
      !live.noteId ||
      !instance ||
      instance.isDestroyed ||
      !instance.isEditable ||
      !live.available ||
      p.blocked(live.noteId) ||
      accessGate.state?.operationId
    )
      throw Error("当前备忘录不可添加附件，请同步完成后重试");
    if (context) p.assertNative(context, true);
    const owner = p.owner(instance);
    if (owner !== live.noteId) throw Error("附件编辑器归属已改变");
    const original = p.workspace().notes.find((n) => n.id === live.noteId);
    if (!original) throw Error("原附件备忘录不存在");
    if (original.locked) throw Error("已锁定备忘录不支持附件，请先移除锁定");
    const target: PickerTarget = {
      noteId: live.noteId,
      scope: live.scope,
      stamp: accessGate.stamp(live.noteId),
      editor: instance,
      owner,
      bookmark: context?.bookmark || instance.state.selection.getBookmark(),
      documentVersion: p.documentVersion(instance),
      externalVersion: p.externalVersion(live.noteId),
      document: instance.getJSON(),
      // Compare each representation with its own captured original. Schema
      // defaults in the Editor must neither hide raw changes nor reject an
      // unchanged imported document that omits an optional default field.
      trustedDocument: p.pendingDocument(live.noteId) || original.document,
      invalidated: false,
    };
    return { target, operationIds: [secureId()] } satisfies PickerBatch;
  };

  pasteAttachments = (
    instance: Editor,
    supplied?: readonly File[],
    place?: () => number,
  ) => {
    const p = this.live();
    // Capture owner, document and insertion point before any clipboard read.
    let batch: PickerBatch;
    try {
      if (this.runtime.current.editor !== instance)
        throw Error("原粘贴编辑器已失效");
      batch = this.capturePickerTarget();
      batch.insertAt = place?.();
    } catch (error) {
      p.fail(error);
      return;
    }
    void (async () => {
      batch.files = supplied
        ? Array.from(supplied)
        : await clipboardAttachmentFiles(batch.target.noteId);
      if (!batch.files.length) throw Error("剪贴板中没有可粘贴的附件");
      if (
        this.runtime.current.editor !== instance ||
        this.runtime.current.noteId !== batch.target.noteId ||
        this.runtime.current.scope !== batch.target.scope ||
        instance.isDestroyed ||
        !instance.isEditable ||
        !documentsEqual(instance.getJSON(), batch.target.document)
      )
        throw Error("原粘贴目标已改变，请重新粘贴");
      batch.operationIds = batch.files.map(() => secureId());
      this.batches.current.add(batch);
      await this.submitAttachmentBatch(batch);
    })().catch(p.fail);
  };

  openAttachmentPicker = (
    input: HTMLInputElement | null,
    accept?: string,
    context?: NativeContext,
  ) => {
    const p = this.live();
    try {
      if (!input) throw Error("附件选择器尚未就绪");
      const batch = this.capturePickerTarget(context);
      const previous = this.targets.current.get(input);
      if (previous) previous.target.invalidated = true;
      this.targets.current.set(input, batch);
      if (accept !== undefined) input.accept = accept;
      input.click();
    } catch (e) {
      if (input) {
        const batch = this.targets.current.get(input);
        if (batch) batch.target.invalidated = true;
        this.targets.current.delete(input);
      }
      p.fail(e);
    }
  };
}
export function useAttachmentOperations() {
  const [operations] = useState(() => new AttachmentOperations());
  return operations;
}
