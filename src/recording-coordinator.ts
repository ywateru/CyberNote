import type { RecordingResult } from "./recording-metadata";

export type RecordingIdentity = {
  sessionId: string;
  operationId: string;
  owner: string;
  child: string;
};
export type RecordingViewState = {
  phase: string;
  recordedAt?: number;
  elapsed: number;
  paused: boolean;
  canToggle: boolean;
  canFinish: boolean;
  notice: string;
};
export type RecordingTransfer = {
  name: string;
  mime: string;
  size: number;
  lastModified: number;
  recordedAt: number;
  data: string;
};
export type OwnerStatus = {
  kind: "owner-status";
  status: "ready" | "saving" | "saved" | "failed" | "discarded";
  fileAccepted: boolean;
  error?: string;
};
export type RecordingMessage =
  | { kind: "hello" }
  | { kind: "state"; state: RecordingViewState }
  | { kind: "submit"; transfer?: RecordingTransfer }
  | { kind: "cancel" }
  | { kind: "reveal" }
  | { kind: "action"; action: "close" | "toggle" }
  | OwnerStatus
  | { kind: "owner-lost" }
  | { kind: "child-closed" };
export type RecordingEnvelope = RecordingIdentity & {
  from: "owner" | "child" | "host";
  message: RecordingMessage;
};
export const sameRecording = (a: RecordingIdentity, b: RecordingIdentity) =>
  a.sessionId === b.sessionId &&
  a.operationId === b.operationId &&
  a.owner === b.owner &&
  a.child === b.child;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The original renderer owns exactly one reconstructed File and one submit
 * promise. The capture window never calls the attachment journal itself. */
export class RecordingOwner {
  private result?: RecordingResult;
  private running?: Promise<void>;
  private status: OwnerStatus = {
    kind: "owner-status",
    status: "ready",
    fileAccepted: false,
  };
  private started = false;
  private captureError = false;
  private closed = false;
  private closedSafely = false;
  private closing = false;
  private waiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
  }>();
  constructor(
    readonly identity: RecordingIdentity,
    private ports: {
      send: (message: RecordingMessage) => Promise<void>;
      decode: (transfer: RecordingTransfer) => File;
      submit: (result: RecordingResult) => Promise<void>;
      discard: () => Promise<void>;
      view: (state: RecordingViewState) => void;
      reveal: () => Promise<void>;
      closed: (saved: boolean) => void;
    },
  ) {}

  async receive(event: RecordingEnvelope) {
    if (!sameRecording(this.identity, event) || this.closed) return;
    const message = event.message;
    if (event.from === "host" && message.kind === "child-closed") {
      this.closed = true;
      this.closedSafely =
        this.status.status === "saved" || this.status.status === "discarded";
      if (
        this.status.status === "saved" ||
        this.status.status === "discarded"
      ) {
        for (const waiter of this.waiters) waiter.resolve();
      } else
        for (const waiter of this.waiters)
          waiter.reject(Error("录音窗口意外关闭，原笔记会话仍保留"));
      this.waiters.clear();
      this.ports.closed(
        this.status.status === "saved" || this.status.status === "discarded",
      );
      return;
    }
    if (event.from !== "child") return;
    if (message.kind === "state") {
      this.started ||= message.state.recordedAt !== undefined;
      this.captureError = message.state.phase === "error";
      this.ports.view(message.state);
    } else if (message.kind === "hello") {
      await this.ports.send(this.status);
      if (this.closing)
        await this.ports.send({ kind: "action", action: "close" });
    } else if (message.kind === "reveal") {
      await this.ports.reveal();
    } else if (message.kind === "cancel") {
      if ((this.started && !this.captureError) || this.result) {
        await this.fail(
          Error("已开始的录音须先完成保存，音频仍保留在录音窗口"),
        );
        return;
      }
      try {
        await this.ports.discard();
        this.status = {
          kind: "owner-status",
          status: "discarded",
          fileAccepted: false,
        };
        await this.ports.send(this.status);
        this.settleDestroyed();
      } catch (error) {
        await this.fail(error);
      }
    } else if (message.kind === "submit") {
      if (!this.result && message.transfer) {
        const transfer = message.transfer;
        if (
          !Number.isSafeInteger(transfer.recordedAt) ||
          transfer.recordedAt <= 0 ||
          !Number.isSafeInteger(transfer.size) ||
          transfer.size <= 0 ||
          transfer.size > 100 * 1024 * 1024 ||
          !/^audio\/(webm|mp4|ogg|wav|x-wav|aac|mpeg)(?:\s*;[^\r\n]*)?$/i.test(
            transfer.mime,
          )
        ) {
          await this.fail(Error("录音文件信息无效，原音频仍保留在录音窗口"));
          return;
        }
        try {
          const file = this.ports.decode(transfer);
          if (file.size !== transfer.size || file.type !== transfer.mime)
            throw Error("录音文件传输不完整，请保持录音窗口打开");
          this.result = Object.freeze({
            file,
            recordedAt: transfer.recordedAt,
          });
        } catch (error) {
          await this.fail(error);
          return;
        }
      }
      if (!this.result) {
        await this.fail(Error("原窗口尚未接收到音频，请保持录音窗口打开"));
        return;
      }
      if (this.status.status === "saved" || this.running) {
        await this.ports.send(this.status);
        return;
      }
      this.running = this.save();
      await this.running;
      this.running = undefined;
    }
  }
  private async fail(error: unknown) {
    this.closing = false;
    const text = errorText(error);
    this.status = {
      kind: "owner-status",
      status: "failed",
      fileAccepted: !!this.result,
      error: text,
    };
    for (const waiter of this.waiters) waiter.reject(Error(text));
    this.waiters.clear();
    await this.ports.send(this.status);
  }
  private async save() {
    this.status = {
      kind: "owner-status",
      status: "saving",
      fileAccepted: true,
    };
    // A lost notification cannot turn a real ACK into another insertion.
    await this.ports.send(this.status).catch(() => {});
    try {
      await this.ports.submit(this.result!);
    } catch (error) {
      await this.fail(error).catch(() => {});
      return;
    }
    this.status = { kind: "owner-status", status: "saved", fileAccepted: true };
    await this.ports.send(this.status).catch(() => {});
    // The native child may have disappeared while the original save was
    // awaiting its real document ACK. That ACK still settles this owner.
    this.settleDestroyed();
  }
  private settleDestroyed() {
    if (this.closed && !this.closedSafely) {
      this.closedSafely = true;
      this.ports.closed(true);
    }
  }
  toggle() {
    return this.ports.send({ kind: "action", action: "toggle" });
  }
  close() {
    if (this.closed)
      return this.closedSafely
        ? Promise.resolve()
        : Promise.reject(Error("录音窗口意外关闭，原会话尚未确认保存"));
    this.closing = true;
    return new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject };
      this.waiters.add(waiter);
      void this.ports
        .send({ kind: "action", action: "close" })
        .catch((error) => {
          this.waiters.delete(waiter);
          reject(error);
        });
    });
  }
}
