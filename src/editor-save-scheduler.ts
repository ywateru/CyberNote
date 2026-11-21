import type { JSONContent } from "@tiptap/core";
import type { SaveOutcome } from "./save-queue";

type Timer = ReturnType<typeof setTimeout>;

export interface EditorSaveSchedulerOptions {
  register: (noteId: string) => Promise<string>;
  save: (
    noteId: string,
    document: JSONContent,
    intent: Promise<string>,
  ) => Promise<SaveOutcome>;
  publish: (noteId: string, document: JSONContent) => void;
  blocked?: (noteId: string) => unknown;
  onFailure?: (noteId: string, error: unknown) => void;
  onBusyChange?: (noteId: string, busy: boolean) => void;
  quietMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => Timer;
  clearTimer?: (timer: Timer) => void;
}

interface Entry {
  latest?: JSONContent;
  intent?: Promise<string>;
  timer?: Timer;
  firstScheduledAt: number;
  running?: Promise<void>;
  busy: boolean;
}

/**
 * Coalesces normal editor-body saves per note. The first edit registers one
 * native save intent and publishes the optimistic body immediately; later
 * edits replace the one pending body. A single in-flight save and one latest
 * body are enough, while flush/cancel preserve the existing barrier contract.
 */
export class EditorSaveScheduler {
  private readonly entries = new Map<string, Entry>();
  private readonly quietMs: number;
  private readonly maxWaitMs: number;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delay: number) => Timer;
  private readonly clearTimer: (timer: Timer) => void;

  constructor(private readonly options: EditorSaveSchedulerOptions) {
    this.quietMs = options.quietMs ?? 180;
    this.maxWaitMs = options.maxWaitMs ?? 1000;
    this.now = options.now ?? (() => Date.now());
    this.setTimer =
      options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer =
      options.clearTimer ?? ((timer) => clearTimeout(timer));
  }

  schedule(noteId: string, document: JSONContent) {
    const blocked = this.options.blocked?.(noteId);
    if (blocked) {
      this.options.onFailure?.(noteId, blocked);
      return;
    }
    const entry = this.entry(noteId);
    if (!entry.latest && !entry.running)
      entry.firstScheduledAt = this.now();
    entry.latest = document;
    this.options.publish(noteId, document);
    if (!entry.intent) {
      const intent = this.options.register(noteId);
      // The scheduler always consumes this promise. Keep a rejection observed
      // while it waits for the quiet window; save() still receives the reason.
      void intent.catch(() => {});
      entry.intent = intent;
    }
    this.markBusy(entry, noteId);
    this.arm(noteId, entry);
  }

  hasPending(noteIds?: readonly string[]) {
    return this.targets(noteIds).some((id) => {
      const entry = this.entries.get(id);
      return !!entry && (!!entry.latest || !!entry.timer || !!entry.running);
    });
  }

  /** Drain all pending bodies for a barrier or explicit flush. */
  async flush(noteIds?: readonly string[]) {
    const ids = this.targets(noteIds);
    for (;;) {
      let active = false;
      for (const id of ids) {
        const entry = this.entries.get(id);
        if (!entry) continue;
        if (entry.timer) {
          this.disarm(entry);
          active = true;
        }
        if (entry.latest) {
          active = true;
          void this.drain(id);
        } else if (entry.running) active = true;
      }
      if (!active) return;
      await Promise.all(
        ids.map((id) => this.entries.get(id)?.running ?? Promise.resolve()),
      );
    }
  }

  private targets(noteIds?: readonly string[]) {
    return noteIds ? [...noteIds] : [...this.entries.keys()];
  }

  private entry(noteId: string): Entry {
    let entry = this.entries.get(noteId);
    if (!entry) {
      entry = {
        firstScheduledAt: this.now(),
        busy: false,
      };
      this.entries.set(noteId, entry);
    }
    return entry;
  }

  private arm(noteId: string, entry: Entry) {
    this.disarm(entry);
    const elapsed = Math.max(0, this.now() - entry.firstScheduledAt);
    const delay = Math.max(
      0,
      Math.min(this.quietMs, this.maxWaitMs - elapsed),
    );
    entry.timer = this.setTimer(() => {
      entry.timer = undefined;
      void this.drain(noteId);
    }, delay);
  }

  private disarm(entry: Entry) {
    if (!entry.timer) return;
    this.clearTimer(entry.timer);
    entry.timer = undefined;
  }

  private drain(noteId: string): Promise<void> {
    const entry = this.entry(noteId);
    if (entry.running) return entry.running;
    if (entry.timer) return Promise.resolve();
    const running = this.run(noteId, entry).finally(() => {
      if (entry.running === running) entry.running = undefined;
      this.settleIfIdle(noteId, entry);
    });
    entry.running = running;
    return running;
  }

  private async run(noteId: string, entry: Entry) {
    while (entry.latest && !entry.timer) {
      const document = entry.latest;
      entry.latest = undefined;
      const intent = entry.intent ?? this.options.register(noteId);
      entry.intent = undefined;
      try {
        const outcome = await this.options.save(noteId, document, intent);
        if (!outcome.saved && !entry.latest) return;
      } catch (error) {
        this.options.onFailure?.(noteId, error);
        if (!entry.latest) return;
      }
      if (entry.latest && !entry.timer) this.arm(noteId, entry);
    }
  }

  private markBusy(entry: Entry, noteId: string) {
    if (entry.busy) return;
    entry.busy = true;
    this.options.onBusyChange?.(noteId, true);
  }

  private settleIfIdle(noteId: string, entry: Entry) {
    if (entry.latest || entry.timer || entry.running) return;
    if (entry.busy) {
      entry.busy = false;
      this.options.onBusyChange?.(noteId, false);
    }
    // Keep the map bounded by live work rather than by every note ever edited.
    if (this.entries.get(noteId) === entry) this.entries.delete(noteId);
  }
}
