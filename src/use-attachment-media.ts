import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { Attachment } from "./types";
import { accessGate, type AttachmentSourcePurpose } from "./bridge";
import {
  attachmentSourceIdentity,
  attachmentSourcePool,
} from "./attachment-source-pool";
import type { AttachmentMediaSource } from "./attachment-media";
import { attachmentRecordedAt } from "./recording-metadata";
export const AttachmentMetadataContext = createContext<readonly Attachment[]>(
  [],
);
export function useAttachmentMetadata(id: string) {
  return useContext(AttachmentMetadataContext).find(
    (a) => a.id === id && !a.internal,
  );
}
export function useMediaVisibility(
  ref: RefObject<HTMLElement | null>,
  margin = "0px",
) {
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setVisible(entry.isIntersecting && element.getClientRects().length > 0),
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin]);
  return visible;
}
export type LoadedAttachmentMedia = {
  id: string;
  kind: string;
  source: AttachmentMediaSource;
  name: string;
  mime: string;
  bytes: number;
  recordedAt?: number;
};
export function useAttachmentMedia(
  id: string,
  kind: string,
  enabled = true,
  purpose: AttachmentSourcePurpose = "original",
  pixels?: number,
) {
  const metadata = useAttachmentMetadata(id),
    [version, setVersion] = useState(0);
  const invalidation = useSyncExternalStore(
    attachmentSourcePool.subscribe,
    () => attachmentSourcePool.version(id, purpose),
    () => 0,
  );
  const allowed =
    enabled &&
    !!metadata &&
    !accessGate.state?.operationId &&
    !accessGate.state?.suspended.includes(metadata.noteId) &&
    !!accessGate.state?.notes[metadata.noteId]?.authorized;
  const identity = metadata
    ? attachmentSourceIdentity(
        metadata.noteId,
        JSON.stringify([
          metadata.id,
          metadata.relativePath,
          metadata.size,
          metadata.mime,
          version,
          invalidation,
        ]),
      )
    : "";
  const [loaded, setLoaded] = useState<{
    identity: string;
    media: LoadedAttachmentMedia;
  } | null>(null);
  const [failure, setFailure] = useState<{
    identity: string;
    message: string;
  } | null>(null);
  const attempt = useRef<object | null>(null);
  useLayoutEffect(() => {
    const token = {};
    attempt.current = token;
    setLoaded(null);
    setFailure(null);
    if (!allowed || !metadata)
      return () => {
        attempt.current = null;
      };
    const cancel = attachmentSourcePool.request(
      id,
      metadata.noteId,
      purpose,
      pixels,
      identity,
      (source, grant) => {
        if (attempt.current !== token) {
          source.dispose();
          return;
        }
        setLoaded({
          identity,
          media: {
            id,
            kind,
            source,
            name: metadata.displayName,
            mime: grant.mime,
            bytes: metadata.size,
            recordedAt: attachmentRecordedAt(metadata.recordedAt, kind),
          },
        });
      },
      (error) => {
        if (attempt.current === token)
          setFailure({
            identity,
            message:
              (error as { code?: string })?.code === "unsupported_media"
                ? "此格式暂不支持缩略图，可打开或导出原文件"
                : error instanceof Error
                  ? error.message
                  : String(error),
          });
      },
    );
    return () => {
      if (attempt.current === token) attempt.current = null;
      cancel();
    };
  }, [id, kind, allowed, purpose, pixels, identity]);
  return {
    allowed,
    ownerIdentity: metadata ? attachmentSourceIdentity(metadata.noteId, JSON.stringify([id, metadata.relativePath, metadata.size, metadata.mime, invalidation])) : "",
    media:
      allowed && loaded?.identity === identity && !loaded.media.source.disposed
        ? {
            ...loaded.media,
            name: metadata!.displayName,
            recordedAt: attachmentRecordedAt(metadata!.recordedAt, kind),
          }
        : null,
    error: failure?.identity === identity ? failure.message : "",
    retry: () => setVersion((v) => v + 1),
    metadata,
  };
}
