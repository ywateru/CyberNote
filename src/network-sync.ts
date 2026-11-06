import type { AccessStamp } from "./access-client";

export type SyncWindowEvent =
  | { phase: "probe"; operationId: string; sessionId: string }
  | {
      phase: "prepare";
      operationId: string;
      sessionId: string;
      noteIds: string[];
    }
  | {
      phase: "release";
      operationId: string;
      sessionId: string;
      outcome: "commit" | "abort";
    };
export type SyncWindowReply =
  | {
      phase: "probe";
      operationId: string;
      protectedNoteIds: string[];
      blocked: boolean;
    }
  | { phase: "prepare"; operationId: string; ready: boolean };
export type SyncWindowReceipt = {
  operationId: string;
  outcome: "pending" | "abort" | "commit";
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("同步窗口协议无效");
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !(key in value))
  )
    throw Error("同步窗口协议字段无效");
}
function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}
export function parseSyncWindowEvent(input: unknown): SyncWindowEvent {
  const value = record(input);
  if (!identity(value.operationId) || !identity(value.sessionId))
    throw Error("同步窗口身份无效");
  if (value.phase === "probe")
    exact(value, ["phase", "operationId", "sessionId"]);
  else if (value.phase === "prepare") {
    exact(value, ["phase", "operationId", "sessionId", "noteIds"]);
    if (
      !Array.isArray(value.noteIds) ||
      !value.noteIds.every(identity) ||
      new Set(value.noteIds).size !== value.noteIds.length
    )
      throw Error("同步窗口目标无效");
  } else if (value.phase === "release") {
    exact(value, ["phase", "operationId", "sessionId", "outcome"]);
    if (value.outcome !== "commit" && value.outcome !== "abort")
      throw Error("同步窗口终态无效");
  } else throw Error("同步窗口阶段无效");
  return value as SyncWindowEvent;
}
export function parseSyncWindowReceipt(
  input: unknown,
  operationId: string,
): SyncWindowReceipt {
  const value = record(input);
  exact(value, ["operationId", "outcome"]);
  if (
    value.operationId !== operationId ||
    (value.outcome !== "pending" &&
      value.outcome !== "abort" &&
      value.outcome !== "commit")
  )
    throw Error("同步窗口收据无效");
  return value as SyncWindowReceipt;
}

export interface QuietSnapshot {
  sessionId?: string;
  blocked: boolean;
  protectedNoteIds: string[];
}
export interface QuietLease {
  flush(): Promise<void>;
  current(): boolean;
  release(): void;
}
export interface QuietHost {
  snapshot(): QuietSnapshot;
  freeze(noteIds: string[], cancel: () => void): QuietLease;
  reply(reply: SyncWindowReply): Promise<SyncWindowReceipt>;
  committed(): Promise<void>;
  error(error: unknown): void;
}
type Operation = {
  id: string;
  sessionId: string;
  targets: string[];
  lease: QuietLease;
  cancelled: boolean;
  terminal: Promise<void>;
  resolve(): void;
  cancelling?: Promise<void>;
  deadline?: ReturnType<typeof setTimeout>;
  finishing?: Promise<void>;
};

/** Window-local quiet coordination. Only a backend terminal receipt/event may
 * release a lease; an IPC rejection or a renderer timer never proves abort. */
