import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { SelectionBookmark, Transaction } from "@tiptap/pm/state";
import type { DrawingStroke } from "../types";
import type { RecordingPhase } from "../recording-coordinator";
import type { SessionPlatform } from "./platform";

export type CloseReason =
  | "confirm"
  | "cancel"
  | "back"
  | "escape"
  | "outside"
  | "navigation"
  | "access"
  | "sync"
  | "overlay"
  | "destroy";
export type DrawingTarget = {
  strokes: DrawingStroke[];
  pos?: number;
  editor: Editor;
  noteId: string;
  authority: string;
  bookmark: SelectionBookmark;
  originalNode?: PMNode;
  originalDocument: PMNode;
};
type Target = { noteId: string; editor: Editor; bookmark: SelectionBookmark };
export type SessionContext = {
  noteId: string | null;
  editor: Editor | null;
  mobile: boolean;
  visible: boolean;
  blocked: boolean;
  authorized: boolean;
  owner: string | null;
};
export type SessionState = {
  body: "browse" | "editing";
  formatOpen: boolean;
  drawing: DrawingTarget | null;
  menu: string | null;
  formatHeight: number;
  recording: { owner: string; desktop: boolean; visible: boolean } | null;
  indicator: { owner: string; phase: RecordingPhase } | null;
  pendingFocus: { noteId: string; generation: number } | null;
  revision: number;
  lastClose: CloseReason | null;
};

/** Owns interaction decisions; content, admission, persistence and capture
 * remain in their existing controllers. Recording is orthogonal to the panel. */
