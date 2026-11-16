import { normalizeAppearanceSettings, parseAppearance, parseScheme } from "./themes/appearance";
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
  // An ACK may commit successfully while its confirming read fails. Keep the
  // old UI, but never use that old snapshot to construct another write.
  private recoveryRequired = false;
  constructor(private publish: (value: Settings) => void) {}
  snapshot = () => this.value;
  ticket = () => this.generation;
  observe(value: Settings, ticket = this.generation): boolean {
    if (ticket !== this.generation) return false;
    if (value.interfaceDetails !== undefined) parseInterfaceDetails(value.interfaceDetails);
    this.value = normalizeAppearanceSettings(value);
    this.recoveryRequired = false;
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
    const input = { ...patch, ...(Object.hasOwn(patch, "appearance") ? { appearance: parseAppearance(patch.appearance) } : {}), ...(patch.interfaceDetails === undefined ? {} : {
      interfaceDetails: parseInterfaceDetails(patch.interfaceDetails),
    }) };
    if (Object.hasOwn(input, "theme")) parseScheme(input.theme);
    // Only an explicit appearance edit owns that domain. Partial and legacy
    // theme-only intents stay partial: Store/preview merge against persisted
    // authority and atomically migrate/project there, including other windows.
    if (input.appearance) input.theme = input.appearance.schemePreference;
    const work = this.tail.then(async () => {
      this.generation++;
      try {
        if (this.recoveryRequired) {
          await this.confirm(read);
          // Invalidate reads admitted during recovery before starting a write.
          this.generation++;
        }
        await persist(input);
        // Snapshots requested while persistence was pending may predate this
        // ACK. Only a read admitted after this boundary can confirm it.
        this.generation++;
        this.recoveryRequired = true;
        // External adoption during this read wins. Retry to confirm the actual
        // stored result, rather than replaying a captured patch over it.
        await this.confirm(read);
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
  private async confirm(read: () => Promise<Settings>): Promise<void> {
    for (;;) {
      const ticket = this.ticket();
      const stored = await read();
      if (this.observe(stored, ticket)) return;
    }
  }
}
