import type { ActionDelivery, Workspace } from "./types";

/** One Mac main window's explicit intents. Completion never publishes UI state. */
export class SidebarPreference {
  private latest?: { version: number; visible: boolean };
  private version = 0;
  private confirmed = 0;
  private running?: Promise<void>;

  constructor(
    private write: (visible: boolean) => Promise<ActionDelivery<Workspace>>,
    private read: () => Promise<Workspace>,
  ) {}

  get needsConfirmation(): boolean {
    return !!this.running || this.confirmed !== this.version;
  }

  request(visible: boolean): Promise<void> {
    this.latest = { version: ++this.version, visible };
    return this.drain();
  }

  async flush(): Promise<void> {
    while (this.needsConfirmation) await this.drain();
  }

  private drain(): Promise<void> {
    if (this.running) return this.running;
    const work = (async () => {
      // Assign running before even a synchronous port failure can settle it.
      await Promise.resolve();
      try {
        while (this.latest && this.confirmed !== this.version) {
          const intent = this.latest;
          try {
            let confirmed = false;
            try {
              const result = await this.write(intent.visible);
              confirmed =
                result.accessAccepted &&
                result.maintenanceError === undefined &&
                result.value?.settings.macSidebarVisible === intent.visible;
            } catch {
              // A failed response may follow a committed patch. Only a trusted
              // read of the exact boolean can resolve that uncertainty.
            }
            if (!confirmed) {
              const workspace = await this.read();
              if (workspace.settings.macSidebarVisible !== intent.visible)
                throw Error("读取结果与最后请求的显示状态不符");
            }
            this.confirmed = intent.version;
          } catch (error) {
            if (intent.version !== this.version) continue;
            const message =
              error && typeof error === "object" && "message" in error
                ? String(error.message)
                : String(error);
            throw Error(`侧栏显示偏好未确认保存：${message}`);
          }
        }
      } finally {
        this.running = undefined;
      }
    })();
    this.running = work;
    return work;
  }
}
