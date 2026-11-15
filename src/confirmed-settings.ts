import type { Settings } from "./types";
import { parseInterfaceDetails } from "./interface-details";

/** One confirmed settings owner. Local writes are serialized at the persistence
 * boundary; values reach product controls only after a fresh post-ACK read.
 * Read tickets also prevent a delayed workspace snapshot undoing a newer ACK
 * or an external update (settings do not advance the note metadata sequence). */
export class ConfirmedSettings {
  private value: Settings = {};
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private publish: (value: Settings) => void) {}
  snapshot = () => this.value;
  ticket = () => this.generation;
  observe(value: Settings, ticket = this.generation): boolean {
    if (ticket !== this.generation) return false;
    if (value.interfaceDetails !== undefined) parseInterfaceDetails(value.interfaceDetails);
    this.value = { ...value };
    this.generation++;
    this.publish(this.value);
    return true;
  }
  write(
    patch: Settings,
    persist: (patch: Settings) => Promise<unknown>,
    read: () => Promise<Settings>,
  ): Promise<void> {
    // Copy at admission, including the nested versioned object. Never retain a
    // mutable caller object while another write is awaiting its receipt.
    const input = { ...patch, ...(patch.interfaceDetails === undefined ? {} : {
      interfaceDetails: parseInterfaceDetails(patch.interfaceDetails),
    }) };
    const work = this.tail.then(async () => {
      this.generation++;
      try {
        await persist(input);
        // External adoption during this read wins. Retry to confirm the actual
        // stored result, rather than replaying a captured patch over it.
        for (;;) {
          const ticket = this.ticket();
          const stored = await read();
          if (this.observe(stored, ticket)) return;
        }
      } catch (cause) {
        // No rejected patch has been published. Republish the current owner,
        // also restoring transient column-resize geometry on save failure.
        this.publish(this.value);
        throw cause;
      }
    });
    this.tail = work.catch(() => {});
    return work;
  }
}
