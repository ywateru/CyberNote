import {
  browserEnvironment,
  type RecordingEnvironment,
} from "./recording-session";
import {
  RecordingPcm,
  RECORDING_MAX_BYTES,
  RECORDING_SAMPLE_RATE,
} from "./recording-pcm";

type Callbacks = {
  onRecording: () => void;
  onLevel: (level: number) => void;
  onError: (error: unknown) => void;
};
/** One authorization and stream, independently finalized recorder segments.
 * Sealed/failed segments remain owned until the whole panel is disposed. */
export class DesktopRecordingSession {
  private live = true;
  private preparationOpen = true;
  private hasStarted = false;
  private stream?: MediaStream;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private source?: MediaStreamAudioSourceNode;
  private timer?: number;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private sealed: Blob[] = [];
  private rawBytes = 0;
  private pcm = new RecordingPcm();
  private segment?: Promise<Blob>;
  private resolveSegment?: (blob: Blob) => void;
  private rejectSegment?: (error: Error) => void;
  private closingSegment = false;
  private segmentError?: Error;
  private deadline?: ReturnType<typeof setTimeout>;
  private preparationCancel?: () => void;
  private decoding?: Promise<Blob>;
  private limitTimer?: ReturnType<typeof setTimeout>;
  private activeMS = 0;
  private segmentStarted = 0;
  constructor(
    private callbacks: Callbacks,
    private environment: RecordingEnvironment = browserEnvironment,
    private decode: (blob: Blob) => Promise<AudioBuffer> = async (blob) => {
      const context = new AudioContext({ sampleRate: RECORDING_SAMPLE_RATE });
      try {
        return await context.decodeAudioData(await blob.arrayBuffer());
      } finally {
        await context.close();
      }
    },
  ) {}
  private prepare<T>(pending: Promise<T>, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const end = (error?: unknown, value?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.preparationCancel = undefined;
        if (error) reject(error);
        else resolve(value!);
      };
      const timer = setTimeout(() => end(Error(message)), 45000);
      this.preparationCancel = () => end(Error("录音准备已取消。"));
      pending.then(
        (value) => end(undefined, value),
        (error) => end(error),
      );
    });
  }
  private trackEnded = () => {
    if (!this.live) return;
    const error = Error("麦克风已断开。已收集的音频仍保留，可重试保存。");
    this.segmentError = error;
    void this.seal().catch(() => {});
    this.callbacks.onError(error);
  };
  async start() {
    try {
      if (this.environment.authorize)
        await this.prepare(
          this.environment.authorize(),
          "系统麦克风授权等待超时，录音未开始。",
        );
      if (!this.live) return;
      const pending = this.environment.getStream().then((stream) => {
        if (!this.live || !this.preparationOpen) {
          for (const track of stream.getTracks()) track.stop();
        } else this.stream = stream;
        return stream;
      });
      const stream = await this.prepare(
        pending,
        "麦克风准备超时，录音未开始；请检查系统提示后重试。",
      );
      if (!this.live) return;
      for (const track of stream.getTracks()) {
        track.addEventListener("ended", this.trackEnded);
        if (track.readyState === "ended")
          throw Error("麦克风已断开，录音未开始。");
      }
      this.context = this.environment.createContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 64;
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      this.timer = this.environment.setInterval(() => {
        if (
          !this.live ||
          this.recorder?.state !== "recording" ||
          !this.analyser
        )
          return;
        try {
          const data = new Uint8Array(this.analyser.frequencyBinCount);
          this.analyser.getByteFrequencyData(data);
          this.callbacks.onLevel(
            Math.max(2, data.reduce((a, b) => a + b, 0) / data.length),
          );
        } catch (error) {
          this.callbacks.onError(error);
        }
      }, 100);
      if (!this.resume()) this.releaseCapture();
      this.preparationOpen = false;
    } catch (error) {
      // Close only startup admission/resources. Collected audio belongs to the
      // session and must never be discarded by an acquisition failure.
      this.preparationOpen = false;
      if (!this.hasStarted) this.releaseCapture();
      if (this.live) this.callbacks.onError(error);
    }
  }
  resume(): boolean {
    if (
      !this.live ||
      !this.stream ||
      this.recorder ||
      this.decoding ||
      this.sealed.length ||
      this.segmentError
    )
      return false;
    try {
      const recorder = this.environment.createRecorder(this.stream);
      this.recorder = recorder;
      this.chunks = [];
      this.closingSegment = false;
      this.segment = new Promise((resolve, reject) => {
        this.resolveSegment = resolve;
        this.rejectSegment = reject;
      });
      void this.segment.catch(() => {});
      recorder.ondataavailable = (event) => {
        if (!this.live || !event.data.size) return;
        this.chunks.push(event.data);
        this.rawBytes += event.data.size;
        if (this.rawBytes > RECORDING_MAX_BYTES) {
          this.segmentError = Error(
            "原始录音达到100 MB边界，音频仍保留，请保存已有录音。",
          );
          void this.seal().catch(() => {});
          this.callbacks.onError(this.segmentError);
        }
      };
      recorder.onerror = (event) => {
        this.segmentError = Error(
          "录音设备发生错误，已收集的分段仍保留，可重试完成保存。",
        );
        void event;
        void this.seal().catch(() => {});
        this.callbacks.onError(this.segmentError);
      };
      recorder.onstop = () => {
        if (!this.live) return;
        clearTimeout(this.deadline);
        clearTimeout(this.limitTimer);
        this.activeMS += Math.max(0, performance.now() - this.segmentStarted);
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        this.chunks = [];
        this.sealed.push(blob);
        this.recorder = undefined;
        recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
        this.resolveSegment?.(blob);
        this.resolveSegment = undefined;
        this.rejectSegment = undefined;
        if (!this.closingSegment)
          this.callbacks.onError(
            Error("录音意外停止，分段已保留，请重试保存。"),
          );
      };
      recorder.start(250);
      this.hasStarted = true;
      this.segmentStarted = performance.now();
      // Bound a single decode as well as the cumulative PCM file. The actual
      // decoded frame count remains authoritative; elapsed time never truncates.
      const remaining =
        ((RECORDING_MAX_BYTES - 44) / (RECORDING_SAMPLE_RATE * 2)) * 1000 -
        this.activeMS;
      this.limitTimer = setTimeout(
        () => {
          this.segmentError = Error(
            "录音达到100 MB时长边界，已停止新增采集，请保存录音。",
          );
          void this.seal().catch(() => {});
          this.callbacks.onError(this.segmentError);
        },
        Math.max(1, remaining),
      );
      this.callbacks.onRecording();
      return true;
    } catch (error) {
      // create/start failure has no finalized segment. Retain prior PCM, but
      // detach a failed recorder so checkpoint can save the previous audio.
      const recorder = this.recorder;
      if (recorder) {
        recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            /* release tracks below */
          }
        }
      }
      this.recorder = undefined;
      this.segment = undefined;
      this.resolveSegment = this.rejectSegment = undefined;
      this.segmentError = error instanceof Error ? error : Error(String(error));
      this.preparationOpen = false;
      this.releaseCapture();
      this.callbacks.onError(error);
      return false;
    }
  }
  private seal(): Promise<Blob> {
    if (!this.recorder)
      return this.segment ?? Promise.reject(Error("录音尚无完整分段。"));
    if (!this.closingSegment) {
      this.closingSegment = true;
      clearTimeout(this.limitTimer);
      this.deadline = setTimeout(() => {
        const error = Error("录音分段收尾超时，原始数据仍保留，请重试保存。");
        this.rejectSegment?.(error);
        this.callbacks.onError(error);
      }, 15000);
      try {
        if (this.recorder.state !== "inactive") this.recorder.stop();
      } catch (error) {
        this.rejectSegment?.(
          error instanceof Error ? error : Error(String(error)),
        );
      }
    }
    return this.segment!;
  }
  checkpoint(): Promise<Blob> {
    if (this.decoding) return this.decoding;
    const work = (async () => {
      if (this.recorder) await this.seal();
      for (const blob of [...this.sealed]) {
        if (!blob.size)
          throw Error(
            "完整录音分段为空，请保持窗口打开；上次已保存版本不受影响。",
          );
        const audio = await this.decode(blob);
        this.pcm.append(audio);
        this.sealed.shift();
        this.rawBytes -= blob.size;
      }
      return this.pcm.wav();
    })();
    this.decoding = work;
    void work
      .finally(() => {
        if (this.decoding === work) this.decoding = undefined;
      })
      .catch(() => {});
    return work;
  }
  get canResume() {
    return (
      this.live &&
      !this.recorder &&
      !this.decoding &&
      !this.sealed.length &&
      !this.segmentError &&
      !!this.stream?.getTracks().every((track) => track.readyState !== "ended")
    );
  }
  dispose() {
    if (!this.live) return;
    this.live = false;
    this.preparationOpen = false;
    this.preparationCancel?.();
    clearTimeout(this.deadline);
    clearTimeout(this.limitTimer);
    if (this.timer !== undefined) this.environment.clearInterval(this.timer);
    if (this.recorder) {
      this.recorder.ondataavailable =
        this.recorder.onstop =
        this.recorder.onerror =
          null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
    }
    this.releaseCapture();
  }
  private releaseCapture() {
    if (this.timer !== undefined) this.environment.clearInterval(this.timer);
    this.timer = undefined;
    for (const track of this.stream?.getTracks() ?? []) {
      track.removeEventListener("ended", this.trackEnded);
      track.stop();
    }
    this.stream = undefined;
    this.source?.disconnect();
    this.source = undefined;
    this.analyser?.disconnect();
    this.analyser = undefined;
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}
