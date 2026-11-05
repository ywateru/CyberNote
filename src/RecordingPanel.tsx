import DesktopRecordingPanel from "./DesktopRecordingPanel";
import { useEffect, useRef, useState } from "react";
import RecordingView from "./RecordingView";
import {
  validRecordingAction,
  type RecordingAction,
  type RecordingPresentation,
  type RecordingViewState,
} from "./recording-coordinator";
import {
  RecordingWaveformHistory,
  type RecordingSample,
} from "./recording-waveform";
import { RecordingSession } from "./recording-session";
import {
  createRecordingPlayback,
  initialRecordingPlaybackState,
} from "./recording-playback";
import { RecordingClock } from "./recording-clock";
import {
  attachmentRecordedAt,
  type RecordingResult,
  type RecordingRevision,
} from "./recording-metadata";
import "./RecordingPanel.css";

type Phase = RecordingViewState["phase"];
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

export type RecordingPanelHandle = {
  close: () => void;
  toggle: () => void;
  dispatch: (action: RecordingAction) => void;
};

function MobileRecordingPanel({
  onCancel,
  onDone,
  mobile = true,
  onHandle,
  onState,
  onPresentation,
  switching,
}: {
  mobile?: boolean;
  onPresentation?: (mode: RecordingPresentation) => void;
  switching?: boolean;
  onHandle?: (handle: RecordingPanelHandle | null) => void;
  onState?: (state: RecordingViewState) => void;
  onCancel: () => void;
  onDone: (result: RecordingResult) => Promise<void>;
}) {
  const [status, setStatus] = useState<Phase>("idle");
  const phase = useRef<Phase>("idle");
  const live = useRef(false);
  const session = useRef<RecordingSession | null>(null);
  const clock = useRef(new RecordingClock());
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [samples, setSamples] = useState<RecordingSample[]>([]);
  const history = useRef(new RecordingWaveformHistory());
  const actions = useRef({
    close: () => {},
    toggle: () => {},
    dispatch: (_action: RecordingAction) => {},
  });
  const previewStatus = useRef(initialRecordingPlaybackState);
  const recordedAt = useRef<number | undefined>(undefined);
  const finalResult = useRef<RecordingResult | null>(null);
  const previewGeneration = useRef(0);
  const previewAudio = useRef<HTMLAudioElement | null>(null);
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
  const [openedAt] = useState(() => Date.now());

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
    previewStatus.current = initialRecordingPlaybackState;
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
  const submit = async (result: RecordingResult) => {
    if (!live.current) return;
    clearPlayback();
    transition("saving");
    setError("");
    try {
      await done.current(result);
      if (live.current && phase.current === "saving") transition("submitted");
    } catch (e) {
      if (!live.current || phase.current !== "saving") return;
      setError(errText(e));
      transition("retry");
      setPreviewSource({
        blob: result.file,
        generation: previewGeneration.current,
      });
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
      previewAudio.current = new Audio();
      player = createRecordingPlayback(
        previewAudio.current,
        previewSource.blob,
        (state) => {
          if (
            live.current &&
            generation === previewGeneration.current &&
            (phase.current === "paused" || phase.current === "retry")
          ) {
            previewStatus.current = state;
            setPreviewState(state);
          }
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
        // Called only after the first actual recorder.start succeeds. This is
        // independent of panel mount, permission wait and the activity clock.
        if (recordedAt.current === undefined)
          recordedAt.current = attachmentRecordedAt(Date.now(), "audio");
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
          if (recordedAt.current === undefined)
            throw Error("录音尚未确认开始时间，请重新录制。");
          const result = Object.freeze({
            file,
            recordedAt: recordedAt.current,
          });
          finalResult.current = result;
          void submit(result);
        } catch (e) {
          fail(e);
        }
      },
      onLevel: (level) => {
        if (live.current && phase.current === "recording") {
          history.current.append(clock.current.milliseconds(), level);
          setSamples(history.current.samples());
        }
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
    } else if (
      phase.current === "paused" &&
      !previewStatus.current.playing &&
      !previewStatus.current.playPending
    ) {
      clearPlayback();
      if (session.current?.resume()) {
        clock.current.resume();
        transition("recording");
      }
    }
  };
  const finish = (allowRecording = false) => {
    if (!live.current) return;
    if (phase.current === "retry" && finalResult.current) {
      void submit(finalResult.current);
      return;
    }
    if (
      phase.current !== "paused" &&
      !(allowRecording && phase.current === "recording")
    )
      return;
    clock.current.pause();
    setElapsed(clock.current.milliseconds());
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
  const close = () => {
    if (["idle", "requesting", "error"].includes(phase.current)) cancel();
    else finish(true);
  };
  actions.current.close = close;
  actions.current.toggle = primary;
  useEffect(() => {
    onHandle?.({
      close: () => actions.current.close(),
      toggle: () => actions.current.toggle(),
      dispatch: (action) => actions.current.dispatch(action),
    });
    return () => onHandle?.(null);
  }, [onHandle]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      actions.current.close();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, []);
  const canFinish = status === "paused" || status === "retry";
  const canToggle =
    status === "idle" ||
    status === "recording" ||
    (status === "paused" && !previewState.playing && !previewState.playPending);
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
  const previewPosition = previewAllowed && previewState.ready;
  const activityElapsed = Math.max(elapsed, samples.at(-1)?.at ?? 0);
  const position = previewPosition ? previewState.time * 1000 : activityElapsed;
  const duration = (previewState.duration ?? activityElapsed / 1000) * 1000;
  const seekable: [number, number][] = [];
  if (previewAllowed && previewAudio.current && Number.isFinite(duration)) {
    const ranges = previewAudio.current.seekable;
    for (let i = 0; i < Math.min(ranges.length, 64); i++) {
      const start = Math.max(0, ranges.start(i) * 1000);
      const end = Math.min(duration, ranges.end(i) * 1000);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start)
        seekable.push([start, end]);
    }
  }
  const viewState: RecordingViewState = {
    sequence: 1,
    phase: status,
    openedAt,
    recordedAt: recordedAt.current,
    elapsed: activityElapsed,
    paused: status === "paused",
    canToggle,
    canFinish: status === "recording" || canFinish,
    notice,
    hasError: !!(error || playbackError),
    position,
    duration,
    previewPosition,
    playing: previewState.playing,
    playPending: previewState.playPending,
    previewPending,
    seeking: previewState.seeking,
    canPlay:
      previewAllowed &&
      previewState.ready &&
      !previewState.playPending &&
      !previewState.seeking,
    canSeek: previewAllowed && previewState.canSeek,
    canRetryPreview: !!(previewAllowed && previewSource && playbackError),
    seekable,
    samples,
  };
  const dispatch = (action: RecordingAction) => {
    if (!validRecordingAction(action)) {
      setPreviewError("录音操作无效");
      return;
    }
    switch (action.action) {
      case "close":
        close();
        break;
      case "toggle":
        if (canToggle) primary();
        break;
      case "finish":
        if (canFinish) finish();
        break;
      case "playback":
        if (viewState.canPlay) previewPlayer.current?.toggle();
        break;
      case "preview-retry":
        if (viewState.canRetryPreview) previewPlayer.current?.retry();
        break;
      case "skip":
        if (viewState.canSeek) previewPlayer.current?.skip(action.seconds);
        break;
      case "seek":
        if (
          !(viewState.canSeek || viewState.seeking) ||
          !seekable.some(
            ([start, end]) =>
              action.milliseconds >= start && action.milliseconds <= end,
          )
        ) {
          setPreviewError("录音回放位置超出实际可播放范围");
          return;
        }
        previewPlayer.current?.seek(action.milliseconds / 1000);
        break;
    }
  };
  actions.current.dispatch = dispatch;
  const projection = useRef(viewState);
  projection.current = viewState;
  const projectionSequence = useRef(0);
  // At most ten bounded projections per second, with a trailing real snapshot.
  useEffect(() => {
    if (!onState) return;
    const publish = () =>
      onState({
        ...projection.current,
        sequence: ++projectionSequence.current,
      });
    publish();
    const timer = window.setInterval(publish, 100);
    return () => window.clearInterval(timer);
  }, [onState]);
  return (
    <RecordingView
      state={viewState}
      mobile={mobile}
      act={dispatch}
      onPresentation={onPresentation}
      switching={switching}
    />
  );
}

export default function RecordingPanel(
  props: Parameters<typeof MobileRecordingPanel>[0] & {
    onRevision?: (result: RecordingRevision) => Promise<void>;
  },
) {
  if (props.mobile === false && props.onRevision)
    return <DesktopRecordingPanel {...props} onRevision={props.onRevision} />;
  return <MobileRecordingPanel {...props} />;
}
