import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { type Editor, type JSONContent } from "@tiptap/react";
import { SaveRevisions } from "./save-revisions";
import { exit, onBackButtonPress } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  MoreHorizontal,
  SquarePen,
  FolderPlus,
  PanelLeft,
  Folder,
  FolderOpen,
  StickyNote,
  Trash2,
  Pin,
  CheckCheck,
  Table2,
  Paperclip,
  Share,
  Undo2,
  Redo2,
  PenTool,
  Check,
  List,
  ListOrdered,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Lock,
  Grid2X2,
  FileText,
  Mic,
  Image,
  Camera,
  ScanText,
  ScanLine,
  Sun,
  Moon,
  Highlighter,
  Copy,
  ArrowDownToLine,
  ArrowUpFromLine,
  Pause,
  Play,
  StopCircle,
  Eraser,
  Settings as SettingsIcon,
  Volume2,
  Hash,
  NotebookPen,
  ListMinus,
  IndentIncrease,
  IndentDecrease,
  Quote,
} from "lucide-react";
import {
  action,
  loadWorkspace,
  native,
  storeAttachment,
  readNoteText,
  exportArchive,
  importArchive,
  registerSaveIntent,
  acknowledgeAccess,
  subscribeAccess,
  invalidateAccessRequests,
  accessGate,
} from "./bridge";
import {
  NativeToolbar,
  nativeToolbarTransport,
  macNative,
  type Intent,
  type MenuCommand,
} from "./native-toolbar";
import { toolbarState } from "./native-toolbar-state";
import type { BindingInfo } from "../plugins/tauri-plugin-notes-ui/guest-js";
import type { AccessStamp } from "./access-client";
import NoteEditor from "./Editor";
import { documentsEqual } from "./document-equality";
import { RecordingSession, createRecordingPreview } from "./recording-session";
import { convertTableToText, toggleListStyle } from "./editor-actions";
import type { SelectionBookmark } from "@tiptap/pm/state";
import {
  documentText,
  type DrawingStroke,
  type Folder as FolderData,
  type Note,
  type Settings,
  type Workspace,
  type AccessEvent,
  blankDoc,
} from "./types";

