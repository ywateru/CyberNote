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
export const ImagePreviewContext = createContext<{
  open: (request: ImagePreviewRequest) => void;
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
  const [info, setInfo] = useState(false),
    [size, setSize] = useState<{ width: number; height: number } | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [imageError, setImageError] = useState("");
  useLayoutEffect(() => {
    live.current = true;
    close.current?.focus({ preventScroll: true });
    // Export disables its focused button; native dialogs may also return focus
    // to body. Keep the active preview keyboard boundary at document capture.
    const keyboard = (event: KeyboardEvent) => {
      const element = root.current;
      if (
        !live.current ||
        !element?.isConnected ||
        element.hidden ||
        element.getClientRects().length === 0 ||
        getComputedStyle(element).visibility === "hidden"
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        element.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
      const first = buttons[0],
        last = buttons.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        event.stopPropagation();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        event.stopPropagation();
        first?.focus();
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
        request.trigger.isConnected &&
        request.trigger.offsetParent !== null &&
        !request.trigger.closest(".access-sync")
      )
        request.trigger.focus({ preventScroll: true });
    };
  }, [request]);
  const save = async () => {
    if (running.current || !live.current) return;
    running.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      if (
        (await saveAttachmentOriginal(request.id, request.name)) &&
        live.current
      )
        setNotice("图片已保存");
    } catch (cause) {
      if (live.current) setError(fileOperationError(cause));
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  };
  return (
    <section
      ref={root}
      className="image-preview"
      data-preview-id={request.id}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      <header>
        <strong title={request.name}>{request.name}</strong>
        <div className="image-preview-actions">
          <button
            type="button"
            aria-label="图片信息"
            aria-expanded={info}
            onClick={() => setInfo((v) => !v)}
          >
            信息
          </button>
          <button
            className="save-image"
            type="button"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "正在导出…" : "导出原图…"}
          </button>
          <button
            ref={close}
            type="button"
            aria-label="关闭图片预览"
            onClick={onClose}
          >
            关闭
          </button>
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
      <figure>
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
    </section>
  );
}
