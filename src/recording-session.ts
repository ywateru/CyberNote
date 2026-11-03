type RecordingCallbacks = {
  onRecording: () => void;
  onStopped: (blob: Blob) => void;
  onLevel: (level: number) => void;
  onError: (error: unknown) => void;
};

export type RecordingEnvironment = {
  getStream: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  createContext: () => AudioContext;
  setInterval: (callback: () => void, milliseconds: number) => number;
  clearInterval: (timer: number) => void;
};

const browserEnvironment: RecordingEnvironment = {
  getStream: () => {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("设备未提供录音访问，请检查麦克风权限。");
    return navigator.mediaDevices.getUserMedia({ audio: true });
  },
  createRecorder: (stream) => {
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    );
    return new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  },
  createContext: () => new AudioContext(),
  setInterval: (callback, milliseconds) =>
    window.setInterval(callback, milliseconds),
  clearInterval: (timer) => window.clearInterval(timer),
};

type SnapshotRequest = {
  pause: number;
  promise: Promise<Blob>;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
};

// One instance owns one permission request and all of its capture resources.
// Discard closes callback admission before stopping resources; normal stop keeps
// only the final recorder events alive until the browser delivers the blob.
export class RecordingSession {
  recorder: MediaRecorder | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;
  private tracks: MediaStreamTrack[] = [];
  private chunks: BlobPart[] = [];
  private live = true;
  private started = false;
  private failed = false;
  private finished = false;
  private stopping = false;
  private pauseSequence = 0;
  private observedPause = 0;
  private pauseEvents: number[] = [];
  private snapshotRequest?: SnapshotRequest;
  // An issued request cannot be unsent. Keep its slot through resume/cancel so
  // its late data event cannot be assigned directly to a newer pause request.
  private issuedSnapshot?: SnapshotRequest;

  constructor(
    private callbacks: RecordingCallbacks,
    private environment: RecordingEnvironment = browserEnvironment,
  ) {}

  private get accepting() {
    return this.live && !this.failed && !this.finished;
  }

  private trackEnded = () => {
    if (this.accepting && !this.stopping)
      this.fail(Error("麦克风已断开，录音已停止。"));
  };

  private detachRecorder() {
    if (!this.recorder) return;
    this.recorder.ondataavailable = null;
    this.recorder.onstop = null;
    this.recorder.onerror = null;
    this.recorder.onpause = null;
    this.pauseEvents = [];
    this.issuedSnapshot = undefined;
  }

  private releaseCapture(): unknown[] {
    const errors: unknown[] = [];
    const attempt = (operation: () => void) => {
      try {
        operation();
      } catch (error) {
        errors.push(error);
      }
    };
    const timer = this.timer;
    this.timer = null;
    if (timer !== null) attempt(() => this.environment.clearInterval(timer));
    const source = this.source;
    const analyser = this.analyser;
    this.source = this.analyser = null;
    if (source) attempt(() => source.disconnect());
    if (analyser) attempt(() => analyser.disconnect());
    const tracks = this.tracks;
    this.tracks = [];
    for (const track of tracks)
      attempt(() => track.removeEventListener("ended", this.trackEnded));
    for (const track of tracks) attempt(() => track.stop());
    const context = this.context;
    this.context = null;
    if (context)
      attempt(() => {
        void context.close().catch((error: unknown) => this.fail(error));
      });
    return errors;
  }

  private discard(): unknown[] {
    this.invalidateSnapshot();
    this.detachRecorder();
    this.chunks = [];
    const errors: unknown[] = [];
    try {
      if (this.recorder && this.recorder.state !== "inactive")
        this.recorder.stop();
    } catch (error) {
      errors.push(error);
    }
    this.recorder = null;
    return [...errors, ...this.releaseCapture()];
  }

  private fail(error: unknown) {
    if (!this.accepting) return;
    this.failed = true;
    const cleanupErrors = this.discard();
    this.callbacks.onError(
      cleanupErrors.length
        ? new AggregateError(
            [error, ...cleanupErrors],
            "录音失败，资源释放发生错误。",
          )
        : error,
    );
  }

