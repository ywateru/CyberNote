import { pathToFileURL } from "node:url";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw new Error("Set external PLAYWRIGHT_CORE_PATH and CHROME_PATH");
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
import { readFile } from "node:fs/promises";
const file = await readFile(
  "docs/verification/app-002-media/android-candidate01/managed-recording.webm",
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.route("http://audio.test/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html></html>",
    }),
  );
  await page.goto("http://audio.test/");
  console.log(
    JSON.stringify(
      await page.evaluate(
        async ({ base64, target }) => {
          const src = "data:audio/webm;codecs=opus;base64," + base64;
          const probe = new Audio();
          probe.muted = true;
          probe.preload = "auto";
          const log = [];
          const snap = (e) =>
            log.push({
              event: e,
              duration: String(probe.duration),
              time: String(probe.currentTime),
              ready: probe.readyState,
              error: probe.error?.message,
              seekable: Array.from(
                { length: probe.seekable.length },
                (_, i) => [
                  probe.seekable.start(i),
                  String(probe.seekable.end(i)),
                ],
              ),
            });
          for (const e of [
            "loadedmetadata",
            "durationchange",
            "canplay",
            "seeking",
            "seeked",
            "timeupdate",
            "error",
            "ended",
          ])
            probe.addEventListener(e, () => snap(e));
          probe.src = src;
          await new Promise((resolve, reject) => {
            probe.addEventListener("loadedmetadata", resolve, { once: true });
            probe.addEventListener("error", reject, { once: true });
          });
          snap("before-seek");
          probe.currentTime = target;
          await new Promise((r) => setTimeout(r, 2500));
          snap("after-wait");
          probe.removeAttribute("src");
          probe.load();
          const C = window.AudioContext || window.webkitAudioContext;
          const ctx = new C();
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          let decode;
          try {
            const start = performance.now();
            const b = await ctx.decodeAudioData(bytes.buffer);
            decode = {
              duration: b.duration,
              frames: b.length,
              sampleRate: b.sampleRate,
              channels: b.numberOfChannels,
              elapsed: performance.now() - start,
            };
          } catch (e) {
            decode = { error: String(e) };
          } finally {
            await ctx.close();
          }
          return { userAgent: navigator.userAgent, log, decode };
        },
        {
          base64: file.toString("base64"),
          target: Number(process.argv[2] || 1_000_000_000),
        },
      ),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
