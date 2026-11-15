import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Note, Workspace } from "../types";
import type { GalleryAttachment } from "../AttachmentGallery";
import {
  attachmentSourcePool,
  attachmentSourceIdentity,
} from "../attachment-source-pool";
import type { ImagePreviewIntent, ImagePreviewRequest } from "../ImagePreview";
import { documentReferencesAttachment } from "../attachment-submission";
import { secureId } from "../secure-id";
import type {
  AttachmentMenuRequest,
  AttachmentMenuPermission,
} from "../AttachmentContextMenu";
type Jump = { id: string; owner: string; authority: string };
type PresentationState = {
  imagePreview: ImagePreviewRequest | null;
  attachmentJump: Jump | null;
};
export type PresentationPorts = {
  workspace(): Workspace;
  editor(id: string): Editor | undefined;
  pending(id: string): JSONContent | undefined;
  authority(id: string): string;
  authorized(id: string): boolean;
  galleryBlocked(id: string): boolean;
  menuBlocked(): boolean;
  ownedRecording(id: string | undefined): boolean;
  previewBlocked(): boolean;
  visibilityBlocked(): boolean;
  covered(): boolean;
  noteId: string | null;
  currentEditor: Editor | null;
  browser: boolean;
  mobile: boolean;
  page: "folders" | "notes" | "editor";
  surface(): HTMLElement | null;
  afterQuiet(action: () => void): Promise<unknown>;
  fail(error: unknown): void;
  notice(text: string): void;
  openBrowser(): void;
  reveal(owner: Note): void;
};
/** Owns gallery reference projection, preview retains/authority and attachment
 * jump resource lifecycle. It never persists or owns a workspace/editor copy. */
