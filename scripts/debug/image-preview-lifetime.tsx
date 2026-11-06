import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ImagePreview } from "../../src/ImagePreview";
import { createAttachmentMediaSource } from "../../src/attachment-media";
export async function probeImageSourceDisposal() {
  const host = document.createElement("div");
  host.className = "app";
  document.body.append(host);
  const trigger = document.createElement("button");
  host.append(trigger);
  let closed = 0;
  const source = createAttachmentMediaSource(
    {
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=",
      mime: "image/png",
    },
    "image",
  );
  const mount = document.createElement("div");
  host.append(mount);
  const root = createRoot(mount);
  try {
    root.render(
      createElement(ImagePreview, {
        request: {
          id: "lifetime80",
          source,
          name: "lifetime.png",
          mime: "image/png",
          bytes: 68,
          trigger,
        },
        onClose: () => closed++,
      }),
    );
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
    const overlay = host.querySelector<HTMLElement>(".image-preview")!;
    source.dispose();
    return {
      closed,
      hidden: overlay.hidden,
      hasSrc: overlay.querySelector("img")!.hasAttribute("src"),
    };
  } finally {
    root.unmount();
    source.dispose();
    host.remove();
  }
}
