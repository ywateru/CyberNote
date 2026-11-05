import {
  createAudioPlayback,
  initialAudioPlaybackState,
  formatAudioTime,
  type AudioPlaybackState,
} from "./audio-playback";
import { createRecordingPreview } from "./recording-session";

export type RecordingPlaybackState = AudioPlaybackState & {
  ready: boolean;
  canSeek: boolean;
  seeking: boolean;
  seekError: string;
  seekMessage: string;
  playPending: boolean;
  ended: boolean;
};
export const initialRecordingPlaybackState: RecordingPlaybackState = {
  ...initialAudioPlaybackState,
  ready: false,
  canSeek: false,
  seeking: false,
  seekError: "",
  seekMessage: "",
  playPending: false,
  ended: false,
};

// A recording-only skin over the existing production playback/probe controller.
// Its optimistic seek time is deliberately replaced by observed media time.
export function createRecordingPlayback(
  audio: HTMLAudioElement,
  blob: Blob,
  update: (state: RecordingPlaybackState) => void,
  options?: {
    urls?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
    createAudio?: () => HTMLAudioElement;
    seekTimeoutMs?: number;
  },
) {
  const preview = createRecordingPreview(blob, options?.urls);
  let live = true;
  let media = { ...initialAudioPlaybackState };
  let time = 0;
  let ready = false;
  let seekError = "";
  let seekMessage = "";
  let playPending = false;
  let ended = false;
  let replayAfterSeek = false;
  let queuedSeek: number | undefined;
  let pending:
    { target: number; timer: ReturnType<typeof setTimeout> } | undefined;
  const ranges = () => {
    const result: [number, number][] = [];
    if (media.duration === null || !Number.isFinite(media.duration))
      return result;
    for (let i = 0; i < audio.seekable.length; i++) {
      const start = Math.max(0, audio.seekable.start(i));
      const end = Math.min(media.duration, audio.seekable.end(i));
      if (Number.isFinite(start) && Number.isFinite(end) && end > start)
        result.push([start, end]);
    }
    return result;
  };
  const publish = () => {
    if (!live) return;
    update({
      ...media,
      time,
      ready: ready && !media.mediaError,
      canSeek: ready && !media.mediaError && !pending && ranges().length > 0,
      seeking: !!pending,
      seekError,
      seekMessage,
      playPending,
      ended,
    });
  };
  const observed = () => {
    if (!pending && !audio.seeking && Number.isFinite(audio.currentTime))
      time = Math.max(0, audio.currentTime);
    publish();
  };
  const capability = () => {
    ready = audio.readyState >= 2 && !audio.error;
    observed();
  };
  const settledSeek = () => {
    if (!live || !pending || audio.seeking) return;
    const request = pending;
    clearTimeout(request.timer);
    pending = undefined;
    if (
      !Number.isFinite(audio.currentTime) ||
      Math.abs(audio.currentTime - request.target) > 0.5
    ) {
      seekError = "设备未确认请求的回放位置，可继续播放或完成保存。";
      seekMessage = "";
      replayAfterSeek = false;
      playPending = false;
    } else {
      seekError = "";
      seekMessage = `已定位到 ${formatAudioTime(audio.currentTime)}`;
      ended = false;
    }
    observed();
    if (queuedSeek !== undefined) {
      const next = queuedSeek;
      queuedSeek = undefined;
      seek(next);
    } else if (replayAfterSeek && !seekError) {
      replayAfterSeek = false;
      player.toggle();
    }
  };
  const started = () => {
    playPending = false;
    ended = false;
    publish();
  };
  const paused = () => {
    playPending = false;
    publish();
  };
  const finished = () => {
    playPending = false;
    ended = true;
    observed();
  };
  const listeners: [string, EventListener][] = [
    ["loadeddata", capability],
    ["canplay", capability],
    ["loadedmetadata", capability],
    ["durationchange", capability],
    ["progress", capability],
    ["timeupdate", observed],
    ["seeked", settledSeek],
    ["play", started],
    ["pause", paused],
    ["ended", finished],
  ];
  listeners.forEach(([name, listener]) =>
    audio.addEventListener(name, listener),
  );
  let player!: ReturnType<typeof createAudioPlayback>;
  let attached = false;
  try {
    player = createAudioPlayback(
      audio,
      preview.url,
      (state) => {
        media = state;
        if (state.playError || state.mediaError) playPending = false;
        publish();
      },
      { createAudio: options?.createAudio },
    );
    attached = true;
    audio.load();
  } catch (error) {
    live = false;
    listeners.forEach(([name, listener]) =>
      audio.removeEventListener(name, listener),
    );
    try {
      if (attached) player.dispose();
      else {
        audio.pause();
        audio.removeAttribute("src");
      }
    } finally {
      preview.dispose();
    }
    throw error;
  }
  // Absolute and relative positioning use one observed seek path. Pointer drags
  // may replace the queued destination, never the confirmed visible position.
  const seek = (seconds: number) => {
    if (!live || !ready || !Number.isFinite(seconds)) return;
    if (pending) {
      queuedSeek = seconds;
      return;
    }
    const available = ranges();
    if (!available.length) {
      if (replayAfterSeek) {
        replayAfterSeek = false;
        playPending = false;
        seekError = "设备尚未提供可回放的起点，请稍后重试。";
        publish();
      }
      return;
    }
    const requested = seconds;
    const candidates = available.map(([start, end]) =>
      Math.max(start, Math.min(end, requested)),
    );
    const target = candidates.reduce((best, value) =>
      Math.abs(value - requested) < Math.abs(best - requested) ? value : best,
    );
    if (!audio.seeking && Math.abs(audio.currentTime - target) < 0.001) {
      seekError = "";
      seekMessage = "";
      observed();
      if (replayAfterSeek) {
        replayAfterSeek = false;
        player.toggle();
      }
      return;
    }
    seekError = "";
    seekMessage = "";
    pending = {
      target,
      timer: setTimeout(() => {
        if (!live || !pending) return;
        pending = undefined;
        queuedSeek = undefined;
        replayAfterSeek = false;
        playPending = false;
        seekError = "设备未确认回放定位，可继续播放或完成保存。";
        publish();
      }, options?.seekTimeoutMs ?? 5000),
    };
    player.seek(target);
    publish();
  };
  return {
    toggle() {
      if (!live || !ready || media.mediaError || playPending || pending) return;
      if (audio.paused) {
        playPending = true;
        publish();
        if (
          ended ||
          (media.duration !== null &&
            audio.currentTime >= media.duration &&
            audio.currentTime > 0)
        ) {
          replayAfterSeek = true;
          seek(0);
          return;
        }
      }
      player.toggle();
    },
    seek,
    skip(seconds: number) {
      if (
        !live ||
        !Number.isFinite(seconds) ||
        !Number.isFinite(audio.currentTime)
      )
        return;
      seek(audio.currentTime + seconds);
    },
    retry() {
      if (!live) return;
      if (media.mediaError) {
        // Reload invalidates the previous decoded data before the shared
        // controller clears its error. Only new media readiness may reopen it.
        ready = false;
        if (pending) clearTimeout(pending.timer);
        pending = undefined;
      }
      seekError = "";
      seekMessage = "";
      queuedSeek = undefined;
      replayAfterSeek = false;
      playPending = false;
      player.retry();
      publish();
    },
    dispose() {
      if (!live) return;
      live = false;
      if (pending) clearTimeout(pending.timer);
      pending = undefined;
      listeners.forEach(([name, listener]) =>
        audio.removeEventListener(name, listener),
      );
      try {
        player.dispose();
      } finally {
        preview.dispose();
      }
    },
  };
}
