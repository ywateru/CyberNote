// A separate, never-played media element lets the platform discover the end of
// recorder WebM files whose initial metadata reports Infinity. This does not
// decode the entire recording into a memory-resident Web Audio PCM buffer.
const PROBE_SEEK_SECONDS = 1_000_000_000;
const PROBE_TIMEOUT_MS = 15_000;
const finiteDuration = (value: number) => Number.isFinite(value) && value >= 0;

export type AudioPlaybackState = {
  duration: number | null;
  time: number;
  playing: boolean;
  durationError: string;
  mediaError: string;
  playError: string;
};
export const initialAudioPlaybackState: AudioPlaybackState = {
  duration: null,
  time: 0,
  playing: false,
  durationError: "",
  mediaError: "",
  playError: "",
};
export const formatAudioTime = (seconds: number | null) =>
  seconds !== null && Number.isFinite(seconds)
    ? `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`
    : "时长未知";

function mediaErrorText(error: MediaError | null) {
  if (error?.code === 2) return "无法读取录音，请重试。";
  if (error?.code === 3) return "录音解码失败，请重试。";
  if (error?.code === 4) return "当前设备无法播放此录音格式。";
  return "录音加载失败，请重试。";
}

type ProbeOptions = {
  createAudio?: () => HTMLAudioElement;
  timeoutMs?: number;
};

export function probeAudioDuration(
  src: string,
  complete: (duration: number | null, error: string) => void,
  {
    createAudio = () => new Audio(),
    timeoutMs = PROBE_TIMEOUT_MS,
  }: ProbeOptions = {},
) {
  const probe = createAudio();
  let finished = false;
  let sought = false;
  const clean = () => {
    clearTimeout(timer);
    probe.removeEventListener("loadedmetadata", metadata);
    probe.removeEventListener("durationchange", changed);
    probe.removeEventListener("seeked", seeked);
    probe.removeEventListener("error", failed);
    probe.pause();
    probe.removeAttribute("src");
    probe.load();
  };
  const finish = (duration: number | null, error = "") => {
    if (finished) return;
    finished = true;
    clean();
    complete(duration, error);
  };
  const changed = () => {
    if (finiteDuration(probe.duration)) finish(probe.duration);
  };
  const metadata = () => {
    if (finished) return;
    if (finiteDuration(probe.duration)) return finish(probe.duration);
    if (sought) return;
    sought = true;
    try {
      // A single bounded, finite seek, on the probe only. Never use MAX_VALUE /
      // MAX_SAFE_INTEGER: a browser's internal time representation can overflow.
      // Only a resulting finite platform duration is accepted, never this target
      // or a buffered/seekable prefix. Unsupported resolution stays unknown.
      probe.currentTime = PROBE_SEEK_SECONDS;
    } catch {
      finish(null, "无法读取完整录音时长，请重试。");
    }
  };
  const seeked = () => {
    if (finiteDuration(probe.duration)) finish(probe.duration);
    else finish(null, "无法读取完整录音时长，请重试。");
  };
  const failed = () => finish(null, mediaErrorText(probe.error));
  const timer = setTimeout(
    () => finish(null, "读取录音时长超时，请重试。"),
    timeoutMs,
  );
  probe.muted = true;
  probe.preload = "auto";
  probe.addEventListener("loadedmetadata", metadata);
  probe.addEventListener("durationchange", changed);
  probe.addEventListener("seeked", seeked);
  probe.addEventListener("error", failed);
  probe.src = src;
  probe.load();
  return () => {
    if (finished) return;
    finished = true;
    clean();
  };
}

