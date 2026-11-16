/** The native external-write protocol. Deliberately independent of notes-sync. */
export type AgentWindowEvent =
  | {
      phase: "probe" | "prepare";
      operationId: string;
      sessionId: string;
      noteIds: string[];
    }
  | {
      phase: "release";
      operationId: string;
      sessionId: string;
      noteIds: string[];
      outcome: "commit" | "abort";
    };
export type AgentWindowReply =
  | {
      phase: "probe";
      operationId: string;
      protectedNoteIds: string[];
      unsavedNoteIds: string[];
      blocked: boolean;
    }
  | { phase: "prepare"; operationId: string; ready: boolean }
  | { phase: "release"; operationId: string; refreshed: boolean };
export type AgentReplyReceipt = {
  operationId: string;
  outcome: "pending" | "abort" | "commit";
};
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("外部写窗口协议无效");
  return input as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw Error("外部写窗口协议字段无效");
}
function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}
function ids(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(identity) &&
    new Set(value).size === value.length
  );
}
export function parseAgentWindowEvent(input: unknown): AgentWindowEvent {
  const value = object(input);
  if (
    !identity(value.operationId) ||
    !identity(value.sessionId) ||
    !ids(value.noteIds)
  )
    throw Error("外部写窗口身份或目标无效");
  if (value.phase === "probe" || value.phase === "prepare")
    exact(value, ["phase", "operationId", "sessionId", "noteIds"]);
  else if (value.phase === "release") {
    exact(value, ["phase", "operationId", "sessionId", "noteIds", "outcome"]);
    if (value.outcome !== "commit" && value.outcome !== "abort")
      throw Error("外部写窗口终态无效");
  } else throw Error("外部写窗口阶段无效");
  return value as AgentWindowEvent;
}
export function parseAgentWindowReply(input: unknown): AgentWindowReply {
  const value = object(input);
  if (!identity(value.operationId)) throw Error("外部写窗口身份无效");
  if (value.phase === "probe") {
    exact(value, [
      "phase",
      "operationId",
      "protectedNoteIds",
      "unsavedNoteIds",
      "blocked",
    ]);
    if (
      !ids(value.protectedNoteIds) ||
      !ids(value.unsavedNoteIds) ||
      typeof value.blocked !== "boolean"
    )
      throw Error("外部写窗口保护无效");
  } else if (value.phase === "prepare") {
    exact(value, ["phase", "operationId", "ready"]);
    if (typeof value.ready !== "boolean") throw Error("外部写窗口准备无效");
  } else if (value.phase === "release") {
    exact(value, ["phase", "operationId", "refreshed"]);
    if (typeof value.refreshed !== "boolean") throw Error("外部写窗口刷新无效");
  } else throw Error("外部写窗口回复阶段无效");
  return value as AgentWindowReply;
}
export function parseAgentReplyReceipt(
  input: unknown,
  operationId: string,
): AgentReplyReceipt {
  const value = object(input);
  exact(value, ["operationId", "outcome"]);
  if (
    !identity(value.operationId) ||
    value.operationId !== operationId ||
    !["pending", "abort", "commit"].includes(value.outcome as string)
  )
    throw Error("外部写窗口收据无效");
  return value as AgentReplyReceipt;
}
export interface AgentWindowSnapshot {
  sessionId?: string;
  blocked: boolean;
  protectedNoteIds: string[];
  unsavedNoteIds: string[];
}
export interface AgentWindowLease {
  current(): boolean;
  release(): void;
}
export interface AgentWindowHost {
  snapshot(): AgentWindowSnapshot;
  freeze(ids: string[], cancel: () => void): AgentWindowLease;
  reply(reply: AgentWindowReply): Promise<AgentReplyReceipt>;
  committed(sessionId: string): Promise<void>;
  error(error: unknown): void;
}
type Operation = {
  id: string;
  sessionId: string;
  targets: string[];
  lease?: AgentWindowLease;
  cancelled: boolean;
  outcome?: "abort" | "commit";
  terminal: Promise<void>;
  resolve(): void;
  deadline?: ReturnType<typeof setTimeout>;
  cancelling?: Promise<void>;
  finishing?: Promise<void>;
};
/** Only a native terminal (or trusted Session replacement) ends a freeze.
 * Renderer timeouts/IPC failures request cancellation; they cannot prove abort. */
