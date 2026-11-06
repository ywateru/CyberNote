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
  let unmounted = false;
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
    const keysIgnored = () =>
      ["Escape", "Tab"].every((key) => {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        return !event.defaultPrevented;
      });
    overlay.hidden = true;
    const hiddenIgnored = keysIgnored();
    overlay.hidden = false;
    mount.remove();
    const disconnectedIgnored = keysIgnored();
    host.append(mount);
    source.dispose();
    const result = {
      closed,
      hidden: overlay.hidden,
      hasSrc: overlay.querySelector("img")!.hasAttribute("src"),
    };
    const disposedIgnored = keysIgnored();
    root.unmount();
    unmounted = true;
    return {
      ...result,
      inactiveKeyboardIgnored:
        hiddenIgnored &&
        disconnectedIgnored &&
        disposedIgnored &&
        keysIgnored() &&
        closed === 1,
    };
  } finally {
    if (!unmounted) root.unmount();
    source.dispose();
    host.remove();
  }
}
