import { appearanceOf, applyAppearance } from "./themes/appearance";
import { AttachmentMetadataContext } from "./use-attachment-media";
import { attachmentSourcePool } from "./attachment-source-pool";
import { useSystemEvents } from "./platform/system-events";
import { createMobileLayout } from "./platform/layout";
import { MobileInteractionContext } from "./platform/interaction";
import { useNativePlatform } from "./platform/native-platform";
import { useAttachmentPresentation } from "./attachment-operations/presentation";
import { useAttachmentOperations } from "./attachment-operations/operations";
import type { PickerTarget, RecordingTicket, LocalRecordingIdentity } from "./attachment-operations/contracts";
import type { NativeContext } from "./platform/contracts";
import AppMenus from "./editor-menus/AppMenus";
import IconButton from "./editor-menus/IconButton";
import { useNavigation } from "./navigation/use-navigation";
import { useEditorSession } from "./editor-session/use-editor-session";
import DrawingPanel from "./DrawingPanel";
import NoteThumbnail from "./NoteThumbnail";
import AttachmentGallery from "./AttachmentGallery";
import { startup } from "./startup";
import { NativeMenuContext, MenuItem as MenuRow } from "./Menu";
import DesktopToolbar, { type DesktopToolbarAction } from "./DesktopToolbar";
import { interfaceMetrics, fontScales } from "./font-size";
import { interfaceDetailVariables, parseInterfaceDetails } from "./interface-details";
import { ConfirmedSettings } from "./confirmed-settings";
import { isStorageView } from "./storage-usage";
import { AttachmentMenuProvider } from "./AttachmentContextMenu";
import { AttachmentTransferContext } from "./attachment-clipboard";
import { ImagePreview, ImagePreviewContext } from "./ImagePreview";
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
import { AgentWindowCoordinator, type AgentWindowHost } from "./agent-window";
import { subscribeAgentWindow, replyAgentWindow, subscribeNetworkSync, replyNetworkSync } from "./bridge";
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
import { validRecordingAction, type RecordingViewState } from "./recording-coordinator";
import DesktopRecordingPanel, {
  type DesktopRecordingPanelHandle,
} from "./DesktopRecordingPanel";
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
} from "./attachment-target";
import { exit } from "@tauri-apps/api/app";
import { getCurrentWindow, type CloseRequestedEvent } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
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
  FolderCog,
  Trash2,
  Pin,
  CheckCheck,
  ListTodo,
  AudioLines,
  Tag,
  Table,
  Paperclip,
  Share,
  Undo2,
  Redo2,
  PenTool,
  Lock,
  Mic,
  Image,
  Settings as SettingsIcon,
  Volume2,
  Hash,
  NotebookPen,
  ListMinus,
} from "lucide-react";
import {
  action,
  loadWorkspace,
  native,
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
  macNative,
  type MenuCommand,
} from "./native-toolbar";
import { AccessChanged } from "./access-client";
import { MetadataStale } from "./metadata-client";
import type { AccessStamp } from "./access-client";
import NoteEditor from "./Editor";
import { attachmentExportPending } from "./attachment-export";
import DataManagement, { type DataManagementHandle } from "./DataManagement";
import AppleNotesImport, { type AppleNotesImportHandle } from "./AppleNotesImport";
import SyncSettings, { type SyncSettingsHandle } from "./SyncSettings";
import type { SyncCommand } from "./sync-client";
import AccountSettings, { type AccountSettingsHandle } from "./AccountSettings";
import { accountUIAvailable, type AccountCommand } from "./account-client";
import Preferences, { isPreferencesTab, type PreferencesTab } from "./Preferences";
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
import {
  canConvertTextToTable,
  convertTextToTable,
  convertTableToText,
} from "./editor-actions";
import { NodeSelection } from "@tiptap/pm/state";
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
  const mobileLayout = useRef(createMobileLayout(native, navigator.userAgent, !!separate)).current;
  const initialMobile = useRef(mobileLayout(window.innerWidth)).current;

  const [ws, setWs] = useState<Workspace>(empty);
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const [loading, setLoading] = useState(true);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [error, setError] = useState("");
  const { navigation, state: navigationState } = useNavigation(!!initialMobile);
  const { folderId, baseNoteId, searchNoteId, page, query, searchDraft, searching, filter, tagFilter, galleryEditor, attachmentBrowser, mobileCreatedEditor } = navigationState;
  // Navigation owns intent; only a layout commit proves its new owner reached DOM.
  const committedNavigation = useRef(navigationState);
  useLayoutEffect(() => { committedNavigation.current = navigationState; });
  const { setFolderId, setNoteId, setSearchNoteId, setPage, setQuery, setSearchDraft, setSearching, setFilter, setTagFilter, setGalleryEditor, setAttachmentBrowser } = navigation;
  const searchIntent = useRef(0);
  const { session, state: editorSession } = useEditorSession();
  const menu = editorSession.menu;
  const setMenu = session.setMenu;
  const editing = editorSession.body === "editing";
  const formatOpen = editorSession.formatOpen;
  const formatHeight = editorSession.formatHeight;
  const draw = editorSession.drawing;
  const record = !!editorSession.recording?.visible;
  const recordingIndicator = editorSession.indicator;
  const projectRecordingIndicator = session.projectRecordingIndicator;
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
  const createFlight = useRef<Promise<void> | null>(null);
  const [creatingNote, setCreatingNote] = useState(false);
  const [creationError, setCreationError] = useState("");
  const createReceipt = useRef<{ id: string; source: string } | null>(null);
  const cancelCreateFocus = session.cancelFocus;
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
  const { presentation, state: attachmentPresentation } = useAttachmentPresentation();
  const {imagePreview,attachmentJump}=attachmentPresentation;
  const {setImagePreview,setAttachmentJump,hideImagePreview,openImagePreview,closePreviewSource,imagePreviewRef,validGalleryEntry,openAttachmentBrowser,revealGalleryAttachment}=presentation;
  const editorsRef = useRef(editors);
  editorsRef.current = editors;
  const [sidebar, setSidebar] = useState(true);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
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
  const { platform: nativePlatform, state: nativePlatformState } = useNativePlatform();
  const nativeToolbar = nativePlatform.toolbar;
  const nativeInfo = nativePlatformState.info;
  const nativeEditorOwners = nativePlatform.owners;
  const nativeDocumentVersions = nativePlatform.versions;
  const nativeHandler = {current: nativePlatform.handle};
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
  const resumeDocumentAdmission = useRef<(id: string) => void>(() => {});
  const recordingLifecycle = useRef({
    active: (): boolean => false,
    close: async () => {},
    suspend: (_ids: string[]) => {},
    detach: () => {},
  });
  const attachmentOperations = useAttachmentOperations();
  const { targets: pickerTargets, submissions: attachmentSubmissions, batches: attachmentBatches, runtime: pickerRuntime } = attachmentOperations;
  const { submitAttachmentBatch, discardUninsertedAttachments, fileSelected, capturePickerTarget, pasteAttachments, openAttachmentPicker } = attachmentOperations;
  const nativeAssert = {current: nativePlatform.assert};
  const [settings, setSettings] = useState<Settings>({});
  const [settingsOwner] = useState(() => new ConfirmedSettings(value => {
    setSettings(value);
    wsRef.current = { ...wsRef.current, settings: value };
    setWs(previous => ({ ...previous, settings: value }));
  }));
  const settingsReads = useRef(new WeakMap<Workspace, number>());
  const readSettingsWorkspace = useCallback(async (trusted = false) => {
    const ticket = settingsOwner.ticket();
    const data = await loadWorkspace(trusted);
    settingsReads.current.set(data, ticket);
    return data;
  }, [settingsOwner]);
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
  const accountSettingsHandle = useRef<AccountSettingsHandle | null>(null);
  const accountConflictsRequested = useRef(false);
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
  const [mobile, setMobile] = useState(!!initialMobile);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const metrics = interfaceMetrics(settings, windowWidth, sidebar);
  const mobileSingleColumn = mobile && windowWidth <= 430 && settings.interfaceFontSize === "huge";
  const desktopSidebarWidth = metrics.sidebarWidth;
  const desktopListWidth = metrics.listWidth;
  const mobileMode = useRef(!!initialMobile);
  const queues = useRef(new Map<string, Promise<SaveOutcome>>());
  const revisions = useRef(new SaveRevisions());
  const externalVersions = useRef(new Map<string, number>());
  const pendingDocs = useRef(new Map<string, JSONContent>());
  const quietHost = useRef<QuietHost>(undefined!);
  const [, updateQuietWindow] = useState(0);
  const [networkSync] = useState(() => new NetworkSyncCoordinator({
    snapshot: () => { const state = quietHost.current.snapshot(); return { ...state, blocked: state.blocked || agentWindow.frozen() }; },
    freeze: (ids, cancel) => quietHost.current.freeze(ids, cancel),
    reply: replyNetworkSync,
    committed: () => quietHost.current.committed(),
    error: (error) => quietHost.current.error(error),
  }));
  const agentHost = useRef<AgentWindowHost>(undefined!);
  const [agentWindow] = useState(() => new AgentWindowCoordinator({
    snapshot: () => agentHost.current.snapshot(),
    freeze: (ids, cancel) => quietHost.current.freeze(ids, cancel, "agent"),
    reply: replyAgentWindow,
    committed: sessionId => agentHost.current.committed(sessionId),
    error: error => quietHost.current.error(error),
  }));
  const [windowWrites] = useState(() => ({
    frozen: (id?: string | null) => networkSync.frozen(id) || agentWindow.frozen(id),
    cancel: async () => {
      while (networkSync.frozen() || agentWindow.frozen())
        await Promise.all([networkSync.cancel(), agentWindow.cancel()]);
    },
  }));
  const savingNotes = useRef(new Map<string, number>());
  const quietMounted = useRef(true);
  const quietWrites = useRef(0);
  // Keep user input responsive while the projection still owns the frozen note.
  // Recheck after each terminal: another operation may have arrived meanwhile.
  const afterQuiet = useCallback(async (action: () => void | Promise<unknown>) => {
    while (windowWrites.frozen()) await windowWrites.cancel();
    if (quietMounted.current && !quitState.current) await action();
  }, [windowWrites]);
  const changeSearch = useCallback((next: { query?: string; searching?: boolean; resetFilter?: boolean }) => {
    const intent = ++searchIntent.current;
    if (next.query !== undefined) setSearchDraft(next.query);
    return afterQuiet(() => {
      session.invalidate("navigation");
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
  const longPressed = useRef(false);
  const galleryReturnFocus = useRef<HTMLElement | null>(null);
  const wasGalleryEditor = useRef(galleryEditor);
  useLayoutEffect(() => {
    if (wasGalleryEditor.current && !galleryEditor && !mobile && !attachmentBrowser) {
      const target = galleryReturnFocus.current;
      if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
      galleryReturnFocus.current = null;
    }
    wasGalleryEditor.current = galleryEditor;
  }, [galleryEditor, mobile, attachmentBrowser]);
  useEffect(() => () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
    swipe.current = null;
    longPressed.current = false;
  }, [navigationState, mobile, mobileSingleColumn]);
  useEffect(() => { setSwiped(null); }, [mobileSingleColumn]);
  const { themeId, schemePreference } = appearanceOf(settings);
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
        !`${n.title}\n${n.plainText}\n${attachmentBrowser ? ws.attachments.filter(a => a.noteId === n.id && !a.internal).map(a => a.displayName).join("\n") : ""}`
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
        !ws.attachments.some((a) => !a.internal && a.noteId === n.id && a.kind === filter)
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
  session.configure({
    noteId, editor, mobile,
    visible: !!current && !current.deletedAt && (!mobile || page === "editor") && !attachmentBrowser,
    blocked: !!quitState.current || !!modal || !!folderForm || !!ocr || record || loading || synchronizingRef.current || syncCoverRef.current || !!accessGate.state?.operationId || !!(noteId && (accessSuspended.includes(noteId) || blockedNotes.current.has(noteId) || windowWrites.frozen(noteId) || accessGate.state?.suspended.includes(noteId))),
    authorized: !!noteId && !!accessGate.state?.notes[noteId]?.authorized,
    owner: editor ? nativeEditorOwners.current.get(editor) ?? null : null,
  });
  const imageAuthority = (id: string) => {
    const stamp = accessGate.stamp(id);
    return JSON.stringify([stamp.sessionId, stamp.epoch, id, stamp.noteEpoch]);
  };
  const galleryAvailable = attachmentBrowser && !loading && !syncCover && !synchronizing && !quitPending &&
    !modal && !folderForm && !draw && !accessSuspended.length && !accessGate.state?.operationId && !windowWrites.frozen();
  presentation.configure({
    workspace: () => wsRef.current, editor: id => editorsRef.current.get(id), pending: id => pendingDocs.current.get(id),
    authority: imageAuthority, authorized: id => !!accessGate.state?.notes[id]?.authorized,
    galleryBlocked: id => !!quitState.current || syncCoverRef.current || synchronizingRef.current || !!accessGate.state?.operationId || !!accessGate.state?.suspended.length || windowWrites.frozen(id),
    previewBlocked: () => !!quitState.current || syncCoverRef.current || !!accessGate.state?.operationId || !!accessGate.state?.suspended.length || !!modal,
    visibilityBlocked: () => quitPending || syncCover || !!accessSuspended.length || !!accessGate.state?.operationId,
    covered: () => syncCoverRef.current, noteId, currentEditor: editor, browser: attachmentBrowser, mobile, page,
    surface: () => appSurface.current, afterQuiet, fail: error => fail(error), notice: text => setNotice(text),
    openBrowser: () => navigation.openAttachmentBrowser(), reveal: owner => navigation.revealAttachment(owner),
    menuBlocked: () => !!quitState.current || loading || syncCoverRef.current || synchronizingRef.current || !!accessGate.state?.operationId || !!accessGate.state?.suspended.length || windowWrites.frozen(noteId) || !!modal || !!folderForm || !!draw || !!menu,
    ownedRecording: id => {const ticket=recordingTicket.current;return !!ticket && ticket.batch.operationIds.some(operation => attachmentSubmissions.current.get(operation)?.attachment?.id === id);},
  });
  const galleryEntries = presentation.projectGallery(listed,galleryAvailable,query);
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
        if (windowWrites.frozen(id)) {
          editorGate.park(instance);
          void windowWrites.cancel();
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
          windowWrites.frozen(owner) ||
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
      session.bodyFocus(false);
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
    const settingsTicket = settingsReads.current.get(data);
    if (settingsTicket !== undefined || !passive)
      settingsOwner.observe(data.settings, settingsTicket);
    const next = {
      ...data,
      notes,
      settings: settingsOwner.snapshot(),
    };
    wsRef.current = next;
    setWs(next);
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
          const data = await readSettingsWorkspace();
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
        const attachments=event.changes.filter(change=>change.kind==="attachment").map(change=>change.id);
        if(attachments.length)attachmentSourcePool.invalidate(attachments);
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
      setWindowWidth(window.innerWidth);
      const nextMobile = mobileLayout(window.innerWidth);
      if (!!nextMobile !== mobileMode.current) cancelCreateFocus();
      mobileMode.current = !!nextMobile;
      setMobile(!!nextMobile);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!workspaceLoaded) return; // Keep the validated first-paint cache until authority loads.
    const appearance = { version: 2 as const, themeId, schemePreference };
    const release = applyAppearance(appearance);
    startup.appearance(appearance);
    return release;
  }, [themeId, schemePreference, workspaceLoaded]);
  const flush = useCallback(async () => {
    await Promise.all([...queues.current.values()]);
    if (pendingDocs.current.size || saveFailures.current.size)
      throw Error(
        "还有未确认保存的更改；锁定未执行，请保持窗口打开并重试编辑保存。",
      );
  }, []);
  const refresh = useCallback(async () => {
    await flush();
    hydrate(await readSettingsWorkspace());
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
    freeze: (ids, cancel, source = "sync") => {
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
      if (source === "sync" && ids.includes(noteId || "")) session.invalidate("sync");
      const generation = session.generation;
      const scope = pickerRuntime.current.scope;
      const key = new PluginKey("notes-window-quiet");
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
        current: () => (source === "sync" || session.generation === generation) && pickerRuntime.current.scope === scope && [...held].every(([instance, value]) => !instance.isDestroyed && editorsRef.current.get(value.id) === instance && nativeEditorOwners.current.get(instance) === value.id && sameQuietAuthority(value.stamp, accessGate.stamp(value.id)) && documentsEqual(value.document, instance.getJSON())),
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
            if (allowed && pickerRuntime.current.editor === instance) editorGate.activate(instance, windowWrites.frozen(value.id) || !!quitState.current || synchronizingRef.current || !!accessGate.state?.operationId || blockedNotes.current.has(value.id) || !!accessGate.state?.suspended.includes(value.id));
            if (allowed && focus?.editor === instance && !focus.moved && instance.isEditable &&
              pickerRuntime.current.scope === scope && pickerRuntime.current.editor === instance &&
              instance.view.dom === value.dom && value.dom === focus.dom && value.dom.isConnected &&
              documentsEqual(value.document, instance.getJSON()) && document.hasFocus() &&
              (document.activeElement === document.body || value.dom.contains(document.activeElement))) {
              instance.view.dispatch(instance.state.tr.setSelection(focus.selection.resolve(instance.state.doc)));
              session.restoreAuthorizedFocus(instance, () => allowed && pickerRuntime.current.scope === scope && pickerRuntime.current.editor === instance && documentsEqual(value.document, instance.getJSON()));
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
  agentHost.current = {
    snapshot: () => {
      const base = quietHost.current.snapshot();
      const protectedIds = new Set(base.protectedNoteIds);
      for (const [id, instance] of editorsRef.current) {
        if (!instance.isDestroyed && (instance.isFocused || (id === noteId && session.snapshot().body === "editing"))) protectedIds.add(id);
      }
      if (draw) protectedIds.add(draw.noteId);
      const interaction = session.snapshot();
      if (noteId && (interaction.formatOpen || interaction.menu)) protectedIds.add(noteId);
      return { ...base, protectedNoteIds: [...protectedIds],
        unsavedNoteIds: [...new Set([...pendingDocs.current.keys(), ...saveFailures.current.keys(), ...savingNotes.current.keys()])],
        blocked: base.blocked || loading || !workspaceLoaded || networkSync.frozen() || navigation.pending || navigation.snapshot() !== committedNavigation.current || !!session.snapshot().pendingFocus,
      };
    },
    freeze: (ids, cancel) => quietHost.current.freeze(ids, cancel, "agent"),
    reply: replyAgentWindow,
    committed: async sessionId => {
      const snapshot = await metadataRefreshRef.current();
      if (!snapshot || snapshot.access?.sessionId !== sessionId || accessGate.state?.sessionId !== sessionId ||
        !snapshot.metadata || !metadataGate.canPublish(snapshot.metadata) || metadataGate.needsRefresh || metadataGate.applied < snapshot.metadata.sequence ||
        synchronizingRef.current || accessGate.state.operationId || metadataDisposed.current)
        throw Error("外部更改已提交，等待可信工作区刷新");
      await waitRecordingEditorCommit(new AbortController().signal);
      if (accessGate.state?.sessionId !== sessionId || accessGate.state.operationId || synchronizingRef.current ||
        metadataGate.needsRefresh || metadataDisposed.current || !quietMounted.current)
        throw Error("外部更改刷新时窗口或授权状态改变");
    },
    error: error => quietHost.current.error(error),
  };
  useLayoutEffect(() => { agentWindow.check(); });
  useEffect(() => {
    agentWindow.mount();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void subscribeAgentWindow(event => { void agentWindow.receive(event).catch(quietHost.current.error); }, error => quietHost.current.error(error))
      .then(release => { if (disposed) release(); else unlisten = release; }).catch(quietHost.current.error);
    return () => { disposed = true; unlisten?.(); agentWindow.dispose(); };
  }, [agentWindow]);
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
      if (!windowWrites.frozen()) return;
      const target = event.target instanceof Element ? event.target : null;
      const owner = target?.closest<HTMLElement>("[data-mobile-editor-note]")?.dataset.mobileEditorNote;
      if (owner && !windowWrites.frozen(owner) && target?.closest(".tiptap")) return;
      const trigger = target?.closest<HTMLElement>("button, a, input, [role=button], .note-row, .gallery-card");
      if (!trigger) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void windowWrites.cancel().then(() => { if (!disposed && trigger.isConnected) trigger.click(); }).catch(quietHost.current.error);
    };
    document.addEventListener("click", click, true);
    return () => { disposed = true; quietMounted.current = false; unlisten?.(); document.removeEventListener("click", click, true); networkSync.dispose(); };
  }, [networkSync]);
  const doAction = useCallback(
    async (a: Record<string, unknown>, validate?: () => void) => {
      quietWrites.current++;
      try {
      await windowWrites.cancel();
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
    (patch: Settings, throwOnFailure = false) => afterQuiet(() => {
      const work = Promise.resolve().then(() => settingsOwner.write(patch,
        settings => action({ type: "settings", settings }),
        async () => (await loadWorkspace()).settings,
      )).then(() => {
        if (patch.view && settingsOwner.snapshot().view === patch.view) setGalleryEditor(false);
      }).catch(cause => {
        fail(cause);
        if (throwOnFailure) throw cause;
      });
      if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
        debugPending.current.add(work);
        void work.then(() => debugPending.current.delete(work), () => debugPending.current.delete(work));
      }
      return work;
    }),
    [fail, afterQuiet, settingsOwner],
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
      if (windowWrites.frozen(id)) return Promise.resolve<SaveOutcome>({ saved: false, error: Error("备忘录正在更新，请稍候") });
      if (blockedNotes.current.has(id)) {
        const error = Error("备忘录正在同步锁定状态");
        fail(error);
        return Promise.resolve<SaveOutcome>({ saved: false, error });
      }
      savingNotes.current.set(id, (savingNotes.current.get(id) || 0) + 1);
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
        () => {
          const count = (savingNotes.current.get(id) || 1) - 1;
          if (count) savingNotes.current.set(id, count); else savingNotes.current.delete(id);
          setSaving(v => Math.max(0, v - 1));
        },
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
    quietWrites.current++;
    try {
      await windowWrites.cancel();
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
      quietWrites.current--;
      blockedNotes.current.delete(id);
      if (frozen && !frozen.isDestroyed && editable !== undefined)
        restoreEditor(frozen, editable);
      setSaving((v) => Math.max(0, v - 1));
    }
  };
  const handleCloseRequested = async (event: CloseRequestedEvent) => {
          if (windowWrites.frozen()) {
            event.preventDefault();
            await windowWrites.cancel();
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
  };
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
            windowWrites.frozen(owner) ||
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
        await windowWrites.cancel();
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
    attachmentSourcePool.revoke(ids);
    appSurface.current?.querySelectorAll<HTMLElement>(".attachment-gallery-card").forEach(card => {
      if (!ids.includes(card.dataset.noteId || "")) return;
      card.hidden = true;
      card.querySelectorAll("img,video,audio").forEach(element => { if (element instanceof HTMLMediaElement) element.pause(); element.removeAttribute("src"); });
    });
    for (const id of ids) appSurface.current?.querySelectorAll<HTMLImageElement>(`.note-row[data-note-id="${CSS.escape(id)}"] .note-thumbnail img`).forEach(image => image.removeAttribute("src"));
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
      session.invalidate("access");
      setModal((current) => current === "preferences" ? current : null);
      setModalValue("");
      session.recordVisibility(false);
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
    appSurface.current?.querySelectorAll<HTMLElement>(".attachment-gallery-card").forEach(card => {
      card.hidden = true;
      card.querySelectorAll("img,video,audio").forEach(element => { if (element instanceof HTMLMediaElement) element.pause(); element.removeAttribute("src"); });
    });
    appSurface.current?.querySelectorAll<HTMLImageElement>(".note-thumbnail img").forEach(image => image.removeAttribute("src"));
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
            const data = await readSettingsWorkspace(true);
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
      attachmentSourcePool.revoke(event.noteIds);
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
  const openFormat = session.openFormat;
  const formatCommand = session.formatCommand;
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
  navigation.configure({
    workspace: () => wsRef.current, blocked: () => [...blockedNotes.current],
    noteId, mobile, contentSearch, view, sort, separate: !!separate && native,
    sync: windowWrites, session, clearComposition: clearTagComposition,
    clearJump: () => setAttachmentJump(null), clearSwipe: () => setSwiped(null),
    clearFind: () => setShowFind(false), closeModal: () => setModal(null), parkSmart: id => parkedSmartEditors.current.add(id),
    settings: updateSettings, flush, closeWindow: () => { void getCurrentWindow().close(); }, fail,
  });
  const { chooseFolder, chooseTag, chooseNote, openFolders, back } = navigation;
  useEffect(() => presentation.followJump(editor,attachmentBrowser,noteId), [presentation,attachmentJump,attachmentBrowser,noteId,editor]);
  const createNote = useCallback(
    (validate?: () => void): Promise<void> => {
      if (createFlight.current) return createFlight.current;
      const source = folderId;
      session.invalidate("navigation");
      const navigationGeneration = session.generation;
      if (mobile) { setCreatingNote(true); setCreationError(""); }
      const work = (async () => {
      quietWrites.current++;
      try {
        await windowWrites.cancel();
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
        if (navigationGeneration !== session.generation) return;
        revisions.current.confirmed(n.id, n.revision);
        navigation.adoptCreated(n, { source, folderId: fid, generation: navigationGeneration });
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
  const finishEditing = async () => {
    const intent = session.captureBodyIntent();
    await windowWrites.cancel();
    await flush();
    session.completeBodyIntent(intent);
  };
  const saveFolderDraft = async (draft: FolderDraft, committedId?: string) => {
    quietWrites.current++;
    try {
    await windowWrites.cancel();
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
    session.invalidate("overlay");
    if (type === "settings" || type === "data") {
      if (modal !== "preferences") preferencesTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPreferencesTab(type === "data" ? "data" : mobile ? "home" : "settings");
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
    setModal(type);
    setModalValue(value);
    setMenu(null);
  };
  const preferencesBack = () => {
    if (appleNotesImportHandle.current?.inspect().open) { void appleNotesImportHandle.current.close().catch(fail); return; }
    if (preferencesTab === "account" && accountSettingsHandle.current?.dismiss()) return;
    if (preferencesTab === "sync" && syncSettingsHandle.current?.dismiss()) return;
    if (preferencesTab === "data" && dataManagementHandle.current?.inspect().view !== "overview" && dataManagementHandle.current) { dataManagementHandle.current.navigate("overview"); return; }
    if (mobile && preferencesTab !== "home") setPreferencesTab("home");
    else setModal(null);
  };
  const androidBack = useRef<() => void>(() => {});
  navigation.configureBack({
    preview: !!imagePreview, closePreview: () => setImagePreview(null),
    folderForm: !!folderForm, cancelFolderForm: () => folderFormHandle.current?.cancel(),
    ocr: !!ocrOperation.current, cancelOcr: () => {void cancelOcr().catch(fail);},
    modal, preferencesBack, closeModal: () => setModal(null),
    menu, format: formatOpen, drawing: !!draw, recording: record,
    closeRecording: () => recordingPanel.current?.close(), find: showFind,
    editorFocused: !!editor?.isFocused, session,
    requestExit: () => {
      if (mobile && createFlight.current) {setNotice("正在创建备忘录，请稍候");return;}
      if (pickerTargets.current.size || attachmentBatches.current.size) {fail(Error("附件操作尚未完成，请稍候再退出。"));return;}
      flush()
        .then(() => {
          if (!pendingDocs.current.size) void exit(0);
          else setError("还有未保存的更改，请重试保存。");
        })
        .catch(fail);
    },
  });
  androidBack.current = navigation.androidBack;
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
        await windowWrites.cancel();
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
      await windowWrites.cancel();
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
    await windowWrites.cancel();
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
      nativePlatform.focusSearch(() => searchInput.current);
    }).catch(fail);
  }, [fail, afterQuiet]);
  const openDrawing = (strokes: DrawingStroke[] = [], pos?: number, instance = editor) => {
    if (!instance || instance !== editor || !noteId || instance.isDestroyed || !instance.isEditable || nativeEditorOwners.current.get(instance) !== noteId || !accessGate.state?.notes[noteId]?.authorized || accessGate.state?.operationId || synchronizingRef.current) return;
    const originalNode = pos === undefined ? undefined : instance.state.doc.nodeAt(pos) || undefined;
    if (pos !== undefined && originalNode?.type.name !== "drawing") return;
    session.openDrawing({ strokes, pos, editor: instance, noteId, authority: imageAuthority(noteId), bookmark: instance.state.selection.getBookmark(), originalNode, originalDocument: instance.state.doc });
  };
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
      // Each recording revision validates before storage/insertion and around
      // the journal ACK. These trusted reads must not blank the whole window
      // four times; actual access transitions still escalate to the cover.
      const synced = await synchronizeRef.current({ quiet: true });
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
  const retryAttachments = async () => {
    let debugComplete: (() => void) | undefined;
    if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
      const work = new Promise<void>((resolve) => { debugComplete = resolve; });
      debugPending.current.add(work);
      void work.finally(() => debugPending.current.delete(work));
    }
    try {
      for (const [id, doc] of [...pendingDocs.current]) await saveDoc(id, doc);
      await attachmentOperations.retry();
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
    stopLong();
    longPressed.current = false;
    longPress.current = setTimeout(() => {
      longPress.current = null;
      longPressed.current = true;
      callback();
    }, 520);
  };
  const stopLong = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  };
  const cancelTouch = () => { stopLong(); swipe.current = null; longPressed.current = false; setSwiped(null); };
  const folderRow = (f: FolderData, depth = 0) => (
    <div key={f.id}>
      <button
        className={`folder-row ${mobile && f.kind === "quick" ? "mobile-quick-folder-row" : ""} ${tagFilter === undefined && folderId === f.id ? "selected" : ""}`}
        style={{ paddingLeft: mobile ? 16 : (14 + depth * 30) * metrics.scale }}
        onClick={() => {
          if (longPressed.current) { longPressed.current = false; return; }
          chooseFolder(f.id);
        }}
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
        onTouchCancel={cancelTouch}
      >
        {!mobile && ws.folders.some(child => child.parentId === f.id) && (
          <span className="folder-disclosure" role="button" tabIndex={0}
            aria-label={`${collapsedFolders.has(f.id) ? "展开" : "收起"}${f.name}`}
            aria-expanded={!collapsedFolders.has(f.id)}
            onClick={event => { event.stopPropagation(); setCollapsedFolders(previous => { const next = new Set(previous); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next; }); }}
            onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); event.currentTarget.click(); } }}>
            <ChevronDown size={14} className={collapsedFolders.has(f.id) ? "collapsed" : ""} />
          </span>
        )}
        {f.kind === "smart" ? (
          <FolderCog />
        ) : f.kind === "quick" ? (
          mobile ? (
            <MobileQuickFolderIcon />
          ) : (
            <NotebookPen />
          )
        ) : f.kind === "trash" ? (
          <Trash2 />
        ) : mobile ? (
          <MobileClosedFolderIcon />
        ) : (
          <Folder />
        )}
        <span className="folder-name">{f.name}</span>
        <span className="count">{count(f.id)}</span>
        {mobile && <ChevronRight className="chevron" />}
      </button>
      {(!collapsedFolders.has(f.id) || mobile) && ws.folders
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
        placeholder={mobile ? "搜索笔记" : "搜索备忘录"}
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
  useEffect(() => attachmentOperations.listen([fileInput.current,cameraInput.current]), [attachmentOperations]);
  attachmentOperations.configure({
    workspace: () => wsRef.current, quitting: () => !!quitState.current, synchronizing: () => synchronizingRef.current,
    blocked: id => blockedNotes.current.has(id), owner: instance => nativeEditorOwners.current.get(instance),
    documentVersion: instance => nativeDocumentVersions.current.get(instance) || 0, externalVersion: id => externalVersions.current.get(id) || 0,
    pendingDocument: id => pendingDocs.current.get(id), assertNative: (context,editing) => nativeAssert.current(context,editing),
    validatePickerTarget, validateRecordingTarget, awaitDocumentAck: awaitAttachmentDocumentAck,
    finishRecording: ticket => finishRecording(ticket), cancelRecording: ticket => cancelRecording(ticket), refresh,
    closeMenu: () => setMenu(null), clearError: () => setError(""), fail,
    inputs: () => [fileInput.current,cameraInput.current], debugPending: debugPending.current,
  });
  const finishRecording = (ticket: RecordingTicket) => {
    ticket.accepting = false;
    for (const controller of ticket.editorCommits || []) controller.abort();
    ticket.local?.card?.dispose();
    if (ticket.local) return; // Unmount only after native cleanup is confirmed.
    if (recordingTicket.current === ticket) {
      session.recordClosed(ticket.batch.target.noteId);
      recordingTicket.current = null;
      if (!ticket.detached) session.recordVisibility(false);
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
      session.recordVisibility(false);
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
    session.recordClosed(ticket.batch.target.noteId);
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
    session.recordOpened(batch.target.noteId, desktop);
    setMenu(null);
    if (desktop) void registerDesktopRecording(ticket).catch(fail);
    else session.recordVisibility(true);
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
      if (!ticket.detached) session.recordVisibility(false);
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
    session.browse("overlay");
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
  const openTableMenu = () => {
    if (!editor?.isEditable) return;
    if (editor.isActive("table") || !editor.state.selection.empty)
      setMenu(menu === "table" ? null : "table");
    else
      editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run();
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
            {mobile ? <CheckCheck /> : <ListTodo />}
          </IconButton>
          <IconButton
            label="添加附件"
            onClick={() => setMenu(menu === "media" ? null : "media")}
          >
            <Paperclip />
          </IconButton>
          <IconButton label="绘画" onClick={() => openDrawing()}>
            <PenTool />
          </IconButton>
          <IconButton label="录音" disabled={!editor?.isEditable} onClick={() => { try { openRecording(); } catch (error) { fail(error); } }}>
            <Mic />
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
            {mobile ? <CheckCheck /> : <ListTodo />}
          </IconButton>
          <IconButton
            label="表格"
            onClick={openTableMenu}
          >
            <Table />
          </IconButton>
          <IconButton
            label="添加附件"
            onClick={() => setMenu(menu === "media" ? null : "media")}
          >
            <Paperclip />
          </IconButton>
          {!mobile && <>
            <button className="toolbar-labeled-button" aria-label="录音" disabled={!editor?.isEditable} onClick={() => openRecording()}><Mic /><span>录音</span></button>
            <button className="toolbar-labeled-button" aria-label="标签" disabled={!editor?.isEditable} onClick={() => editor?.chain().focus().insertContent("#").run()}><Hash /><span>标签</span></button>
          </>}
          {mobile && (
            <>
              <IconButton label="录音" disabled={!editor?.isEditable} onClick={() => { try { openRecording(); } catch (error) { fail(error); } }}>
                <Mic />
              </IconButton>
              <IconButton label="绘画" onClick={() => openDrawing()}>
                <PenTool />
              </IconButton>
              <IconButton
                label="收起键盘"
                onClick={() => {
                  session.browse("confirm");
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
        await doAction({
          type: "deleteSmartFolder",
          input: {
            id: target.id,
            expectedDefinitionRevision: target.revision,
          },
        });
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
  const renderMenu = (menuType: string | null = menu) => <AppMenus
    surface={{ menu: menuType, mobile, target: contextNote ?? noteId, revision: selected?.revision, element: noteMenuElement, point: noteMenuPoint, layoutKey: JSON.stringify([sidebar,view,settings.sidebarWidth,settings.listWidth]),
      close: format => {if(format)session.closeFormat("outside");else setMenu(null);setContextNote(null);}, action: () => setMenu(null) }}
    format={{ editor, run: formatCommand, close: () => session.closeFormat("confirm") }}
    media={{ locked: !!current?.locked, attach: accept => openAttachmentPicker(fileInput.current,accept), camera: () => openAttachmentPicker(cameraInput.current), record: openRecording, ocr: openOcr, draw: openDrawing, notice: setNotice, fail, close: () => setMenu(null) }}
    table={{ editor, mobile, close: () => setMenu(null) }}
    note={{ selected, folders: ws.folders, unlocked, mobile, menu: menuType || "", patch, modal: openModal, separate: openSeparate,
      find: () => setShowFind(true), attachments: openAttachmentBrowser, flush, notice: setNotice, fail, share: shareNote,
      deleted: () => {setNoteId(null);if(mobile)setPage("notes");}, close: () => setMenu(null) }}
    view={{ attachmentBrowser, view, sort, settings, separate: !!separate, chooseView: view => {setAttachmentBrowser(false);updateSettings({view});}, attachments: openAttachmentBrowser, update: updateSettings, modal: openModal, close: () => setMenu(null) }}
    folder={{ folder: ws.folders.find(folder=>folder.id===contextFolder), modal: openModal }}
    app={{ archiveBusy, recording: !!recordingTicket.current || record, archive: mode => {void archive(mode);}, modal: openModal }}
  />;
  const previewAuthority = JSON.stringify(accessGate.stamp(noteId || undefined));
  const imagePreviewOpen = presentation.previewOpen;
  const contentOverlay = modal === "preferences";
  const nativeScope = JSON.stringify([
    folderId,
    noteId,
    view,
    galleryEditor,
    attachmentBrowser,
    separate,
    query,
  ]);
  const attachmentBaseAvailable =
    !attachmentBrowser &&
    !windowWrites.frozen(noteId) &&
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
  nativePlatform.configure({
    target: {noteId,scope:nativeScope,current,editor,loading,synchronizing,accessSuspended,modal,folderForm:!!folderForm,draw:!!draw,record,ocr:!!ocrOperation.current,quitPending,
      quitting:()=>!!quitState.current,blocked:id=>blockedNotes.current.has(id)},
    projection: {folderId,view,galleryEditor,attachmentBrowser,separate,page,sidebar,settings:{...settings,sidebarWidth:desktopSidebarWidth,listWidth:desktopListWidth},listTitle,count:listed.length,query,contentOverlay},
    actions: {networkSync: windowWrites,changeSearch,setContextFolder,openModal,changeSidebar,back,createNote,shareTarget,openRecording,openAttachmentBrowser,setAttachmentBrowser,updateSettings,setShowFind,
      workspace:()=>wsRef.current,doAction,setContextNote,setNoteId,pick:(accept,context)=>openAttachmentPicker(fileInput.current,accept,context),openOcr,openDrawing,focusGlobalSearch,archive:mode=>{void archive(mode);},fail},
  });
  const nativeSelection = nativePlatform.selection;
  useSystemEvents({
    keys: {quitting:!!quitState.current,folderForm:!!folderForm,ocr:!!ocrOperation.current,mobile,page,attachmentBrowser,modal:!!modal,menu:!!menu,format:formatOpen,drawing:!!draw,find:showFind,searching,searchDraft:searchDraft!==null,
      create:newNote,globalSearch:focusGlobalSearch,findInNote:()=>setShowFind(true),cancelOcr:()=>{void cancelOcr().catch(fail);},closeModal:()=>setModal(null),closeMenu:()=>setMenu(null),
      closeFormat:()=>session.closeFormat("escape"),closeDrawing:()=>session.closeDrawing("escape"),closeFind:()=>setShowFind(false),clearSearch:()=>{void changeSearch({searching:false,query:""}).catch(fail);},back},
    androidBack:navigation.androidBack,nativeMenu:nativePlatform.menu,
    legacyMenu:{create:newNote,newFolder:()=>openModal("newFolder"),toggleSidebar:()=>changeSidebar(value=>!value),toggleGallery:()=>{setAttachmentBrowser(false);updateSettings({view:view==="list"?"gallery":"list"});},search:focusGlobalSearch,find:()=>setShowFind(true),attachmentBrowser,archive:mode=>{void archive(mode);}},
    refreshMetadata:()=>{void metadataRefreshRef.current();},saveHidden:()=>{void flush().catch(fail);},closeRequested:handleCloseRequested,
    detachOwners:()=>{ocrLifecycle.current.detach();recordingLifecycle.current.detach();},fail,drawing:openDrawing,
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
          menu: menu ?? (formatOpen ? "format" : null),
          modal,
          attachmentBrowser,
          listed: listed.map((n) => n.id),
        },
        save: {
          pending: pendingDocs.current.size,
          queued: queues.current.size,
          failed: saveFailures.current.size,
          saving,
        },
        agentWindow: { frozen: agentWindow.frozen(), ...agentHost.current.snapshot() },
        quietWindow: {
          frozen: windowWrites.frozen(),
          ...quietHost.current.snapshot(),
          editors: [...editorsRef.current].filter(([, instance]) => !instance.isDestroyed).map(([id, instance]) => ({ id, composing: instance.view.composing, pendingComposition: !!tagCompositions.current.get(id)?.pending, editable: instance.isEditable, frozen: windowWrites.frozen(id), owner: nativeEditorOwners.current.get(instance), externalVersion: externalVersions.current.get(id) || 0 })),
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
        account: accountSettingsHandle.current?.inspect() || null,
        synchronization: syncSettingsHandle.current?.inspect() || null,
        preferences: { open: modal === "preferences", tab: preferencesTab },
        editorSession: session.inspect(),
        creation: { pending: creatingNote, receipt: createReceipt.current?.id || null, source: createReceipt.current?.source || null, error: creationError, focusTarget: editorSession.pendingFocus?.noteId || null },
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
          if (!isPreferencesTab(tab)) throw Error("未知设置分类");
          setPreferencesTab(tab === "home" && !mobile ? "settings" : tab);
        },
        "data.open": () => openModal("data"),
        "image.preview": ({ id }) => {
          const button = document.querySelector<HTMLButtonElement>(`.attachment-node[data-attachment-id="${CSS.escape(id as string)}"] .image-open`);
          if (!button || button.disabled) throw Error("图片尚未可预览");
          button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        },
        "image.save": ({ id }) => {
          if(!imagePreviewOpen || imagePreview?.id !== id) throw Error("请先打开对应图片预览");
          const button = document.querySelector<HTMLButtonElement>(`.image-preview[data-preview-id="${CSS.escape(id as string)}"] .save-image`);
          if (!button || button.disabled) throw Error("图片尚未可保存");
          button.click();
        },
        "image.info": () => {const button=document.querySelector<HTMLButtonElement>('.image-preview [aria-label="图片信息"]');if(!button)throw Error("图片预览尚未打开");button.click();},
        "image.close": () => setImagePreview(null),
        ...Object.fromEntries(["status", "signIn", "signUp", "openLoginInBrowser", "cancel", "signOut", "syncNow", "setEnabled", "renameDevice", "syncDevice"].map(type => [`account.${type}`, async (args: Record<string, unknown>) => {
          if (!accountUIAvailable || modal !== "preferences" || preferencesTab !== "account" || !accountSettingsHandle.current) throw Error("请先打开账户与同步");
          await accountSettingsHandle.current.run({ ...args, type } as AccountCommand);
          return accountSettingsHandle.current?.inspect();
        }])),
        ...Object.fromEntries([
          ["sync.status", "status"], ["sync.host.start", "startHost"], ["sync.invite", "createInvite"],
          ["sync.pair", "pair"], ["sync.now", "syncNow"], ["sync.stop", "stop"], ["sync.resume", "resume"],
          ["sync.revoke", "revoke"], ["sync.conflicts", "conflicts"], ["sync.resolve", "resolve"],
        ].map(([id, type]) => [id, async (args: Record<string, unknown>) => {
          if (modal !== "preferences" || preferencesTab !== "sync" || !syncSettingsHandle.current) throw Error("请先打开设备同步");
          await syncSettingsHandle.current.run({ ...args, type } as SyncCommand);
          return syncSettingsHandle.current?.inspect();
        }])),
        ...Object.fromEntries(["open", "scan", "start", "cancel", "inspect"].map((action) => [`appleImport.${action}`, (args: Record<string, unknown>) => {
          if (modal !== "preferences" || preferencesTab !== "backup" || !appleNotesImportHandle.current) throw Error("请先在Mac主窗口打开导入与备份");
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
          if (tableAction === "convertToTable") return convertTextToTable(e);
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
            "theme", "appearance",
            "view",
            "sort",
            "groupDates",
            "sidebarWidth",
            "listWidth",
            "macSidebarVisible",
            "interfaceFontSize",
            "editorFontSize",
            "interfaceDetails",
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
          if (value === "table" && !editor?.isActive("table") && !canConvertTextToTable(editor))
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
          openDrawing();
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
  // The HTML splash exists before React starts. Release it once the restored
  // selection, editor and (on macOS) native toolbar have committed to the DOM.
  // This is a one-time handoff; ordinary sync and note switches never recreate it.
  const startupReady = !loading && workspaceLoaded && !syncCover && !synchronizing &&
    (!current || current.deletedAt || (current.locked && !unlocked.has(current.id)) || (!!editor && !editor.isDestroyed)) &&
    (!native || !macNative || mobile || !!nativeInfo || !!error);
  useLayoutEffect(() => {
    startup.diagnostic({
      loading, workspaceLoaded, syncCover, synchronizing,
      editorSatisfied: !!(!current || current.deletedAt || (current.locked && !unlocked.has(current.id)) || (!!editor && !editor.isDestroyed)),
      nativeRequired: native && macNative && !mobile,
      nativeInfoPresent: !!nativeInfo,
      errorPresent: !!error,
      startupReady: !!startupReady,
    });
  });
  useLayoutEffect(() => {
    if (!loading && !workspaceLoaded && (syncError || error)) startup.fail();
    if (!startupReady) return;
    return startup.scheduleReady();
  }, [startupReady, loading, workspaceLoaded, syncError, error]);
  return (
    <MobileInteractionContext.Provider value={mobile}>
    <NativeMenuContext.Provider value={nativeTop && nativeInfo?.native.popupMenus === true}>
    <AttachmentMetadataContext.Provider value={ws.attachments}>
    <ImagePreviewContext.Provider value={{open:openImagePreview, closeSource:closePreviewSource}}>
    <AttachmentTransferContext.Provider value={{paste:pasteAttachments}}>
    <AttachmentMenuProvider
      scope={JSON.stringify([nativeScope, page, previewAuthority, loading, synchronizing, accessSuspended, modal, folderForm, !!draw, quitPending, menu, imagePreviewOpen, windowWrites.frozen(noteId)])}
      topInset={nativeTop ? nativeInfo?.native.reservedTop || 0 : 0}
      onError={fail}
      permission={presentation.permission}
    >
    <div className={`recording-layout ${mobile ? "mobile-controls" : "desktop-controls"}`} style={{
      ...interfaceDetailVariables(settings.interfaceDetails, mobile),
      "--ui-font-scale": fontScales(settings).interface,
      "--mobile-ui-font-scale": fontScales(settings).mobileInterface,
      "--ui-scale": mobile ? 1 : metrics.scale,
    } as CSSProperties}>
    <div
      ref={appSurface}
      inert={quitPending}
      className={`app ${nativeTop ? "native-toolbar" : ""} ${syncCover || accessSuspended.length ? "access-sync" : ""} ${mobile ? "mobile" : "desktop"} ${attachmentBrowser ? "attachment-browse gallery-browse" : view === "gallery" && !separate ? (galleryEditor ? "gallery-edit" : "gallery-browse") : ""} ${formatOpen && mobile ? "format-open" : ""} page-${page} ${!sidebar ? "sidebar-hidden" : ""} ${separate ? "separate" : ""}`}
      style={
        {
          ...interfaceDetailVariables(settings.interfaceDetails, mobile),
          "--sidebar-width": `${desktopSidebarWidth}px`,
          "--list-width": `${desktopListWidth}px`,
          "--ui-font-scale": fontScales(settings).interface,
          "--mobile-ui-font-scale": fontScales(settings).mobileInterface,
          "--ui-scale": mobile ? 1 : metrics.scale,
          "--editor-scale": fontScales(settings).editor,
          "--toolbar-height": `${metrics.toolbarHeight}px`,
          "--editor-font-scale": fontScales(settings).editor,
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
      <aside className="sidebar" inert={modal === "preferences"}>
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
                label="隐藏文件夹"
                onClick={() => changeSidebar(false)}
              >
                <PanelLeft />
              </IconButton>
              <IconButton label="添加文件夹" onClick={() => openModal("newFolder")}><FolderPlus /></IconButton>
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
                <Folder />
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
                <div className="account-title">标签</div>
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
          width={desktopSidebarWidth}
          min={metrics.sidebarMin}
          max={metrics.sidebarMax}
          className="sidebar-resize"
          onChange={(w) => setSettings((s) => ({ ...s, sidebarWidth: w }))}
          onEnd={(w) => updateSettings({ sidebarWidth: w })}
          onCancel={() => setSettings(settingsOwner.snapshot())}
        />
      )}
      <section
        className={`notes-pane ${mobile || view === "gallery" || attachmentBrowser ? "gallery-pane" : ""}`}
        inert={modal === "preferences"}
      >
        {!nativeTop && (
          <header
            className="notes-header"
            data-tauri-drag-region={native && !mobile ? "deep" : undefined}
          >
            {mobile ? (
              <>
                {folderId !== "all" && <button className="back-button" aria-label="返回全部笔记" onClick={() => chooseFolder("all")}><ChevronLeft /></button>}
                <h1 className="notes-large-title" title={filter ? "搜索结果" : folderId === "all" ? "笔记" : folderLabel}>
                  {filter ? "搜索结果" : folderId === "all" ? "笔记" : folderLabel}
                </h1>
                <div className="mobile-home-actions">
                  <IconButton label="显示选项" onClick={() => setMenu(menu === "view" ? null : "view")}><MoreHorizontal /></IconButton>
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
                <span className="toolbar-divider" aria-hidden="true" />
                <IconButton label="新建备忘录" className="list-new-note" onClick={newNote} disabled={creatingNote}><SquarePen /></IconButton>
                {attachmentBrowser && <div className="gallery-header-search">{searchBox}</div>}
              </>
            )}
          </header>
        )}
        {mobile && (
          <>
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
        {attachmentBrowser ? <AttachmentGallery
          key={JSON.stringify([folderId, tagFilter])}
          entries={galleryEntries}
          available={galleryAvailable}
          scope={JSON.stringify([folderId, query, filter, tagFilter, modal, !!folderForm, accessGate.state?.sessionId, accessGate.state?.epoch])}
          reveal={revealGalleryAttachment}
          validate={validGalleryEntry}
          onError={fail}
          topInset={nativeTop ? nativeInfo?.native.reservedTop || 0 : 0}
        /> : <div
          className={`notes-scroll ${mobile ? `mobile-gallery ${mobileSingleColumn ? "single-column" : ""}` : view === "gallery" ? "gallery" : ""}`}
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
                (ws.attachments.some((a) => !a.internal && a.noteId === n.id)
                  ? "附件"
                  : "无更多文本");
              const highlightQuery = !mobile ? query : "";
              const listPreview =
                !n.locked && highlightQuery
                  ? searchListSnippet(previewText, highlightQuery)
                  : previewText;
              const thumbnail = !n.locked && !syncCover && !accessSuspended.length && !accessGate.state?.operationId
                ? ws.attachments.find(a => !a.internal && a.noteId === n.id && (a.kind === "image" || a.mime.startsWith("image/")) && documentReferencesAttachment(n.document, a))
                : undefined;
              return (
                <div
                  key={n.id}
                  className={`note-entry ${!mobile && view === "gallery" ? "gallery-entry" : ""}`}
                >
                  {(index === 0 || groupName(listed[index - 1]) !== group) &&
                    group && !mobile && <div className={`date-section ${group === "置顶" ? "pinned-section" : ""}`}>
                      {group === "置顶" ? <button className="pinned-heading" onClick={() => setPinnedCollapsed(value => !value)} aria-expanded={!pinnedCollapsed}><Pin size={18} fill="currentColor" /><span>置顶</span><ChevronDown className={pinnedCollapsed ? "collapsed" : ""} size={18} /></button> : group}
                    </div>}
                  <div
                    hidden={!mobile && n.pinned && pinnedCollapsed}
                    className={`note-row-wrap ${swiped === n.id ? "swiped" : ""}`}
                  >
                    {mobileSingleColumn && <div className="swipe-actions" aria-hidden={swiped !== n.id} inert={swiped !== n.id}>
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
                          setSwiped(null);
                          setMenu("move");
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
                    </div>}
                    <button
                      className={`note-row ${thumbnail ? "has-thumbnail" : ""} ${n.pinned ? "pinned-note" : ""} ${noteId === n.id ? "selected" : ""}`}
                      data-note-id={n.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (longPressed.current) { longPressed.current = false; return; }
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
                      onDoubleClick={(e) => {
                        if (!mobile) {
                          if (view === "gallery") galleryReturnFocus.current = e.currentTarget;
                          chooseNote(n);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (!mobile && view === "gallery" && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          galleryReturnFocus.current = e.currentTarget;
                          chooseNote(n);
                        }
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
                          mobileSingleColumn && swipe.current &&
                          Math.abs(e.touches[0].clientY - swipe.current.y) <
                            20 &&
                          swipe.current.x - e.touches[0].clientX > 45
                        )
                          setSwiped(n.id);
                      }}
                      onTouchEnd={stopLong}
                      onTouchCancel={cancelTouch}
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
                          {!mobile && <time className="note-list-time">{group === "今天" || group === "置顶" ? time : group === "昨天" ? `昨天 ${time}` : new Date(n.updatedAt).toLocaleDateString("zh-CN")}</time>}
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
                        {!mobile && !n.locked && (() => {
                          const audio = ws.attachments.find(a => !a.internal && a.noteId === n.id && a.kind === "audio");
                          const names = documentTags(n.document);
                          return audio || names.length ? <div className="note-list-metadata">{audio && <span><AudioLines size={17} />录音</span>}{audio && names.length > 0 && <i />}{names.length > 0 && <span><Tag size={17} />#{names[0]}</span>}</div> : null;
                        })()}
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
                      {thumbnail && <NoteThumbnail key={`${thumbnail.id}:${imageAuthority(n.id)}`} id={thumbnail.id} kind={thumbnail.kind} />}
                      </>}
                    </button>
                    {mobile && <button className="note-card-more" aria-label={`更多操作：${n.title}`} aria-haspopup="menu"
                      onClick={(e) => { e.stopPropagation(); setContextNote(n.id); setNoteMenuPoint(null); setMenu("note"); }}>
                      <MoreHorizontal size={20} />
                    </button>}
                  </div>
                </div>
              );
            })
          )}
        </div>}
        {mobile ? <button type="button" className="mobile-add-note" aria-label="新建备忘录" aria-busy={creatingNote} onClick={newNote} disabled={creatingNote || loading || !workspaceLoaded}><Plus aria-hidden="true" /></button> : <div className="notes-footer">
          <span>{listed.length}个备忘录</span>
          <IconButton label="新建备忘录" onClick={newNote}>
            <SquarePen />
          </IconButton>
        </div>}
      </section>
      {!mobile && !separate && (
        <ResizeHandle
          width={desktopListWidth}
          min={metrics.listMin}
          max={metrics.listMax}
          className="list-resize"
          onChange={(w) => setSettings((s) => ({ ...s, listWidth: w }))}
          onEnd={(w) => updateSettings({ listWidth: w })}
          onCancel={() => setSettings(settingsOwner.snapshot())}
        />
      )}
      <main
        className="editor-pane"
        inert={modal === "preferences"}
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
        onTouchCancel={cancelTouch}
      >
        {!nativeTop && !attachmentBrowser && (
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
                  className={`new-note-top glass-button ${!separate && view === "list" ? "toolbar-duplicate-compose" : ""}` }
                  onClick={newNote}
                >
                  <SquarePen />
                </IconButton>
                <DesktopToolbar
                  hitScale={parseInterfaceDetails(settings.interfaceDetails).desktopHitScale / 100}
                  iconScale={parseInterfaceDetails(settings.interfaceDetails).iconScale / 100}
                  scale={metrics.scale}
                  actions={current ? ([
                    { id: "format", label: "格式", icon: <ListMinus />, expanded: formatOpen, onClick: openFormat },
                    { id: "checklist", label: "核对清单", icon: <ListTodo />, active: editor?.isActive("taskList"), onClick: () => { editor?.chain().focus().toggleTaskList().run(); } },
                    { id: "table", label: "表格", icon: <Table />, expanded: menu === "table", onClick: openTableMenu },
                    { id: "attachment", label: "添加附件", icon: <Paperclip />, expanded: menu === "media", onClick: () => setMenu(menu === "media" ? null : "media") },
                    { id: "recordAudio", label: "录音", icon: <Mic />, disabled: !editor?.isEditable, onClick: () => openRecording() },
                    { id: "insertTag", label: "标签", icon: <Hash />, disabled: !editor?.isEditable, onClick: () => { editor?.chain().focus().insertContent("#").run(); } },
                    { id: "share", label: "共享", icon: <Share />, onClick: shareNote },
                    { id: "more", label: "更多", icon: <MoreHorizontal />, expanded: menu === "more", onClick: () => { setContextNote(null); setMenu(menu === "more" ? null : "more"); } },
                  ] satisfies DesktopToolbarAction[]) : []}
                  search={searchBox}
                  settings={<IconButton label="设置" className="desktop-settings" onClick={() => openModal("settings")}><SettingsIcon /></IconButton>}
                />
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
                draw?.editor === editors.get(note.id) ||
                quitPending ||
                synchronizingRef.current ||
                !!accessGate.state?.operationId ||
                blockedNotes.current.has(note.id) ||
                windowWrites.frozen(note.id) ||
                !!accessGate.state?.suspended.includes(note.id) ||
                accessGate.state?.notes[note.id]?.authorized === false
              }
              gate={editorGate}
              onChange={saveEditorDoc}
              onReady={onReady}
              onDate={() => setNotice(`创建于 ${fmtDate(note.createdAt)}`)}
              onFocus={(focused) => {
                session.bodyFocus(focused);
              }}
            />
          );
        })}
        {mobile &&
          current &&
          !current.deletedAt &&
          (!current.locked || unlocked.has(current.id)) &&
          !formatOpen &&
          (editing ? tools() : tools(true))}
        {saving > 0 && (
          <div className="save-status" aria-live="polite">
            正在保存…
          </div>
        )}
      </main>
      {formatOpen && renderMenu("format")}
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
          onBack={preferencesBack}
          account={accountUIAvailable && <AccountSettings active={preferencesTab === "account"} onHandle={handle => { accountSettingsHandle.current = handle; }} onConflicts={() => { accountConflictsRequested.current = true; setPreferencesTab("sync"); }} />}
          synchronization={<SyncSettings active={preferencesTab === "sync"} onHandle={handle => {
            syncSettingsHandle.current = handle;
            if (handle && preferencesTab === "sync" && accountConflictsRequested.current) {
              accountConflictsRequested.current = false;
              queueMicrotask(() => { void handle.run({ type: "conflicts" }).catch(fail); });
            }
          }} />}
          settings={settings}
          onSettings={patch => updateSettings(patch, true)}
          onCloseLocks={() => patch({type: "closeLocks"})}
          returnFocus={preferencesTrigger.current}
          data={<DataManagement
            active={preferencesTab === "data" || preferencesTab === "backup"}
            section={preferencesTab === "backup" ? "backup" : "storage"}
            appleImport={native && macNative && !separate ? <AppleNotesImport
              active={preferencesTab === "backup"}
              blocked={archiveBusy || !!recordingTicket.current || record || !!accessSuspended.length || !!accessGate.state?.operationId}
              accessKey={`${ws.access?.sessionId || ""}:${ws.access?.epoch || 0}:${ws.access?.operationId || ""}`}
              onPrepare={prepareAppleImport}
              onFinish={finishAppleImport}
              onHandle={(handle) => { appleNotesImportHandle.current = handle; }}
            /> : undefined}
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
          onClick={() => setModal(null)}
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

          </div>
        </div>
      )}
      {draw && (
        <DrawingPanel
          initial={draw.strokes}
          paperStyle={ws.notes.find(n => n.id === draw.noteId)?.paperStyle || "plain"}
          onCancel={() => session.closeDrawing("cancel")}
          onDone={(strokes, paperStyle) => {
            const target = draw.editor;
            if (windowWrites.frozen(draw.noteId) || target.isDestroyed || target !== editor || draw.noteId !== noteId || imageAuthority(draw.noteId) !== draw.authority || !accessGate.state?.notes[draw.noteId]?.authorized || accessGate.state?.operationId || synchronizingRef.current || target.state.doc !== draw.originalDocument || (draw.pos !== undefined && target.state.doc.nodeAt(draw.pos) !== draw.originalNode)) {
              session.closeDrawing("access"); fail(Error("原备忘录已改变，请重新打开速绘")); return;
            }
            editorGate.activate(target, false);
            restoreEditor(target, true);
            if (!target.isEditable) { session.closeDrawing("cancel"); return; }
            if (draw.pos !== undefined) target.view.dispatch(target.state.tr.setNodeMarkup(draw.pos, undefined, { ...draw.originalNode!.attrs, strokes }));
            else {
              const selection = draw.bookmark.resolve(target.state.doc);
              target.commands.insertContentAt(selection instanceof NodeSelection ? selection.to : { from: selection.from, to: selection.to }, { type: "drawing", attrs: { strokes } });
            }
            session.closeDrawing("confirm");
            if (paperStyle !== wsRef.current.notes.find(n => n.id === draw.noteId)?.paperStyle) void patch({ type: "patchNote", id: draw.noteId, paperStyle });
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
    </AttachmentMenuProvider>
    </AttachmentTransferContext.Provider>
    </ImagePreviewContext.Provider>
    </AttachmentMetadataContext.Provider>
    </NativeMenuContext.Provider>
    </MobileInteractionContext.Provider>
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
  onCancel,
  className,
}: {
  width: number;
  min: number;
  max: number;
  onChange: (w: number) => void;
  onEnd: (w: number) => void;
  onCancel: () => void;
  className: string;
}) {
  const drag = useRef<{ x: number; w: number; id: number } | null>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => () => {
    if (drag.current) cancelRef.current();
    drag.current = null;
  }, []);
  const clamp = (value: number) => Math.max(min, Math.min(max, value));
  const cancel = () => {
    if (!drag.current) return;
    drag.current = null;
    onCancel();
  };
  return (
    <div
      className={`resize-handle ${className}`}
      role="separator"
      tabIndex={0}
      aria-label="调整分栏宽度"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-orientation="vertical"
      onKeyDown={(e) => {
        if (drag.current) return;
        const step = e.shiftKey ? 24 : 8;
        const next = e.key === "Home" ? min : e.key === "End" ? max
          : e.key === "ArrowLeft" ? width - step : e.key === "ArrowRight" ? width + step : null;
        if (next === null) return;
        e.preventDefault();
        onChange(clamp(next));
        onEnd(clamp(next));
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || drag.current) return;
        e.preventDefault();
        e.currentTarget.focus();
        drag.current = { x: e.clientX, w: width, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current?.id === e.pointerId)
          onChange(
            Math.max(
              min,
              Math.min(max, drag.current.w + e.clientX - drag.current.x),
            ),
          );
      }}
      onPointerUp={(e) => {
        if (drag.current?.id === e.pointerId) {
          const next = clamp(drag.current.w + e.clientX - drag.current.x);
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          onEnd(
            next,
          );
        }
      }}
      onPointerCancel={(e) => {
        if (drag.current?.id !== e.pointerId) return;
        cancel();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onLostPointerCapture={(e) => { if (drag.current?.id === e.pointerId) cancel(); }}
    />
  );
}

export default App;