export class AgentWindowCoordinator {
  private active?: Operation;
  private completed = new Set<string>();
  private disposed = false;
  constructor(private host: AgentWindowHost) {}
  mount() {
    this.disposed = false;
  }
  frozen(noteId?: string | null) {
    return (
      !!this.active && (noteId == null || this.active.targets.includes(noteId))
    );
  }
  private release(operation: Operation) {
    if (this.active !== operation) return;
    this.active = undefined;
    clearTimeout(operation.deadline);
    this.completed.add(operation.id);
    if (this.completed.size > 128)
      this.completed.delete(this.completed.values().next().value!);
    operation.lease?.release();
    operation.resolve();
  }
  private unsafe(snapshot: AgentWindowSnapshot, targets: string[]) {
    return (
      snapshot.blocked ||
      targets.some(
        (id) =>
          snapshot.protectedNoteIds.includes(id) ||
          snapshot.unsavedNoteIds.includes(id),
      )
    );
  }
  private send(operation: Operation, ready: boolean) {
    return Promise.race([
      this.host.reply({ phase: "prepare", operationId: operation.id, ready }),
      operation.terminal.then(() => undefined),
    ]);
  }
  private finish(
    operation: Operation,
    outcome: "commit" | "abort",
  ): Promise<void> {
    if (this.active !== operation) return Promise.resolve();
    if (operation.finishing) return operation.finishing;
    // A committed receipt cannot be downgraded by a delayed abort.
    operation.outcome = operation.outcome === "commit" ? "commit" : outcome;
    const terminal = operation.outcome;
    operation.finishing = (async () => {
      if (terminal === "commit") {
        try {
          await this.host.committed(operation.sessionId);
        } catch (error) {
          this.host.error(error);
          if (
            this.active === operation &&
            this.host.snapshot().sessionId === operation.sessionId
          )
            await this.host.reply({
              phase: "release",
              operationId: operation.id,
              refreshed: false,
            });
          throw error; // Keep the projection frozen until a successful trusted retry.
        }
      }
      if (
        this.active !== operation ||
        this.host.snapshot().sessionId !== operation.sessionId
      )
        return;
      this.release(operation);
      // No local state is changed by this possibly late ACK.
      await this.host.reply({
        phase: "release",
        operationId: operation.id,
        refreshed: terminal === "commit",
      });
    })().finally(() => {
      operation.finishing = undefined;
    });
    return operation.finishing;
  }
  private async receipt(
    operation: Operation,
    receipt: AgentReplyReceipt | undefined,
  ) {
    if (receipt?.operationId === operation.id && receipt.outcome !== "pending")
      await this.finish(operation, receipt.outcome);
  }
  async receive(input: unknown): Promise<void> {
    if (this.disposed) return;
    const event = parseAgentWindowEvent(input),
      snapshot = this.host.snapshot();
    if (
      this.active &&
      snapshot.sessionId &&
      snapshot.sessionId !== this.active.sessionId
    )
      this.release(this.active);
    if (
      !snapshot.sessionId ||
      snapshot.sessionId !== event.sessionId ||
      this.completed.has(event.operationId)
    )
      return;
    if (event.phase === "release") {
      const operation = this.active;
      if (
        operation?.id !== event.operationId ||
        operation.sessionId !== event.sessionId
      )
        return;
      if (
        operation.targets.length !== event.noteIds.length ||
        operation.targets.some((id) => !event.noteIds.includes(id))
      )
        throw Error("外部写窗口终态目标改变");
      await this.finish(operation, event.outcome);
      return;
    }
    if (event.phase === "probe") {
      await this.host.reply({
        phase: "probe",
        operationId: event.operationId,
        protectedNoteIds: [...new Set(snapshot.protectedNoteIds)],
        unsavedNoteIds: [...new Set(snapshot.unsavedNoteIds)],
        blocked: snapshot.blocked || !!this.active,
      });
      return;
    }
    if (this.active?.id === event.operationId) return;
    if (this.active || this.unsafe(snapshot, event.noteIds)) {
      await this.host.reply({
        phase: "prepare",
        operationId: event.operationId,
        ready: false,
      });
      return;
    }
    let resolve!: () => void;
    const operation: Operation = {
      id: event.operationId,
      sessionId: event.sessionId,
      targets: event.noteIds,
      cancelled: false,
      terminal: new Promise<void>((done) => {
        resolve = done;
      }),
      resolve: () => resolve(),
    };
    this.active = operation;
    try {
      operation.lease = this.host.freeze(event.noteIds, () => {
        void this.cancel().catch(this.host.error);
      });
      operation.deadline = setTimeout(() => {
        if (
          this.active === operation &&
          this.host.snapshot().sessionId === operation.sessionId
        )
          void this.cancel().catch(this.host.error);
      }, 5500);
      const live = this.host.snapshot();
      if (
        live.sessionId !== operation.sessionId ||
        this.unsafe(live, operation.targets) ||
        !operation.lease.current()
      ) {
        await this.cancel();
        return;
      }
      await this.receipt(operation, await this.send(operation, true));
    } catch (error) {
      this.host.error(error);
      if (this.active === operation && !operation.outcome) await this.cancel();
    }
  }
  check() {
    const operation = this.active;
    if (!operation) return;
    const snapshot = this.host.snapshot();
    if (snapshot.sessionId && snapshot.sessionId !== operation.sessionId) {
      this.release(operation);
      return;
    }
    if (
      operation.cancelled ||
      operation.finishing ||
      operation.outcome ||
      !operation.lease
    )
      return;
    if (
      snapshot.sessionId !== operation.sessionId ||
      this.unsafe(snapshot, operation.targets) ||
      !operation.lease.current()
    )
      void this.cancel().catch(this.host.error);
  }
  cancel(): Promise<void> {
    const operation = this.active;
    if (!operation) return Promise.resolve();
    if (operation.cancelling) return operation.cancelling;
    operation.cancelled = true;
    operation.cancelling = (async () => {
      let delay = 100;
      while (this.active === operation) {
        try {
          if (operation.outcome)
            await this.finish(operation, operation.outcome);
          else await this.receipt(operation, await this.send(operation, false));
        } catch (error) {
          this.host.error(error);
        }
        if (this.active !== operation) break;
        await new Promise<void>((done) => {
          const timer = setTimeout(done, delay);
          void operation.terminal.then(() => {
            clearTimeout(timer);
            done();
          });
        });
        delay = Math.min(delay * 2, 2000);
      }
      await operation.terminal;
    })();
    return operation.cancelling;
  }
  dispose() {
    this.disposed = true;
    const operation = this.active;
    if (!operation) return;
    void this.host
      .reply({ phase: "prepare", operationId: operation.id, ready: false })
      .catch(this.host.error);
    this.release(operation);
  }
}
