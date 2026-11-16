import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type JSONContent,
  type NodeViewProps,
} from "@tiptap/react";
import { MenuSurface, MenuItem } from "./Menu";
import { copyDrawing, pasteDrawing, exportDrawing, drawingBounds } from "./drawing-transfer";
import { accessGate } from "./bridge";
import AudioWaveform from "./AudioWaveform";
import { useMobileInteraction } from "./platform/interaction";
import VideoAttachment from "./VideoAttachment";
import TableControls from "./TableControls";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection } from "@tiptap/pm/state";
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
  Copy, ClipboardPaste, Scissors, PenTool, Trash2,
} from "lucide-react";
import { desktopAttachmentAction, native } from "./bridge";
import { useAttachmentContextMenu } from "./AttachmentContextMenu";
import { useImagePreview } from "./ImagePreview";
import { saveAttachmentOriginal } from "./attachment-export";
import { copyAttachmentFile, useAttachmentTransfer } from "./attachment-clipboard";
import { useAttachmentMedia, useAttachmentMetadata, useMediaVisibility } from "./use-attachment-media";
import type { AttachmentMediaSource } from "./attachment-media";
import type { Note, DrawingStroke } from "./types";
import { compactAudioDuration, recordingDate } from "./recording-metadata";
import {
  createAudioPlayback,
  formatAudioTime,
  initialAudioPlaybackState,
} from "./audio-playback";

