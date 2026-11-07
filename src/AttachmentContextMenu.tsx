import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { AttachmentMediaSource } from "./attachment-media";
import { saveAttachmentOriginal } from "./attachment-export";
import { formatFileSize } from "./data-management";
import { recordingDate } from "./recording-metadata";
import { Download, FileText, Play, Pause, Eye, Trash2 } from "lucide-react";

export type AttachmentMenuRequest = {
  editor: Editor;
  id?: string;
  kind: string;
  name: string;
  trigger: HTMLElement;
  point: { x: number; y: number };
  source?: AttachmentMediaSource;
  mime?: string;
  bytes?: number;
  recordedAt?: number;
  preview?: () => void;
  playback?: { playing: boolean; toggle: () => void | Promise<void> };
  remove?: () => void;
  temporary?: boolean;
  error?: string;
};
export type AttachmentMenuPermission = {
  allowed: boolean;
  writable: boolean;
  saved: boolean;
  reason?: string;
};
const Context = createContext<{
  open: (request: AttachmentMenuRequest) => void;
}>({ open: () => {} });
export const useAttachmentContextMenu = () => useContext(Context);
export function AttachmentMenuProvider({
  children,
  scope,
  permission,
  onError,
  onOverlay,
  topInset = 0,
}: {
  children: ReactNode;
  scope: string;
  permission: (request: AttachmentMenuRequest) => AttachmentMenuPermission;
  topInset?: number;
  onError: (error: unknown) => void;
  onOverlay: (active: boolean) => void;
}) {
  const [menu, setMenu] = useState<{
    request: AttachmentMenuRequest;
    scope: string;
  } | null>(null);
  const [info, setInfo] = useState<{
    request: AttachmentMenuRequest;
    scope: string;
  } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLElement>(null);
  const current = useRef({ scope, permission, onError });
  current.current = { scope, permission, onError };
  const valid = (value: { request: AttachmentMenuRequest; scope: string }) =>
    value.scope === current.current.scope &&
    value.request.trigger.isConnected &&
    current.current.permission(value.request).allowed;
  const close = (restore = false) => {
    const trigger = menu?.request.trigger;
    setMenu(null);
    if (
      restore &&
      trigger?.isConnected &&
      !trigger.closest("[hidden], [inert], .access-sync")
    )
      trigger.focus({ preventScroll: true });
  };
  const open = (request: AttachmentMenuRequest) => {
    setInfo(null);
    if (!current.current.permission(request).allowed) return;
    setMenu({ request, scope: current.current.scope });
  };
  useLayoutEffect(() => {
    setMenu(null);
    setInfo(null);
  }, [scope]);
  useLayoutEffect(() => {
    const temporary = (event: Event) =>
      open((event as CustomEvent<AttachmentMenuRequest>).detail);
    window.addEventListener("attachment-context-request", temporary);
    return () =>
      window.removeEventListener("attachment-context-request", temporary);
  }, []);
  useLayoutEffect(() => {
    if (!menu) return;
    const element = root.current;
    if (!element) return;
    const { x, y } = menu.request.point;
    element.style.left = `${Math.max(8, Math.min(x, innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(topInset + 8, Math.min(y, innerHeight - element.offsetHeight - 8))}px`;
    const buttons = () =>
      Array.from(
        element.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
    (buttons()[0] ?? element).focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (!element.contains(event.target as Node)) close(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key === "Tab") {
        close(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const all = buttons();
      if (!all.length) return;
      const index = all.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? all.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + all.length) %
              all.length;
      all[next].focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", outside);
    window.addEventListener("blur", outside);
    let live = true;
    const release = menu.request.source?.bindController(() => {
      if (live) setMenu(null);
    });
    const update = () => {
      if (!valid(menu)) setMenu(null);
    };
    menu.request.editor.on("transaction", update);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", outside);
      window.removeEventListener("blur", outside);
      menu.request.editor.off("transaction", update);
      live = false;
      release?.();
    };
  }, [menu]);
  useLayoutEffect(() => {
    if (!info) return;
    panel.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setInfo(null);
        if (info.request.trigger.isConnected)
          info.request.trigger.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", key, true);
    let live = true;
    const release = info.request.source?.bindController(() => {
      if (live) setInfo(null);
    });
    const update = () => {
      if (!valid(info)) setInfo(null);
    };
    info.request.editor.on("transaction", update);
    return () => {
      document.removeEventListener("keydown", key, true);
      live = false;
      release?.();
      info.request.editor.off("transaction", update);
    };
  }, [info]);
  const run = (
    action: (request: AttachmentMenuRequest) => void | Promise<void>,
    write = false,
    saved = false,
  ) => {
    if (!menu || !valid(menu)) {
      close();
      return;
    }
    const access = current.current.permission(menu.request);
    if ((write && !access.writable) || (saved && !access.saved)) {
      close();
      return;
    }
    const request = menu.request;
    close(true);
    void Promise.resolve()
      .then(() => {
        if (!valid(menu)) return;
        return action(request);
      })
      .catch((cause) => {
        if (valid(menu)) current.current.onError(cause);
      });
  };
  useLayoutEffect(() => {
    onOverlay(!!menu || !!info || saving !== null);
  }, [menu, info, saving, onOverlay]);
  const access = menu ? permission(menu.request) : null;
  const ready = !!menu?.request.source;
  const reason = menu?.request.temporary
    ? "请先完成并保存录音"
    : !access?.saved
      ? "附件尚未保存，或正在保存录音"
      : menu?.request.error ||
        (!ready ? "附件尚未读取，或当前无读取权限" : access?.reason);
  return (
    <Context.Provider value={{ open }}>
      {children}
      {menu &&
        createPortal(
          <div
            ref={element => {
              root.current = element;
              if (element) {
                element.style.left = `${Math.max(8, Math.min(menu.request.point.x, innerWidth - element.offsetWidth - 8))}px`;
                element.style.top = `${Math.max(topInset + 8, Math.min(menu.request.point.y, innerHeight - element.offsetHeight - 8))}px`;
              }
            }}
            className="popover attachment-context-menu"
            role="menu"
            aria-label="附件菜单"
            tabIndex={-1}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
            {menu.request.kind === "image" && (
              <button
                role="menuitem"
                className="menu-row"
                disabled={!ready || !menu.request.preview}
                onClick={() => run((r) => r.preview?.())}
              >
                <span>预览图片</span>
                <Eye size={17} />
              </button>
            )}
            {["audio", "video"].includes(menu.request.kind) && (
              <button
                role="menuitem"
                className="menu-row"
                disabled={
                  !ready || !menu.request.playback || !!menu.request.temporary
                }
                onClick={() => run((r) => r.playback?.toggle())}
              >
                <span>{menu.request.playback?.playing ? "暂停" : "播放"}</span>
                {menu.request.playback?.playing ? (
                  <Pause size={17} />
                ) : (
                  <Play size={17} />
                )}
              </button>
            )}
            <button
              role="menuitem"
              className="menu-row"
              disabled={!ready || !access?.saved || saving === menu.request.id}
              onClick={() =>
                run(
                  async (r) => {
                    if (!r.id) return;
                    setSaving(r.id);
                    try {
                      await saveAttachmentOriginal(r.id, r.name, () => valid(menu) && current.current.permission(r).saved);
                    } finally {
                      setSaving(null);
                    }
                  },
                  false,
                  true,
                )
              }
            >
              <span>
                {saving === menu.request.id ? "正在保存…" : "保存附件…"}
              </span>
              <Download size={17} />
            </button>
            <button
              role="menuitem"
              className="menu-row"
              disabled={!ready || !!menu.request.temporary}
              onClick={() =>
                run((r) =>
                  setInfo({ request: r, scope: current.current.scope }),
                )
              }
            >
              <span>显示信息</span>
              <FileText size={17} />
            </button>
            <div className="menu-divider" />
            <button
              role="menuitem"
              className="menu-row danger"
              disabled={
                !access?.writable ||
                !access.saved ||
                !menu.request.remove ||
                !!menu.request.temporary
              }
              onClick={() => run((r) => r.remove?.(), true, true)}
            >
              <span>从备忘录中移除</span>
              <Trash2 size={17} />
            </button>
            {reason && <p className="attachment-menu-reason">{reason}</p>}
          </div>,
          document.body,
        )}
      {info &&
        valid(info) &&
        createPortal(
          <section
            ref={panel}
            className="attachment-info"
            role="dialog"
            aria-label="附件信息"
          >
            <header>
              <strong>附件信息</strong>
              <button
                type="button"
                onClick={() => {
                  setInfo(null);
                  if (info.request.trigger.isConnected)
                    info.request.trigger.focus({ preventScroll: true });
                }}
              >
                关闭
              </button>
            </header>
            <dl>
              <dt>文件名</dt>
              <dd>{info.request.name}</dd>
              <dt>类型</dt>
              <dd>{info.request.mime}</dd>
              <dt>原始大小</dt>
              <dd>
                {formatFileSize(info.request.bytes ?? null)}
                {info.request.bytes !== undefined &&
                  `（${info.request.bytes.toLocaleString()} 字节）`}
              </dd>
              {info.request.recordedAt !== undefined && (
                <>
                  <dt>录音时间</dt>
                  <dd>{recordingDate(info.request.recordedAt)}</dd>
                </>
              )}
            </dl>
          </section>,
          document.body,
        )}
    </Context.Provider>
  );
}
