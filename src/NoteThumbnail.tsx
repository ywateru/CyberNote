import { useLayoutEffect, useRef, useState } from "react";
import { useAttachmentMedia } from "./use-attachment-media";
/** Read only visible, authorized image references. Offscreen rows release bytes. */
export default function NoteThumbnail({
  id,
  kind,
}: {
  id: string;
  kind: string;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: root.current?.closest(".notes-scroll"), rootMargin: "80px" },
    );
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  const { media } = useAttachmentMedia(id, kind, visible, "thumbnail", 160);
  useLayoutEffect(() => setFailed(false), [media?.source]);
  useLayoutEffect(() => {
    if (!media) return;
    const image = root.current?.querySelector("img");
    return media.source.bindController(() => image?.removeAttribute("src"));
  }, [media?.source]);
  return (
    <span className="note-thumbnail" ref={root} aria-hidden="true">
      {media && !failed && (
        <img
          src={media.source.src}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
