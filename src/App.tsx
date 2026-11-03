import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { type Editor, type JSONContent } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { exit, onBackButtonPress } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
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
} from "lucide-react";
import { action, loadWorkspace, native, storeAttachment } from "./bridge";
import NoteEditor from "./Editor";
import {
  documentText,
  type DrawingStroke,
  type Folder as FolderData,
  type Note,
  type Settings,
  type Workspace,
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
  const [sidebar, setSidebar] = useState(true);
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState(0);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");
  const [showFind, setShowFind] = useState(false);
  const [notice, setNotice] = useState("");
  const [draw, setDraw] = useState<{
    strokes: DrawingStroke[];
    pos?: number;
  } | null>(null);
  const [record, setRecord] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 700);
  const queues = useRef(new Map<string, Promise<unknown>>());
  const revisions = useRef(new Map<string, number>());
  const pendingDocs = useRef(new Map<string, JSONContent>());
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const separate = new URLSearchParams(location.search).get("note");
  const current = ws.notes.find((n) => n.id === noteId);
  const currentFolder = ws.folders.find((f) => f.id === folderId);
  const selected = ws.notes.find((n) => n.id === (contextNote || noteId));
  const theme = settings.theme || "system";
  const view = settings.view || "list";
  const sort = settings.sort || "updated";
  const onReady = useCallback((e: Editor | null) => setEditor(e), []);
  const fail = useCallback((e: unknown) => setError(errText(e)), []);
  const hydrate = useCallback((data: Workspace) => {
    data.notes.forEach((n) => revisions.current.set(n.id, n.revision));
    setWs(data);
    setSettings(data.settings);
  }, []);
  useEffect(() => {
    loadWorkspace()
      .then((data) => {
        hydrate(data);
        setFolderId(String(data.settings.selectedFolder || "default"));
        const selectedId = separate || String(data.settings.selectedNote || "");
        if (data.notes.some((n) => n.id === selectedId)) {
          setNoteId(selectedId);
          if (separate) setPage("editor");
        }
      })
      .catch(fail)
      .finally(() => setLoading(false));
  }, [hydrate, fail, separate]);
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 700);
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
  }, []);
  const refresh = useCallback(async () => {
    await flush();
    hydrate(await loadWorkspace());
  }, [flush, hydrate]);
  const doAction = useCallback(
    async (a: Record<string, unknown>) => {
      await flush();
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
      setSettings((prev) => ({ ...prev, ...patch }));
      setWs((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
      action({ type: "settings", settings: patch }).catch(fail);
    },
    [fail],
  );
  const saveDoc = useCallback(
    (id: string, doc: JSONContent) => {
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
            document: doc,
            revision: revisions.current.get(id) || 0,
          });
          revisions.current.set(id, n.revision);
          if (pendingDocs.current.get(id) === doc)
            pendingDocs.current.delete(id);
          setWs((prev) => ({
            ...prev,
            notes: prev.notes.map((old) =>
              old.id === id ? { ...old, revision: n.revision } : old,
            ),
          }));
        })
        .catch(fail)
        .finally(() => setSaving((v) => Math.max(0, v - 1)));
      queues.current.set(id, next);
    },
    [fail],
  );
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
            await flush();
            if (!pendingDocs.current.size) await getCurrentWindow().destroy();
            else setError("还有未保存的更改，请保持窗口打开并重试保存。");
          }
        })
        .then((fn) => (unlisten = fn));
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      unlisten?.();
    };
  }, [flush, fail]);
  const chooseFolder = (id: string) => {
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
    setNoteId(n.id);
    setPage("editor");
    setMenu(null);
    setSwiped(null);
    setShowFind(false);
    setEditing(false);
    updateSettings({ selectedNote: n.id });
  };
  const newNote = useCallback(async () => {
    try {
      await flush();
      const fid =
        folderId === "all" || folderId === "trash" ? "default" : folderId;
      const n = await action<Note>({ type: "createNote", folderId: fid });
      revisions.current.set(n.id, n.revision);
      setWs((prev) => ({ ...prev, notes: [n, ...prev.notes] }));
      setNoteId(n.id);
      setPage("editor");
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
  }, [fail, flush, folderId, updateSettings]);
  const openModal = (type: string, value = "") => {
    setModal(type);
    setModalValue(value);
    setMenu(null);
  };
  const back = () => {
    setMenu(null);
    setEditing(false);
    setShowFind(false);
    if (separate && native) getCurrentWindow().close();
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
    if (modal) setModal(null);
    else if (menu) setMenu(null);
    else if (draw) setDraw(null);
    else if (record) setRecord(false);
    else if (showFind) setShowFind(false);
    else if (searching) {
      setSearching(false);
      setQuery("");
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
          await invoke("export_archive", { path });
          setNotice("本地备份已导出");
        } else {
          const data = await invoke<Workspace>("import_archive", { path });
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
        setSearching(true);
        setTimeout(() => searchInput.current?.focus(), 0);
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
        if (modal) setModal(null);
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
  }, [newNote, page, mobile, modal, menu, showFind, searching]);
  useEffect(() => {
    if (!native) return;
    let unlisten: (() => void) | undefined;
    listen<string>("menu-action", (e) => {
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
          setSearching(true);
          searchInput.current?.focus();
          break;
        case "export":
          archive("export");
          break;
        case "import":
          archive("import");
          break;
      }
    }).then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, [newNote, view, updateSettings, archive]);
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
    if (!files || !current || !editor) return;
    try {
      for (const file of Array.from(files)) {
        const a = await storeAttachment(current.id, file);
        editor
          .chain()
          .focus()
          .insertContent({
            type: "attachment",
            attrs: { id: a.id, name: a.displayName, kind: a.kind },
          })
          .run();
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
  const shareNote = async () => {
    setMenu(null);
    if (!current) return;
    try {
      const data = { title: current.title, text: current.plainText };
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(current.plainText);
        setNotice("备忘录已复制，可粘贴分享。");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) fail(e);
    }
  };
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
            onClick={() => setMenu(menu === "format" ? null : "format")}
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
        setUnlocked((prev) => {
          const n = new Set(prev);
          n.delete(selected.id);
          return n;
        });
      } else if (modal === "unlock") {
        if (!current) return;
        await doAction({
          type: "unlockNote",
          id: current.id,
          password: modalValue,
        });
        setUnlocked((prev) => new Set(prev).add(current.id));
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
            setMenu(null);
            setContextNote(null);
          }}
        />
        <div
          className={`popover menu-${menu}`}
          role="menu"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
          }}
        >
          {menu === "format" && (
            <>
              <div className="type-styles">
                {[
                  { t: "标题", level: 1 },
                  { t: "大标题", level: 2 },
                  { t: "小标题", level: 3 },
                  { t: "正文", level: 0 },
                ].map((x) => (
                  <MenuRow
                    key={x.t}
                    checked={
                      x.level
                        ? editor?.isActive("heading", { level: x.level })
                        : editor?.isActive("paragraph")
                    }
                    onClick={() => {
                      if (x.level)
                        editor
                          ?.chain()
                          .focus()
                          .setHeading({ level: x.level as 1 | 2 | 3 })
                          .run();
                      else editor?.chain().focus().setParagraph().run();
                      setMenu(null);
                    }}
                  >
                    <span className={`style-${x.level}`}>{x.t}</span>
                  </MenuRow>
                ))}
                <MenuRow
                  checked={editor?.isActive("codeBlock")}
                  onClick={() => {
                    editor?.chain().focus().toggleCodeBlock().run();
                    setMenu(null);
                  }}
                >
                  等宽
                </MenuRow>
              </div>
              <div className="format-inline">
                {[
                  {
                    label: "粗体",
                    icon: <Bold />,
                    command: () => editor?.chain().focus().toggleBold().run(),
                  },
                  {
                    label: "斜体",
                    icon: <Italic />,
                    command: () => editor?.chain().focus().toggleItalic().run(),
                  },
                  {
                    label: "下划线",
                    icon: <Underline />,
                    command: () =>
                      editor?.chain().focus().toggleUnderline().run(),
                  },
                  {
                    label: "删除线",
                    icon: <Strikethrough />,
                    command: () => editor?.chain().focus().toggleStrike().run(),
                  },
                ].map((x) => (
                  <IconButton key={x.label} label={x.label} onClick={x.command}>
                    {x.icon}
                  </IconButton>
                ))}
              </div>
              <div className="highlight-colors">
                {["#e8c1f0", "#f6bfd4", "#fac69c", "#fae780", "#b3dfbd"].map(
                  (c) => (
                    <button
                      key={c}
                      aria-label={`高亮 ${c}`}
                      style={{ background: c }}
                      onClick={() =>
                        editor
                          ?.chain()
                          .focus()
                          .toggleHighlight({ color: c })
                          .run()
                      }
                    />
                  ),
                )}
              </div>
              <div className="menu-divider" />
              <MenuRow
                icon={<List size={18} />}
                checked={editor?.isActive("bulletList")}
                onClick={() => {
                  editor?.chain().focus().toggleBulletList().run();
                  setMenu(null);
                }}
              >
                项目符号列表
              </MenuRow>
              <MenuRow
                icon={<ListOrdered size={18} />}
                checked={editor?.isActive("orderedList")}
                onClick={() => {
                  editor?.chain().focus().toggleOrderedList().run();
                  setMenu(null);
                }}
              >
                编号列表
              </MenuRow>
              <MenuRow
                onClick={() => {
                  editor
                    ?.chain()
                    .focus()
                    .sinkListItem(
                      editor.isActive("taskItem") ? "taskItem" : "listItem",
                    )
                    .run();
                  setMenu(null);
                }}
              >
                增加缩进
              </MenuRow>
              <MenuRow
                onClick={() => {
                  editor
                    ?.chain()
                    .focus()
                    .liftListItem(
                      editor.isActive("taskItem") ? "taskItem" : "listItem",
                    )
                    .run();
                  setMenu(null);
                }}
              >
                减少缩进
              </MenuRow>
              <MenuRow
                onClick={() => {
                  editor?.chain().focus().unsetAllMarks().clearNodes().run();
                  setMenu(null);
                }}
              >
                清除格式
              </MenuRow>
            </>
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
                      navigator.clipboard
                        .writeText(n.plainText)
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
  return (
    <div
      className={`app ${mobile ? "mobile" : "desktop"} page-${page} ${!sidebar ? "sidebar-hidden" : ""} ${separate ? "separate" : ""}`}
      style={
        {
          "--sidebar-width": `${settings.sidebarWidth || 228}px`,
          "--list-width": `${settings.listWidth || 280}px`,
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
                <IconButton label="显示文件夹" onClick={() => setSidebar(true)}>
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
                        chooseNote(n);
                      }}
                      onDoubleClick={() => {
                        if (!mobile) openSeparate(n);
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
                        <div
                          className={`gallery-preview paper-${n.paperStyle}`}
                        >
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
        className={`editor-pane paper-${current?.paperStyle || "plain"}`}
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
        <header
          className="editor-header"
          data-tauri-drag-region
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
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
                  key={`${current.id}-${unlocked.has(current.id)}`}
                  note={current}
                  onChange={saveDoc}
                  onReady={onReady}
                  onFocus={setEditing}
                />
              )}
            </div>
            {mobile && !current.deletedAt && (editing ? tools() : tools(true))}
          </>
        )}
        {saving > 0 && (
          <div className="save-status" aria-live="polite">
            正在保存…
          </div>
        )}
      </main>
      {renderMenu()}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
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
                  <button onClick={() => setModal(null)}>取消</button>
                  <strong>横线与网格</strong>
                  <span />
                </div>
                <p className="paper-description">
                  更改此备忘录中书写和绘图的背景样式。
                </p>
                <div className="paper-options">
                  {[
                    "plain",
                    "lines-small",
                    "lines-medium",
                    "lines-large",
                    "grid-small",
                    "grid-large",
                  ].map((p) => (
                    <button
                      key={p}
                      aria-label={p}
                      className={`paper-option paper-${p} ${current?.paperStyle === p ? "selected" : ""}`}
                      onClick={async () => {
                        await patch({
                          type: "patchNote",
                          id: current?.id,
                          paperStyle: p,
                        });
                        setModal(null);
                      }}
                    />
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
                    onClick={() =>
                      patch({ type: "closeLocks" }).then(() =>
                        setUnlocked(new Set()),
                      )
                    }
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
          onCancel={() => setRecord(false)}
          onDone={async (file) => {
            if (!current || !editor) return;
            try {
              const a = await storeAttachment(current.id, file);
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
function DrawingPanel({
  initial,
  onCancel,
  onDone,
}: {
  initial: DrawingStroke[];
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
      <div className="drawing-surface">
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
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    let ctx: AudioContext | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error("设备未提供录音访问，请检查麦克风权限。");
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
          (x) => MediaRecorder.isTypeSupported(x),
        );
        const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        recorder.current = r;
        r.ondataavailable = (e) => {
          if (e.data.size) chunks.current.push(e.data);
        };
        r.onstop = () => {
          setBlob(new Blob(chunks.current, { type: r.mimeType }));
          setStatus("stopped");
        };
        r.start(250);
        setStatus("recording");
        ctx = new AudioContext();
        const analyzer = ctx.createAnalyser();
        analyzer.fftSize = 64;
        ctx.createMediaStreamSource(s).connect(analyzer);
        const data = new Uint8Array(analyzer.frequencyBinCount);
        timer = setInterval(() => {
          if (r.state !== "recording") return;
          analyzer.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setLevels((v) => [...v.slice(-89), Math.max(2, avg)]);
        }, 100);
      } catch (e) {
        setError(errText(e));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, []);
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
          <button onClick={onCancel}>取消</button>
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
                disabled={!recorder.current || status === "stopped"}
                aria-label={status === "paused" ? "继续录音" : "暂停录音"}
                onClick={() => {
                  if (status === "recording") {
                    recorder.current?.pause();
                    setStatus("paused");
                  } else if (status === "paused") {
                    recorder.current?.resume();
                    setStatus("recording");
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
                disabled={!recorder.current || status === "stopped"}
                aria-label="结束录音"
                onClick={() => {
                  recorder.current?.stop();
                  stream.current?.getTracks().forEach((t) => t.stop());
                }}
              >
                <StopCircle size={30} />
              </button>
            </div>
            {blob && <audio controls src={URL.createObjectURL(blob)} />}
          </>
        )}
      </section>
    </div>
  );
}
export default App;
