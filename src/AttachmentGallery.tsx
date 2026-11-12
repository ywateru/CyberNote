import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AudioLines,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Image,
  MoreHorizontal,
  NotebookPen,
  Pause,
  Play,
  Share,
  Video,
} from "lucide-react";
import type { Attachment, Note } from "./types";
import { useAttachmentMedia } from "./use-attachment-media";
import { useImagePreview } from "./ImagePreview";
import { MenuSurface, MenuItem } from "./Menu";
import { copyAttachmentFile } from "./attachment-clipboard";
import { saveAttachmentOriginal } from "./attachment-export";
import { desktopAttachmentAction, native } from "./bridge";
import { formatFileSize } from "./data-management";
import AudioWaveform from "./AudioWaveform";
import {
  createAudioPlayback,
  initialAudioPlaybackState,
  formatAudioTime,
} from "./audio-playback";
import type { AttachmentMediaSource } from "./attachment-media";
import "./AttachmentGallery.css";

export type GalleryAttachment = {
  attachment: Attachment;
  note: Note;
  folder: string;
  authority: string;
};
type Category = "photos" | "audio" | "files" | "all";
export function attachmentCategory(
  attachment: Attachment,
): Exclude<Category, "all"> {
  if (
    ["image", "video"].includes(attachment.kind) ||
    /^(image|video)\//.test(attachment.mime)
  )
    return "photos";
  if (attachment.kind === "audio" || attachment.mime.startsWith("audio/"))
    return "audio";
  return "files";
}
function GalleryAudio({
  source,
  name,
  bytes,
}: {
  source: AttachmentMediaSource;
  name: string;
  bytes: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<ReturnType<typeof createAudioPlayback> | null>(
    null,
  );
  const [state, setState] = useState(initialAudioPlaybackState);
  useEffect(() => {
    const player = createAudioPlayback(audio.current!, source.src, setState);
    controller.current = player;
    player.toggle();
    const pauseOthers = (event: Event) => {
      if ((event as CustomEvent).detail !== audio.current)
        audio.current?.pause();
    };
    window.addEventListener("attachment-gallery-play", pauseOthers);
    const release = source.bindController(() => player.dispose());
    return () => {
      controller.current = null;
      release();
      window.removeEventListener("attachment-gallery-play", pauseOthers);
    };
  }, [source]);
  return (
    <div className="attachment-gallery-audio">
      <audio
        ref={audio}
        preload="metadata"
        onPlay={() =>
          window.dispatchEvent(
            new CustomEvent("attachment-gallery-play", {
              detail: audio.current,
            }),
          )
        }
      />
      <button
        type="button"
        className="gallery-audio-play"
        aria-label={`${state.playing ? "暂停" : "播放"} ${name}`}
        onClick={() => controller.current?.toggle()}
      >
        {state.playing ? <Pause /> : <Play />}
      </button>
      <AudioWaveform
        src={source.src}
        source={source}
        bytes={bytes}
        duration={state.duration}
        time={state.time}
        disabled={!!state.mediaError}
        seek={(seconds) => controller.current?.seek(seconds)}
      />
      <span>
        {formatAudioTime(state.time)} / {formatAudioTime(state.duration)}
      </span>
      {(state.mediaError || state.playError) && (
        <small role="alert">{state.mediaError || state.playError}</small>
      )}
    </div>
  );
}
function GalleryCard({
  entry,
  selected,
  select,
  reveal,
  valid,
  onError,
  topInset,
}: {
  entry: GalleryAttachment;
  selected: boolean;
  select: () => void;
  reveal: () => void;
  valid: () => boolean;
  onError: (error: unknown) => void;
  topInset: number;
}) {
  const { attachment: a, note, folder } = entry;
  const root = useRef<HTMLElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false),
    [failed, setFailed] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const category = attachmentCategory(a);
  const isImage = a.kind === "image" || a.mime.startsWith("image/");
  const isVideo = a.kind === "video" || a.mime.startsWith("video/");
  const [active, setActive] = useState(false);
  const thumbnail = useAttachmentMedia(
    a.id,
    a.kind,
    visible && (isImage || isVideo),
    "thumbnail",
    480,
  );
  const original = useAttachmentMedia(
    a.id,
    a.kind,
    visible && active && (category === "audio" || isVideo),
    "original",
  );
  const { media, error, retry } = thumbnail;
  useLayoutEffect(() => {
    if (!visible) setActive(false);
  }, [visible]);
  useLayoutEffect(() => {
    if (!media) return;
    const images = root.current?.querySelectorAll("img");
    return media.source.bindController(() =>
      images?.forEach((image) => image.removeAttribute("src")),
    );
  }, [media?.source]);
  useLayoutEffect(() => {
    if (!original.media) return;
    const video = root.current?.querySelector("video");
    return original.media.source.bindController(() => {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    });
  }, [original.media?.source]);
  const preview = useImagePreview();
  const desktop = native && /Mac/.test(navigator.platform);
  const current = useRef({ valid, onError });
  current.current = { valid, onError };
  useLayoutEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      {
        root: root.current?.closest(".attachment-gallery-scroll"),
        rootMargin: "120px",
      },
    );
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(
    () => () => {
      root.current?.querySelectorAll("video,audio").forEach((element) => {
        const node = element as HTMLMediaElement;
        node.pause();
        node.removeAttribute("src");
        node.load();
      });
    },
    [],
  );
  const run = (operation: () => unknown | Promise<unknown>) => {
    setPoint(null);
    if (!current.current.valid() || !root.current?.isConnected) return;
    try {
      void Promise.resolve(operation()).catch((error) => {
        if (current.current.valid()) current.current.onError(error);
      });
    } catch (error) {
      current.current.onError(error);
    }
  };
  const quickLook = () => {
    if (trigger.current && isImage)
      preview.open({
        id: a.id,
        name: a.displayName,
        mime: a.mime,
        bytes: a.size,
        trigger: trigger.current,
      });
  };
  const openMenu = (x: number, y: number) => {
    select();
    setPoint({ x, y });
  };
  return (
    <article
      ref={root}
      className={`attachment-gallery-card ${selected ? "selected" : ""}`}
      data-attachment-id={a.id}
      data-note-id={note.id}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu(event.clientX, event.clientY);
      }}
    >
      <div className={`attachment-gallery-visual ${category}`}>
        <button
          ref={trigger}
          type="button"
          className="attachment-gallery-select"
          aria-label={`选择附件 ${a.displayName}`}
          aria-pressed={selected}
          onClick={select}
          onDoubleClick={reveal}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              reveal();
            }
            if (
              event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10")
            ) {
              event.preventDefault();
              const r = event.currentTarget.getBoundingClientRect();
              openMenu(r.left + 12, r.top + 12);
            }
          }}
        >
          {(isImage || isVideo) && media && !failed ? (
            <img
              src={media.source.src}
              alt={a.displayName}
              draggable={false}
              onError={() => setFailed(true)}
            />
          ) : (
            <span className="gallery-file-symbol">
              {category === "audio" ? (
                <AudioLines />
              ) : isVideo ? (
                <Video />
              ) : isImage ? (
                <Image />
              ) : (
                <FileText />
              )}
              {category === "files" && (
                <span>{a.displayName.split(".").pop()?.toUpperCase()}</span>
              )}
            </span>
          )}
        </button>
        {isVideo && (
          <span className="gallery-video-badge">
            <Video size={15} /> 视频
          </span>
        )}
        {category === "audio" &&
          (original.media ? (
            <GalleryAudio
              source={original.media.source}
              name={a.displayName}
              bytes={a.size}
            />
          ) : (
            <div className="attachment-gallery-audio">
              <button
                className="gallery-audio-play"
                type="button"
                aria-label={`播放 ${a.displayName}`}
                onClick={() => setActive(true)}
              >
                <Play />
              </button>
              <span>点击播放</span>
            </div>
          ))}
        {isVideo &&
          (original.media ? (
            <video
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
              src={original.media.source.src}
              controls
              autoPlay
              aria-label={a.displayName}
            />
          ) : (
            <button
              className="gallery-audio-play"
              style={{ position: "absolute", bottom: 15, right: 16 }}
              type="button"
              aria-label={`播放视频 ${a.displayName}`}
              onClick={() => setActive(true)}
            >
              <Play />
              播放视频
            </button>
          ))}
        <button
          className="icon-button gallery-item-menu"
          type="button"
          aria-label={`附件选项 ${a.displayName}`}
          onClick={(event) => {
            const r = event.currentTarget.getBoundingClientRect();
            openMenu(r.left, r.bottom + 4);
          }}
        >
          <MoreHorizontal />
        </button>
      </div>
      <div className="attachment-gallery-caption">
        <strong title={a.displayName}>{a.displayName}</strong>
        <button
          type="button"
          className="gallery-note-link"
          title={`${folder} · ${note.title}`}
          onClick={reveal}
        >
          <NotebookPen size={14} />
          <span>{note.title || "新备忘录"}</span>
          <span className="gallery-locate-label">在备忘录中显示</span>
        </button>
        <small>
          {formatFileSize(a.size)}
          {category === "audio" && a.recordedAt
            ? ` · ${new Date(a.recordedAt).toLocaleDateString("zh-CN")}`
            : ""}
        </small>
        {(error || original.error || failed) && (
          <div className="gallery-load-error">
            {failed ? "此格式暂不能预览" : error || original.error}
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                retry();
                original.retry();
              }}
            >
              重试
            </button>
          </div>
        )}
      </div>
      {point && (
        <MenuSurface
          point={point}
          topInset={topInset}
          returnFocus={trigger.current}
          onClose={() => setPoint(null)}
          className="popover attachment-gallery-menu"
          aria-label="附件画廊菜单"
        >
          <MenuItem
            icon={<NotebookPen size={17} />}
            onClick={() => run(reveal)}
          >
            在备忘录中显示
          </MenuItem>
          <div className="menu-divider" />
          {desktop && (
            <MenuItem
              icon={<ExternalLink size={17} />}
              onClick={() => run(() => desktopAttachmentAction(a.id, "open"))}
            >
              打开附件
            </MenuItem>
          )}
          {isImage && (
            <MenuItem icon={<Eye size={17} />} onClick={() => run(quickLook)}>
              快速查看附件
            </MenuItem>
          )}
          <MenuItem
            icon={<Download size={17} />}
            onClick={() =>
              run(() =>
                saveAttachmentOriginal(a.id, a.displayName, () =>
                  current.current.valid(),
                ),
              )
            }
          >
            保存附件…
          </MenuItem>
          {desktop && (
            <MenuItem
              icon={<FolderOpen size={17} />}
              onClick={() => run(() => desktopAttachmentAction(a.id, "reveal"))}
            >
              从目录打开
            </MenuItem>
          )}
          {desktop && (
            <MenuItem
              icon={<Share size={17} />}
              onClick={() => run(() => desktopAttachmentAction(a.id, "share"))}
            >
              共享…
            </MenuItem>
          )}
          <div className="menu-divider" />
          <MenuItem
            icon={<Copy size={17} />}
            onClick={() => run(() => copyAttachmentFile(a.id))}
          >
            拷贝
          </MenuItem>
        </MenuSurface>
      )}
    </article>
  );
}
export default function AttachmentGallery({
  entries,
  scope,
  available,
  reveal,
  validate,
  onError,
  topInset,
}: {
  entries: GalleryAttachment[];
  scope: string;
  available: boolean;
  reveal: (entry: GalleryAttachment) => void;
  validate: (entry: GalleryAttachment) => boolean;
  onError: (error: unknown) => void;
  topInset: number;
}) {
  const [category, setCategory] = useState<Category>(() =>
    entries.some((e) => attachmentCategory(e.attachment) === "photos")
      ? "photos"
      : "all",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const tabs = [
    { id: "photos", label: "照片与视频" },
    { id: "audio", label: "音频" },
    { id: "files", label: "文稿" },
    { id: "all", label: "全部附件" },
  ] as const;
  const filtered = entries.filter(
    (entry) =>
      category === "all" || attachmentCategory(entry.attachment) === category,
  );
  return (
    <div className="attachment-gallery" aria-label="附件画廊">
      <div
        className="attachment-gallery-categories"
        role="tablist"
        aria-label="附件类型"
      >
        {tabs.map((tab, index) => {
          const count = entries.filter(
            (entry) =>
              tab.id === "all" ||
              attachmentCategory(entry.attachment) === tab.id,
          ).length;
          return (
            <button
              type="button"
              role="tab"
              id={`gallery-tab-${tab.id}`}
              aria-controls="attachment-gallery-panel"
              aria-selected={category === tab.id}
              tabIndex={category === tab.id ? 0 : -1}
              key={tab.id}
              onClick={() => {
                setCategory(tab.id);
                setSelected(null);
              }}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          tabs.length) %
                        tabs.length;
                setCategory(tabs[next].id);
                setSelected(null);
                document
                  .getElementById(`gallery-tab-${tabs[next].id}`)
                  ?.focus();
              }}
            >
              {tab.label}
              <span>{count}</span>
            </button>
          );
        })}
      </div>
      <div
        id="attachment-gallery-panel"
        role="tabpanel"
        aria-labelledby={`gallery-tab-${category}`}
        className="attachment-gallery-scroll"
      >
        {available && filtered.length ? (
          <div className="attachment-gallery-grid">
            {filtered.map((entry) => (
              <GalleryCard
                key={`${scope}:${entry.attachment.id}:${entry.authority}`}
                entry={entry}
                selected={selected === entry.attachment.id}
                select={() => setSelected(entry.attachment.id)}
                reveal={() => reveal(entry)}
                valid={() => available && validate(entry)}
                onError={onError}
                topInset={topInset}
              />
            ))}
          </div>
        ) : (
          <div className="attachment-gallery-empty">
            <Image size={38} />
            <h2>{available ? "没有可显示的附件" : "正在确认附件状态…"}</h2>
            <p>
              {available
                ? "可切换附件类型，或选择其他文件夹。锁定备忘录的附件会在解锁后显示。"
                : "请稍候"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
