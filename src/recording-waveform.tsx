import { useRef } from "react";
import { recordingTime } from "./recording-clock";

export type RecordingSample = { at: number; peak: number };

// Keep the complete activity timeline bounded, coalescing real peak samples
// into wider time buckets rather than stretching a recent sliding window.
export class RecordingWaveformHistory {
  private width = 100;
  private values: RecordingSample[] = [];
  append(at: number, peak: number) {
    if (!Number.isFinite(at) || !Number.isFinite(peak) || at < 0) return;
    const bucket = Math.floor(at / this.width) * this.width;
    const last = this.values.at(-1);
    if (last?.at === bucket) last.peak = Math.max(last.peak, peak);
    else this.values.push({ at: bucket, peak });
    if (this.values.length > 1800) {
      this.width *= 2;
      const merged: RecordingSample[] = [];
      for (const sample of this.values) {
        const time = Math.floor(sample.at / this.width) * this.width;
        const previous = merged.at(-1);
        if (previous?.at === time)
          previous.peak = Math.max(previous.peak, sample.peak);
        else merged.push({ at: time, peak: sample.peak });
      }
      this.values = merged;
    }
  }
  samples() {
    return this.values.map((sample) => ({ ...sample }));
  }
}

export function RecordingWaveform({
  samples,
  position,
  duration,
  enabled,
  seek,
}: {
  samples: RecordingSample[];
  position: number;
  duration: number;
  enabled: boolean;
  seek: (milliseconds: number) => void;
}) {
  const drag = useRef<{ id: number; x: number; time: number } | null>(null);
  // Both preserved references resolve to about 100 logical px per second
  // (desktop 200 image px at the explicit 2x comparison boundary; mobile
  // 57.5/224 of a 390px viewport). Drawing and pointer requests share this unit.
  const pixelsPerSecond = 100;
  const requested = (time: number) =>
    seek(Math.max(0, Math.min(duration, time)));
  const ticks = Array.from(
    { length: 25 },
    (_, index) => Math.floor(position / 1000) + index - 12,
  );
  const minorTicks = ticks.flatMap((tick) =>
    [0.25, 0.5, 0.75].map((fraction) => tick + fraction),
  );
  return (
    <div
      className="waveform"
      role="slider"
      tabIndex={enabled ? 0 : -1}
      aria-label="录音回放位置"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, duration / 1000)}
      aria-valuenow={position / 1000}
      aria-valuetext={recordingTime(position)}
      aria-disabled={!enabled}
      onKeyDown={(event) => {
        if (!enabled) return;
        const target =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? duration
              : ["ArrowLeft", "ArrowDown"].includes(event.key)
                ? position - 1000
                : ["ArrowRight", "ArrowUp"].includes(event.key)
                  ? position + 1000
                  : undefined;
        if (target === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        requested(target);
      }}
      onPointerDown={(event) => {
        if (!enabled || event.button !== 0) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        const time =
          position +
          ((event.clientX - bounds.left - bounds.width / 2) / pixelsPerSecond) *
            1000;
        drag.current = { id: event.pointerId, x: event.clientX, time };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        requested(time);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        requested(
          start.time + ((event.clientX - start.x) / pixelsPerSecond) * 1000,
        );
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        requested(
          start.time + ((event.clientX - start.x) / pixelsPerSecond) * 1000,
        );
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div className="wave-samples" aria-hidden="true">
        {samples
          .filter((sample) => Math.abs(sample.at - position) < 20000)
          .map((sample) => (
            <i
              key={sample.at}
              style={{
                left: `calc(50% + ${((sample.at - position) / 1000) * pixelsPerSecond}px)`,
                height: `${Math.min(95, Math.max(0, sample.peak))}%`,
              }}
            />
          ))}
      </div>
      <div className="wave-axis" aria-hidden="true">
        {minorTicks
          .filter((tick) => tick >= 0)
          .map((tick) => (
            <i
              key={tick}
              style={{
                left: `calc(50% + ${(tick - position / 1000) * pixelsPerSecond}px)`,
              }}
            />
          ))}
        {ticks
          .filter((tick) => tick >= 0)
          .map((tick) => (
            <span
              key={tick}
              style={{
                left: `calc(50% + ${(tick - position / 1000) * pixelsPerSecond}px)`,
              }}
            >
              {recordingTime(tick * 1000, false)}
            </span>
          ))}
      </div>
      <div className="recording-playhead" aria-hidden="true" />
    </div>
  );
}