export class EditorSession {
  private state: SessionState = {
    body: "browse",
    formatOpen: false,
    drawing: null,
    menu: null,
    formatHeight: 290,
    recording: null,
    indicator: null,
    pendingFocus: null,
    revision: 0,
    lastClose: null,
  };
  private context: SessionContext = {
    noteId: null,
    editor: null,
    mobile: false,
    visible: false,
    blocked: true,
    authorized: false,
    owner: null,
  };
  private listeners = new Set<() => void>();
  private formatTarget: Target | null = null;
  private menuTarget: Target | null = null;
  private observed: Editor | null = null;
  private release: (() => void) | null = null;
  private identity: {
    noteId: string | null;
    editor: Editor | null;
    mobile: boolean;
  } | null = null;
  private active = true;
  private viewport = 0;
  private keyboardHeight = 0;
  private viewportWidth = 0;
  private keyboardInset = 0;
  generation = 0;
  constructor(private platform: SessionPlatform) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  configure(context: SessionContext) {
    this.context = context;
  }
  private commit(patch: Partial<SessionState>) {
    if (
      !Object.entries(patch).some(
        ([key, value]) => this.state[key as keyof SessionState] !== value,
      )
    )
      return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private writable(editor = this.context.editor): editor is Editor {
    const c = this.context;
    return (
      this.active &&
      !!editor &&
      c.editor === editor &&
      !!c.noteId &&
      c.owner === c.noteId &&
      c.visible &&
      !c.blocked &&
      c.authorized &&
      !editor.isDestroyed &&
      editor.isEditable &&
      editor.view.dom.isConnected
    );
  }
  private valid(target: Target | null): target is Target {
    return (
      !!target &&
      target.noteId === this.context.noteId &&
      this.writable(target.editor)
    );
  }
  mount() {
    this.active = true;
  }
  dispose() {
    this.active = false;
    this.cancelFocus();
    this.release?.();
    this.release = null;
    this.observed = null;
    this.formatTarget = null;
    this.menuTarget = null;
    this.platform.blur(this.context.editor);
  }
  reconcile() {
    const c = this.context,
      previous = this.identity;
    this.identity = { noteId: c.noteId, editor: c.editor, mobile: c.mobile };
    const creating =
      this.state.pendingFocus?.noteId === c.noteId &&
      this.state.pendingFocus?.generation === this.generation;
    if (
      previous &&
      (previous.mobile !== c.mobile ||
        (!creating &&
          (previous.noteId !== c.noteId ||
            (previous.editor && previous.editor !== c.editor))))
    )
      this.invalidate("navigation");
    if (
      (c.blocked || !c.authorized || !c.visible) &&
      (this.state.pendingFocus ||
        this.state.formatOpen ||
        this.state.drawing ||
        this.menuTarget ||
        this.state.body === "editing")
    )
      this.invalidate(c.blocked ? "access" : "navigation");
    if (this.observed !== c.editor) {
      this.release?.();
      this.observed = c.editor;
      if (c.editor && !c.editor.isDestroyed) {
        const editor = c.editor;
        const changed = ({ transaction }: { transaction: Transaction }) =>
          this.transaction(editor, transaction);
        const destroyed = () => {
          if (this.context.editor === editor) this.invalidate("destroy");
        };
        editor.on("transaction", changed);
        editor.on("destroy", destroyed);
        this.release = () => {
          editor.off("transaction", changed);
          editor.off("destroy", destroyed);
        };
      } else this.release = null;
    }
    this.admitFocus();
  }
  private transaction(editor: Editor, transaction: Transaction) {
    let captured = false;
    for (const target of [this.formatTarget, this.menuTarget]) {
      if (target?.editor !== editor) continue;
      captured = true;
      target.bookmark = transaction.selectionSet
        ? editor.state.selection.getBookmark()
        : target.bookmark.map(transaction.mapping);
    }
    // Only open controls need selection/active-format projection. Ordinary
    // typing already follows the existing content/save path in App.
    if (captured) this.commit({ revision: this.state.revision + 1 });
  }
  viewportChanged(height: number, width = this.viewportWidth, visualHeight = height) {
    if (width !== this.viewportWidth) {
      this.viewportWidth = width;
      this.viewport = height;
      this.keyboardHeight = 0;
    }
    this.viewport = Math.max(this.viewport, height);
    this.keyboardInset = Math.max(this.viewport - height, height - visualHeight);
    if (this.keyboardInset > 120) this.keyboardHeight = this.keyboardInset;
  }
  get keyboardVisible() {
    return this.keyboardInset > 120;
  }
  cancelFocus = () => {
    this.generation++;
    const pending = !!this.state.pendingFocus;
    this.commit({ pendingFocus: null });
    // Cancels Android's pending native show even when JS has no timer left.
    if (pending) this.platform.keyboard(false);
  };
  requestCreatedFocus(noteId: string, generation: number) {
    if (!this.active || generation !== this.generation) return;
    this.commit({ pendingFocus: { noteId, generation } });
  }
  private admitFocus() {
    const pending = this.state.pendingFocus;
    if (!pending) return;
    if (
      pending.generation !== this.generation ||
      (this.context.noteId && pending.noteId !== this.context.noteId)
    ) {
      this.cancelFocus();
      return;
    }
    const editor = this.context.editor;
    if (
      !this.writable(editor) ||
      this.state.drawing ||
      this.state.formatOpen ||
      this.state.menu
    )
      return;
    if (
      this.platform.focus(
        editor,
        { keyboard: this.context.mobile, atEnd: true },
        () =>
          this.writable(editor) &&
          this.state.pendingFocus === pending &&
          pending.generation === this.generation,
      )
    )
      this.commit({ pendingFocus: null, body: "editing" });
  }
  restoreAuthorizedFocus(editor: Editor, validate: () => boolean) {
    if (this.state.drawing || this.state.formatOpen || this.state.menu)
      return false;
    return this.platform.focus(
      editor,
      { keyboard: false },
      () =>
        this.active &&
        this.context.editor === editor &&
        !editor.isDestroyed &&
        editor.isEditable &&
        validate(),
    );
  }
  bodyFocus = (focused: boolean) => {
    if (focused && (!this.writable() || this.state.drawing)) return;
    this.commit({ body: focused ? "editing" : "browse" });
    if (focused && this.context.mobile && this.state.formatOpen)
      this.platform.keyboard(false);
  };
  captureBodyIntent() {
    this.cancelFocus();
    return {
      generation: this.generation,
      noteId: this.context.noteId,
      editor: this.context.editor,
    };
  }
  completeBodyIntent(intent: ReturnType<EditorSession["captureBodyIntent"]>) {
    if (
      this.active &&
      intent.generation === this.generation &&
      intent.noteId === this.context.noteId &&
      intent.editor === this.context.editor
    )
      this.browse("confirm");
  }
  browse(reason: CloseReason = "confirm") {
    this.cancelFocus();
    this.platform.blur(this.context.editor);
    this.commit({ body: "browse", lastClose: reason });
  }
  invalidate(reason: CloseReason) {
    this.cancelFocus();
    this.formatTarget = null;
    this.menuTarget = null;
    this.platform.blur(this.context.editor);
    // Recording ticket and indicator belong to capture, not navigation.
    this.commit({
      body: "browse",
      formatOpen: false,
      drawing: null,
      menu: null,
      lastClose: reason,
    });
  }
  setMenu = (
    next: string | null | ((value: string | null) => string | null),
  ) => {
    const menu = typeof next === "function" ? next(this.state.menu) : next;
    if (menu === "format") {
      this.openFormat();
      return;
    }
    if (menu) this.cancelFocus();
    this.menuTarget =
      menu && this.writable()
        ? {
            noteId: this.context.noteId!,
            editor: this.context.editor!,
            bookmark: this.context.editor!.state.selection.getBookmark(),
          }
        : null;
    this.commit({ menu });
  };
  openFormat = () => {
    if (this.state.formatOpen) {
      this.closeFormat("confirm");
      return;
    }
    if (!this.writable()) return;
    this.cancelFocus();
    const editor = this.context.editor!;
    this.formatTarget = {
      noteId: this.context.noteId!,
      editor,
      bookmark: editor.state.selection.getBookmark(),
    };
    this.menuTarget = null;
    this.commit({
      formatOpen: true,
      drawing: null,
      menu: null,
      formatHeight: Math.max(
        260,
        Math.min(380, this.keyboardHeight || this.viewport * 0.36),
      ),
    });
    if (this.context.mobile) this.platform.blur(editor);
  };
  closeFormat(reason: CloseReason) {
    const target = this.formatTarget;
    this.formatTarget = null;
    this.commit({ formatOpen: false, lastClose: reason });
    if (!this.valid(target)) return;
    target.editor.view.dispatch(
      target.editor.state.tr.setSelection(
        target.bookmark.resolve(target.editor.state.doc),
      ),
    );
    if (reason === "confirm") {
      if (
        this.platform.focus(
          target.editor,
          { keyboard: this.context.mobile },
          () => this.valid(target),
        )
      )
        this.commit({ body: "editing" });
    } else this.browse(reason);
  }
  formatCommand = (command: (editor: Editor) => unknown) => {
    const target = this.formatTarget;
    if (!this.valid(target)) return;
    target.editor.view.dispatch(
      target.editor.state.tr.setSelection(
        target.bookmark.resolve(target.editor.state.doc),
      ),
    );
    command(target.editor);
    target.bookmark = target.editor.state.selection.getBookmark();
    if (!this.context.mobile) this.closeFormat("confirm");
  };
  openDrawing(target: DrawingTarget) {
    if (target.noteId !== this.context.noteId || !this.writable(target.editor))
      return false;
    this.cancelFocus();
    this.formatTarget = null;
    this.menuTarget = null;
    this.platform.blur(target.editor);
    this.commit({
      drawing: target,
      formatOpen: false,
      menu: null,
      body: "browse",
    });
    return true;
  }
  closeDrawing(reason: CloseReason) {
    this.platform.blur(this.context.editor);
    this.commit({ drawing: null, body: "browse", lastClose: reason });
  }
  recordOpened(owner: string, desktop: boolean) {
    this.cancelFocus();
    this.setMenu(null);
    this.commit({ recording: { owner, desktop, visible: !desktop } });
    if (!desktop) this.platform.blur(this.context.editor);
  }
  recordVisibility(visible: boolean) {
    const recording = this.state.recording;
    if (recording && recording.visible !== visible)
      this.commit({ recording: { ...recording, visible } });
  }
  recordClosed(owner: string) {
    if (this.state.recording?.owner === owner)
      this.commit({
        recording: null,
        indicator:
          this.state.indicator?.owner === owner ? null : this.state.indicator,
      });
  }
  projectRecordingIndicator = (indicator: SessionState["indicator"]) => {
    const old = this.state.indicator;
    if (old?.owner === indicator?.owner && old?.phase === indicator?.phase)
      return;
    this.commit({ indicator });
  };
  inspect() {
    return {
      body: this.state.body,
      panel: this.state.drawing
        ? "drawing"
        : this.state.formatOpen
          ? "format"
          : "none",
      menu: this.state.menu,
      generation: this.generation,
      pendingFocus: this.state.pendingFocus,
      recording: this.state.recording,
      lastClose: this.state.lastClose,
      formatOwner: this.formatTarget?.noteId ?? null,
      menuOwner: this.menuTarget?.noteId ?? null,
    };
  }
}
