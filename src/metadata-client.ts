import type { MetadataState } from "./types";

export class MetadataStale extends Error {
  code = "metadata_stale";
  constructor() {
    super("列表已有新的变化，请重新同步");
  }
}
// Observing a save receipt is not publishing a workspace. Equal-sequence events
// still require a read until the renderer has actually hydrated that workspace.
export class MetadataGate {
  sessionId?: string;
  observed = -1;
  applied = -1;
  observe(state: MetadataState | undefined, accessSession?: string) {
    if (
      !state ||
      !Number.isSafeInteger(state.sequence) ||
      state.sequence < 0 ||
      state.sessionId !== accessSession
    )
      throw new MetadataStale();
    if (this.sessionId !== state.sessionId) {
      this.sessionId = state.sessionId;
      this.observed = this.applied = -1;
    }
    this.observed = Math.max(this.observed, state.sequence);
  }
  canPublish(state: MetadataState | undefined) {
    return (
      !!state &&
      state.sessionId === this.sessionId &&
      state.sequence >= this.observed &&
      state.sequence >= this.applied
    );
  }
  markApplied(state: MetadataState | undefined) {
    if (!this.canPublish(state)) throw new MetadataStale();
    this.applied = state!.sequence;
  }
  get needsRefresh() {
    return this.observed > this.applied;
  }
}
