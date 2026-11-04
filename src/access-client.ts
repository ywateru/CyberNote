import type { AccessState } from "./types";

export interface AccessStamp {
  generation: number;
  sessionId?: string;
  epoch?: number;
  noteId?: string;
  noteEpoch?: number;
}
export class AccessChanged extends Error {
  code = "access_changed";
  constructor() {
    super("授权状态已改变，请同步后重试");
  }
}
// Every renderer owns this response gate; the Store owns the authorization itself.
export class AccessGate {
  state?: AccessState;
  generation = 0;
  stamp(noteId?: string): AccessStamp {
    return {
      generation: this.generation,
      sessionId: this.state?.sessionId,
      epoch: this.state?.epoch,
      noteId,
      noteEpoch: noteId ? this.state?.notes[noteId]?.epoch : undefined,
    };
  }
  invalidate(state?: AccessState) {
    this.generation++;
    if (state) this.state = state;
  }
  accept(
    state: AccessState,
    stamp: AccessStamp,
    mode: "read" | "save" | "transition" = "read",
    publish = true,
  ) {
    if (mode === "save") {
      if (
        this.state?.sessionId !== stamp.sessionId ||
        (stamp.noteId &&
          this.state?.notes[stamp.noteId]?.epoch !== stamp.noteEpoch)
      )
        throw new AccessChanged();
      return; // Save responses acknowledge revision only; never publish their document/cache.
    }
    if (
      this.state &&
      (state.sessionId !== this.state.sessionId ||
        state.epoch < this.state.epoch)
    )
      throw new AccessChanged();
    if (
      stamp.generation !== this.generation &&
      (mode !== "transition" || this.state?.operationId || state.operationId)
    )
      throw new AccessChanged();
    if (publish) this.state = state;
  }
  expected(noteId?: string) {
    if (!this.state) throw new AccessChanged();
    return {
      sessionId: this.state.sessionId,
      epoch: this.state.epoch,
      ...(noteId ? { noteEpoch: this.state.notes[noteId]?.epoch } : {}),
    };
  }
}
