/** Only an ordinary native Mac folder form owns this controller, never a window shortcut. */
export class OrdinaryFolderKeyboard {
  private generation = 0;
  private disposed = false;
  private running = false;
  private ownFocus = false;
  private expectedFocus: Element | null = null;
  private queue: { reverse: boolean; generation: number }[] = [];
  private readonly document: Document;
  private readonly window: Window & typeof globalThis;

  constructor(
    private form: HTMLFormElement,
    private active: () => boolean,
    private query: () => Promise<boolean>,
    private failure: () => void,
  ) {
    this.document = form.ownerDocument;
    this.window = this.document.defaultView!;
    this.document.addEventListener("pointerdown", this.cancel, true);
    this.document.addEventListener("beforeinput", this.cancel, true);
    this.document.addEventListener("compositionstart", this.cancel, true);
    this.document.addEventListener("keydown", this.otherKey, true);
    this.document.addEventListener("focusin", this.otherFocus, true);
    this.document.addEventListener("visibilitychange", this.cancel);
    this.window.addEventListener("blur", this.cancel);
    this.window.addEventListener("pagehide", this.cancel);
  }

  private plainTab(event: KeyboardEvent) {
    return (
      event.key === "Tab" &&
      !event.altKey && !event.ctrlKey && !event.metaKey &&
      !event.isComposing && !event.defaultPrevented &&
      event.target instanceof this.window.HTMLElement &&
      this.form.contains(event.target)
    );
  }

  private otherKey = (event: KeyboardEvent) => {
    // Holding Shift prepares reverse Tab; it does not itself change focus or draft.
    if (event.key !== "Shift" && !this.plainTab(event)) this.cancel();
  };

  private otherFocus = () => {
    if (!this.ownFocus) this.cancel();
  };

  private cancel = () => {
    this.generation++;
    this.queue = [];
    this.expectedFocus = null;
  };

  handle(event: KeyboardEvent) {
    if (event.key === "Shift") return;
    if (this.disposed || !this.active() || !this.plainTab(event)) {
      this.cancel();
      return;
    }
    event.preventDefault(); // The native default cannot be cancelled after an IPC await.
    if (!this.expectedFocus) this.expectedFocus = this.document.activeElement;
    this.queue.push({ reverse: event.shiftKey, generation: this.generation });
    void this.pump();
  }

  private valid(generation: number) {
    return (
      generation === this.generation && !this.disposed && this.active() &&
      this.form.isConnected && this.document.visibilityState !== "hidden" &&
      this.document.hasFocus() && this.document.activeElement === this.expectedFocus &&
      !!this.expectedFocus && this.form.contains(this.expectedFocus)
    );
  }

  private controls(enabled: boolean) {
    return [...this.form.querySelectorAll<HTMLElement>(
      enabled ? "input, button, select, textarea, a[href], [tabindex]" : 'input[aria-label="名称"]',
    )].filter((element) => {
      const style = this.window.getComputedStyle(element);
      return element.tabIndex >= 0 && !element.matches(":disabled") &&
        !element.closest("[hidden], [inert]") && element.getClientRects().length > 0 &&
        style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
    });
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.disposed) {
        const item = this.queue.shift()!;
        if (!this.valid(item.generation)) continue;
        try {
          // Exactly one live query per accepted navigation, with no concurrent replies to reorder.
          const enabled = await this.query();
          if (!this.valid(item.generation)) continue;
          if (typeof enabled !== "boolean") throw Error("invalid keyboard policy");
          const controls = this.controls(enabled);
          if (!controls.length) throw Error("no available form control");
          const index = controls.indexOf(this.expectedFocus as HTMLElement);
          const next = item.reverse
            ? (index <= 0 ? controls.length - 1 : index - 1)
            : (index + 1) % controls.length;
          const target = controls[next];
          this.ownFocus = true;
          try {
            target.focus();
            if (target instanceof this.window.HTMLInputElement && target.getAttribute("aria-label") === "名称")
              target.select();
          } finally {
            this.ownFocus = false;
          }
          if (this.document.activeElement !== target) throw Error("form focus unavailable");
          this.expectedFocus = target;
        } catch {
          if (this.valid(item.generation)) {
            this.cancel();
            this.failure();
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  dispose() {
    this.disposed = true;
    this.cancel();
    this.document.removeEventListener("pointerdown", this.cancel, true);
    this.document.removeEventListener("beforeinput", this.cancel, true);
    this.document.removeEventListener("compositionstart", this.cancel, true);
    this.document.removeEventListener("keydown", this.otherKey, true);
    this.document.removeEventListener("focusin", this.otherFocus, true);
    this.document.removeEventListener("visibilitychange", this.cancel);
    this.window.removeEventListener("blur", this.cancel);
    this.window.removeEventListener("pagehide", this.cancel);
  }
}
