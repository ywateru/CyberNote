import { useEffect, useRef, useState } from "react";
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
export { AttachmentNode, DrawingNode } from "./editor-schema";
import {
  Play,
  Pause,
  FileText,
  Download,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { readAttachment } from "./bridge";
import type { Note, DrawingStroke } from "./types";

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
      .catch((e) => setError(e.message || String(e)));
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
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const fmt = (s: number) =>
    Number.isFinite(s)
      ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
      : "0:00";
  return (
    <div className="audio-card">
      <audio
        ref={audio}
        src={src}
        onLoadedMetadata={() => setDuration(audio.current?.duration || 0)}
        onTimeUpdate={() => setTime(audio.current?.currentTime || 0)}
        onEnded={() => setPlaying(false)}
      />
      <div
        className="audio-summary"
        onDoubleClick={() => setExpanded(!expanded)}
      >
        <span>
          <strong>{name.replace(/\.[^.]+$/, "")}</strong>
          <small>录音 · {fmt(duration)}</small>
        </span>
        <button
          onClick={() => {
            const a = audio.current;
            if (!a) return;
            if (a.paused)
              a.play()
                .then(() => setPlaying(true))
                .catch(() => {});
            else {
              a.pause();
              setPlaying(false);
            }
          }}
        >
          {playing ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
          {playing ? "暂停" : "播放"}
        </button>
        <button
          className="audio-expand"
          aria-label="显示录音进度"
          onClick={() => setExpanded(!expanded)}
        >
          ⌄
        </button>
      </div>
      {expanded && (
        <div className="audio-detail">
          <button
            aria-label="后退15秒"
            onClick={() => {
              if (audio.current)
                audio.current.currentTime = Math.max(0, time - 15);
            }}
          >
            <RotateCcw size={18} />
            <small>15</small>
          </button>
          <input
            aria-label="播放进度"
            type="range"
            min={0}
            max={Number.isFinite(duration) ? duration : 0}
            step="0.05"
            value={time}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = +e.target.value;
            }}
          />
          <span>{fmt(time)}</span>
          <button
            aria-label="前进15秒"
            onClick={() => {
              if (audio.current)
                audio.current.currentTime = Math.min(duration, time + 15);
            }}
          >
            <RotateCw size={18} />
            <small>15</small>
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
    extensions: createEditorExtensions({
      attachment: ReactNodeViewRenderer(MediaView),
      drawing: ReactNodeViewRenderer(DrawingView),
    }),
    content: note.document,
    editorProps: {
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
      ref.current(note.id, e.getJSON());
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