const empty: Workspace = {
  folders: [],
  notes: [],
  attachments: [],
  settings: {},
};
const fmtDate = (t: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(t);
const errText = (e: unknown): string =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);
interface NativeContext {
  noteId: string | null;
  scope: string;
  stamp: AccessStamp;
  editor: Editor | null;
  bookmark: SelectionBookmark | null;
  documentVersion: number;
}
function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-button ${active ? "active" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function MenuRow({
  children,
  icon,
  onClick,
  danger = false,
  checked = false,
  disabled = false,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`menu-row ${danger ? "danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="menu-label">{children}</span>
      <span className="menu-icon">{checked ? <Check size={17} /> : icon}</span>
    </button>
  );
}
function App() {
  const separate = new URLSearchParams(location.search).get("note");
  const [ws, setWs] = useState<Workspace>(empty);
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState("default");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [page, setPage] = useState<"folders" | "notes" | "editor">("folders");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [contextNote, setContextNote] = useState<string | null>(null);
  const [contextFolder, setContextFolder] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editing, setEditing] = useState(false);
  const [galleryEditor, setGalleryEditor] = useState(false);
  const [, updateFormatState] = useState(0);
  const [formatHeight, setFormatHeight] = useState(290);
  const formatTarget = useRef<{
    noteId: string;
    editor: Editor;
    bookmark: SelectionBookmark;
  } | null>(null);
  const paperTarget = useRef<{
    noteId: string;
    editor: Editor;
    bookmark: SelectionBookmark;
    editable: boolean;
  } | null>(null);
  const viewportHeight = useRef(window.innerHeight);
  const keyboardHeight = useRef(0);
  const [sidebar, setSidebar] = useState(true);
  const nativeToolbar = useRef<NativeToolbar<NativeContext> | null>(null);
  const [nativeInfo, setNativeInfo] = useState<BindingInfo | null>(null);
  const [nativeSearchAck, setNativeSearchAck] = useState(0);
  const nativeMenuHandler = useRef<(command: string) => void>(() => {});
  const nativeHandler = useRef<
    (intent: Intent, context: NativeContext, sequence: number) => void
  >(() => {});
  const nativeDocumentVersions = useRef(new WeakMap<Editor, number>());
  const nativeEditorIds = useRef(new WeakMap<Editor, number>());
  const nativeEditorOwners = useRef(new WeakMap<Editor, string>());
  const nativeEditorCounter = useRef(0);
  const nativeAttachmentTarget = useRef<NativeContext | null>(null);
  const nativeAssert = useRef<
    (context: NativeContext, editing?: boolean, overlay?: boolean) => void
  >(() => {});
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState(0);
  const unlocked = new Set(
    ws.notes
      .filter((n) => !n.locked || ws.access?.notes[n.id]?.authorized)
      .map((n) => n.id),
  );
  const [accessSuspended, setAccessSuspended] = useState<string[]>([]);
  const [synchronizing, setSynchronizing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const blockedNotes = useRef(new Set<string>());
  const saveFailures = useRef(new Map<string, unknown>());
  const accessHandler = useRef<(event: AccessEvent) => void>(() => {});
  const clearSensitive = useRef<(ids: string[]) => void>(() => {});
  const synchronizeRef = useRef<() => Promise<void>>(async () => {});
  const synchronization = useRef<Promise<void> | null>(null);
  const syncSequence = useRef(0);
  const initializedSelection = useRef(false);
  const barrierEditor = useRef<{ editor: Editor; editable: boolean } | null>(
    null,
  );
  const [find, setFind] = useState("");
  const [showFind, setShowFind] = useState(false);
  const [notice, setNotice] = useState("");
  const [draw, setDraw] = useState<{
    strokes: DrawingStroke[];
    pos?: number;
  } | null>(null);
  const [record, setRecord] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 700 && !separate);
  const queues = useRef(new Map<string, Promise<unknown>>());
  const revisions = useRef(new SaveRevisions());
  const externalVersions = useRef(new Map<string, number>());
  const pendingDocs = useRef(new Map<string, JSONContent>());
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = ws.notes.find((n) => n.id === noteId);
  const currentFolder = ws.folders.find((f) => f.id === folderId);
  const selected = ws.notes.find((n) => n.id === (contextNote || noteId));
  const theme = settings.theme || "system";
  const view = settings.view || "list";
  const sort = settings.sort || "updated";
  const onReady = useCallback(
    (e: Editor | null) => {
      if (e && noteId) nativeEditorOwners.current.set(e, noteId);
      setEditor(e);
    },
    [noteId],
  );
  const fail = useCallback((e: unknown) => setError(errText(e)), []);
  const hydrate = useCallback((data: Workspace) => {
    const previous = wsRef.current;
    const changed = previous.notes
      .filter(
        (n) =>
          previous.access &&
          data.access &&
          (previous.access.sessionId !== data.access.sessionId ||
            previous.access.notes[n.id]?.epoch !==
              data.access.notes[n.id]?.epoch),
      )
      .map((n) => n.id);
    if (changed.length) clearSensitive.current(changed);
    const notes = data.notes.map((n) => {
      const pending = pendingDocs.current.get(n.id);
      revisions.current.observe(n.id, n.revision, !!pending);
      const old = previous.notes.find((old) => old.id === n.id);
      if (
        !pending &&
        old &&
        !documentsEqual(old.document, n.document)
      )
        externalVersions.current.set(
          n.id,
          (externalVersions.current.get(n.id) || 0) + 1,
        );
      if (
        !pending ||
        changed.includes(n.id) ||
        !data.access?.notes[n.id]?.authorized
      )
        return n;
      const text = documentText(pending);
      return {
        ...n,
        document: pending,
        plainText: text,
        title: text.split("\n")[0] || "新备忘录",
      };
    });
    const next = { ...data, notes };
    wsRef.current = next;
    setWs(next);
    setSettings(data.settings);
  }, []);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await subscribeAccess((event) => accessHandler.current(event));
      if (disposed) {
        unlisten();
        return;
      }
      await synchronizeRef.current();
    })()
      .catch(fail)
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [hydrate, fail, separate]);
  useEffect(() => {
    const resize = () => {
      setMobile(window.innerWidth < 700 && !separate);
      viewportHeight.current = Math.max(
        viewportHeight.current,
        window.innerHeight,
      );
      const difference = viewportHeight.current - window.innerHeight;
      if (difference > 120) keyboardHeight.current = difference;
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches),
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const flush = useCallback(async () => {
    await Promise.all([...queues.current.values()]);
    if (pendingDocs.current.size || saveFailures.current.size)
      throw Error(
        "还有未确认保存的更改；锁定未执行，请保持窗口打开并重试编辑保存。",
      );
  }, []);
  const refresh = useCallback(async () => {
    await flush();
    hydrate(await loadWorkspace());
  }, [flush, hydrate]);
  const doAction = useCallback(
    async (a: Record<string, unknown>, validate?: () => void) => {
      await flush();
      validate?.();
      const result = await action(a);
      if (result && typeof result === "object" && "notes" in result)
        hydrate(result as Workspace);
      else await refresh();
      return result;
    },
    [flush, hydrate, refresh],
  );
  const updateSettings = useCallback(
    (patch: Settings) => {
      if (patch.view) setGalleryEditor(false);
      setSettings((prev) => ({ ...prev, ...patch }));
      setWs((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
      action({ type: "settings", settings: patch }).catch(fail);
    },
    [fail],
  );
  const saveDoc = useCallback(
    (id: string, doc: JSONContent) => {
      if (blockedNotes.current.has(id)) {
        fail(Error("备忘录正在同步锁定状态"));
        return;
      }
      const ticket = registerSaveIntent(id);
      void ticket.catch(() => {}); // The queued save handles and retains registration failures.
      pendingDocs.current.set(id, doc);
      const text = documentText(doc);
      setWs((prev) => ({
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === id
            ? {
                ...n,
                document: doc,
                plainText: text,
                title: text.split("\n")[0] || "新备忘录",
                updatedAt: Date.now(),
              }
            : n,
        ),
      }));
      setSaving((v) => v + 1);
      const previous = queues.current.get(id) || Promise.resolve();
      const next = previous
        .then(async () => {
          const n = await action<Note>({
            type: "saveNote",
            id,
            saveIntent: await ticket,
            document: doc,
            revision: revisions.current.expected(id),
          });
          revisions.current.confirmed(id, n.revision);
          if (pendingDocs.current.get(id) === doc) {
            pendingDocs.current.delete(id);
            saveFailures.current.delete(id);
          }
          setWs((prev) => ({
            ...prev,
            notes: prev.notes.map((old) =>
              old.id === id ? { ...old, revision: n.revision } : old,
            ),
          }));
        })
        .catch((e) => {
          saveFailures.current.set(id, e);
          if ((e as { code?: string }).code === "conflict")
            setError(
              "其他窗口已保存新的内容。本窗口更改仍保留，重试不会覆盖已保存版本。普通无附件的备忘录可另存为新备忘录。",
            );
          else fail(e);
        })
        .finally(() => setSaving((v) => Math.max(0, v - 1)));
      queues.current.set(id, next);
    },
    [fail],
  );
  const saveConflictCopy = async () => {
    const id = noteId;
    if (!id || blockedNotes.current.has(id)) return;
    const frozen = editor && !editor.isDestroyed ? editor : null;
    const editable = frozen?.isEditable;
    blockedNotes.current.add(id);
    frozen?.setEditable(false, false);
    setSaving((v) => v + 1);
    let copyConfirmed = false;
    try {
      await queues.current.get(id);
      const doc = pendingDocs.current.get(id);
      const source = wsRef.current.notes.find((n) => n.id === id);
      if (
        !doc ||
        !source ||
        (saveFailures.current.get(id) as { code?: string })?.code !== "conflict"
      )
        throw Error("没有可另存的冲突内容");
      if (
        source.locked ||
        wsRef.current.attachments.some((a) => a.noteId === id)
      )
        throw Error(
          "锁定或含附件的备忘录暂不能另存冲突副本。未保存内容仍保留，请保持此窗口打开。",
        );
      const copy = await action<Note>({
        type: "recoverConflictCopy",
        id,
        revision: revisions.current.expected(id),
        document: doc,
      });
      copyConfirmed = true;
      const data = await loadWorkspace();
      // Only a confirmed, durable new note releases the original pending body.
      if (pendingDocs.current.get(id) === doc) {
        pendingDocs.current.delete(id);
        saveFailures.current.delete(id);
      }
      revisions.current.confirmed(copy.id, copy.revision);
      hydrate(data);
      setNoteId(copy.id);
      setGalleryEditor(true);
      setPage("editor");
      setError("");
      setNotice(
        "本窗口内容已另存为新备忘录，原备忘录保留其他窗口的已保存内容。",
      );
    } catch (e) {
      if (copyConfirmed)
        setError(
          "副本已经保存，但列表同步失败。本窗口内容仍保留，请先重试同步并核对新备忘录。",
        );
      else fail(e);
    } finally {
      blockedNotes.current.delete(id);
      if (frozen && !frozen.isDestroyed && editable !== undefined)
        frozen.setEditable(editable, false);
      setSaving((v) => Math.max(0, v - 1));
    }
  };
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        flush().catch(fail);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    let unlisten: (() => void) | undefined;
    if (native)
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (pendingDocs.current.size) {
            event.preventDefault();
            try {
              await flush();
              if (!pendingDocs.current.size) await getCurrentWindow().destroy();
            } catch (e) {
              fail(e);
            }
          }
        })
        .then((fn) => (unlisten = fn));
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      unlisten?.();
    };
  }, [flush, fail]);
  clearSensitive.current = (ids) => {
    if (!ids.length) return;
    nativeToolbar.current?.invalidate((context) => {
      context.editor = null;
      context.bookmark = null;
    });
    nativeAttachmentTarget.current = null;
    if (noteId && ids.includes(noteId)) {
      if (editor && !editor.isDestroyed) editor.destroy();
      barrierEditor.current = null;
      formatTarget.current = null;
      paperTarget.current = null;
      setMenu(null);
      setModal(null);
      setModalValue("");
      setDraw(null);
      setRecord(false);
      setEditing(false);
      setShowFind(false);
      setFind("");
    }
    setQuery("");
    setSearching(false);
    setContextNote(null);
  };
  synchronizeRef.current = () => {
    syncSequence.current++;
    invalidateAccessRequests();
    setSynchronizing(true);
    setSyncError("");
    if (synchronization.current) return synchronization.current;
    const task = (async () => {
      for (;;) {
        const sequence = syncSequence.current;
        try {
          const data = await loadWorkspace();
          if (sequence !== syncSequence.current) continue;
          hydrate(data);
          if (!initializedSelection.current) {
            initializedSelection.current = true;
            setFolderId(String(data.settings.selectedFolder || "default"));
            const selectedId =
              separate || String(data.settings.selectedNote || "");
            if (data.notes.some((n) => n.id === selectedId)) {
              setNoteId(selectedId);
              if (separate) setPage("editor");
            }
          }
          blockedNotes.current = new Set(data.access?.suspended || []);
          setAccessSuspended([...blockedNotes.current]);
          setSynchronizing(false);
          return;
        } catch (e) {
          if (sequence !== syncSequence.current) continue;
          fail(e);
          setSyncError(errText(e));
          return; // Keep cached content covered until a trusted retry succeeds.
        }
      }
    })().finally(() => {
      synchronization.current = null;
    });
    synchronization.current = task;
    return task;
  };
  accessHandler.current = (event) => {
    if (event.phase === "prepare") {
      blockedNotes.current = new Set(event.noteIds);
      setAccessSuspended(event.noteIds);
      if (
        noteId &&
        blockedNotes.current.has(noteId) &&
        editor &&
        !editor.isDestroyed
      ) {
        barrierEditor.current = { editor, editable: editor.isEditable };
        editor.setEditable(false, false);
      }
      void (async () => {
        let success = false;
        try {
          await flush();
          success = !pendingDocs.current.size && !saveFailures.current.size;
        } catch (e) {
          fail(e);
        }
        try {
          await acknowledgeAccess(event.operationId, success);
        } catch (e) {
          fail(e);
        }
      })();
      return;
    }
    if (event.phase === "abort") {
      blockedNotes.current.clear();
      setAccessSuspended([]);
      const frozen = barrierEditor.current;
      if (frozen && !frozen.editor.isDestroyed)
        frozen.editor.setEditable(frozen.editable, false);
      barrierEditor.current = null;
      setWs((prev) => ({ ...prev, access: event.access }));
      fail(Error("锁定未执行：请检查所有窗口是否有未保存的更改，再重试。"));
      void synchronizeRef.current();
      return;
    }
    clearSensitive.current(event.noteIds);
    setWs((prev) => ({
      ...prev,
      access: event.access,
      notes: prev.notes.map((n) =>
        event.noteIds.includes(n.id)
          ? { ...n, document: structuredClone(blankDoc), plainText: "" }
          : n,
      ),
    }));
    void synchronizeRef.current();
  };
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible") void synchronizeRef.current();
    };
    document.addEventListener("visibilitychange", visible);
    let unlisten: (() => void) | undefined;
    if (native)
      getCurrentWindow()
        .onFocusChanged(({ payload }) => {
          if (payload) void synchronizeRef.current();
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(fail);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      unlisten?.();
    };
  }, [fail]);
  const keyboard = (show: boolean) => {
    const api = (
      window as unknown as {
        NotesKeyboard?: { show: () => void; hide: () => void };
      }
    ).NotesKeyboard;
    if (show) api?.show();
    else api?.hide();
  };
  const closeFormat = (restoreKeyboard = false) => {
    const target = formatTarget.current;
    setMenu(null);
    if (target && target.noteId === noteId && target.editor === editor) {
      editor.view.dispatch(
        editor.state.tr.setSelection(target.bookmark.resolve(editor.state.doc)),
      );
      if (restoreKeyboard) {
        editor.commands.focus(undefined, { scrollIntoView: false });
        keyboard(true);
        setEditing(true);
      } else {
        editor.commands.blur();
        keyboard(false);
        setEditing(false);
      }
    }
    formatTarget.current = null;
  };
  const closePaper = () => {
    const target = paperTarget.current;
    paperTarget.current = null;
    setModal(null);
    if (target && !target.editor.isDestroyed) {
      target.editor.setEditable(target.editable, false);
      if (target.noteId === noteId && target.editor === editor)
        target.editor.view.dispatch(
          target.editor.state.tr.setSelection(
            target.bookmark.resolve(target.editor.state.doc),
          ),
        );
      target.editor.view.dom.blur();
      keyboard(false);
      setEditing(false);
    }
  };
  const openFormat = () => {
    if (!editor || !noteId) return;
    if (menu === "format") {
      closeFormat(mobile);
      return;
    }
    formatTarget.current = {
      noteId,
      editor,
      bookmark: editor.state.selection.getBookmark(),
    };
    setFormatHeight(
      Math.max(
        260,
        Math.min(380, keyboardHeight.current || viewportHeight.current * 0.36),
      ),
    );
    setMenu("format");
    if (mobile) {
      editor.commands.blur();
      keyboard(false);
    }
  };
  const formatCommand = (command: (e: Editor) => unknown) => {
    const target = formatTarget.current;
    if (!target || target.noteId !== noteId || target.editor !== editor) return;
    editor.view.dispatch(
      editor.state.tr.setSelection(target.bookmark.resolve(editor.state.doc)),
    );
    command(editor);
    target.bookmark = editor.state.selection.getBookmark();
    updateFormatState((v) => v + 1);
    if (!mobile) {
      setMenu(null);
      formatTarget.current = null;
      editor.commands.focus(undefined, { scrollIntoView: false });
    }
  };
  useEffect(() => {
    if (!editor) return;
    const changed = ({
      transaction,
    }: {
      transaction: import("@tiptap/pm/state").Transaction;
    }) => {
      if (transaction.docChanged)
        nativeDocumentVersions.current.set(
          editor,
          (nativeDocumentVersions.current.get(editor) || 0) + 1,
        );
      for (const target of [formatTarget.current, paperTarget.current])
        if (target && target.editor === editor && target.noteId === noteId)
          target.bookmark = target.bookmark.map(transaction.mapping);
      updateFormatState((v) => v + 1);
    };
    editor.on("transaction", changed);
    return () => {
      editor.off("transaction", changed);
    };
  }, [editor, noteId]);
  useEffect(() => {
    formatTarget.current = null;
    setMenu((value) => (value === "format" ? null : value));
    const target = paperTarget.current;
    if (target && target.noteId !== noteId) {
      if (!target.editor.isDestroyed)
        target.editor.setEditable(target.editable, false);
      paperTarget.current = null;
      setModal((value) => (value === "paper" ? null : value));
    }
  }, [noteId]);
  const chooseFolder = (id: string) => {
    setGalleryEditor(false);
    setFolderId(id);
    setPage("notes");
    setQuery("");
    setFilter("");
    setSearching(false);
    setMenu(null);
    const n = ws.notes.find((n) => n.folderId === id);
    setNoteId(n?.id || null);
    updateSettings({ selectedFolder: id, selectedNote: n?.id || "" });
  };
  const chooseNote = (n: Note) => {
    if (!mobile && view === "gallery") setGalleryEditor(true);
    setNoteId(n.id);
    setPage("editor");
    setMenu(null);
    setSwiped(null);
    setShowFind(false);
    setEditing(false);
    updateSettings({ selectedNote: n.id });
  };
  const createNote = useCallback(
    async (validate?: () => void) => {
      try {
        await flush();
        validate?.();
        const fid =
          folderId === "all" || folderId === "trash" ? "default" : folderId;
        const n = await action<Note & Pick<Workspace, "access">>({
          type: "createNote",
          folderId: fid,
        });
        revisions.current.confirmed(n.id, n.revision);
        // Native action has already accepted this response through AccessGate.
        // Keep its new note epoch with the note, before the first refresh.
        setWs((prev) => ({
          ...prev,
          access: n.access ?? prev.access,
          notes: [n, ...prev.notes],
        }));
        setNoteId(n.id);
        setPage("editor");
        setGalleryEditor(true);
        setMenu(null);
        setQuery("");
        setSearching(false);
        setEditing(true);
        updateSettings({ selectedNote: n.id });
        setTimeout(
          () => document.querySelector<HTMLElement>(".tiptap")?.focus(),
          100,
        );
      } catch (e) {
        fail(e);
      }
    },
    [fail, flush, folderId, updateSettings],
  );
  const newNote = useCallback(() => createNote(), [createNote]);
  const openModal = (type: string, value = "") => {
    if (type === "paper" && mobile && editor && noteId) {
      paperTarget.current = {
        noteId,
        editor,
        bookmark: editor.state.selection.getBookmark(),
        editable: editor.isEditable,
      };
      // Android Back can hide the IME while leaving contenteditable focused.
      // Freeze and blur synchronously before presenting this full-page picker.
      editor.view.dom.blur();
      editor.setEditable(false, false);
      keyboard(false);
      setEditing(false);
    }
    setModal(type);
    setModalValue(value);
    setMenu(null);
  };
  const back = () => {
    setMenu(null);
    setEditing(false);
    setShowFind(false);
    if (!mobile && view === "gallery" && galleryEditor) setGalleryEditor(false);
    else if (separate && native) getCurrentWindow().close();
    else if (page === "editor") setPage("notes");
    else {
      setPage("folders");
      setSearching(false);
      setQuery("");
      setFilter("");
    }
  };
  const androidBack = useRef<() => void>(() => {});
  androidBack.current = () => {
    if (modal === "paper") closePaper();
    else if (modal) setModal(null);
    else if (menu === "format") closeFormat(false);
    else if (menu) setMenu(null);
    else if (draw) setDraw(null);
    else if (record) setRecord(false);
    else if (showFind) setShowFind(false);
    else if (searching) {
      setSearching(false);
      setQuery("");
    } else if (
      editor?.isFocused &&
      viewportHeight.current - window.innerHeight > 120
    ) {
      editor.commands.blur();
      keyboard(false);
      setEditing(false);
    } else if (page !== "folders") back();
    else {
      flush()
        .then(() => {
          if (!pendingDocs.current.size) void exit(0);
          else setError("还有未保存的更改，请重试保存。");
        })
        .catch(fail);
    }
  };
  useEffect(() => {
    if (!native || !/Android/i.test(navigator.userAgent)) return;
    let disposed = false;
    let unregister: (() => Promise<void>) | undefined;
    onBackButtonPress(() => androidBack.current())
      .then((listener) => {
        if (disposed) void listener.unregister();
        else unregister = () => listener.unregister();
      })
      .catch(fail);
    return () => {
      disposed = true;
      void unregister?.();
    };
  }, [fail]);
  const patch = async (a: Record<string, unknown>) => {
    try {
      await doAction(a);
      setMenu(null);
    } catch (e) {
      fail(e);
    }
  };
  const archive = useCallback(
    async (mode: "export" | "import") => {
      setMenu(null);
      try {
        if (!native) {
          setNotice("请在已安装的 Mac 或 Android 应用中导入、导出本地备份。");
          return;
        }
        await flush();
        const path =
          mode === "export"
            ? await save({
                defaultPath: `备忘录-${new Date().toISOString().slice(0, 10)}.notesbackup`,
                filters: [{ name: "备忘录备份", extensions: ["notesbackup"] }],
              })
            : await open({
                multiple: false,
                filters: [{ name: "备忘录备份", extensions: ["notesbackup"] }],
              });
        if (typeof path !== "string") return;
        if (mode === "export") {
          await exportArchive(path);
          setNotice("本地备份已导出");
        } else {
          const data = await importArchive(path);
          hydrate(data);
          setNotice("本地备份已导入");
        }
      } catch (e) {
        fail(e);
      }
    },
    [flush, hydrate, fail],
  );
  const openSeparate = async (n: Note) => {
    if (!native) {
      chooseNote(n);
      return;
    }
    try {
      await flush();
      new WebviewWindow(`note-${Date.now()}`, {
        url: `index.html?note=${n.id}`,
        title: n.title,
        width: 640,
        height: 600,
        titleBarStyle: "overlay",
        hiddenTitle: true,
      });
    } catch (e) {
      fail(e);
    }
  };
  const focusGlobalSearch = useCallback(() => {
    setSearching(true);
    if (native && macNative) {
      const toolbar = nativeToolbar.current;
      if (toolbar) void toolbar.focusSearch().catch(fail);
      else fail(new Error("原生搜索尚未就绪"));
    } else setTimeout(() => searchInput.current?.focus(), 0);
  }, [fail]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // AppKit menu accelerators also work while NSSearchField owns first responder.
      if (
        native &&
        macNative &&
        (e.metaKey || e.ctrlKey) &&
        ["n", "f"].includes(e.key.toLowerCase())
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        newNote();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        focusGlobalSearch();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        if (page === "editor" || !mobile) {
          setShowFind(true);
        } else {
          setSearching(true);
          searchInput.current?.focus();
        }
      }
      if (e.key === "Escape") {
        if (modal === "paper") closePaper();
        else if (modal) setModal(null);
        else if (menu) setMenu(null);
        else if (showFind) setShowFind(false);
        else if (searching) {
          setSearching(false);
          setQuery("");
        } else if (mobile && page !== "folders") back();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    newNote,
    page,
    mobile,
    modal,
    menu,
    showFind,
    searching,
    focusGlobalSearch,
  ]);
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .listen<string>("menu-action", (e) => {
        if (native && macNative) {
          nativeMenuHandler.current(e.payload);
          return;
        }
        switch (e.payload) {
          case "new_note":
            newNote();
            break;
          case "new_folder":
            openModal("newFolder");
            break;
          case "sidebar":
            setSidebar((v) => !v);
            break;
          case "gallery":
            updateSettings({ view: view === "list" ? "gallery" : "list" });
            break;
          case "search":
            focusGlobalSearch();
            break;
          case "find_in_note":
            setShowFind(true);
            break;
          case "export":
            archive("export");
            break;
          case "import":
            archive("import");
            break;
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(fail);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [newNote, view, updateSettings, archive, focusGlobalSearch, fail]);
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setDraw({ strokes: d.strokes, pos: d.pos });
    };
    window.addEventListener("edit-drawing", handler);
    return () => window.removeEventListener("edit-drawing", handler);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  const fileSelected = async (files: FileList | null) => {
    const target = nativeAttachmentTarget.current;
    nativeAttachmentTarget.current = null;
    if (!files || !current || !editor) return;
    try {
      if (target) nativeAssert.current(target, true);
      for (const file of Array.from(files)) {
        const a = await storeAttachment(target?.noteId || current.id, file);
        if (target) {
          nativeAssert.current(target, true);
          editor.view.dispatch(
            editor.state.tr.setSelection(
              target.bookmark!.resolve(editor.state.doc),
            ),
          );
        }
        editor
          .chain()
          .focus()
          .insertContent({
            type: "attachment",
            attrs: { id: a.id, name: a.displayName, kind: a.kind },
          })
          .run();
        if (target) {
          target.bookmark = editor.state.selection.getBookmark();
          target.documentVersion =
            nativeDocumentVersions.current.get(editor) || 0;
        }
      }
      await refresh();
      setMenu(null);
    } catch (e) {
      fail(e);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  };
  const shareTarget = async (target?: NativeContext) => {
    setMenu(null);
    if (!current) return;
    try {
      await flush();
      if (target) nativeAssert.current(target, true);
      const data = await readNoteText(target?.noteId || current.id);
      if (target) nativeAssert.current(target, true);
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.text);
        setNotice("备忘录已复制，可粘贴分享。");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) fail(e);
    }
  };
  const shareNote = () => shareTarget();
  const findNext = () => {
    if (!editor || !find) return;
    const text = editor.state.doc.textBetween(
      0,
      editor.state.doc.content.size,
      "\n",
    );
    const from = editor.state.selection.to;
    let pos = text.toLocaleLowerCase().indexOf(find.toLocaleLowerCase(), from);
    if (pos < 0)
      pos = text.toLocaleLowerCase().indexOf(find.toLocaleLowerCase());
    if (pos < 0) {
      setNotice("未找到匹配文字");
      return;
    }
    let index = 0,
      match = -1;
    editor.state.doc.descendants((node, p) => {
      if (node.isText && match < 0) {
        const start = text
          .toLocaleLowerCase()
          .indexOf((node.text || "").toLocaleLowerCase(), index);
        if (start <= pos && start + (node.text?.length || 0) >= pos) {
          match = p + pos - start;
        }
        index = start + (node.text?.length || 0);
      }
    });
    if (match >= 0)
      editor
        .chain()
        .focus()
        .setTextSelection({ from: match, to: match + find.length })
        .run();
  };
  const listed = ws.notes
    .filter((n) => {
      if (query || filter) {
        if (n.deletedAt) return false;
      } else if (folderId === "all") {
        if (n.deletedAt) return false;
      } else if (n.folderId !== folderId) return false;
      if (
        query &&
        !`${n.title}\n${n.plainText}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())
      )
        return false;
      if (filter === "locked" && !n.locked) return false;
      if (
        filter === "checklist" &&
        !JSON.stringify(n.document).includes("taskItem")
      )
        return false;
      if (filter === "tags" && !n.plainText.includes("#")) return false;
      if (
        ["audio", "image", "file", "video"].includes(filter) &&
        !ws.attachments.some((a) => a.noteId === n.id && a.kind === filter)
      )
        return false;
      return true;
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (sort === "title"
          ? a.title.localeCompare(b.title, "zh")
          : sort === "created"
            ? b.createdAt - a.createdAt
            : b.updatedAt - a.updatedAt),
    );
  const groupName = (n: Note) => {
    if (n.pinned) return "置顶";
    if (settings.groupDates === false) return "";
    const date = new Date(n.updatedAt),
      today = new Date();
    today.setHours(0, 0, 0, 0);
    const days =
      (today.getTime() -
        new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
        ).getTime()) /
      86400000;
    return days === 0
      ? "今天"
      : days === 1
        ? "昨天"
        : days < 7
          ? "过去7天"
          : days < 30
            ? "过去30天"
            : `${date.getFullYear()}年${date.getMonth() + 1}月`;
  };
  const count = (id: string) =>
    id === "all"
      ? ws.notes.filter((n) => !n.deletedAt).length
      : ws.notes.filter((n) => n.folderId === id).length;
  const folderLabel =
    folderId === "all" ? "全部备忘录" : currentFolder?.name || "备忘录";
  const startLong = (callback: () => void) => {
    longPress.current = setTimeout(callback, 520);
  };
  const stopLong = () => {
    if (longPress.current) clearTimeout(longPress.current);
  };
  const folderRow = (f: FolderData, depth = 0) => (
    <div key={f.id}>
      <button
        className={`folder-row ${folderId === f.id ? "selected" : ""}`}
        style={{ paddingLeft: mobile ? 16 : 16 + depth * 14 }}
        onClick={() => chooseFolder(f.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextFolder(f.id);
          setMenu("folder");
        }}
        onTouchStart={() =>
          startLong(() => {
            setContextFolder(f.id);
            setMenu("folder");
          })
        }
        onTouchEnd={stopLong}
        onTouchMove={stopLong}
      >
        {f.kind === "quick" ? (
          <StickyNote />
        ) : f.kind === "trash" ? (
          <Trash2 />
        ) : (
          <Folder />
        )}
        <span>{f.name}</span>
        <span className="count">{count(f.id)}</span>
        {mobile && <ChevronRight className="chevron" />}
      </button>
      {ws.folders
        .filter((x) => x.parentId === f.id)
        .map((x) => folderRow(x, depth + 1))}
    </div>
  );
  const searchBox = (
    <div className={`search-box ${searching ? "focused" : ""}`}>
      <Search size={17} />
      <input
        ref={searchInput}
        aria-label="搜索备忘录"
        placeholder="搜索"
        value={query}
        onFocus={() => setSearching(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setFilter("");
        }}
      />
      {query ? (
        <button aria-label="清除搜索" onClick={() => setQuery("")}>
          <X size={14} />
        </button>
      ) : mobile ? (
        <Mic size={15} />
      ) : null}
    </div>
  );
  const tools = (bottom = false) => (
    <div
      className={`editor-tools ${bottom ? "bottom-tools" : ""}`}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      {mobile && bottom ? (
        <>
          <IconButton
            label="核对清单"
            onClick={() => editor?.chain().focus().toggleTaskList().run()}
          >
            <CheckCheck />
          </IconButton>
          <IconButton
            label="添加附件"
            onClick={() => setMenu(menu === "media" ? null : "media")}
          >
            <Paperclip />
          </IconButton>
          <IconButton label="绘画" onClick={() => setDraw({ strokes: [] })}>
            <PenTool />
          </IconButton>
          <IconButton label="新建备忘录" onClick={newNote}>
            <SquarePen />
          </IconButton>
        </>
      ) : (
        <>
          <button
            className="format-button"
            aria-label="格式"
            onClick={openFormat}
          >
            {mobile ? "格式" : "格式"}
          </button>
          <IconButton
            label="核对清单"
            active={editor?.isActive("taskList")}
            onClick={() => editor?.chain().focus().toggleTaskList().run()}
          >
            <CheckCheck />
          </IconButton>
          <IconButton
            label="表格"
            onClick={() =>
              editor?.isActive("table")
                ? setMenu(menu === "table" ? null : "table")
                : editor
                    ?.chain()
                    .focus()
                    .insertTable({ rows: 2, cols: 2, withHeaderRow: false })
                    .run()
            }
          >
            <Table2 />
          </IconButton>
          <IconButton
            label="添加附件"
            onClick={() => setMenu(menu === "media" ? null : "media")}
          >
            <Paperclip />
          </IconButton>
          {mobile && (
            <>
              <IconButton label="绘画" onClick={() => setDraw({ strokes: [] })}>
                <PenTool />
              </IconButton>
              <IconButton
                label="收起键盘"
                onClick={() => {
                  editor?.commands.blur();
                  setEditing(false);
                }}
              >
                <X />
              </IconButton>
            </>
          )}
        </>
      )}
    </div>
  );
  const confirmModal = async () => {
    try {
      if (modal === "newFolder") {
        const name = modalValue.trim();
        if (!name) return;
        await doAction({ type: "createFolder", name, parentId: null });
      } else if (modal === "renameFolder") {
        await doAction({
          type: "renameFolder",
          id: contextFolder,
          name: modalValue.trim(),
        });
      } else if (modal === "lock") {
        if (!selected) return;
        await doAction({
          type: "lockNote",
          id: selected.id,
          password: modalValue,
        });
      } else if (modal === "unlock") {
        if (!current) return;
        await doAction({
          type: "unlockNote",
          id: current.id,
          password: modalValue,
        });
      } else if (modal === "deleteFolder") {
        await doAction({ type: "deleteFolder", id: contextFolder });
        if (folderId === contextFolder) chooseFolder("default");
      } else if (modal === "purge") {
        await doAction({ type: "purgeNote", id: selected?.id });
        setNoteId(null);
        if (mobile) setPage("notes");
      }
      setModal(null);
      setModalValue("");
    } catch (e) {
      fail(e);
    }
  };
  const renderMenu = () => {
    if (!menu) return null;
    const n = selected;
    return (
      <>
        <div
          className="menu-scrim"
          onClick={() => {
            if (menu === "format") closeFormat(false);
            else setMenu(null);
            setContextNote(null);
          }}
        />
        <div
          className={`popover menu-${menu} ${mobile && menu === "format" ? "mobile-format-panel" : ""}`}
          role={menu === "format" && mobile ? "dialog" : "menu"}
          aria-label={menu === "format" ? "格式" : undefined}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
          }}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
          }}
        >
          {menu === "format" && (
            <FormatControls
              editor={editor}
              mobile={mobile}
              run={formatCommand}
              onClose={() => closeFormat(true)}
            />
          )}
          {menu === "media" && (
            <>
              <MenuRow
                icon={<FileText size={19} />}
                onClick={() => {
                  fileInput.current?.click();
                  setMenu(null);
                }}
              >
                附加文件
              </MenuRow>
              <MenuRow
                icon={<Volume2 size={19} />}
                onClick={() => {
                  setMenu(null);
                  setRecord(true);
                }}
              >
                录音
              </MenuRow>
              <div className="menu-divider" />
              <MenuRow
                icon={<Image size={19} />}
                onClick={() => {
                  if (fileInput.current) {
                    fileInput.current.accept = "image/*,video/*";
                    fileInput.current.click();
                  }
                  setMenu(null);
                }}
              >
                选取照片或视频
              </MenuRow>
              <MenuRow
                icon={<Camera size={19} />}
                onClick={() => {
                  cameraInput.current?.click();
                  setMenu(null);
                }}
              >
                拍照或录像
              </MenuRow>
              <MenuRow
                icon={<ScanLine size={19} />}
                onClick={() => {
                  setMenu(null);
                  setNotice(
                    "当前可拍摄并插入文稿照片；自动裁边与扫描归档尚待实现。",
                  );
                  cameraInput.current?.click();
                }}
              >
                扫描文稿
              </MenuRow>
              <MenuRow
                icon={<ScanText size={19} />}
                onClick={() => {
                  setMenu(null);
                  openModal("scanInfo");
                }}
              >
                扫描文本
              </MenuRow>
              <div className="menu-divider" />
              <MenuRow
                icon={<PenTool size={19} />}
                onClick={() => {
                  setMenu(null);
                  setDraw({ strokes: [] });
                }}
              >
                添加绘画
              </MenuRow>
            </>
          )}
          {menu === "table" && (
            <>
              <MenuRow
                onClick={() => {
                  if (editor) {
                    convertTableToText(editor);
                    if (!mobile) editor.commands.focus();
                  }
                  setMenu(null);
                }}
              >
                转换为文本
              </MenuRow>
              <div className="menu-divider" />
              <MenuRow
                onClick={() => editor?.chain().focus().addRowAfter().run()}
              >
                在下面添加行
              </MenuRow>
              <MenuRow
                onClick={() => editor?.chain().focus().addRowBefore().run()}
              >
                在上面添加行
              </MenuRow>
              <MenuRow
                onClick={() => editor?.chain().focus().addColumnAfter().run()}
              >
                在后面添加列
              </MenuRow>
              <MenuRow
                onClick={() => editor?.chain().focus().addColumnBefore().run()}
              >
                在前面添加列
              </MenuRow>
              <div className="menu-divider" />
              <MenuRow
                danger
                onClick={() => editor?.chain().focus().deleteRow().run()}
              >
                删除行
              </MenuRow>
              <MenuRow
                danger
                onClick={() => editor?.chain().focus().deleteColumn().run()}
              >
                删除列
              </MenuRow>
              <MenuRow
                danger
                onClick={() => {
                  editor?.chain().focus().deleteTable().run();
                  setMenu(null);
                }}
              >
                删除表格
              </MenuRow>
            </>
          )}
          {(menu === "more" || menu === "note") && n && (
            <>
              {n.deletedAt ? (
                <>
                  <MenuRow
                    icon={<Undo2 size={18} />}
                    onClick={() => patch({ type: "restoreNote", id: n.id })}
                  >
                    恢复
                  </MenuRow>
                  <MenuRow
                    danger
                    icon={<Trash2 size={18} />}
                    onClick={() => openModal("purge")}
                  >
                    永久删除
                  </MenuRow>
                </>
              ) : (
                <>
                  <div className="menu-quick">
                    <button
                      onClick={() =>
                        patch({
                          type: "patchNote",
                          id: n.id,
                          pinned: !n.pinned,
                        })
                      }
                    >
                      <Pin size={19} />
                      <span>{n.pinned ? "取消置顶" : "置顶"}</span>
                    </button>
                    <button
                      onClick={() =>
                        n.locked
                          ? unlocked.has(n.id)
                            ? patch({ type: "removeLock", id: n.id })
                            : openModal("unlock")
                          : openModal("lock")
                      }
                    >
                      <Lock size={19} />
                      <span>{n.locked ? "移除锁定" : "锁定"}</span>
                    </button>
                    {!mobile && (
                      <button
                        onClick={() => {
                          setMenu(null);
                          openSeparate(n);
                        }}
                      >
                        <NotebookPen size={19} />
                        <span>单独打开</span>
                      </button>
                    )}
                  </div>
                  <div className="menu-divider" />
                  <MenuRow
                    icon={<Search size={18} />}
                    onClick={() => {
                      setShowFind(true);
                      setMenu(null);
                    }}
                  >
                    在备忘录中查找
                  </MenuRow>
                  <MenuRow
                    icon={<Folder size={18} />}
                    onClick={() => openModal("move")}
                  >
                    移动备忘录
                  </MenuRow>
                  <MenuRow
                    icon={<Table2 size={18} />}
                    onClick={() => openModal("paper")}
                  >
                    横线与网格
                  </MenuRow>
                  <MenuRow
                    icon={<Grid2X2 size={18} />}
                    onClick={() => openModal("attachments")}
                  >
                    附件视图
                  </MenuRow>
                  <MenuRow
                    icon={<Copy size={18} />}
                    onClick={() => {
                      flush()
                        .then(() => readNoteText(n.id))
                        .then((data) =>
                          navigator.clipboard.writeText(data.text),
                        )
                        .then(() => setNotice("已复制"))
                        .catch(fail);
                      setMenu(null);
                    }}
                  >
                    拷贝备忘录
                  </MenuRow>
                  <MenuRow icon={<Share size={18} />} onClick={shareNote}>
                    发送副本
                  </MenuRow>
                  <div className="menu-divider" />
                  <MenuRow
                    danger
                    icon={<Trash2 size={18} />}
                    onClick={async () => {
                      await patch({ type: "deleteNote", id: n.id });
                      setNoteId(null);
                      if (mobile) setPage("notes");
                    }}
                  >
                    删除
                  </MenuRow>
                </>
              )}
            </>
          )}
          {menu === "view" && (
            <>
              <MenuRow
                icon={<List size={18} />}
                checked={view === "list"}
                onClick={() => {
                  updateSettings({ view: "list" });
                  setMenu(null);
                }}
              >
                列表
              </MenuRow>
              <MenuRow
                icon={<Grid2X2 size={18} />}
                checked={view === "gallery"}
                onClick={() => {
                  updateSettings({ view: "gallery" });
                  setMenu(null);
                }}
              >
                画廊
              </MenuRow>
              <div className="menu-divider" />
              {[
                { key: "updated", text: "按编辑日期排序" },
                { key: "created", text: "按创建日期排序" },
                { key: "title", text: "按标题排序" },
              ].map((s) => (
                <MenuRow
                  key={s.key}
                  checked={sort === s.key}
                  onClick={() => {
                    updateSettings({ sort: s.key as Settings["sort"] });
                    setMenu(null);
                  }}
                >
                  {s.text}
                </MenuRow>
              ))}
              <MenuRow
                checked={settings.groupDates !== false}
                onClick={() => {
                  updateSettings({ groupDates: settings.groupDates === false });
                  setMenu(null);
                }}
              >
                按日期分组
              </MenuRow>
              <div className="menu-divider" />
              <MenuRow
                icon={<SettingsIcon size={18} />}
                onClick={() => openModal("settings")}
              >
                设置
              </MenuRow>
            </>
          )}
          {menu === "folder" && (
            <>
              <MenuRow
                icon={<SquarePen size={18} />}
                onClick={() =>
                  openModal(
                    "renameFolder",
                    ws.folders.find((f) => f.id === contextFolder)?.name,
                  )
                }
              >
                重新命名
              </MenuRow>
              <MenuRow
                icon={<FolderPlus size={18} />}
                onClick={() => openModal("newFolder")}
              >
                新建文件夹
              </MenuRow>
              <MenuRow
                danger
                icon={<Trash2 size={18} />}
                onClick={() => openModal("deleteFolder")}
              >
                删除文件夹
              </MenuRow>
            </>
          )}
          {menu === "app" && (
            <>
              <MenuRow
                icon={<FolderPlus size={18} />}
                onClick={() => openModal("newFolder")}
              >
                新建文件夹
              </MenuRow>
              <MenuRow
                icon={<ArrowDownToLine size={18} />}
                onClick={() => archive("export")}
              >
                导出本地备份
              </MenuRow>
              <MenuRow
                icon={<ArrowUpFromLine size={18} />}
                onClick={() => archive("import")}
              >
                导入本地备份
              </MenuRow>
              <MenuRow
                icon={<SettingsIcon size={18} />}
                onClick={() => openModal("settings")}
              >
                设置
              </MenuRow>
            </>
          )}
        </div>
      </>
    );
  };
  const nativeScope = JSON.stringify([
    folderId,
    noteId,
    view,
    galleryEditor,
    separate,
  ]);
  nativeAssert.current = (context, editing = false, overlay = false) => {
    const live = accessGate.stamp(context.noteId || undefined);
    if (
      context.scope !== nativeScope ||
      context.noteId !== noteId ||
      JSON.stringify(live) !== JSON.stringify(context.stamp) ||
      loading ||
      synchronizing ||
      accessSuspended.length ||
      accessGate.state?.operationId ||
      (context.noteId &&
        (blockedNotes.current.has(context.noteId) ||
          accessGate.state?.suspended.includes(context.noteId))) ||
      (!overlay && (modal || draw || record))
    )
      throw new Error("备忘录或授权状态已改变，请重新执行操作");
    if (
      editing &&
      (!current ||
        current.deletedAt ||
        !context.editor ||
        context.editor !== editor ||
        nativeEditorOwners.current.get(context.editor) !== context.noteId ||
        editor.isDestroyed ||
        !editor.isEditable ||
        !context.bookmark ||
        (current.locked && !accessGate.state?.notes[current.id]?.authorized) ||
        (nativeDocumentVersions.current.get(editor) || 0) !==
          context.documentVersion)
    )
      throw new Error("编辑内容或选区已改变，请重新选择后执行操作");
  };
  const nativeSelection = (context: NativeContext) => {
    nativeAssert.current(context, true);
    const target = context.editor!;
    target.view.dispatch(
      target.state.tr.setSelection(context.bookmark!.resolve(target.state.doc)),
    );
    return target;
  };
  nativeHandler.current = (intent, context, sequence) => {
    if (intent.kind === "search") {
      setNativeSearchAck(sequence);
      setQuery(intent.phase === "cancel" ? "" : intent.value);
      setSearching(intent.phase !== "cancel");
      setFilter("");
      return;
    }
    if (intent.kind === "windowActivity") return;
    try {
      nativeAssert.current(context);
      const command: MenuCommand | undefined =
        intent.kind === "menu" ? intent.command : undefined;
      if (intent.kind === "action") {
        switch (intent.action) {
          case "newFolder":
            setContextFolder(null);
            openModal("newFolder");
            return;
          case "toggleSidebar":
            setSidebar((value) => !value);
            return;
          case "backToGallery":
            back();
            return;
          case "newNote":
            void createNote(() => nativeAssert.current(context));
            return;
          case "share":
            void shareTarget(context);
            return;
          case "checklist":
            nativeSelection(context).chain().focus().toggleTaskList().run();
            return;
          case "table":
            nativeSelection(context)
              .chain()
              .focus()
              .insertTable({ rows: 2, cols: 2, withHeaderRow: false })
              .run();
            return;
          default:
            throw new Error("原生菜单未提供可执行命令");
        }
      }
      switch (command) {
        case "viewGallery":
          updateSettings({ view: "gallery" });
          return;
        case "viewList":
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
          nativeSelection(context);
          setShowFind(true);
          return;
        case "moveNote":
          nativeSelection(context);
          setContextNote(null);
          openModal("move");
          return;
        case "pinNote":
        case "deleteNote":
        case "lockNote": {
          nativeSelection(context);
          const validate = () => nativeAssert.current(context, true);
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
          nativeSelection(context);
          nativeAttachmentTarget.current = { ...context };
          if (!fileInput.current) throw new Error("附件选择器尚未就绪");
          fileInput.current.accept =
            command === "choosePhotoVideo" ? "image/*,video/*" : "";
          fileInput.current.click();
          return;
        case "recordAudio":
          nativeSelection(context);
          nativeAttachmentTarget.current = { ...context };
          setRecord(true);
          return;
      }
      const target = nativeSelection(context);
      const chain = target.chain().focus();
      const colors: Partial<Record<MenuCommand, string>> = {
        colorPurple: "#e8c1f0",
        colorPink: "#f6bfd4",
        colorOrange: "#fac69c",
        colorMint: "#b3dfbd",
        colorBlue: "#bad6f3",
      };
      if (command && colors[command]) {
        chain.setHighlight({ color: colors[command] }).run();
        return;
      }
      switch (command) {
        case "bold":
          chain.toggleBold().run();
          break;
        case "italic":
          chain.toggleItalic().run();
          break;
        case "underline":
          chain.toggleUnderline().run();
          break;
        case "strikethrough":
          chain.toggleStrike().run();
          break;
        case "highlight":
          chain.toggleHighlight({ color: "#e8c1f0" }).run();
          break;
        case "colorDefault":
          chain.unsetHighlight().run();
          break;
        case "styleTitle":
          chain.setHeading({ level: 1 }).run();
          break;
        case "styleHeading":
          chain.setHeading({ level: 2 }).run();
          break;
        case "styleSubheading":
          chain.setHeading({ level: 3 }).run();
          break;
        case "styleBody":
          chain.setParagraph().run();
          break;
        case "styleMonospaced":
          chain.toggleCodeBlock().run();
          break;
        case "listBullet":
          toggleListStyle(target, "bullet");
          break;
        case "listDash":
          toggleListStyle(target, "dash");
          break;
        case "listNumber":
          chain.toggleOrderedList().run();
          break;
        case "blockquote":
          chain.toggleBlockquote().run();
          break;
        case "convertTableToText":
          convertTableToText(target);
          break;
        default:
          throw new Error("此原生命令尚未实现");
      }
    } catch (error) {
      fail(error);
    }
  };
  nativeMenuHandler.current = (command) => {
    const context: NativeContext = {
      noteId,
      scope: nativeScope,
      stamp: accessGate.stamp(noteId || undefined),
      editor,
      bookmark:
        editor && !editor.isDestroyed
          ? editor.state.selection.getBookmark()
          : null,
      documentVersion: editor
        ? nativeDocumentVersions.current.get(editor) || 0
        : 0,
    };
    try {
      nativeAssert.current(context);
      switch (command) {
        case "new_note":
          nativeHandler.current(
            { kind: "action", action: "newNote" },
            context,
            0,
          );
          break;
        case "new_folder":
          nativeHandler.current(
            { kind: "action", action: "newFolder" },
            context,
            0,
          );
          break;
        case "sidebar":
          nativeHandler.current(
            { kind: "action", action: "toggleSidebar" },
            context,
            0,
          );
          break;
        case "gallery":
          updateSettings({ view: view === "list" ? "gallery" : "list" });
          break;
        case "search":
          focusGlobalSearch();
          break;
        case "find_in_note":
          nativeSelection(context);
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
  useLayoutEffect(() => {
    if (!native || !macNative) return;
    const toolbar = new NativeToolbar<NativeContext>(
      nativeToolbarTransport(),
      (intent, context, sequence) =>
        nativeHandler.current(intent, context, sequence),
      setNativeInfo,
      fail,
    );
    nativeToolbar.current = toolbar;
    return () => {
      toolbar.stop();
      if (nativeToolbar.current === toolbar) nativeToolbar.current = null;
    };
  }, [fail]);
  useLayoutEffect(() => {
    if (!native || !macNative || !nativeToolbar.current) return;
    const liveEditor =
      editor &&
      !editor.isDestroyed &&
      nativeEditorOwners.current.get(editor) === noteId
        ? editor
        : null;
    if (liveEditor && !nativeEditorIds.current.has(liveEditor))
      nativeEditorIds.current.set(liveEditor, ++nativeEditorCounter.current);
    const available =
      !loading &&
      !synchronizing &&
      !accessSuspended.length &&
      !accessGate.state?.operationId &&
      !modal &&
      !draw &&
      !record;
    const editable =
      available &&
      !!current &&
      !current.deletedAt &&
      !blockedNotes.current.has(current.id) &&
      (!current.locked || !!accessGate.state?.notes[current.id]?.authorized) &&
      !!liveEditor?.isEditable;
    const stamp = accessGate.stamp(noteId || undefined);
    nativeToolbar.current.set({
      key: JSON.stringify([
        nativeScope,
        stamp,
        liveEditor ? nativeEditorIds.current.get(liveEditor) : null,
        liveEditor ? nativeDocumentVersions.current.get(liveEditor) || 0 : 0,
      ]),
      context: {
        noteId,
        scope: nativeScope,
        stamp,
        editor: liveEditor,
        bookmark: liveEditor?.state.selection.getBookmark() || null,
        documentVersion: liveEditor
          ? nativeDocumentVersions.current.get(liveEditor) || 0
          : 0,
      },
      state: toolbarState({
        layout: separate
          ? "independentNote"
          : view === "gallery"
            ? galleryEditor
              ? "galleryExpanded"
              : "galleryBrowse"
            : "threeColumn",
        sidebar,
        settings,
        folderTitle: query ? "搜索结果" : folderLabel,
        folderCount: listed.length,
        query,
        searchAck: nativeSearchAck,
        available,
        editable,
        current,
        editor: liveEditor,
      }),
    });
  });
  const nativeTop = !mobile && !!nativeInfo;
  return (
    <div
      className={`app ${nativeTop ? "native-toolbar" : ""} ${synchronizing || accessSuspended.length ? "access-sync" : ""} ${mobile ? "mobile" : "desktop"} ${view === "gallery" && !separate ? (galleryEditor ? "gallery-edit" : "gallery-browse") : ""} ${menu === "format" && mobile ? "format-open" : ""} page-${page} ${!sidebar ? "sidebar-hidden" : ""} ${separate ? "separate" : ""}`}
      style={
        {
          "--sidebar-width": `${settings.sidebarWidth || 228}px`,
          "--list-width": `${settings.listWidth || 280}px`,
          "--format-height": `${formatHeight}px`,
          "--native-top": `${nativeInfo?.native.reservedTop || 0}px`,
        } as React.CSSProperties
      }
    >
      {!native && (
        <div className="preview-badge">浏览器预览 · 独立演示数据</div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              setError("");
              for (const [id, doc] of pendingDocs.current) saveDoc(id, doc);
            }}
          >
            重试
          </button>
          {noteId &&
            pendingDocs.current.has(noteId) &&
            (saveFailures.current.get(noteId) as { code?: string })?.code ===
              "conflict" &&
            (current?.locked ||
            ws.attachments.some((a) => a.noteId === noteId) ? (
              <span>
                锁定或含附件的冲突内容暂不能安全另存，请保持此窗口打开。
              </span>
            ) : (
              <button onClick={() => void saveConflictCopy()}>
                将本窗口内容另存为新备忘录
              </button>
            ))}
          <button aria-label="关闭错误" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <input
        className="hidden-input"
        type="file"
        multiple
        ref={fileInput}
        onChange={(e) => fileSelected(e.target.files)}
      />
      <input
        className="hidden-input"
        type="file"
        accept="image/*,video/*"
        capture="environment"
        ref={cameraInput}
        onChange={(e) => fileSelected(e.target.files)}
      />
      <aside className="sidebar">
        {!nativeTop && (
          <div
            className="sidebar-toolbar"
            data-tauri-drag-region
            onDoubleClick={() => {
              if (native && !mobile) getCurrentWindow().toggleMaximize();
            }}
          >
            {!native && (
              <div className="preview-lights">
                <i />
                <i />
                <i />
              </div>
            )}
            <div className="sidebar-actions">
              <IconButton
                label="添加文件夹"
                onClick={() => openModal("newFolder")}
              >
                <FolderPlus />
              </IconButton>
              <IconButton label="隐藏文件夹" onClick={() => setSidebar(false)}>
                <PanelLeft />
              </IconButton>
            </div>
          </div>
        )}
        <div className="mobile-folder-nav">
          <button onClick={() => setMenu(menu === "app" ? null : "app")}>
            编辑
          </button>
        </div>
        <h1 className="folder-large-title">文件夹</h1>
        {mobile && (
          <div className="mobile-folder-search">
            {searchBox}
            {searching && (
              <button
                className="text-button"
                onClick={() => {
                  setSearching(false);
                  setQuery("");
                  setFilter("");
                }}
              >
                取消
              </button>
            )}
          </div>
        )}
        {mobile && searching ? (
          <SearchSuggestions
            onChoose={(f) => {
              setFilter(f);
              setPage("notes");
            }}
          />
        ) : (
          <div className="folder-scroll">
            <div className="folder-group quick-group">
              {ws.folders
                .filter((f) => f.kind === "quick")
                .map((f) => folderRow(f))}
            </div>
            <div className="account-title">
              {mobile ? "在我的设备上" : "在我的 Mac 上"}
            </div>
            <div className="folder-group">
              <button
                className={`folder-row ${folderId === "all" ? "selected" : ""}`}
                onClick={() => chooseFolder("all")}
              >
                <FolderOpen />
                <span>全部备忘录</span>
                <span className="count">{count("all")}</span>
                {mobile && <ChevronRight className="chevron" />}
              </button>
              {ws.folders
                .filter(
                  (f) =>
                    f.kind !== "quick" && f.kind !== "trash" && !f.parentId,
                )
                .map((f) => folderRow(f))}
              {count("trash") > 0 &&
                ws.folders
                  .filter((f) => f.kind === "trash")
                  .map((f) => folderRow(f))}
            </div>
          </div>
        )}
        <div className="folder-footer">
          <button onClick={() => openModal("newFolder")}>
            <FolderPlus size={21} />
            {!mobile && "新建文件夹"}
          </button>
          <IconButton
            label={mobile ? "新建备忘录" : "更多设置"}
            onClick={
              mobile ? newNote : () => setMenu(menu === "app" ? null : "app")
            }
          >
            {mobile ? <SquarePen /> : <MoreHorizontal />}
          </IconButton>
        </div>
      </aside>
      {!mobile && sidebar && !separate && (
        <ResizeHandle
          width={settings.sidebarWidth || 228}
          min={180}
          max={360}
          className="sidebar-resize"
          onChange={(w) => setSettings((s) => ({ ...s, sidebarWidth: w }))}
          onEnd={(w) => updateSettings({ sidebarWidth: w })}
        />
      )}
      <section
        className={`notes-pane ${view === "gallery" ? "gallery-pane" : ""}`}
      >
        {!nativeTop && (
          <header className="notes-header" data-tauri-drag-region>
            {mobile ? (
              <>
                <button className="back-button" onClick={back}>
                  <ChevronLeft />
                  文件夹
                </button>
                <IconButton
                  label="显示选项"
                  onClick={() => setMenu(menu === "view" ? null : "view")}
                >
                  <MoreHorizontal />
                </IconButton>
              </>
            ) : (
              <>
                {!sidebar && (
                  <IconButton
                    label="显示文件夹"
                    onClick={() => setSidebar(true)}
                  >
                    <PanelLeft />
                  </IconButton>
                )}
                <div className="folder-heading">
                  <strong>{query ? "搜索结果" : folderLabel}</strong>
                  <span>{listed.length}个备忘录</span>
                </div>
                <IconButton
                  label="显示选项"
                  onClick={() => setMenu(menu === "view" ? null : "view")}
                >
                  <MoreHorizontal />
                </IconButton>
              </>
            )}
          </header>
        )}
        {mobile && (
          <>
            <h1 className="notes-large-title">
              {filter ? "搜索结果" : folderLabel}
            </h1>
            <div className="mobile-list-search">
              {searchBox}
              {searching && (
                <button
                  className="text-button"
                  onClick={() => {
                    setSearching(false);
                    setQuery("");
                    setFilter("");
                  }}
                >
                  取消
                </button>
              )}
            </div>
          </>
        )}
        <div
          className={`notes-scroll ${view === "gallery" ? "gallery" : ""}`}
          onClick={() => setSwiped(null)}
        >
          {loading ? (
            <div className="empty-state">正在打开备忘录…</div>
          ) : listed.length === 0 ? (
            <div className="empty-state">
              {query || filter ? "未找到备忘录" : "无备忘录"}
            </div>
          ) : (
            listed.map((n, index) => {
              const group = groupName(n);
              const time = new Intl.DateTimeFormat("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(n.updatedAt);
              const previewText =
                n.plainText.split("\n").slice(1).filter(Boolean).join(" ") ||
                (ws.attachments.some((a) => a.noteId === n.id)
                  ? "附件"
                  : "无更多文本");
              return (
                <div
                  key={n.id}
                  className={`note-entry ${view === "gallery" ? "gallery-entry" : ""}`}
                >
                  {(index === 0 || groupName(listed[index - 1]) !== group) &&
                    group && <div className="date-section">{group}</div>}
                  <div
                    className={`note-row-wrap ${swiped === n.id ? "swiped" : ""}`}
                  >
                    <div className="swipe-actions">
                      <button
                        aria-label="置顶"
                        onClick={(e) => {
                          e.stopPropagation();
                          patch({
                            type: "patchNote",
                            id: n.id,
                            pinned: !n.pinned,
                          });
                          setSwiped(null);
                        }}
                      >
                        <Pin size={20} />
                      </button>
                      <button
                        aria-label="移动"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextNote(n.id);
                          openModal("move");
                        }}
                      >
                        <Folder size={20} />
                      </button>
                      <button
                        aria-label="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          patch({ type: "deleteNote", id: n.id });
                          setSwiped(null);
                        }}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                    <button
                      className={`note-row ${noteId === n.id ? "selected" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (swiped === n.id) {
                          setSwiped(null);
                          return;
                        }
                        if (!mobile && view === "gallery") {
                          setNoteId(n.id);
                          updateSettings({ selectedNote: n.id });
                        } else chooseNote(n);
                      }}
                      onDoubleClick={() => {
                        if (!mobile) chooseNote(n);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextNote(n.id);
                        setMenu("note");
                      }}
                      onTouchStart={(e) => {
                        swipe.current = {
                          x: e.touches[0].clientX,
                          y: e.touches[0].clientY,
                        };
                        startLong(() => {
                          setContextNote(n.id);
                          setMenu("note");
                        });
                      }}
                      onTouchMove={(e) => {
                        stopLong();
                        if (
                          swipe.current &&
                          Math.abs(e.touches[0].clientY - swipe.current.y) <
                            20 &&
                          swipe.current.x - e.touches[0].clientX > 45
                        )
                          setSwiped(n.id);
                      }}
                      onTouchEnd={stopLong}
                    >
                      {view === "gallery" && (
                        <div className="gallery-preview">
                          <strong>{n.title}</strong>
                          <p>{n.locked ? <Lock size={26} /> : previewText}</p>
                          {JSON.stringify(n.document).includes("table") && (
                            <div className="preview-table" />
                          )}
                          {JSON.stringify(n.document).includes("drawing") && (
                            <PenTool size={38} />
                          )}
                        </div>
                      )}
                      <div className="note-row-content">
                        <strong>
                          {n.pinned && <Pin className="pin-marker" size={13} />}
                          {n.title}
                        </strong>
                        <div className="note-snippet">
                          <span className="note-time">
                            {group === "今天"
                              ? time
                              : new Date(n.updatedAt).toLocaleDateString(
                                  "zh-CN",
                                )}
                          </span>
                          <span className="snippet-text">
                            {n.locked ? (
                              <>
                                <Lock size={12} /> 已锁定
                              </>
                            ) : (
                              previewText
                            )}
                          </span>
                        </div>
                        {(folderId === "all" || query) && (
                          <span className="note-folder">
                            <Folder size={11} />
                            {ws.folders.find((f) => f.id === n.folderId)?.name}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="notes-footer">
          <span>{listed.length}个备忘录</span>
          <IconButton label="新建备忘录" onClick={newNote}>
            <SquarePen />
          </IconButton>
        </div>
      </section>
      {!mobile && !separate && (
        <ResizeHandle
          width={settings.listWidth || 280}
          min={220}
          max={440}
          className="list-resize"
          onChange={(w) => setSettings((s) => ({ ...s, listWidth: w }))}
          onEnd={(w) => updateSettings({ listWidth: w })}
        />
      )}
      <main
        className="editor-pane"
        onTouchStart={(e) => {
          if (e.touches[0].clientX < 24)
            swipe.current = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
          else swipe.current = null;
        }}
        onTouchEnd={(e) => {
          if (
            mobile &&
            swipe.current &&
            e.changedTouches[0].clientX - swipe.current.x > 90 &&
            Math.abs(e.changedTouches[0].clientY - swipe.current.y) < 70
          )
            back();
          swipe.current = null;
        }}
      >
        {!nativeTop && (
          <header
            className="editor-header"
            data-tauri-drag-region
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest("button"))
                e.preventDefault();
            }}
          >
            {mobile ? (
              <>
                <button className="back-button" onClick={back}>
                  <ChevronLeft />
                  {searching ? "搜索" : folderLabel}
                </button>
                <div className="mobile-header-actions">
                  {editing && (
                    <>
                      <IconButton
                        label="撤销"
                        disabled={!editor?.can().undo()}
                        onClick={() => editor?.chain().focus().undo().run()}
                      >
                        <Undo2 />
                      </IconButton>
                      <IconButton
                        label="重做"
                        disabled={!editor?.can().redo()}
                        onClick={() => editor?.chain().focus().redo().run()}
                      >
                        <Redo2 />
                      </IconButton>
                    </>
                  )}
                  <IconButton label="共享" onClick={shareNote}>
                    <Share />
                  </IconButton>
                  <IconButton
                    label="更多"
                    onClick={() => {
                      setContextNote(null);
                      setMenu(menu === "more" ? null : "more");
                    }}
                  >
                    <MoreHorizontal />
                  </IconButton>
                  {editing && (
                    <button
                      className="text-button"
                      onClick={() => {
                        editor?.commands.blur();
                        setEditing(false);
                      }}
                    >
                      完成
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {view === "gallery" && galleryEditor && !separate && (
                  <IconButton
                    label="返回画廊"
                    className="gallery-back"
                    onClick={back}
                  >
                    <ChevronLeft />
                  </IconButton>
                )}
                <IconButton
                  label="新建备忘录"
                  className="new-note-top glass-button"
                  onClick={newNote}
                >
                  <SquarePen />
                </IconButton>
                {current && (
                  <>
                    <div className="glass-group">{tools()}</div>
                    <div className="glass-group share-group">
                      <IconButton label="共享" onClick={shareNote}>
                        <Share />
                      </IconButton>
                      <IconButton
                        label="更多"
                        onClick={() => {
                          setContextNote(null);
                          setMenu(menu === "more" ? null : "more");
                        }}
                      >
                        <MoreHorizontal />
                      </IconButton>
                    </div>
                  </>
                )}
                <div className="desktop-search">{searchBox}</div>
              </>
            )}
          </header>
        )}
        {showFind && (
          <div className="find-bar">
            <input
              autoFocus
              value={find}
              aria-label="在备忘录中查找"
              placeholder="在备忘录中查找"
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") findNext();
              }}
            />
            <button onClick={findNext}>下一个</button>
            <button aria-label="关闭查找" onClick={() => setShowFind(false)}>
              <X size={18} />
            </button>
          </div>
        )}
        {!current ? (
          <div className="editor-empty">{loading ? "" : "未选择备忘录"}</div>
        ) : current.locked && !unlocked.has(current.id) ? (
          <div className="locked-state">
            <Lock size={48} />
            <h2>此备忘录已锁定</h2>
            <p>输入密码以查看此备忘录。</p>
            <button onClick={() => openModal("unlock")}>查看备忘录</button>
          </div>
        ) : (
          <>
            <div className="editor-scroll">
              <button
                className="note-date"
                onClick={() =>
                  setNotice(`创建于 ${fmtDate(current.createdAt)}`)
                }
              >
                {fmtDate(current.updatedAt)}
              </button>
              {current.deletedAt ? (
                <div className="deleted-note">
                  <p>此备忘录位于“最近删除”中。</p>
                  <button
                    onClick={() =>
                      patch({ type: "restoreNote", id: current.id })
                    }
                  >
                    恢复备忘录
                  </button>
                  <pre>{current.plainText}</pre>
                </div>
              ) : (
                <NoteEditor
                  key={`${current.id}-${ws.access?.sessionId || "preview"}-${ws.access?.notes[current.id]?.epoch || 0}-${externalVersions.current.get(current.id) || 0}`}
                  note={current}
                  onChange={saveDoc}
                  onReady={onReady}
                  onFocus={(focused) => {
                    setEditing(focused);
                    if (focused && mobile && menu === "format") {
                      setMenu(null);
                      formatTarget.current = null;
                    }
                  }}
                />
              )}
            </div>
            {mobile &&
              !current.deletedAt &&
              menu !== "format" &&
              (editing ? tools() : tools(true))}
          </>
        )}
        {saving > 0 && (
          <div className="save-status" aria-live="polite">
            正在保存…
          </div>
        )}
      </main>
      {renderMenu()}
      {(synchronizing || accessSuspended.length > 0) && (
        <div className="access-cover" role="status">
          <div>
            {syncError ? (
              <>
                同步失败，备忘录内容暂时隐藏。<p>{syncError}</p>
                <button onClick={() => void synchronizeRef.current()}>
                  重试同步
                </button>
              </>
            ) : (
              "正在确认保存与锁定状态…"
            )}
          </div>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => (modal === "paper" ? closePaper() : setModal(null))}
        >
          <div
            className={`modal modal-${modal}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {[
              "newFolder",
              "renameFolder",
              "lock",
              "unlock",
              "deleteFolder",
              "purge",
            ].includes(modal) ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmModal();
                }}
              >
                <h2>
                  {
                    (
                      {
                        newFolder: "新建文件夹",
                        renameFolder: "重新命名文件夹",
                        lock: "设置备忘录密码",
                        unlock: "输入密码",
                        deleteFolder: "删除文件夹？",
                        purge: "永久删除备忘录？",
                      } as Record<string, string>
                    )[modal]
                  }
                </h2>
                {["deleteFolder", "purge"].includes(modal) ? (
                  <p>
                    {modal === "deleteFolder"
                      ? "文件夹中的备忘录将移到“最近删除”。"
                      : "此操作无法撤销。"}
                  </p>
                ) : (
                  <>
                    <p>
                      {modal === "lock"
                        ? "密码用于在本地加密此备忘录，至少6个字符。请妥善保存密码。"
                        : modal === "unlock"
                          ? "输入密码以查看此备忘录。"
                          : "名称："}
                    </p>
                    <input
                      autoFocus
                      aria-label={
                        modal === "lock" || modal === "unlock" ? "密码" : "名称"
                      }
                      type={
                        modal === "lock" || modal === "unlock"
                          ? "password"
                          : "text"
                      }
                      value={modalValue}
                      onChange={(e) => setModalValue(e.target.value)}
                    />
                  </>
                )}
                <div className="modal-actions">
                  <button type="button" onClick={() => setModal(null)}>
                    取消
                  </button>
                  <button
                    type="submit"
                    className={
                      modal === "purge" || modal === "deleteFolder"
                        ? "danger"
                        : "primary"
                    }
                  >
                    {modal === "purge" || modal === "deleteFolder"
                      ? "删除"
                      : "好"}
                  </button>
                </div>
              </form>
            ) : null}
            {modal === "move" && (
              <>
                <h2>移动备忘录</h2>
                <div className="move-list">
                  {ws.folders
                    .filter((f) => f.kind !== "trash")
                    .map((f) => (
                      <MenuRow
                        key={f.id}
                        icon={<Folder size={20} />}
                        onClick={async () => {
                          await patch({
                            type: "patchNote",
                            id: selected?.id,
                            folderId: f.id,
                          });
                          setModal(null);
                          if (mobile) setPage("notes");
                        }}
                      >
                        {f.name}
                      </MenuRow>
                    ))}
                </div>
                <button className="modal-cancel" onClick={() => setModal(null)}>
                  取消
                </button>
              </>
            )}
            {modal === "paper" && (
              <>
                <div className="sheet-top">
                  <button onClick={closePaper}>取消</button>
                  <strong>横线与网格</strong>
                  <span />
                </div>
                <p className="paper-description">
                  更改此备忘录中手写输入的横线或网格样式。
                </p>
                <div className="paper-options">
                  {[
                    "plain",
                    "lines-small",
                    "lines-medium",
                    "lines-large",
                    "grid-small",
                    "grid-medium",
                    "grid-large",
                  ].map((p) => (
                    <button
                      key={p}
                      aria-label={
                        (
                          {
                            plain: "空白",
                            "lines-small": "密横线",
                            "lines-medium": "中横线",
                            "lines-large": "疏横线",
                            "grid-small": "密网格",
                            "grid-medium": "中网格",
                            "grid-large": "疏网格",
                          } as Record<string, string>
                        )[p]
                      }
                      data-paper-style={p}
                      className={`paper-option ${p === "plain" ? "paper-blank" : ""} paper-${p} ${current?.paperStyle === p ? "selected" : ""}`}
                      onClick={async () => {
                        await patch({
                          type: "patchNote",
                          id: current?.id,
                          paperStyle: p,
                        });
                        closePaper();
                      }}
                    >
                      {current?.paperStyle === p && (
                        <span className="paper-check">
                          <Check size={15} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
            {modal === "settings" && (
              <>
                <h2>设置</h2>
                <div className="settings-section">
                  <h3>外观</h3>
                  {[
                    {
                      key: "system",
                      text: "跟随系统",
                      icon: <Sun size={18} />,
                    },
                    { key: "light", text: "浅色", icon: <Sun size={18} /> },
                    { key: "dark", text: "深色", icon: <Moon size={18} /> },
                  ].map((t) => (
                    <MenuRow
                      key={t.key}
                      icon={t.icon}
                      checked={theme === t.key}
                      onClick={() =>
                        updateSettings({ theme: t.key as Settings["theme"] })
                      }
                    >
                      {t.text}
                    </MenuRow>
                  ))}
                </div>
                <div className="settings-section">
                  <h3>本地数据</h3>
                  <MenuRow
                    onClick={() => archive("export")}
                    icon={<ArrowDownToLine size={18} />}
                  >
                    导出本地备份
                  </MenuRow>
                  <MenuRow
                    onClick={() => archive("import")}
                    icon={<ArrowUpFromLine size={18} />}
                  >
                    导入本地备份
                  </MenuRow>
                  <MenuRow
                    onClick={() => patch({ type: "closeLocks" })}
                    icon={<Lock size={18} />}
                  >
                    关闭所有已锁定的备忘录
                  </MenuRow>
                </div>
                <p className="settings-footnote">
                  所有备忘录和附件保存在此设备中。
                </p>
                <button className="modal-cancel" onClick={() => setModal(null)}>
                  完成
                </button>
              </>
            )}
            {modal === "attachments" && (
              <>
                <h2>附件</h2>
                <div className="attachment-browser">
                  {ws.attachments.filter((a) => a.noteId === current?.id)
                    .length ? (
                    ws.attachments
                      .filter((a) => a.noteId === current?.id)
                      .map((a) => (
                        <div key={a.id}>
                          <FileText size={24} />
                          <span>{a.displayName}</span>
                          <small>{Math.ceil(a.size / 1024)} KB</small>
                        </div>
                      ))
                  ) : (
                    <p>无附件</p>
                  )}
                </div>
                <button className="modal-cancel" onClick={() => setModal(null)}>
                  完成
                </button>
              </>
            )}
            {modal === "scanInfo" && (
              <>
                <h2>扫描文本</h2>
                <p>
                  当前版本尚未接入设备文字识别。可以先拍摄文稿照片并添加到备忘录。
                </p>
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>取消</button>
                  <button
                    onClick={() => {
                      setModal(null);
                      cameraInput.current?.click();
                    }}
                  >
                    拍摄文稿
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {draw && (
        <DrawingPanel
          initial={draw.strokes}
          paperStyle={current?.paperStyle || "plain"}
          onCancel={() => setDraw(null)}
          onDone={(strokes) => {
            if (draw.pos !== undefined)
              editor
                ?.chain()
                .focus()
                .setNodeSelection(draw.pos)
                .updateAttributes("drawing", { strokes })
                .run();
            else
              editor
                ?.chain()
                .focus()
                .insertContent({ type: "drawing", attrs: { strokes } })
                .run();
            setDraw(null);
          }}
        />
      )}
      {record && (
        <RecordingPanel
          onCancel={() => {
            nativeAttachmentTarget.current = null;
            setRecord(false);
          }}
          onDone={async (file) => {
            if (!current || !editor) return;
            try {
              const target = nativeAttachmentTarget.current;
              if (target) nativeAssert.current(target, true, true);
              const a = await storeAttachment(
                target?.noteId || current.id,
                file,
              );
              if (target) {
                nativeAssert.current(target, true, true);
                editor.view.dispatch(
                  editor.state.tr.setSelection(
                    target.bookmark!.resolve(editor.state.doc),
                  ),
                );
              }
              nativeAttachmentTarget.current = null;
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "attachment",
                  attrs: { id: a.id, name: a.displayName, kind: "audio" },
                })
                .run();
              setRecord(false);
              await refresh();
            } catch (e) {
              fail(e);
            }
          }}
        />
      )}
    </div>
  );
}
function SearchSuggestions({
  onChoose,
}: {
  onChoose: (filter: string) => void;
}) {
  return (
    <div className="search-suggestions">
      <h3>建议</h3>
      <div>
        {[
          { key: "locked", text: "已锁定备忘录", icon: <Lock /> },
          {
            key: "checklist",
            text: "含核对清单的备忘录",
            icon: <CheckCheck />,
          },
          { key: "tags", text: "含标签的备忘录", icon: <Hash /> },
          { key: "audio", text: "含录音的备忘录", icon: <Volume2 /> },
          { key: "image", text: "含照片的备忘录", icon: <Image /> },
          { key: "file", text: "含附件的备忘录", icon: <Paperclip /> },
        ].map((x) => (
          <button key={x.key} onClick={() => onChoose(x.key)}>
            {x.icon}
            {x.text}
          </button>
        ))}
      </div>
    </div>
  );
}
function ResizeHandle({
  width,
  min,
  max,
  onChange,
  onEnd,
  className,
}: {
  width: number;
  min: number;
  max: number;
  onChange: (w: number) => void;
  onEnd: (w: number) => void;
  className: string;
}) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      className={`resize-handle ${className}`}
      role="separator"
      aria-label="调整分栏宽度"
      aria-valuenow={width}
      aria-orientation="vertical"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, w: width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current)
          onChange(
            Math.max(
              min,
              Math.min(max, drag.current.w + e.clientX - drag.current.x),
            ),
          );
      }}
      onPointerUp={(e) => {
        if (drag.current) {
          onEnd(
            Math.max(
              min,
              Math.min(max, drag.current.w + e.clientX - drag.current.x),
            ),
          );
          drag.current = null;
        }
      }}
    />
  );
}
function FormatControls({
  editor,
  mobile,
  run,
  onClose,
}: {
  editor: Editor | null;
  mobile: boolean;
  run: (command: (editor: Editor) => unknown) => void;
  onClose: () => void;
}) {
  const [colors, setColors] = useState(false);
  const marks = [
    {
      label: "粗体",
      mark: "bold",
      icon: <Bold />,
      command: (e: Editor) => e.commands.toggleBold(),
    },
    {
      label: "斜体",
      mark: "italic",
      icon: <Italic />,
      command: (e: Editor) => e.commands.toggleItalic(),
    },
    {
      label: "下划线",
      mark: "underline",
      icon: <Underline />,
      command: (e: Editor) => e.commands.toggleUnderline(),
    },
    {
      label: "删除线",
      mark: "strike",
      icon: <Strikethrough />,
      command: (e: Editor) => e.commands.toggleStrike(),
    },
  ];
  const markRow = (
    <div className="format-mark-row">
      <div className="format-control-group">
        {marks.map((x) => (
          <IconButton
            key={x.mark}
            label={x.label}
            active={editor?.isActive(x.mark)}
            onClick={() => run(x.command)}
          >
            {x.icon}
          </IconButton>
        ))}
      </div>
      <div className="format-control-group format-color-group">
        <IconButton
          label="高亮"
          active={editor?.isActive("highlight")}
          onClick={() =>
            run((e) => e.commands.toggleHighlight({ color: "#e8c1f0" }))
          }
        >
          <Highlighter />
        </IconButton>
        <button
          className="format-color"
          aria-label="选择高亮颜色"
          aria-expanded={colors}
          onClick={() => setColors(!colors)}
        >
          <span />
        </button>
      </div>
    </div>
  );
  const styles = (
    <div className="type-styles">
      {[
        { label: "标题", level: 1 },
        { label: "小标题", level: 2 },
        { label: "副标题", level: 3 },
        { label: "正文", level: 0 },
        { label: "等宽样式", level: -1 },
      ].map(({ label, level }) => {
        const active =
          level > 0
            ? editor?.isActive("heading", { level })
            : editor?.isActive(level === 0 ? "paragraph" : "codeBlock");
        return (
          <button
            key={label}
            className={`format-style style-${level} ${active ? "selected" : ""}`}
            aria-pressed={!!active}
            onClick={() =>
              run((e) =>
                level > 0
                  ? e.commands.setHeading({ level: level as 1 | 2 | 3 })
                  : level === 0
                    ? e.commands.setParagraph()
                    : e.commands.toggleCodeBlock(),
              )
            }
          >
            {label}
            {!mobile && active && <Check size={16} />}
          </button>
        );
      })}
    </div>
  );
  const lists = [
    {
      label: "项目符号列表",
      icon: <List />,
      active: editor?.isActive("bulletList", { listStyle: "bullet" }),
      command: (e: Editor) => toggleListStyle(e, "bullet"),
    },
    {
      label: "短划线列表",
      icon: <ListMinus />,
      active: editor?.isActive("bulletList", { listStyle: "dash" }),
      command: (e: Editor) => toggleListStyle(e, "dash"),
    },
    {
      label: "编号列表",
      icon: <ListOrdered />,
      active: editor?.isActive("orderedList"),
      command: (e: Editor) => e.commands.toggleOrderedList(),
    },
  ];
  const indent = (e: Editor, inward: boolean) =>
    inward
      ? e.commands.sinkListItem(
          e.isActive("taskItem") ? "taskItem" : "listItem",
        )
      : e.commands.liftListItem(
          e.isActive("taskItem") ? "taskItem" : "listItem",
        );
  return (
    <div className="format-content">
      {mobile && (
        <div className="format-panel-header">
          <strong>格式</strong>
          <button aria-label="关闭格式" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      )}
      {!mobile && markRow}
      {styles}
      {mobile && markRow}
      {colors && (
        <div className="highlight-colors">
          {["#e8c1f0", "#f6bfd4", "#fac69c", "#fae780", "#b3dfbd"].map(
            (color) => (
              <button
                key={color}
                aria-label={`高亮 ${color}`}
                style={{ background: color }}
                onClick={() =>
                  run((e) => e.commands.toggleHighlight({ color }))
                }
              />
            ),
          )}
        </div>
      )}
      <div className="format-list-row">
        <div className="format-control-group">
          {lists.map((x) =>
            mobile ? (
              <IconButton
                key={x.label}
                label={x.label}
                active={x.active}
                onClick={() => run(x.command)}
              >
                {x.icon}
              </IconButton>
            ) : (
              <MenuRow
                key={x.label}
                icon={x.icon}
                checked={x.active}
                onClick={() => run(x.command)}
              >
                {x.label}
              </MenuRow>
            ),
          )}
        </div>
        <div className="format-control-group format-indent-group">
          <IconButton
            label="减少缩进"
            onClick={() => run((e) => indent(e, false))}
          >
            <IndentDecrease />
          </IconButton>
          <IconButton
            label="增加缩进"
            onClick={() => run((e) => indent(e, true))}
          >
            <IndentIncrease />
          </IconButton>
        </div>
        {mobile ? (
          <IconButton
            label="块引用"
            active={editor?.isActive("blockquote")}
            onClick={() => run((e) => e.commands.toggleBlockquote())}
          >
            <Quote />
          </IconButton>
        ) : (
          <MenuRow
            icon={<Quote />}
            checked={editor?.isActive("blockquote")}
            onClick={() => run((e) => e.commands.toggleBlockquote())}
          >
            块引用
          </MenuRow>
        )}
      </div>
    </div>
  );
}
function DrawingPanel({
  initial,
  paperStyle,
  onCancel,
  onDone,
}: {
  initial: DrawingStroke[];
  paperStyle: string;
  onCancel: () => void;
  onDone: (s: DrawingStroke[]) => void;
}) {
  const [strokes, setStrokes] = useState(initial);
  const [undone, setUndone] = useState<DrawingStroke[]>([]);
  const [color, setColor] = useState("#1c1c1e");
  const [width, setWidth] = useState(4);
  const [tool, setTool] = useState<"pen" | "marker" | "eraser">("pen");
  const active = useRef<DrawingStroke | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const coords = (e: ReactPointerEvent<SVGSVGElement>): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * 600) / r.width,
      ((e.clientY - r.top) * 300) / r.height,
    ];
  };
  return (
    <div className="drawing-overlay">
      <header>
        <button onClick={onCancel}>取消</button>
        <div>
          <IconButton
            label="撤销笔画"
            disabled={!strokes.length}
            onClick={() => {
              setUndone((v) => [...v, strokes[strokes.length - 1]]);
              setStrokes((v) => v.slice(0, -1));
            }}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            label="重做笔画"
            disabled={!undone.length}
            onClick={() => {
              setStrokes((v) => [...v, undone[undone.length - 1]]);
              setUndone((v) => v.slice(0, -1));
            }}
          >
            <Redo2 />
          </IconButton>
        </div>
        <button onClick={() => onDone(strokes)}>完成</button>
      </header>
      <div className={`drawing-surface paper-${paperStyle}`}>
        <svg
          ref={svg}
          viewBox="0 0 600 300"
          preserveAspectRatio="none"
          aria-label="绘图画布"
          onPointerDown={(e) => {
            const stroke: DrawingStroke = {
              tool,
              color,
              width:
                tool === "marker"
                  ? width * 4
                  : tool === "eraser"
                    ? width * 5
                    : width,
              points: [coords(e)],
            };
            active.current = stroke;
            setStrokes((v) => [...v, stroke]);
            setUndone([]);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!active.current) return;
            active.current.points.push(coords(e));
            setStrokes((v) => [...v]);
          }}
          onPointerUp={() => (active.current = null)}
          onPointerCancel={() => (active.current = null)}
        >
          {strokes.map((s, i) => (
            <polyline
              key={i}
              points={s.points.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={s.tool === "eraser" ? "var(--paper)" : s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={s.tool === "marker" ? 0.35 : 1}
            />
          ))}
        </svg>
      </div>
      <footer>
        <div className="drawing-instruments">
          <IconButton
            label="笔"
            active={tool === "pen"}
            onClick={() => setTool("pen")}
          >
            <PenTool />
          </IconButton>
          <IconButton
            label="荧光笔"
            active={tool === "marker"}
            onClick={() => setTool("marker")}
          >
            <Highlighter />
          </IconButton>
          <IconButton
            label="橡皮"
            active={tool === "eraser"}
            onClick={() => setTool("eraser")}
          >
            <Eraser />
          </IconButton>
          <input
            type="range"
            aria-label="笔画粗细"
            min={1}
            max={12}
            value={width}
            onChange={(e) => setWidth(+e.target.value)}
          />
        </div>
        <div className="drawing-colors">
          {[
            "#1c1c1e",
            "#636366",
            "#007aff",
            "#ff3b30",
            "#ffcc00",
            "#34c759",
            "#af52de",
          ].map((c) => (
            <button
              key={c}
              aria-label={`颜色 ${c}`}
              className={color === c ? "selected" : ""}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <input
            aria-label="自定义颜色"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </footer>
    </div>
  );
}
function RecordingPanel({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (file: File) => Promise<void>;
}) {
  const [status, setStatus] = useState<
    "starting" | "recording" | "paused" | "stopped" | "error"
  >("starting");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<RecordingSession | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [levels, setLevels] = useState<number[]>([]);
  useEffect(() => {
    const capture = new RecordingSession({
      onRecording: () => setStatus("recording"),
      onStopped: (recorded) => {
        setBlob(recorded);
        setStatus("stopped");
      },
      onLevel: (level) => setLevels((v) => [...v.slice(-89), level]),
      onError: (e) => {
        setError(errText(e));
        setStatus("error");
      },
    });
    session.current = capture;
    void capture.start();
    return () => {
      capture.dispose();
      if (session.current === capture) session.current = null;
    };
  }, []);
  useEffect(() => {
    if (!blob) return;
    const preview = createRecordingPreview(blob);
    setPreviewUrl(preview.url);
    return () => preview.dispose();
  }, [blob]);
  useEffect(() => {
    if (status !== "recording") return;
    const t = setInterval(() => setSeconds((v) => v + 0.1), 100);
    return () => clearInterval(t);
  }, [status]);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
  return (
    <div className="recording-backdrop">
      <section className="recording-sheet">
        <div className="sheet-handle" />
        <header>
          <button
            onClick={() => {
              session.current?.dispose();
              onCancel();
            }}
          >
            取消
          </button>
          <div>
            <strong>新录音</strong>
            <small>
              今天{" "}
              {new Date().toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </div>
          <button
            disabled={!blob || busy}
            onClick={async () => {
              if (!blob) return;
              setBusy(true);
              try {
                await onDone(
                  new File(
                    [blob],
                    `新录音.${blob.type.includes("mp4") ? "m4a" : "webm"}`,
                    { type: blob.type },
                  ),
                );
              } catch (e) {
                setError(errText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            完成
          </button>
        </header>
        <div className="waveform">
          <div className="wave-bars">
            {levels.map((h, i) => (
              <i key={i} style={{ height: `${h}px` }} />
            ))}
          </div>
          <div className="recording-playhead" />
        </div>
        {error ? (
          <p className="recording-error">{error}</p>
        ) : (
          <>
            <div className="recording-time">{time}</div>
            <p className="recording-subtitle">
              {status === "recording"
                ? "正在录音"
                : status === "paused"
                  ? "已暂停"
                  : status === "stopped"
                    ? "录音已完成"
                    : "正在准备麦克风…"}
            </p>
            <div className="recording-controls">
              <button
                disabled={!session.current?.recorder || status === "stopped"}
                aria-label={status === "paused" ? "继续录音" : "暂停录音"}
                onClick={() => {
                  if (status === "recording") {
                    if (session.current?.pause()) setStatus("paused");
                  } else if (status === "paused") {
                    if (session.current?.resume()) setStatus("recording");
                  }
                }}
              >
                {status === "paused" ? (
                  <Play fill="currentColor" />
                ) : (
                  <Pause fill="currentColor" />
                )}
              </button>
              <button
                disabled={!session.current?.recorder || status === "stopped"}
                aria-label="结束录音"
                onClick={() => {
                  session.current?.stop();
                }}
              >
                <StopCircle size={30} />
              </button>
            </div>
            {blob && previewUrl && <audio controls src={previewUrl} />}
          </>
        )}
      </section>
    </div>
  );
}
export default App;
