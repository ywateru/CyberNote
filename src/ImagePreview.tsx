import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AttachmentMediaSource } from "./attachment-media";
import { saveAttachmentOriginal } from "./attachment-export";
import { fileOperationError } from "./data-management";
import { desktopAttachmentAction, native } from "./bridge";
import {
  X,
  Maximize2,
  Minimize2,
  Info,
  Share,
  ExternalLink,
  Download,
} from "lucide-react";
import "./ImagePreview.css";
export type ImagePreviewRequest = {
  id: string;
  source: AttachmentMediaSource;
  name: string;
  mime: string;
  bytes: number;
  trigger: HTMLButtonElement;
  owner?: string;
  authority?: string;
  session?: string;
};
export type ImagePreviewIntent = Omit<ImagePreviewRequest, "source"> & {
  source?: AttachmentMediaSource;
};
export const ImagePreviewContext = createContext<{
  open: (request: ImagePreviewIntent) => void;
  closeSource: (source: AttachmentMediaSource) => void;
}>({ open: () => {}, closeSource: () => {} });
export const useImagePreview = () => useContext(ImagePreviewContext);
export function ImagePreview({
  request,
  onClose,
}: {
  request: ImagePreviewRequest;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null),
    close = useRef<HTMLButtonElement>(null),
    live = useRef(false),
    running = useRef(false);
  const [position, setPosition] = useState(() => ({
    x: Math.max(12, innerWidth * 0.3),
    y: Math.max(100, innerHeight * 0.13),
  }));
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [info, setInfo] = useState(false),
    [expanded, setExpanded] = useState(false),
    [size, setSize] = useState<{ width: number; height: number } | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [imageError, setImageError] = useState("");
  useLayoutEffect(() => {
    live.current = true;
    const surface = root.current!;
    close.current?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !live.current ||
        !root.current?.isConnected ||
        root.current.hidden ||
        root.current.getClientRects().length === 0 ||
        !root.current.contains(event.target as Node)
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", keyboard, true);
    const release = request.source.bindController(() => {
      if (!live.current) return;
      live.current = false;
      if (root.current) {
        root.current.hidden = true;
        root.current.querySelector("img")?.removeAttribute("src");
      }
      onClose();
    });
    return () => {
      live.current = false;
      document.removeEventListener("keydown", keyboard, true);
      release();
      if (
        surface.contains(document.activeElement) &&
        request.trigger.isConnected &&
        request.trigger.offsetParent !== null &&
        !request.trigger.closest(".access-sync")
      )
        request.trigger.focus({ preventScroll: true });
    };
  }, [request]);
  const clamp = (x: number, y: number) => {
    const rect = root.current?.getBoundingClientRect();
    const top =
      parseFloat(
        getComputedStyle(root.current!.closest(".app")!).getPropertyValue(
          "--native-top",
        ),
      ) || 0;
    return {
      x: Math.max(8, Math.min(x, innerWidth - (rect?.width ?? 0) - 8)),
      y: Math.max(top + 8, Math.min(y, innerHeight - (rect?.height ?? 0) - 8)),
    };
  };
  useLayoutEffect(() => {
    const resize = () => setPosition((value) => clamp(value.x, value.y));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [expanded]);
  const save = async () => {
    if (running.current || !live.current) return;
    running.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      if (
        (await saveAttachmentOriginal(
          request.id,
          request.name,
          () => live.current,
        )) &&
        live.current
      )
        setNotice("图片已保存");
    } catch (cause) {
      if (live.current) setError(fileOperationError(cause));
    } finally {
      running.current = false;
      if (live.current) {
        setBusy(false);
        if (document.activeElement === document.body)
          close.current?.focus({ preventScroll: true });
      }
    }
  };
  const system = async (action: "open" | "share") => {
    if (!live.current || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await desktopAttachmentAction(request.id, action);
    } catch (cause) {
      if (live.current) setError(fileOperationError(cause));
    } finally {
      running.current = false;
      if (live.current) {
        setBusy(false);
        if (document.activeElement === document.body)
          close.current?.focus({ preventScroll: true });
      }
    }
  };
  return (
    <section
      ref={root}
      className={`image-preview ${expanded ? "expanded" : ""}`}
      style={expanded ? undefined : { left: position.x, top: position.y }}
      data-preview-id={request.id}
      role="dialog"
      aria-modal="false"
      aria-label="图片预览"
    >
      <div className={`image-preview-window ${expanded ? "expanded" : ""}`}>
        <header
          onDoubleClick={(event) => {
            if (!(event.target as HTMLElement).closest("button"))
              setExpanded((value) => !value);
          }}
          onPointerDown={(event) => {
            if (
              expanded ||
              event.button !== 0 ||
              (event.target as HTMLElement).closest("button")
            )
              return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: position.x,
              top: position.y,
            };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (start?.id === event.pointerId)
              setPosition(
                clamp(
                  start.left + event.clientX - start.x,
                  start.top + event.clientY - start.y,
                ),
              );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <button
            ref={close}
            type="button"
            className="preview-close"
            aria-label="关闭图片预览"
            onClick={onClose}
          >
            <X size={14} />
          </button>
          <button
            type="button"
            className="preview-expand"
            aria-label={expanded ? "还原预览窗口" : "放大预览窗口"}
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <strong title={request.name}>{request.name}</strong>
          <div className="image-preview-actions">
            <button
              type="button"
              aria-label="图片信息"
              aria-expanded={info}
              onClick={() => setInfo((v) => !v)}
            >
              <Info size={19} />
            </button>
            {native && /Mac/.test(navigator.platform) && (
              <button
                type="button"
                aria-label="共享附件"
                disabled={busy}
                onClick={() => void system("share")}
              >
                <Share size={20} />
              </button>
            )}
            <button
              className="save-image"
              type="button"
              disabled={busy}
              aria-label="导出原图…"
              title="导出原图…"
              onClick={() => void save()}
            >
              <Download size={19} />
            </button>
            {native && /Mac/.test(navigator.platform) && (
              <button
                type="button"
                className="preview-open-system"
                disabled={busy}
                onClick={() => void system("open")}
              >
                <ExternalLink size={16} />
                <span>通过默认应用打开</span>
              </button>
            )}
          </div>
        </header>
        {info && (
          <dl className="image-preview-info">
            <div>
              <dt>文件名</dt>
              <dd>{request.name}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{request.mime}</dd>
            </div>
            <div>
              <dt>原始大小</dt>
              <dd>{request.bytes.toLocaleString()} 字节</dd>
            </div>
            <div>
              <dt>尺寸</dt>
              <dd>
                {size
                  ? `${size.width} × ${size.height} 像素`
                  : imageError
                    ? "无法读取"
                    : "正在读取…"}
              </dd>
            </div>
          </dl>
        )}
        {(notice || error || imageError) && (
          <p
            className="image-export-status"
            role={error || imageError ? "alert" : "status"}
          >
            {error || imageError || notice}
          </p>
        )}
        <figure className={request.mime === "image/svg+xml" ? "vector" : ""}>
          <img
            src={request.source.src}
            alt={request.name}
            draggable={false}
            onError={() => setImageError("无法解码图片，原始文件仍可导出。")}
            onLoad={(event) =>
              setSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
        </figure>
      </div>
    </section>
  );
}
