import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { Note, Settings, Workspace } from "../types";
import type { EditorSession } from "../editor-session/controller";
import { dismissInnermostMenu } from "../Menu";
import { projectFolders } from "../smart-folders";

export type NavigationState = {
  folderId: string;
  baseNoteId: string | null;
  searchNoteId: string | null;
  page: "folders" | "notes" | "editor";
  query: string;
  searchDraft: string | null;
  searching: boolean;
  filter: string;
  tagFilter: string | null | undefined;
  galleryEditor: boolean;
  attachmentBrowser: boolean;
  mobileCreatedEditor: string | null;
};
type Update<T> = T | ((previous: T) => T);
export type NavigationPorts = {
  workspace(): Workspace;
  blocked(): readonly string[];
  noteId: string | null;
  mobile: boolean;
  contentSearch: boolean;
  view: "list" | "gallery";
  sort: Settings["sort"];
  separate: boolean;
  sync: { frozen(): boolean; cancel(): Promise<void> };
  session: Pick<
    EditorSession,
    "invalidate" | "generation" | "requestCreatedFocus"
  >;
  clearComposition(): void;
  clearJump(): void;
  clearSwipe(): void;
  clearFind(): void;
  closeModal(): void;
  parkSmart(id: string): void;
  settings(patch: Settings): void;
  flush(): Promise<void>;
  closeWindow(): void;
  fail(error: unknown): void;
};
export type BackLayers = {
  preview: boolean;
  closePreview(): void;
  folderForm: boolean;
  cancelFolderForm(): void;
  ocr: boolean;
  cancelOcr(): void;
  modal: string | null;
  preferencesBack(): void;
  closeModal(): void;
  menu: string | null;
  format: boolean;
  drawing: boolean;
  recording: boolean;
  closeRecording(): void;
  find: boolean;
  editorFocused: boolean;
  session: Pick<
    EditorSession,
    | "setMenu"
    | "closeFormat"
    | "closeDrawing"
    | "browse"
    | "keyboardVisible"
    | "cancelFocus"
  >;
  requestExit(): void;
};
/** Owns navigation state and decisions; creation/persistence and authorization
 * remain with the root controllers. Deferred requests are latest-intent wins. */
