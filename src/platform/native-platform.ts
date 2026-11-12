import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import type { Note, Settings, Workspace } from "../types";
import type { NativeContext } from "./contracts";
import {
  NativeToolbar,
  nativeToolbarTransport,
  macNative,
  type Intent,
  type MenuCommand,
} from "../native-toolbar";
import type { BindingInfo } from "../../plugins/tauri-plugin-notes-ui/guest-js";
import { toolbarState } from "../native-toolbar-state";
import { accessGate, native } from "../bridge";
import { isPhysicalOwner } from "../smart-folders";
import { canConvertTextToTable, convertTextToTable } from "../editor-actions";
import { executeEditorCommand } from "../editor-menus/editor-commands";
import type { NetworkSyncCoordinator } from "../network-sync";

type Target = {
  noteId: string | null;
  scope: string;
  current: Note | undefined;
  editor: Editor | null;
  loading: boolean;
  synchronizing: boolean;
  accessSuspended: string[];
  modal: string | null;
  folderForm: boolean;
  draw: boolean;
  record: boolean;
  ocr: boolean;
  quitPending: boolean;
  quitting(): boolean;
  blocked(id: string): boolean;
};
type Projection = {
  folderId: string;
  view: "list" | "gallery";
  galleryEditor: boolean;
  attachmentBrowser: boolean;
  separate: string | null;
  page: "folders" | "notes" | "editor";
  sidebar: boolean;
  settings: Settings;
  listTitle: string;
  count: number;
  query: string;
  contentOverlay: boolean;
};
type SearchChange = {
  query?: string;
  searching?: boolean;
  resetFilter?: boolean;
};
type Actions = {
  networkSync: Pick<NetworkSyncCoordinator, "frozen" | "cancel">;
  changeSearch(next: SearchChange): Promise<unknown>;
  setContextFolder(id: string | null): void;
  openModal(type: string, value?: string): void;
  changeSidebar(value: boolean | ((old: boolean) => boolean)): void;
  back(): void;
  createNote(validate?: () => void): Promise<void>;
  shareTarget(context: NativeContext): Promise<void>;
  openRecording(context?: NativeContext): void;
  openAttachmentBrowser(): void;
  setAttachmentBrowser(value: boolean): void;
  updateSettings(patch: Settings): void;
  setShowFind(value: boolean): void;
  workspace(): Workspace;
  doAction(
    action: Record<string, unknown>,
    validate?: () => void,
  ): Promise<unknown>;
  setContextNote(value: string | null): void;
  setNoteId(
    value: string | null | ((old: string | null) => string | null),
  ): void;
  pick(accept: string, context: NativeContext): void;
  openOcr(context?: NativeContext): void;
  openDrawing(strokes: [], pos: undefined, editor: Editor): void;
  focusGlobalSearch(): void;
  archive(mode: "export" | "import"): void;
  fail(error: unknown): void;
};
export type NativePlatformPorts = {
  target: Target;
  projection: Projection;
  actions: Actions;
};
/** Owns the unique native toolbar, projection and event routing. Captured
 * intents keep their original editor/bookmark/stamp/version until live assert. */
