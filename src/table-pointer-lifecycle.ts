import { Plugin } from "@tiptap/pm/state";
import { columnResizingPluginKey } from "@tiptap/pm/tables";

/** End a table mouse-selection gesture whose release did not reach the root.
 * prosemirror-tables owns its move/stop closures. Send its public termination
 * event before a released move reaches those closures, rather than clearing
 * only plugin state (which would leave the old move listener installed).
 */
export function tablePointerLifecycle() {
  return new Plugin({
    view(view) {
      const win = view.dom.ownerDocument.defaultView;
      if (!win) throw Error("Table editor requires an attached DOM window");
      let release: (() => void) | undefined;
      const terminate = () => release?.();
      const down = (event: MouseEvent) => {
        terminate();
        if (
          !view.editable ||
          view.isDestroyed ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        const resize = columnResizingPluginKey.getState(view.state);
        if (resize && resize.activeHandle !== -1) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const cell = target.closest("td,th");
        if (!cell || !view.dom.contains(cell)) return;
        const root = view.root;
        const cleanup = () => {
          release = undefined;
          win.removeEventListener("mousemove", move, true);
          win.removeEventListener("blur", terminate);
          win.removeEventListener("pointercancel", terminate, true);
          root.removeEventListener("mouseup", cleanup);
          root.removeEventListener("dragstart", cleanup);
        };
        release = () => {
          cleanup();
          if (!view.isDestroyed) {
            // Target the root, outside the editor DOM, so the upstream stop
            // handlers run without synthesizing a cell click or changing doc.
            root.dispatchEvent(
              new MouseEvent("mouseup", {
                bubbles: true,
                button: 0,
                buttons: 0,
              }),
            );
          }
        };
        const move = (event: MouseEvent) => {
          if ((event.buttons & 1) === 0) terminate();
        };
        win.addEventListener("mousemove", move, true);
        win.addEventListener("blur", terminate);
        win.addEventListener("pointercancel", terminate, true);
        // Bubble phase: a swallowed mouseup must leave this guard armed.
        root.addEventListener("mouseup", cleanup);
        root.addEventListener("dragstart", cleanup);
      };
      view.dom.addEventListener("mousedown", down, true);
      return {
        update() {
          if (!view.editable) terminate();
        },
        destroy() {
          terminate();
          view.dom.removeEventListener("mousedown", down, true);
        },
      };
    },
  });
}
