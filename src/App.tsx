import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { type Editor, type JSONContent } from "@tiptap/react";
import { editorSaveSnapshot } from "./editor-save-snapshot";
import {
  attachmentRecordedAt,
  type RecordingResult,
} from "./recording-metadata";
import { TagComposition } from "./tag-composition";
import { SmartFolderForm, type FolderFormHandle } from "./SmartFolderForm";
import { draftQuery, type FolderDraft } from "./smart-draft";
import {
  isPhysicalOwner,
  matchesSmart,
  projectFolders,
  sortNotes,
} from "./smart-folders";
import {
  documentTags,
  projectTags,
  tagSelectionAfterAccess,
} from "./note-tags";
import { SaveRevisions } from "./save-revisions";
import { secureId } from "./secure-id";
import { enqueueSave, type SaveOutcome } from "./save-queue";
import {
  TrustedSynchronization,
  type SynchronizationResult,
} from "./trusted-synchronization";
import {
  AttachmentSubmission,
  documentReferencesAttachment,
} from "./attachment-submission";
import {
  rebindAttachmentTarget,
  type AttachmentTarget,
} from "./attachment-target";
type PickerTarget = AttachmentTarget<Editor, SelectionBookmark>;
type PickerBatch = {
  target: PickerTarget;
  operationIds: string[];
  files?: File[];
  cancelRequested?: boolean;
  recording?: RecordingTicket;
};
type RecordingTicket = {
  batch: PickerBatch;
  accepting: boolean;
  detached: boolean;
  file?: File;
  recordedAt?: number;
  running?: Promise<void>;
  cancelling?: Promise<void>;
};
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
  FolderCog,
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
  storeAttachmentOperation,
  queryAttachmentOperation,
  cancelAttachmentOperation,
  readNoteText,
  exportArchive,
  importArchive,
  registerSaveIntent,
  acknowledgeAccess,
  subscribeAccess,
  invalidateAccessRequests,
  accessGate,
  metadataGate,
  subscribeMetadata,
  markWorkspaceApplied,
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
import { AccessChanged } from "./access-client";
import { MetadataStale } from "./metadata-client";
import type { AccessStamp } from "./access-client";
import NoteEditor from "./Editor";
import { documentsEqual } from "./document-equality";
import {
  projectSearchNote,
  shouldClearSearchAfterAccessChange,
} from "./search-selection";
import { SearchEditorGate } from "./search-editor-gate";
import RecordingPanel from "./RecordingPanel";
import { Fragment, Slice } from "@tiptap/pm/model";
import {
  OcrHost,
  ocrParagraphs,
  type OcrSource,
  type OcrState,
} from "./ocr-host";
import { ocrNative } from "./ocr-native";
import OcrPanel from "./OcrPanel";
import linesSmallPreview from "../assets/mobile-paper-previews/lines-small.svg";
import linesMediumPreview from "../assets/mobile-paper-previews/lines-medium.svg";
import linesLargePreview from "../assets/mobile-paper-previews/lines-large.svg";
import gridSmallPreview from "../assets/mobile-paper-previews/grid-small.svg";
import gridMediumPreview from "../assets/mobile-paper-previews/grid-medium.svg";
import gridLargePreview from "../assets/mobile-paper-previews/grid-large.svg";
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

