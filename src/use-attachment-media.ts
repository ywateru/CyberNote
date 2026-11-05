import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { readAttachment } from "./bridge";
import { MetadataStale } from "./metadata-client";
import { attachmentRecordedAt } from "./recording-metadata";
import {
  createAttachmentMediaSource,
  type AttachmentMediaSource,
} from "./attachment-media";

export function useAttachmentMedia(id: string, kind: string) {
  const [version, setVersion] = useState(0);
  const lifetime = useRef<object | null>(null);
  const [loaded, setLoaded] = useState<{
    id: string;
    kind: string;
    version: number;
    source: AttachmentMediaSource;
    name: string;
    recordedAt?: number;
  } | null>(null);
  const [failure, setFailure] = useState<{
    id: string;
    kind: string;
    version: number;
    message: string;
  } | null>(null);
  // Invalidate before passive cleanup, including a committed identity change.
  // A manual retry also seals the previous attempt before scheduling its render.
  useLayoutEffect(() => {
    const token = {};
    lifetime.current = token;
    return () => {
      if (lifetime.current === token) lifetime.current = null;
    };
  }, [id, kind, version]);
  useEffect(() => {
    let live = true;
    const token = lifetime.current;
    const current = () => live && token !== null && lifetime.current === token;
    let source: AttachmentMediaSource | undefined;
    setLoaded(null);
    setFailure(null);
    void (async () => {
      for (let attempt = 0; attempt < 3 && current(); attempt++) {
        try {
          // Every attempt captures a new access stamp and runs the unchanged
          // bridge gates. A rejected response never supplies bytes or a URL.
          const value = await readAttachment(id);
          if (!current()) return;
          const recordedAt = attachmentRecordedAt(value.recordedAt, kind);
          source = createAttachmentMediaSource(value, kind);
          setLoaded({ id, kind, version, source, name: value.name, recordedAt });
          return;
        } catch (error: unknown) {
          if (!current()) return;
          if (error instanceof MetadataStale && attempt < 2) continue;
          source?.dispose();
          setLoaded(null);
          setFailure({
            id,
            kind,
            version,
            message: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }
    })();
    return () => {
      live = false;
      source?.dispose();
    };
  }, [id, kind, version]);
  const current = (value: { id: string; kind: string; version: number }) =>
    value.id === id && value.kind === kind && value.version === version;
  return {
    media: loaded && current(loaded) ? loaded : null,
    error: failure && current(failure) ? failure.message : "",
    retry: () => {
      lifetime.current = null;
      setVersion((value) => value + 1);
    },
  };
}