export class NativePlatform {
  readonly toolbar = { current: null as NativeToolbar<NativeContext> | null };
  readonly owners = { current: new WeakMap<Editor, string>() };
  readonly versions = { current: new WeakMap<Editor, number>() };
  private ids = new WeakMap<Editor, number>();
  private counter = 0;
  private active = true;
  private ports: NativePlatformPorts | null = null;
  private value = { info: null as BindingInfo | null, searchAck: 0 };
  private listeners = new Set<() => void>();
  snapshot = () => this.value;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  configure(ports: NativePlatformPorts) {
    this.ports = ports;
  }
  private live() {
    if (!this.ports) throw Error("原生平台尚未配置");
    return this.ports;
  }
  private update(patch: Partial<typeof this.value>) {
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) listener();
  }
  mount() {
    this.active = true;
  }
  dispose() {
    this.active = false;
    this.toolbar.current?.stop();
    this.toolbar.current = null;
  }
  reconcile() {
    const p = this.live();
    if (!native || !macNative || p.target.loading) {
      this.toolbar.current?.stop();
      this.toolbar.current = null;
      return;
    }
    if (!this.toolbar.current)
      this.toolbar.current = new NativeToolbar<NativeContext>(
        nativeToolbarTransport(),
        (intent, context, sequence) => {
          if (this.active) this.handle(intent, context, sequence);
        },
        (info) => {
          if (!this.active) return;
          const old = this.value.info;
          if (
            old?.bindingId === info.bindingId &&
            JSON.stringify(old.native) === JSON.stringify(info.native)
          )
            return;
          this.update({ info });
        },
        (error) => {
          if (this.active) this.live().actions.fail(error);
        },
      );
    this.project();
  }
  private project() {
    const p = this.live();
    if (!this.toolbar.current) return;
    const {
      noteId,
      scope: nativeScope,
      current,
      editor,
      loading,
      synchronizing,
      accessSuspended,
      modal,
      draw,
      record,
      ocr,
      quitPending,
    } = p.target;
    const {
      folderId,
      view,
      galleryEditor,
      attachmentBrowser,
      separate,
      page,
      sidebar,
      settings,
      listTitle,
      count,
      query,
      contentOverlay,
    } = p.projection;
    const liveEditor =
      editor &&
      !editor.isDestroyed &&
      this.owners.current.get(editor) === noteId
        ? editor
        : null;
    if (liveEditor && !this.ids.has(liveEditor))
      this.ids.set(liveEditor, ++this.counter);
    const available =
      !quitPending &&
      !loading &&
      !synchronizing &&
      !accessSuspended.length &&
      !accessGate.state?.operationId &&
      !modal &&
      !draw &&
      !record &&
      !ocr;
    const editable =
      available &&
      !!current &&
      !current.deletedAt &&
      !p.target.blocked(current.id) &&
      !p.actions.networkSync.frozen(current.id) &&
      (!current.locked || !!accessGate.state?.notes[current.id]?.authorized) &&
      !!liveEditor?.isEditable;
    const stamp = accessGate.stamp(noteId || undefined);
    this.toolbar.current.set({
      searchScope: JSON.stringify([
        folderId,
        noteId,
        view,
        galleryEditor,
        separate,
        page,
        stamp,
        liveEditor ? this.ids.get(liveEditor) : null,
        liveEditor ? this.versions.current.get(liveEditor) || 0 : 0,
      ]),
      key: JSON.stringify([
        nativeScope,
        contentOverlay,
        stamp,
        liveEditor ? this.ids.get(liveEditor) : null,
        liveEditor ? this.versions.current.get(liveEditor) || 0 : 0,
      ]),
      context: {
        noteId,
        scope: nativeScope,
        stamp,
        editor: liveEditor,
        bookmark: liveEditor?.state.selection.getBookmark() || null,
        documentVersion: liveEditor
          ? this.versions.current.get(liveEditor) || 0
          : 0,
      },
      state: {
        ...toolbarState({
          layout: separate
            ? "independentNote"
            : attachmentBrowser
              ? "galleryBrowse"
              : view === "gallery"
                ? galleryEditor
                  ? "galleryExpanded"
                  : "galleryBrowse"
                : "threeColumn",
          sidebar,
          attachmentBrowse: attachmentBrowser,
          settings,
          folderTitle: listTitle,
          folderCount: count,
          query,
          searchAck: this.value.searchAck,
          available,
          editable,
          current,
          folders: p.actions.workspace().folders,
          editor: liveEditor,
          hasTextSelection: !!liveEditor && !liveEditor.state.selection.empty,
          textToTableAvailable: canConvertTextToTable(liveEditor),
        }),
        contentOverlay,
      },
    });
  }
  focusSearch(input: () => HTMLInputElement | null) {
    if (native && macNative) {
      const toolbar = this.toolbar.current;
      if (toolbar) void toolbar.focusSearch().catch(this.live().actions.fail);
      else this.live().actions.fail(new Error("原生搜索尚未就绪"));
      return;
    }
    setTimeout(() => {
      if (this.active) input()?.focus();
    }, 0);
  }
  assert = (context: NativeContext, editing = false, overlay = false) => {
    const p = this.live();
    const {
      noteId,
      scope: nativeScope,
      current,
      editor,
      loading,
      synchronizing,
      accessSuspended,
      modal,
      folderForm,
      draw,
      record,
      ocr,
    } = p.target;
    const { attachmentBrowser } = p.projection;
    const live = accessGate.stamp(context.noteId || undefined);
    if (
      p.target.quitting() ||
      p.actions.networkSync.frozen(context.noteId) ||
      context.scope !== nativeScope ||
      context.noteId !== noteId ||
      JSON.stringify(live) !== JSON.stringify(context.stamp) ||
      loading ||
      synchronizing ||
      accessSuspended.length ||
      accessGate.state?.operationId ||
      (context.noteId &&
        (p.target.blocked(context.noteId) ||
          accessGate.state?.suspended.includes(context.noteId))) ||
      (!overlay && (modal || folderForm || draw || record || ocr))
    )
      throw new Error("备忘录或授权状态已改变，请重新执行操作");
    if (
      editing &&
      (attachmentBrowser ||
        !current ||
        current.deletedAt ||
        !context.editor ||
        context.editor !== editor ||
        this.owners.current.get(context.editor) !== context.noteId ||
        editor.isDestroyed ||
        !editor.isEditable ||
        !context.bookmark ||
        (current.locked && !accessGate.state?.notes[current.id]?.authorized) ||
        (this.versions.current.get(editor) || 0) !== context.documentVersion)
    )
      throw new Error("编辑内容或选区已改变，请重新选择后执行操作");
  };
  selection = (context: NativeContext) => {
    this.assert(context, true);
    const target = context.editor!;
    target.view.dispatch(
      target.state.tr.setSelection(context.bookmark!.resolve(target.state.doc)),
    );
    return target;
  };
  handle = (intent: Intent, context: NativeContext, sequence: number) => {
    if (!this.active) return;
    const p = this.live();
    const { current } = p.target;
    const { settings } = p.projection;
    const {
      networkSync,
      changeSearch,
      setContextFolder,
      openModal,
      changeSidebar,
      back,
      createNote,
      shareTarget,
      openRecording,
      openAttachmentBrowser,
      setAttachmentBrowser,
      updateSettings,
      setShowFind,
      doAction,
      setContextNote,
      setNoteId,
      openOcr,
      openDrawing,
      fail,
    } = p.actions;
    if (
      networkSync.frozen(context.noteId) ||
      (intent.kind === "search" && networkSync.frozen())
    ) {
      void networkSync
        .cancel()
        .then(() => this.handle(intent, context, sequence))
        .catch(fail);
      return;
    }
    if (p.target.quitting()) return;
    if (intent.kind === "search") {
      this.update({ searchAck: sequence });
      void changeSearch({
        query: intent.phase === "cancel" ? "" : intent.value,
        searching: intent.phase !== "cancel",
        resetFilter: true,
      }).catch(fail);
      return;
    }
    if (intent.kind === "windowActivity") return;
    try {
      this.assert(context);
      const command: MenuCommand | undefined =
        intent.kind === "menu" ? intent.command : undefined;
      if (intent.kind === "action") {
        switch (intent.action) {
          case "newFolder":
            setContextFolder(null);
            openModal("newFolder");
            return;
          case "toggleSidebar":
            changeSidebar((value) => !value);
            return;
          case "backToGallery":
            back();
            return;
          case "newNote":
            void createNote(() => this.assert(context));
            return;
          case "share":
            void shareTarget(context);
            return;
          case "settings":
            openModal("settings");
            return;
          case "recordAudio":
            this.selection(context);
            openRecording(context);
            return;
          case "insertTag":
            this.selection(context).chain().focus().insertContent("#").run();
            return;
          case "checklist":
            this.selection(context).chain().focus().toggleTaskList().run();
            return;
          case "table": {
            const target = this.selection(context);
            if (!target.state.selection.empty) convertTextToTable(target);
            else
              target
                .chain()
                .focus()
                .insertTable({ rows: 2, cols: 2, withHeaderRow: false })
                .run();
            return;
          }
          default:
            throw new Error("原生菜单未提供可执行命令");
        }
      }
      switch (command) {
        case "viewAttachments":
          openAttachmentBrowser();
          return;
        case "viewGallery":
          setAttachmentBrowser(false);
          updateSettings({ view: "gallery" });
          return;
        case "viewList":
          setAttachmentBrowser(false);
          updateSettings({ view: "list" });
          return;
        case "sortDefault":
        case "sortModified":
          updateSettings({ sort: "updated" });
          return;
        case "sortCreated":
          updateSettings({ sort: "created" });
          return;
        case "sortTitle":
          updateSettings({ sort: "title" });
          return;
        case "groupByDate":
          updateSettings({ groupDates: settings.groupDates === false });
          return;
        case "findInNote":
          this.selection(context);
          setShowFind(true);
          return;
        case "moveNote": {
          this.selection(context);
          const folderId = intent.kind === "menu" ? intent.folderId : undefined;
          if (
            !folderId ||
            !p.actions
              .workspace()
              .folders.some(
                (folder) => folder.id === folderId && isPhysicalOwner(folder),
              )
          )
            throw Error("目标文件夹已不存在");
          void doAction(
            { type: "patchNote", id: context.noteId, folderId },
            () => this.assert(context, true),
          ).catch(fail);
          return;
        }
        case "pinNote":
        case "deleteNote":
        case "lockNote": {
          this.selection(context);
          const validate = () => this.assert(context, true);
          if (command === "lockNote" && !current!.locked) {
            setContextNote(null);
            openModal("lock");
            return;
          }
          const action =
            command === "pinNote"
              ? {
                  type: "patchNote",
                  id: context.noteId,
                  pinned: !current!.pinned,
                }
              : {
                  type: command === "deleteNote" ? "deleteNote" : "removeLock",
                  id: context.noteId,
                };
          void doAction(action, validate)
            .then(() => {
              if (command === "deleteNote")
                setNoteId((id) => (id === context.noteId ? null : id));
            })
            .catch(fail);
          return;
        }
        case "choosePhotoVideo":
        case "attachFile":
          this.selection(context);
          p.actions.pick(
            command === "choosePhotoVideo" ? "image/*,video/*" : "",
            context,
          );
          return;
        case "recognizeImageText":
          this.selection(context);
          openOcr(context);
          return;
        case "recordAudio":
          this.selection(context);
          openRecording(context);
          return;
        case "addSketch":
          openDrawing([], undefined, this.selection(context));
          return;
      }
      const target = this.selection(context);
      if (!command) throw new Error("原生菜单未提供可执行命令");
      target.commands.focus();
      executeEditorCommand(target, command);
    } catch (error) {
      fail(error);
    }
  };
  menu = (command: string) => {
    if (!this.active) return;
    const p = this.live();
    const { noteId, scope: nativeScope, editor } = p.target;
    const { view, attachmentBrowser } = p.projection;
    const {
      networkSync,
      setAttachmentBrowser,
      updateSettings,
      focusGlobalSearch,
      setShowFind,
      archive,
      fail,
    } = p.actions;
    if (networkSync.frozen()) {
      void networkSync
        .cancel()
        .then(() => this.menu(command))
        .catch(fail);
      return;
    }
    if (p.target.quitting()) return;
    const context: NativeContext = {
      noteId,
      scope: nativeScope,
      stamp: accessGate.stamp(noteId || undefined),
      editor,
      bookmark:
        editor && !editor.isDestroyed
          ? editor.state.selection.getBookmark()
          : null,
      documentVersion: editor ? this.versions.current.get(editor) || 0 : 0,
    };
    try {
      this.assert(context);
      switch (command) {
        case "new_note":
          this.handle({ kind: "action", action: "newNote" }, context, 0);
          break;
        case "new_folder":
          this.handle({ kind: "action", action: "newFolder" }, context, 0);
          break;
        case "sidebar":
          this.handle({ kind: "action", action: "toggleSidebar" }, context, 0);
          break;
        case "gallery":
          setAttachmentBrowser(false);
          updateSettings({ view: view === "list" ? "gallery" : "list" });
          break;
        case "search":
          focusGlobalSearch();
          break;
        case "find_in_note":
          if (attachmentBrowser) {
            focusGlobalSearch();
            break;
          }
          this.selection(context);
          setShowFind(true);
          break;
        case "export":
          void archive("export");
          break;
        case "import":
          void archive("import");
          break;
      }
    } catch (error) {
      fail(error);
    }
  };
}
export function useNativePlatform() {
  const [platform] = useState(() => new NativePlatform());
  const state = useSyncExternalStore(
    platform.subscribe,
    platform.snapshot,
    platform.snapshot,
  );
  useLayoutEffect(() => {
    platform.mount();
    return () => platform.dispose();
  }, [platform]);
  useLayoutEffect(() => platform.reconcile());
  return { platform, state };
}
