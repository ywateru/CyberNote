export type AttachmentMediaSource = {
  readonly src: string;
  bindController: (stop: () => void) => () => void;
  dispose: () => void;
};

/** Only the authorized readAttachment response supplies these bytes. The source
 * owns its URL; bound playback controllers must stop before that URL is freed. */
export function createAttachmentMediaSource(
  value: { data: string; mime: string },
  kind: string,
  urls: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): AttachmentMediaSource {
  let objectUrl: string | undefined;
  if (kind === "audio") {
    const binary = atob(value.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index);
    objectUrl = urls.createObjectURL(new Blob([bytes], { type: value.mime }));
  }
  const src = objectUrl ?? `data:${value.mime};base64,${value.data}`;
  let disposed = false;
  const controllers = new Set<() => void>();
  return {
    src,
    bindController(stop) {
      let bound = true;
      const release = () => {
        if (!bound) return;
        bound = false;
        controllers.delete(release);
        stop();
      };
      if (disposed) release();
      else controllers.add(release);
      return release;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        for (const stop of [...controllers]) stop();
      } finally {
        controllers.clear();
        if (objectUrl !== undefined) urls.revokeObjectURL(objectUrl);
      }
    },
  };
}
