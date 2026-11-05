import { formatAudioTime } from "./audio-playback";

export type RecordingResult = Readonly<{ file: File; recordedAt: number }>;
export const MAX_RECORDED_AT = 253402300799999;

// Missing/null is explicitly unknown. All other invalid values are errors,
// including persisted/transport values; never replace them with a guessed date.
export function attachmentRecordedAt(
  value: unknown,
  kind: string,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    kind !== "audio" ||
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_RECORDED_AT
  )
    throw Error("附件录音日期无效");
  return value;
}

export function recordingDate(value: number): string {
  attachmentRecordedAt(value, "audio");
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function compactAudioDuration(duration: number | null): string {
  if (duration === null || !Number.isFinite(duration) || duration < 0)
    return "音频";
  return `音频 · ${duration < 60 ? `${Math.floor(duration)}秒` : formatAudioTime(duration)}`;
}

export type RecordingRevision = RecordingResult &
  Readonly<{
    revision: number;
    intent: "checkpoint" | "final";
  }>;
