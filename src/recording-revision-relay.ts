import type {
  RecordingMessage,
  OwnerStatus,
  RecordingTransfer,
} from "./recording-coordinator";
import type { RecordingRevision } from "./recording-metadata";
/** One serial immutable version in flight. Late statuses cannot settle another. */
type Pending = {
  resolve: () => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
export class RecordingRevisionRelay {
  private result?: RecordingRevision;
  private transfer?: RecordingTransfer;
  private accepted = false;
  private acknowledged = false;
  private pending?: Pending;
  constructor(
    private send: (message: RecordingMessage) => Promise<void>,
    private encode: (file: File) => Promise<string>,
  ) {}
  receive(message: OwnerStatus): boolean {
    if (!this.result || message.revision !== this.result.revision) return false;
    this.accepted ||= message.fileAccepted;
    const complete =
      message.status ===
      (this.result.intent === "final" ? "saved" : "checkpoint-saved");
    if (complete) {
      this.acknowledged = true;
      this.pending?.resolve();
    } else if (message.status === "failed")
      this.pending?.reject(
        Error(message.error || "录音尚未保存，原音频仍保留。"),
      );
    // The active submit caller owns destruction. Only an ACK arriving after
    // its waiter has gone needs the Window status handler recovery path.
    return complete && this.result.intent === "final" && !this.pending;
  }
  async submit(result: RecordingRevision) {
    if (this.pending) throw Error("上版录音仍在等待保存，请稍后重试。");
    if (this.result && result.revision === this.result.revision) {
      if (
        this.result.file !== result.file ||
        this.result.intent !== result.intent ||
        this.result.recordedAt !== result.recordedAt
      )
        throw Error("同版录音身份已改变，原音频仍保留。");
    } else {
      if (
        this.result &&
        (!this.acknowledged || result.revision !== this.result.revision + 1)
      )
        throw Error("录音版本保存顺序无效，原音频仍保留。");
      this.result = result;
      this.transfer = undefined;
      this.accepted = false;
      this.acknowledged = false;
    }
    if (this.acknowledged) return;
    if (!this.accepted && !this.transfer)
      this.transfer = {
        name: result.file.name,
        mime: result.file.type,
        size: result.file.size,
        lastModified: result.file.lastModified,
        recordedAt: result.recordedAt,
        data: await this.encode(result.file),
      };
    let waiting!: Pending;
    const response = new Promise<void>((resolve, reject) => {
      waiting = {
        resolve,
        reject,
        timer: setTimeout(
          () => reject(Error("本版录音保存尚未确认，原音频仍保留；可重试。")),
          30000,
        ),
      };
      this.pending = waiting;
    });
    void response.catch(() => {});
    try {
      await this.send({
        kind: "revision-submit",
        revision: result.revision,
        intent: result.intent,
        transfer: this.accepted ? undefined : this.transfer,
      });
      await response;
    } finally {
      clearTimeout(waiting.timer);
      if (this.pending === waiting) this.pending = undefined;
    }
  }
  lost(message: string) {
    this.pending?.reject(Error(message));
  }
  dispose() {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(Error("录音窗口已卸载。"));
      this.pending = undefined;
    }
  }
}