export class Navigation {
  private value: NavigationState;
  private ports: NavigationPorts | null = null;
  private backLayers: BackLayers | null = null;
  private listeners = new Set<() => void>();
  private request = 0;
  private active = true;
  private pendingRequest: number | null = null;
  get pending() { return this.pendingRequest !== null; }
  constructor(mobile: boolean) {
    this.value = {
      folderId: mobile ? "all" : "default",
      baseNoteId: null,
      searchNoteId: null,
      page: mobile ? "notes" : "folders",
      query: "",
      searchDraft: null,
      searching: false,
      filter: "",
      tagFilter: undefined,
      galleryEditor: false,
      attachmentBrowser: false,
      mobileCreatedEditor: null,
    };
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  configure(ports: NavigationPorts) {
    this.ports = ports;
  }
  configureBack(layers: BackLayers) {
    this.backLayers = layers;
  }
  mount() {
    this.active = true;
  }
  dispose() {
    this.active = false;
    this.request++;
  }
  private live() {
    if (!this.ports) throw Error("导航尚未配置");
    return this.ports;
  }
  private patch(patch: Partial<NavigationState>) {
    if (
      !Object.entries(patch).some(
        ([key, value]) => this.value[key as keyof NavigationState] !== value,
      )
    )
      return;
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) listener();
  }
  private set<K extends keyof NavigationState>(
    key: K,
    value: Update<NavigationState[K]>,
  ) {
    this.patch({
      [key]:
        typeof value === "function"
          ? (value as (old: NavigationState[K]) => NavigationState[K])(
              this.value[key],
            )
          : value,
    });
  }
  // Trusted hydration/search/controllers use these restricted state writers;
  // user navigation goes through the decisions below, never a parallel state.
  setFolderId = (v: Update<string>) => this.set("folderId", v);
  setNoteId = (v: Update<string | null>) => this.set("baseNoteId", v);
  setSearchNoteId = (v: Update<string | null>) => this.set("searchNoteId", v);
  setPage = (v: Update<NavigationState["page"]>) => this.set("page", v);
  setQuery = (v: Update<string>) => this.set("query", v);
  setSearchDraft = (v: Update<string | null>) => this.set("searchDraft", v);
  setSearching = (v: Update<boolean>) => this.set("searching", v);
  setFilter = (v: Update<string>) => this.set("filter", v);
  setTagFilter = (v: Update<NavigationState["tagFilter"]>) =>
    this.set("tagFilter", v);
  setGalleryEditor = (v: Update<boolean>) => this.set("galleryEditor", v);
  setAttachmentBrowser = (v: Update<boolean>) =>
    this.set("attachmentBrowser", v);
  setMobileCreatedEditor = (v: Update<string | null>) =>
    this.set("mobileCreatedEditor", v);
  private run(action: (ports: NavigationPorts) => void) {
    const request = ++this.request,
      ports = this.live(),
      generation = ports.session.generation;
    this.pendingRequest = request;
    const finish = () => { if (this.pendingRequest === request) this.pendingRequest = null; };
    const execute = () => {
      if (
        !this.active ||
        request !== this.request ||
        generation !== this.live().session.generation
      ) { finish(); return; }
      try {
        action(this.live());
      } catch (error) {
        this.live().fail(error);
      } finally { finish(); }
    };
    if (ports.sync.frozen())
      void ports.sync.cancel().then(execute).catch(error => { finish(); ports.fail(error); });
    else execute();
  }
  chooseFolder = (id: string) =>
    this.run((p) => {
      if (
        !["all", "trash"].includes(id) &&
        !p.workspace().folders.some((f) => f.id === id)
      )
        throw Error("目标文件夹已不存在");
      p.session.invalidate("navigation");
      p.clearJump();
      p.clearComposition();
      if (
        p.noteId &&
        p.workspace().folders.find((f) => f.id === id)?.kind === "smart"
      )
        p.parkSmart(p.noteId);
      const first =
        projectFolders(p.workspace(), p.blocked(), p.sort).get(id)?.firstId ??
        null;
      this.patch({
        mobileCreatedEditor: null,
        tagFilter: undefined,
        galleryEditor: false,
        folderId: id,
        page: "notes",
        query: "",
        filter: "",
        searching: false,
        baseNoteId: first,
      });
      p.settings({ selectedFolder: id, selectedNote: first || "" });
    });
  chooseTag = (name: string | null) =>
    this.run((p) => {
      p.session.invalidate("navigation");
      p.clearComposition();
      this.patch({
        mobileCreatedEditor: null,
        tagFilter: name,
        filter: "",
        searchNoteId: null,
        galleryEditor: false,
        page: "notes",
      });
    });
  chooseNote = (note: Note) =>
    this.run((p) => {
      const target = p.workspace().notes.find((n) => n.id === note.id);
      if (!target) throw Error("目标备忘录已不存在");
      p.session.invalidate("navigation");
      p.clearJump();
      p.clearComposition();
      p.clearSwipe();
      p.clearFind();
      this.patch({
        attachmentBrowser: false,
        mobileCreatedEditor: null,
        ...(!p.mobile && p.view === "gallery" ? { galleryEditor: true } : {}),
        ...(p.contentSearch
          ? { searchNoteId: target.id }
          : { baseNoteId: target.id }),
        page: "editor",
      });
      if (!p.contentSearch) p.settings({ selectedNote: target.id });
    });
  openFolders = () =>
    this.run((p) => {
      p.session.invalidate("navigation");
      this.patch({
        searching: false,
        query: "",
        filter: "",
        tagFilter: undefined,
        page: "folders",
      });
    });
  back = () =>
    this.run((p) => {
      p.session.invalidate("navigation");
      if (this.value.attachmentBrowser) {
        this.patch({ attachmentBrowser: false });
        return;
      }
      p.clearFind();
      if (p.mobile) {
        if (this.value.page === "editor")
          this.patch({ page: "notes", mobileCreatedEditor: null });
        else this.chooseFolder("all");
        void p.flush().catch(p.fail);
      } else if (p.view === "gallery" && this.value.galleryEditor)
        this.patch({ galleryEditor: false });
      else if (p.separate) p.closeWindow();
      else if (this.value.page === "editor") this.patch({ page: "notes" });
      else
        this.patch({
          page: "folders",
          searching: false,
          query: "",
          filter: "",
        });
    });
  openAttachmentBrowser = () =>
    this.run((p) => {
      if (p.separate) return;
      p.session.invalidate("navigation");
      p.clearJump();
      p.closeModal();
      this.patch({ attachmentBrowser: true, page: "notes" });
    });
  revealAttachment(owner: Note) {
    const p = this.live();
    p.session.invalidate("navigation");
    p.clearComposition();
    p.clearJump();
    p.clearFind();
    this.patch({
      mobileCreatedEditor: null,
      query: "",
      searchDraft: null,
      filter: "",
      tagFilter: undefined,
      searchNoteId: null,
      searching: false,
      folderId: owner.folderId,
      baseNoteId: owner.id,
      page: "editor",
      galleryEditor: p.view === "gallery",
      attachmentBrowser: false,
    });
    p.settings({ selectedFolder: owner.folderId, selectedNote: owner.id });
  }
  androidBack = () =>
    this.run((p) => {
      const layers = this.backLayers;
      if (!layers) throw Error("返回层尚未配置");
      if (layers.preview) layers.closePreview();
      else if (layers.folderForm) layers.cancelFolderForm();
      else if (layers.ocr) layers.cancelOcr();
      else if (layers.modal === "preferences") layers.preferencesBack();
      else if (layers.modal) layers.closeModal();
      else if (dismissInnermostMenu()) return;
      else if (layers.menu) layers.session.setMenu(null);
      else if (layers.format) layers.session.closeFormat("back");
      else if (layers.drawing) layers.session.closeDrawing("cancel");
      else if (layers.recording) layers.closeRecording();
      else if (layers.find) p.clearFind();
      else if (this.value.searching)
        this.patch({ searching: false, query: "" });
      else if (layers.editorFocused && layers.session.keyboardVisible)
        layers.session.browse("back");
      else if (
        p.mobile
          ? this.value.page !== "notes" || this.value.folderId !== "all"
          : this.value.page !== "folders"
      )
        this.back();
      else {
        layers.session.cancelFocus();
        layers.requestExit();
      }
    });
  adoptCreated(
    note: Note,
    receipt: { source: string; folderId: string; generation: number },
  ) {
    const p = this.live();
    if (!this.active || receipt.generation !== p.session.generation)
      return false;
    p.clearComposition();
    p.clearJump();
    const folderId = p.mobile ? receipt.source : receipt.folderId;
    this.patch({
      attachmentBrowser: false,
      tagFilter: undefined,
      folderId,
      mobileCreatedEditor: p.mobile ? note.id : null,
      searchNoteId: null,
      filter: "",
      baseNoteId: note.id,
      page: "editor",
      galleryEditor: true,
      query: "",
      searching: false,
    });
    p.settings({ selectedFolder: folderId, selectedNote: note.id });
    p.session.requestCreatedFocus(note.id, receipt.generation);
    return true;
  }
}
export function useNavigation(mobile: boolean) {
  const [navigation] = useState(() => new Navigation(mobile));
  const state = useSyncExternalStore(
    navigation.subscribe,
    navigation.snapshot,
    navigation.snapshot,
  );
  useLayoutEffect(() => {
    navigation.mount();
    return () => navigation.dispose();
  }, [navigation]);
  return { navigation, state };
}