// The component and focused checks both use this controller. It owns only its
// two media elements, not the attachment data / object URL supplied by callers.
export function createAudioPlayback(
  audio: HTMLAudioElement,
  src: string,
  update: (state: AudioPlaybackState) => void,
  probeOptions?: ProbeOptions,
) {
  let state = { ...initialAudioPlaybackState };
  let live = true;
  let playAttempt = 0;
  let probeAttempted = false;
  let retrySeek: number | null = null;
  let cancelProbe: (() => void) | undefined;
  const publish = (patch: Partial<AudioPlaybackState>) => {
    if (!live) return;
    state = { ...state, ...patch };
    update(state);
  };
  const stopProbe = () => {
    cancelProbe?.();
    cancelProbe = undefined;
  };
  const metadata = () => {
    if (!live || !src || audio.error) return;
    if (finiteDuration(audio.duration)) {
      stopProbe();
      publish({ duration: audio.duration, durationError: "" });
    } else if (audio.readyState >= 1 && !probeAttempted) {
      probeAttempted = true;
      cancelProbe = probeAudioDuration(
        src,
        (duration, durationError) => {
          if (!live) return;
          cancelProbe = undefined;
          publish({ duration, durationError });
        },
        probeOptions,
      );
    }
  };
  const timeupdate = () => {
    if (!Number.isFinite(audio.currentTime)) return;
    publish({
      time: Math.max(
        0,
        Math.min(state.duration ?? Infinity, audio.currentTime),
      ),
    });
  };
  const onPlay = () => publish({ playing: true, playError: "" });
  const onPause = () => publish({ playing: false });
  const onEnded = () => {
    ++playAttempt;
    publish({ playing: false });
    timeupdate();
  };
  const onError = () => {
    ++playAttempt;
    stopProbe();
    publish({ playing: false, mediaError: mediaErrorText(audio.error) });
  };
  const listeners: [string, EventListener][] = [
    ["loadedmetadata", metadata],
    ["durationchange", metadata],
    ["timeupdate", timeupdate],
    ["play", onPlay],
    ["pause", onPause],
    ["ended", onEnded],
    ["error", onError],
  ];
  listeners.forEach(([name, listener]) =>
    audio.addEventListener(name, listener),
  );
  audio.preload = "metadata";
  if (src) audio.src = src;
  publish({});
  metadata();

  const play = () => {
    if (!live || !src) return;
    const attempt = ++playAttempt;
    retrySeek = null;
    publish({ playError: "" });
    // Both a synchronous platform throw and an asynchronous play rejection are
    // visible. A late promise from a disposed player or earlier pause is ignored.
    try {
      Promise.resolve(audio.play())
        .then(() => {
          if (live && attempt === playAttempt)
            publish({ playing: !audio.paused });
        })
        .catch(() => {
          if (live && attempt === playAttempt)
            publish({ playing: false, playError: "无法播放录音，请重试。" });
        });
    } catch {
      if (live && attempt === playAttempt)
        publish({ playing: false, playError: "无法播放录音，请重试。" });
    }
  };
  const seek = (seconds: number) => {
    if (!live || state.duration === null || !Number.isFinite(seconds)) return;
    try {
      const time = Math.max(0, Math.min(state.duration, seconds));
      audio.currentTime = time;
      retrySeek = null;
      publish({ time, playError: "" });
    } catch {
      retrySeek = seconds;
      publish({ playError: "无法调整录音进度，请重试。" });
    }
  };
  return {
    toggle() {
      if (!live) return;
      if (audio.paused) play();
      else {
        ++playAttempt;
        audio.pause();
        publish({ playing: false });
      }
    },
    seek,
    skip(seconds: number) {
      seek(
        (Number.isFinite(audio.currentTime) ? audio.currentTime : state.time) +
          seconds,
      );
    },
    retry() {
      if (!live) return;
      if (state.mediaError) {
        ++playAttempt;
        stopProbe();
        probeAttempted = false;
        audio.pause();
        publish({ ...initialAudioPlaybackState });
        audio.load();
      } else if (state.playError) {
        if (retrySeek !== null) seek(retrySeek);
        else play();
      } else if (state.durationError) {
        stopProbe();
        probeAttempted = false;
        publish({ durationError: "" });
        metadata();
      }
    },
    dispose() {
      if (!live) return;
      live = false;
      ++playAttempt;
      stopProbe();
      listeners.forEach(([name, listener]) =>
        audio.removeEventListener(name, listener),
      );
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}