  async start() {
    if (!this.accepting || this.started) return;
    this.started = true;
    try {
      const stream = await this.environment.getStream();
      if (!this.accepting) {
        // Permission can resolve after dispose; never attach it to a new session.
        this.tracks = stream.getTracks();
        const errors = this.releaseCapture();
        if (errors.length) console.error("录音资源释放失败。", errors);
        return;
      }
      this.tracks = stream.getTracks();
      for (const track of this.tracks) {
        track.addEventListener("ended", this.trackEnded);
        if (track.readyState === "ended")
          throw Error("麦克风已断开，录音已停止。");
      }
      const recorder = this.environment.createRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (!this.accepting) return;
        if (event.data.size) this.chunks.push(event.data);
        const issued = this.issuedSnapshot;
        if (issued) {
          this.issuedSnapshot = undefined;
          if (
            issued === this.snapshotRequest &&
            !issued.settled &&
            issued.pause === this.observedPause &&
            !this.stopping
          ) {
            const blob = new Blob([...this.chunks], {
              type: recorder.mimeType,
            });
            this.settleSnapshot(
              issued,
              blob.size ? blob : undefined,
              Error("暂停录音尚无可回放的数据，可继续录制或完成保存。"),
            );
          }
          this.issueSnapshot();
        }
      };
      recorder.onpause = () => {
        const pause = this.pauseEvents.shift();
        if (
          !this.accepting ||
          this.stopping ||
          pause !== this.pauseSequence ||
          recorder.state !== "paused"
        )
          return;
        this.observedPause = pause;
        this.issueSnapshot();
      };
      recorder.onerror = (event) =>
        this.fail(
          "error" in event ? event.error : Error("录音发生错误，已停止采集。"),
        );
      recorder.onstop = () => {
        if (!this.accepting) return;
        this.stopping = true;
        this.detachRecorder();
        const errors = this.releaseCapture();
        if (errors.length) {
          this.fail(new AggregateError(errors, "录音资源释放失败。"));
          return;
        }
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        this.chunks = [];
        this.finished = true;
        this.callbacks.onStopped(blob);
      };
      recorder.start(250);
      if (!this.accepting) return;
      this.callbacks.onRecording();
      if (!this.accepting) return;
      this.context = this.environment.createContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 64;
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      const analyser = this.analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      this.timer = this.environment.setInterval(() => {
        if (!this.accepting || this.stopping || recorder.state !== "recording")
          return;
        try {
          analyser.getByteFrequencyData(data);
          this.callbacks.onLevel(
            Math.max(2, data.reduce((a, b) => a + b, 0) / data.length),
          );
        } catch (error) {
          this.fail(error);
        }
      }, 100);
    } catch (error) {
      this.fail(error);
    }
  }

  pause() {
    if (!this.accepting || this.stopping || !this.recorder) return false;
    try {
      this.invalidateSnapshot();
      this.pauseEvents.push(++this.pauseSequence);
      this.recorder.pause();
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  resume() {
    if (!this.accepting || this.stopping || !this.recorder) return false;
    try {
      this.invalidateSnapshot();
      this.recorder.resume();
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  private settleSnapshot(
    request: SnapshotRequest,
    blob?: Blob,
    error?: unknown,
  ) {
    if (request.settled) return;
    request.settled = true;
    clearTimeout(request.timer);
    if (blob) request.resolve(blob);
    else request.reject(error);
  }

  private invalidateSnapshot() {
    this.observedPause = 0;
    if (this.snapshotRequest)
      this.settleSnapshot(
        this.snapshotRequest,
        undefined,
        Error("暂停回放已结束。"),
      );
    this.snapshotRequest = undefined;
  }

  private issueSnapshot() {
    const request = this.snapshotRequest;
    if (
      !request ||
      request.settled ||
      this.issuedSnapshot ||
      !this.accepting ||
      this.stopping ||
      !this.recorder ||
      this.recorder.state !== "paused" ||
      this.observedPause !== request.pause
    )
      return;
    this.issuedSnapshot = request;
    try {
      this.recorder.requestData();
    } catch (error) {
      this.issuedSnapshot = undefined;
      this.settleSnapshot(request, undefined, error);
    }
  }

  /** A nonterminal prefix candidate, not a guarantee of a complete playable or
   * seekable container. Main chunks and onStopped/final File are untouched. */
  snapshot(): Promise<Blob> {
    if (
      !this.accepting ||
      this.stopping ||
      !this.recorder ||
      (this.recorder.state !== "paused" &&
        !this.pauseEvents.includes(this.pauseSequence))
    )
      return Promise.reject(Error("录音尚未实际暂停，不能创建回放快照。"));
    if (this.snapshotRequest) return this.snapshotRequest.promise;
    let resolve!: (blob: Blob) => void, reject!: (error: unknown) => void;
    const promise = new Promise<Blob>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const request: SnapshotRequest = {
      pause: this.pauseSequence,
      promise,
      resolve,
      reject,
      settled: false,
      timer: setTimeout(
        () =>
          this.settleSnapshot(
            request,
            undefined,
            Error("暂停回放数据未就绪，可继续录制或完成保存。"),
          ),
        5000,
      ),
    };
    this.snapshotRequest = request;
    this.issueSnapshot();
    return promise;
  }

  stop() {
    if (!this.accepting || this.stopping || !this.recorder) return;
    this.stopping = true;
    this.invalidateSnapshot();
    try {
      if (this.recorder.state !== "inactive") this.recorder.stop();
      const errors = this.releaseCapture();
      if (errors.length)
        this.fail(new AggregateError(errors, "录音资源释放失败。"));
    } catch (error) {
      this.fail(error);
    }
  }

  dispose() {
    if (!this.live) return;
    this.live = false;
    const errors = this.discard();
    if (errors.length) console.error("录音资源释放失败。", errors);
  }
}

export function createRecordingPreview(
  blob: Blob,
  urls: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
) {
  const url = urls.createObjectURL(blob);
  let live = true;
  return {
    url,
    dispose: () => {
      if (!live) return;
      live = false;
      urls.revokeObjectURL(url);
    },
  };
}
