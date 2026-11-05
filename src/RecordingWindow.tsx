import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import RecordingPanel, { type RecordingPanelHandle } from "./RecordingPanel";
import { fileBase64 } from "./bridge";
import {
  sameRecording,
  validRecordingAction,
  type RecordingAction,
  type RecordingPresentation,
  type RecordingIdentity,
  type RecordingTransfer,
  type RecordingViewState,
} from "./recording-coordinator";
import {
  recordingFinish,
  recordingListen,
  recordingSend,
} from "./recording-window-transport";
import type { RecordingResult } from "./recording-metadata";

const text = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Dedicated renderer. It mounts neither App nor a document/native toolbar.
 * Blur, visibility and minimization have no capture lifecycle handlers. */
export default function RecordingWindow() {
  const [identity, setIdentity] = useState<RecordingIdentity | null>(null);
  const [error, setError] = useState("");
  const handle = useRef<RecordingPanelHandle | null>(null);
  const pendingAction = useRef<RecordingAction[]>([]);
  const [switching, setSwitching] = useState(false);
  const presentationRequest = useRef(0);
  const presentationSequence = useRef(0);
  const file = useRef<RecordingResult | null>(null);
  const transferred = useRef(false);
  const encoded = useRef<RecordingTransfer | null>(null);
  const pending = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const exiting = useRef(false);
  const ready = useRef(false);

  useEffect(() => {
    let live = true;
    let unlisten: (() => void) | undefined;
    let unclose: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = async () => {
      const query = new URLSearchParams(location.search);
      const ids = {
        sessionId: query.get("recording"),
        operationId: query.get("operation"),
      };
      const context = await invoke<RecordingIdentity>(
        "recording_window_context",
        ids,
      );
      if (!live) return;
      unlisten = await recordingListen((event) => {
        if (!live || !sameRecording(context, event)) return;
        if (event.from === "host" && event.message.kind === "owner-lost") {
          setError("原笔记窗口意外关闭。录音仍保留在此窗口，请勿退出应用。");
          pending.current?.reject(Error("原笔记窗口已失去连接，音频仍保留"));
        }
        if (event.from !== "owner") return;
        const message = event.message;
        if (message.kind === "action") {
          if (!validRecordingAction(message)) {
            setError("录音操作无效，原音频仍保留");
            return;
          }
          if (!handle.current) {
            if (pendingAction.current.length < 32)
              pendingAction.current.push(message);
            else setError("录音操作过多，请等待界面连接");
          } else {
            try {
              handle.current.dispatch(message);
            } catch (error) {
              setError(text(error));
            }
          }
        } else if (message.kind === "presentation-result") {
          if (
            message.request !== presentationRequest.current ||
            !Number.isSafeInteger(message.sequence) ||
            message.sequence <= presentationSequence.current
          )
            return;
          presentationSequence.current = message.sequence;
          setSwitching(false);
          setError(message.error ?? "");
        } else if (message.kind === "owner-status") {
          ready.current = true;
          // Only the original owner can confirm it reconstructed this File.
          transferred.current ||= message.fileAccepted;
          if (message.status === "saved") {
            if (pending.current) pending.current.resolve();
            else if (file.current)
              void destroy(context).catch((e) => setError(text(e)));
          } else if (message.status === "failed") {
            const messageText = message.error || "录音尚未保存，音频仍保留";
            if (pending.current) pending.current.reject(Error(messageText));
            else setError(messageText);
          } else if (message.status === "discarded") {
            void destroy(context).catch((e) => setError(text(e)));
          } else if (
            message.status !== "ready" &&
            message.status !== "saving"
          ) {
            setError("录音保存状态无效，原音频仍保留");
          }
        } else setError("未知录音消息，原音频仍保留");
      });
      if (!live) {
        unlisten();
        return;
      }
      unclose = await getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault();
        if (!exiting.current) handle.current?.close();
      });
      if (!live) {
        unclose();
        return;
      }
      await recordingSend(context, { kind: "hello" });
      setIdentity(context);
      timer = setInterval(() => {
        void recordingSend(context, { kind: "hello" }).catch((e) =>
          setError(text(e)),
        );
      }, 2000);
    };
    void start().catch((e) => {
      if (live) setError(text(e));
    });
    return () => {
      live = false;
      unlisten?.();
      unclose?.();
      if (timer) clearInterval(timer);
      const waiting = pending.current;
      if (waiting) {
        clearTimeout(waiting.timer);
        waiting.reject(Error("录音窗口已卸载"));
      }
    };
  }, []);
  const destroy = async (context: RecordingIdentity) => {
    if (exiting.current) return;
    await recordingFinish(context);
    exiting.current = true;
    try {
      await getCurrentWindow().destroy();
    } catch (e) {
      exiting.current = false;
      throw e;
    }
  };
  const onHandle = useCallback((value: RecordingPanelHandle | null) => {
    handle.current = value;
    if (value)
      for (const action of pendingAction.current.splice(0)) {
        try {
          value.dispatch(action);
        } catch (error) {
          setError(text(error));
        }
      }
  }, []);
  const onState = useCallback(
    (state: RecordingViewState) => {
      if (identity)
        void recordingSend(identity, { kind: "state", state }).catch((e) =>
          setError(text(e)),
        );
    },
    [identity],
  );
  const onPresentation = (mode: RecordingPresentation) => {
    if (!identity) return;
    const request = ++presentationRequest.current;
    setSwitching(true);
    setError("");
    void recordingSend(identity, { kind: "presentation", mode, request }).catch(
      (error) => {
        if (request === presentationRequest.current) {
          setSwitching(false);
          setError(text(error));
        }
      },
    );
  };
  const onDone = async (result: RecordingResult) => {
    if (!identity || !ready.current)
      throw Error("原笔记窗口尚未确认连接，音频仍保留");
    if (
      file.current &&
      (file.current.file !== result.file ||
        file.current.recordedAt !== result.recordedAt)
    )
      throw Error("录音文件身份已改变，请保留原音频");
    file.current = result;
    if (!transferred.current && !encoded.current)
      encoded.current = {
        name: result.file.name,
        mime: result.file.type,
        size: result.file.size,
        lastModified: result.file.lastModified,
        recordedAt: result.recordedAt,
        data: await fileBase64(result.file),
      };
    const transfer = transferred.current ? undefined : encoded.current!;
    const response = new Promise<void>((resolve, reject) => {
      pending.current = {
        resolve,
        reject,
        timer: setTimeout(
          () => reject(Error("原笔记保存尚未确认，音频仍保留；可重试保存")),
          30000,
        ),
      };
    });
    void response.catch(() => {});
    // Cache the encoding once; a failed/uncertain relay may resend those same
    // bytes until the owner confirms receipt. Accepted Files are never resent.
    try {
      await recordingSend(identity, { kind: "submit", transfer });
      await response;
      await destroy(identity);
    } finally {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      // If relay itself failed, prevent an unhandled timeout rejection.
      void response.catch(() => {});
    }
  };
  return (
    <div className="recording-window-host desktop">
      {error && (
        <div className="recording-window-error" role="alert">
          {error}
        </div>
      )}
      {identity ? (
        <>
          <RecordingPanel
            mobile={false}
            onHandle={onHandle}
            onState={onState}
            onPresentation={onPresentation}
            switching={switching}
            onCancel={() => {
              void recordingSend(identity, { kind: "cancel" }).catch((e) =>
                setError(text(e)),
              );
            }}
            onDone={onDone}
          />
        </>
      ) : (
        <p className="recording-window-connecting" role="status">
          正在连接原备忘录…
        </p>
      )}
    </div>
  );
}
