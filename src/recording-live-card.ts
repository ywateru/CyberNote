import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey, type SelectionBookmark } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { recordingDate } from "./recording-metadata";
import { recordingTime } from "./recording-clock";
import type { RecordingViewState } from "./recording-coordinator";

export type RecordingCardTarget = {
  editor: Editor;
  bookmark: SelectionBookmark;
};
export type RecordingCardState = {
  phase: RecordingViewState["phase"];
  hasError: boolean;
  recordedAt: number;
  elapsed: number;
  paused: boolean;
  canToggle: boolean;
  canFinish: boolean;
  notice: string;
  toggle: () => void;
  finish: () => void;
};

// A view-only widget in the captured editor. Registration, DOM updates and
// removal do not dispatch transactions, create schema nodes or touch history.
export function mountRecordingCard({ editor, bookmark }: RecordingCardTarget) {
  if (editor.isDestroyed) throw Error("原录音编辑器已关闭");
  const key = new PluginKey<number>("liveRecording");
  const position = bookmark.resolve(editor.state.doc).from;
  const anchor = document.createElement("span");
  anchor.className = "live-recording-anchor";
  anchor.contentEditable = "false";
  const card = document.createElement("span");
  card.className = "live-recording-card";
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", "进行中的录音");
  card.dataset.recordingLiveCard = "true";
  const metadata = document.createElement("span");
  metadata.className = "live-recording-metadata";
  const title = document.createElement("strong");
  title.textContent = "新录音";
  const date = document.createElement("small");
  const duration = document.createElement("small");
  const activity = document.createElement("small");
  activity.className = "live-recording-status";
  const dot = document.createElement("span");
  dot.className = "recording-activity-dot";
  dot.setAttribute("aria-hidden", "true");
  const activityText = document.createElement("span");
  activity.append(dot, activityText);
  metadata.append(title, activity, date, duration);
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "live-recording-stop";
  stop.setAttribute("aria-label", "完成录音");
  const square = document.createElement("span");
  square.setAttribute("aria-hidden", "true");
  stop.append(square);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "live-recording-toggle";
  card.append(metadata, stop, toggle);
  anchor.append(card);
  anchor.addEventListener("mousedown", (event) => event.preventDefault());
  let persistedId: string | undefined;
  const plugin = new Plugin<number>({
    key,
    state: {
      init: () => position,
      apply: (transaction, value) => transaction.mapping.map(value, 1),
    },
    props: {
      decorations: (state) => {
        const hidden: Decoration[] = [];
        if (persistedId)
          state.doc.descendants((node, position) => {
            if (
              node.type.name === "attachment" &&
              node.attrs.id === persistedId
            )
              hidden.push(
                Decoration.node(position, position + node.nodeSize, {
                  style: "display:none",
                }),
              );
          });
        return DecorationSet.create(state.doc, [
          ...hidden,
          Decoration.widget(key.getState(state) ?? position, anchor, {
            key: "liveRecordingCard",
            side: 1,
            ignoreSelection: true,
            stopEvent: () => true,
          }),
        ]);
      },
    },
  });
  editor.registerPlugin(plugin);
  let live = true;
  return {
    persisted(id: string) {
      persistedId = id;
      // View-only refresh; no doc transaction/history or persisted attributes.
      if (!editor.isDestroyed) editor.view.updateState(editor.state);
    },
    update(state: RecordingCardState) {
      if (!live || editor.isDestroyed) return;
      date.textContent = recordingDate(state.recordedAt);
      duration.textContent = recordingTime(state.elapsed, false);
      card.title = state.notice;
      const active = state.phase === "recording" && !state.hasError;
      card.dataset.recordingPhase = state.hasError ? "error" : state.phase;
      activity.classList.toggle("recording-active", active);
      activityText.textContent = active
        ? "录音中"
        : state.hasError || state.phase === "retry" || state.phase === "error"
          ? "录音保存待重试"
          : state.phase === "paused"
            ? "已暂停"
            : "正在保存录音…";
      toggle.textContent = state.paused ? "继续" : "暂停";
      toggle.setAttribute("aria-label", state.paused ? "继续录音" : "暂停录音");
      toggle.disabled = !state.canToggle;
      stop.disabled = !state.canFinish;
      toggle.onclick = state.toggle;
      stop.onclick = state.finish;
    },
    dispose() {
      if (!live) return;
      live = false;
      stop.onclick = null;
      toggle.onclick = null;
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
      anchor.remove();
    },
  };
}
