import { useEffect, useId, useRef, useState } from "react";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type JSONContent,
  type NodeViewProps,
} from "@tiptap/react";
import { createEditorExtensions } from "./editor-schema";
import { editorSaveSnapshot } from "./editor-save-snapshot";
export { AttachmentNode, DrawingNode } from "./editor-schema";
import {
  Play,
  Pause,
  FileText,
  Download,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { native, readAttachment } from "./bridge";
import type { Note, DrawingStroke } from "./types";
import {
  createAudioPlayback,
  formatAudioTime,
  initialAudioPlaybackState,
} from "./audio-playback";

function MediaView({ node }: NodeViewProps) {
  const { id, name, kind } = node.attrs;
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    readAttachment(id)
      .then((x) => {
        if (live) setSrc(`data:${x.mime};base64,${x.data}`);
      })
      .catch((e) => {
        if (live) setError(e.message || String(e));
      });
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <NodeViewWrapper
      className={`attachment-node ${kind}`}
      contentEditable={false}
    >
      {error ? (
        <span className="inline-error">{error}</span>
      ) : kind === "image" ? (
        <img src={src} alt={name} draggable={false} />
      ) : kind === "audio" ? (
        <AudioPlayer src={src} name={name} />
      ) : kind === "video" ? (
        <video src={src} controls />
      ) : (
        <a className="file-card" href={src} download={name}>
          <FileText size={30} />
          <span>
            <strong>{name}</strong>
            <small>本地附件</small>
          </span>
          <Download size={20} />
        </a>
      )}
    </NodeViewWrapper>
  );
}
export function AudioPlayer({ src, name }: { src: string; name: string }) {
  // Different attachments get different media elements and controller lifetimes.
  // In-flight events or play promises from the previous source cannot affect it.
  return <AudioPlayerSession key={src} src={src} name={name} />;
}
function AudioPlayerSession({ src, name }: { src: string; name: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<ReturnType<typeof createAudioPlayback> | null>(
    null,
  );
  const [playback, setPlayback] = useState(initialAudioPlaybackState);
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const toggleExpanded = () => setExpanded((value) => !value);
  useEffect(() => {
    if (!audio.current) return;
    const player = createAudioPlayback(audio.current, src, setPlayback);
    controller.current = player;
    return () => {
      controller.current = null;
      player.dispose();
    };
  }, [src]);
  const { playing, duration, time } = playback;
  const error =
    playback.mediaError || playback.playError || playback.durationError;
  return (
    <div
      className="audio-card"
      onMouseDownCapture={(event) => {
        // Keep taps on non-editable audio UI from placing the editor caret.
        // The native range must retain its own pointer/focus/drag behavior.
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <audio ref={audio} />
      <div
        className="audio-summary"
        onDoubleClick={(event) => {
          if (!(event.target as Element).closest("button, input"))
            toggleExpanded();
          event.stopPropagation();
        }}
      >
        <button
          type="button"
          className="audio-title-toggle"
          aria-label={`${expanded ? "收起" : "显示"}录音进度：${name}`}
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={(event) => {
            // A native double click also emits two click events. Treat the
            // first click/keyboard activation as one toggle, not three.
            if (event.detail < 2) toggleExpanded();
          }}
        >
          <strong>{name.replace(/\.[^.]+$/, "")}</strong>
          <small>录音 · {formatAudioTime(duration)}</small>
        </button>
        <button
          type="button"
          className="audio-play-toggle"
          disabled={!src || !!playback.mediaError}
          onClick={() => controller.current?.toggle()}
        >
          {playing ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
          {playing ? "暂停" : "播放"}
        </button>
        <button
          type="button"
          className="audio-expand"
          aria-label={expanded ? "收起录音进度" : "显示录音进度"}
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={() => toggleExpanded()}
        >
          ⌄
        </button>
      </div>
      {expanded && (
        <div className="audio-detail" id={detailId}>
          <button
            type="button"
            aria-label="后退15秒"
            disabled={duration === null || !!playback.mediaError}
            onClick={() => controller.current?.skip(-15)}
          >
            <RotateCcw size={18} />
            <small>15</small>
          </button>
          <input
            aria-label="播放进度"
            aria-valuetext={formatAudioTime(time)}
            type="range"
            min={0}
            max={duration ?? 0}
            step="0.05"
            value={Math.min(time, duration ?? 0)}
            disabled={duration === null || !!playback.mediaError}
            onChange={(e) => controller.current?.seek(+e.target.value)}
          />
          <span>{formatAudioTime(time)}</span>
          <button
            type="button"
            aria-label="前进15秒"
            disabled={duration === null || !!playback.mediaError}
            onClick={() => controller.current?.skip(15)}
          >
            <RotateCw size={18} />
            <small>15</small>
          </button>
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}{" "}
          <button
            type="button"
            aria-label="重试录音"
            onClick={() => controller.current?.retry()}
          >
            重试
          </button>
        </div>
      )}
    </div>
  );
}
function DrawingView({ node, getPos, editor }: NodeViewProps) {
  const strokes: DrawingStroke[] = node.attrs.strokes || [];
  return (
    <NodeViewWrapper className="drawing-node" contentEditable={false}>
      <svg
        viewBox="0 0 600 300"
        role="img"
        aria-label="手绘笔迹"
        onDoubleClick={() =>
          window.dispatchEvent(
            new CustomEvent("edit-drawing", {
              detail: { strokes, pos: getPos(), editor },
            }),
          )
        }
      >
        {strokes.map((s, i) => (
          <polyline
            key={i}
            points={s.points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={s.tool === "eraser" ? "var(--paper)" : s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={s.tool === "marker" ? 0.35 : 1}
          />
        ))}
      </svg>
    </NodeViewWrapper>
  );
}
export default function NoteEditor({
  note,
  onChange,
  onReady,
  onFocus,
}: {
  note: Note;
  onChange: (id: string, doc: JSONContent) => void;
  onReady: (e: Editor | null) => void;
  onFocus: (focus: boolean) => void;
}) {
  const untouched = useRef(note.revision === 0);
  const ref = useRef(onChange);
  ref.current = onChange;
  const editor = useEditor({
    extensions: createEditorExtensions(
      {
        attachment: ReactNodeViewRenderer(MediaView),
        drawing: ReactNodeViewRenderer(DrawingView),
      },
      { allowTags: !note.locked },
    ),
    content: note.document,
    editorProps: {
      // Fixed PM 1.42.9 opt-in: trusted Android preedit survives the idle
      // watchdog; native end/blur/non-composition input still release it.
      androidPreserveComposition: native && /Android/.test(navigator.userAgent),
      attributes: {
        "aria-label": "备忘录正文",
        spellcheck: "true",
        "data-paper-style": note.paperStyle,
      },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        const doc = view.state.doc;
        // The first explicit plain-text paste into an untouched empty note is
        // body text. Rich HTML and existing documents keep normal paste rules.
        if (
          !untouched.current ||
          !clipboard ||
          clipboard.getData("text/html") ||
          !Array.from(clipboard.types).includes("text/plain") ||
          doc.childCount !== 1 ||
          !["heading", "paragraph"].includes(doc.firstChild!.type.name) ||
          doc.firstChild!.content.size
        )
          return false;
        const text = clipboard.getData("text/plain").replace(/\r\n?/g, "\n");
        if (!text) return false;
        const nodes = text
          .split("\n")
          .map((line) =>
            view.state.schema.nodes.paragraph.create(
              null,
              line ? view.state.schema.text(line) : undefined,
            ),
          );
        untouched.current = false;
        view.dispatch(
          view.state.tr
            .replaceWith(0, doc.content.size, nodes)
            .scrollIntoView(),
        );
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") {
          (document.activeElement as HTMLElement)?.blur();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      untouched.current = false;
      ref.current(note.id, editorSaveSnapshot(e.getJSON()));
    },
    onFocus: () => onFocus(true),
    onBlur: () => onFocus(false),
  });
  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);
  useEffect(() => {
    if (editor)
      editor.setOptions({
        editorProps: {
          ...editor.options.editorProps,
          attributes: {
            "aria-label": "备忘录正文",
            spellcheck: "true",
            "data-paper-style": note.paperStyle,
          },
        },
      });
  }, [editor, note.paperStyle]);
  return (
    <div className={`note-document paper-context-${note.paperStyle}`}>
      <EditorContent editor={editor} />
    </div>
  );
}
