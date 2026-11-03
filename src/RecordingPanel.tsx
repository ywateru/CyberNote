import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { RecordingSession } from "./recording-session";
import {
  createRecordingPlayback,
  initialRecordingPlaybackState,
} from "./recording-playback";
import { RecordingClock, recordingTime } from "./recording-clock";
import "./RecordingPanel.css";

type Phase =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "finalizing"
  | "saving"
  | "retry"
  | "submitted"
  | "error";
const errText = (e: unknown): string => {
  if (e instanceof AggregateError)
    return `${e.message} ${e.errors.map(errText).join("；")}`;
  return typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);
};

function recordingFile(blob: Blob): File {
  if (!blob.size) throw Error("录音没有可保存的音频，请重新录制。");
  // Use the recorder's actual format; never label unknown bytes as WebM.
  const format =
    /^audio\/(webm|mp4|ogg|wav|x-wav|aac|mpeg)(?:\s*;[^\r\n]*)?$/i.exec(
      blob.type,
    );
  if (!format) throw Error("设备返回了无法识别的录音格式，请重新录制。");
  const extensions: Record<string, string> = {
    webm: "webm",
    mp4: "m4a",
    ogg: "ogg",
    wav: "wav",
    "x-wav": "wav",
    aac: "aac",
    mpeg: "mp3",
  };
  return new File([blob], `新录音.${extensions[format[1].toLowerCase()]}`, {
    type: blob.type,
  });
}