function MediaView({ node, editor, getPos, selected }: NodeViewProps) {
  const menu = useAttachmentContextMenu();
  const element = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const audioControl = useRef<{
    playing: boolean;
    available: boolean;
    toggle: () => void;
  } | null>(null);
  const preview = useImagePreview();
  const transfer = useAttachmentTransfer();
  const { id, name, kind } = node.attrs;
  const metadata=useAttachmentMetadata(id),visible=useMediaVisibility(element,"80px");
  const [active,setActive]=useState(false);
  const visual=kind==="image"||kind==="video";
  const thumbnail=useAttachmentMedia(id,kind,visible&&visual,"thumbnail",1024);
  const original=useAttachmentMedia(id,kind,visible&&active&&(kind==="audio"||kind==="video"),"original");
  const {media,error,retry}=visual&&!active?thumbnail:original;
  useLayoutEffect(()=>{if(!visible)setActive(false);},[visible]);
  const src = media?.source.src ?? "";
  useLayoutEffect(()=>{if(!thumbnail.media)return;const images=element.current?.querySelectorAll("img");return thumbnail.media.source.bindController(()=>images?.forEach(image=>image.removeAttribute("src")));},[thumbnail.media?.source]);
  const displayKind = metadata?.mime.startsWith("image/") ? "image" : kind;
  const select = () => {
    const position = getPos();
    if (editor.isDestroyed || typeof position !== "number" || editor.state.doc.nodeAt(position)?.attrs.id !== id) return;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
    editor.view.focus();
  };
  const remove = () => {
    const position = getPos();
    if (!editor.isEditable || editor.isDestroyed || typeof position !== "number") return;
    const current = editor.state.doc.nodeAt(position);
    if (current?.type.name !== "attachment" || current.attrs.id !== id) return;
    editor.view.dispatch(closeHistory(editor.state.tr).delete(position, position + current.nodeSize).scrollIntoView());
    editor.view.focus();
  };
  const insertAfter = () => {
    const position = getPos();
    if (!editor.isEditable || editor.isDestroyed || typeof position !== "number") throw Error("原附件位置已改变");
    const current = editor.state.doc.nodeAt(position);
    if (current?.type.name !== "attachment" || current.attrs.id !== id) throw Error("原附件已改变");
    return position + current.nodeSize;
  };
  const showMenu = (point: { x: number; y: number }) => {
    const trigger = element.current;
    if (!trigger) return;
    const image = trigger.querySelector<HTMLButtonElement>(".image-open");
    const playback =
      kind === "audio" && audioControl.current?.available
        ? audioControl.current
        : kind === "video" && video.current && src
          ? {
              playing: !video.current.paused,
              toggle: async () => {
                if (!video.current) return;
                if (video.current.paused) await video.current.play();
                else video.current.pause();
              },
            }
          : undefined;
    menu.open({
      editor,
      id,
      kind,
      name: metadata?.displayName ?? name,
      trigger,
      point,
      source: media?.source,
      mime: metadata?.mime,
      bytes: metadata?.size,
      recordedAt: metadata?.recordedAt ?? undefined,
      error,
      preview:
        image
          ? () =>
              preview.open({
                id,
                name: metadata?.displayName ?? name,
                mime: metadata?.mime ?? "",
                bytes: metadata?.size ?? 0,
                trigger: image,
              })
          : undefined,
      playback,
      remove,
      insertAfter,
    });
  };
  return (
    <NodeViewWrapper
      className={`attachment-node ${displayKind} ${selected ? "ProseMirror-selectednode" : ""}`}
      data-attachment-id={id}
      ref={element}
      tabIndex={0}
      onContextMenu={(event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        select();
        showMenu({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && ["c", "x", "v"].includes(event.key.toLowerCase())) {
          event.preventDefault(); event.stopPropagation();
          if (event.key.toLowerCase() === "v") transfer.paste(editor, undefined, insertAfter);
          else {
            const original = editor.state.doc;
            void copyAttachmentFile(id).then(() => {
              if (event.key.toLowerCase() === "x" && !editor.isDestroyed && editor.state.doc === original && element.current?.isConnected) remove();
            }).catch(error => window.dispatchEvent(new CustomEvent("attachment-transfer-error", { detail: error })));
          }
          return;
        }
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          showMenu({ x: bounds.left + 12, y: bounds.top + 12 });
        }
      }}
      contentEditable={false}
    >
      {displayKind === "image" ? (
        <ImageAttachment onSelect={select} id={id} media={thumbnail.media} name={metadata?.displayName ?? name} mime={metadata?.mime ?? ""} bytes={metadata?.size ?? 0} />
      ) : kind === "audio" ? (
        <AudioPlayer
          key={id}
          src={src}
          name={metadata?.displayName ?? name}
          recordedAt={metadata?.recordedAt ?? undefined}
          bytes={metadata?.size}
          activate={()=>setActive(true)}
          autoPlay={active}
          source={media?.source}
          playbackRef={audioControl}
        />
      ) : kind === "video" ? (
        active ? <VideoAttachment source={original.media?.source ?? null} acquisitionError={original.error} enabled={original.allowed} ownerIdentity={original.ownerIdentity} retry={original.retry} videoRef={video} /> : <button style={{maxWidth:"100%",position:"relative"}} type="button" aria-label={`播放视频 ${name}`} onClick={()=>setActive(true)}>{thumbnail.media&&<img src={thumbnail.media.source.src} alt={name} />}<Play size={24} />播放视频</button>
      ) : (
        <button type="button" className="file-card" style={{width:"min(360px,100%)",textAlign:"left"}} onClick={()=>{
          select();
          void (native&&/Mac/.test(navigator.platform)?desktopAttachmentAction(id,"open"):saveAttachmentOriginal(id,metadata?.displayName??name)).catch(error=>window.dispatchEvent(new CustomEvent("attachment-transfer-error",{detail:error})));
        }}><FileText size={30}/><span><strong>{metadata?.displayName??name}</strong><small>本地附件</small></span><Download size={20}/></button>
      )}
      {error&&!(kind==="video"&&active)&&<span className="inline-error" role="alert">{error}<button type="button" aria-label={kind==="audio"?"重试录音":"重试附件"} onClick={retry}>重试</button></span>}
    </NodeViewWrapper>
  );
}
function ImageAttachment({
  onSelect,
  id,
  media,
  name,
  mime,
  bytes,
}: {
  onSelect: () => void;
  id: string;
  media: ReturnType<typeof useAttachmentMedia>["media"];
  name: string;
  mime: string;
  bytes:number;
}) {
  const preview = useImagePreview(),
    trigger = useRef<HTMLButtonElement>(null);
  const [failedSource, setFailedSource] = useState("");
  useLayoutEffect(()=>{if(!media)return;const image=trigger.current?.querySelector("img");return media.source.bindController(()=>image?.removeAttribute("src"));},[media?.source]);
  if (media && failedSource === media.source.src) return <button type="button" className="file-card" style={{width:"min(360px,100%)",textAlign:"left"}} onClick={()=>{void saveAttachmentOriginal(id,name).catch(error=>window.dispatchEvent(new CustomEvent("attachment-transfer-error",{detail:error})));}}><FileText size={30}/><span><strong>{name}</strong><small>此格式无法预览，保存原文件</small></span></button>;
  return (
    <div
      className={`image-attachment ${media?.mime === "image/svg+xml" ? "vector" : ""}`}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        ref={trigger}
        type="button"
        className="image-open"
        aria-label={`选择图片 ${name}`}
        title="单击选择，双击快速查看"
        onClick={onSelect}
        onDoubleClick={() => {
          if (trigger.current)
            preview.open({
              id,
              name,
              mime,
              bytes,
              trigger: trigger.current,
            });
        }}
      >
        <img src={media?.source.src} alt={name} draggable={false} onError={() => setFailedSource(media?.source.src || "")} />
      </button>
    </div>
  );
}
type AudioPlayerProps = {
  src: string;
  name: string;
  recordedAt?: number;
  source?: AttachmentMediaSource;
  bytes?:number;
  activate?:()=>void;
  autoPlay?:boolean;
  playbackRef?: React.RefObject<{
    playing: boolean;
    available: boolean;
    toggle: () => void;
  } | null>;
};
export function AudioPlayer({
  src,
  name,
  recordedAt,
  source,
  bytes,
  activate,
  autoPlay,
  playbackRef,
}: AudioPlayerProps) {
  // Different attachments get different media elements and controller lifetimes.
  // In-flight events or play promises from the previous source cannot affect it.
  return (
    <AudioPlayerSession
      key={src}
      src={src}
      name={name}
      recordedAt={recordedAt}
      source={source}
      bytes={bytes}
      activate={activate}
      autoPlay={autoPlay}
      playbackRef={playbackRef}
    />
  );
}
function AudioPlayerSession({
  src,
  name,
  recordedAt,
  source,
  bytes,
  activate,
  autoPlay,
  playbackRef,
}: AudioPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<ReturnType<typeof createAudioPlayback> | null>(
    null,
  );
  const [playback, setPlayback] = useState(initialAudioPlaybackState);
  const [expanded, setExpanded] = useState(false);
  const mobile = useMobileInteraction();
  useEffect(() => {
    setExpanded(false);
  }, [mobile]);
  const detailId = useId();
  const toggleExpanded = () => setExpanded((value) => !value);
  const title = <>
    <strong>{name.replace(/\.[^.]+$/, "")}</strong>
    {recordedAt !== undefined && <small className="audio-recorded-at">{recordingDate(recordedAt)}</small>}
    <small className="audio-duration-desktop">录音 · {formatAudioTime(playback.duration)}</small>
    <small className="audio-duration-mobile">{compactAudioDuration(playback.duration)}</small>
  </>;
  useEffect(() => {
    if (!audio.current) return;
    const player = createAudioPlayback(audio.current, src, setPlayback);
    controller.current = player;
    const stop = () => {
      if (controller.current === player) controller.current = null;
      player.dispose();
    };
    if(src&&autoPlay)player.toggle();
    return source ? source.bindController(stop) : stop;
  }, [src, source]);
  if (playbackRef)
    playbackRef.current = {
      playing: playback.playing,
      available: (!!src || !!activate) && !playback.mediaError,
      toggle: () => {if(!src)activate?.();else controller.current?.toggle();},
    };
  useLayoutEffect(
    () => () => {
      if (playbackRef) playbackRef.current = null;
    },
    [playbackRef],
  );
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
          if (!mobile && !(event.target as Element).closest("button, input"))
            toggleExpanded();
          event.stopPropagation();
        }}
      >
        {mobile ? <div className="audio-title-toggle">{title}</div> : <button
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
          {title}
        </button>}
        <button
          type="button"
          className="audio-play-toggle"
          aria-label={playing ? "暂停" : "播放"}
          disabled={(!src && !activate) || !!playback.mediaError}
          onClick={() => {if(!src)activate?.();else controller.current?.toggle();}}
        >
          {playing ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
          {playing ? "暂停" : "播放"}
        </button>
        {!mobile && <button
          type="button"
          className="audio-expand"
          aria-label={expanded ? "收起录音进度" : "显示录音进度"}
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={() => toggleExpanded()}
        >
          ⌄
        </button>}
      </div>
      <AudioWaveform src={src} source={source} bytes={bytes} duration={duration} time={time} disabled={!src || !!playback.mediaError} seek={seconds => controller.current?.seek(seconds)} />
      {!mobile && expanded && (
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
  const bounds = drawingBounds(strokes);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  const owner = () => editor.view.dom.getAttribute("data-note-id") || "";
  const present = () => {
    if (editor.isDestroyed || !editor.view.dom.isConnected || !editor.view.dom.getClientRects().length) return false;
    const pos = getPos();
    return typeof pos === "number" && editor.state.doc.nodeAt(pos)?.eq(node) === true && !!accessGate.state?.notes[owner()]?.authorized && !accessGate.state?.operationId && !accessGate.state?.suspended.includes(owner());
  };
  const open = () => {
    if (!present() || !editor.isEditable) return;
    window.dispatchEvent(new CustomEvent("edit-drawing", { detail: { strokes, pos: getPos(), editor } }));
  };
  const showMenu = (point: { x: number; y: number }) => {
    if (!present()) return;
    stop(); suppressClick.current = true; editor.commands.blur(); setMenu(point);
  };
  const act = (work: () => void | Promise<unknown>) => {
    setMenu(null); suppressClick.current = false; press.current = null; stop();
    Promise.resolve().then(() => { if (!present()) throw Error("速绘已改变，请重新选择"); return work(); }).catch(e => setNotice(e instanceof Error ? e.message : String(e)));
  };
  const remove = () => {
    if (!present() || !editor.isEditable) throw Error("速绘不可编辑");
    const pos = getPos()!; editor.view.dispatch(closeHistory(editor.state.tr).delete(pos, pos + node.nodeSize));
  };
  return <NodeViewWrapper className="drawing-node" contentEditable={false}>
    <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} role="button" tabIndex={0} aria-label="编辑手绘笔迹"
      onClick={e => { e.preventDefault(); e.stopPropagation(); if (suppressClick.current) { suppressClick.current = false; return; } open(); }}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      onContextMenu={e => { e.preventDefault(); showMenu({ x: e.clientX, y: e.clientY }); }}
      onPointerDown={e => {
        if (e.button !== 0) return;
        stop(); suppressClick.current = false; press.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        if (e.pointerType !== "mouse") timer.current = setTimeout(() => showMenu({ x: e.clientX, y: e.clientY }), 500);
      }}
      onPointerMove={e => { const p = press.current; if (p && (p.id !== e.pointerId || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10)) { stop(); suppressClick.current = true; } }}
      onPointerUp={() => { stop(); press.current = null; }} onPointerCancel={() => { stop(); press.current = null; suppressClick.current = true; }}>
      {strokes.map((s, i) => <polyline key={i} points={s.points.map(p => p.join(",")).join(" ")} fill="none" stroke={s.tool === "eraser" ? "var(--paper)" : s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" opacity={s.tool === "marker" ? .35 : 1} />)}
    </svg>
    {notice && <div className="drawing-menu-notice" role="status">{notice}</div>}
    {menu && <MenuSurface aria-label="速绘操作" point={menu} onClose={() => { setMenu(null); suppressClick.current = false; }}>
      <MenuItem icon={<PenTool size={18} />} disabled={!editor.isEditable} onClick={() => { setMenu(null); open(); }}>编辑速绘</MenuItem>
      <MenuItem icon={<Copy size={18} />} onClick={() => act(() => {
        const id = owner(), stamp = accessGate.stamp(id);
        return copyDrawing(strokes, () => { const now = accessGate.stamp(id); return stamp.sessionId === now.sessionId && stamp.epoch === now.epoch && stamp.noteEpoch === now.noteEpoch && !!accessGate.state?.notes[id]?.authorized; });
      })}>复制</MenuItem>
      <MenuItem icon={<Scissors size={18} />} disabled={!editor.isEditable} onClick={() => act(async () => { const id = owner(), stamp = accessGate.stamp(id); await copyDrawing(strokes, () => { const now = accessGate.stamp(id); return stamp.sessionId === now.sessionId && stamp.epoch === now.epoch && stamp.noteEpoch === now.noteEpoch && !!accessGate.state?.notes[id]?.authorized; }); remove(); })}>剪切</MenuItem>
      <MenuItem icon={<ClipboardPaste size={18} />} disabled={!editor.isEditable} onClick={() => act(async () => {
        const pasted = await pasteDrawing(); if (!present() || !editor.isEditable) throw Error("速绘不可编辑");
        const pos = getPos()! + node.nodeSize; editor.commands.insertContentAt(pos, { type: "drawing", attrs: { strokes: pasted } });
      })}>粘贴</MenuItem>
      <hr />
      <MenuItem icon={<Download size={18} />} onClick={() => act(() => exportDrawing(strokes, owner(), present))}>导出 SVG…</MenuItem>
      <MenuItem icon={<Trash2 size={18} />} danger disabled={!editor.isEditable} onClick={() => act(remove)}>删除速绘</MenuItem>
    </MenuSurface>}
  </NodeViewWrapper>;
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
  const transfer = useAttachmentTransfer();
  const transferRef = useRef(transfer);
  const currentEditor = useRef<Editor | null>(null);
  transferRef.current = transfer;
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
      handleDOMEvents: {
        copy: (view, event) => copySelection(view, event, false),
        cut: (view, event) => copySelection(view, event, true),
      },
      // Fixed PM 1.42.9 opt-in: trusted Android preedit survives the idle
      // watchdog; native end/blur/non-composition input still release it.
      androidPreserveComposition: native && /Android/.test(navigator.userAgent),
      attributes: {
        "aria-label": "备忘录正文",
        spellcheck: "true",
        "data-paper-style": note.paperStyle,
            "data-note-id": note.id,
      },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        const files = clipboard ? Array.from(clipboard.files) : [];
        const html = clipboard?.getData("text/html") || "";
        if (!files.length && /<img\b/i.test(html)) {
          const content = new DOMParser().parseFromString(html, "text/html");
          if (!content.body.textContent?.trim()) {
            for (const image of content.querySelectorAll("img")) {
              const match = image.getAttribute("src")?.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/);
              if (match) {
                try { files.push(new File([Uint8Array.from(atob(match[2]), c => c.charCodeAt(0))], image.alt || `粘贴的图片-${Date.now()}.${match[1].split("/")[1].replace("+xml", "")}`, { type: match[1] })); } catch { /* Normal paste handles malformed HTML. */ }
              }
            }
          }
        }
        if (files.length || clipboard?.types.includes("app.cybernote.attachment") || /<div[^>]*\bdata-attachment(?:\s|=|>)/i.test(html) || /^file:\/\//i.test(clipboard?.getData("text/uri-list") || "")) {
          if (!view.editable) return true;
          event.preventDefault();
          if (currentEditor.current) transferRef.current.paste(currentEditor.current, files.length ? files : undefined);
          return true;
        }
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
  currentEditor.current = editor;
  function copySelection(view: Editor["view"], event: Event, cut: boolean) {
    const selection = view.state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "attachment") return false;
    event.preventDefault();
    const original = view.state.doc;
    void copyAttachmentFile(selection.node.attrs.id).then(() => {
      if (cut && view.editable && view.dom.isConnected && !view.dom.closest("[hidden], [inert], .access-sync") && view.state.doc === original && view.state.selection.eq(selection)) {
        view.dispatch(closeHistory(view.state.tr).delete(selection.from, selection.to).scrollIntoView());
      }
    }).catch(error => window.dispatchEvent(new CustomEvent("attachment-transfer-error", { detail: error })));
    return true;
  }
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
            "data-note-id": note.id,
          },
        },
      });
  }, [editor, note.paperStyle, note.id]);
  return (
    <div className={`note-document paper-context-${note.paperStyle}`}>
      <EditorContent editor={editor} />
      {editor && <TableControls editor={editor} />}
    </div>
  );
}
