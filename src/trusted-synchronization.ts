export type SynchronizationResult<Snapshot> =
  | { success: true; sequence: number; snapshot: Snapshot }
  | { success: false; sequence: number; error: unknown };

/** A resolved request is not proof of synchronization: callers inspect success
 * and verify the returned snapshot is still the current trusted generation. */
export class TrustedSynchronization<Snapshot> {
  private sequence = 0;
  private running?: Promise<SynchronizationResult<Snapshot>>;
  private trusted?: SynchronizationResult<Snapshot>;

  current(result: SynchronizationResult<Snapshot>): boolean {
    return (
      result.success &&
      this.trusted === result &&
      this.sequence === result.sequence
    );
  }

  invalidate() {
    this.sequence++;
    this.trusted = undefined;
  }

  request(
    begin: () => void,
    load: () => Promise<Snapshot>,
    publish: (snapshot: Snapshot) => void,
    failed: (error: unknown) => void,
  ): Promise<SynchronizationResult<Snapshot>> {
    this.invalidate();
    begin();
    if (this.running) return this.running;
    const work = (async (): Promise<SynchronizationResult<Snapshot>> => {
      // Defer load so running is assigned even if a loader throws synchronously.
      await Promise.resolve();
      for (;;) {
        const sequence = this.sequence;
        try {
          const snapshot = await load();
          if (sequence !== this.sequence) continue;
          publish(snapshot);
          if (sequence !== this.sequence) continue;
          const result = { success: true as const, sequence, snapshot };
          this.trusted = result;
          return result;
        } catch (error) {
          if (sequence !== this.sequence) continue;
          failed(error);
          return { success: false, sequence, error };
        }
      }
    })();
    this.running = work;
    void work
      .finally(() => {
        if (this.running === work) this.running = undefined;
      })
      .catch(() => {});
    return work;
  }
}
