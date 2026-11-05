import { useState } from "react";
import {
  Check,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";
import { RecordingWaveform } from "./recording-waveform";
import { recordingTime } from "./recording-clock";
import type {
  RecordingAction,
  RecordingPresentation,
  RecordingViewState,
} from "./recording-coordinator";
import "./RecordingPanel.css";

/** A projection only: no microphone, media element, URLs or attachment bytes. */
export default function RecordingView({
  state,
  mobile = true,
  act,
  presentation = "float",
  onPresentation,
  switching = false,
}: {
  state: RecordingViewState;
  mobile?: boolean;
  act: (action: RecordingAction) => void;
  presentation?: RecordingPresentation;
  onPresentation?: (mode: RecordingPresentation) => void;
  switching?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const {
    phase: status,
    elapsed,
    position,
    notice,
    canToggle,
    previewPosition,
  } = state;
  const canFinish = status === "paused" || status === "retry";
  const closing = ["saving", "finalizing", "submitted"].includes(status);
  const previewAllowed = status === "paused" || status === "retry";
  const seekEnabled = previewAllowed && (state.canSeek || state.seeking);
  const primaryLabel =
    status === "idle"
      ? "开始录音"
      : status === "paused"
        ? "继续录音"
        : "暂停录音";
  const date = new Date(state.recordedAt ?? state.openedAt);
  const today = date.toDateString() === new Date(Date.now()).toDateString();
  const createdAt = `${today ? "今天" : date.toLocaleDateString("zh-CN")} ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <div
      className={`recording-backdrop ${mobile ? "recording-mobile" : "recording-desktop"}`}
    >
      <section
        className="recording-sheet"
        role="dialog"
        aria-modal={mobile || undefined}
        aria-label="新录音"
        data-recording-state={status}
      >
        {mobile && <div className="sheet-handle" />}
        <header>
          <button
            className="recording-cancel"
            aria-label="关闭录音"
            disabled={closing}
            onClick={() => act({ action: "close" })}
          >
            {mobile ? "关闭" : <X />}
          </button>
          <div>
            <strong>新录音</strong>
            <small>
              {createdAt} {recordingTime(elapsed, false)}
            </small>
          </div>
          {!mobile && onPresentation && (
            <div className="recording-presentation-menu">
              <button
                aria-label="录音显示选项"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
                disabled={switching}
              >
                <MoreHorizontal />
              </button>
              {menu && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onPresentation(presentation === "float" ? "dock" : "float");
                  }}
                >
                  {presentation === "float"
                    ? "在当前窗口展开"
                    : "在浮动窗口中打开"}
                </button>
              )}
            </div>
          )}
        </header>
        <RecordingWaveform
          samples={state.samples}
          position={position}
          duration={state.duration}
          enabled={seekEnabled}
          seek={(milliseconds) => act({ action: "seek", milliseconds })}
        />
        <div
          className="recording-time"
          aria-label={previewPosition ? "实际回放位置" : "活动录音时间"}
        >
          {recordingTime(position)}
        </div>
        <div
          className="recording-notice"
          role={state.hasError ? "alert" : "status"}
        >
          {notice}
        </div>
        <div className="recording-playback" aria-label="录音回放">
          <button
            aria-label="后退15秒"
            disabled={!previewAllowed || !state.canSeek}
            onClick={() => act({ action: "skip", seconds: -15 })}
          >
            <RotateCcw />
            <span>15</span>
          </button>
          <button
            aria-label={state.playing ? "暂停回放" : "播放录音"}
            disabled={
              !previewAllowed ||
              !state.canPlay ||
              state.playPending ||
              state.seeking
            }
            onClick={() => act({ action: "playback" })}
          >
            {state.playing ? (
              <Pause fill="currentColor" />
            ) : (
              <Play fill="currentColor" />
            )}
          </button>
          <button
            aria-label="前进15秒"
            disabled={!previewAllowed || !state.canSeek}
            onClick={() => act({ action: "skip", seconds: 15 })}
          >
            <RotateCw />
            <span>15</span>
          </button>
        </div>
        {state.canRetryPreview && (
          <button
            className="recording-playback-retry"
            onClick={() => act({ action: "preview-retry" })}
          >
            重试回放
          </button>
        )}
        <div className="recording-controls">
          <span className="recording-action-spacer" aria-hidden="true" />
          <button
            className={`recording-primary recording-primary-${status}`}
            aria-label={primaryLabel}
            disabled={!canToggle}
            onClick={() => act({ action: "toggle" })}
          >
            {status === "idle" || status === "requesting" ? (
              <span className="recording-red-core" />
            ) : status === "paused" ? (
              "继续"
            ) : (
              <Pause fill="currentColor" />
            )}
          </button>
          <button
            className="recording-done"
            aria-label={status === "retry" ? "重试保存录音" : "完成录音"}
            disabled={!canFinish}
            onClick={() => act({ action: "finish" })}
          >
            {mobile ? status === "retry" ? "重试" : "完成" : <Check />}
          </button>
        </div>
      </section>
    </div>
  );
}
