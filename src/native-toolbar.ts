import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  NotesToolbar,
  type ToolbarEvent,
} from "../plugins/tauri-plugin-notes-ui/guest-js";
import type { ToolbarTransport } from "./native-toolbar-controller";
export { NativeToolbar } from "./native-toolbar-controller";
export type {
  Action,
  MenuCommand,
  MenuEntry,
  ToolbarState,
  Intent,
} from "../plugins/tauri-plugin-notes-ui/guest-js";
export const macNative =
  typeof navigator !== "undefined" &&
  /Mac/.test(navigator.platform) &&
  !/Android|iPhone|iPad/.test(navigator.userAgent);
export function nativeToolbarTransport(): ToolbarTransport {
  const toolbar = new NotesToolbar();
  return {
    windowLabel: toolbar.windowLabel,
    listen: async (handler) =>
      getCurrentWindow().listen<ToolbarEvent>(
        "notes-ui://intent",
        ({ payload }) => handler(payload),
      ),
    bind: (state) => toolbar.bind(state),
    update: (state) => toolbar.update(state),
    inspect: () => toolbar.inspect(),
    focusSearch: () => toolbar.focusSearch(),
    unbind: () => toolbar.unbind(),
  };
}
