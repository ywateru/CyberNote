// Browser-only contract fixture: real component, observed fetch boundary.
import React from "react";
import { createRoot } from "react-dom/client";
import Waveform from "../../../src/AudioWaveform";
export async function checkWaveformBudgets() {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element),
    nativeFetch = window.fetch;
  let reads = 0;
  window.fetch = (...args) => {
    if (String(args[0]).endsWith("/wave-budget")) {
      reads++;
      return Promise.resolve(new Response("", { status: 404 }));
    }
    return nativeFetch(...args);
  };
  const show = async (bytes: number | undefined, duration: number | null) => {
    root.render(
      <Waveform
        src={location.origin + "/wave-budget"}
        bytes={bytes}
        duration={duration}
        time={0}
        disabled={false}
        seek={() => {}}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 35));
    return reads;
  };
  try {
    return {
      unknownSize: await show(undefined, 2),
      oversize: await show(8 * 1024 * 1024 + 1, 2),
      unknownDuration: await show(100, null),
      longDuration: await show(100, 301),
      bounded: await show(100, 2),
    };
  } finally {
    root.unmount();
    element.remove();
    window.fetch = nativeFetch;
  }
}