export class AttachmentPresentation {
  private value: PresentationState = {
    imagePreview: null,
    attachmentJump: null,
  };
  private ports: PresentationPorts | null = null;
  private active = true;
  private previewCancel: (() => void) | undefined;
  private previewAttempt = 0;
  private pendingPreviewValid: (() => boolean) | undefined;
  private listeners = new Set<() => void>();
  readonly imagePreviewRef: { current: ImagePreviewRequest | null } = {
    current: null,
  };
  private gallery: { entries: GalleryAttachment[]; available: boolean } = {
    entries: [],
    available: false,
  };
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  configure(ports: PresentationPorts) {
    this.ports = ports;
  }
  mount() {
    this.active = true;
  }
  dispose() {
    this.previewAttempt++;
    this.previewCancel?.();
    this.previewCancel = undefined;
    this.active = false;
    this.gallery = { entries: [], available: false };
  }
  private live() {
    if (!this.ports) throw Error("附件呈现尚未配置");
    return this.ports;
  }
  private patch(value: Partial<PresentationState>) {
    this.value = { ...this.value, ...value };
    for (const listener of this.listeners) listener();
  }
  setImagePreview = (
    next:
      | ImagePreviewRequest
      | null
      | ((old: ImagePreviewRequest | null) => ImagePreviewRequest | null),
  ) => {
    const value =
      typeof next === "function" ? next(this.value.imagePreview) : next;
    if (value === null) {
      this.previewAttempt++;
      this.previewCancel?.();
      this.previewCancel = undefined;
      this.pendingPreviewValid = undefined;
    }
    if (value === this.value.imagePreview) return;
    this.imagePreviewRef.current = value;
    this.patch({ imagePreview: value });
  };
  setAttachmentJump = (value: Jump | null) => {
    if (this.value.attachmentJump !== value)
      this.patch({ attachmentJump: value });
  };
  hideImagePreview = () => {
    this.previewAttempt++;
    this.previewCancel?.();
    this.previewCancel = undefined;
    const surface = this.live()
      .surface()
      ?.querySelector<HTMLElement>(".image-preview");
    if (surface) {
      surface.hidden = true;
      surface.querySelector("img")?.removeAttribute("src");
    }
    this.setImagePreview(null);
  };
  closePreviewSource = (source: ImagePreviewRequest["source"]) =>
    this.setImagePreview((value) => (value?.source === source ? null : value));
  projectGallery(notes: readonly Note[], available: boolean, query: string) {
    const p = this.live(),
      ws = p.workspace();
    const entries: GalleryAttachment[] = available
      ? notes.flatMap((note) => {
          if (note.deletedAt || (note.locked && !p.authorized(note.id)))
            return [];
          const editor = p.editor(note.id),
            doc =
              p.pending(note.id) ??
              (editor && !editor.isDestroyed
                ? editor.getJSON()
                : note.document);
          return ws.attachments
            .filter(
              (a) =>
                !a.internal &&
                a.noteId === note.id &&
                documentReferencesAttachment(doc, a) &&
                (!query ||
                  `${a.displayName}\n${note.title}\n${note.plainText}`
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase())),
            )
            .map((attachment) => ({
              attachment,
              note,
              folder:
                ws.folders.find((f) => f.id === note.folderId)?.name ||
                "备忘录",
              authority: p.authority(note.id),
            }));
        })
      : [];
    this.gallery = { entries, available };
    return entries;
  }
  validGalleryEntry = (entry: GalleryAttachment) => {
    const p = this.live();
    if (!this.active || p.galleryBlocked(entry.note.id)) return false;
    const note = p.workspace().notes.find((n) => n.id === entry.note.id),
      attachment = p
        .workspace()
        .attachments.find(
          (a) =>
            a.id === entry.attachment.id &&
            a.noteId === entry.note.id &&
            !a.internal,
        );
    if (
      !note ||
      note.deletedAt ||
      !attachment ||
      p.authority(note.id) !== entry.authority ||
      (note.locked && !p.authorized(note.id))
    )
      return false;
    const editor = p.editor(note.id),
      doc =
        p.pending(note.id) ??
        (editor && !editor.isDestroyed ? editor.getJSON() : note.document);
    return (
      this.gallery.available &&
      documentReferencesAttachment(doc, attachment) &&
      this.gallery.entries.some(
        (e) =>
          e.attachment.id === attachment.id &&
          e.note.id === note.id &&
          e.authority === entry.authority,
      )
    );
  };
  permission = (request: AttachmentMenuRequest): AttachmentMenuPermission => {
    const p = this.live(),
      editor = p.currentEditor,
      noteId = p.noteId;
    const current = p.workspace().notes.find((note) => note.id === noteId);
    const allowed =
      this.active &&
      !p.menuBlocked() &&
      !!noteId &&
      !!current &&
      !current.deletedAt &&
      !!editor &&
      !editor.isDestroyed &&
      request.editor === editor &&
      (!p.mobile || p.page === "editor") &&
      (!current.locked || p.authorized(noteId)) &&
      request.trigger.isConnected &&
      !request.trigger.closest("[hidden], [inert], .access-sync");
    if (request.temporary)
      return { allowed: !!allowed, writable: false, saved: false };
    const attachment = p
      .workspace()
      .attachments.find(
        (a) => a.id === request.id && a.noteId === noteId && !a.internal,
      );
    const referenced =
      !!editor &&
      !!request.id &&
      documentReferencesAttachment(editor.getJSON(), {
        id: request.id,
        kind: request.kind,
      });
    const ownedRecording = p.ownedRecording(request.id);
    return {
      allowed: !!allowed && referenced,
      writable:
        !!allowed && referenced && !!editor?.isEditable && !ownedRecording,
      saved: !!attachment && !ownedRecording,
    };
  };
  openAttachmentBrowser = () => {
    void this.live()
      .afterQuiet(() => {
        if (this.active) this.live().openBrowser();
      })
      .catch(this.live().fail);
  };
  revealGalleryAttachment = (entry: GalleryAttachment) => {
    void this.live()
      .afterQuiet(() => {
        const p = this.live();
        if (!this.validGalleryEntry(entry))
          throw Error("附件或备忘录状态已改变，请重新选择。");
        const owner = p.workspace().notes.find((n) => n.id === entry.note.id);
        if (!owner || owner.deletedAt) throw Error("所属备忘录已不存在。");
        p.reveal(owner);
        this.setAttachmentJump({
          id: entry.attachment.id,
          owner: owner.id,
          authority: entry.authority,
        });
      })
      .catch(this.live().fail);
  };
  openImagePreview = (request: ImagePreviewIntent) => {
    if (!this.active) return;
    const p = this.live(),
      attachment = p
        .workspace()
        .attachments.find((a) => a.id === request.id && !a.internal);
    if (!attachment) return;
    const owner = attachment.noteId,
      authority = p.authority(owner),
      editor = p.currentEditor,
      browser = p.browser;
    const valid = () => {
      const live = this.live(),
        current = live
          .workspace()
          .attachments.find((a) => a.id === attachment.id && !a.internal);
      if (
        !this.active ||
        live.previewBlocked() ||
        !current ||
        current.noteId !== owner ||
        current.size !== attachment.size ||
        current.mime !== attachment.mime ||
        current.relativePath !== attachment.relativePath ||
        live.authority(owner) !== authority ||
        !request.trigger.isConnected ||
        !request.trigger.getClientRects().length
      )
        return false;
      const note = live.workspace().notes.find((n) => n.id === owner);
      if (!note || note.deletedAt || (note.locked && !live.authorized(owner)))
        return false;
      if (browser) {
        const entry = this.gallery.entries.find(
          (e) => e.attachment.id === request.id,
        );
        return !!entry && this.validGalleryEntry(entry);
      }
      return (
        live.noteId === owner &&
        live.currentEditor === editor &&
        !!editor &&
        !editor.isDestroyed &&
        documentReferencesAttachment(editor.getJSON(), current)
      );
    };
    if (!valid()) return;
    this.previewCancel?.();
    const attempt = ++this.previewAttempt;
    // Never retain the thumbnail: a fresh original-purpose grant passes both
    // bridge gates, then the exact captured owner/reference is checked again.
    let cancel: () => void = () => {};
    cancel = attachmentSourcePool.request(
      request.id,
      owner,
      "original",
      undefined,
      attachmentSourceIdentity(
        owner,
        JSON.stringify([
          attachment.id,
          attachment.relativePath,
          attachment.size,
          attachment.mime,
        ]),
      ),
      (source, grant) => {
        queueMicrotask(() => {
          if (attempt !== this.previewAttempt || !valid()) {
            cancel();
            return;
          }
          const retained = source.retain();
          cancel();
          this.previewCancel = undefined;
          this.pendingPreviewValid = undefined;
          this.setImagePreview({
            ...request,
            source: retained,
            name: attachment.displayName,
            mime: grant.mime,
            bytes: attachment.size,
            owner,
            authority,
            session: secureId(),
          });
        });
      },
      (error) => {
        if (attempt === this.previewAttempt && valid()) this.live().fail(error);
      },
    );
    this.previewCancel = cancel;
    this.pendingPreviewValid = valid;
  };
  get previewOpen() {
    const p = this.live(),
      request = this.value.imagePreview;
    if (!request) return false;
    const owner = p.workspace().notes.find((n) => n.id === request.owner),
      attachment = p
        .workspace()
        .attachments.find((a) => a.id === request.id && a.noteId === owner?.id);
    const editor = owner && p.editor(owner.id),
      doc = owner && (editor?.getJSON() ?? owner.document);
    return (
      !!owner &&
      !owner.deletedAt &&
      !!attachment &&
      !!doc &&
      documentReferencesAttachment(doc, attachment) &&
      request.authority === p.authority(owner.id) &&
      !p.visibilityBlocked() &&
      (!owner.locked || p.authorized(owner.id)) &&
      (!p.mobile || p.page === "editor" || p.browser)
    );
  }
  reconcilePreview() {
    if (this.pendingPreviewValid && !this.pendingPreviewValid()) {
      this.previewAttempt++;
      this.previewCancel?.();
      this.previewCancel = undefined;
      this.pendingPreviewValid = undefined;
    }
    if (this.value.imagePreview && !this.previewOpen)
      this.setImagePreview(null);
  }
  followJump(
    editor: Editor | null,
    attachmentBrowser: boolean,
    noteId: string | null,
  ) {
    const p = this.live(),
      { attachmentJump } = this.value;

    if (
      !attachmentJump ||
      attachmentBrowser ||
      noteId !== attachmentJump.owner ||
      !editor ||
      editor.isDestroyed
    )
      return;
    let second = 0,
      timer = 0,
      highlighted: HTMLElement | null = null;
    let resize: ResizeObserver | undefined;
    const stopFollowing = () => resize?.disconnect();
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (
          editor.isDestroyed ||
          p.covered() ||
          p.authority(attachmentJump.owner) !== attachmentJump.authority
        )
          return;
        let position: number | null = null;
        editor.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "attachment" &&
            node.attrs.id === attachmentJump.id &&
            position === null
          )
            position = pos;
        });
        if (position === null) {
          this.setAttachmentJump(null);
          p.notice("附件已从备忘录中移除");
          return;
        }
        editor.commands.setNodeSelection(position);
        highlighted = editor.view.dom.querySelector<HTMLElement>(
          `.attachment-node[data-attachment-id="${CSS.escape(attachmentJump.id)}"]`,
        );
        if (!highlighted) return;
        // NodeView selection updates replace className. A separate attribute keeps
        // the highlight stable while the selected attachment rerenders.
        highlighted.dataset.attachmentJump = "true";
        const center = () =>
          highlighted?.isConnected &&
          highlighted.scrollIntoView({ block: "center", behavior: "auto" });
        center();
        // Images above the target can acquire their intrinsic height after the
        // first frame. Follow that layout until the user starts navigating.
        resize = new ResizeObserver(center);
        resize.observe(editor.view.dom);
        editor.view.dom.addEventListener("wheel", stopFollowing, {
          passive: true,
        });
        editor.view.dom.addEventListener("pointerdown", stopFollowing, {
          passive: true,
        });
        highlighted.focus({ preventScroll: true });
        timer = window.setTimeout(() => this.setAttachmentJump(null), 2200);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(timer);
      resize?.disconnect();
      highlighted?.removeAttribute("data-attachment-jump");
      if (!editor.isDestroyed) {
        editor.view.dom.removeEventListener("wheel", stopFollowing);
        editor.view.dom.removeEventListener("pointerdown", stopFollowing);
      }
    };
  }
}
export function useAttachmentPresentation() {
  const [presentation] = useState(() => new AttachmentPresentation());
  useLayoutEffect(() => {
    presentation.mount();
    return () => presentation.dispose();
  }, [presentation]);
  const state = useSyncExternalStore(
    presentation.subscribe,
    presentation.snapshot,
    presentation.snapshot,
  );
  useLayoutEffect(
    () => () => state.imagePreview?.source.dispose(),
    [state.imagePreview],
  );
  useLayoutEffect(() => presentation.reconcilePreview());
  return { presentation, state };
}