const desktopPaperOptions = [
  "plain",
  "lines-small",
  "lines-medium",
  "lines-large",
  "grid-small",
  "grid-medium",
  "grid-large",
] as const;
type PaperOption = (typeof desktopPaperOptions)[number];
const mobilePaperOptions = [
  "plain",
  "lines-small",
  "lines-medium",
  "lines-large",
  "grid-small",
  "grid-medium",
  "grid-large",
] as const satisfies readonly PaperOption[];
const paperOptionLabels: Record<PaperOption, string> = {
  plain: "空白",
  "lines-small": "密横线",
  "lines-medium": "中横线",
  "lines-large": "疏横线",
  "grid-small": "密网格",
  "grid-medium": "中网格",
  "grid-large": "疏网格",
};
const paperPreviewUrls: Record<Exclude<PaperOption, "plain">, string> = {
  "lines-small": linesSmallPreview,
  "lines-medium": linesMediumPreview,
  "lines-large": linesLargePreview,
  "grid-small": gridSmallPreview,
  "grid-medium": gridMediumPreview,
  "grid-large": gridLargePreview,
};
type PaperPreviewStyle = CSSProperties & { "--paper-preview-url": string };

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
// Keep the pre-search editor mounted so its pending document and Undo history
// remain owned by the same note. A parked editor is neither visible nor writable.
function SearchEditorHost({
  note,
  active,
  blocked,
  gate,
  onChange,
  onReady,
  onFocus,
  onDate,
}: {
  note: Note;
  active: boolean;
  blocked: boolean;
  gate: SearchEditorGate;
  onChange: (id: string, doc: JSONContent) => void;
  onReady: (id: string, editor: Editor | null) => void;
  onFocus: (focused: boolean) => void;
  onDate: () => void;
}) {
  const instance = useRef<Editor | null>(null);
  const activeRef = useRef(active);
  const blockedRef = useRef(blocked);
  activeRef.current = active;
  blockedRef.current = blocked;
  const ready = useCallback(
    (editor: Editor | null) => {
      instance.current = editor;
      if (editor && !editor.isDestroyed) {
        if (activeRef.current) gate.activate(editor, blockedRef.current);
        else gate.park(editor);
      }
      onReady(note.id, editor);
    },
    [note.id, onReady, gate],
  );
  useLayoutEffect(
    () => () => {
      const editor = instance.current;
      if (editor && !editor.isDestroyed) gate.park(editor);
    },
    [gate],
  );
  useLayoutEffect(() => {
    const editor = instance.current;
    if (!editor || editor.isDestroyed) return;
    if (active) gate.activate(editor, blocked);
    else {
      gate.park(editor);
      if (editor.isFocused) editor.view.dom.blur();
    }
  });
  return (
    <div
      className="editor-scroll"
      hidden={!active}
      inert={!active}
      aria-hidden={!active || undefined}
      style={active ? undefined : { display: "none" }}
    >
      <button className="note-date" onClick={onDate}>
        {fmtDate(note.updatedAt)}
      </button>
      <NoteEditor
        note={note}
        onChange={onChange}
        onReady={ready}
        onFocus={(focused) => {
          if (activeRef.current) onFocus(focused);
        }}
      />
    </div>
  );
}
function App() {
  const separate = new URLSearchParams(location.search).get("note");
  const [ws, setWs] = useState<Workspace>(empty);
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const [loading, setLoading] = useState(true);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState("default");
  const [baseNoteId, setNoteId] = useState<string | null>(null);
  const [searchNoteId, setSearchNoteId] = useState<string | null>(null);
  const [page, setPage] = useState<"folders" | "notes" | "editor">("folders");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState("");
  // undefined = physical folder; null = all committed tags; name = exact tag.
  const [tagFilter, setTagFilter] = useState<string | null | undefined>();
  const [menu, setMenu] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [contextNote, setContextNote] = useState<string | null>(null);
  const [contextFolder, setContextFolder] = useState<string | null>(null);
  const [folderForm, setFolderForm] = useState<{ folder?: FolderData } | null>(
    null,
  );
  const folderFormHandle = useRef<FolderFormHandle | null>(null);
  const smartDeleteTarget = useRef<{ id: string; revision: number } | null>(
    null,
  );
  const parkedSmartEditors = useRef(new Set<string>());
  const smartDisplayed = useRef<{
    folderId: string;
    noteId: string;
    navigation: number;
  } | null>(null);
  const [editors, setEditors] = useState<ReadonlyMap<string, Editor>>(
    new Map(),
  );
  const tagCompositions = useRef(new Map<string, TagComposition>());
  const tagCompositionTarget = useRef<{
    noteId: string;
    composition: TagComposition;
    cycle: number;
    scope: string;
    stamp: AccessStamp;
  } | null>(null);
  const tagCompositionNavigation = useRef(0);
  const [, updateTagComposition] = useState(0);
  const tagCompositionSettled = useRef(
    (_id: string, _composition: TagComposition, _cycle: number) => {},
  );
  const clearTagComposition = useCallback(() => {
    tagCompositionNavigation.current++;
    if (!tagCompositionTarget.current) return;
    tagCompositionTarget.current = null;
    updateTagComposition((value) => value + 1);
  }, []);
  const editorGate = useRef(new SearchEditorGate()).current;
  const editorsRef = useRef(editors);
  editorsRef.current = editors;
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
  const ocrOperation = useRef<OcrHost<PickerTarget> | null>(null);
  const [ocr, setOcr] = useState<OcrHost<PickerTarget> | null>(null);
  const [ocrState, setOcrState] = useState<OcrState>({
    phase: "choose",
    text: "",
    error: "",
  });
  const ocrLifecycle = useRef({
    active: (): boolean => false,
    close: async () => {},
    suspend: (_ids: string[]) => {},
    detach: () => {},
  });
  const recordingTicket = useRef<RecordingTicket | null>(null);
  const recordingLifecycle = useRef({
    active: (): boolean => false,
    close: async () => {},
    suspend: (_ids: string[]) => {},
    detach: () => {},
  });
  // Every picker and recording retains its explicit original owner.
  const pickerTargets = useRef(new Map<HTMLInputElement, PickerBatch>());
  const attachmentSubmissions = useRef(
    new Map<string, AttachmentSubmission<PickerTarget>>(),
  );
  const attachmentBatches = useRef(new Set<PickerBatch>());
  const pickerRuntime = useRef<{
    scope: string;
    noteId: string | null;
    editor: Editor | null;
    available: boolean;
    ocrAvailable: boolean;
    recordingAvailable: boolean;
  }>({
    scope: "",
    noteId: null,
    editor: null,
    available: false,
    ocrAvailable: false,
    recordingAvailable: false,
  });
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
  const synchronizeRef = useRef<
    () => Promise<SynchronizationResult<Workspace>>
  >(async () => ({
    success: false,
    sequence: 0,
    error: Error("同步尚未就绪"),
  }));
  const synchronization = useRef(
    new TrustedSynchronization<Workspace>(),
  ).current;
  const synchronizingRef = useRef(false);
  const initializedSelection = useRef(false);
  const metadataRefreshRef = useRef<
    (force?: boolean) => Promise<Workspace | undefined>
  >(async () => undefined);
  const metadataRefreshRunning = useRef<
    Promise<Workspace | undefined> | undefined
  >(undefined);
  const metadataRefreshAgain = useRef(false);
  const metadataDisposed = useRef(false);
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
  const paperOptions = mobile ? mobilePaperOptions : desktopPaperOptions;
  const queues = useRef(new Map<string, Promise<SaveOutcome>>());
  const revisions = useRef(new SaveRevisions());
  const externalVersions = useRef(new Map<string, number>());
  const pendingDocs = useRef(new Map<string, JSONContent>());
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = settings.theme || "system";
  const view = settings.view || "list";
  const sort = settings.sort || "updated";
  const tags = projectTags(ws, accessSuspended);
  const currentFolder = ws.folders.find((f) => f.id === folderId);
  const smartFolder =
    currentFolder?.kind === "smart" ? currentFolder : undefined;
  const folderProjection = projectFolders(ws, accessSuspended, sort);
  const currentProjection = folderProjection.get(folderId);
  const contentSearch =
    !separate && (!!query || !!filter || tagFilter !== undefined);
  const folderMembers = new Set(currentProjection?.ids || []);
  const listed = sortNotes(
    ws.notes.filter((n) => {
      if (query || filter || tagFilter !== undefined) {
        if (n.deletedAt) return false;
      } else if (!folderMembers.has(n.id)) return false;
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
      const names = tags.notes.get(n.id) || [];
      if ((filter === "tags" || tagFilter !== undefined) && !names.length)
        return false;
      if (typeof tagFilter === "string" && !names.includes(tagFilter))
        return false;
      if (
        ["audio", "image", "file", "video"].includes(filter) &&
        !ws.attachments.some((a) => a.noteId === n.id && a.kind === filter)
      )
        return false;
      return true;
    }),
    sort,
  );
  const desktopSearch = !separate && (contentSearch || !!smartFolder);
  const desktopSearchZero =
    desktopSearch &&
    !!query &&
    !mobile &&
    view === "list" &&
    workspaceLoaded &&
    !loading &&
    !synchronizing &&
    !syncError &&
    !accessSuspended.length &&
    !accessGate.state?.operationId &&
    listed.length === 0;
  const projectedNoteId =
    !contentSearch && smartFolder
      ? baseNoteId && folderMembers.has(baseNoteId)
        ? baseNoteId
        : (currentProjection?.firstId ?? null)
      : projectSearchNote({
          searching: contentSearch,
          baseNoteId,
          searchNoteId,
          resultIds: listed.map((note) => note.id),
        });
  const tagCompositionScope = JSON.stringify({
    folderId,
    baseNoteId,
    searchNoteId,
    page,
    query,
    filter,
    tagFilter,
    view,
  });
  const tagNavigation = tagCompositionNavigation.current;
  const previousSmart = smartDisplayed.current;
  if (
    smartFolder &&
    !contentSearch &&
    previousSmart?.folderId === folderId &&
    previousSmart.navigation === tagNavigation &&
    previousSmart.noteId !== projectedNoteId &&
    !tagCompositionTarget.current
  ) {
    const composition = tagCompositions.current.get(previousSmart.noteId),
      instance = composition?.editor;
    const previousNote = ws.notes.find((n) => n.id === previousSmart.noteId);
    if (
      composition?.pending &&
      instance?.view.composing &&
      instance.view.hasFocus() &&
      instance.isEditable &&
      !instance.isDestroyed &&
      previousNote &&
      !previousNote.deletedAt &&
      !previousNote.locked &&
      !blockedNotes.current.has(previousNote.id) &&
      !accessGate.state?.operationId
    ) {
      tagCompositionTarget.current = {
        noteId: previousNote.id,
        composition,
        cycle: composition.cycle,
        scope: tagCompositionScope,
        stamp: accessGate.stamp(previousNote.id),
      };
    }
  }
  const held = tagCompositionTarget.current;
  const heldNote = held && ws.notes.find((note) => note.id === held.noteId);
  const heldStamp = held && accessGate.stamp(held.noteId);
  const retainTagComposition = !!(
    held &&
    projectedNoteId !== held.noteId &&
    heldNote &&
    !heldNote.deletedAt &&
    !heldNote.locked &&
    desktopSearch &&
    (filter === "tags" || tagFilter !== undefined || !!smartFolder) &&
    held.scope === tagCompositionScope &&
    held.composition === tagCompositions.current.get(held.noteId) &&
    held.cycle === held.composition.cycle &&
    held.composition.pending &&
    !held.composition.editor.isDestroyed &&
    held.composition.editor.isEditable &&
    editors.get(held.noteId) === held.composition.editor &&
    nativeEditorOwners.current.get(held.composition.editor) === held.noteId &&
    !blockedNotes.current.has(held.noteId) &&
    !accessSuspended.includes(held.noteId) &&
    !accessGate.state?.operationId &&
    heldStamp?.sessionId === held.stamp.sessionId &&
    heldStamp?.noteEpoch === held.stamp.noteEpoch &&
    accessGate.state?.notes[held.noteId]?.authorized !== false
  );
  if (held && !retainTagComposition) tagCompositionTarget.current = null;
  // Only the displayed original target is retained. Results/catalog/counts stay
  // the real legal projection, and no other matching note becomes active mid-IME.
  const noteId = retainTagComposition ? held!.noteId : projectedNoteId;
  const current = ws.notes.find((n) => n.id === noteId);
  if (smartFolder) {
    if (baseNoteId) parkedSmartEditors.current.add(baseNoteId);
    if (noteId) parkedSmartEditors.current.add(noteId);
  }
  smartDisplayed.current =
    smartFolder && noteId
      ? { folderId, noteId, navigation: tagNavigation }
      : null;
  const selected = ws.notes.find(
    (n) =>
      n.id === (desktopSearch && !listed.length ? null : contextNote || noteId),
  );
  const editor = noteId ? editors.get(noteId) || null : null;
  const onReady = useCallback(
    (id: string, instance: Editor | null) => {
      const previousComposition = tagCompositions.current.get(id);
      if (previousComposition && previousComposition.editor !== instance) {
        if (tagCompositionTarget.current?.composition === previousComposition)
          clearTagComposition();
        previousComposition.dispose();
        tagCompositions.current.delete(id);
      }
      if (instance) {
        nativeEditorOwners.current.set(instance, id);
        if (!tagCompositions.current.has(id)) {
          const composition = new TagComposition(
            instance,
            (cycle) => tagCompositionSettled.current(id, composition, cycle),
            () => {
              const target = tagCompositionTarget.current;
              if (
                target?.composition === composition &&
                target.cycle !== composition.cycle
              )
                clearTagComposition();
            },
          );
          tagCompositions.current.set(id, composition);
        }
      }
      setEditors((previous) => {
        if (previous.get(id) === instance || (!instance && !previous.has(id)))
          return previous;
        const next = new Map(previous);
        if (instance) next.set(id, instance);
        else next.delete(id);
        return next;
      });
    },
    [clearTagComposition],
  );
  const restoreEditor = useCallback(
    (instance: Editor, editable: boolean) => {
      const owner = nativeEditorOwners.current.get(instance);
      editorGate.restore(
        instance,
        editable,
        !owner || blockedNotes.current.has(owner),
      );
    },
    [editorGate],
  );
  useEffect(() => {
    if (!desktopSearch) setSearchNoteId(null);
    else {
      setContextNote(null);
      setMenu(null);
      setShowFind(false);
      setEditing(false);
    }
  }, [desktopSearch, query, filter, tagFilter]);
  const fail = useCallback((e: unknown) => setError(errText(e)), []);
  const hydrate = useCallback((data: Workspace, passive = false) => {
    if (!metadataGate.canPublish(data.metadata)) return false;
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
      if (!pending && old && !documentsEqual(old.document, n.document))
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
    const next = {
      ...data,
      notes,
      ...(passive ? { settings: wsRef.current.settings } : {}),
    };
    wsRef.current = next;
    setWs(next);
    if (!passive) setSettings(data.settings);
    markWorkspaceApplied(next);
    return true;
  }, []);
  const restoreSelection = useCallback(
    (data: Workspace) => {
      const restoredFolder = String(data.settings.selectedFolder || "default");
      setFolderId(
        restoredFolder === "all" ||
          data.folders.some((f) => f.id === restoredFolder)
          ? restoredFolder
          : "default",
      );
      const selectedId = separate || String(data.settings.selectedNote || "");
      setNoteId(
        data.notes.some((n) => n.id === selectedId) ? selectedId : null,
      );
      if (separate && data.notes.some((n) => n.id === selectedId))
        setPage("editor");
    },
    [separate],
  );
  metadataRefreshRef.current = (force = true) => {
    metadataRefreshAgain.current ||= force;
    if (metadataRefreshRunning.current) return metadataRefreshRunning.current;
    const work = (async () => {
      await Promise.resolve();
      let latest: Workspace | undefined;
      do {
        metadataRefreshAgain.current = false;
        if (
          !initializedSelection.current ||
          metadataDisposed.current ||
          synchronizingRef.current ||
          accessGate.state?.operationId
        )
          return;
        try {
          const data = await loadWorkspace();
          if (
            metadataDisposed.current ||
            synchronizingRef.current ||
            accessGate.state?.operationId
          )
            return;
          if (!hydrate(data, true)) {
            metadataRefreshAgain.current = true;
            continue;
          }
          latest = data;
        } catch (error) {
          if (error instanceof MetadataStale) {
            metadataRefreshAgain.current = true;
            continue;
          }
          if (error instanceof AccessChanged) {
            await synchronizeRef.current();
            return;
          }
          fail(error);
          return;
        }
      } while (metadataRefreshAgain.current || metadataGate.needsRefresh);
      return latest;
    })();
    metadataRefreshRunning.current = work;
    void work
      .finally(() => {
        if (metadataRefreshRunning.current === work)
          metadataRefreshRunning.current = undefined;
      })
      .catch(fail);
    return work;
  };
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let unlistenMetadata: (() => void) | undefined;
    metadataDisposed.current = false;
    (async () => {
      unlisten = await subscribeAccess((event) => accessHandler.current(event));
      unlistenMetadata = await subscribeMetadata((event) => {
        if (event.metadata.sessionId !== accessGate.state?.sessionId) {
          void synchronizeRef.current();
          return;
        }
        if (metadataGate.needsRefresh) void metadataRefreshRef.current(false);
      });
      if (disposed) {
        unlistenMetadata();
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
      metadataDisposed.current = true;
      unlisten?.();
      unlistenMetadata?.();
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
      if (
        result.value &&
        typeof result.value === "object" &&
        "notes" in result.value
      )
        hydrate(result.value as Workspace, true);
      else await metadataRefreshRef.current();
      if (result.maintenanceError) fail(result.maintenanceError);
      return result;
    },
    [flush, hydrate, refresh],
  );
  const updateSettings = useCallback(
    (patch: Settings) => {
      if (patch.view) setGalleryEditor(false);
      wsRef.current = {
        ...wsRef.current,
        settings: { ...wsRef.current.settings, ...patch },
      };
      setSettings((prev) => ({ ...prev, ...patch }));
      setWs((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
      action({ type: "settings", settings: patch }).catch(fail);
    },
    [fail],
  );
  useEffect(() => {
    if (!workspaceLoaded || folderId === "all" || currentFolder) return;
    const original = ws.notes.find((n) => n.id === baseNoteId && !n.deletedAt);
    const source =
      original && ws.folders.find((f) => f.id === original.folderId);
    const destination = isPhysicalOwner(source) ? source!.id : "default";
    // Definitions are views. Deleting one neither drains nor reassigns the
    // parked note's pending document, revision baseline, or physical owner.
    setFolderId(destination);
    if (!original)
      setNoteId(folderProjection.get(destination)?.firstId ?? null);
    updateSettings({
      selectedFolder: destination,
      ...(!original
        ? { selectedNote: folderProjection.get(destination)?.firstId ?? "" }
        : {}),
    });
  }, [
    workspaceLoaded,
    folderId,
    currentFolder,
    ws.folders,
    baseNoteId,
    updateSettings,
  ]);
  const saveDoc = useCallback(
    (id: string, doc: JSONContent) => {
      if (blockedNotes.current.has(id)) {
        const error = Error("备忘录正在同步锁定状态");
        fail(error);
        return Promise.resolve<SaveOutcome>({ saved: false, error });
      }
      const ticket = registerSaveIntent(id);
      void ticket.catch(() => {}); // The queued save handles and retains registration failures.
      pendingDocs.current.set(id, doc);
      const text = documentText(doc);
      const updatedAt = Date.now();
      const optimistic = (prev: Workspace): Workspace => ({
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === id
            ? {
                ...n,
                document: doc,
                plainText: text,
                title: text.split("\n")[0] || "新备忘录",
                updatedAt,
              }
            : n,
        ),
      });
      // A fast local/IPC ACK may precede React's render. Hydration must compare
      // against this own submitted body rather than invent an external change.
      wsRef.current = optimistic(wsRef.current);
      setWs(optimistic);
      setSaving((v) => v + 1);
      const next = enqueueSave(
        queues.current.get(id),
        async () => {
          const delivery = await action<Note>({
            type: "saveNote",
            id,
            saveIntent: await ticket,
            document: doc,
            revision: revisions.current.expected(id),
          });
          if (!delivery.accessAccepted) throw new AccessChanged();
          const revision =
            delivery.receipt?.changes.find(
              (change) => change.kind === "note" && change.id === id,
            )?.revision ?? delivery.value?.revision;
          if (revision === undefined) throw Error("后端未提供保存回执");
          // Only the submitted body is used privately for attachment ACK. A stale
          // server document never publishes through the save response.
          revisions.current.confirmed(id, revision);
          for (const submission of attachmentSubmissions.current.values())
            submission.acknowledge(id, doc);
          ocrOperation.current?.acknowledgeDocument(id, doc);
          if (pendingDocs.current.get(id) === doc) {
            pendingDocs.current.delete(id);
            saveFailures.current.delete(id);
          }
          setWs((prev) => ({
            ...prev,
            notes: prev.notes.map((old) =>
              old.id === id
                ? { ...old, revision: Math.max(old.revision, revision) }
                : old,
            ),
          }));
          // A newer workspace may have been hydrated while pending overlaid its
          // body. After ACK removes that overlay, read even at the same sequence.
          void metadataRefreshRef.current();
          if (delivery.maintenanceError) fail(delivery.maintenanceError);
        },
        (e) => {
          saveFailures.current.set(id, e);
          if ((e as { code?: string }).code === "conflict")
            setError(
              "其他窗口已保存新的内容。本窗口更改仍保留，重试不会覆盖已保存版本。普通无附件的备忘录可另存为新备忘录。",
            );
          else fail(e);
        },
        () => setSaving((v) => Math.max(0, v - 1)),
      );
      queues.current.set(id, next);
      return next;
    },
    [fail],
  );
  const saveEditorDoc = (id: string, doc: JSONContent) => {
    const composition = tagCompositions.current.get(id);
    const instance = composition?.editor;
    const names = documentTags(doc);
    const lostTagMatch =
      smartFolder && !contentSearch
        ? !matchesSmart(smartFolder.query, {
            eligible: true,
            pinned: current?.pinned ?? false,
            tags: names,
          })
        : !names.length ||
          (typeof tagFilter === "string" && !names.includes(tagFilter));
    if (
      !tagCompositionTarget.current &&
      tagNavigation === tagCompositionNavigation.current &&
      desktopSearch &&
      (filter === "tags" || tagFilter !== undefined || !!smartFolder) &&
      noteId === id &&
      listed.some((note) => note.id === id) &&
      lostTagMatch &&
      composition?.pending &&
      instance &&
      !instance.isDestroyed &&
      instance.isEditable &&
      instance.view.composing &&
      instance.view.hasFocus() &&
      nativeEditorOwners.current.get(instance) === id &&
      !blockedNotes.current.has(id) &&
      !accessGate.state?.operationId &&
      accessGate.state?.notes[id]?.authorized !== false
    ) {
      tagCompositionTarget.current = {
        noteId: id,
        composition,
        cycle: composition.cycle,
        scope: tagCompositionScope,
        stamp: accessGate.stamp(id),
      };
    }
    return saveDoc(id, doc);
  };
  tagCompositionSettled.current = (id, composition, cycle) => {
    const target = tagCompositionTarget.current;
    if (
      !target ||
      target.noteId !== id ||
      target.composition !== composition ||
      target.cycle !== cycle
    )
      return;
    const instance = composition.editor;
    // No invented end/flush/transaction. The observer proves the real final
    // candidate and tag-cleanup transaction reached this same live Editor.
    const stamp = accessGate.stamp(id);
    if (
      !instance.isDestroyed &&
      nativeEditorOwners.current.get(instance) === id &&
      editorsRef.current.get(id) === instance &&
      stamp.sessionId === target.stamp.sessionId &&
      stamp.noteEpoch === target.stamp.noteEpoch &&
      !blockedNotes.current.has(id) &&
      !accessGate.state?.operationId &&
      accessGate.state?.notes[id]?.authorized !== false
    ) {
      const document = editorSaveSnapshot(instance.getJSON());
      const outgoing =
        pendingDocs.current.get(id) ||
        wsRef.current.notes.find((note) => note.id === id)?.document;
      if (outgoing && !documentsEqual(outgoing, document))
        void saveDoc(id, document);
    }
    clearTagComposition();
  };
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
      const recovered = await action<Note>({
        type: "recoverConflictCopy",
        id,
        revision: revisions.current.expected(id),
        document: doc,
      });
      const copyId = recovered.receipt?.createdId ?? recovered.value?.id;
      if (!copyId) throw Error("后端未提供副本回执");
      copyConfirmed = true;
      const data = await metadataRefreshRef.current();
      const copy = data?.notes.find((note) => note.id === copyId);
      if (!copy || !accessGate.state?.notes[copyId]?.authorized)
        throw new AccessChanged();
      // Only a confirmed, durable new note releases the original pending body.
      if (pendingDocs.current.get(id) === doc) {
        pendingDocs.current.delete(id);
        saveFailures.current.delete(id);
      }
      void metadataRefreshRef.current();
      revisions.current.confirmed(copy.id, copy.revision);
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
        restoreEditor(frozen, editable);
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
          if (
            pendingDocs.current.size ||
            recordingLifecycle.current.active() ||
            ocrLifecycle.current.active()
          ) {
            event.preventDefault();
            try {
              // Both owners seal admission synchronously before the first wait.
              const ocrClosing = ocrLifecycle.current.close();
              const recordingClosing = recordingLifecycle.current.close();
              await Promise.all([ocrClosing, recordingClosing]);
              await flush();
              if (
                !pendingDocs.current.size &&
                !recordingLifecycle.current.active() &&
                !ocrLifecycle.current.active()
              )
                await getCurrentWindow().destroy();
            } catch (e) {
              fail(e);
            }
          }
        })
        .then((fn) => (unlisten = fn));
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      ocrLifecycle.current.detach();
      recordingLifecycle.current.detach();
      unlisten?.();
    };
  }, [flush, fail]);
  clearSensitive.current = (ids) => {
    if (!ids.length) return;
    if (
      tagCompositionTarget.current &&
      ids.includes(tagCompositionTarget.current.noteId)
    )
      clearTagComposition();
    setTagFilter((name) =>
      name === undefined
        ? undefined
        : tagSelectionAfterAccess(name, wsRef.current, ids),
    );
    nativeToolbar.current?.invalidate((context) => {
      context.editor = null;
      context.bookmark = null;
    });
    for (const batch of attachmentBatches.current)
      if (ids.includes(batch.target.noteId)) batch.target.invalidated = true;
    for (const batch of pickerTargets.current.values())
      if (ids.includes(batch.target.noteId)) batch.target.invalidated = true;
    for (const submission of attachmentSubmissions.current.values())
      if (ids.includes(submission.noteId)) submission.invalidate();
    ocrLifecycle.current.suspend(ids);
    recordingLifecycle.current.suspend(ids);
    for (const id of ids) {
      const instance = editorsRef.current.get(id);
      if (instance && !instance.isDestroyed) instance.destroy();
    }
    if (noteId && ids.includes(noteId)) {
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
    // An unrelated parked note changed. Keep the still-valid visible search
    // target and its overlay; clearing here would silently retarget B to A.
    if (
      tagFilter === undefined &&
      filter !== "tags" &&
      shouldClearSearchAfterAccessChange(desktopSearch, noteId, ids)
    ) {
      setQuery("");
      setSearching(false);
    }
    setContextNote(null);
  };
  synchronizeRef.current = () =>
    synchronization.request(
      () => {
        invalidateAccessRequests();
        synchronizingRef.current = true;
        setSynchronizing(true);
        setSyncError("");
      },
      async () => {
        for (;;) {
          try {
            return await loadWorkspace(true);
          } catch (error) {
            if (!(error instanceof MetadataStale)) throw error;
          }
        }
      },
      (data) => {
        if (!hydrate(data)) throw new MetadataStale();
        if (!initializedSelection.current) {
          initializedSelection.current = true;
          restoreSelection(data);
        }
        blockedNotes.current = new Set(data.access?.suspended || []);
        setAccessSuspended([...blockedNotes.current]);
        synchronizingRef.current = false;
        setSynchronizing(false);
        setWorkspaceLoaded(true);
      },
      (e) => {
        fail(e);
        setSyncError(errText(e));
        // Keep cached content covered until a trusted retry succeeds.
      },
    );
  accessHandler.current = (event) => {
    if (event.phase === "prepare") {
      if (
        tagCompositionTarget.current &&
        event.noteIds.includes(tagCompositionTarget.current.noteId)
      )
        clearTagComposition();
      synchronization.invalidate();
      ocrLifecycle.current.suspend(event.noteIds);
      recordingLifecycle.current.suspend(event.noteIds);
      blockedNotes.current = new Set(event.noteIds);
      setAccessSuspended(event.noteIds);
      setTagFilter((name) =>
        name === undefined
          ? undefined
          : tagSelectionAfterAccess(name, wsRef.current, event.noteIds),
      );
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
        restoreEditor(frozen.editor, frozen.editable);
      barrierEditor.current = null;
      setTagFilter((name) =>
        name === undefined
          ? undefined
          : tagSelectionAfterAccess(
              name,
              { ...wsRef.current, access: event.access },
              [],
            ),
      );
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
      if (document.visibilityState === "visible")
        void metadataRefreshRef.current();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    let unlisten: (() => void) | undefined;
    if (native)
      getCurrentWindow()
        .onFocusChanged(({ payload }) => {
          if (payload) void metadataRefreshRef.current();
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(fail);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
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
      restoreEditor(target.editor, target.editable);
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
    const releases = [...editors.values()].map((instance) => {
      const changed = ({
        transaction,
      }: {
        transaction: import("@tiptap/pm/state").Transaction;
      }) => {
        if (transaction.docChanged)
          nativeDocumentVersions.current.set(
            instance,
            (nativeDocumentVersions.current.get(instance) || 0) + 1,
          );
      };
      instance.on("transaction", changed);
      return () => instance.off("transaction", changed);
    });
    return () => releases.forEach((release) => release());
  }, [editors]);
  useEffect(() => {
    if (!editor) return;
    const changed = ({
      transaction,
    }: {
      transaction: import("@tiptap/pm/state").Transaction;
    }) => {
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
        restoreEditor(target.editor, target.editable);
      paperTarget.current = null;
      setModal((value) => (value === "paper" ? null : value));
    }
  }, [noteId]);
  const chooseFolder = (id: string) => {
    clearTagComposition();
    setTagFilter(undefined);
    setGalleryEditor(false);
    setFolderId(id);
    setPage("notes");
    setQuery("");
    setFilter("");
    setSearching(false);
    setMenu(null);
    if (noteId && ws.folders.find((f) => f.id === id)?.kind === "smart")
      parkedSmartEditors.current.add(noteId);
    const first =
      projectFolders(
        wsRef.current,
        blockedNotes.current.size ? [...blockedNotes.current] : [],
        sort,
      ).get(id)?.firstId ?? null;
    setNoteId(first);
    updateSettings({ selectedFolder: id, selectedNote: first || "" });
  };
  const chooseTag = (name: string | null) => {
    clearTagComposition();
    setTagFilter(name);
    setFilter("");
    setSearchNoteId(null);
    setGalleryEditor(false);
    setPage("notes");
    setMenu(null);
  };
  const chooseNote = (n: Note) => {
    clearTagComposition();
    if (!mobile && view === "gallery") setGalleryEditor(true);
    if (contentSearch) setSearchNoteId(n.id);
    else setNoteId(n.id);
    setPage("editor");
    setMenu(null);
    setSwiped(null);
    setShowFind(false);
    setEditing(false);
    if (!contentSearch) updateSettings({ selectedNote: n.id });
  };
  const createNote = useCallback(
    async (validate?: () => void) => {
      try {
        await flush();
        validate?.();
        const fid = isPhysicalOwner(
          wsRef.current.folders.find((f) => f.id === folderId),
        )
          ? folderId
          : "default";
        const created = await action<Note & Pick<Workspace, "access">>({
          type: "createNote",
          folderId: fid,
        });
        const createdId = created.receipt?.createdId ?? created.value?.id;
        if (!createdId) throw Error("后端未提供新建收据");
        if (created.maintenanceError) fail(created.maintenanceError);
        // Keep the successful unique ID even if its snapshot is stale. Never
        // issue create again; only authoritative data can activate the editor.
        const data = await metadataRefreshRef.current();
        const n = data?.notes.find((note) => note.id === createdId);
        if (!n || !accessGate.state?.notes[createdId]?.authorized) {
          setNotice("备忘录已经创建，列表同步后可查看");
          return;
        }
        revisions.current.confirmed(n.id, n.revision);
        clearTagComposition();
        setTagFilter(undefined);
        setFolderId(fid);
        setFilter("");
        setNoteId(n.id);
        setPage("editor");
        setGalleryEditor(true);
        setMenu(null);
        setQuery("");
        setSearching(false);
        setEditing(true);
        updateSettings({ selectedFolder: fid, selectedNote: n.id });
        setTimeout(
          () => document.querySelector<HTMLElement>(".tiptap")?.focus(),
          100,
        );
      } catch (e) {
        fail(e);
      }
    },
    [fail, flush, folderId, updateSettings, clearTagComposition],
  );
  const newNote = useCallback(() => createNote(), [createNote]);
  const saveFolderDraft = async (draft: FolderDraft, committedId?: string) => {
    let id = committedId;
    if (!id) {
      const delivery = await action<FolderData>(
        draft.smart
          ? {
              type: draft.id ? "updateSmartFolder" : "createSmartFolder",
              input: {
                name: draft.name,
                query: draftQuery(draft),
                ...(draft.id
                  ? {
                      id: draft.id,
                      expectedDefinitionRevision:
                        draft.expectedDefinitionRevision,
                    }
                  : {}),
              },
            }
          : { type: "createFolder", name: draft.name, parentId: null },
      );
      id = delivery.receipt?.createdId ?? delivery.value?.id ?? draft.id;
      if (!id) throw Error("后端未提供文件夹保存收据，草稿仍保留。");
      if (delivery.maintenanceError) fail(delivery.maintenanceError);
    }
    const data = await metadataRefreshRef.current();
    if (!data?.folders.some((f) => f.id === id)) return { id, complete: false };
    setFolderForm(null);
    if (!draft.id) chooseFolder(id);
    return { id, complete: true };
  };
  const openModal = (type: string, value = "") => {
    if (type === "deleteSmartFolder") {
      const f = wsRef.current.folders.find((f) => f.id === contextFolder);
      smartDeleteTarget.current =
        f?.kind === "smart"
          ? { id: f.id, revision: f.definitionRevision }
          : null;
    }
    if (type === "newFolder") {
      setFolderForm({});
      setMenu(null);
      return;
    }
    if (type === "renameFolder") {
      const folder = wsRef.current.folders.find((f) => f.id === contextFolder);
      if (folder?.kind === "smart") {
        setFolderForm({ folder });
        setMenu(null);
        return;
      }
    }
    if (type === "lock" && selected && documentTags(selected.document).length) {
      fail(Error("含标签的备忘录不能锁定，请先移除标签。"));
      return;
    }
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
    if (folderForm) folderFormHandle.current?.cancel();
    else if (ocrOperation.current) void cancelOcr().catch(fail);
    else if (modal === "paper") closePaper();
    else if (modal) setModal(null);
    else if (menu === "format") closeFormat(false);
    else if (menu) setMenu(null);
    else if (draw) setDraw(null);
    else if (record) void cancelRecording().catch(fail);
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
      const original = wsRef.current.notes.find((n) => n.id === a.id);
      const leavePinnedView =
        smartFolder?.query.rules.length === 1 &&
        smartFolder.query.rules[0].type === "pinned" &&
        smartFolder.query.rules[0].value &&
        a.type === "patchNote" &&
        a.pinned === false &&
        currentProjection?.count === 1 &&
        currentProjection.ids[0] === a.id;
      await doAction(a);
      if (
        leavePinnedView &&
        original &&
        isPhysicalOwner(
          wsRef.current.folders.find((f) => f.id === original.folderId),
        )
      ) {
        setFolderId(original.folderId);
        setNoteId(original.id);
        updateSettings({
          selectedFolder: original.folderId,
          selectedNote: original.id,
        });
      }
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
          const imported = await importArchive(path);
          if (imported.value && hydrate(imported.value)) {
            restoreSelection(imported.value);
          } else {
            const synced = await synchronizeRef.current();
            if (!synced.success) throw synced.error;
            if (!synchronization.current(synced)) throw new MetadataStale();
            restoreSelection(synced.snapshot);
          }
          if (imported.maintenanceError) fail(imported.maintenanceError);
          setNotice("本地备份已导入");
        }
      } catch (e) {
        fail(e);
      }
    },
    [flush, hydrate, restoreSelection, synchronization, fail],
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
      if (folderForm) return;
      if (ocrOperation.current && e.key !== "Escape") return;
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
        if (ocrOperation.current) void cancelOcr().catch(fail);
        else if (modal === "paper") closePaper();
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
    folderForm,
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
  const validatePickerTarget = async (
    target: PickerTarget,
    recording?: RecordingTicket,
    allowSealed = false,
    ocr?: OcrHost<PickerTarget>,
  ) => {
    const owned = () =>
      (!ocr ||
        (ocrOperation.current === ocr &&
          ocr.target === target &&
          !ocr.detached &&
          (allowSealed || ocr.accepting))) &&
      (!recording ||
        (recordingTicket.current === recording &&
          recording.batch.target === target &&
          !recording.detached &&
          (allowSealed || recording.accepting)));
    if (!owned()) throw Error("原录音会话已关闭，不会提交到其他备忘录");
    if (target.invalidated) throw Error("原附件目标已失效，请保持窗口打开");
    if (ocr?.insertedDocument && !ocr.documentAck) {
      // Only this operation's exact pending body can bypass the generic flush
      // failure to retry its own ACK. The full trusted target check still follows.
      const pending = pendingDocs.current.get(target.noteId);
      if (
        !pending ||
        !documentsEqual(pending, ocr.insertedDocument) ||
        target.editor.isDestroyed ||
        !documentsEqual(
          editorSaveSnapshot(target.editor.getJSON()),
          ocr.insertedDocument,
        )
      )
        throw Error("原识别文字的待保存正文已改变，请保持窗口打开");
    } else await flush();
    if (!owned()) throw Error("原录音或文字识别会话已关闭");
    const synced = await synchronizeRef.current();
    if (!owned()) throw Error("原录音会话已关闭");
    const live = pickerRuntime.current;
    const instance = live.editor;
    const note = wsRef.current.notes.find((n) => n.id === target.noteId);
    const stamp = rebindAttachmentTarget(target, {
      noteId: live.noteId,
      scope: live.scope,
      stamp: accessGate.stamp(target.noteId),
      editor: instance,
      owner: instance ? nativeEditorOwners.current.get(instance) : undefined,
      documentVersion: instance
        ? nativeDocumentVersions.current.get(instance) || 0
        : -1,
      externalVersion: externalVersions.current.get(target.noteId) || 0,
      editorDocument:
        instance && !instance.isDestroyed ? instance.getJSON() : undefined,
      trustedDocument: synced.success
        ? synced.snapshot.notes.find((n) => n.id === target.noteId)?.document
        : undefined,
      trustedSynchronization: synchronization.current(synced),
      available:
        (ocr
          ? live.ocrAvailable
          : recording
            ? live.recordingAvailable
            : live.available) &&
        !!note &&
        !note.deletedAt &&
        !!instance &&
        !instance.isDestroyed &&
        instance.isEditable &&
        !accessGate.state?.operationId &&
        !blockedNotes.current.has(target.noteId) &&
        !accessGate.state?.suspended.includes(target.noteId) &&
        (!note.locked || !!accessGate.state?.notes[target.noteId]?.authorized),
    });
    // Resolving the original bookmark is also mandatory; never use current selection.
    target.bookmark.resolve(target.editor.state.doc);
    target.stamp = stamp;
  };
  const awaitAttachmentDocumentAck = async (
    operation: AttachmentSubmission<PickerTarget>,
    target: PickerTarget,
  ) => {
    await queues.current.get(target.noteId);
    if (!operation.documentAck) {
      const pending = pendingDocs.current.get(target.noteId);
      if (
        !pending ||
        !operation.attachment ||
        !documentReferencesAttachment(pending, operation.attachment)
      )
        throw Error("附件正文尚未确认保存，请保持窗口打开");
      const outcome = await saveDoc(target.noteId, pending);
      if (!outcome.saved) throw outcome.error;
    }
  };
  const submitAttachmentBatch = async (batch: PickerBatch) => {
    if (batch.cancelRequested)
      throw Error("附件取消尚未核定，请重试取消；不会继续插入正文");
    if (!batch.files) throw Error("附件选择结果尚未提供");
    const target = batch.target;
    for (const [index, file] of batch.files.entries()) {
      if (batch.cancelRequested) throw Error("本次附件已请求取消");
      const operationId = batch.operationIds[index];
      let submission = attachmentSubmissions.current.get(operationId);
      if (!submission) {
        submission = new AttachmentSubmission(
          operationId,
          target.noteId,
          target,
          file,
          batch.recording?.recordedAt,
        );
        attachmentSubmissions.current.set(operationId, submission);
      }
      const operation = submission;
      await operation.run({
        validate: () =>
          validatePickerTarget(target, batch.recording, operation.inserted),
        storage: native
          ? {
              kind: "journal",
              store: () =>
                storeAttachmentOperation(
                  operationId,
                  target.noteId,
                  file,
                  operation.recordedAt,
                ),
              query: () => queryAttachmentOperation(operationId, target.noteId),
            }
          : {
              kind: "preview",
              store: () =>
                storeAttachment(target.noteId, file, operation.recordedAt),
            },
        insert: (attachment) => {
          const instance = target.editor;
          instance.view.dispatch(
            instance.state.tr.setSelection(
              target.bookmark.resolve(instance.state.doc),
            ),
          );
          try {
            const inserted = instance
              .chain()
              .focus()
              .insertContent({
                type: "attachment",
                attrs: {
                  id: attachment.id,
                  name: attachment.displayName,
                  kind: attachment.kind,
                },
              })
              .run();
            if (!inserted)
              throw Error("编辑器未接受附件插入，已保留原附件；请重试");
          } finally {
            if (documentReferencesAttachment(instance.getJSON(), attachment)) {
              target.bookmark = instance.state.selection.getBookmark();
              target.documentVersion =
                nativeDocumentVersions.current.get(instance) || 0;
              target.document = instance.getJSON();
              target.trustedDocument = editorSaveSnapshot(target.document);
            }
          }
        },
        references: (attachment) =>
          !target.editor.isDestroyed &&
          documentReferencesAttachment(target.editor.getJSON(), attachment),
        awaitDocumentAck: () => awaitAttachmentDocumentAck(operation, target),
        refresh: async () => {
          if (batch.recording) finishRecording(batch.recording);
          await refresh();
        },
      });
    }
    attachmentBatches.current.delete(batch);
    for (const operationId of batch.operationIds)
      attachmentSubmissions.current.delete(operationId);
    setMenu(null);
  };
  const retryAttachments = async () => {
    for (const [id, doc] of [...pendingDocs.current]) await saveDoc(id, doc);
    for (const batch of [...attachmentBatches.current]) {
      if (batch.recording && batch.cancelRequested)
        await cancelRecording(batch.recording);
      else await submitAttachmentBatch(batch);
    }
    if (ocrOperation.current) await retryOcr();
  };
  const discardUninsertedAttachments = async () => {
    for (const batch of attachmentBatches.current) {
      if (batch.recording) {
        await cancelRecording(batch.recording);
        continue;
      }
      await validatePickerTarget(batch.target);
      const operations = batch.operationIds.map((id) =>
        attachmentSubmissions.current.get(id),
      );
      if (operations.some((op) => op?.inserted))
        throw Error("附件已在本窗口正文中，须先确认保存；不会删除待保存的附件");
      // Seal admission before awaiting cancellation. A late storage/query result
      // can no longer race a safe backend cancellation and insert its old node.
      batch.cancelRequested = true;
      for (const op of operations) op?.invalidate();
      // StorageAttempted includes FileReader time, before the store IPC exists.
      // Keep every identity until all admitted work has really settled; a
      // cancel of an unknown op cannot prevent a later store for that same op.
      await Promise.all(operations.map((op) => op?.settleForCancellation()));
      await validatePickerTarget(batch.target);
      for (const op of operations) {
        if (!op) continue;
        if (
          op.attachment &&
          documentReferencesAttachment(
            op.target.editor.getJSON(),
            op.attachment,
          )
        )
          throw Error("附件已在本窗口正文中，不能取消");
        if (native && op.storageAttempted) {
          const result = await cancelAttachmentOperation(
            op.operationId,
            op.noteId,
          );
          if (result.status !== "aborted" && result.status !== "notPersisted")
            throw Error(
              `附件已保留待恢复（${result.reason || result.status}）`,
            );
        }
        op.invalidate();
        attachmentSubmissions.current.delete(op.operationId);
      }
      batch.target.invalidated = true;
      attachmentBatches.current.delete(batch);
    }
    setError("");
  };
  const fileSelected = async (input: HTMLInputElement) => {
    const files = input.files;
    const batch = pickerTargets.current.get(input);
    pickerTargets.current.delete(input);
    try {
      if (!files?.length) return; // Picker cancellation has not started storage.
      if (!batch) throw Error("附件选择缺少原目标，请重新选择");
      batch.files = Array.from(files);
      for (let i = 1; i < batch.files.length; i++)
        batch.operationIds.push(secureId());
      attachmentBatches.current.add(batch);
      await submitAttachmentBatch(batch);
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
  const count = (id: string) => folderProjection.get(id)?.count ?? 0;
  const folderLabel =
    tagFilter !== undefined
      ? tagFilter === null
        ? "所有标签"
        : `#${tagFilter}`
      : folderId === "all"
        ? "全部备忘录"
        : currentFolder?.name || "备忘录";
  const listTitle = desktopSearchZero
    ? "搜索"
    : query
      ? "搜索结果"
      : folderLabel;
  const listSubtitle = desktopSearchZero
    ? "无结果"
    : `${listed.length}个备忘录`;
  const startLong = (callback: () => void) => {
    longPress.current = setTimeout(callback, 520);
  };
  const stopLong = () => {
    if (longPress.current) clearTimeout(longPress.current);
  };
  const folderRow = (f: FolderData, depth = 0) => (
    <div key={f.id}>
      <button
        className={`folder-row ${tagFilter === undefined && folderId === f.id ? "selected" : ""}`}
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
        {f.kind === "smart" ? (
          <FolderCog />
        ) : f.kind === "quick" ? (
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
          setFilter((value) => (value === "tags" ? value : ""));
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
  const capturePickerTarget = (context?: NativeContext): PickerBatch => {
    const live = pickerRuntime.current;
    const instance = context ? context.editor : live.editor;
    if (
      synchronizingRef.current ||
      !live.noteId ||
      !instance ||
      instance.isDestroyed ||
      !instance.isEditable ||
      !live.available ||
      blockedNotes.current.has(live.noteId) ||
      accessGate.state?.operationId
    )
      throw Error("当前备忘录不可添加附件，请同步完成后重试");
    if (context) nativeAssert.current(context, true);
    const owner = nativeEditorOwners.current.get(instance);
    if (owner !== live.noteId) throw Error("附件编辑器归属已改变");
    const original = wsRef.current.notes.find((n) => n.id === live.noteId);
    if (!original) throw Error("原附件备忘录不存在");
    const target: PickerTarget = {
      noteId: live.noteId,
      scope: live.scope,
      stamp: accessGate.stamp(live.noteId),
      editor: instance,
      owner,
      bookmark: context?.bookmark || instance.state.selection.getBookmark(),
      documentVersion: nativeDocumentVersions.current.get(instance) || 0,
      externalVersion: externalVersions.current.get(live.noteId) || 0,
      document: instance.getJSON(),
      // Compare each representation with its own captured original. Schema
      // defaults in the Editor must neither hide raw changes nor reject an
      // unchanged imported document that omits an optional default field.
      trustedDocument:
        pendingDocs.current.get(live.noteId) || original.document,
      invalidated: false,
    };
    return { target, operationIds: [secureId()] } satisfies PickerBatch;
  };
  const openAttachmentPicker = (
    input: HTMLInputElement | null,
    accept?: string,
    context?: NativeContext,
  ) => {
    try {
      if (!input) throw Error("附件选择器尚未就绪");
      const batch = capturePickerTarget(context);
      const previous = pickerTargets.current.get(input);
      if (previous) previous.target.invalidated = true;
      pickerTargets.current.set(input, batch);
      if (accept !== undefined) input.accept = accept;
      input.click();
    } catch (e) {
      if (input) {
        const batch = pickerTargets.current.get(input);
        if (batch) batch.target.invalidated = true;
        pickerTargets.current.delete(input);
      }
      fail(e);
    }
  };
  useEffect(() => {
    const inputs = [fileInput.current, cameraInput.current];
    const cancelled = (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const batch = pickerTargets.current.get(input);
      if (batch) batch.target.invalidated = true;
      pickerTargets.current.delete(input);
    };
    for (const input of inputs) input?.addEventListener("cancel", cancelled);
    return () => {
      for (const input of inputs)
        input?.removeEventListener("cancel", cancelled);
    };
  }, []);
  const finishRecording = (ticket: RecordingTicket) => {
    ticket.accepting = false;
    if (recordingTicket.current === ticket) {
      recordingTicket.current = null;
      if (!ticket.detached) setRecord(false);
    }
  };
  const recordingReferenced = (ticket: RecordingTicket) => {
    const operation = attachmentSubmissions.current.get(
      ticket.batch.operationIds[0],
    );
    const attachment = operation?.attachment;
    return (
      !!attachment &&
      ((!ticket.batch.target.editor.isDestroyed &&
        documentReferencesAttachment(
          ticket.batch.target.editor.getJSON(),
          attachment,
        )) ||
        (!!pendingDocs.current.get(ticket.batch.target.noteId) &&
          documentReferencesAttachment(
            pendingDocs.current.get(ticket.batch.target.noteId)!,
            attachment,
          )))
    );
  };
  const sealRecording = (ticket: RecordingTicket) => {
    ticket.accepting = false;
    const operation = attachmentSubmissions.current.get(
      ticket.batch.operationIds[0],
    );
    if (
      !operation?.documentAck &&
      !operation?.inserted &&
      !recordingReferenced(ticket)
    ) {
      ticket.batch.cancelRequested = true;
      operation?.invalidate();
    }
  };
  const cancelRecording = (ticket = recordingTicket.current): Promise<void> => {
    if (!ticket) return Promise.resolve();
    // Admission is sealed before any wait. Ownership survives until authoritative
    // cancellation; otherwise the same ticket would reject its own cleanup.
    sealRecording(ticket);
    if (recordingTicket.current === ticket && !ticket.detached)
      setRecord(false);
    if (ticket.cancelling) return ticket.cancelling;
    const work = (async () => {
      const operation = attachmentSubmissions.current.get(
        ticket.batch.operationIds[0],
      );
      if (operation && ticket.batch.cancelRequested)
        await operation.settleForCancellation();
      else await ticket.running?.catch(() => {});
      if (operation?.documentAck) {
        finishRecording(ticket);
        return;
      }
      if (operation?.inserted || recordingReferenced(ticket))
        throw Error(
          "录音已进入待保存正文，附件已保留；请使用重试保存，不会删除",
        );
      if (operation?.storageAttempted) {
        await validatePickerTarget(ticket.batch.target, ticket, true);
        if (recordingReferenced(ticket))
          throw Error("录音仍被本窗口正文引用，不能取消");
        if (native) {
          const result = await cancelAttachmentOperation(
            operation.operationId,
            operation.noteId,
          );
          if (result.status !== "aborted" && result.status !== "notPersisted")
            throw Error(
              `录音附件已保留待恢复（${result.reason || result.status}）`,
            );
        }
      }
      ticket.batch.target.invalidated = true;
      attachmentBatches.current.delete(ticket.batch);
      if (operation)
        attachmentSubmissions.current.delete(operation.operationId);
      finishRecording(ticket);
    })();
    ticket.cancelling = work;
    void work
      .finally(() => {
        if (ticket.cancelling === work) ticket.cancelling = undefined;
      })
      .catch(() => {});
    return work;
  };
  const submitRecording = (
    ticket: RecordingTicket,
    result: RecordingResult,
  ): Promise<void> => {
    const { file } = result;
    if (
      !ticket.accepting ||
      recordingTicket.current !== ticket ||
      ticket.detached
    )
      return Promise.reject(Error("原录音会话已关闭，不会提交到其他备忘录"));
    if (ticket.file && ticket.file !== file)
      return Promise.reject(Error("录音文件身份已改变，请保留原录音重试"));
    let recordedAt: number | undefined;
    try {
      recordedAt = attachmentRecordedAt(result.recordedAt, "audio");
    } catch (error) {
      return Promise.reject(error);
    }
    if (recordedAt === undefined)
      return Promise.reject(Error("录音开始时间缺失，请保留原录音"));
    if (ticket.file && ticket.recordedAt !== recordedAt)
      return Promise.reject(Error("录音开始时间已改变，请保留原录音重试"));
    if (ticket.running) return ticket.running;
    ticket.file = file;
    ticket.recordedAt = recordedAt;
    ticket.batch.files = [file];
    attachmentBatches.current.add(ticket.batch);
    const work = (async () => {
      const operation = attachmentSubmissions.current.get(
        ticket.batch.operationIds[0],
      );
      // A retry of an already inserted node first retries its original pending
      // body. Generic validation flushes and correctly rejects failed queues.
      if (operation?.inserted && !operation.documentAck) {
        if (ticket.batch.target.invalidated)
          throw Error("原录音目标已失效，正文仍保留");
        await awaitAttachmentDocumentAck(operation, ticket.batch.target);
      }
      await submitAttachmentBatch(ticket.batch);
    })().catch((error) => {
      const operation = attachmentSubmissions.current.get(
        ticket.batch.operationIds[0],
      );
      if (!operation?.documentAck) throw error;
      finishRecording(ticket);
      setError("录音正文已保存，但列表刷新失败；请重试刷新。" + errText(error));
    });
    ticket.running = work;
    void work
      .finally(() => {
        if (ticket.running === work) ticket.running = undefined;
      })
      .catch(() => {});
    return work;
  };
  const openRecording = (context?: NativeContext) => {
    if (recordingTicket.current)
      throw Error("上次录音操作尚未核定，请先重试保存或取消");
    const batch = capturePickerTarget(context);
    const ticket: RecordingTicket = { batch, accepting: true, detached: false };
    batch.recording = ticket;
    recordingTicket.current = ticket;
    setMenu(null);
    setRecord(true);
  };
  recordingLifecycle.current = {
    active: () => !!recordingTicket.current,
    close: async () => {
      const ticket = recordingTicket.current;
      if (!ticket) return;
      sealRecording(ticket);
      if (!ticket.detached) setRecord(false);
      const operation = attachmentSubmissions.current.get(
        ticket.batch.operationIds[0],
      );
      if (operation?.inserted || recordingReferenced(ticket)) {
        await ticket.running?.catch(() => {});
        await retryAttachments();
        if (!operation?.documentAck)
          throw Error("录音正文尚未保存，请保持窗口打开");
        finishRecording(ticket);
      } else await cancelRecording(ticket);
    },
    suspend: (ids) => {
      const ticket = recordingTicket.current;
      if (ticket && ids.includes(ticket.batch.target.noteId))
        void cancelRecording(ticket).catch(fail);
    },
    detach: () => {
      const ticket = recordingTicket.current;
      if (ticket) {
        ticket.detached = true;
        sealRecording(ticket);
      }
    },
  };
  const finishOcr = (operation: OcrHost<PickerTarget>) => {
    if (operation.cleaned && ocrOperation.current === operation) {
      ocrOperation.current = null;
      setOcrState({ phase: "choose", text: "", error: "" });
      setOcr(null);
    }
  };
  const cancelOcr = async (operation = ocrOperation.current) => {
    if (!operation) return;
    await operation.cancel();
    finishOcr(operation);
  };
  const retryOcr = async () => {
    const operation = ocrOperation.current;
    if (!operation) return;
    if (operation.insertedDocument && !operation.detached)
      await confirmOcr(operation);
    else await cancelOcr(operation);
  };
  const confirmOcr = async (operation: OcrHost<PickerTarget>) => {
    if (ocrOperation.current !== operation || operation.detached)
      throw Error("原文字识别会话已关闭");
    await operation.confirm();
    finishOcr(operation);
  };
  const awaitOcrDocumentAck = async (operation: OcrHost<PickerTarget>) => {
    await queues.current.get(operation.target.noteId);
    if (operation.documentAck) return;
    await validatePickerTarget(operation.target, undefined, true, operation);
    const document = operation.insertedDocument;
    if (!document) throw Error("识别文字尚未插入正文");
    const outcome = await saveDoc(operation.target.noteId, document);
    if (!outcome.saved) throw outcome.error;
  };
  const openOcr = (context?: NativeContext) => {
    if (!native)
      throw Error("请在已安装的 Mac 或 Android 应用中识别本地图片文字。");
    if (ocrOperation.current)
      throw Error("上次文字识别尚未核定，请先重试保存或取消");
    const batch = capturePickerTarget(context),
      target = batch.target;
    const operation: OcrHost<PickerTarget> = new OcrHost(
      batch.operationIds[0],
      target,
      {
        native: ocrNative,
        validate: () =>
          validatePickerTarget(target, undefined, false, operation),
        insert: (text, inserted) => {
          const instance = target.editor;
          const nodes = ocrParagraphs(text).map((node) =>
            instance.schema.nodeFromJSON(node),
          );
          const transaction = instance.state.tr
            .setSelection(target.bookmark.resolve(instance.state.doc))
            .replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0));
          const document = editorSaveSnapshot(transaction.doc.toJSON());
          try {
            instance.view.dispatch(transaction);
          } finally {
            if (
              !instance.isDestroyed &&
              documentsEqual(editorSaveSnapshot(instance.getJSON()), document)
            ) {
              inserted(document);
              target.document = instance.getJSON();
              target.bookmark = instance.state.selection.getBookmark();
              target.documentVersion =
                nativeDocumentVersions.current.get(instance) || 0;
              // Keep the captured raw trusted body until ACK. On an own failed
              // pending save the backend still legitimately contains that body.
            }
          }
        },
        awaitDocumentAck: awaitOcrDocumentAck,
        update: (state) => {
          if (ocrOperation.current === operation && !operation.detached)
            setOcrState(state);
        },
      },
    );
    ocrOperation.current = operation;
    setOcrState(operation.state);
    setOcr(operation);
    setMenu(null);
    target.editor.commands.blur();
    setEditing(false);
  };
  const processOcr = (operation: OcrHost<PickerTarget>, source: OcrSource) => {
    if (ocrOperation.current !== operation || operation.detached) return;
    void operation.process(source).catch(fail);
  };
  ocrLifecycle.current = {
    active: () => !!ocrOperation.current,
    close: async () => {
      const operation = ocrOperation.current;
      if (!operation) return;
      await operation.close();
      finishOcr(operation);
    },
    suspend: (ids) => {
      const operation = ocrOperation.current;
      if (operation && ids.includes(operation.target.noteId)) {
        operation.seal();
        operation.detached = true;
        // Drop the UI copy immediately; pending body/session ownership remains
        // on the sealed operation until its real save/cancellation completes.
        setOcrState({ phase: "choose", text: "", error: "" });
        setOcr(null);
        void cancelOcr(operation).catch(fail);
      }
    },
    detach: () => {
      const operation = ocrOperation.current;
      if (operation) {
        operation.seal();
        operation.detached = true;
        setOcrState({ phase: "choose", text: "", error: "" });
        setOcr(null);
        void operation.cancel().catch(() => {});
      }
    },
  };
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
      } else if (modal === "deleteSmartFolder") {
        const target = smartDeleteTarget.current;
        if (!target) throw Error("智能文件夹已不存在");
        await action({
          type: "deleteSmartFolder",
          input: {
            id: target.id,
            expectedDefinitionRevision: target.revision,
          },
        });
        await metadataRefreshRef.current();
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
                  openAttachmentPicker(fileInput.current, "");
                  setMenu(null);
                }}
              >
                附加文件
              </MenuRow>
              <MenuRow
                icon={<Volume2 size={19} />}
                onClick={() => {
                  try {
                    openRecording();
                  } catch (error) {
                    fail(error);
                  }
                }}
              >
                录音
              </MenuRow>
              <div className="menu-divider" />
              <MenuRow
                icon={<Image size={19} />}
                onClick={() => {
                  openAttachmentPicker(fileInput.current, "image/*,video/*");
                  setMenu(null);
                }}
              >
                选取照片或视频
              </MenuRow>
              <MenuRow
                icon={<Camera size={19} />}
                onClick={() => {
                  openAttachmentPicker(cameraInput.current);
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
                  openAttachmentPicker(cameraInput.current);
                }}
              >
                扫描文稿
              </MenuRow>
              <MenuRow
                icon={<ScanText size={19} />}
                onClick={() => {
                  setMenu(null);
                  try {
                    openOcr();
                  } catch (error) {
                    fail(error);
                  }
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
                {ws.folders.find((f) => f.id === contextFolder)?.kind ===
                "smart"
                  ? "编辑智能文件夹"
                  : "重新命名"}
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
                onClick={() =>
                  openModal(
                    ws.folders.find((f) => f.id === contextFolder)?.kind ===
                      "smart"
                      ? "deleteSmartFolder"
                      : "deleteFolder",
                  )
                }
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
    query,
  ]);
  const attachmentBaseAvailable =
    !loading &&
    !draw &&
    !accessSuspended.length &&
    !!current &&
    !current.deletedAt &&
    (!mobile || page === "editor") &&
    (!current.locked || !!accessGate.state?.notes[current.id]?.authorized);
  const pickerBaseAvailable = attachmentBaseAvailable && !record && !ocr;
  pickerRuntime.current = {
    scope: JSON.stringify([nativeScope, page]),
    noteId,
    editor,
    available: pickerBaseAvailable && !modal && !folderForm,
    ocrAvailable:
      attachmentBaseAvailable &&
      !record &&
      !modal &&
      !folderForm &&
      !!ocrOperation.current,
    recordingAvailable:
      attachmentBaseAvailable && !modal && !folderForm && !menu && !ocr,
  };
  const recording = record ? recordingTicket.current : null;
  useEffect(() => {
    const ticket = recordingTicket.current;
    if (
      ticket &&
      (ticket.batch.target.scope !== pickerRuntime.current.scope ||
        ticket.batch.target.editor !== editor ||
        ticket.batch.target.invalidated)
    )
      void cancelRecording(ticket).catch(fail);
  }, [nativeScope, page, editor]);
  useEffect(() => {
    const operation = ocrOperation.current;
    if (
      operation &&
      (operation.target.scope !== pickerRuntime.current.scope ||
        operation.target.editor !== editor ||
        operation.target.invalidated)
    ) {
      operation.target.invalidated = true;
      void cancelOcr(operation).catch(fail);
    }
  }, [nativeScope, page, editor]);
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
      (!overlay &&
        (modal || folderForm || draw || record || ocrOperation.current))
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
      setFilter((value) => (value === "tags" ? value : ""));
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
          openAttachmentPicker(
            fileInput.current,
            command === "choosePhotoVideo" ? "image/*,video/*" : "",
            context,
          );
          return;
        case "recognizeImageText":
          nativeSelection(context);
          openOcr(context);
          return;
        case "recordAudio":
          nativeSelection(context);
          openRecording(context);
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
      !record &&
      !ocr;
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
        folderTitle: listTitle,
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
              void metadataRefreshRef.current();
              void retryAttachments().catch(fail);
            }}
          >
            重试
          </button>
          {attachmentBatches.current.size > 0 && (
            <button
              onClick={() => void discardUninsertedAttachments().catch(fail)}
            >
              取消未插入的附件
            </button>
          )}
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
        onChange={(e) => fileSelected(e.currentTarget)}
      />
      <input
        className="hidden-input"
        type="file"
        accept="image/*,video/*"
        capture="environment"
        ref={cameraInput}
        onChange={(e) => fileSelected(e.currentTarget)}
      />
      {ocr && (
        <OcrPanel
          key={ocr.operationId}
          state={ocrState}
          android={/Android/i.test(navigator.userAgent)}
          inserted={!!ocr.insertedDocument}
          onImage={() => processOcr(ocr, { kind: "image" })}
          onCamera={() => processOcr(ocr, { kind: "camera" })}
          onFile={(file) => processOcr(ocr, { kind: "file", file })}
          onConfirm={() => {
            void confirmOcr(ocr).catch(() => {});
          }}
          onCancel={() => {
            void cancelOcr(ocr).catch(fail);
          }}
        />
      )}
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
                className={`folder-row ${tagFilter === undefined && folderId === "all" ? "selected" : ""}`}
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
            {(tags.catalog.length > 0 ||
              tagFilter !== undefined ||
              filter === "tags") && (
              <section className="tag-browser" aria-label="标签">
                <div className="account-title">⌄ 标签</div>
                <div className="tag-chips">
                  <button
                    className={tagFilter === null ? "selected" : ""}
                    onClick={() => chooseTag(null)}
                  >
                    所有标签
                  </button>
                  {tags.catalog.map(([name, count]) => (
                    <button
                      key={name}
                      className={tagFilter === name ? "selected" : ""}
                      title={`${count}个备忘录`}
                      onClick={() => chooseTag(name)}
                    >
                      #{name}
                    </button>
                  ))}
                  {(tagFilter !== undefined || filter === "tags") && (
                    <button
                      aria-label="清除标签筛选"
                      onClick={() => {
                        setTagFilter(undefined);
                        setFilter("");
                      }}
                    >
                      清除
                    </button>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
        <div className="folder-footer">
          <button
            aria-label="新建文件夹"
            onClick={() => openModal("newFolder")}
          >
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
                  <strong>{listTitle}</strong>
                  <span>{listSubtitle}</span>
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
          ) : desktopSearchZero ? (
            <div className="search-zero-section">备忘录</div>
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
                          if (desktopSearch) setSearchNoteId(n.id);
                          else {
                            setNoteId(n.id);
                            updateSettings({ selectedNote: n.id });
                          }
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
          <div className="editor-empty">
            {loading || desktopSearch ? "" : "未选择备忘录"}
          </div>
        ) : current.locked && !unlocked.has(current.id) ? (
          <div className="locked-state">
            <Lock size={48} />
            <h2>此备忘录已锁定</h2>
            <p>输入密码以查看此备忘录。</p>
            <button onClick={() => openModal("unlock")}>查看备忘录</button>
          </div>
        ) : current.deletedAt ? (
          <div className="editor-scroll">
            <button
              className="note-date"
              onClick={() => setNotice(`创建于 ${fmtDate(current.createdAt)}`)}
            >
              {fmtDate(current.updatedAt)}
            </button>
            <div className="deleted-note">
              <p>此备忘录位于“最近删除”中。</p>
              <button
                onClick={() => patch({ type: "restoreNote", id: current.id })}
              >
                恢复备忘录
              </button>
              <pre>{current.plainText}</pre>
            </div>
          </div>
        ) : null}
        {[
          ...new Set([
            ...parkedSmartEditors.current,
            ...(desktopSearch ? [baseNoteId, noteId] : [noteId]),
          ]),
        ].map((id) => {
          const note = ws.notes.find((candidate) => candidate.id === id);
          if (
            !note ||
            note.deletedAt ||
            (note.locked && !unlocked.has(note.id))
          )
            return null;
          return (
            <SearchEditorHost
              key={`${note.id}-${ws.access?.sessionId || "preview"}-${ws.access?.notes[note.id]?.epoch || 0}-${externalVersions.current.get(note.id) || 0}`}
              note={note}
              active={note.id === noteId}
              blocked={blockedNotes.current.has(note.id)}
              gate={editorGate}
              onChange={saveEditorDoc}
              onReady={onReady}
              onDate={() => setNotice(`创建于 ${fmtDate(note.createdAt)}`)}
              onFocus={(focused) => {
                setEditing(focused);
                if (focused && mobile && menu === "format") {
                  setMenu(null);
                  formatTarget.current = null;
                }
              }}
            />
          );
        })}
        {mobile &&
          current &&
          !current.deletedAt &&
          (!current.locked || unlocked.has(current.id)) &&
          menu !== "format" &&
          (editing ? tools() : tools(true))}
        {saving > 0 && (
          <div className="save-status" aria-live="polite">
            正在保存…
          </div>
        )}
      </main>
      {renderMenu()}
      {folderForm && (
        <SmartFolderForm
          mobile={mobile}
          folder={folderForm.folder}
          catalog={tags.catalog.map(([name]) => name)}
          onCancel={() => setFolderForm(null)}
          onHandle={(handle) => {
            folderFormHandle.current = handle;
          }}
          onSave={saveFolderDraft}
          onRefresh={async (id) => {
            const data = await metadataRefreshRef.current();
            const folder = data?.folders.find((f) => f.id === id);
            if (folder?.kind !== "smart")
              throw Error("智能文件夹已不存在，当前草稿仍保留。");
            return folder;
          }}
        />
      )}
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
              "deleteSmartFolder",
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
                        deleteSmartFolder: "删除智能文件夹？",
                        purge: "永久删除备忘录？",
                      } as Record<string, string>
                    )[modal]
                  }
                </h2>
                {["deleteFolder", "deleteSmartFolder", "purge"].includes(
                  modal,
                ) ? (
                  <p>
                    {modal === "deleteSmartFolder"
                      ? "只删除此智能文件夹，备忘录仍保留在原文件夹中。"
                      : modal === "deleteFolder"
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
                      modal === "purge" ||
                      modal === "deleteFolder" ||
                      modal === "deleteSmartFolder"
                        ? "danger"
                        : "primary"
                    }
                  >
                    {modal === "purge" ||
                    modal === "deleteFolder" ||
                    modal === "deleteSmartFolder"
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
                  {ws.folders.filter(isPhysicalOwner).map((f) => (
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
                  {paperOptions.map((p) => (
                    <button
                      key={p}
                      aria-label={paperOptionLabels[p]}
                      data-paper-style={p}
                      className={`paper-option ${p === "plain" ? "paper-blank" : ""} paper-${p} ${current?.paperStyle === p ? "selected" : ""}`}
                      onClick={async () => {
                        if (current?.paperStyle === p) {
                          closePaper();
                          return;
                        }
                        await patch({
                          type: "patchNote",
                          id: current?.id,
                          paperStyle: p,
                        });
                        closePaper();
                      }}
                    >
                      {mobile && p !== "plain" && (
                        <span
                          className="paper-preview"
                          aria-hidden="true"
                          style={
                            {
                              "--paper-preview-url": `url("${paperPreviewUrls[p]}")`,
                            } as PaperPreviewStyle
                          }
                        />
                      )}
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
      {recording && (
        <RecordingPanel
          key={recording.batch.operationIds[0]}
          onCancel={() => void cancelRecording(recording).catch(fail)}
          onDone={(result) => submitRecording(recording, result)}
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
        e.preventDefault();
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
export default App;
