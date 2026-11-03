// Optional offline browser integration check, with externally available tooling:
// PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core/index.mjs CHROME_PATH=/absolute/path/to/chrome node scripts/check-audio-playback-browser.mjs [output-directory]
// No package build, device, microphone, original media mutation or audible output.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";

if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw new Error(
    "Set PLAYWRIGHT_CORE_PATH and CHROME_PATH to existing external browser tooling; do not add dependencies.",
  );
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(process.argv[2] || "artifacts/audio-playback-browser");
await mkdir(output, { recursive: true });
const mediaPath =
  "docs/verification/app-002-media/android-candidate01/managed-recording.webm";
const bytes = await readFile(mediaPath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(
  sha256,
  "cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f",
);
const src = "data:audio/webm;codecs=opus;base64," + bytes.toString("base64");
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve("artifacts/audio-vite-cache"),
  plugins: [
    react(),
    {
      name: "audio-check-entry",
      resolveId(id) {
        if (id === "/__audio_check_entry.tsx") return id;
      },
      load(id) {
        if (id === "/__audio_check_entry.tsx")
          return `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {AudioPlayer} from '/src/Editor.tsx';
      const root=createRoot(document.querySelector('#root'));
      window.mountAudio=(src,name='真实录音.webm')=>root.render(React.createElement(AudioPlayer,{src,name}));
      window.unmountAudio=()=>root.render(null);
    `;
      },
    },
  ],
  server: { middlewareMode: true },
  appType: "custom",
});
const server = createHttpServer((req, res) => {
  if (req.url === "/__audio_check") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><html><body><div id="root"></div><script type="module" src="/__audio_check_entry.tsx"></script></body></html>',
      )
      .then((html) => res.end(html))
      .catch((error) => {
        res.statusCode = 500;
        res.end(String(error));
      });
  } else vite.middlewares(req, res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--mute-audio"],
  });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const external = [];
  await page.route("**/*", (route) => {
    if (
      route.request().url().startsWith(origin) ||
      route.request().url().startsWith("data:")
    )
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  // Observe only the independent probe constructor. The production seek, error
  // handling, cleanup and React controls are unmodified. No probe may play.
  await page.addInitScript(() => {
    window.__probes = [];
    const NativeAudio = window.Audio;
    window.Audio = function (...args) {
      const a = new NativeAudio(...args);
      const observation = { element: a, events: [], playCalls: 0 };
      for (const event of [
        "loadedmetadata",
        "durationchange",
        "seeking",
        "seeked",
        "error",
        "play",
      ])
        a.addEventListener(event, () =>
          observation.events.push({
            event,
            duration: String(a.duration),
            time: String(a.currentTime),
            muted: a.muted,
            paused: a.paused,
          }),
        );
      const play = a.play.bind(a);
      a.play = (...p) => {
        observation.playCalls++;
        return play(...p);
      };
      window.__probes.push(observation);
      return a;
    };
    window.Audio.prototype = NativeAudio.prototype;
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(origin + "/__audio_check");
  await page.waitForFunction(() => !!window.mountAudio);
  await page.evaluate((src) => window.mountAudio(src), src);
  await page.getByText("录音 · 1:06", { exact: true }).waitFor();
  await page.getByRole("button", { name: "显示录音进度" }).click();
  const snapshot = () =>
    page.evaluate(() => {
      const a = document.querySelector("audio");
      const range = document.querySelector('input[type="range"]');
      return {
        label: document.querySelector(".audio-summary small")?.textContent,
        max: Number(range?.max),
        progress: Number(range?.value),
        currentTime: a?.currentTime,
        duration: String(a?.duration),
        paused: a?.paused,
        error: a?.error?.message ?? null,
        alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(
          (a) => a.textContent,
        ),
      };
    });
  const loaded = await snapshot();
  assert.equal(loaded.label, "录音 · 1:06");
  assert.equal(loaded.currentTime, 0);
  assert.equal(loaded.paused, true);
  assert.ok(loaded.max > 66 && loaded.max < 67);
  assert.equal(loaded.alerts.length, 0);
  await page.locator('input[type="range"]').fill("30");
  await page.waitForFunction(
    () => Math.abs(document.querySelector("audio").currentTime - 30) < 0.1,
  );
  const middle = await snapshot();
  assert.equal(middle.progress, 30);
  await page.getByRole("button", { name: "前进15秒" }).click();
  await page.waitForFunction(
    () => Math.abs(document.querySelector("audio").currentTime - 45) < 0.1,
  );
  await page.getByRole("button", { name: "后退15秒" }).click();
  await page.waitForFunction(
    () => Math.abs(document.querySelector("audio").currentTime - 30) < 0.1,
  );
  await page.locator('input[type="range"]').fill("0");
  await page.getByRole("button", { name: "后退15秒" }).click();
  const lower = await snapshot();
  assert.equal(lower.currentTime, 0);
  await page.locator('input[type="range"]').fill("66");
  await page.getByRole("button", { name: "前进15秒" }).click();
  const upper = await snapshot();
  assert.ok(Math.abs(upper.currentTime - loaded.max) < 0.1);
  await page.locator('input[type="range"]').fill("10");
  // Inject one actual element play rejection to verify that the rendered
  // production controller exposes it. Restore before explicit user retry.
  await page.evaluate(() => {
    const a = document.querySelector("audio");
    window.__play = a.play;
    a.play = () =>
      Promise.reject(new DOMException("check denied", "NotAllowedError"));
  });
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "无法播放录音" }).waitFor();
  const rejected = await snapshot();
  await page.evaluate(() => {
    const a = document.querySelector("audio");
    a.play = window.__play;
    a.muted = true;
  });
  await page.getByRole("button", { name: "重试录音" }).click();
  await page.getByRole("button", { name: "暂停", exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector("audio").currentTime > 10.1,
  );
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await snapshot();
  assert.equal(paused.paused, true);
  assert.equal(paused.alerts.length, 0);
  // Capture old real DOM and probe references before changing src. Their late
  // events and rejected promises must not alter the newly mounted player.
  await page.evaluate(() => {
    window.__oldAudio = document.querySelector("audio");
  });
  await page.evaluate(() =>
    window.mountAudio("data:audio/wav;base64,AAAA", "损坏录音.wav"),
  );
  await page.getByRole("alert").waitFor();
  const decodeError = await snapshot();
  assert.match(
    decodeError.alerts.join(""),
    /无法播放此录音格式|解码失败|加载失败/,
  );
  await page.getByRole("button", { name: "重试录音" }).click();
  await page.getByRole("alert").waitFor();
  await page.evaluate((src) => window.mountAudio(src, "再次读取.webm"), src);
  await page.getByText("录音 · 1:06", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.__oldAudio.dispatchEvent(new Event("error"));
    window.__oldAudio.dispatchEvent(new Event("timeupdate"));
  });
  const switched = await snapshot();
  assert.equal(switched.currentTime, 0);
  assert.equal(switched.paused, true);
  assert.equal(switched.alerts.length, 0);
  // A separate synthesized finite WAV exercises the ordinary metadata path.
  // It is never substituted for or written over the preserved real recording.
  const wav = Buffer.alloc(44 + 16000 * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  const beforeFiniteProbes = await page.evaluate(() => window.__probes.length);
  await page.evaluate(
    (src) => window.mountAudio(src, "有限WAV.wav"),
    "data:audio/wav;base64," + wav.toString("base64"),
  );
  await page.getByText("录音 · 0:02", { exact: true }).waitFor();
  await page.getByRole("button", { name: "显示录音进度" }).click();
  const finiteMetadata = await snapshot();
  assert.equal(finiteMetadata.max, 2);
  assert.equal(finiteMetadata.currentTime, 0);
  assert.equal(finiteMetadata.paused, true);
  assert.equal(
    await page.evaluate(() => window.__probes.length),
    beforeFiniteProbes,
  );
  await page.evaluate(() => window.unmountAudio());
  await page.waitForFunction(() => !document.querySelector("audio"));
  const probes = await page.evaluate(() =>
    window.__probes.map((p) => ({
      events: p.events,
      playCalls: p.playCalls,
      released: !p.element.getAttribute("src"),
      paused: p.element.paused,
    })),
  );
  assert.ok(probes.length >= 2);
  assert.ok(probes.every((p) => p.playCalls === 0 && p.released && p.paused));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.equal(
    createHash("sha256")
      .update(await readFile(mediaPath))
      .digest("hex"),
    sha256,
  );
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        userAgent: await page.evaluate(() => navigator.userAgent),
        media: { path: mediaPath, bytes: bytes.length, sha256 },
        loaded,
        middle,
        lower,
        upper,
        rejected,
        paused,
        decodeError,
        switched,
        finiteMetadata,
        probes,
        checks: [
          "actual production AudioPlayer and controller",
          "ordinary finite WAV metadata creates no probe",
          "real WebM Infinity → finite platform probe",
          "no automatic play; probes never play",
          "range / middle seek / ±15s / both bounds",
          "injected play rejection visible and explicit muted retry",
          "actual corrupt media error visible and retryable",
          "source change and old real DOM events",
          "unmount cleans probes",
          "fixture unchanged",
          "no external browser requests",
        ],
        pageErrors: errors,
        externalRequests: external,
        limitations: [
          "Headless Chrome desktop only; installed Android WebView91 and macOS app remain unverified",
          "Host browser output muted; no microphone or audible capture acceptance",
          "Playback error injection is disclosed; corrupt media error is platform-generated",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Offline real-media production AudioPlayer integration checks passed: " +
      resolve(output, "result.json"),
  );
} finally {
  await browser?.close();
  await vite.close();
  await new Promise((resolve) => server.close(resolve));
}
