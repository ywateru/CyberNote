import { useEffect, useState } from "react";
import { readAttachment } from "./bridge";
import { attachmentRecordedAt } from "./recording-metadata";
import {
  createAttachmentMediaSource,
  type AttachmentMediaSource,
} from "./attachment-media";

export function useAttachmentMedia(id: string, kind: string) {
  const [version, setVersion] = useState(0);
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
  useEffect(() => {
    let live = true;
    let source: AttachmentMediaSource | undefined;
    setLoaded(null);
    setFailure(null);
    readAttachment(id)
      .then((value) => {
        if (!live) return;
        const recordedAt = attachmentRecordedAt(value.recordedAt, kind);
        source = createAttachmentMediaSource(value, kind);
        setLoaded({ id, kind, version, source, name: value.name, recordedAt });
      })
      .catch((error: unknown) => {
        source?.dispose();
        if (!live) return;
        setLoaded(null);
        setFailure({
          id,
          kind,
          version,
          message: error instanceof Error ? error.message : String(error),
        });
      });
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
    retry: () => setVersion((value) => value + 1),
  };
}
