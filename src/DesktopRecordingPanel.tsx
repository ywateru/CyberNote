import { useEffect, useRef, useState } from "react";
import RecordingView from "./RecordingView";
import type { RecordingPanelHandle } from "./RecordingPanel";
import { DesktopRecordingSession } from "./desktop-recording-session";
import { RecordingClock } from "./recording-clock";
import {
  RecordingWaveformHistory,
  type RecordingSample,
} from "./recording-waveform";
import {
  createRecordingPlayback,
  initialRecordingPlaybackState,
} from "./recording-playback";
import type {
  RecordingAction,
  RecordingPresentation,
  RecordingViewState,
} from "./recording-coordinator";
import type { RecordingRevision } from "./recording-metadata";

type Props = {
  onCancel: () => void;
  onRevision: (result: RecordingRevision) => Promise<void>;
  onHandle?: (handle: RecordingPanelHandle | null) => void;
  onState?: (state: RecordingViewState) => void;
  onPresentation?: (mode: RecordingPresentation) => void;
  switching?: boolean;
};
const text = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Desktop autosave is separate from the unchanged mobile recorder lifecycle. */
export default function DesktopRecordingPanel(props: Props) {
  const live = useRef(true),
    phase = useRef<RecordingViewState["phase"]>("idle");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState(phase.current),
    [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0),
    [samples, setSamples] = useState<RecordingSample[]>([]);
  const session = useRef<DesktopRecordingSession | null>(null),
    clock = useRef(new RecordingClock());
  const history = useRef(new RecordingWaveformHistory()),
    recordedAt = useRef<number | undefined>(undefined);
  const [openedAt] = useState(Date.now),
    revision = useRef(0),
    candidate = useRef<RecordingRevision | undefined>(undefined);
  const busy = useRef<Promise<void> | undefined>(undefined),
    closing = useRef(false),
    latestBlob = useRef<Blob | undefined>(undefined);
  const actions = useRef<(action: RecordingAction) => void>(() => {}),
    currentProps = useRef(props);
  currentProps.current = props;
  const player = useRef<ReturnType<typeof createRecordingPlayback> | undefined>(
      undefined,
    ),
    audio = useRef<HTMLAudioElement | undefined>(undefined);
  const [playback, setPlayback] = useState(initialRecordingPlaybackState);
  const transition = (next: RecordingViewState["phase"]) => {
    phase.current = next;
    if (live.current) setStatus(next);
  };
  const clearPlayer = () => {
    player.current?.dispose();
    player.current = undefined;
    setPlayback(initialRecordingPlaybackState);
  };
  const stoppedClock = () => {
    clock.current.pause();
    setElapsed(clock.current.milliseconds());
  };
  const makePlayer = (blob: Blob) => {
    clearPlayer();
    audio.current = new Audio();
    player.current = createRecordingPlayback(audio.current, blob, (state) => {
      if (live.current) setPlayback(state);
    });
  };
  const drain = () => {
    if (busy.current || !live.current || phase.current === "submitted") return;
    setWorking(true);
    const work = (async () => {
      try {
        stoppedClock();
        clearPlayer();
        setError("");
        transition("finalizing");
        if (!candidate.current) {
          const blob = await session.current!.checkpoint();
          if (!live.current) return;
          latestBlob.current = blob;
          candidate.current = Object.freeze({
            file: new File([blob], "新录音.wav", { type: "audio/wav" }),
            recordedAt: recordedAt.current!,
            revision: revision.current + 1,
            intent: closing.current ? "final" : "checkpoint",
          });
        }
        transition("saving");
        await currentProps.current.onRevision(candidate.current);
        if (!live.current) return;
        const final = candidate.current.intent === "final";
        revision.current = candidate.current.revision;
        candidate.current = undefined;
        if (final) {
          transition("submitted");
          return;
        }
        transition("paused");
        if (latestBlob.current) makePlayer(latestBlob.current);
      } catch (e) {
        if (!live.current) return;
        setError(text(e));
        transition("retry");
        if (latestBlob.current) makePlayer(latestBlob.current);
      }
    })();
    busy.current = work;
    void work.finally(() => {
      if (busy.current === work) {
        busy.current = undefined;
        if (live.current) setWorking(false);
      }
      // A Close received during checkpoint must survive every await. On a
      // failure retain the intent, but wait for an explicit retry (no loop).
      if (live.current && closing.current && phase.current === "paused")
        drain();
    });
  };
  const close = () => {
    if (!live.current || phase.current === "submitted") return;
    closing.current = true;
    if (
      !recordedAt.current &&
      ["idle", "requesting", "error"].includes(phase.current)
    ) {
      live.current = false;
      session.current?.dispose();
      currentProps.current.onCancel();
      return;
    }
    drain();
  };
  const toggle = () => {
    if (closing.current || busy.current) return;
    if (phase.current === "idle") {
      transition("requesting");
      const capture = new DesktopRecordingSession({
        onRecording: () => {
          if (!live.current) return;
          if (recordedAt.current === undefined) recordedAt.current = Date.now();
          clock.current.resume();
          transition("recording");
        },
        onLevel: (level) => {
          if (live.current && phase.current === "recording") {
            history.current.append(clock.current.milliseconds(), level);
            setSamples(history.current.samples());
          }
        },
        onError: (e) => {
          if (!live.current) return;
          stoppedClock();
          setError(text(e));
          transition(recordedAt.current === undefined ? "error" : "retry");
        },
      });
      session.current = capture;
      void capture.start();
    } else if (phase.current === "recording") drain();
    else if (
      phase.current === "paused" &&
      !playback.playing &&
      !playback.playPending &&
      session.current?.canResume
    ) {
      clearPlayer();
      session.current.resume();
    }
  };
  const previewAllowed =
    !working && !busy.current && (status === "paused" || status === "retry");
  const canToggle =
    !closing.current &&
    !working &&
    !busy.current &&
    (status === "idle" ||
      status === "recording" ||
      (status === "paused" &&
        !playback.playing &&
        !playback.playPending &&
        !!session.current?.canResume));
  const activityElapsed = Math.max(elapsed, samples.at(-1)?.at ?? 0);
  const duration = (playback.duration ?? activityElapsed / 1000) * 1000;
  const seekable: [number, number][] = [];
  if (previewAllowed && audio.current && Number.isFinite(duration)) {
    const ranges = audio.current.seekable;
    for (let i = 0; i < Math.min(ranges.length, 64); i++) {
      const start = Math.max(0, ranges.start(i) * 1000);
      const end = Math.min(duration, ranges.end(i) * 1000);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start)
        seekable.push([start, end]);
    }
  }
  const state: RecordingViewState = {
    sequence: 1,
    phase: status,
    openedAt,
    recordedAt: recordedAt.current,
    elapsed: activityElapsed,
    paused: status === "paused",
    canToggle,
    canFinish:
      !working &&
      !busy.current &&
      ["recording", "paused", "retry"].includes(status),
    notice:
      error ||
      (status === "finalizing"
        ? "正在完成录音…"
        : status === "saving"
          ? "正在保存录音…"
          : status === "requesting"
            ? "正在准备麦克风…"
            : playback.mediaError ||
              playback.playError ||
              playback.seekError ||
              playback.durationError),
    hasError: !!error,
    position:
      previewAllowed && playback.ready ? playback.time * 1000 : activityElapsed,
    duration,
    previewPosition: previewAllowed && playback.ready,
    playing: playback.playing,
    playPending: playback.playPending,
    previewPending: false,
    seeking: playback.seeking,
    canPlay: previewAllowed && playback.ready && !playback.playPending,
    canSeek: previewAllowed && playback.canSeek,
    canRetryPreview:
      previewAllowed &&
      !!latestBlob.current &&
      !!(
        playback.mediaError ||
        playback.playError ||
        playback.seekError ||
        playback.durationError
      ),
    seekable,
    samples,
  };
  actions.current = (action) => {
    switch (action.action) {
      case "close":
      case "finish":
        close();
        break;
      case "toggle":
        if (canToggle) toggle();
        break;
      case "playback":
        if (state.canPlay) player.current?.toggle();
        break;
      case "preview-retry":
        player.current?.retry();
        break;
      case "skip":
        if (state.canSeek) player.current?.skip(action.seconds);
        break;
      case "seek":
        if (
          state.canSeek &&
          seekable.some(
            ([s, e]) => action.milliseconds >= s && action.milliseconds <= e,
          )
        )
          player.current?.seek(action.milliseconds / 1000);
        break;
    }
  };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      session.current?.dispose();
      player.current?.dispose();
    };
  }, []);
  useEffect(() => {
    props.onHandle?.({
      close: () => actions.current({ action: "close" }),
      toggle: () => actions.current({ action: "toggle" }),
      dispatch: (a) => actions.current(a),
    });
    return () => props.onHandle?.(null);
  }, [props.onHandle]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        actions.current({ action: "close" });
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, []);
  const projection = useRef(state);
  projection.current = state;
  const sequence = useRef(0);
  useEffect(() => {
    const tick = () => {
      if (phase.current === "recording")
        setElapsed(clock.current.milliseconds());
      currentProps.current.onState?.({
        ...projection.current,
        sequence: ++sequence.current,
      });
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, []);
  return (
    <RecordingView
      state={state}
      mobile={false}
      act={(a) => actions.current(a)}
      onPresentation={props.onPresentation}
      switching={props.switching}
    />
  );
}
