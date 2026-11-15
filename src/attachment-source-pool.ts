import {
  acquireAttachmentSource,
  releaseAttachmentSource,
  accessGate,
  type AttachmentSourceGrant,
  type AttachmentSourcePurpose,
} from "./bridge";
import {
  createLeasedAttachmentMediaSource,
  type AttachmentMediaSource,
} from "./attachment-media";

type Subscriber = {
  source?: AttachmentMediaSource;
  ready(source: AttachmentMediaSource, grant: AttachmentSourceGrant): void;
  failed(error: unknown): void;
};
type Entry = {
  id: string;
  owner: string;
  key: string;
  purpose: AttachmentSourcePurpose;
  pixels?: number;
  subscribers: Set<Subscriber>;
  state: "queued" | "running" | "loaded" | "retired";
  source?: AttachmentMediaSource;
  grant?: AttachmentSourceGrant;
};
export type SourceTransport = {
  acquire: typeof acquireAttachmentSource;
  release: typeof releaseAttachmentSource;
};
/** Only thumbnail issuance is bounded. Originals have an independent activation
 * channel. A canceled queued request never reaches IPC; an in-flight late grant
 * is released without publication. Keys bind exact UI metadata and authority. */
export class AttachmentSourcePool {
  private entries = new Map<string, Entry>();
  private queue: Entry[] = [];
  private running = 0;
  private resources = new Map<AttachmentMediaSource, Entry>();
  private versions = new Map<string, number>();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  version = (id: string, purpose: AttachmentSourcePurpose) =>
    this.versions.get(JSON.stringify([id, purpose])) ?? 0;
  constructor(
    private transport: SourceTransport,
    private limit = 2,
  ) {}
  request(
    id: string,
    owner: string,
    purpose: AttachmentSourcePurpose,
    pixels: number | undefined,
    identity: string,
    ready: Subscriber["ready"],
    failed: Subscriber["failed"],
  ) {
    const key = JSON.stringify([
      id,
      owner,
      purpose,
      pixels,
      identity,
      this.version(id, purpose),
    ]);
    let entry = this.entries.get(key);
    const subscriber: Subscriber = { ready, failed };
    if (!entry) {
      entry = {
        id,
        owner,
        key,
        purpose,
        pixels,
        subscribers: new Set(),
        state: "queued",
      };
      this.entries.set(key, entry);
    }
    entry.subscribers.add(subscriber);
    if (entry.state === "loaded") this.publish(entry, subscriber);
    else if (entry.state === "queued" && !this.queue.includes(entry)) {
      if (purpose === "original") this.start(entry);
      else {
        this.queue.push(entry);
        this.pump();
      }
    }
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      subscriber.source?.dispose();
      entry!.subscribers.delete(subscriber);
      if (!entry!.subscribers.size) this.retire(entry!);
    };
  }
  private publish(entry: Entry, subscriber: Subscriber) {
    if (entry.state !== "loaded" || !entry.source || !entry.grant) return;
    subscriber.source = entry.source.retain();
    subscriber.ready(subscriber.source, entry.grant);
  }
  private retire(entry: Entry, force = false) {
    if (entry.state === "retired") return;
    entry.state = "retired";
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    this.queue = this.queue.filter((item) => item !== entry);
    if (force) entry.source?.revoke();
    else entry.source?.dispose();
    entry.source = undefined;
  }
  private pump() {
    while (this.running < this.limit && this.queue.length) {
      const entry = this.queue.shift()!;
      if (entry.state === "queued" && entry.subscribers.size) this.start(entry);
    }
  }
  private start(entry: Entry) {
    entry.state = "running";
    if (entry.purpose === "thumbnail") this.running++;
    const acquire = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await this.transport.acquire(
            entry.id,
            entry.purpose,
            entry.pixels,
          );
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (
            entry.state !== "retired" &&
            entry.subscribers.size &&
            attempt < 2 &&
            (code === "access_changed" || code === "metadata_stale")
          )
            continue;
          throw error;
        }
      }
      throw Error("媒体申请未完成");
    };
    void acquire()
      .then((grant) => {
        const source = createLeasedAttachmentMediaSource(grant, () => {
          this.resources.delete(source);
          return this.transport.release(grant.leaseId);
        });
        this.resources.set(source, entry);
        if (
          grant.noteId !== entry.owner ||
          grant.attachmentId !== entry.id ||
          grant.purpose !== entry.purpose
        ) {
          source.dispose();
          throw Object.assign(Error("媒体所属目标已改变"), {
            code: "access_changed",
          });
        }
        if (entry.state === "retired" || !entry.subscribers.size) {
          source.dispose();
          return;
        }
        entry.source = source;
        entry.grant = grant;
        entry.state = "loaded";
        for (const subscriber of [...entry.subscribers])
          if (entry.subscribers.has(subscriber))
            this.publish(entry, subscriber);
      })
      .catch((error) => {
        if (entry.state === "retired") return;
        const subscribers = [...entry.subscribers];
        this.retire(entry);
        if ((error as { code?: string })?.code !== "cancelled")
          for (const subscriber of subscribers) subscriber.failed(error);
      })
      .finally(() => {
        if (entry.purpose === "thumbnail") {
          this.running--;
          this.pump();
        }
      });
  }
  private bump(ids: readonly string[], purpose?: AttachmentSourcePurpose) {
    for (const id of ids)
      for (const p of purpose
        ? [purpose]
        : (["original", "thumbnail"] as const)) {
        const key = JSON.stringify([id, p]);
        this.versions.set(key, this.version(id, p) + 1);
      }
    for (const listener of this.listeners) listener();
  }
  invalidate(ids: readonly string[], purpose?: AttachmentSourcePurpose) {
    for (const entry of [...this.entries.values()])
      if (ids.includes(entry.id) && (!purpose || purpose === entry.purpose))
        this.retire(entry, true);
    for (const [source, entry] of this.resources)
      if (ids.includes(entry.id) && (!purpose || purpose === entry.purpose))
        source.revoke();
    this.bump(ids, purpose);
  }
  clearThumbnails() {
    const ids = new Set<string>();
    for (const entry of this.entries.values())
      if (entry.purpose === "thumbnail") ids.add(entry.id);
    this.invalidate([...ids], "thumbnail");
  }
  revoke(owners?: readonly string[]) {
    const ids = new Set<string>();
    for (const entry of [...this.entries.values()])
      if (!owners || owners.includes(entry.owner)) {
        ids.add(entry.id);
        this.retire(entry, true);
      }
    for (const [source, entry] of this.resources)
      if (!owners || owners.includes(entry.owner)) {
        ids.add(entry.id);
        source.revoke();
      }
    this.bump([...ids]);
  }
}
export const attachmentSourcePool = new AttachmentSourcePool({
  acquire: acquireAttachmentSource,
  release: releaseAttachmentSource,
});
export function attachmentSourceIdentity(owner: string, version: string) {
  const stamp = accessGate.stamp(owner);
  return JSON.stringify([
    stamp.sessionId,
    stamp.noteId,
    stamp.noteEpoch,
    version,
  ]);
}
