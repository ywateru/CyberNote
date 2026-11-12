import { useEffect, useId, useState } from "react";
import type { AttachmentMediaSource } from "./attachment-media";
import { formatAudioTime } from "./audio-playback";

// Decode only short, bounded recordings for the waveform. Playback and
// duration discovery remain owned by the existing streaming media controller.
export default function AudioWaveform({
  src,
  source,
  duration,
  bytes,
  time,
  disabled,
  seek,
}: {
  src: string;
  source?: AttachmentMediaSource;
  duration: number | null;
  bytes?: number;
  time: number;
  disabled: boolean;
  seek: (seconds: number) => void;
}) {
  const [peaks, setPeaks] = useState<number[]>([]);
  const clip = useId().replace(/:/g, "");
  useEffect(() => {
    setPeaks([]);
    if (
      !src ||
      bytes === undefined ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > 8 * 1024 * 1024 ||
      duration === null ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 300 ||
      disabled
    )
      return;
    let live = true;
    const abort = new AbortController();
    let context: AudioContext | undefined;
    const stop = () => {
      live = false;
      abort.abort();
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    };
    const release = source ? source.bindController(stop) : stop;
    void (async () => {
      try {
        const response = await fetch(src, { signal: abort.signal });
        if (!live || !response.ok) return;
        const blob = await response.blob();
        if (!live || blob.size > 8 * 1024 * 1024) return;
        const bytes = await blob.arrayBuffer();
        if (!live) return;
        context = new AudioContext({ sampleRate: 8000 });
        const decoded = await context.decodeAudioData(bytes);
        if (!live) return;
        const channel = decoded.getChannelData(0);
        const values = Array.from({ length: 128 }, (_, index) => {
          const start = Math.floor((index * channel.length) / 128);
          const end = Math.floor(((index + 1) * channel.length) / 128);
          let peak = 0;
          for (let sample = start; sample < end; sample++)
            peak = Math.max(peak, Math.abs(channel[sample]));
          return peak;
        });
        const max = Math.max(...values, 0.01);
        setPeaks(values.map((value) => Math.max(2, (value / max) * 42)));
      } catch {
        /* Unsupported codecs retain the seekable neutral waveform track. */
      } finally {
        if (context && context.state !== "closed")
          void context.close().catch(() => {});
      }
    })();
    return release;
  }, [src, source, bytes, duration, disabled]);
  const progress =
    duration && duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
  const bars = peaks.length ? peaks : Array<number>(128).fill(2);
  return (
    <div className="audio-waveform-row">
      <div className="audio-waveform-track">
        <svg viewBox="0 0 768 48" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <clipPath id={clip}>
              <rect width={768 * progress} height="48" />
            </clipPath>
          </defs>
          <g className="audio-waveform-unplayed">
            {bars.map((height, index) => (
              <rect
                key={index}
                x={index * 6 + 2}
                y={(48 - height) / 2}
                width="2.5"
                height={height}
                rx="1.25"
              />
            ))}
          </g>
          <g className="audio-waveform-played" clipPath={`url(#${clip})`}>
            {bars.map((height, index) => (
              <rect
                key={index}
                x={index * 6 + 2}
                y={(48 - height) / 2}
                width="2.5"
                height={height}
                rx="1.25"
              />
            ))}
          </g>
        </svg>
        <input
          type="range"
          aria-label="录音波形进度"
          aria-valuetext={formatAudioTime(time)}
          min="0"
          max={duration ?? 0}
          step="0.05"
          value={Math.min(time, duration ?? 0)}
          disabled={disabled || duration === null}
          onChange={(event) => seek(+event.target.value)}
        />
      </div>
      <span>{formatAudioTime(duration)}</span>
    </div>
  );
}
