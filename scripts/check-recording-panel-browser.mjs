// Actual RecordingPanel + RecordingSession; only media platform and monotonic time
// are controlled. No microphone, encoder, App/IPC, device, or pixel-parity claim.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error(
    "Provide existing PLAYWRIGHT_CORE_PATH and CHROME_PATH; no download.",
  );
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(process.argv[2] || "artifacts/recording-panel-browser");
await mkdir(output, { recursive: true });
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import RecordingPanel from '/src/RecordingPanel.tsx';import '/src/style.css';
const root=createRoot(document.querySelector('#root'));window.mountPanel=()=>root.render(React.createElement(React.StrictMode,null,React.createElement('div',{className:'app mobile',style:{position:'relative',height:'100vh',width:'100vw',padding:0}},React.createElement(RecordingPanel,{onCancel:()=>{window.platform.cancels++;root.render(null)},onDone:file=>{const p=window.platform;p.files.push(file);return new Promise((resolve,reject)=>p.saves.push({resolve,reject}));}}))));window.unmountPanel=()=>root.render(null);`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve("artifacts/recording-panel-vite-cache"),
  plugins: [
    react(),
    {
      name: "actual-recording-panel-check",
      resolveId: (id) => (id === "/__recording.tsx" ? id : undefined),
      load: (id) => (id === "/__recording.tsx" ? entry : undefined),
    },
  ],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__check") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__recording.tsx"></script>',
      )
      .then((s) => res.end(s))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
const results = [],
  errors = [],
  external = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--mute-audio"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    const p = (window.platform = {
      now: 0,
      requests: 0,
      starts: 0,
      pauses: 0,
      resumes: 0,
      stops: 0,
      trackStops: 0,
      closes: 0,
      disconnects: 0,
      cancels: 0,
      files: [],
      saves: [],
      recorders: [],
      intervals: new Map(),
      timeouts: new Map(),
      urls: [],
      revoked: [],
      config: {},
      snapshots: 0,
      audios: [],
      blobs: [],
      seq: 1,
    });
    Object.defineProperty(performance, "now", { value: () => p.now });
    window.setInterval = (fn, ms) => {
      const id = p.seq++;
      if (ms !== 50 && ms !== 100) return id;
      p.intervals.set(id, fn);
      return id;
    };
    window.clearInterval = (id) => p.intervals.delete(id);
    const realTimeout = window.setTimeout.bind(window),
      realClear = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => {
      if (ms !== 15000 && ms !== 5000) return realTimeout(fn, ms, ...args);
      const id = p.seq++;
      p.timeouts.set(id, fn);
      return id;
    };
    window.clearTimeout = (id) => {
      if (!p.timeouts.delete(id)) realClear(id);
    };
    p.advance = (ms, redraw = true) => {
      p.now += ms;
      if (redraw) [...p.intervals.values()].forEach((fn) => fn());
    };
    const track = {
      readyState: "live",
      addEventListener() {},
      removeEventListener() {},
      stop() {
        p.trackStops++;
      },
    };
    const stream = { getTracks: () => [track] };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => {
          p.requests++;
          return new Promise((resolve, reject) => {
            p.permission = { resolve: () => resolve(stream), reject };
            if (!p.config.deferPermission) resolve(stream);
          });
        },
      },
    });
    class ControlledRecorder {
      static isTypeSupported() {
        return true;
      }
      constructor() {
        this.state = "inactive";
        this.mimeType = p.config.mime ?? "audio/webm;codecs=opus";
        p.recorders.push(this);
      }
      start() {
        p.starts++;
        this.state = "recording";
        queueMicrotask(() => {
          p.lateData = this.ondataavailable;
          p.lateStop = this.onstop;
          p.lateError = this.onerror;
        });
      }
      pause() {
        p.pauses++;
        if (p.config.pauseError) throw Error("pause failed");
        this.state = "paused";
      }
      requestData() {
        p.snapshots++;
        if (p.config.snapshotError) throw Error("snapshot failed");
      }
      resume() {
        p.resumes++;
        this.state = "recording";
      }
      stop() {
        p.stops++;
        if (p.config.stopError) throw Error("stop failed");
        this.state = "inactive";
      }
    }
    window.MediaRecorder = ControlledRecorder;
    const NativeAudio = window.Audio;
    class ControlledAudio extends EventTarget {
      constructor() {
        super();
        this.src = "";
        this.duration = NaN;
        this.readyState = 0;
        this.position = 0;
        this.paused = true;
        this.seeking = false;
        this.error = null;
        this.ranges = [];
        this.requests = [];
        p.audios.push(this);
      }
      get currentTime() {
        return this.position;
      }
      set currentTime(value) {
        this.requests.push(value);
        this.seeking = true;
      }
      get seekable() {
        const r = this.ranges;
        return { length: r.length, start: (i) => r[i][0], end: (i) => r[i][1] };
      }
      emit(name) {
        this.dispatchEvent(new Event(name));
      }
      load() {
        this.error = null;
        this.readyState = 0;
        this.duration = NaN;
        this.ranges = [];
      }
      removeAttribute(name) {
        if (name === "src") this.src = "";
      }
      pause() {
        this.paused = true;
        this.emit("pause");
      }
      play() {
        if (p.config.holdPlay)
          return new Promise((resolve) => {
            this.resolvePlay = resolve;
          });
        this.paused = false;
        this.emit("play");
        return Promise.resolve();
      }
      ready(duration = 45, ranges = [[0, 45]]) {
        this.duration = duration;
        this.ranges = ranges;
        this.readyState = 2;
        this.emit("loadedmetadata");
        this.emit("canplay");
      }
      confirm(time) {
        this.position = time;
        this.seeking = false;
        this.emit("seeked");
      }
    }
    window.Audio = function (...args) {
      return p.config.preview
        ? new ControlledAudio()
        : new NativeAudio(...args);
    };
    p.pauseEvent = () => p.recorders.at(-1).onpause?.();
    window.AudioContext = class {
      createAnalyser() {
        return {
          frequencyBinCount: 32,
          disconnect: () => p.disconnects++,
          getByteFrequencyData: (array) => array.fill(12),
        };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect: () => p.disconnects++ };
      }
      close() {
        p.closes++;
        return Promise.resolve();
      }
    };
    p.emit = (text = "last bytes", stopped = true) => {
      const r = p.recorders.at(-1);
      r.ondataavailable?.({ data: new Blob([text], { type: r.mimeType }) });
      if (stopped) r.onstop?.();
    };
    p.timeout = () => [...p.timeouts.values()].forEach((fn) => fn());
    URL.createObjectURL = (blob) => {
      p.blobs.push(blob);
      const url = "blob:controlled-" + p.urls.length;
      p.urls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => p.revoked.push(url);
  });
  const page = await context.newPage(),
    origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:") || u.startsWith("blob:"))
      return route.continue();
    external.push(u);
    return route.abort();
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const phase = () =>
    page.locator("[data-recording-state]").getAttribute("data-recording-state");
  const state = async (expected) => {
    await page.waitForFunction(
      (expected) =>
        document.querySelector("[data-recording-state]")?.dataset
          .recordingState === expected,
      expected,
    );
    assert.equal(await phase(), expected);
  };
  const open = async (config = {}) => {
    await page.goto(origin + "/__check");
    await page.waitForFunction(() => !!window.mountPanel);
    await page.evaluate((config) => {
      Object.assign(window.platform.config, config);
      window.mountPanel();
    }, config);
    await state("idle");
  };
  const primary = () => page.locator(".recording-primary"),
    done = () => page.locator(".recording-done");
  const begin = async () => {
    await primary().click();
    await state("recording");
  };
  const paused = async () => {
    await begin();
    await primary().click();
    await state("paused");
  };
  const counts = () =>
    page.evaluate(() => {
      const p = window.platform;
      return {
        requests: p.requests,
        starts: p.starts,
        pauses: p.pauses,
        resumes: p.resumes,
        stops: p.stops,
        trackStops: p.trackStops,
        closes: p.closes,
        files: p.files.length,
        timers: p.intervals.size,
        deadlines: p.timeouts.size,
        urls: p.urls.length,
        revoked: p.revoked.length,
      };
    });
  const test = async (name, fn) => {
    await fn();
    results.push(name);
  };
  await test("StrictMode mount remains idle, zero capture and disabled Done", async () => {
    await open();
    assert.equal((await counts()).requests, 0);
    assert.ok(await done().isDisabled());
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:00.00",
    );
    await page.screenshot({ path: resolve(output, "mobile-idle.png") });
  });
  await test("Repeated explicit start during permission wait creates one real Session/recorder", async () => {
    await open({ deferPermission: true });
    await primary().click();
    await state("requesting");
    await page.evaluate(() =>
      document.querySelector(".recording-primary").click(),
    );
    assert.equal((await counts()).requests, 1);
    await page.evaluate(() => window.platform.permission.resolve());
    await state("recording");
    assert.equal((await counts()).starts, 1);
    assert.ok(await done().isDisabled());
  });
  await test("Monotonic active time survives delayed redraw, pause freezes and resume continues", async () => {
    await open();
    await begin();
    await page.evaluate(() => window.platform.advance(1070, false));
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:00.00",
    );
    await page.evaluate(() => window.platform.advance(0));
    await page.waitForFunction(
      () =>
        document.querySelector(".recording-time").textContent === "00:01.07",
    );
    await page.screenshot({ path: resolve(output, "mobile-recording.png") });
    await primary().click();
    await state("paused");
    await page.evaluate(() => window.platform.advance(9000));
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:01.07",
    );
    await primary().click();
    await state("recording");
    await page.evaluate(() => window.platform.advance(1530, false));
    await primary().click();
    await state("paused");
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:02.60",
    );
    assert.equal((await counts()).resumes, 1);
    await page.screenshot({ path: resolve(output, "mobile-paused.png") });
  });
  await test("Paused Done stops once, releases capture and awaits last data/onstop before one parent call", async () => {
    await done().click();
    await state("finalizing");
    assert.deepEqual(await counts(), {
      requests: 1,
      starts: 1,
      pauses: 2,
      resumes: 1,
      stops: 1,
      trackStops: 1,
      closes: 1,
      files: 0,
      timers: 0,
      deadlines: 1,
      urls: 0,
      revoked: 0,
    });
    await page.evaluate(() => {
      document.querySelector(".recording-done").click();
      window.platform.emit("first", false);
    });
    assert.equal((await counts()).files, 0);
    await page.evaluate(() => window.platform.emit("last"));
    await state("saving");
    assert.equal((await counts()).files, 1);
    assert.equal(
      await page.evaluate(() => window.platform.files[0].text()),
      "firstlast",
    );
    await page.evaluate(() => {
      document.querySelector(".recording-done").click();
      window.platform.saves[0].resolve();
    });
    await state("submitted");
    assert.equal((await counts()).files, 1);
    assert.ok(await done().isDisabled());
  });
  await test("Rejected parent submission keeps same File, displays error and retry never stops/captures again", async () => {
    await open();
    await paused();
    await done().click();
    await page.evaluate(() => window.platform.emit());
    await state("saving");
    await page.evaluate(() =>
      window.platform.saves[0].reject(Error("disk refused")),
    );
    await state("retry");
    assert.match(await page.getByRole("alert").textContent(), /disk refused/);
    await done().click();
    await state("saving");
    assert.equal(
      await page.evaluate(
        () => window.platform.files[0] === window.platform.files[1],
      ),
      true,
    );
    assert.equal((await counts()).stops, 1);
    assert.equal((await counts()).requests, 1);
    await page.evaluate(() => window.platform.saves[1].resolve());
    await state("submitted");
    await page.evaluate(() => window.unmountPanel());
    await page.waitForFunction(
      () => !document.querySelector("[data-recording-state]"),
    );
    assert.equal((await counts()).revoked, 1);
  });
  for (const [name, config, data] of [
    ["Empty recording", {}, ""],
    ["Missing MIME", { mime: "" }, "bytes"],
    ["Non-audio MIME", { mime: "video/webm" }, "bytes"],
  ])
    await test(
      name + " fails visibly without attachment submission",
      async () => {
        await open(config);
        await paused();
        await done().click();
        await page.evaluate((data) => window.platform.emit(data), data);
        await state("error");
        assert.equal((await counts()).files, 0);
        assert.ok(await page.getByRole("alert").isVisible());
        assert.equal((await counts()).trackStops, 1);
      },
    );
  await test("Unexpected onstop is an error, not implicit successful finish", async () => {
    await open();
    await begin();
    await page.evaluate(() => window.platform.emit());
    await state("error");
    assert.equal((await counts()).files, 0);
  });
  await test("Stop failure releases capture and shows actual error", async () => {
    await open({ stopError: true });
    await paused();
    await done().click();
    await state("error");
    assert.match(await page.getByRole("alert").textContent(), /stop failed/);
    assert.equal((await counts()).trackStops, 1);
    assert.equal((await counts()).files, 0);
  });
  await test("Missing final event times out, disposes and rejects later captured handlers", async () => {
    await open();
    await paused();
    await done().click();
    await state("finalizing");
    await page.evaluate(() => window.platform.timeout());
    await state("error");
    await page.evaluate(() => {
      window.platform.lateData({ data: new Blob(["late"]) });
      window.platform.lateStop();
    });
    assert.equal((await counts()).files, 0);
    assert.match(await page.getByRole("alert").textContent(), /超时/);
  });
  await test("Permission denial shows failure and never constructs recorder", async () => {
    await open({ deferPermission: true });
    await primary().click();
    await page.evaluate(() =>
      window.platform.permission.reject(Error("permission denied")),
    );
    await state("error");
    assert.equal((await counts()).starts, 0);
  });
  await test("Unmount during pending permission releases late stream without recorder or parent callback", async () => {
    await open({ deferPermission: true });
    await primary().click();
    await page.evaluate(() => window.unmountPanel());
    await page.waitForFunction(
      () => !document.querySelector("[data-recording-state]"),
    );
    await page.evaluate(() => window.platform.permission.resolve());
    await page.waitForFunction(() => window.platform.trackStops === 1);
    assert.equal((await counts()).starts, 0);
    assert.equal((await counts()).files, 0);
  });
  await test("Escape cancel releases live recording once and captured late events cannot submit", async () => {
    await open();
    await begin();
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.querySelector("[data-recording-state]"),
    );
    await page.evaluate(() => {
      window.platform.lateData({ data: new Blob(["late"]) });
      window.platform.lateStop();
    });
    assert.equal(await page.evaluate(() => window.platform.cancels), 1);
    assert.equal((await counts()).trackStops, 1);
    assert.equal((await counts()).files, 0);
  });
  await test("Unmount while waiting onstop gates captured late data/stop", async () => {
    await open();
    await paused();
    await done().click();
    await page.evaluate(() => window.unmountPanel());
    await page.waitForFunction(
      () => !document.querySelector("[data-recording-state]"),
    );
    await page.evaluate(() => {
      window.platform.lateData({ data: new Blob(["late"]) });
      window.platform.lateStop();
    });
    assert.equal((await counts()).files, 0);
    assert.equal((await counts()).deadlines, 0);
  });
  await test("Unmount during parent save does not pretend IPC was cancelled or issue a second save", async () => {
    await open();
    await paused();
    await done().click();
    await page.evaluate(() => window.platform.emit());
    await state("saving");
    await page.evaluate(() => window.unmountPanel());
    await page.waitForFunction(
      () => !document.querySelector("[data-recording-state]"),
    );
    await page.evaluate(() =>
      window.platform.saves[0].reject(Error("late rejection")),
    );
    assert.equal((await counts()).files, 1);
    // The final-file playback URL is created only after a visible retry, not
    // while the parent save is in flight; a late rejection cannot create it.
    assert.equal((await counts()).urls, 0);
    assert.equal((await counts()).revoked, 0);
  });
  await test("Three mobile states keep title, time, primary center and bottom Done in fixed regions", async () => {
    await open();
    const box = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [
            "header",
            ".waveform",
            ".recording-time",
            ".recording-controls",
            ".recording-done",
          ].map((sel) => {
            const r = document
              .querySelector(".recording-sheet " + sel)
              .getBoundingClientRect();
            return [sel, { x: r.x, y: r.y, width: r.width, height: r.height }];
          }),
        ),
      );
    const idle = await box();
    await begin();
    const recording = await box();
    await primary().click();
    await state("paused");
    const pause = await box();
    assert.deepEqual(recording, idle);
    assert.deepEqual(pause, idle);
    assert.ok(idle[".recording-done"].y > 844 * 0.85);
    assert.ok(
      idle[".recording-time"].y > 844 * 0.65 &&
        idle[".recording-time"].y < 844 * 0.72,
    );
    assert.equal(await page.locator(".recording-cancel").isVisible(), false);
    await writeFile(
      resolve(output, "geometry.json"),
      JSON.stringify(
        {
          viewport: { width: 390, height: 844 },
          idle,
          recording,
          paused: pause,
        },
        null,
        2,
      ) + "\n",
    );
  });
  await test("Paused preview waits actual pause/data; real media events drive play/time and confirmed skip", async () => {
    await open({ preview: true });
    await begin();
    await page.evaluate(() => window.platform.advance(4250));
    await primary().click();
    await state("paused");
    assert.equal(await page.evaluate(() => window.platform.snapshots), 0);
    assert.ok(
      await page
        .getByRole("button", { name: "播放录音", exact: true })
        .isDisabled(),
    );
    await page.evaluate(() => window.platform.pauseEvent());
    assert.equal(await page.evaluate(() => window.platform.snapshots), 1);
    await page.evaluate(() => window.platform.emit("prefix", false));
    await page.waitForFunction(() => window.platform.audios.length === 1);
    assert.ok(
      await page
        .getByRole("button", { name: "播放录音", exact: true })
        .isDisabled(),
    );
    await page.evaluate(() => window.platform.audios[0].ready());
    await page.getByRole("button", { name: "播放录音", exact: true }).click();
    await page.evaluate(() => {
      const a = window.platform.audios[0];
      a.position = 8.2;
      a.emit("timeupdate");
    });
    await page.waitForFunction(
      () =>
        document.querySelector(".recording-time").textContent === "00:08.20",
    );
    await page.getByRole("button", { name: "前进15秒", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.platform.audios[0].requests.at(-1)),
      23.2,
    );
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:08.20",
    );
    await page.evaluate(() => window.platform.audios[0].confirm(23.2));
    await page.waitForFunction(
      () =>
        document.querySelector(".recording-time").textContent === "00:23.20",
    );
    await page.getByRole("button", { name: "暂停回放", exact: true }).click();
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:04.25",
    );
    const controls = await page
      .locator(".recording-playback button")
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { width: r.width, height: r.height };
        }),
      );
    assert.ok(controls.every((r) => r.width >= 44 && r.height >= 44));
    assert.equal(await page.locator("audio[controls]").count(), 0);
    await page.screenshot({
      path: resolve(output, "mobile-preview-paused.png"),
    });
    await page.evaluate(() => window.unmountPanel());
    assert.equal((await counts()).revoked, 1);
  });
  await test("Continue seals late play before revoke and a new pause uses cumulative chunks and a new player", async () => {
    await open({ preview: true, holdPlay: true });
    await paused();
    await page.evaluate(() => {
      window.platform.pauseEvent();
      window.platform.emit("first", false);
    });
    await page.waitForFunction(() => window.platform.audios.length === 1);
    await page.evaluate(() => window.platform.audios[0].ready());
    await page.getByRole("button", { name: "播放录音", exact: true }).click();
    await primary().click();
    await state("recording");
    assert.equal(await page.evaluate(() => window.platform.audios[0].src), "");
    assert.equal((await counts()).revoked, 1);
    await page.evaluate(() => {
      const a = window.platform.audios[0];
      a.resolvePlay();
      a.emit("play");
      a.position = 99;
      a.emit("timeupdate");
    });
    assert.equal(
      await page.getByRole("button", { name: "暂停回放", exact: true }).count(),
      0,
    );
    await primary().click();
    await state("paused");
    await page.evaluate(() => {
      window.platform.pauseEvent();
      window.platform.emit("second", false);
    });
    await page.waitForFunction(() => window.platform.audios.length === 2);
    assert.equal(
      await page.evaluate(() => window.platform.blobs[1].text()),
      "firstsecond",
    );
    assert.ok(
      await page
        .getByRole("button", { name: "播放录音", exact: true })
        .isDisabled(),
    );
    await page.evaluate(() => window.unmountPanel());
    assert.equal((await counts()).urls, 2);
    assert.equal((await counts()).revoked, 2);
  });
  for (const failure of ["empty", "unsupported"])
    await test(
      failure +
        " prefix failure is visible while main recording can continue/finalize once",
      async () => {
        await open({ preview: true });
        await paused();
        await page.evaluate((failure) => {
          window.platform.pauseEvent();
          window.platform.emit(failure === "empty" ? "" : "prefix", false);
        }, failure);
        if (failure === "unsupported") {
          await page.waitForFunction(() => window.platform.audios.length === 1);
          await page.evaluate(() => {
            const a = window.platform.audios[0];
            a.error = { code: 4 };
            a.emit("error");
          });
        }
        await page.getByRole("alert").waitFor();
        assert.match(
          await page.getByRole("alert").textContent(),
          failure === "empty" ? /无可回放/ : /无法播放此录音格式/,
        );
        assert.ok(await done().isEnabled());
        await primary().click();
        await state("recording");
        await page.evaluate(() => window.platform.emit("resumed", false));
        await primary().click();
        await state("paused");
        await done().click();
        await page.evaluate(() => window.platform.emit("tail"));
        await state("saving");
        assert.equal((await counts()).stops, 1);
        assert.equal((await counts()).files, 1);
        assert.equal(
          await page.evaluate(() => window.platform.files[0].text()),
          failure === "empty" ? "resumedtail" : "prefixresumedtail",
        );
        await page.evaluate(() => window.platform.saves[0].resolve());
        await state("submitted");
      },
    );
  await test("Done during pending snapshot rejects old preview and delivers all final chunks once", async () => {
    await open({ preview: true });
    await paused();
    await page.evaluate(() => window.platform.pauseEvent());
    await done().click();
    await state("finalizing");
    await page.evaluate(() => {
      window.platform.emit("request-tail", false);
      window.platform.emit("final-tail");
    });
    await state("saving");
    assert.equal((await counts()).files, 1);
    assert.equal((await counts()).urls, 0);
    assert.equal(
      await page.evaluate(() => window.platform.files[0].text()),
      "request-tailfinal-tail",
    );
    await page.evaluate(() => window.platform.saves[0].resolve());
    await state("submitted");
  });
  await test("Cancel active preview and unmount pending snapshot reject late callbacks with no URL revival", async () => {
    await open({ preview: true, holdPlay: true });
    await paused();
    await page.evaluate(() => {
      window.platform.pauseEvent();
      window.platform.emit("prefix", false);
    });
    await page.waitForFunction(() => window.platform.audios.length === 1);
    await page.evaluate(() => window.platform.audios[0].ready());
    await page.getByRole("button", { name: "播放录音", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.querySelector("[data-recording-state]"),
    );
    await page.evaluate(() => {
      const a = window.platform.audios[0];
      a.resolvePlay();
      a.emit("play");
    });
    assert.equal(await page.evaluate(() => window.platform.audios[0].src), "");
    assert.equal((await counts()).revoked, 1);
    assert.equal((await counts()).files, 0);
    await open({ preview: true });
    await paused();
    await page.evaluate(() => window.platform.pauseEvent());
    await page.evaluate(() => window.unmountPanel());
    await page.waitForFunction(
      () => !document.querySelector("[data-recording-state]"),
    );
    await page.evaluate(() => {
      window.platform.lateData({ data: new Blob(["late"]) });
      window.platform.lateStop();
    });
    assert.equal((await counts()).deadlines, 0);
    assert.equal((await counts()).urls, 0);
    assert.equal((await counts()).files, 0);
  });
  await test("Reload after media failure disables real Panel controls until new readiness", async () => {
    await open({ preview: true });
    await paused();
    await page.evaluate(() => {
      window.platform.pauseEvent();
      window.platform.emit("prefix", false);
    });
    await page.waitForFunction(() => window.platform.audios.length === 1);
    await page.evaluate(() => window.platform.audios[0].ready());
    assert.ok(
      await page
        .getByRole("button", { name: "播放录音", exact: true })
        .isEnabled(),
    );
    await page.evaluate(() => {
      const a = window.platform.audios[0];
      a.error = { code: 4 };
      a.readyState = 0;
      a.emit("error");
    });
    await page.getByRole("button", { name: "重试回放", exact: true }).click();
    assert.ok(
      await page
        .getByRole("button", { name: "播放录音", exact: true })
        .isDisabled(),
    );
    assert.ok(
      await page
        .getByRole("button", { name: "前进15秒", exact: true })
        .isDisabled(),
    );
    await page.evaluate(() => {
      const a = window.platform.audios[0];
      a.duration = 45;
      a.readyState = 1;
      a.emit("loadedmetadata");
    });
    assert.ok(
      await page
        .getByRole("button", { name: "播放录音", exact: true })
        .isDisabled(),
    );
    await page.evaluate(() => window.platform.audios[0].ready());
    assert.ok(
      await page
        .getByRole("button", { name: "播放录音", exact: true })
        .isEnabled(),
    );
    assert.ok(
      await page
        .getByRole("button", { name: "前进15秒", exact: true })
        .isEnabled(),
    );
    assert.equal((await counts()).stops, 0);
    await page.evaluate(() => window.unmountPanel());
  });
  await test("Small mobile playback/error controls retain 44px targets and separate notice/primary regions", async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    await open({ preview: true });
    await paused();
    await page.evaluate(() => {
      window.platform.pauseEvent();
      window.platform.emit("prefix", false);
    });
    await page.waitForFunction(() => window.platform.audios.length === 1);
    await page.evaluate(() => {
      const a = window.platform.audios[0];
      a.error = { code: 4 };
      a.emit("error");
    });
    await page.getByRole("button", { name: "重试回放", exact: true }).waitFor();
    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
        };
      };
      return {
        waveform: rect(".waveform"),
        time: rect(".recording-time"),
        notice: rect(".recording-notice"),
        retry: rect(".recording-playback-retry"),
        playback: rect(".recording-playback"),
        primary: rect(".recording-primary"),
        done: rect(".recording-done"),
        buttons: [
          ...document.querySelectorAll(".recording-playback button"),
        ].map((n) => {
          const r = n.getBoundingClientRect();
          return { width: r.width, height: r.height };
        }),
      };
    });
    assert.ok(geometry.buttons.every((r) => r.width >= 44 && r.height >= 44));
    for (const r of [geometry.primary, geometry.done, geometry.retry])
      assert.ok(r.width >= 44 && r.height >= 44);
    assert.ok(geometry.waveform.bottom <= geometry.retry.y);
    assert.ok(geometry.retry.bottom <= geometry.time.y);
    assert.ok(geometry.notice.bottom <= geometry.playback.y);
    assert.ok(geometry.playback.bottom <= geometry.primary.y);
    assert.ok(geometry.primary.bottom <= 568);
    await page.screenshot({
      path: resolve(output, "mobile-small-preview-error.png"),
    });
    await writeFile(
      resolve(output, "small-preview-geometry.json"),
      JSON.stringify(geometry, null, 2) + "\n",
    );
    await page.evaluate(() => window.unmountPanel());
    await page.setViewportSize({ width: 390, height: 844 });
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        kind: "actual-production-recording-panel-with-controlled-platform",
        status: "pass",
        browser: await browser.version(),
        checks: results.length,
        results,
        pageErrors: errors,
        externalRequests: external,
        limits: [
          "Real mounted production RecordingPanel and production RecordingSession; fake browser media/time boundaries only",
          "No physical microphone, encoded prefix, audible playback, native app or Android acceptance; preview checks use controlled actual media event boundaries",
          "No App/Editor/store/IPC/durable body ACK/cold persistence acceptance",
          "390×844 headless emulation layout relationships only; original 224×480 compressed frames do not establish pixel parity",
          "Local cancel gates component callbacks and releases capture; cannot undo an already-sent parent IPC",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Recording panel passed ${results.length} checks: ${output}/result.json`,
  );
} finally {
  await browser?.close();
  await vite.close();
  await new Promise((done) => server.close(done));
}