export class NetworkSyncCoordinator {
  private active?: Operation;
  private completed = new Set<string>();
  private disposed = false;
  constructor(private host: QuietHost) {}
  mount() {
    this.disposed = false;
  }
  frozen(noteId?: string | null): boolean {
    return (
      !!this.active && (noteId == null || this.active.targets.includes(noteId))
    );
  }
  private remember(id: string) {
    this.completed.add(id);
    if (this.completed.size > 128)
      this.completed.delete(this.completed.values().next().value!);
  }
  private send(operation: Operation, ready: boolean) {
    return Promise.race([
      this.host.reply({ phase: "prepare", operationId: operation.id, ready }),
      operation.terminal.then(() => undefined),
    ]);
  }
  private release(operation: Operation) {
    if (this.active !== operation) return;
    this.active = undefined;
    clearTimeout(operation.deadline);
    this.remember(operation.id);
    operation.lease?.release();
    operation.resolve();
  }
  private finish(
    operation: Operation,
    outcome: "abort" | "commit",
  ): Promise<void> {
    if (this.active !== operation) return Promise.resolve();
    if (operation.finishing) return operation.finishing;
    if (outcome === "abort") {
      this.release(operation);
      return Promise.resolve();
    }
    operation.finishing = (async () => {
      // Metadata notification precedes release, but its trusted read may still
      // be in flight. Do not admit a keystroke against the old projection.
      await this.host.committed();
      this.release(operation);
    })().catch((error) => {
      operation.finishing = undefined;
      throw error;
    });
    return operation.finishing;
  }
  private async receipt(
    operation: Operation,
    receipt: SyncWindowReceipt | undefined,
  ) {
    if (receipt?.operationId === operation.id && receipt.outcome !== "pending")
      await this.finish(operation, receipt.outcome);
  }
  async receive(input: unknown): Promise<void> {
    if (this.disposed) return;
    const event = parseSyncWindowEvent(input);
    const snapshot = this.host.snapshot();
    if (
      this.active &&
      snapshot.sessionId &&
      snapshot.sessionId !== this.active.sessionId
    )
      this.release(this.active);
    if (!snapshot.sessionId || event.sessionId !== snapshot.sessionId) return;
    if (event.phase === "release") {
      if (
        this.active?.id === event.operationId &&
        this.active.sessionId === event.sessionId
      )
        await this.finish(this.active, event.outcome);
      else this.remember(event.operationId);
      return;
    }
    if (this.completed.has(event.operationId)) return;
    if (event.phase === "probe") {
      await this.host.reply({
        phase: "probe",
        operationId: event.operationId,
        protectedNoteIds: [...new Set(snapshot.protectedNoteIds)],
        blocked: snapshot.blocked || !!this.active,
      });
      return;
    }
    if (this.active?.id === event.operationId) return;
    if (
      this.active ||
      snapshot.blocked ||
      event.noteIds.some((id) => snapshot.protectedNoteIds.includes(id))
    ) {
      await this.host.reply({
        phase: "prepare",
        operationId: event.operationId,
        ready: false,
      });
      return;
    }
    let resolve!: () => void;
    const terminal = new Promise<void>((done) => {
      resolve = done;
    });
    const operation: Operation = {
      id: event.operationId,
      sessionId: event.sessionId,
      targets: event.noteIds,
      cancelled: false,
      terminal,
      resolve,
      lease: undefined!,
    };
    // Publish ownership before installing the synchronous write gate.
    this.active = operation;
    try {
      operation.lease = this.host.freeze(event.noteIds, () => {
        void this.cancel().catch(this.host.error);
      });
      // A missed release is recovered through the same backend receipt. This
      // timer requests cancellation; it never restores editability by itself.
      operation.deadline = setTimeout(() => {
        void this.cancel().catch(this.host.error);
      }, 5500);
      await Promise.race([operation.lease.flush(), operation.terminal]);
      if (this.active !== operation || operation.cancelled) return;
      const live = this.host.snapshot();
      if (
        live.sessionId !== operation.sessionId ||
        live.blocked ||
        operation.targets.some((id) => live.protectedNoteIds.includes(id)) ||
        !operation.lease.current()
      ) {
        await this.cancel();
        return;
      }
      await this.receipt(operation, await this.send(operation, true));
    } catch (error) {
      this.host.error(error);
      if (this.active === operation) await this.cancel();
    }
  }
  check() {
    const operation = this.active;
    if (!operation) return;
    const snapshot = this.host.snapshot();
    // A published trusted process replacement cannot commit the old Session's
    // operation. Restoration still checks the captured authority and owner.
    if (snapshot.sessionId && snapshot.sessionId !== operation.sessionId) {
      this.release(operation);
      return;
    }
    if (operation.cancelled || operation.finishing || !operation.lease) return;
    if (
      snapshot.sessionId !== operation.sessionId ||
      snapshot.blocked ||
      operation.targets.some((id) => snapshot.protectedNoteIds.includes(id)) ||
      !operation.lease.current()
    )
      void this.cancel().catch(this.host.error);
  }
  cancel(): Promise<void> {
    const operation = this.active;
    if (!operation) return Promise.resolve();
    if (operation.finishing) return operation.terminal;
    if (operation.cancelling) return operation.cancelling;
    operation.cancelled = true;
    operation.cancelling = (async () => {
      let delay = 100;
      while (this.active === operation) {
        try {
          await this.receipt(operation, await this.send(operation, false));
        } catch (error) {
          this.host.error(error);
        }
        if (this.active !== operation) break;
        // Repeating the original cancellation asks for its bounded retained
        // terminal receipt after a lost IPC reply. Keep the write gate closed.
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
    // Window/component destruction ends participation. Do not retain retry
    // timers or DOM closures; Rust rechecks the actual live participants.
    void this.host
      .reply({ phase: "prepare", operationId: operation.id, ready: false })
      .catch(this.host.error);
    this.release(operation);
  }
}

export function sameQuietAuthority(a: AccessStamp, b: AccessStamp) {
  return (
    !!a.sessionId &&
    a.sessionId === b.sessionId &&
    a.noteId === b.noteId &&
    a.noteEpoch !== undefined &&
    a.noteEpoch === b.noteEpoch
  );
}
