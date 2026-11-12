export type AttachmentMediaSource = {
  readonly src: string;
  readonly disposed: boolean;
  readonly purpose?: "original" | "thumbnail";
  /** Synchronous authority revocation; stops all retained handles before release. */
  revoke: () => void;
  bindController: (stop: () => void) => () => void;
  dispose: () => void;
  /** Independent lifetime for a floating preview of the same original bytes. */
  retain: () => AttachmentMediaSource;
};

/** Only the authorized readAttachment response supplies these bytes. The source
 * owns its URL; bound playback controllers must stop before that URL is freed. */
export function createAttachmentMediaSource(
  value: { data: string; mime: string },
  kind: string,
  urls: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): AttachmentMediaSource {
  let objectUrl: string | undefined;
  if (["audio", "video", "image", "file"].includes(kind)) {
    const binary = atob(value.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index);
    objectUrl = urls.createObjectURL(new Blob([bytes], { type: value.mime }));
  }
  const src = objectUrl ?? `data:${value.mime};base64,${value.data}`;
  return managedSource(src, undefined, () => {
    if (objectUrl !== undefined) urls.revokeObjectURL(objectUrl);
  });
}

/** Each handle has an idempotent lifetime. Revoke stops every controller before
 * releasing the shared native lease, even with an independent preview retain. */
function managedSource(
  src: string,
  purpose: "original" | "thumbnail" | undefined,
  release: () => void | Promise<void>,
): AttachmentMediaSource {
  const handles = new Set<{ dispose(): void }>();
  let released = false,
    revoked = false;
  const finish = () => {
    if (!released && !handles.size) {
      released = true;
      void Promise.resolve(release()).catch(() => {
        /* Native revocation/expiry is the cleanup backstop. */
      });
    }
  };
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    for (const handle of [...handles]) handle.dispose();
    finish();
  };
  const lease = (): AttachmentMediaSource => {
    if (revoked || released) throw Error("附件已释放");
    let disposed = false;
    const controllers = new Set<() => void>();
    const handle: AttachmentMediaSource = {
      src,
      purpose,
      get disposed() {
        return disposed;
      },
      revoke,
      retain() {
        if (disposed) throw Error("附件已释放");
        return lease();
      },
      bindController(stop) {
        let bound = true;
        const unbind = () => {
          if (!bound) return;
          bound = false;
          controllers.delete(unbind);
          stop();
        };
        if (disposed) unbind();
        else controllers.add(unbind);
        return unbind;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          for (const stop of [...controllers]) {
            try {
              stop();
            } catch {
              /* Stop remaining controllers before releasing. */
            }
          }
        } finally {
          controllers.clear();
          handles.delete(handle);
          finish();
        }
      },
    };
    handles.add(handle);
    return handle;
  };
  return lease();
}
export function createLeasedAttachmentMediaSource(
  grant: { url: string; purpose: "original" | "thumbnail" },
  release: () => Promise<void>,
): AttachmentMediaSource {
  return managedSource(grant.url, grant.purpose, release);
}
