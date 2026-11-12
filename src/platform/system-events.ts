import { useEffect, useRef } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import {
  getCurrentWindow,
  type CloseRequestedEvent,
} from "@tauri-apps/api/window";
import { native } from "../bridge";
import { macNative } from "../native-toolbar";
import type { Editor } from "@tiptap/core";
import type { DrawingStroke } from "../types";
export type KeyboardBindings = {
  quitting: boolean;
  folderForm: boolean;
  ocr: boolean;
  mobile: boolean;
  page: "folders" | "notes" | "editor";
  attachmentBrowser: boolean;
  modal: boolean;
  menu: boolean;
  format: boolean;
  drawing: boolean;
  find: boolean;
  searching: boolean;
  searchDraft: boolean;
  create(): void;
  globalSearch(): void;
  findInNote(): void;
  cancelOcr(): void;
  closeModal(): void;
  closeMenu(): void;
  closeFormat(): void;
  closeDrawing(): void;
  closeFind(): void;
  clearSearch(): void;
  back(): void;
};
type LegacyMenu = {
  create(): void;
  newFolder(): void;
  toggleSidebar(): void;
  toggleGallery(): void;
  search(): void;
  find(): void;
  attachmentBrowser: boolean;
  archive(mode: "export" | "import"): void;
};
function routeLegacyMenu(command: string, menu: LegacyMenu) {
  switch (command) {
    case "new_note":
      menu.create();
      break;
    case "new_folder":
      menu.newFolder();
      break;
    case "sidebar":
      menu.toggleSidebar();
      break;
    case "gallery":
      menu.toggleGallery();
      break;
    case "search":
      menu.search();
      break;
    case "find_in_note":
      if (menu.attachmentBrowser) menu.search();
      else menu.find();
      break;
    case "export":
      menu.archive("export");
      break;
    case "import":
      menu.archive("import");
      break;
  }
}
export type SystemEventPorts = {
  keys: KeyboardBindings;
  androidBack(): void;
  nativeMenu(command: string): void;
  legacyMenu: LegacyMenu;
  refreshMetadata(): void;
  saveHidden(): void;
  closeRequested(event: CloseRequestedEvent): Promise<void>;
  detachOwners(): void;
  fail(error: unknown): void;
  drawing(strokes: DrawingStroke[], pos?: number, editor?: Editor): void;
};
/** One set of system subscriptions. Callbacks read the current typed bindings;
 * late native registration/events are discarded after disposal. Business save,
 * quit/access/recording protocols remain in their original root controllers. */
export function useSystemEvents(ports: SystemEventPorts) {
  const current = useRef(ports);
  current.current = ports;
  useEffect(() => {
    let live = true;
    const releases: (() => void)[] = [];
    const registered = (release: () => void) => {
      if (live) releases.push(release);
      else release();
    };
    const failed = (error: unknown) => {
      if (live) current.current.fail(error);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") current.current.saveHidden();
      else if (document.visibilityState === "visible")
        current.current.refreshMetadata();
    };
    const online = () => current.current.refreshMetadata();
    const drawing = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          strokes: DrawingStroke[];
          pos?: number;
          editor?: Editor;
        }>
      ).detail;
      if (detail)
        current.current.drawing(detail.strokes, detail.pos, detail.editor);
    };
    const keyboard = (event: KeyboardEvent) => {
      const k = current.current.keys;
      if (k.quitting) {
        event.preventDefault();
        return;
      }
      if (k.folderForm || (k.ocr && event.key !== "Escape")) return;
      if (
        native &&
        macNative &&
        (event.metaKey || event.ctrlKey) &&
        ["n", "f"].includes(event.key.toLowerCase())
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key === "n") {
        event.preventDefault();
        k.create();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        k.globalSearch();
      } else if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        if (k.attachmentBrowser) k.globalSearch();
        else if (k.page === "editor" || !k.mobile) k.findInNote();
        else k.globalSearch();
      }
      if (event.key !== "Escape") return;
      if (k.ocr) k.cancelOcr();
      else if (k.modal) k.closeModal();
      else if (k.menu) k.closeMenu();
      else if (k.format) k.closeFormat();
      else if (k.drawing) k.closeDrawing();
      else if (k.find) k.closeFind();
      else if (k.searching || k.searchDraft) k.clearSearch();
      else if (k.attachmentBrowser || (k.mobile && k.page !== "folders"))
        k.back();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("edit-drawing", drawing);
    if (native) {
      const window = getCurrentWindow();
      void window
        .onFocusChanged(({ payload }) => {
          if (live && payload) current.current.refreshMetadata();
        })
        .then(registered)
        .catch(failed);
      void window
        .onCloseRequested((event) => {
          if (live) return current.current.closeRequested(event);
        })
        .then(registered)
        .catch(failed);
      void window
        .listen<string>("menu-action", (event) => {
          if (live) {
            const p = current.current;
            if (macNative) p.nativeMenu(event.payload);
            else routeLegacyMenu(event.payload, p.legacyMenu);
          }
        })
        .then(registered)
        .catch(failed);
      if (/Android/i.test(navigator.userAgent))
        void onBackButtonPress(() => {
          if (live) current.current.androidBack();
        })
          .then((listener) =>
            registered(() => {
              void listener.unregister().catch(failed);
            }),
          )
          .catch(failed);
    }
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", online);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("edit-drawing", drawing);
      for (const release of releases) release();
      current.current.detachOwners();
    };
  }, []);
}
