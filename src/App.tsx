import { isStorageView } from "./storage-usage";
import { ImagePreview, ImagePreviewContext, type ImagePreviewRequest } from "./ImagePreview";
import type { DebugAdapter } from "./debug/protocol";
import {
  SearchListPreview,
  searchListText,
  searchListSnippet,
} from "./search-list-text";
import { RecordingRevisions } from "./recording-revisions";
import {
  replaceRecordingAttachment,
  recordingAttachmentReferencedOnce,
} from "./recording-replacement";
import type { RecordingRevision } from "./recording-metadata";
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
import { flushSync } from "react-dom";
import { type Editor, type JSONContent } from "@tiptap/react";
import { editorSaveSnapshot } from "./editor-save-snapshot";
import { useEditorCommit } from "./use-editor-commit";
import {
  attachmentRecordedAt,
  type RecordingResult,
} from "./recording-metadata";
import { TagComposition } from "./tag-composition";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { NetworkSyncCoordinator, sameQuietAuthority, type QuietHost } from "./network-sync";
import { subscribeNetworkSync, replyNetworkSync } from "./bridge";
import { SmartFolderForm, type FolderFormHandle } from "./SmartFolderForm";
import {
  MobileQuickFolderIcon,
  MobileClosedFolderIcon,
  MobileAddFolderIcon,
} from "./MobileFolderIcons";
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
import { SidebarPreference } from "./sidebar-preference";
import { secureId } from "./secure-id";
import { invoke } from "@tauri-apps/api/core";
import { validRecordingAction, type RecordingPhase, type RecordingViewState } from "./recording-coordinator";
import DesktopRecordingPanel, {
  type DesktopRecordingPanelHandle,
} from "./DesktopRecordingPanel";
type LocalRecordingIdentity = {
  sessionId: string;
  operationId: string;
  owner: string;
  incarnation: string;
};
import { mountRecordingCard } from "./recording-live-card";
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
  revisions?: RecordingRevisions<PickerTarget>;
  batch: PickerBatch;
  accepting: boolean;
  detached: boolean;
  file?: File;
  recordedAt?: number;
  running?: Promise<void>;
  cancelling?: Promise<void>;
  desktop?: boolean;
  opening?: Promise<void>;
  registration?: {
    sessionId: string;
    operationId: string;
    error?: string;
    cancelRequested?: boolean;
    cancelling?: Promise<void>;
  };
  editorCommits?: Set<AbortController>;
  local?: {
    identity: LocalRecordingIdentity;
    handle?: DesktopRecordingPanelHandle;
    ready: Promise<DesktopRecordingPanelHandle>;
    attach: (handle: DesktopRecordingPanelHandle) => void;
    card?: ReturnType<typeof mountRecordingCard>;
  };
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
  Plus,
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
import { attachmentExportPending } from "./attachment-export";
import DataManagement, { type DataManagementHandle } from "./DataManagement";
import AppleNotesImport, { type AppleNotesImportHandle } from "./AppleNotesImport";
import SyncSettings, { type SyncSettingsHandle } from "./SyncSettings";
import type { SyncCommand } from "./sync-client";
import Preferences, { type PreferencesTab } from "./Preferences";
import type { ArchiveResult } from "./data-management";
import { documentsEqual } from "./document-equality";
import {
  projectSearchNote,
  shouldClearSearchAfterAccessChange,
} from "./search-selection";
import { SearchEditorGate } from "./search-editor-gate";
import RecordingPanel, { type RecordingPanelHandle } from "./RecordingPanel";
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
import { NodeSelection, Selection, type SelectionBookmark } from "@tiptap/pm/state";
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
      data-mobile-editor-note={note.id}
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
  const debugAdapter = useRef<DebugAdapter | null>(null);
  const debugFailure = useRef({ serial: 0, message: "" });
  const debugPending = useRef(new Set<Promise<unknown>>());
  const debugRecordingState = useRef<RecordingViewState | null>(null);
  const separate = new URLSearchParams(location.search).get("note");
  const initialMobile = useRef(window.innerWidth < 700 && !separate).current;
  const [ws, setWs] = useState<Workspace>(empty);
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const [loading, setLoading] = useState(true);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState(initialMobile ? "all" : "default");
  const [baseNoteId, setNoteId] = useState<string | null>(null);
  const [searchNoteId, setSearchNoteId] = useState<string | null>(null);
  const [page, setPage] = useState<"folders" | "notes" | "editor">(initialMobile ? "notes" : "folders");
  const [query, setQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState<string | null>(null);
  const searchIntent = useRef(0);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState("");
  // undefined = physical folder; null = all committed tags; name = exact tag.
  const [tagFilter, setTagFilter] = useState<string | null | undefined>();
  const [menu, setMenu] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [preferencesTab, setPreferencesTab] = useState<PreferencesTab>("settings");
  const preferencesTrigger = useRef<HTMLElement | null>(null);
  const [contextNote, setContextNote] = useState<string | null>(null);
  const [noteMenuPoint, setNoteMenuPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const noteMenuElement = useRef<HTMLDivElement>(null);
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
  const mobileNavigation = useRef(0);
  const createFlight = useRef<Promise<void> | null>(null);
  const [creatingNote, setCreatingNote] = useState(false);
  const [creationError, setCreationError] = useState("");
  const createReceipt = useRef<{ id: string; source: string } | null>(null);
  const createFocus = useRef<{ id: string; navigation: number } | null>(null);
  const [mobileCreatedEditor, setMobileCreatedEditor] = useState<string | null>(null);
  const cancelCreateFocus = useCallback(() => {
    mobileNavigation.current++;
    createFocus.current = null;
  }, []);
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
  const quitState = useRef<{
    id: string;
    editors: Map<Editor, boolean>;
  } | null>(null);
  const [quitPending, setQuitPending] = useState(false);
  const appSurface = useRef<HTMLDivElement | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewRequest | null>(null);
  const imagePreviewRef = useRef(imagePreview);
  imagePreviewRef.current = imagePreview;
  const hideImagePreview = useCallback(() => {
    // Access transitions must seal the old image before a queued React commit.
    const surface = appSurface.current?.querySelector<HTMLElement>(".image-preview");
    if(surface) {surface.hidden = true;surface.querySelector("img")?.removeAttribute("src");}
    setImagePreview(null);
  }, []);
  const previewOpener = useRef((_: ImagePreviewRequest) => {});
  const openImagePreview = useCallback((request: ImagePreviewRequest) => previewOpener.current(request), []);
  const closePreviewSource = useCallback((source: ImagePreviewRequest["source"]) => setImagePreview(value => value?.source === source ? null : value), []);
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
  const sidebarRequested = useRef(true);
  const initializedSidebar = useRef(false);
  const ownsSidebarPreference = native && macNative && !separate;
  const [sidebarPreference] = useState(
    () =>
      new SidebarPreference(
        (visible) =>
          action({
            type: "settings",
            settings: { macSidebarVisible: visible },
          }),
        () => loadWorkspace(),
      ),
  );
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
  const waitRecordingEditorCommit = useEditorCommit();
  const recordingPanel = useRef<RecordingPanelHandle | null>(null);
  const [, updateRecordingOwner] = useState(0);
  const [recordingIndicator, setRecordingIndicator] = useState<{
    owner: string;
    phase: RecordingPhase;
  } | null>(null);
  const recordingIndicatorRef = useRef(recordingIndicator);
  const projectRecordingIndicator = (value: typeof recordingIndicator) => {
    const previous = recordingIndicatorRef.current;
    if (previous?.owner === value?.owner && previous?.phase === value?.phase)
      return;
    recordingIndicatorRef.current = value;
    setRecordingIndicator(value);
  };
  const resumeDocumentAdmission = useRef<(id: string) => void>(() => {});
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
  const [syncCover, setSyncCover] = useState(false);
  const syncCoverRef = useRef(false);
  const dataManagementHandle = useRef<DataManagementHandle | null>(null);
  const appleNotesImportHandle = useRef<AppleNotesImportHandle | null>(null);
  const syncSettingsHandle = useRef<SyncSettingsHandle | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const archiveRunning = useRef(false);
  const blockedNotes = useRef(new Set<string>());
  const saveFailures = useRef(new Map<string, unknown>());
  const accessHandler = useRef<(event: AccessEvent) => void>(() => {});
  const clearSensitive = useRef<(ids: string[]) => void>(() => {});
  const synchronizeRef = useRef<
    (options?: { quiet?: boolean }) => Promise<SynchronizationResult<Workspace>>
  >(async () => ({
    success: false,
    sequence: 0,
    error: Error("同步尚未就绪"),
  }));
  const synchronization = useRef(
    new TrustedSynchronization<Workspace>(),
  ).current;
  const synchronizingRef = useRef(false);
  const synchronizationWork = useRef<Promise<SynchronizationResult<Workspace>> | null>(null);
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
  const [mobile, setMobile] = useState(!!initialMobile);
  const mobileMode = useRef(!!initialMobile);
  const paperOptions = mobile ? mobilePaperOptions : desktopPaperOptions;
  const queues = useRef(new Map<string, Promise<SaveOutcome>>());
  const revisions = useRef(new SaveRevisions());
  const externalVersions = useRef(new Map<string, number>());
  const pendingDocs = useRef(new Map<string, JSONContent>());
  const quietHost = useRef<QuietHost>(undefined!);
  const [, updateQuietWindow] = useState(0);
  const [networkSync] = useState(() => new NetworkSyncCoordinator({
    snapshot: () => quietHost.current.snapshot(),
    freeze: (ids, cancel) => quietHost.current.freeze(ids, cancel),
    reply: replyNetworkSync,
    committed: () => quietHost.current.committed(),
    error: (error) => quietHost.current.error(error),
  }));
  const quietMounted = useRef(true);
  const quietWrites = useRef(0);
  // Keep user input responsive while the projection still owns the frozen note.
  // Recheck after each terminal: another operation may have arrived meanwhile.
  const afterQuiet = useCallback(async (action: () => void | Promise<unknown>) => {
    while (networkSync.frozen()) await networkSync.cancel();
    if (quietMounted.current && !quitState.current) await action();
  }, [networkSync]);
  const changeSearch = useCallback((next: { query?: string; searching?: boolean; resetFilter?: boolean }) => {
    const intent = ++searchIntent.current;
    if (next.query !== undefined) setSearchDraft(next.query);
    return afterQuiet(() => {
      cancelCreateFocus();
      if (next.query !== undefined) setQuery(next.query);
      if (next.searching !== undefined) setSearching(next.searching);
      if (next.resetFilter) setFilter(value => value === "tags" ? value : "");
      if (searchIntent.current === intent) setSearchDraft(null);
    });
  }, [afterQuiet, cancelCreateFocus]);
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
    mobile && page === "editor" && mobileCreatedEditor === baseNoteId
      ? baseNoteId
      : !contentSearch && smartFolder
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
  const mobileCreationSelected =
    mobile &&
    page === "editor" &&
    mobileCreatedEditor === noteId &&
    !!noteId &&
    !!accessGate.state?.notes[noteId]?.authorized &&
    !current?.deletedAt;
  const selected = ws.notes.find(
    (n) =>
      n.id ===
      (desktopSearch && !listed.length && !mobileCreationSelected
        ? null
        : contextNote || noteId),
  );
  const editor = noteId ? editors.get(noteId) || null : null;
  useLayoutEffect(() => {
    if (mobile || menu !== "note") return;
    const element = noteMenuElement.current;
    if (!element) return;
    const place = () => {
      const margin = 8;
      const target = document.querySelector<HTMLElement>(
        `.note-row[data-note-id="${CSS.escape(contextNote || noteId || "")}"]`,
      );
      const rect = target?.getBoundingClientRect();
      const point = noteMenuPoint || {
        x: rect ? Math.max(margin, rect.left + 16) : margin,
        y: rect ? Math.max(margin, rect.top + Math.min(rect.height, 32)) : 52,
      };
      element.style.maxWidth = `${Math.max(0, window.innerWidth - margin * 2)}px`;
      element.style.maxHeight = `${Math.max(0, window.innerHeight - margin * 2)}px`;
      const menuRect = element.getBoundingClientRect();
      element.style.left = `${Math.max(margin, Math.min(point.x, window.innerWidth - menuRect.width - margin))}px`;
      element.style.top = `${Math.max(margin, Math.min(point.y, window.innerHeight - menuRect.height - margin))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      for (const property of ["left", "top", "max-width", "max-height"])
        element.style.removeProperty(property);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [
    mobile,
    menu,
    noteMenuPoint,
    contextNote,
    noteId,
    sidebar,
    view,
    settings.sidebarWidth,
    settings.listWidth,
  ]);
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
        if (networkSync.frozen(id)) {
          editorGate.park(instance);
          void networkSync.cancel();
        }
        if (quitState.current) {
          quitState.current.editors.set(instance, instance.isEditable);
          editorGate.park(instance);
        }
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
        !!quitState.current ||
          synchronizingRef.current ||
          !!accessGate.state?.operationId ||
          !owner ||
          blockedNotes.current.has(owner) ||
          networkSync.frozen(owner) ||
          !!accessGate.state?.suspended.includes(owner) ||
          accessGate.state?.notes[owner]?.authorized === false,
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
  const fail = useCallback((e: unknown) => {
    if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1")
      debugFailure.current = {
        serial: debugFailure.current.serial + 1,
        message: errText(e),
      };
    setError(errText(e));
  }, []);
  const changeSidebar = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      if (ownsSidebarPreference && !initializedSidebar.current) return;
      const visible =
        typeof value === "function" ? value(sidebarRequested.current) : value;
      sidebarRequested.current = visible;
      setSidebar(visible);
      if (ownsSidebarPreference)
        void sidebarPreference.request(visible).catch(fail);
    },
    [ownsSidebarPreference, sidebarPreference, fail],
  );
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
    (data: Workspace, initial = false) => {
      const restoredFolder = initial && initialMobile ? "all" : String(data.settings.selectedFolder || "default");
      setFolderId(
        restoredFolder === "all" ||
          data.folders.some((f) => f.id === restoredFolder)
          ? restoredFolder
          : "default",
      );
      const selectedId = separate || String(data.settings.selectedNote || "");
      setNoteId(
        initial && initialMobile
          ? null
          : data.notes.some((n) => n.id === selectedId) ? selectedId : null,
      );
      if (separate && data.notes.some((n) => n.id === selectedId))
        setPage("editor");
    },
    [separate, initialMobile],
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
            // A concurrent trusted validation intentionally invalidates older
            // metadata reads. Reuse its proof instead of upgrading that quiet
            // validation to a new full-window request.
            if (synchronizingRef.current && synchronizationWork.current)
              await synchronizationWork.current;
            else await synchronizeRef.current();
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
      const nextMobile = window.innerWidth < 700 && !separate;
      if (!!nextMobile !== mobileMode.current) cancelCreateFocus();
      mobileMode.current = !!nextMobile;
      setMobile(!!nextMobile);
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
  quietHost.current = {
    snapshot: () => {
      const protectedNoteIds = new Set<string>();
      for (const [id, instance] of editorsRef.current)
        if (!instance.isDestroyed && (instance.view.composing || tagCompositions.current.get(id)?.pending)) protectedNoteIds.add(id);
      for (const batch of [...pickerTargets.current.values(), ...attachmentBatches.current]) protectedNoteIds.add(batch.target.noteId);
      for (const submission of attachmentSubmissions.current.values()) protectedNoteIds.add(submission.noteId);
      // Ticket ownership lasts through document/journal ACK and final release,
      // including paused/checkpointed/closing/registration-error states.
      if (recordingTicket.current) protectedNoteIds.add(recordingTicket.current.batch.target.noteId);
      if (ocrOperation.current) protectedNoteIds.add(ocrOperation.current.target.noteId);
      const access = accessGate.state;
      return { sessionId: access?.sessionId,
        protectedNoteIds: [...protectedNoteIds],
        blocked: !quietMounted.current || !initializedSelection.current || !access || !!access.operationId || !!access.suspended.length || !!quitState.current || !!createFlight.current || quietWrites.current > 0 || archiveRunning.current || synchronizingRef.current || syncCoverRef.current,
      };
    },
    freeze: (ids, cancel) => {
      const held = new Map<Editor, { id: string; editable: boolean; stamp: AccessStamp; document: JSONContent; dom: HTMLElement }>();
      const focused = [...editorsRef.current.values()].find(instance => !instance.isDestroyed && ids.includes(nativeEditorOwners.current.get(instance) || "") && instance.view.dom.contains(document.activeElement));
      const focus = focused && document.hasFocus() ? {
        editor: focused, dom: focused.view.dom, selection: focused.state.selection.getBookmark(), moved: false,
      } : undefined;
      const relinquishFocus = () => { if (focus) focus.moved = true; };
      const focusIn = (event: FocusEvent) => {
        if (focus && event.target instanceof Node && event.target !== document.body && !focus.dom.contains(event.target)) relinquishFocus();
      };
      const focusKey = (event: KeyboardEvent) => { if (event.key === "Tab") relinquishFocus(); };
      const visibility = () => { if (document.hidden) relinquishFocus(); };
      if (focus) {
        document.addEventListener("focusin", focusIn, true);
        document.addEventListener("pointerdown", relinquishFocus, true);
        document.addEventListener("keydown", focusKey, true);
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("blur", relinquishFocus);
      }
      const scope = pickerRuntime.current.scope;
      const key = new PluginKey("notes-sync-quiet");
      const input = (event: Event) => { if (event.cancelable) event.preventDefault(); };
      for (const id of ids) {
        const instance = editorsRef.current.get(id);
        if (!instance || instance.isDestroyed) continue;
        held.set(instance, { id, editable: instance.isEditable, stamp: accessGate.stamp(id), document: instance.getJSON(), dom: instance.view.dom });
        instance.registerPlugin(new Plugin({ key, filterTransaction: tr => {
          if (!tr.docChanged) return true;
          cancel();
          return false;
        }}));
        instance.view.dom.addEventListener("compositionstart", cancel);
        instance.view.dom.addEventListener("beforeinput", input, true);
        editorGate.park(instance);
      }
      updateQuietWindow(value => value + 1);
      return {
        flush: async () => {
          for (;;) {
            const jobs = ids.map(id => queues.current.get(id));
            await Promise.all(jobs);
            if (ids.some((id, index) => queues.current.get(id) !== jobs[index])) continue;
            if (ids.some(id => pendingDocs.current.has(id) || saveFailures.current.has(id))) throw Error("同步等待本地更改确认保存");
            return;
          }
        },
        current: () => pickerRuntime.current.scope === scope && [...held].every(([instance, value]) => !instance.isDestroyed && editorsRef.current.get(value.id) === instance && nativeEditorOwners.current.get(instance) === value.id && sameQuietAuthority(value.stamp, accessGate.stamp(value.id)) && documentsEqual(value.document, instance.getJSON())),
        release: () => {
          document.removeEventListener("focusin", focusIn, true);
          document.removeEventListener("pointerdown", relinquishFocus, true);
          document.removeEventListener("keydown", focusKey, true);
          document.removeEventListener("visibilitychange", visibility);
          window.removeEventListener("blur", relinquishFocus);
          for (const [instance, value] of held) {
            if (instance.isDestroyed) continue;
            instance.unregisterPlugin(key);
            instance.view.dom.removeEventListener("compositionstart", cancel);
            instance.view.dom.removeEventListener("beforeinput", input, true);
            const note = wsRef.current.notes.find(note => note.id === value.id);
            const allowed = quietMounted.current && sameQuietAuthority(value.stamp, accessGate.stamp(value.id)) && editorsRef.current.get(value.id) === instance && nativeEditorOwners.current.get(instance) === value.id && !!note && !note.deletedAt && (!note.locked || accessGate.state?.notes[value.id]?.authorized === true);
            restoreEditor(instance, value.editable && allowed);
            if (allowed && pickerRuntime.current.editor === instance) editorGate.activate(instance, !!quitState.current || synchronizingRef.current || !!accessGate.state?.operationId || blockedNotes.current.has(value.id) || !!accessGate.state?.suspended.includes(value.id));
            if (allowed && focus?.editor === instance && !focus.moved && instance.isEditable &&
              pickerRuntime.current.scope === scope && pickerRuntime.current.editor === instance &&
              instance.view.dom === value.dom && value.dom === focus.dom && value.dom.isConnected &&
              documentsEqual(value.document, instance.getJSON()) && document.hasFocus() &&
              (document.activeElement === document.body || value.dom.contains(document.activeElement))) {
              instance.view.dispatch(instance.state.tr.setSelection(focus.selection.resolve(instance.state.doc)));
              instance.view.focus();
            }
          }
          if (quietMounted.current) updateQuietWindow(value => value + 1);
        },
      };
    },
    reply: replyNetworkSync,
    committed: async () => {
      const snapshot = await metadataRefreshRef.current();
      if (!snapshot && !accessGate.state?.operationId && !synchronizingRef.current) throw Error("同步更改已提交，等待可信正文刷新");
      await waitRecordingEditorCommit(new AbortController().signal);
    },
    error: error => { if (quietMounted.current && import.meta.env.DEV) console.error("notes-sync window", error); },
  };
  useLayoutEffect(() => { networkSync.check(); });
  useEffect(() => {
    quietMounted.current = true;
    networkSync.mount();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void subscribeNetworkSync(event => { void networkSync.receive(event).catch(quietHost.current.error); }, error => quietHost.current.error(error)).then(release => {
      if (disposed) release(); else unlisten = release;
    }).catch(quietHost.current.error);
    // User navigation must wait for the cancellation's linearized terminal
    // receipt. A click in an unrelated writable editor remains independent.
    const click = (event: MouseEvent) => {
      if (!networkSync.frozen()) return;
      const target = event.target instanceof Element ? event.target : null;
      const owner = target?.closest<HTMLElement>("[data-mobile-editor-note]")?.dataset.mobileEditorNote;
      if (owner && !networkSync.frozen(owner) && target?.closest(".tiptap")) return;
      const trigger = target?.closest<HTMLElement>("button, a, input, [role=button], .note-row, .gallery-card");
      if (!trigger) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void networkSync.cancel().then(() => { if (!disposed && trigger.isConnected) trigger.click(); }).catch(quietHost.current.error);
    };
    document.addEventListener("click", click, true);
    return () => { disposed = true; quietMounted.current = false; unlisten?.(); document.removeEventListener("click", click, true); networkSync.dispose(); };
  }, [networkSync]);
  const doAction = useCallback(
    async (a: Record<string, unknown>, validate?: () => void) => {
      quietWrites.current++;
      try {
      await networkSync.cancel();
      if (quitState.current) throw Error("正在完成保存并退出，请稍候。");
      await flush();
      if (quitState.current) throw Error("正在完成保存并退出，请稍候。");
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
      } finally { quietWrites.current--; }
    },
    [flush, hydrate, refresh],
  );
  const updateSettings = useCallback(
    (patch: Settings) => afterQuiet(() => {
      if (patch.view) setGalleryEditor(false);
      wsRef.current = {
        ...wsRef.current,
        settings: { ...wsRef.current.settings, ...patch },
      };
      setSettings((prev) => ({ ...prev, ...patch }));
      setWs((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
      const work = action({ type: "settings", settings: patch }).catch(fail);
      if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
        debugPending.current.add(work);
        void work.finally(() => debugPending.current.delete(work));
      }
      return work;
    }),
    [fail, afterQuiet],
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
      if (networkSync.frozen(id)) return Promise.resolve<SaveOutcome>({ saved: false, error: Error("备忘录正在应用同步更改，请稍候") });
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
          if (networkSync.frozen()) {
            event.preventDefault();
            await networkSync.cancel();
            await getCurrentWindow().close();
            return;
          }
          if (createFlight.current) {
            event.preventDefault();
            cancelCreateFocus();
            fail(Error("正在创建备忘录，请完成后重试关闭。"));
            return;
          }
          if (
            pendingDocs.current.size ||
            (ownsSidebarPreference && sidebarPreference.needsConfirmation) ||
            recordingLifecycle.current.active() ||
            ocrLifecycle.current.active()
          ) {
            event.preventDefault();
            if (quitState.current) return;
            const held = {
              id: `window-close-${secureId()}`,
              editors: new Map<Editor, boolean>(),
            };
            quitState.current = held;
            try {
              if (
                [...editorsRef.current.values()].some(
                  (instance) =>
                    !instance.isDestroyed && instance.view.composing,
                ) ||
                [...tagCompositions.current.values()].some(
                  (item) => item.pending,
                )
              )
                throw Error("输入法仍在组字，请完成输入后重试关闭。");
              editorGate.suspend();
              appSurface.current?.setAttribute("inert", "");
              setQuitPending(true);
              for (const instance of editorsRef.current.values()) {
                if (instance.isDestroyed) continue;
                held.editors.set(instance, instance.isEditable);
                editorGate.park(instance);
              }
              // Both owners seal admission synchronously before the first wait.
              const ocrClosing = ocrLifecycle.current.close();
              const recordingClosing = recordingLifecycle.current.close();
              await Promise.all([ocrClosing, recordingClosing]);
              do {
                if (ownsSidebarPreference) await sidebarPreference.flush();
                await flush();
              } while (
                ownsSidebarPreference &&
                sidebarPreference.needsConfirmation
              );
              if (
                !pendingDocs.current.size &&
                !recordingLifecycle.current.active() &&
                !ocrLifecycle.current.active()
              )
                await getCurrentWindow().destroy();
            } catch (e) {
              resumeDocumentAdmission.current(held.id);
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
  }, [flush, fail, ownsSidebarPreference, sidebarPreference]);
  useEffect(() => {
    if (!native) return;
    const releases: (() => void)[] = [];
    let live = true;
    const ready = new Map<
      string,
      { resolve: () => void; reject: (error: Error) => void }
    >();
    const resume = (id: string) => {
      ready.get(id)?.reject(Error("本次退出已取消，录音仍保留"));
      ready.delete(id);
      const held = quitState.current;
      if (!held || held.id !== id) return;
      quitState.current = null;
      editorGate.resume();
      appSurface.current?.removeAttribute("inert");
      setQuitPending(false);
      for (const instance of held.editors.keys()) {
        if (instance.isDestroyed) continue;
        const owner = nativeEditorOwners.current.get(instance);
        const note = wsRef.current.notes.find((item) => item.id === owner);
        if (!owner || editorsRef.current.get(owner) !== instance) continue;
        if (pickerRuntime.current.editor !== instance) {
          editorGate.park(instance);
          continue;
        }
        editorGate.activate(
          instance,
          synchronizingRef.current ||
            !!accessGate.state?.operationId ||
            blockedNotes.current.has(owner) ||
            !!accessGate.state?.suspended.includes(owner) ||
            !note ||
            !!note.deletedAt ||
            accessGate.state?.notes[owner]?.authorized === false,
        );
      }
    };
    resumeDocumentAdmission.current = resume;
    void getCurrentWindow()
      .listen<{ id: string }>("notes-recording-quit-ready", ({ payload }) => {
        if (quitState.current?.id === payload.id)
          ready.get(payload.id)?.resolve();
      })
      .then((release) => {
        if (live) releases.push(release);
        else release();
      });
    void getCurrentWindow()
      .listen<{ id: string }>("notes-recording-quit", async ({ payload }) => {
        await networkSync.cancel();
        if (quitState.current) return;
        // Seal user/native entry synchronously, before close/flush can yield.
        const held = { id: payload.id, editors: new Map<Editor, boolean>() };
        quitState.current = held;
        try {
          if (createFlight.current) {cancelCreateFocus();throw Error("正在创建备忘录，退出已取消；请完成后重试。");}
          if (
            [...editorsRef.current.values()].some(
              (instance) => !instance.isDestroyed && instance.view.composing,
            ) ||
            [...tagCompositions.current.values()].some((item) => item.pending)
          )
            throw Error("输入法仍在组字，退出已取消；请完成当前输入后重试。");
          if (pickerTargets.current.size || attachmentBatches.current.size)
            throw Error("附件操作尚未完成，退出已取消；原操作和内容仍保留。");
          editorGate.suspend();
          appSurface.current?.setAttribute("inert", "");
          setQuitPending(true);
          for (const instance of editorsRef.current.values()) {
            if (instance.isDestroyed) continue;
            held.editors.set(instance, instance.isEditable);
            editorGate.park(instance);
          }
          const sealed = new Promise<void>((resolve, reject) =>
            ready.set(payload.id, { resolve, reject }),
          );
          void sealed.catch(() => {});
          await invoke("recording_quit_sealed", { id: payload.id });
          await sealed;
          ready.delete(payload.id);
          if (quitState.current !== held) throw Error("本次退出已取消");
          const recordingClosing = recordingLifecycle.current.close();
          const ocrClosing = ocrLifecycle.current.close();
          await Promise.all([recordingClosing, ocrClosing]);
          if (ownsSidebarPreference) await sidebarPreference.flush();
          await flush();
          if (quitState.current !== held)
            throw Error("本次退出已取消，请重新执行。");
          await invoke("recording_quit_ack", { id: payload.id, success: true });
        } catch (e) {
          fail(e);
          await invoke("recording_quit_ack", {
            id: payload.id,
            success: false,
          })
            .then(() => resume(payload.id))
            .catch(() => {});
          await getCurrentWindow()
            .show()
            .catch(() => {});
        }
      })
      .then((release) => {
        if (live) releases.push(release);
        else release();
      });
    void getCurrentWindow()
      .listen<{ id: string }>(
        "notes-recording-quit-cancelled",
        ({ payload }) => {
        resume(payload.id);
        fail(
          Error("退出已取消。录音或正文尚未确认保存，请保持窗口打开并重试。"),
        );
        },
      )
      .then((release) => {
        if (live) releases.push(release);
        else release();
      });
    return () => {
      live = false;
      for (const waiter of ready.values())
        waiter.reject(Error("原正文窗口已卸载"));
      ready.clear();
      releases.forEach((release) => release());
    };
  }, [flush, fail, ownsSidebarPreference, sidebarPreference]);
  clearSensitive.current = (ids) => {
    if (!ids.length) return;
    if(imagePreviewRef.current?.owner && ids.includes(imagePreviewRef.current.owner)) hideImagePreview();
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
      setModal((current) => current === "preferences" ? current : null);
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
  const coverSynchronization = () => {
    syncCoverRef.current = true;
    hideImagePreview();
    setSyncCover(true);
  };
  synchronizeRef.current = (options) => {
    const knownSession = accessGate.state?.sessionId;
    const quiet = options?.quiet && initializedSelection.current && !!knownSession &&
      !accessGate.state?.operationId && !accessGate.state?.suspended.length && !syncCoverRef.current;
    const work = synchronization.request(
      () => {
        invalidateAccessRequests();
        if (!quiet) coverSynchronization();
        synchronizingRef.current = true;
        setSynchronizing(true);
        setSyncError("");
      },
      async () => {
        for (;;) {
          try {
            const data = await loadWorkspace(true);
            if (quiet && (data.access?.sessionId !== knownSession || data.access?.operationId || data.access?.suspended.length)) {
              // rAF alone does not commit React state: a deferred cover update
              // could otherwise batch with the trusted publish that clears it.
              // This runs after an async load, outside React's render/effects.
              flushSync(coverSynchronization);
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
            return data;
          } catch (error) {
            if (!(error instanceof MetadataStale)) throw error;
          }
        }
      },
      (data) => {
        if (!hydrate(data)) throw new MetadataStale();
        if (ownsSidebarPreference && !initializedSidebar.current) {
          initializedSidebar.current = true;
          sidebarRequested.current =
            typeof data.settings.macSidebarVisible === "boolean"
              ? data.settings.macSidebarVisible
              : true;
          setSidebar(sidebarRequested.current);
        }
        if (!initializedSelection.current) {
          initializedSelection.current = true;
          restoreSelection(data, true);
        }
        blockedNotes.current = new Set(data.access?.suspended || []);
        setAccessSuspended([...blockedNotes.current]);
        synchronizingRef.current = false;
        setSynchronizing(false);
        syncCoverRef.current = false;
        setSyncCover(false);
        setWorkspaceLoaded(true);
      },
      (e) => {
        coverSynchronization();
        fail(e);
        setSyncError(errText(e));
        // Keep cached content covered until a trusted retry succeeds.
      },
    );
    synchronizationWork.current = work;
    void work.finally(() => {
      if (synchronizationWork.current === work) synchronizationWork.current = null;
    }).catch(() => {});
    return work;
  };
  accessHandler.current = (event) => {
    if (event.phase === "prepare") {
      coverSynchronization();
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
  useLayoutEffect(() => {
    const intent = createFocus.current;
    if (!intent) return;
    if (!mobile || intent.navigation !== mobileNavigation.current || page !== "editor" || modal || menu || folderForm || quitPending) {
      createFocus.current = null;
      return;
    }
    const instance = editors.get(intent.id);
    if (noteId !== intent.id || !instance || instance.isDestroyed || !instance.isEditable || nativeEditorOwners.current.get(instance) !== intent.id || !instance.view.dom.isConnected || !instance.view.dom.getClientRects().length || synchronizingRef.current || accessGate.state?.operationId || accessGate.state?.suspended.includes(intent.id) || !accessGate.state?.notes[intent.id]?.authorized) return;
    createFocus.current = null;
    instance.view.dispatch(instance.state.tr.setSelection(Selection.atEnd(instance.state.doc)));
    instance.view.focus();
    keyboard(true);
    setEditing(true);
  });
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
    if (quitState.current) return;
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
        const ticket = recordingTicket.current;
        if (ticket?.desktop && ticket.batch.target.editor === instance) {
          const target = ticket.batch.target;
          target.bookmark = target.bookmark.map(transaction.mapping);
          target.documentVersion =
            nativeDocumentVersions.current.get(instance) || 0;
          target.document = instance.getJSON();
        }
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
    if (networkSync.frozen()) { void networkSync.cancel().then(() => chooseFolder(id)); return; }
    cancelCreateFocus();
    setMobileCreatedEditor(null);
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
    if (networkSync.frozen()) { void networkSync.cancel().then(() => chooseTag(name)); return; }
    cancelCreateFocus();
    setMobileCreatedEditor(null);
    clearTagComposition();
    setTagFilter(name);
    setFilter("");
    setSearchNoteId(null);
    setGalleryEditor(false);
    setPage("notes");
    setMenu(null);
  };
  const chooseNote = (n: Note) => {
    if (networkSync.frozen()) { void networkSync.cancel().then(() => chooseNote(n)); return; }
    cancelCreateFocus();
    setMobileCreatedEditor(null);
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
    (validate?: () => void): Promise<void> => {
      if (createFlight.current) return createFlight.current;
      const source = folderId, navigation = mobileNavigation.current;
      if (mobile) { createFocus.current = null; setCreatingNote(true); setCreationError(""); }
      const work = (async () => {
      quietWrites.current++;
      try {
        await networkSync.cancel();
        if (quitState.current) throw Error("正在完成保存并退出，请稍候。");
        await flush();
        if (quitState.current) throw Error("正在完成保存并退出，请稍候。");
        validate?.();
        const fid = isPhysicalOwner(
          wsRef.current.folders.find((f) => f.id === folderId),
        )
          ? folderId
          : "default";
        const retained = mobile && createReceipt.current?.source === source ? createReceipt.current : null;
        const created = retained ? null : await action<Note & Pick<Workspace, "access">>({ type: "createNote", folderId: fid });
        const createdId = retained?.id ?? created?.receipt?.createdId ?? created?.value?.id;
        if (!createdId) throw Error("后端未提供新建收据");
        if (mobile) createReceipt.current = {id: createdId, source};
        if (created?.maintenanceError) fail(created.maintenanceError);
        // Keep the successful unique ID even if its snapshot is stale. Never
        // issue create again; only authoritative data can activate the editor.
        const data = await metadataRefreshRef.current();
        const n = data?.notes.find((note) => note.id === createdId);
        if (!n || !accessGate.state?.notes[createdId]?.authorized) {
          setNotice("备忘录已经创建，列表同步后可查看");
          if (mobile) setCreationError("备忘录已创建，点击＋重试打开");
          return;
        }
        if (mobile && createReceipt.current?.id === createdId) createReceipt.current = null;
        if (mobile && navigation !== mobileNavigation.current) return;
        revisions.current.confirmed(n.id, n.revision);
        clearTagComposition();
        setTagFilter(undefined);
        setFolderId(mobile ? source : fid);
        if (mobile) setMobileCreatedEditor(n.id);
        setSearchNoteId(null);
        setFilter("");
        setNoteId(n.id);
        setPage("editor");
        setGalleryEditor(true);
        setMenu(null);
        setQuery("");
        setSearching(false);
        setEditing(true);
        updateSettings({ selectedFolder: mobile ? source : fid, selectedNote: n.id });
        if (mobile) createFocus.current = {id:n.id,navigation};
        else setTimeout(
          () => document.querySelector<HTMLElement>(".tiptap")?.focus(),
          100,
        );
      } catch (e) {
        if (mobile) setCreationError(errText(e));
        fail(e);
      } finally { quietWrites.current--; }
      })();
      createFlight.current = work;
      void work.finally(() => { if (createFlight.current === work) {createFlight.current = null;if (mobile) setCreatingNote(false);} });
      return work;
    },
    [fail, flush, folderId, updateSettings, clearTagComposition, mobile],
  );
  const newNote = useCallback(() => createNote(), [createNote]);
  const openFolders = () => {
    if (networkSync.frozen()) { void networkSync.cancel().then(openFolders); return; }
    cancelCreateFocus();
    setSearching(false);
    setQuery("");
    setFilter("");
    setTagFilter(undefined);
    setPage("folders");
  };
  const finishEditing = async () => {
    await networkSync.cancel();
    cancelCreateFocus();
    await flush();
    editor?.commands.blur();
    keyboard(false);
    setEditing(false);
  };
  const saveFolderDraft = async (draft: FolderDraft, committedId?: string) => {
    quietWrites.current++;
    try {
    await networkSync.cancel();
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
    } finally { quietWrites.current--; }
  };
  const openModal = (type: string, value = "") => {
    cancelCreateFocus();
    if (type === "settings" || type === "data") {
      if (modal !== "preferences") preferencesTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPreferencesTab(type === "data" ? "data" : "settings");
      setModal("preferences");
      setMenu(null);
      return;
    }
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
    if (networkSync.frozen()) { void networkSync.cancel().then(back); return; }
    cancelCreateFocus();
    setMenu(null);
    setEditing(false);
    setShowFind(false);
    if (mobile) {
      editor?.commands.blur();
      keyboard(false);
      if (page === "editor") {setPage("notes");setMobileCreatedEditor(null);}
      else chooseFolder("all");
      void flush().catch(fail);
    }
    else if (view === "gallery" && galleryEditor) setGalleryEditor(false);
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
    if (networkSync.frozen()) { void networkSync.cancel().then(() => androidBack.current()); return; }
    if (imagePreview) setImagePreview(null);
    else if (folderForm) folderFormHandle.current?.cancel();
    else if (ocrOperation.current) void cancelOcr().catch(fail);
    else if (modal === "paper") closePaper();
    else if (modal) setModal(null);
    else if (menu === "format") closeFormat(false);
    else if (menu) setMenu(null);
    else if (draw) setDraw(null);
    else if (record) recordingPanel.current?.close();
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
    } else if (mobile ? page !== "notes" || folderId !== "all" : page !== "folders") back();
    else {
      cancelCreateFocus();
      if (mobile && createFlight.current) {setNotice("正在创建备忘录，请稍候");return;}
      if (pickerTargets.current.size || attachmentBatches.current.size) {fail(Error("附件操作尚未完成，请稍候再退出。"));return;}
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
    async (mode: "export" | "import"): Promise<ArchiveResult> => {
      setMenu(null);
      if (archiveRunning.current) return { status: "error", message: "备份操作正在进行中" };
      if (recordingTicket.current || record) return { status: "error", message: "请先完成录音，再导入或导出备份。内存中的录音尚未备份。" };
      archiveRunning.current = true;
      setArchiveBusy(true);
      try {
        await networkSync.cancel();
        if (!native) {
          setNotice("请在已安装的 Mac 或 Android 应用中导入、导出本地备份。");
          return { status: "error", message: "请在已安装的应用中操作本地备份" };
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
        if (typeof path !== "string") return { status: "cancelled" };
        if (recordingTicket.current || record) throw Error("请先完成录音，再操作备份");
        await flush();
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
        return { status: "success" };
      } catch (e) {
        fail(e);
        return { status: "error", message: errText(e) };
      } finally {
        archiveRunning.current = false;
        setArchiveBusy(false);
      }
    },
    [flush, hydrate, restoreSelection, synchronization, fail, record],
  );
  const prepareAppleImport = useCallback(async () => {
    if (archiveRunning.current) throw Error("数据操作正在进行中");
    if (recordingTicket.current || record) throw Error("请先完成录音，再导入备忘录");
    archiveRunning.current = true;
    setArchiveBusy(true);
    try {
      await networkSync.cancel();
      await flush();
      if (recordingTicket.current || record || quitState.current) throw Error("当前无法开始导入");
    } catch (error) {
      archiveRunning.current = false;
      setArchiveBusy(false);
      throw error;
    }
  }, [flush, record]);
  const finishAppleImport = useCallback(async (changed: boolean) => {
    try {
      if (changed) {
        const synced = await synchronizeRef.current();
        if (!synced.success) throw synced.error;
        if (!synchronization.current(synced)) throw new MetadataStale();
        await dataManagementHandle.current?.refresh();
      }
    } catch (error) { fail(error); }
    finally { archiveRunning.current = false; setArchiveBusy(false); }
  }, [synchronization, fail]);
  const openSeparate = async (n: Note) => {
    await networkSync.cancel();
    if (quitState.current) return;
    if (!native) {
      chooseNote(n);
      return;
    }
    try {
      await flush();
      if (quitState.current) return;
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
    void afterQuiet(() => {
      setSearching(true);
      if (native && macNative) {
        const toolbar = nativeToolbar.current;
        if (toolbar) void toolbar.focusSearch().catch(fail);
        else fail(new Error("原生搜索尚未就绪"));
      } else setTimeout(() => searchInput.current?.focus(), 0);
    }).catch(fail);
  }, [fail, afterQuiet]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (quitState.current) {
        e.preventDefault();
        return;
      }
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
          focusGlobalSearch();
        }
      }
      if (e.key === "Escape") {
        if (ocrOperation.current) void cancelOcr().catch(fail);
        else if (modal === "paper") closePaper();
        else if (modal) setModal(null);
        else if (menu) setMenu(null);
        else if (showFind) setShowFind(false);
        else if (searching || searchDraft !== null) {
          void changeSearch({ searching: false, query: "" }).catch(fail);
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
    searchDraft,
    changeSearch,
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
            changeSidebar((v) => !v);
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
  }, [
    newNote,
    view,
    updateSettings,
    archive,
    focusGlobalSearch,
    fail,
    changeSidebar,
  ]);
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
    const synced = await synchronizeRef.current({ quiet: !recording && !ocr });
    if (!owned()) throw Error("原录音会话已关闭");
    if (synced.success && synchronization.current(synced)) {
      // The trusted response may resolve before React restores the original
      // Host's gate. Wait for that actual commit, then retain every target check.
      const controller = new AbortController();
      if (recording) {
        recording.editorCommits ??= new Set();
        recording.editorCommits.add(controller);
      }
      try {
        await waitRecordingEditorCommit(controller.signal);
      } finally {
        recording?.editorCommits?.delete(controller);
      }
      if (!owned()) throw Error("原录音会话已关闭");
    }
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
  // Recording alone permits current local edits and a parked original editor.
  // Generic file-picker/OCR validation above remains deliberately unchanged.
  const validateRecordingTarget = async (
    ticket: RecordingTicket,
    allowSealed: boolean,
  ) => {
    const target = ticket.batch.target;
    const owned = () =>
      recordingTicket.current === ticket &&
      !!ticket.local &&
      ticket.local.identity.owner === getCurrentWindow().label &&
      ticket.local.identity.operationId === ticket.batch.operationIds[0] &&
      !!ticket.local.identity.incarnation &&
      !ticket.detached &&
      !target.invalidated &&
      (ticket.accepting || allowSealed);
    if (!owned()) throw Error("原录音会话已失效，音频仍保留");
    await invoke("recording_local_validate", ticket.local!.identity);
    if (!owned()) throw Error("原录音会话已失效，音频仍保留");
    for (let attempt = 0; attempt < 4; attempt++) {
      const queue = queues.current.get(target.noteId);
      await queue;
      if (
        !owned() ||
        pendingDocs.current.has(target.noteId) ||
        saveFailures.current.has(target.noteId)
      )
        throw Error("原笔记更改尚未保存，录音仍保留；请先重试保存正文");
      const synced = await synchronizeRef.current();
      if (!owned()) throw Error("原录音归属已失效，音频仍保留");
      if (synced.success && synchronization.current(synced)) {
        // A trusted read resolves before React restores the active Host gate.
        // Wait for that commit, then recheck the entire original-A target below.
        const controller = new AbortController();
        ticket.editorCommits ??= new Set();
        ticket.editorCommits.add(controller);
        try {
          await waitRecordingEditorCommit(controller.signal);
        } finally {
          ticket.editorCommits.delete(controller);
        }
        if (!owned()) throw Error("原录音归属已失效，音频仍保留");
      }
      if (
        queues.current.get(target.noteId) !== queue ||
        pendingDocs.current.has(target.noteId)
      )
        continue;
      const instance = target.editor;
      const original = target.stamp;
      const stamp = accessGate.stamp(target.noteId);
      const note = synced.success
        ? synced.snapshot.notes.find((n) => n.id === target.noteId)
        : undefined;
      if (
        !synced.success ||
        !synchronization.current(synced) ||
        !note ||
        note.deletedAt ||
        !original.sessionId ||
        stamp.sessionId !== original.sessionId ||
        original.epoch === undefined ||
        stamp.epoch === undefined ||
        stamp.epoch < original.epoch ||
        stamp.noteEpoch !== original.noteEpoch ||
        stamp.noteId !== target.noteId ||
        original.noteId !== target.noteId ||
        accessGate.state?.operationId ||
        blockedNotes.current.has(target.noteId) ||
        accessGate.state?.suspended.includes(target.noteId) ||
        (note.locked && !accessGate.state?.notes[target.noteId]?.authorized) ||
        instance.isDestroyed ||
        editorsRef.current.get(target.noteId) !== instance ||
        nativeEditorOwners.current.get(instance) !== target.owner ||
        target.owner !== target.noteId ||
        (pickerRuntime.current.editor === instance &&
          !instance.isEditable &&
          !quitState.current?.editors.get(instance)) ||
        (externalVersions.current.get(target.noteId) || 0) !==
          target.externalVersion ||
        (nativeDocumentVersions.current.get(instance) || 0) !==
          target.documentVersion ||
        !documentsEqual(instance.getJSON(), target.document) ||
        !documentsEqual(
          editorSaveSnapshot(instance.getJSON()),
          editorSaveSnapshot(note.document),
        )
      )
        throw Error(
          "原录音笔记、编辑器或授权已改变，音频仍保留；不会写入其他笔记",
        );
      target.bookmark.resolve(instance.state.doc);
      target.stamp = { ...stamp };
      target.trustedDocument = note.document;
      return;
    }
    throw Error("原笔记仍在保存更改，录音已保留，请重试保存录音");
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
          batch.recording?.local
            ? validateRecordingTarget(batch.recording, operation.inserted)
            : validatePickerTarget(target, batch.recording, operation.inserted),
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
          if (batch.recording?.local) {
            const selection = target.bookmark.resolve(instance.state.doc);
            // Map the user's current selection through a normal insertion. No
            // focus or selected-note change, including while A is parked for B.
            const inserted = instance.commands.insertContentAt(
              { from: selection.from, to: selection.to },
              {
                type: "attachment",
                attrs: {
                  id: attachment.id,
                  name: attachment.displayName,
                  kind: attachment.kind,
                },
              },
              { updateSelection: false },
            );
            if (!inserted) throw Error("原编辑器未接受录音，音频仍保留");
            return;
          }
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
              .command(({ tr }) => {
                // Tiptap may select a just-inserted atomic block. Leaving that
                // automatic NodeSelection would replace it with the next file
                // in this batch (or the next chooser), despite no user selection.
                if (
                  tr.selection instanceof NodeSelection &&
                  tr.selection.node.type.name === "attachment" &&
                  tr.selection.node.attrs.id === attachment.id
                ) {
                  const after = tr.selection.to;
                  if (!tr.doc.resolve(after).nodeAfter?.isTextblock)
                    tr.insert(after, instance.schema.nodes.paragraph.create());
                  tr.setSelection(Selection.near(tr.doc.resolve(after), 1));
                }
                return true;
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
    let debugComplete: (() => void) | undefined;
    if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
      const work = new Promise<void>((resolve) => { debugComplete = resolve; });
      debugPending.current.add(work);
      void work.finally(() => debugPending.current.delete(work));
    }
    try {
      for (const [id, doc] of [...pendingDocs.current]) await saveDoc(id, doc);
      for (const batch of [...attachmentBatches.current]) {
        if (batch.recording && batch.cancelRequested)
          await cancelRecording(batch.recording);
        else await submitAttachmentBatch(batch);
      }
      if (ocrOperation.current) await retryOcr();
      if (
        !pendingDocs.current.size &&
        !saveFailures.current.size &&
        !attachmentBatches.current.size &&
        !ocrOperation.current
      ) setError("");
    } finally {
      debugComplete?.();
    }
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
  const fileSelected = async (
    input: HTMLInputElement,
    suppliedFiles?: readonly File[],
  ) => {
    const files = suppliedFiles || input.files;
    const batch = pickerTargets.current.get(input);
    pickerTargets.current.delete(input);
    let debugComplete: (() => void) | undefined;
    if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
      const work = new Promise<void>((resolve) => {
        debugComplete = resolve;
      });
      debugPending.current.add(work);
      void work.finally(() => debugPending.current.delete(work));
    }
    try {
      if (!files?.length) return; // Picker cancellation has not started storage.
      if (!batch) throw Error("附件选择缺少原目标，请重新选择");
      batch.files = Array.from(files);
      for (let i = 1; i < batch.files.length; i++)
        batch.operationIds.push(secureId());
      attachmentBatches.current.add(batch);
      await submitAttachmentBatch(batch);
    } catch (e) {
      if (!batch?.cancelRequested) fail(e);
    } finally {
      debugComplete?.();
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
        className={`folder-row ${mobile && f.kind === "quick" ? "mobile-quick-folder-row" : ""} ${tagFilter === undefined && folderId === f.id ? "selected" : ""}`}
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
          mobile ? (
            <MobileQuickFolderIcon />
          ) : (
            <StickyNote />
          )
        ) : f.kind === "trash" ? (
          <Trash2 />
        ) : mobile ? (
          <MobileClosedFolderIcon />
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
        placeholder={mobile ? "搜索笔记" : "搜索"}
        value={searchDraft ?? query}
        onFocus={() => { void changeSearch({ searching: true }).catch(fail); }}
        onChange={(e) => {
          void changeSearch({ query: e.target.value, resetFilter: true }).catch(fail);
        }}
      />
      {(searchDraft ?? query) ? (
        <button aria-label="清除搜索" onClick={() => { void changeSearch({ query: "" }).catch(fail); }}>
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
  const capturePickerTarget = (context?: NativeContext): PickerBatch => {
    const live = pickerRuntime.current;
    const instance = context ? context.editor : live.editor;
    if (
      quitState.current ||
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
    if (original.locked) throw Error("已锁定备忘录不支持附件，请先移除锁定");
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
    for (const controller of ticket.editorCommits || []) controller.abort();
    ticket.local?.card?.dispose();
    if (ticket.local) return; // Unmount only after native cleanup is confirmed.
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
    for (const controller of ticket.editorCommits || []) controller.abort();
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
  const submitRecordingRevision = async (
    ticket: RecordingTicket,
    result: RecordingRevision,
  ) => {
    if (
      !ticket.accepting ||
      ticket.detached ||
      recordingTicket.current !== ticket ||
      !ticket.local
    )
      throw Error("原录音会话已失效，音频仍保留。");
    if (
      ticket.recordedAt !== undefined &&
      ticket.recordedAt !== result.recordedAt
    )
      throw Error("录音开始时间已改变，原音频仍保留。");
    ticket.recordedAt = attachmentRecordedAt(result.recordedAt, "audio");
    if (ticket.recordedAt === undefined)
      throw Error("录音开始时间缺失，原音频仍保留。");
    const target = ticket.batch.target;
    ticket.revisions ??= new RecordingRevisions(target.noteId, target);
    await ticket.revisions.run(result, {
      validate: (inserted) => validateRecordingTarget(ticket, inserted),
      register: (operation) =>
        attachmentSubmissions.current.set(operation.operationId, operation),
      committed: async (operation) => {
        await invoke("recording_local_revision", {
          ...ticket.local!.identity,
          revision: result.revision,
          finalIntent: result.intent === "final",
        });
        attachmentSubmissions.current.delete(operation.operationId);
      },
      store: (operation) =>
        storeAttachmentOperation(
          operation.operationId,
          target.noteId,
          operation.file,
          operation.recordedAt,
        ),
      query: (operation) =>
        queryAttachmentOperation(operation.operationId, target.noteId),
      insert: (attachment, previous) =>
        replaceRecordingAttachment(
          target.editor,
          target.bookmark,
          attachment,
          previous,
        ),
      inserted: (attachment) => ticket.local?.card?.persisted(attachment.id),
      references: (attachment) =>
        !target.editor.isDestroyed &&
        recordingAttachmentReferencedOnce(target.editor, attachment),
      awaitDocumentAck: (operation) =>
        awaitAttachmentDocumentAck(operation, target),
    });
    // The next checkpoint can replace this committed version. Do not terminate
    // the original ticket or discard its editor/bookmark on checkpoint ACK.
    // Desktop final ACK and native cleanup are separate retry boundaries.
    void metadataRefreshRef.current();
  };
  const completeDesktopRecording = async (
    ticket: RecordingTicket,
    saved: boolean,
    revision: number,
  ) => {
    const local = ticket.local;
    if (!local || recordingTicket.current !== ticket || ticket.detached)
      throw Error("原录音会话已失效，音频仍保留");
    await invoke("recording_local_release", {
      ...local.identity,
      saved,
      revision,
    });
    ticket.accepting = false;
    local.card?.dispose();
    for (const controller of ticket.editorCommits || []) controller.abort();
    recordingTicket.current = null;
    projectRecordingIndicator(null);
    updateRecordingOwner((value) => value + 1);
  };
  const registerDesktopRecording = (ticket: RecordingTicket): Promise<void> => {
    if (ticket.opening) return ticket.opening;
    if (ticket.local) return Promise.resolve();
    const registration = ticket.registration;
    if (!registration || recordingTicket.current !== ticket || ticket.detached)
      return Promise.reject(Error("原录音准备身份已失效"));
    registration.error = undefined;
    const work = (async () => {
      try {
        const identity = await invoke<LocalRecordingIdentity>("register_recording_local", {
          sessionId: registration.sessionId,
          operationId: registration.operationId,
        });
        if (recordingTicket.current !== ticket || ticket.detached)
          throw Error("原录音准备窗口已失效");
        let attach!: (handle: DesktopRecordingPanelHandle) => void;
        const ready = new Promise<DesktopRecordingPanelHandle>(resolve => { attach = resolve; });
        ticket.local = { identity: Object.freeze(identity), ready, attach };
      } catch (error) {
        registration.error = errText(error);
        throw error;
      }
    })();
    ticket.opening = work;
    updateRecordingOwner(value => value + 1);
    void work.finally(() => {
      if (ticket.opening === work) ticket.opening = undefined;
      if (recordingTicket.current === ticket && !ticket.detached)
        updateRecordingOwner(value => value + 1);
    }).catch(() => {});
    return work;
  };
  const cancelDesktopRegistration = (ticket: RecordingTicket): Promise<void> => {
    const registration = ticket.registration;
    if (!registration || recordingTicket.current !== ticket || ticket.detached)
      return Promise.reject(Error("原录音准备身份已失效"));
    if (registration.cancelling) return registration.cancelling;
    // No Panel has mounted and no capture is admitted while cancellation owns
    // registration recovery. Recover its exact identity, then release empty.
    registration.cancelRequested = true;
    const work = (async () => {
      try {
        await registerDesktopRecording(ticket);
        await completeDesktopRecording(ticket, false, 0);
      } catch (error) {
        registration.error = errText(error);
        throw error;
      }
    })();
    registration.cancelling = work;
    updateRecordingOwner(value => value + 1);
    void work.finally(() => {
      if (registration.cancelling === work) registration.cancelling = undefined;
      if (recordingTicket.current === ticket && !ticket.detached)
        updateRecordingOwner(value => value + 1);
    }).catch(() => {});
    return work;
  };
  const openRecording = (context?: NativeContext) => {
    if (recordingTicket.current) {
      if (recordingTicket.current.desktop) {
        document.querySelector<HTMLElement>(".recording-dock")?.scrollIntoView({ block: "nearest" });
        return;
      }
      throw Error("上次录音操作尚未核定，请先重试保存或取消");
    }
    const batch = capturePickerTarget(context);
    const desktop = native && !mobile;
    const ticket: RecordingTicket = {
      batch, accepting: true, detached: false, desktop,
      registration: desktop ? { sessionId: secureId(), operationId: batch.operationIds[0] } : undefined,
    };
    batch.recording = ticket;
    recordingTicket.current = ticket;
    setMenu(null);
    if (desktop) void registerDesktopRecording(ticket).catch(fail);
    else setRecord(true);
  };
  recordingLifecycle.current = {
    active: () => !!recordingTicket.current,
    close: async () => {
      const ticket = recordingTicket.current;
      if (!ticket) return;
      if (ticket.desktop) {
        if (!ticket.local || ticket.registration?.cancelRequested) {
          await cancelDesktopRegistration(ticket);
          return;
        }
        if (ticket.local.handle) {
          // Initiate close before yielding so pending capture is sealed at the
          // same boundary as document admission on main-window close.
          await ticket.local.handle.close();
          return;
        }
        const handle = await ticket.local.ready;
        if (recordingTicket.current !== ticket || ticket.detached)
          throw Error("原录音侧栏已失效");
        await handle.close();
        return;
      }
      await ticket.opening;
      if (recordingTicket.current !== ticket) return;
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
      if (ticket && ids.includes(ticket.batch.target.noteId)) {
        if (ticket.desktop) {
          ticket.batch.target.invalidated = true;
          projectRecordingIndicator(null);
          for (const controller of ticket.editorCommits || [])
            controller.abort();
          ticket.local?.card?.dispose();
        } else void cancelRecording(ticket).catch(fail);
      }
    },
    detach: () => {
      const ticket = recordingTicket.current;
      if (ticket) {
        ticket.detached = true;
        projectRecordingIndicator(null);
        sealRecording(ticket);
      }
    },
  };
  const desktopRecording = recordingTicket.current?.desktop ? recordingTicket.current : null;
  const projectDesktopRecording = (
    ticket: RecordingTicket,
    state: RecordingViewState,
  ) => {
    // Old timers must never revive a completed or superseded owner's indicator.
    if (recordingTicket.current !== ticket || ticket.detached) return;
    if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1")
      debugRecordingState.current = state;
    if (
      !ticket.local ||
      !ticket.accepting ||
      state.recordedAt === undefined ||
      ticket.batch.target.invalidated
    ) {
      projectRecordingIndicator(null);
      return;
    }
    projectRecordingIndicator({
      owner: ticket.batch.target.noteId,
      phase: state.hasError ? "error" : state.phase,
    });
    try {
      ticket.local.card ??= mountRecordingCard({
        editor: ticket.batch.target.editor,
        bookmark: ticket.batch.target.bookmark,
      });
      ticket.local.card.update({
        ...state,
        recordedAt: state.recordedAt,
        toggle: () => ticket.local?.handle?.toggle(),
        finish: () => {
          void ticket.local?.handle?.close().catch(fail);
        },
      });
    } catch (error) {
      fail(error);
    }
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
          <button className="format-button" aria-label="格式" onClick={openFormat}>格式</button>
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
          ref={noteMenuElement}
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
                disabled={!!current?.locked}
                icon={<FileText size={19} />}
                onClick={() => {
                  openAttachmentPicker(fileInput.current, "");
                  setMenu(null);
                }}
              >
                附加文件
              </MenuRow>
              <MenuRow
                disabled={!!current?.locked}
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
                disabled={!!current?.locked}
                icon={<Image size={19} />}
                onClick={() => {
                  openAttachmentPicker(fileInput.current, "image/*,video/*");
                  setMenu(null);
                }}
              >
                选取照片或视频
              </MenuRow>
              <MenuRow
                disabled={!!current?.locked}
                icon={<Camera size={19} />}
                onClick={() => {
                  openAttachmentPicker(cameraInput.current);
                  setMenu(null);
                }}
              >
                拍照或录像
              </MenuRow>
              <MenuRow
                disabled={!!current?.locked}
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
                disabled={!!current?.locked}
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
                disabled={!!current?.locked}
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
                onClick={() => openModal("data")}
              >
                数据管理
              </MenuRow>
              <MenuRow icon={<SettingsIcon size={18} />} onClick={() => openModal("settings")}>
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
                disabled={archiveBusy || !!recordingTicket.current || record}
                onClick={() => archive("export")}
              >
                导出本地备份
              </MenuRow>
              <MenuRow
                icon={<ArrowUpFromLine size={18} />}
                disabled={archiveBusy || !!recordingTicket.current || record}
                onClick={() => archive("import")}
              >
                导入本地备份
              </MenuRow>
              <MenuRow
                icon={<SettingsIcon size={18} />}
                onClick={() => openModal("data")}
              >
                数据管理
              </MenuRow>
              <MenuRow icon={<SettingsIcon size={18} />} onClick={() => openModal("settings")}>
                设置
              </MenuRow>
            </>
          )}
        </div>
      </>
    );
  };
  const previewAuthority = JSON.stringify(accessGate.stamp(noteId || undefined));
  const imagePreviewOpen = !!imagePreview && imagePreview.owner === noteId && imagePreview.authority === previewAuthority && !quitPending && !syncCover && !synchronizing && !accessSuspended.length && !accessGate.state?.operationId && !modal && !folderForm && (!mobile || page === "editor");
  const contentOverlay = imagePreviewOpen || modal === "preferences";
  useLayoutEffect(() => {if(imagePreview && !imagePreviewOpen)setImagePreview(null);}, [imagePreview, imagePreviewOpen]);
  const nativeScope = JSON.stringify([
    folderId,
    noteId,
    view,
    galleryEditor,
    separate,
    query,
  ]);
  const attachmentBaseAvailable =
    !networkSync.frozen(noteId) &&
    !quitPending &&
    !loading &&
    !draw &&
    !accessSuspended.length &&
    !!current &&
    !current.deletedAt &&
    (!mobile || page === "editor") &&
    !current.locked;
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
      !ticket.desktop &&
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
      quitState.current ||
      networkSync.frozen(context.noteId) ||
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
        (modal || imagePreviewOpen || folderForm || draw || record || ocrOperation.current))
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
    if (networkSync.frozen(context.noteId) || (intent.kind === "search" && networkSync.frozen())) {
      void networkSync.cancel().then(() => nativeHandler.current(intent, context, sequence));
      return;
    }
    if (quitState.current) return;
    if (intent.kind === "search") {
      setNativeSearchAck(sequence);
      void changeSearch({ query: intent.phase === "cancel" ? "" : intent.value, searching: intent.phase !== "cancel", resetFilter: true }).catch(fail);
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
            changeSidebar((value) => !value);
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
    if (networkSync.frozen()) { void networkSync.cancel().then(() => nativeMenuHandler.current(command)); return; }
    if (quitState.current) return;
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
      !quitPending &&
      !loading &&
      !synchronizing &&
      !accessSuspended.length &&
      !accessGate.state?.operationId &&
      !modal &&
      !imagePreviewOpen &&
      !draw &&
      !record &&
      !ocr;
    const editable =
      available &&
      !!current &&
      !current.deletedAt &&
      !blockedNotes.current.has(current.id) &&
      !networkSync.frozen(current.id) &&
      (!current.locked || !!accessGate.state?.notes[current.id]?.authorized) &&
      !!liveEditor?.isEditable;
    const stamp = accessGate.stamp(noteId || undefined);
    nativeToolbar.current.set({
      searchScope: JSON.stringify([
        folderId,
        noteId,
        view,
        galleryEditor,
        separate,
        page,
        stamp,
        liveEditor ? nativeEditorIds.current.get(liveEditor) : null,
        liveEditor ? nativeDocumentVersions.current.get(liveEditor) || 0 : 0,
      ]),
      key: JSON.stringify([
        nativeScope,
        contentOverlay,
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
      state: { ...toolbarState({
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
      }), contentOverlay },
    });
  });
  // The whole adapter is eliminated by Vite in a normal production build.
  // It captures existing handlers, not a second implementation of the actions.
  if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
    const context = (): NativeContext => ({
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
    });
    const assert = (editing = false, overlay = false) =>
      nativeAssert.current(context(), editing, overlay);
    const selectedNote = () => {
      const n = wsRef.current.notes.find((n) => n.id === noteId);
      if (!n) throw Error("没有已选择的备忘录");
      return n;
    };
    const editable = () => {
      assert(true);
      return nativeSelection(context());
    };
    const folderHandle = () => {
      if (!folderFormHandle.current) throw Error("文件夹表单尚未打开");
      return folderFormHandle.current;
    };
    const recordingInspection = () =>
      recordingTicket.current?.local?.handle?.inspect?.();
    const recordingState = () =>
      recordingInspection()?.state || debugRecordingState.current;
    debugAdapter.current = {
      state: () => ({
        workspace: structuredClone(wsRef.current),
        editorJSON: editor && !editor.isDestroyed ? editor.getJSON() : null,
        editorSelection: editor && !editor.isDestroyed ? editor.state.selection.toJSON() : null,
        error:
          error ||
          (recordingTicket.current && recordingState()?.hasError
            ? recordingState()?.notice || "录音操作失败，原会话仍保留"
            : "") ||
          recordingTicket.current?.registration?.error ||
          (["failed", "cleanup-pending"].includes(
            ocrOperation.current?.state.phase || "",
          )
            ? ocrOperation.current?.state.error || ""
            : ""),
        notice,
        selection: {
          folderId,
          noteId,
          page,
          query,
          searching,
          tagFilter,
          menu,
          modal,
          listed: listed.map((n) => n.id),
        },
        save: {
          pending: pendingDocs.current.size,
          queued: queues.current.size,
          failed: saveFailures.current.size,
          saving,
        },
        quietWindow: {
          frozen: networkSync.frozen(),
          ...quietHost.current.snapshot(),
          editors: [...editorsRef.current].filter(([, instance]) => !instance.isDestroyed).map(([id, instance]) => ({ id, composing: instance.view.composing, pendingComposition: !!tagCompositions.current.get(id)?.pending, editable: instance.isEditable, frozen: networkSync.frozen(id), owner: nativeEditorOwners.current.get(instance), externalVersion: externalVersions.current.get(id) || 0 })),
        },
        busy:
          loading ||
          creatingNote ||
          archiveBusy ||
          attachmentExportPending() ||
          !!dataManagementHandle.current?.inspect().busy ||
          !!syncSettingsHandle.current?.inspect().busy ||
          synchronizingRef.current ||
          !!metadataRefreshRunning.current ||
          debugPending.current.size > 0 ||
          sidebarPreference.needsConfirmation ||
          !!quitState.current ||
          ["processing", "confirming", "cancelling"].includes(
            ocrOperation.current?.state.phase || "",
          ) ||
          (!!recordingTicket.current &&
            (!!recordingTicket.current.opening ||
              !!recordingTicket.current.registration?.cancelling ||
              (recordingTicket.current.desktop
                ? !recordingTicket.current.local?.handle
                : !recordingPanel.current) ||
              !!recordingInspection()?.pending ||
              !!recordingState()?.playPending ||
              !!recordingState()?.previewPending ||
              !!recordingState()?.seeking ||
              ["requesting", "saving", "finalizing"].includes(
                recordingState()?.phase || "",
              ))),
        failure: debugFailure.current,
        recording: {
          active: !!recordingTicket.current,
          state: recordingTicket.current ? recordingState() : null,
        },
        ocr: ocrState,
        settings,
        synchronization: syncSettingsHandle.current?.inspect() || null,
        preferences: { open: modal === "preferences", tab: preferencesTab },
        creation: { pending: creatingNote, receipt: createReceipt.current?.id || null, source: createReceipt.current?.source || null, error: creationError, focusTarget: createFocus.current?.id || null },
        folderForm: !!folderForm,
      }),
      handlers: {
        "app.state": () => debugAdapter.current!.state(),
        "app.flush": () => flush(),
        "app.refresh": () => refresh(),
        "app.back": () => androidBack.current(),
        "app.folders": () => {if(!mobile)throw Error("文件夹页面仅用于手机导航");openFolders();},
        "editor.done": () => finishEditing(),
        "app.dismissError": () => setError(""),
        "settings.open": () => openModal("settings"),
        "settings.tab": ({ tab }) => {
          if (modal !== "preferences") throw Error("设置尚未打开");
          if (tab !== "settings" && tab !== "data") throw Error("未知设置标签");
          setPreferencesTab(tab);
        },
        "data.open": () => openModal("data"),
        "image.preview": ({ id }) => {
          const button = document.querySelector<HTMLButtonElement>(`.attachment-node[data-attachment-id="${CSS.escape(id as string)}"] .image-open`);
          if (!button || button.disabled) throw Error("图片尚未可预览");
          button.click();
        },
        "image.save": ({ id }) => {
          if(!imagePreviewOpen || imagePreview?.id !== id) throw Error("请先打开对应图片预览");
          const button = document.querySelector<HTMLButtonElement>(`.image-preview[data-preview-id="${CSS.escape(id as string)}"] .save-image`);
          if (!button || button.disabled) throw Error("图片尚未可保存");
          button.click();
        },
        "image.info": () => {const button=document.querySelector<HTMLButtonElement>('.image-preview [aria-label="图片信息"]');if(!button)throw Error("图片预览尚未打开");button.click();},
        "image.close": () => setImagePreview(null),
        ...Object.fromEntries([
          ["sync.status", "status"], ["sync.host.start", "startHost"], ["sync.invite", "createInvite"],
          ["sync.pair", "pair"], ["sync.now", "syncNow"], ["sync.stop", "stop"], ["sync.resume", "resume"],
          ["sync.revoke", "revoke"], ["sync.conflicts", "conflicts"], ["sync.resolve", "resolve"],
        ].map(([id, type]) => [id, async (args: Record<string, unknown>) => {
          if (modal !== "preferences" || preferencesTab !== "data" || !syncSettingsHandle.current) throw Error("请先打开数据总览中的设备同步");
          await syncSettingsHandle.current.run({ ...args, type } as SyncCommand);
          return syncSettingsHandle.current?.inspect();
        }])),
        ...Object.fromEntries(["open", "scan", "start", "cancel", "inspect"].map((action) => [`appleImport.${action}`, (args: Record<string, unknown>) => {
          if (modal !== "preferences" || preferencesTab !== "data" || !appleNotesImportHandle.current) throw Error("请先在Mac主窗口打开数据标签");
          const handle = appleNotesImportHandle.current;
          if (action === "start") return handle.start(args.keys as string[] | undefined);
          if (action === "open") return handle.open();
          if (action === "scan") return handle.scan();
          if (action === "cancel") return handle.cancel();
          return handle.inspect();
        }])),
        "data.refresh": () => {
          if (modal !== "preferences" || preferencesTab !== "data" || !dataManagementHandle.current) throw Error("请先打开数据标签");
          return dataManagementHandle.current.refresh();
        },
        "data.navigate": ({ view }) => {
          if (modal !== "preferences" || preferencesTab !== "data" || !dataManagementHandle.current) throw Error("请先打开数据标签");
          if (typeof view !== "string" || !isStorageView(view))
            throw Error("未知存储类别");
          return dataManagementHandle.current.navigate(view);
        },
        "data.filter": (args) => {
          if (modal !== "preferences" || preferencesTab !== "data" || !dataManagementHandle.current) throw Error("请先打开数据标签");
          return dataManagementHandle.current.filter(args);
        },
        "data.exportAttachment": ({ id }) => {
          if (modal !== "preferences" || preferencesTab !== "data" || !dataManagementHandle.current) throw Error("请先打开数据标签");
          return dataManagementHandle.current.exportAttachment(id as string);
        },
        "folder.select": ({ id }) => afterQuiet(() => {
          assert();
          if (id !== "all" && !wsRef.current.folders.some((f) => f.id === id))
            throw Error("文件夹不存在");
          chooseFolder(id as string);
        }),
        "note.select": ({ id }) => afterQuiet(() => {
          assert();
          const n = wsRef.current.notes.find((n) => n.id === id);
          if (!n) throw Error("备忘录不存在");
          chooseNote(n);
        }),
        "tag.select": ({ name }) => afterQuiet(() => {
          assert();
          chooseTag(name as string | null);
        }),
        "note.create": () => {
          assert();
          return createNote();
        },
        "note.patch": (args) => {
          assert(true);
          if (!Object.keys(args).length) throw Error("必须提供修改字段");
          if (
            args.folderId &&
            !isPhysicalOwner(
              wsRef.current.folders.find((f) => f.id === args.folderId),
            )
          )
            throw Error("必须移到实体文件夹");
          return patch({ type: "patchNote", id: selectedNote().id, ...args });
        },
        "note.delete": () => {
          assert();
          return patch({ type: "deleteNote", id: selectedNote().id });
        },
        "note.restore": () => {
          assert();
          if (!selectedNote().deletedAt) throw Error("备忘录不在最近删除");
          return patch({ type: "restoreNote", id: selectedNote().id });
        },
        "note.purge": () => {
          assert();
          if (!selectedNote().deletedAt) throw Error("备忘录不在最近删除");
          openModal("purge");
        },
        "note.separate": () => {
          assert();
          return openSeparate(selectedNote());
        },
        "note.share": () => {
          assert(true);
          return shareTarget(context());
        },
        "folder.open": ({ id }) => {
          assert();
          const f = id
            ? wsRef.current.folders.find((f) => f.id === id)
            : undefined;
          if (id && f?.kind !== "smart")
            throw Error(
              "编辑表单只适用于智能文件夹，普通文件夹请使用folder.rename",
            );
          setFolderForm(f ? { folder: f } : {});
        },
        "folder.draft": () => folderHandle().getDraft(),
        "folder.updateDraft": ({ draft }) =>
          folderHandle().updateDraft(draft as Partial<FolderDraft>),
        "folder.submit": () => folderHandle().submit(),
        "folder.refresh": () => folderHandle().refresh(),
        "folder.cancel": () => folderHandle().cancel(),
        "folder.rename": ({ id }) => {
          assert();
          const folder = wsRef.current.folders.find((f) => f.id === id);
          if (!folder || !["normal", "smart"].includes(folder.kind))
            throw Error("该文件夹不能改名");
          setContextFolder(folder.id);
          if (folder.kind === "smart") setFolderForm({ folder });
          else {
            setModal("renameFolder");
            setModalValue(folder.name);
            setMenu(null);
          }
        },
        "folder.delete": ({ id }) => {
          assert();
          const f = wsRef.current.folders.find((f) => f.id === id);
          if (!f || (f.kind !== "normal" && f.kind !== "smart"))
            throw Error("该文件夹不能删除");
          setContextFolder(f.id);
          if (f.kind === "smart")
            smartDeleteTarget.current = {
              id: f.id,
              revision: f.definitionRevision,
            };
          setModal(f.kind === "smart" ? "deleteSmartFolder" : "deleteFolder");
        },
        "editor.insertText": ({ text }) => {
          const e = editable();
          return e
            .chain()
            .focus()
            .insertContent({ type: "text", text: text as string })
            .run();
        },
        "editor.setContent": ({ document }) => {
          const e = editable();
          const node = e.schema.nodeFromJSON(document);
          node.check();
          if (node.type.name !== "doc") throw Error("文档必须为doc");
          return e.commands.setContent(node.toJSON(), { emitUpdate: true });
        },
        "editor.select": ({ from, to }) => {
          const e = editable();
          if (
            !Number.isSafeInteger(from) ||
            !Number.isSafeInteger(to) ||
            Number(from) > Number(to) ||
            Number(to) > e.state.doc.content.size
          )
            throw Error("选区越界");
          return e.commands.setTextSelection({
            from: Number(from),
            to: Number(to),
          });
        },
        "editor.undo": () => {
          const e = editable();
          if (!e.can().undo()) throw Error("没有可撤销的编辑");
          return e.chain().focus().undo().run();
        },
        "editor.redo": () => {
          const e = editable();
          if (!e.can().redo()) throw Error("没有可重做的编辑");
          return e.chain().focus().redo().run();
        },
        "editor.format": ({ command }) => {
          assert(true);
          nativeHandler.current(
            command === "checklist" || command === "table"
              ? { kind: "action", action: command }
              : {
                  kind: "menu",
                  owner: "format",
                  command: command as MenuCommand,
                },
            context(),
            0,
          );
        },
        "editor.table": ({ action: tableAction }) => {
          const e = editable();
          if (tableAction === "convertToText") return convertTableToText(e);
          if (tableAction === "insert")
            return e
              .chain()
              .focus()
              .insertTable({ rows: 2, cols: 2, withHeaderRow: false })
              .run();
          const chain = e.chain().focus();
          const method = chain[tableAction as "addRowBefore"];
          if (typeof method !== "function" || !method.call(chain).run())
            throw Error("当前表格操作不可用");
        },
        "search.set": ({ query: value }) => afterQuiet(() => {
          assert();
          return changeSearch({ query: value as string, searching: true, resetFilter: true });
        }),
        "search.find": ({ query: value }) => {
          assert(true);
          setFind(value as string);
          setShowFind(true);
        },
        "settings.update": ({ settings: change }) => afterQuiet(() => {
          assert();
          const patch = change as Settings;
          const keys = [
            "theme",
            "view",
            "sort",
            "groupDates",
            "sidebarWidth",
            "listWidth",
            "macSidebarVisible",
          ];
          if (Object.keys(patch).some((k) => !keys.includes(k)))
            throw Error("未知设置字段");
          return updateSettings(patch);
        }),
        "sidebar.toggle": () => {
          assert();
          changeSidebar((v) => !v);
        },
        "menu.open": ({ menu: value }) => {
          assert();
          cancelCreateFocus();
          if (["format", "media", "table"].includes(String(value))) assert(true);
          if (value === "table" && !editor?.isActive("table"))
            throw Object.assign(Error("当前选区不在表格中"), {
              code: "UNAVAILABLE",
            });
          if (["more", "note"].includes(String(value))) {
            selectedNote();
            setContextNote(null);
            setNoteMenuPoint(null);
          }
          if (value === "folder") {
            const folder = wsRef.current.folders.find((f) => f.id === folderId);
            if (!folder || !["normal", "smart"].includes(folder.kind))
              throw Object.assign(Error("当前文件夹没有此菜单"), {
                code: "UNAVAILABLE",
              });
            setContextFolder(folder.id);
          }
          if (value === "format") openFormat();
          else setMenu(value as string);
        },
        "modal.open": ({ type, value }) => {
          assert();
          openModal(type as string, value as string | undefined);
        },
        "modal.submit": async () => {
          if (
            !modal ||
            ![
              "renameFolder",
              "lock",
              "unlock",
              "deleteFolder",
              "deleteSmartFolder",
              "purge",
            ].includes(modal)
          )
            throw Object.assign(Error("当前对话框没有提交动作"), {
              code: "UNAVAILABLE",
            });
          await confirmModal();
        },
        "modal.cancel": () => {
          if (!modal) throw Error("对话框未打开");
          androidBack.current();
        },
        "attachment.choose": ({ kind }) => {
          assert(true);
          openAttachmentPicker(
            kind === "camera" ? cameraInput.current : fileInput.current,
            kind === "media" ? "image/*,video/*" : "",
            context(),
          );
        },
        "attachment.submit": async ({ files }) => {
          assert(true);
          const input = fileInput.current;
          if (!input) throw Error("附件输入尚未就绪");
          const batch = capturePickerTarget(context());
          const previous = pickerTargets.current.get(input);
          if (previous) previous.target.invalidated = true;
          pickerTargets.current.set(input, batch);
          const synthetic = (
            files as {
              name: string;
              mime: string;
              text?: string;
              base64?: string;
            }[]
          ).map(
            (f) =>
              new File(
                [
                  f.base64 === undefined
                    ? f.text || ""
                    : Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)),
                ],
                f.name,
                { type: f.mime, lastModified: 1700000000000 },
              ),
          );
          await fileSelected(input, synthetic);
        },
        "attachment.retry": () => {
          if (!attachmentBatches.current.size)
            throw Object.assign(Error("没有可重试的附件"), {
              code: "UNAVAILABLE",
            });
          return retryAttachments();
        },
        "attachment.discard": () => {
          if (!attachmentBatches.current.size)
            throw Object.assign(Error("没有可取消的附件"), {
              code: "UNAVAILABLE",
            });
          return discardUninsertedAttachments();
        },
        "recording.open": () => {
          assert(true);
          if (recordingTicket.current)
            throw Object.assign(Error("录音会话已打开"), { code: "UNAVAILABLE" });
          debugRecordingState.current = null;
          openRecording(context());
          return (recordingTicket.current as RecordingTicket | null)?.opening;
        },
        "recording.action": async (args) => {
          const ticket = recordingTicket.current;
          const local = ticket?.local?.handle;
          const handle = local || recordingPanel.current;
          const state = recordingState();
          if (!handle || !state)
            throw Object.assign(Error("录音面板未就绪"), {
              code: "UNAVAILABLE",
            });
          if (!validRecordingAction(args)) throw Error("录音动作参数无效");
          const allowed =
            args.action === "close"
              ? !mobile || !["saving", "finalizing", "submitted"].includes(state.phase)
              : mobile && args.action === "finish"
                ? ["paused", "retry"].includes(state.phase)
              : args.action === "toggle"
              ? state.canToggle
              : args.action === "playback"
                ? state.canPlay
                : args.action === "preview-retry"
                  ? state.canRetryPreview
                  : args.action === "skip" || args.action === "seek"
                    ? state.canSeek
                    : state.canFinish;
          if (
            !allowed ||
            (args.action === "seek" &&
              !state.seekable.some(
                ([start, end]) =>
                  Number(args.milliseconds) >= start &&
                  Number(args.milliseconds) <= end,
              ))
          )
            throw Object.assign(Error("当前录音动作不可用"), {
              code: "UNAVAILABLE",
            });
          if (local && (args.action === "close" || args.action === "finish"))
            await local.close();
          else {
            handle.dispatch(args);
            if (local) await local.inspect?.().pending;
          }
        },
        "ocr.open": () => {
          assert(true);
          openOcr(context());
        },
        "ocr.select": async ({ source }) => {
          const op = ocrOperation.current;
          if (!op) throw Error("识别会话不存在");
          await op.process({ kind: (source || "image") as "image" | "camera" });
          if (op.state.phase === "failed" || op.state.phase === "cleanup-pending")
            throw Error(op.state.error || "文字识别失败");
        },
        "ocr.insert": () => {
          const op = ocrOperation.current;
          if (!op) throw Error("识别会话不存在");
          return confirmOcr(op);
        },
        "ocr.retry": () => {
          if (!ocrOperation.current || ocrState.phase !== "failed")
            throw Object.assign(Error("当前识别不能重试"), {
              code: "UNAVAILABLE",
            });
          return retryOcr();
        },
        "ocr.cancel": () => {
          if (!ocrOperation.current)
            throw Object.assign(Error("识别会话不存在"), { code: "UNAVAILABLE" });
          return cancelOcr();
        },
        "archive.export": () => {
          assert();
          return archive("export");
        },
        "archive.import": () => {
          assert();
          return archive("import");
        },
        "app.close": () => {
          if (!native) throw Error("浏览器预览没有原生窗口关闭事件");
          return getCurrentWindow().close();
        },
        "app.quit": () => {
          if (!native) throw Error("浏览器预览没有原生退出事件");
          return exit(0);
        },
        "drawing.open": () => {
          assert(true);
          setDraw({ strokes: [] });
        },
      },
    };
  }
  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.VITE_NOTES_DEBUG !== "1") return;
    let live = true,
      release: (() => void) | undefined;
    void import("./debug/runtime").then(({ registerDebug }) => {
      if (live)
        release = registerDebug(() => {
          if (!debugAdapter.current) throw Error("调试应用尚未就绪");
          return debugAdapter.current;
        });
    });
    return () => {
      live = false;
      release?.();
    };
  }, []);
  const nativeTop = !mobile && !!nativeInfo;
  previewOpener.current = request => {
    const attachment = wsRef.current.attachments.find(value => value.id === request.id);
    if(quitState.current || syncCoverRef.current || accessGate.state?.operationId || accessGate.state?.suspended.length || !noteId || modal || !attachment || attachment.noteId !== noteId || !editor || editor.isDestroyed || !documentReferencesAttachment(editor.getJSON(),attachment) || !request.trigger.isConnected || request.trigger.offsetParent === null || (current?.locked && !accessGate.state?.notes[noteId]?.authorized)) return;
    setImagePreview({...request,owner:noteId,authority:previewAuthority,session:secureId()});
  };
  return (
    <ImagePreviewContext.Provider value={{open:openImagePreview, closeSource:closePreviewSource}}>
    <div className="recording-layout">
    <div
      ref={appSurface}
      inert={quitPending}
      className={`app ${nativeTop ? "native-toolbar" : ""} ${syncCover || accessSuspended.length ? "access-sync" : ""} ${mobile ? "mobile" : "desktop"} ${view === "gallery" && !separate ? (galleryEditor ? "gallery-edit" : "gallery-browse") : ""} ${menu === "format" && mobile ? "format-open" : ""} page-${page} ${!sidebar ? "sidebar-hidden" : ""} ${separate ? "separate" : ""}`}
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
            data-tauri-drag-region={native && !mobile ? "deep" : undefined}
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
              <IconButton
                label="隐藏文件夹"
                onClick={() => changeSidebar(false)}
              >
                <PanelLeft />
              </IconButton>
            </div>
          </div>
        )}
        <div className="mobile-folder-nav">
          {mobile && <button aria-label="返回全部笔记" onClick={() => chooseFolder("all")}><ChevronLeft />笔记</button>}
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
                  void afterQuiet(() => {
                    setSearching(false);
                    setQuery("");
                    setFilter("");
                  }).catch(fail);
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
              void afterQuiet(() => {
                setFilter(f);
                setPage("notes");
              }).catch(fail);
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
                        void afterQuiet(() => {
                          setTagFilter(undefined);
                          setFilter("");
                        }).catch(fail);
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
          {mobile && (
            <button
              aria-label="新建文件夹"
              onClick={() => openModal("newFolder")}
            >
              <MobileAddFolderIcon />
            </button>
          )}
          <IconButton
            label={mobile ? "新建备忘录" : "设置"}
            disabled={mobile && creatingNote}
            onClick={
              mobile ? newNote : () => openModal("settings")
            }
          >
            {mobile ? <SquarePen /> : <SettingsIcon />}
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
        className={`notes-pane ${mobile || view === "gallery" ? "gallery-pane" : ""}`}
      >
        {!nativeTop && (
          <header
            className="notes-header"
            data-tauri-drag-region={native && !mobile ? "deep" : undefined}
          >
            {mobile ? (
              <>
                {folderId !== "all" ? <button className="back-button" aria-label="返回全部笔记" onClick={() => chooseFolder("all")}><ChevronLeft />笔记</button> : <span />}
                <div className="mobile-home-actions">
                  <IconButton label="文件夹" onClick={openFolders}><Folder /></IconButton>
                  <IconButton label="设置" className="mobile-home-settings" onClick={() => openModal("settings")}><SettingsIcon /></IconButton>
                </div>
              </>
            ) : (
              <>
                {!sidebar && (
                  <IconButton
                    label="显示文件夹"
                    onClick={() => changeSidebar(true)}
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
              {filter ? "搜索结果" : folderId === "all" ? "笔记" : folderLabel}
            </h1>
            <div className="mobile-list-search">
              {searchBox}
              {searching && (
                <button
                  className="text-button"
                  onClick={() => {
                    void afterQuiet(() => {
                      setSearching(false);
                      setQuery("");
                      setFilter("");
                    }).catch(fail);
                  }}
                >
                  取消
                </button>
              )}
            </div>
          </>
        )}
        <div
          className={`notes-scroll ${mobile ? "mobile-gallery" : view === "gallery" ? "gallery" : ""}`}
          onClick={() => setSwiped(null)}
        >
          {loading ? (
            <div className="empty-state">正在打开备忘录…</div>
          ) : desktopSearchZero ? (
            <div className="search-zero-section">备忘录</div>
          ) : listed.length === 0 ? (
            <div className="empty-state">
              {query || filter ? "未找到备忘录" : mobile ? "点击＋，记下第一条笔记" : "无备忘录"}
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
              const highlightQuery = !mobile ? query : "";
              const listPreview =
                !n.locked && highlightQuery
                  ? searchListSnippet(previewText, highlightQuery)
                  : previewText;
              return (
                <div
                  key={n.id}
                  className={`note-entry ${!mobile && view === "gallery" ? "gallery-entry" : ""}`}
                >
                  {(index === 0 || groupName(listed[index - 1]) !== group) &&
                    group && !mobile && <div className="date-section">{group}</div>}
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
                      data-note-id={n.id}
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
                        setNoteMenuPoint(
                          !mobile && (e.clientX || e.clientY)
                            ? { x: e.clientX, y: e.clientY }
                            : null,
                        );
                        setMenu("note");
                      }}
                      onTouchStart={(e) => {
                        swipe.current = {
                          x: e.touches[0].clientX,
                          y: e.touches[0].clientY,
                        };
                        startLong(() => {
                          setContextNote(n.id);
                          setNoteMenuPoint(null);
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
                      {mobile ? <div className="mobile-note-card">
                        <strong>{n.pinned && <Pin size={13} />}{n.title}</strong>
                        <p>{n.locked ? <><Lock size={14} />已锁定</> : previewText}</p>
                        <div className="mobile-card-date"><time dateTime={new Date(n.updatedAt).toISOString()}>{new Date(n.updatedAt).toLocaleDateString("zh-CN",{month:"long",day:"numeric"})}</time>{recordingIndicator?.phase === "recording" && recordingIndicator.owner === n.id && <Mic size={14} aria-label="正在录音" />}</div>
                      </div> : <>
                      {view === "gallery" && (
                        <div className="gallery-preview">
                          <strong>
                            {searchListText(n.title, highlightQuery)}
                          </strong>
                          <p>
                            {n.locked ? (
                              <Lock size={26} />
                            ) : (
                              searchListText(listPreview, highlightQuery)
                            )}
                          </p>
                          {JSON.stringify(n.document).includes("table") && (
                            <div className="preview-table" />
                          )}
                          {JSON.stringify(n.document).includes("drawing") && (
                            <PenTool size={38} />
                          )}
                        </div>
                      )}
                      <div className="note-row-content">
                        <div className="note-row-title">
                        <strong>
                          {n.pinned && (
                            <Pin className="pin-marker" size={13} />
                          )}
                          {searchListText(n.title, highlightQuery)}
                        </strong>
                          {!mobile &&
                            recordingIndicator?.phase === "recording" &&
                            recordingIndicator.owner === n.id && (
                              <span
                                className="recording-note-badge recording-active"
                                data-recording-owner={n.id}
                              >
                                <span className="recording-activity-dot" aria-hidden="true" />
                                录音中
                              </span>
                            )}
                        </div>
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
                              mobile ? (
                                previewText
                              ) : (
                                <SearchListPreview
                                  text={previewText}
                                  query={highlightQuery}
                                />
                              )
                            )}
                          </span>
                        </div>
                        {(folderId === "all" || query) && (
                          <span className="note-folder">
                            <Folder size={11} />
                              {
                                ws.folders.find((f) => f.id === n.folderId)
                                  ?.name
                              }
                          </span>
                        )}
                      </div>
                      </>}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {mobile ? <button type="button" className="mobile-add-note" aria-label="新建备忘录" aria-busy={creatingNote} onClick={newNote} disabled={creatingNote || loading || !workspaceLoaded}><Plus aria-hidden="true" /></button> : <div className="notes-footer">
          <span>{listed.length}个备忘录</span>
          <IconButton label="新建备忘录" onClick={newNote}>
            <SquarePen />
          </IconButton>
        </div>}
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
            data-tauri-drag-region={native && !mobile ? "deep" : undefined}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest("button"))
                e.preventDefault();
            }}
          >
            {mobile ? (
              <>
                <button className="back-button" aria-label="返回笔记" onClick={back}>
                  <ChevronLeft />
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
                  <IconButton
                    label="更多"
                    onClick={() => {
                      setContextNote(null);
                      setMenu(menu === "more" ? null : "more");
                    }}
                  >
                    <MoreHorizontal />
                  </IconButton>
                  {current && (
                    <button
                      className="mobile-editor-done icon-button"
                      aria-label="完成编辑"
                      onClick={() => {
                        void finishEditing().catch(fail);
                      }}
                    >
                      <Check />
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
                onClick={() =>
                  setNotice(`创建于 ${fmtDate(current.createdAt)}`)
                }
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
            recordingTicket.current?.desktop
              ? recordingTicket.current.batch.target.noteId
              : null,
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
              blocked={
                quitPending ||
                synchronizingRef.current ||
                !!accessGate.state?.operationId ||
                blockedNotes.current.has(note.id) ||
                networkSync.frozen(note.id) ||
                !!accessGate.state?.suspended.includes(note.id) ||
                accessGate.state?.notes[note.id]?.authorized === false
              }
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
      {(syncCover || accessSuspended.length > 0) && (
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
      {imagePreviewOpen && imagePreview && <ImagePreview key={imagePreview.session} request={imagePreview} onClose={() => setImagePreview(value => value === imagePreview ? null : value)} />}
      {modal === "preferences" && (
        <Preferences
          mobile={mobile}
          tab={preferencesTab}
          onTab={setPreferencesTab}
          onClose={() => setModal(null)}
          settings={settings}
          onSettings={updateSettings}
          onCloseLocks={() => patch({type: "closeLocks"})}
          returnFocus={preferencesTrigger.current}
          data={<DataManagement
            active={preferencesTab === "data"}
            appleImport={native && macNative && !separate ? <AppleNotesImport
              active={preferencesTab === "data"}
              blocked={archiveBusy || !!recordingTicket.current || record || !!accessSuspended.length || !!accessGate.state?.operationId}
              accessKey={`${ws.access?.sessionId || ""}:${ws.access?.epoch || 0}:${ws.access?.operationId || ""}`}
              onPrepare={prepareAppleImport}
              onFinish={finishAppleImport}
              onHandle={(handle) => { appleNotesImportHandle.current = handle; }}
            /> : undefined}
            synchronization={<SyncSettings active={preferencesTab === "data"} onHandle={(handle) => { syncSettingsHandle.current = handle; }} />}
            onHandle={(handle) => { dataManagementHandle.current = handle; }}
            onArchive={archive}
            backupBlocked={!!recordingTicket.current || record}
            archiveBusy={archiveBusy}
            accessKey={`${ws.access?.sessionId || ""}:${ws.access?.epoch || 0}:${ws.access?.operationId || ""}`}
            accessBlocked={!!accessSuspended.length || !!accessGate.state?.operationId}
          />}
        />
      )}
      {modal && modal !== "preferences" && (
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
                          modal === "lock" || modal === "unlock"
                            ? "密码"
                            : "名称"
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
                  <button
                    className="modal-cancel"
                    onClick={() => setModal(null)}
                  >
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
                  <button
                    className="modal-cancel"
                    onClick={() => setModal(null)}
                  >
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
          mobile={mobile}
          onHandle={(handle) => {
            recordingPanel.current = handle;
          }}
          onState={import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1" ? (state) => { debugRecordingState.current = state; } : undefined}
          onCancel={() => void cancelRecording(recording).catch(fail)}
          onDone={(result) => submitRecording(recording, result)}
        />
      )}
    </div>
      {!mobile && desktopRecording && (
        <aside
          className="recording-dock"
          aria-label="录音面板"
          inert={quitPending}
          style={
            {
              "--recording-native-top": `${nativeInfo?.native.reservedTop || 0}px`,
            } as CSSProperties
          }
        >
          {!desktopRecording.local || desktopRecording.registration?.cancelRequested ? (
            <section className="recording-registration" aria-label="准备录音">
              <strong>新录音</strong>
              <p role={desktopRecording.registration?.error ? "alert" : "status"}>
                {desktopRecording.registration?.error || (desktopRecording.registration?.cancelRequested ? "正在取消录音…" : "正在准备录音…")}
              </p>
              <p>录音尚未开始。准备未确认时，可以重试或取消。</p>
              <button disabled={!!desktopRecording.opening || !!desktopRecording.registration?.cancelling}
                onClick={() => { void (desktopRecording.registration?.cancelRequested ? cancelDesktopRegistration(desktopRecording) : registerDesktopRecording(desktopRecording)).catch(fail); }}>
                {desktopRecording.registration?.cancelRequested ? "重试取消录音" : "重试准备录音"}
              </button>
              <button aria-label="取消准备录音" onClick={() => { void cancelDesktopRegistration(desktopRecording).catch(fail); }}>取消录音</button>
            </section>
          ) : <DesktopRecordingPanel
            key={desktopRecording.local.identity.sessionId}
            onHandle={(handle) => {
              if (desktopRecording.local) {
                desktopRecording.local.handle = handle || undefined;
                if (handle) desktopRecording.local.attach(handle);
              }
            }}
            onBeforeStart={() => {
              if (quitState.current || recordingTicket.current !== desktopRecording ||
                  !desktopRecording.accepting || desktopRecording.batch.target.invalidated)
                return Promise.reject(Error("当前录音准备已封存，请完成当前操作后重试"));
              return invoke("recording_local_started", desktopRecording.local!.identity);
            }}
            onCancel={() => {}}
            onRevision={(result) =>
              submitRecordingRevision(desktopRecording, result)
            }
            onComplete={(saved, revision) =>
              completeDesktopRecording(desktopRecording, saved, revision)
            }
            onState={(state) =>
              projectDesktopRecording(desktopRecording, state)
            }
          />}
        </aside>
      )}
    </div>
    </ImagePreviewContext.Provider>
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