export default function RecordingPanel({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (file: File) => Promise<void>;
}) {
  const [status, setStatus] = useState<Phase>("idle");
  const phase = useRef<Phase>("idle");
  const live = useRef(false);
  const session = useRef<RecordingSession | null>(null);
  const clock = useRef(new RecordingClock());
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [levels, setLevels] = useState<number[]>([]);
  const finalFile = useRef<File | null>(null);
  const previewGeneration = useRef(0);
  const previewPlayer = useRef<ReturnType<
    typeof createRecordingPlayback
  > | null>(null);
  const [previewSource, setPreviewSource] = useState<{
    blob: Blob;
    generation: number;
  } | null>(null);
  const [previewState, setPreviewState] = useState(
    initialRecordingPlaybackState,
  );
  const [previewError, setPreviewError] = useState("");
  const [previewPending, setPreviewPending] = useState(false);
  const deadline = useRef<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const [createdAt] = useState(() =>
    new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const transition = (next: Phase) => {
    phase.current = next;
    setStatus(next);
  };
  const clearDeadline = () => {
    if (deadline.current !== null) window.clearTimeout(deadline.current);
    deadline.current = null;
  };
  const clearPlayback = () => {
    ++previewGeneration.current;
    previewPlayer.current?.dispose();
    previewPlayer.current = null;
    setPreviewSource(null);
    setPreviewState(initialRecordingPlaybackState);
    setPreviewError("");
    setPreviewPending(false);
  };
  const fail = (e: unknown) => {
    if (!live.current) return;
    clearDeadline();
    clearPlayback();
    clock.current.pause();
    setElapsed(clock.current.milliseconds());
    session.current?.dispose();
    setError(errText(e));
    transition("error");
  };
  const submit = async (file: File) => {
    if (!live.current) return;
    clearPlayback();
    transition("saving");
    setError("");
    try {
      await done.current(file);
      if (live.current && phase.current === "saving") transition("submitted");
    } catch (e) {
      if (!live.current || phase.current !== "saving") return;
      setError(errText(e));
      transition("retry");
      setPreviewSource({ blob: file, generation: previewGeneration.current });
    }
  };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      ++previewGeneration.current;
      previewPlayer.current?.dispose();
      previewPlayer.current = null;
      clearDeadline();
      clock.current.pause();
      session.current?.dispose();
      session.current = null;
    };
  }, []);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => {
      if (live.current && phase.current === "recording")
        setElapsed(clock.current.milliseconds());
    }, 50);
    return () => window.clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (
      !previewSource ||
      !live.current ||
      previewSource.generation !== previewGeneration.current ||
      (phase.current !== "paused" && phase.current !== "retry")
    )
      return;
    const generation = previewSource.generation;
    let player: ReturnType<typeof createRecordingPlayback>;
    try {
      player = createRecordingPlayback(
        new Audio(),
        previewSource.blob,
        (state) => {
          if (
            live.current &&
            generation === previewGeneration.current &&
            (phase.current === "paused" || phase.current === "retry")
          )
            setPreviewState(state);
        },
      );
      previewPlayer.current = player;
    } catch (error) {
      setPreviewError(errText(error));
      return;
    }
    return () => {
      player.dispose();
      if (previewPlayer.current === player) previewPlayer.current = null;
    };
  }, [previewSource]);

  const preparePausedPreview = () => {
    clearPlayback();
    const generation = previewGeneration.current;
    const capture = session.current;
    if (!capture) return;
    setPreviewPending(true);
    void capture
      .snapshot()
      .then((blob) => {
        if (
          !live.current ||
          phase.current !== "paused" ||
          generation !== previewGeneration.current
        )
          return;
        setPreviewPending(false);
        setPreviewSource({ blob, generation });
      })
      .catch((error) => {
        if (
          !live.current ||
          phase.current !== "paused" ||
          generation !== previewGeneration.current
        )
          return;
        setPreviewPending(false);
        setPreviewError(errText(error));
      });
  };

  const begin = () => {
    if (!live.current || phase.current !== "idle") return;
    transition("requesting");
    const capture = new RecordingSession({
      onRecording: () => {
        if (!live.current || phase.current !== "requesting") return;
        clock.current.resume();
        transition("recording");
      },
      onStopped: (blob) => {
        if (!live.current) return;
        if (phase.current !== "finalizing") {
          fail(Error("录音意外停止，请重新录制。"));
          return;
        }
        clearDeadline();
        try {
          const file = recordingFile(blob);
          finalFile.current = file;
          void submit(file);
        } catch (e) {
          fail(e);
        }
      },
      onLevel: (level) => {
        if (live.current && phase.current === "recording")
          setLevels((values) => [...values.slice(-89), level]);
      },
      onError: fail,
    });
    session.current = capture;
    void capture.start();
  };
  const primary = () => {
    if (phase.current === "idle") {
      begin();
      return;
    }
    if (phase.current === "recording" && session.current?.pause()) {
      clock.current.pause();
      setElapsed(clock.current.milliseconds());
      transition("paused");
      preparePausedPreview();
    } else if (phase.current === "paused") {
      clearPlayback();
      if (session.current?.resume()) {
        clock.current.resume();
        transition("recording");
      }
    }
  };
  const finish = () => {
    if (!live.current) return;
    if (phase.current === "retry" && finalFile.current) {
      void submit(finalFile.current);
      return;
    }
    if (phase.current !== "paused") return;
    clearPlayback();
    transition("finalizing");
    // An absent terminal event is a visible failure, never an empty attachment.
    deadline.current = window.setTimeout(
      () => fail(Error("录音收尾超时，请重新录制。")),
      15000,
    );
    session.current?.stop();
  };
  const cancel = () => {
    if (!live.current) return;
    live.current = false;
    clearPlayback();
    clearDeadline();
    clock.current.pause();
    session.current?.dispose();
    onCancel();
  };
  const canFinish = status === "paused" || status === "retry";
  const primaryLabel =
    status === "idle"
      ? "开始录音"
      : status === "paused"
        ? "继续录音"
        : "暂停录音";
  const playbackError =
    previewError ||
    previewState.mediaError ||
    previewState.playError ||
    previewState.seekError ||
    previewState.durationError;
  const previewAllowed = status === "paused" || status === "retry";
  const notice =
    error ||
    playbackError ||
    (previewPending ? "正在准备暂停回放…" : "") ||
    previewState.seekMessage ||
    (status === "requesting"
      ? "正在准备麦克风…"
      : status === "finalizing"
        ? "正在完成录音…"
        : status === "saving"
          ? "正在保存录音…"
          : status === "submitted"
            ? "录音已提交"
            : "");
  return (
    <div
      className="recording-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape") cancel();
      }}
    >
      <section
        className="recording-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="新录音"
        data-recording-state={status}
      >
        <div className="sheet-handle" />
        <header>
          <button className="recording-cancel" onClick={cancel}>
            取消
          </button>
          <div>
            <strong>新录音</strong>
            <small>
              今天 {createdAt} {recordingTime(elapsed, false)}
            </small>
          </div>
        </header>
        <div className="waveform" aria-hidden="true">
          <div className="wave-bars">
            {levels.map((height, index) => (
              <i key={index} style={{ height: `${height}px` }} />
            ))}
          </div>
          <div className="recording-playhead" />
        </div>
        <div
          className="recording-time"
          aria-label={
            previewAllowed && previewState.playing
              ? "实际回放位置"
              : "活动录音时间"
          }
        >
          {recordingTime(
            previewAllowed && previewState.playing
              ? previewState.time * 1000
              : elapsed,
          )}
        </div>
        <div
          className="recording-notice"
          role={error || playbackError ? "alert" : "status"}
        >
          {notice}
        </div>
        <div className="recording-playback" aria-label="录音回放">
          <button
            aria-label="后退15秒"
            disabled={!previewAllowed || !previewState.canSeek}
            onClick={() => previewPlayer.current?.skip(-15)}
          >
            <RotateCcw />
            <span>15</span>
          </button>
          <button
            aria-label={previewState.playing ? "暂停回放" : "播放录音"}
            disabled={!previewAllowed || !previewState.ready}
            onClick={() => previewPlayer.current?.toggle()}
          >
            {previewState.playing ? (
              <Pause fill="currentColor" />
            ) : (
              <Play fill="currentColor" />
            )}
          </button>
          <button
            aria-label="前进15秒"
            disabled={!previewAllowed || !previewState.canSeek}
            onClick={() => previewPlayer.current?.skip(15)}
          >
            <RotateCw />
            <span>15</span>
          </button>
        </div>
        {previewAllowed && previewSource && playbackError && (
          <button
            className="recording-playback-retry"
            onClick={() => previewPlayer.current?.retry()}
          >
            重试回放
          </button>
        )}
        <div className="recording-controls">
          <button
            className={`recording-primary recording-primary-${status}`}
            aria-label={primaryLabel}
            disabled={
              status !== "idle" && status !== "recording" && status !== "paused"
            }
            onClick={primary}
          >
            {status === "idle" || status === "requesting" ? (
              <span className="recording-red-core" />
            ) : status === "paused" ? (
              "继续"
            ) : (
              <Pause fill="currentColor" />
            )}
          </button>
          <button
            className="recording-done"
            disabled={!canFinish}
            onClick={finish}
          >
            {status === "retry" ? "重试" : "完成"}
          </button>
        </div>
      </section>
    </div>
  );
}
