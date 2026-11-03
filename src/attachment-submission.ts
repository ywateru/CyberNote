import type { JSONContent } from "@tiptap/react";
import type { Attachment } from "./types";

export interface AttachmentOperationResult {
  operationId: string;
  noteId: string;
  status: "notPersisted" | "stored" | "committed" | "aborted" | "deferred";
  attachment?: Attachment;
  reason?: string;
}

export function documentReferencesAttachment(
  document: JSONContent,
  attachment: Attachment,
): boolean {
  return (
    (document.type === "attachment" &&
      document.attrs?.id === attachment.id &&
      document.attrs?.kind === attachment.kind) ||
    !!document.content?.some((node) =>
      documentReferencesAttachment(node, attachment),
    )
  );
}

export interface AttachmentSubmissionPorts {
  /** Completes trusted synchronization and validates the original target. */
  validate: () => Promise<void>;
  storage:
    | {
        kind: "journal";
        store: () => Promise<AttachmentOperationResult>;
        query: () => Promise<AttachmentOperationResult>;
      }
    | { kind: "preview"; store: () => Promise<Attachment> };
  /** Must report the real local document, including after a thrown command. */
  insert: (attachment: Attachment) => void;
  references: (attachment: Attachment) => boolean;
  awaitDocumentAck: () => Promise<void>;
  refresh: () => Promise<void>;
}

/** One file, one backend journal identity, retained across all retries. */
export class AttachmentSubmission<Target> {
  attachment?: Attachment;
  storageAttempted = false;
  inserted = false;
  documentAck = false;
  refreshed = false;
  invalidated = false;
  private running?: Promise<void>;

  constructor(
    readonly operationId: string,
    readonly noteId: string,
    readonly target: Target,
    readonly file: File,
  ) {}

  invalidate() {
    this.invalidated = true;
  }

  acknowledge(noteId: string, document: JSONContent) {
    if (
      this.inserted &&
      this.attachment &&
      noteId === this.noteId &&
      documentReferencesAttachment(document, this.attachment)
    )
      this.documentAck = true;
  }

  private assertValid() {
    if (this.invalidated)
      throw Error("原附件目标已失效，已保留的附件不会插入其他备忘录");
  }

  private accept(result: AttachmentOperationResult): Attachment | undefined {
    if (
      result.operationId !== this.operationId ||
      result.noteId !== this.noteId
    )
      throw Error("附件操作身份不匹配，请保持窗口打开");
    if (result.status === "notPersisted") return;
    if (
      (result.status !== "stored" && result.status !== "committed") ||
      !result.attachment ||
      result.attachment.noteId !== this.noteId
    )
      throw Error(
        `附件操作尚未完成，已保留恢复身份（${result.reason || result.status}）`,
      );
    if (this.attachment && this.attachment.id !== result.attachment.id)
      throw Error("附件身份已改变，请保持窗口打开");
    return result.attachment;
  }

  run(ports: AttachmentSubmissionPorts): Promise<void> {
    if (this.running) return this.running;
    const work = this.submit(ports);
    this.running = work;
    void work
      .finally(() => {
        if (this.running === work) this.running = undefined;
      })
      .catch(() => {});
    return work;
  }

  private async submit(ports: AttachmentSubmissionPorts) {
    this.assertValid();
    // The durable body is already confirmed. A later edit cannot turn a list
    // refresh retry back into insertion or make it depend on the old cursor.
    if (this.documentAck) {
      if (!this.refreshed) {
        await ports.refresh();
        this.assertValid();
        this.refreshed = true;
      }
      return;
    }
    await ports.validate();
    this.assertValid();
    if (!this.attachment) {
      if (ports.storage.kind === "preview") {
        this.storageAttempted = true;
        this.attachment = await ports.storage.store();
      } else {
        // A rejected response may still have written bytes. Only an accepted
        // authoritative query can establish that the same operation did not.
        if (this.storageAttempted)
          this.attachment = this.accept(await ports.storage.query());
        if (!this.attachment) {
          this.storageAttempted = true;
          try {
            this.attachment = this.accept(await ports.storage.store());
          } catch (error) {
            await ports.validate();
            this.assertValid();
            const recovered = this.accept(await ports.storage.query());
            if (!recovered) throw error;
            this.attachment = recovered;
          }
        }
      }
    }
    if (!this.attachment) throw Error("后端未确认附件存储，请重试原操作");
    await ports.validate();
    this.assertValid();
    if (!this.inserted) {
      let insertionError: unknown;
      try {
        ports.insert(this.attachment);
      } catch (error) {
        insertionError = error;
      } finally {
        // A command can throw after dispatch. Such a local node must never
        // be cancelled merely because the persistent body lacks its ref.
        this.inserted = ports.references(this.attachment);
      }
      if (insertionError) throw insertionError;
      if (!this.inserted) throw Error("附件尚未插入，已保留原附件身份；请重试");
    }
    if (!this.documentAck) {
      await ports.awaitDocumentAck();
      if (!this.documentAck)
        throw Error("附件正文尚未确认保存，内容与附件已保留；请重试保存");
    }
    // Once ACKed, a refresh error cannot cause reinsertion or compensation.
    if (!this.refreshed) {
      await ports.refresh();
      this.assertValid();
      this.refreshed = true;
    }
  }
}
