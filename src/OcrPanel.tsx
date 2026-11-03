import { useEffect, useRef } from "react";
import type { OcrState } from "./ocr-host";
import "./OcrPanel.css";

// The reference recording does not show this confirmation page. This is a local
// engineering UI over actual OCR text, not an original-Notes pixel claim.
export default function OcrPanel({
  state,
  android,
  inserted,
  onImage,
  onCamera,
  onFile,
  onConfirm,
  onCancel,
}: {
  state: OcrState;
  android: boolean;
  inserted: boolean;
  onImage(): void;
  onCamera(): void;
  onFile(file: File): void;
  onConfirm(): void;
  onCancel(): void;
}) {
  const input = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const busy = ["processing", "confirming", "cancelling"].includes(state.phase);
  const saved = state.phase === "saved" || state.phase === "cleanup-pending";
  const canConfirm =
    state.phase === "recognized" ||
    (state.phase === "failed" && inserted) ||
    state.phase === "cleanup-pending";
  return (
    <div
      className="ocr-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
        if (e.key === "Tab") {
          const targets = [
            ...e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [tabindex="0"]',
            ),
          ];
          const first = targets[0],
            last = targets.at(-1);
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              !targets.includes(document.activeElement as HTMLElement))
          ) {
            e.preventDefault();
            last?.focus();
          } else if (
            !e.shiftKey &&
            (document.activeElement === last ||
              !targets.includes(document.activeElement as HTMLElement))
          ) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        className="ocr-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-heading"
        data-ocr-phase={state.phase}
      >
        <h2 id="ocr-heading" tabIndex={-1} ref={heading}>
          扫描文本
        </h2>
        <p className="ocr-description">
          在此设备识别图片文字，确认后插入原备忘录。
        </p>
        {state.phase === "choose" && (
          <div className="ocr-sources">
            <button
              onClick={() => (android ? onImage() : input.current?.click())}
            >
              从图片识别文本…
            </button>
            {android && <button onClick={onCamera}>拍摄文字</button>}
          </div>
        )}
        <input
          ref={input}
          className="hidden-input"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) onFile(file);
          }}
        />
        {state.phase === "processing" && <p role="status">正在识别文字…</p>}
        {state.phase === "empty" && (
          <p role="status">未识别到文字。原备忘录没有更改。</p>
        )}
        {state.phase === "cancelling" && (
          <p role="status">正在取消，请在已打开的相机或图片选择页完成返回。</p>
        )}
        {state.phase === "confirming" && <p role="status">正在保存识别文字…</p>}
        {saved && (
          <p role="status">
            文字已保存。
            {state.phase === "cleanup-pending"
              ? "临时识别资料尚待清理，请重试清理。"
              : "正在清理临时识别资料…"}
          </p>
        )}
        {state.error && (
          <p className="ocr-error" role="alert">
            {state.error}
          </p>
        )}
        {state.text && (
          <pre className="ocr-text" aria-label="识别文字预览" tabIndex={0}>
            {state.text}
          </pre>
        )}
        <div className="ocr-actions">
          <button disabled={state.phase === "cancelling"} onClick={onCancel}>
            {saved ? "关闭" : "取消"}
          </button>
          <button disabled={!canConfirm || busy} onClick={onConfirm}>
            {saved ? "重试清理" : inserted ? "重试保存" : "插入"}
          </button>
        </div>
      </section>
    </div>
  );
}
