import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type Action = 'newFolder' | 'toggleSidebar' | 'viewOptions' | 'backToGallery' | 'newNote'
  | 'settings' | 'recordAudio' | 'insertTag' | 'format' | 'checklist' | 'table' | 'attachment' | 'share' | 'more';
export type MenuCommand = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'highlight'
  | 'colorDefault' | 'colorPurple' | 'colorPink' | 'colorOrange' | 'colorMint' | 'colorBlue'
  | 'styleTitle' | 'styleHeading' | 'styleSubheading' | 'styleBody' | 'styleMonospaced'
  | 'listBullet' | 'listDash' | 'listNumber' | 'blockquote'
  | 'choosePhotoVideo' | 'recognizeImageText' | 'recordAudio' | 'attachFile' | 'takePhoto' | 'scanDocument' | 'addSketch'
  | 'pinNote' | 'lockNote' | 'findInNote' | 'moveNote' | 'recentNotes'
  | 'mathInsert' | 'mathSuggest' | 'mathOff' | 'attachmentsSmall' | 'attachmentsLarge' | 'deleteNote'
  | 'viewGallery' | 'viewList' | 'sortDefault' | 'sortModified' | 'sortCreated' | 'sortTitle'
  | 'groupByDate' | 'viewAttachments' | 'convertTableToText' | 'convertTextToTable';
export type MenuEntry =
  | { kind: 'item'; command: MenuCommand; folderId?: string; label: string; enabled: boolean; selected: boolean }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; items: MenuEntry[] };
export interface ToolbarState {
  revision: number;
  layout: 'threeColumn' | 'galleryBrowse' | 'galleryExpanded' | 'independentNote';
  columns: { sidebarVisible: boolean; sidebarWidth: number; listWidth: number };
  folderTitle: string;
  folderCount: number;
  tableFocused: boolean;
  contentOverlay?: boolean;
  actions: { action: Action; enabled: boolean; selected: boolean }[];
  menus: { owner: Action; items: MenuEntry[] }[];
  search: { enabled: boolean; value: string; acknowledgedEvent: number } | null;
  glassStyle: 'regular' | 'clear';
  fontScale?: number;
  /** Host-projected bounded interface details, independent of text size. */
  iconScale?: number;
  hitScale?: number;
  appearance?: "system" | "light" | "dark";
  /** Built-in palette ID; omitted by older hosts means Classic. */
  themeId?: "classic" | "paper" | "high-contrast" | "ocean" | "forest" | "rose" | "lavender" | "graphite";
}
export type Intent =
  | { kind: 'action'; action: Action }
  | { kind: 'menu'; owner: Action; command: MenuCommand; folderId?: string }
  | { kind: 'search'; value: string; phase: 'change' | 'commit' | 'cancel' }
  | { kind: 'windowActivity'; active: boolean };
export interface ToolbarEvent {
  windowLabel: string; bindingId: string; stateRevision: number; sequence: number; intent: Intent;
}
export interface NativeInfo {
  material: 'glassRegular' | 'glassClear' | 'legacyHeader';
  reservedTop: number; contentWidth: number; active: boolean; overflowActions: Action[];
  searchSequence: number; fullSizeContent: boolean;
  symbolFallbacks: { action: Action; requested: string; used: string }[];
  windowNumber: number; scaleFactor: number; popupMenus?: boolean;
}
export interface BindingInfo { windowLabel: string; bindingId: string; stateRevision: number; native: NativeInfo }
export interface NativeUiError { code: string; message: string; stage?: string; requestId?: string }

/** Explicit recording Start only. This may show the normal system microphone prompt. */
export async function recordingAccess(): Promise<{ status: 'authorized' }> {
  return invoke('plugin:notes-ui|recording_access', { windowLabel: getCurrentWindow().label });
}

/** Read the current system policy for this main window; independent of toolbar bindings. */
export async function keyboardNavigation(): Promise<{ enabled: boolean }> {
  return invoke('plugin:notes-ui|keyboard_navigation', { windowLabel: getCurrentWindow().label });
}

/** A handle to THIS Tauri window; IPC refuses any cross-window label. Subscribe before bind. */
export class NotesToolbar {
  readonly windowLabel = getCurrentWindow().label;
  private readonly window = getCurrentWindow();
  private bindingId: string | null = null;
  async listen(handler: (event: ToolbarEvent) => void): Promise<UnlistenFn> {
    return this.window.listen<ToolbarEvent>('notes-ui://intent', ({ payload }) => {
      if (payload.windowLabel === this.windowLabel && this.bindingId === payload.bindingId) handler(payload);
    });
  }
  async bind(toolbar: ToolbarState): Promise<BindingInfo> {
    const result = await invoke<BindingInfo>('plugin:notes-ui|bind', { windowLabel: this.windowLabel, toolbar });
    this.bindingId = result.bindingId;
    return result;
  }
  async update(toolbar: ToolbarState): Promise<BindingInfo> {
    return invoke('plugin:notes-ui|update', { windowLabel: this.windowLabel, bindingId: this.requiredBinding(), toolbar });
  }
  async inspect(): Promise<BindingInfo> {
    return invoke('plugin:notes-ui|inspect', { windowLabel: this.windowLabel, bindingId: this.requiredBinding() });
  }
  /** Current window/binding only; requests first responder without text or selection setters. */
  async focusSearch(): Promise<BindingInfo> {
    return invoke('plugin:notes-ui|focus_search', { windowLabel: this.windowLabel, bindingId: this.requiredBinding() });
  }
  async unbind(): Promise<void> {
    await invoke('plugin:notes-ui|unbind', { windowLabel: this.windowLabel, bindingId: this.requiredBinding() });
    this.bindingId = null;
  }
  private requiredBinding(): string {
    if (!this.bindingId) throw { code: 'not_bound', message: '当前窗口尚未绑定原生顶部' } satisfies NativeUiError;
    return this.bindingId;
  }
}
