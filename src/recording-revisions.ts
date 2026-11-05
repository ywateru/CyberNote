import { AttachmentSubmission } from "./attachment-submission";
import type { AttachmentOperationResult } from "./attachment-submission";
import type { RecordingRevision } from "./recording-metadata";
import type { Attachment } from "./types";
import { secureId } from "./secure-id";

type Ports<T> = {
  validate: (inserted: boolean) => Promise<void>;
  register: (operation: AttachmentSubmission<T>) => void;
  committed: (operation: AttachmentSubmission<T>) => void;
  store: (
    operation: AttachmentSubmission<T>,
  ) => Promise<AttachmentOperationResult>;
  query: (
    operation: AttachmentSubmission<T>,
  ) => Promise<AttachmentOperationResult>;
  insert: (attachment: Attachment, previous?: Attachment) => void;
  references: (attachment: Attachment) => boolean;
  inserted?: (attachment: Attachment) => void;
  awaitDocumentAck: (operation: AttachmentSubmission<T>) => Promise<void>;
};
/** Serial recording versions over the unchanged immutable attachment journal. */
export class RecordingRevisions<T> {
  private acknowledged = 0;
  private previous?: Attachment;
  private pending?: {
    result: RecordingRevision;
    operation: AttachmentSubmission<T>;
  };
  private running?: Promise<void>;
  constructor(
    private noteId: string,
    private target: T,
  ) {}
  run(result: RecordingRevision, ports: Ports<T>): Promise<void> {
    if (
      this.pending &&
      (this.pending.result.file !== result.file ||
        this.pending.result.revision !== result.revision ||
        this.pending.result.intent !== result.intent ||
        this.pending.result.recordedAt !== result.recordedAt)
    )
      return Promise.reject(Error("录音版本身份已改变，原音频仍保留。"));
    if (result.revision !== this.acknowledged + 1)
      return Promise.reject(Error("录音保存版本顺序无效，原音频仍保留。"));
    if (this.running) return this.running;
    if (!this.pending)
      this.pending = {
        result,
        operation: new AttachmentSubmission(
          secureId(),
          this.noteId,
          this.target,
          result.file,
          result.recordedAt,
        ),
      };
    const current = this.pending,
      operation = current.operation;
    ports.register(operation);
    const work = (async () => {
      // A previous failed insertion may already be in the real pending body.
      // Retry that exact ACK before generic target validation flushes failures.
      if (operation.inserted && !operation.documentAck)
        await ports.awaitDocumentAck(operation);
      await operation.run({
        validate: () => ports.validate(operation.inserted),
        storage: {
          kind: "journal",
          store: () => ports.store(operation),
          query: () => ports.query(operation),
        },
        insert: (attachment) => {
          ports.insert(attachment, this.previous);
          ports.inserted?.(attachment);
        },
        references: ports.references,
        awaitDocumentAck: () => ports.awaitDocumentAck(operation),
        refresh: async () => {},
      });
      await ports.validate(true);
      if (!operation.attachment || !ports.references(operation.attachment))
        throw Error("本版录音节点已被移除，原音频仍保留；不会重新插入。");
      // saveNote ACK alone does NOT commit this journal. Query while this exact
      // version is still referenced, before allowing any replacement/recovery.
      const committed = await ports.query(operation);
      if (
        committed.status !== "committed" ||
        committed.operationId !== operation.operationId ||
        committed.noteId !== this.noteId ||
        committed.attachment?.id !== operation.attachment.id
      )
        throw Error("本版录音持久提交尚未确认，原音频仍保留；请重试保存。");
      // Query is asynchronous: Undo/delete or target invalidation can occur
      // while Rust commits the journal. Recheck before publishing this ACK.
      await ports.validate(true);
      if (!ports.references(operation.attachment))
        throw Error("本版录音节点在提交确认期间已被移除，原音频仍保留。");
      ports.committed(operation);
      this.previous = operation.attachment;
      this.acknowledged = result.revision;
      this.pending = undefined;
    })();
    this.running = work;
    void work
      .finally(() => {
        if (this.running === work) this.running = undefined;
      })
      .catch(() => {});
    return work;
  }
}
