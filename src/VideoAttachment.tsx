import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AttachmentMediaSource } from "./attachment-media";

type RetryPosition = { owner: string; time: number };
const finiteTime = (time: number) => Number.isFinite(time) && time >= 0;
function videoError(code: number) {
  if (code === 1) return "视频加载已中断，请重试。";
  if (code === 2) return "视频读取失败，请重试。";
  if (code === 3) return "视频无法解码，请重试或打开原文件。";
  return "视频无法加载或格式不受支持，请重试或打开原文件。";
}

/** A retry acquires a new authorized source; it never reloads a failed URL.
 * Position and play intent belong only to the same visible, authorized owner. */
export default function VideoAttachment({
  source,
  acquisitionError,
  enabled,
  ownerIdentity,
  retry,
  videoRef,
}: {
  source: AttachmentMediaSource | null;
  acquisitionError: string;
  enabled: boolean;
  ownerIdentity: string;
  retry: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const position = useRef(0);
  const activated = useRef(false);
  const pending = useRef<RetryPosition | null>(null);
  const owner = useRef(ownerIdentity);
  const current = useRef<object | null>(null);
  const live = useRef(true);
  const latest = useRef({ enabled, ownerIdentity });
  latest.current = { enabled, ownerIdentity };
  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      current.current = null;
      pending.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (!enabled || owner.current !== ownerIdentity) {
      owner.current = ownerIdentity;
      position.current = 0;
      pending.current = null;
      setFailure("");
      setNotice("");
    }
  }, [enabled, ownerIdentity]);
  useLayoutEffect(() => {
    const element = videoRef.current;
    const token = {};
    current.current = token;
    setFailure("");
    if (!enabled || !source || source.disposed || !element) return;
    activated.current = true;
    const valid = () =>
      live.current &&
      current.current === token &&
      latest.current.enabled &&
      latest.current.ownerIdentity === ownerIdentity &&
      !source.disposed &&
      videoRef.current === element;
    let restoring = false;
    const remember = () => {
      if (
        valid() &&
        !element.error &&
        element.readyState >= 1 &&
        finiteTime(element.currentTime)
      )
        position.current = element.currentTime;
    };
    const failed = () => {
      if (valid()) setFailure(videoError(element.error?.code ?? 0));
    };
    const play = () => {
      if (!valid()) return;
      void element.play().catch(() => {
        if (valid()) setFailure("视频未能播放，请重试。");
      });
    };
    const restored = () => {
      const target = pending.current;
      if (!valid() || !restoring || !target || target.owner !== ownerIdentity)
        return;
      restoring = false;
      if (Math.abs(element.currentTime - target.time) > 0.35)
        setNotice("未能恢复原播放位置，请使用进度条选择。");
      pending.current = null;
      remember();
      play();
    };
    const metadata = () => {
      const target = pending.current;
      if (!valid() || !target || target.owner !== ownerIdentity || restoring)
        return;
      if (target.time === 0) {
        pending.current = null;
        play();
        return;
      }
      const ranges = element.seekable;
      let seekable = false;
      for (let i = 0; i < ranges.length; i++)
        if (target.time >= ranges.start(i) && target.time < ranges.end(i))
          seekable = true;
      if (
        !Number.isFinite(element.duration) ||
        target.time >= element.duration ||
        !seekable
      ) {
        // loadedmetadata can precede seekable ranges; canplay makes the final decision.
        if (element.readyState < 3) return;
        pending.current = null;
        setNotice("无法恢复原播放位置，已从开头播放。");
        play();
        return;
      }
      try {
        restoring = true;
        element.currentTime = target.time;
      } catch {
        restoring = false;
        pending.current = null;
        setNotice("未能恢复原播放位置，请使用进度条选择。");
        play();
      }
    };
    element.addEventListener("error", failed);
    element.addEventListener("timeupdate", remember);
    element.addEventListener("seeking", remember);
    element.addEventListener("pause", remember);
    element.addEventListener("loadedmetadata", metadata);
    element.addEventListener("canplay", metadata);
    element.addEventListener("seeked", restored);
    const unbind = source.bindController(() => {
      element.pause();
      element.removeAttribute("src");
      element.load();
    });
    // StrictMode can replay cleanup/setup on this same mounted element.
    // Cleanup must still unload it; a valid setup must rebind the live source.
    if (valid() && element.getAttribute("src") !== source.src)
      element.src = source.src;
    if (element.error) failed();
    if (element.readyState >= 1) metadata();
    return () => {
      if (current.current === token) current.current = null;
      element.removeEventListener("error", failed);
      element.removeEventListener("timeupdate", remember);
      element.removeEventListener("seeking", remember);
      element.removeEventListener("pause", remember);
      element.removeEventListener("loadedmetadata", metadata);
      element.removeEventListener("canplay", metadata);
      element.removeEventListener("seeked", restored);
      unbind();
    };
  }, [source, enabled, ownerIdentity, videoRef]);
  const message = acquisitionError || failure;
  return (
    <div className="video-attachment">
      {enabled && source && !source.disposed && (
        <video
          key={source.src}
          ref={videoRef}
          src={source.src}
          controls
          autoPlay={!activated.current && !pending.current}
        />
      )}
      {message && (
        <span className="inline-error" role="alert">
          {message}
          <button
            type="button"
            disabled={!enabled}
            onClick={() => {
              if (
                !live.current ||
                !latest.current.enabled ||
                latest.current.ownerIdentity !== ownerIdentity
              )
                return;
              pending.current = {
                owner: ownerIdentity,
                time: finiteTime(position.current) ? position.current : 0,
              };
              setFailure("");
              setNotice("");
              retry();
            }}
          >
            重试视频
          </button>
        </span>
      )}
      {notice && <span role="status">{notice}</span>}
    </div>
  );
}
