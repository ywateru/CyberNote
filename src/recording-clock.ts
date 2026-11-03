// The UI clock measures active capture intervals, never encoded audio duration.
export class RecordingClock {
  private accumulated = 0;
  private since: number | null = null;
  constructor(private now: () => number = () => performance.now()) {}
  resume() {
    if (this.since === null) this.since = this.now();
  }
  pause() {
    if (this.since === null) return;
    this.accumulated += Math.max(0, this.now() - this.since);
    this.since = null;
  }
  milliseconds() {
    return (
      this.accumulated +
      (this.since === null ? 0 : Math.max(0, this.now() - this.since))
    );
  }
}

export function recordingTime(milliseconds: number, fractional = true) {
  const centiseconds = Math.floor(milliseconds / 10);
  const seconds = Math.floor(centiseconds / 100);
  const base = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return fractional
    ? `${base}.${String(centiseconds % 100).padStart(2, "0")}`
    : base;
}
