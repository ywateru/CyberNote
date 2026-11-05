import type { RecordingResult } from "./recording-metadata";

export type RecordingIdentity = {
  sessionId: string;
  operationId: string;
  owner: string;
  child: string;
};
export type RecordingPhase =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "finalizing"
  | "saving"
  | "retry"
  | "submitted"
  | "error";
export type RecordingAction =
  | { action: "close" | "toggle" | "finish" | "playback" | "preview-retry" }
  | { action: "skip"; seconds: -15 | 15 }
  | { action: "seek"; milliseconds: number };
export type RecordingViewState = {
  sequence: number;
  phase: RecordingPhase;
  openedAt: number;
  recordedAt?: number;
  elapsed: number;
  paused: boolean;
  canToggle: boolean;
  canFinish: boolean;
  notice: string;
  hasError: boolean;
  position: number;
  duration: number;
  previewPosition: boolean;
  playing: boolean;
  playPending: boolean;
  previewPending: boolean;
  seeking: boolean;
  canPlay: boolean;
  canSeek: boolean;
  canRetryPreview: boolean;
  seekable: [number, number][];
  samples: { at: number; peak: number }[];
};
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
export function validRecordingState(
  value: unknown,
): value is RecordingViewState {
  if (!value || typeof value !== "object") return false;
  const s = value as RecordingViewState;
  return (
    Number.isSafeInteger(s.sequence) &&
    s.sequence > 0 &&
    [
      "idle",
      "requesting",
      "recording",
      "paused",
      "finalizing",
      "saving",
      "retry",
      "submitted",
      "error",
    ].includes(s.phase) &&
    Number.isSafeInteger(s.openedAt) &&
    s.openedAt > 0 &&
    (s.recordedAt === undefined ||
      (Number.isSafeInteger(s.recordedAt) && s.recordedAt > 0)) &&
    [s.elapsed, s.position, s.duration].every(finite) &&
    s.position <= Math.max(s.duration, s.elapsed) + 1 &&
    [
      s.paused,
      s.canToggle,
      s.canFinish,
      s.hasError,
      s.previewPosition,
      s.playing,
      s.playPending,
      s.previewPending,
      s.seeking,
      s.canPlay,
      s.canSeek,
      s.canRetryPreview,
    ].every((v) => typeof v === "boolean") &&
    typeof s.notice === "string" &&
    s.notice.length <= 8192 &&
    Array.isArray(s.seekable) &&
    s.seekable.length <= 64 &&
    s.seekable.every(
      (r, i) =>
        Array.isArray(r) &&
        r.length === 2 &&
        r.every(finite) &&
        r[0] < r[1] &&
        r[1] <= s.duration &&
        (!i || r[0] >= s.seekable[i - 1][1]),
    ) &&
    Array.isArray(s.samples) &&
    s.samples.length <= 1800 &&
    s.samples.every(
      (v, i) =>
        v &&
        finite(v.at) &&
        v.at <= s.elapsed &&
        finite(v.peak) &&
        v.peak <= 255 &&
        (!i || v.at > s.samples[i - 1].at),
    )
  );
}
export function validRecordingAction(value: unknown): value is RecordingAction {
  if (!value || typeof value !== "object") return false;
  const a = value as RecordingAction;
  return (
    ["close", "toggle", "finish", "playback", "preview-retry"].includes(
      a.action,
    ) ||
    (a.action === "skip" && (a.seconds === -15 || a.seconds === 15)) ||
    (a.action === "seek" && finite(a.milliseconds))
  );
}
export type RecordingPresentation = "float" | "dock";
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
  | ({ kind: "action" } & RecordingAction)
  | { kind: "presentation"; mode: RecordingPresentation; request: number }
  | {
      kind: "presentation-result";
      sequence: number;
      mode: RecordingPresentation;
      request: number;
      error?: string;
    }
  | { kind: "visibility"; target: "owner" | "child"; visible: boolean }
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
  private latest?: RecordingViewState;
  private presentationSerial = 0;
  private childRequest = 0;
  private presentationWork = Promise.resolve();
  private subscribers = new Set<() => void>();
  private dockWait?: {
    serial: number;
    resolve: (sequence: number) => void;
    reject: (error: Error) => void;
  };
  private snapshot: {
    mode: RecordingPresentation;
    dock: boolean;
    switching: boolean;
    serial: number;
    state?: RecordingViewState;
    error: string;
  } = { mode: "float", dock: false, switching: false, serial: 0, error: "" };
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  };
  private project(patch: Partial<typeof this.snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.subscribers) listener();
  }
  confirmDock(sequence: number, serial: number) {
    if (
      this.dockWait?.serial === serial &&
      this.snapshot.serial === serial &&
      sequence === this.latest?.sequence
    )
      this.dockWait.resolve(sequence);
  }
  private async dockReady(serial: number) {
    while (true) {
      const sequence = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("右侧录音界面尚未就绪，浮动窗口仍保留")),
          8000,
        );
        this.dockWait = {
          serial,
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        this.project({ dock: true, serial, state: this.latest });
      }).finally(() => {
        this.dockWait = undefined;
      });
      if (
        serial !== this.presentationSerial ||
        sequence === this.latest?.sequence
      )
        return;
    }
  }
  switchPresentation(mode: RecordingPresentation) {
    if (mode !== "float" && mode !== "dock")
      return Promise.reject(Error("录音显示方式无效"));
    if (this.closed)
      return this.closedSafely
        ? Promise.resolve()
        : Promise.reject(Error("录音窗口意外关闭，请保持原笔记窗口打开"));
    const serial = ++this.presentationSerial;
    // Cancel an obsolete mount wait; only the newest request may hide a view.
    this.dockWait?.reject(Error("录音显示切换已更新"));
    const work = this.presentationWork
      .catch(() => {})
      .then(async () => {
        if (serial !== this.presentationSerial || this.closed) return;
        this.project({ switching: true, serial, error: "" });
        try {
          if (mode === this.snapshot.mode) return;
          if (!this.ports.visibility) throw Error("录音显示切换尚未连接");
          if (mode === "dock") {
            if (!this.latest) throw Error("录音状态尚未确认，请保留浮动窗口");
            await this.ports.visibility("owner", true);
            if (serial !== this.presentationSerial) return;
            await this.dockReady(serial);
            if (serial !== this.presentationSerial) return;
            await this.ports.visibility("child", false);
            this.project({ mode: "dock", dock: true });
          } else {
            await this.ports.visibility("child", true);
            this.project({ mode: "float", dock: false });
          }
        } catch (error) {
          if (serial === this.presentationSerial) {
            this.project({
              error: errorText(error),
              dock: this.snapshot.mode === "dock",
            });
            throw error;
          }
        } finally {
          if (serial === this.presentationSerial) {
            this.project({
              switching: false,
              dock: this.snapshot.mode === "dock",
            });
            void this.ports
              .send({
                kind: "presentation-result",
                sequence: serial,
                mode: this.snapshot.mode,
                request: this.childRequest,
                error: this.snapshot.error || undefined,
              })
              .catch(() => {});
          }
        }
      });
    this.presentationWork = work;
    return work;
  }
  ensureFloating() {
    return this.switchPresentation("float");
  }
  action(action: RecordingAction) {
    if (!validRecordingAction(action))
      return Promise.reject(Error("录音操作无效"));
    if (
      action.action === "seek" &&
      (!(this.latest?.canSeek || this.latest?.seeking) ||
        !this.latest.seekable.some(
          ([start, end]) =>
            action.milliseconds >= start && action.milliseconds <= end,
        ))
    )
      return Promise.reject(Error("录音回放位置超出实际可播放范围"));
    return this.ports.send({ kind: "action", ...action });
  }
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
      visibility?: (
        target: "owner" | "child",
        visible: boolean,
      ) => Promise<void>;
    },
  ) {}

  async receive(event: RecordingEnvelope) {
    if (!sameRecording(this.identity, event) || this.closed) return;
    const message = event.message;
    if (event.from === "host" && message.kind === "child-closed") {
      this.closed = true;
      this.dockWait?.reject(Error("录音窗口已关闭，不能继续切换显示"));
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
      if (!validRecordingState(message.state))
        throw Error("录音状态无效，保留原录音窗口");
      if (message.state.sequence <= (this.latest?.sequence ?? 0)) return;
      this.latest = message.state;
      this.project({ state: message.state });
      this.started ||= message.state.recordedAt !== undefined;
      this.captureError = message.state.phase === "error";
      this.ports.view(message.state);
    } else if (message.kind === "presentation") {
      if (
        !["float", "dock"].includes(message.mode) ||
        !Number.isSafeInteger(message.request) ||
        message.request <= 0
      )
        throw Error("录音显示请求无效");
      if (message.request <= this.childRequest) return;
      this.childRequest = message.request;
      await this.switchPresentation(message.mode).catch(() => {});
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
    } else throw Error("未知录音消息，保留原录音窗口");
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
    return this.action({ action: "toggle" });
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
