// Real NoteEditor -> ReactNodeView -> MediaView -> AudioPlayer; authorized reads
// come from a freshly compiled real Rust Session/Store with synthetic media bytes.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { rust } from "./audio-card-rust-fixture.mjs";

const output = resolve(process.argv[2] || "artifacts/audio-card-ui/run01");
await mkdir(output, { recursive: true });
const disk = await statfs(output);
assert(disk.bavail * disk.bsize >= 2 * 1024 ** 3, "2 GiB guard");
const binary = process.env.NOTES_AUDIO_CARD_BINARY;
assert(binary);
const store = rust(binary, resolve(output, "store"));
let ws = await store.call("load_workspace");
const initialToken = {
  sessionId: ws.access.sessionId,
  epoch: ws.access.epoch,
  noteEpoch: null,
};
const note = await store.call("workspace_action", {
  action: { type: "createNote" },
  expected: initialToken,
});
const expected = { ...initialToken, noteEpoch: 0 },
  date = Date.UTC(2026, 10, 3, 15, 59, 59, 123),
  data = Buffer.from("synthetic-ui-bytes-only").toString("base64");
const known = (
  await store.call("store_attachment_operation", {
    operationId: randomUUID(),
    noteId: note.id,
    name: "这是非常长的真实录音标题用于验证窄屏下文字省略与播放按钮可达.webm",
    mime: "audio/webm",
    data,
    recordedAt: date,
    expected,
  })
).attachment;
const unknown = (
  await store.call("store_attachment_operation", {
    operationId: randomUUID(),
    noteId: note.id,
    name: "外部音频.webm",
    mime: "audio/webm",
    data,
    expected,
  })
).attachment;
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import NoteEditor from'/src/Editor.tsx';import{loadWorkspace,invalidateAccessRequests}from'/src/bridge.ts';import'/src/style.css';const root=createRoot(document.querySelector('#root'));window.invalidateRead=invalidateAccessRequests;window.mountNote=async(id,mobile=true)=>{const ws=await loadWorkspace();const a=ws.attachments.find(a=>a.id===id),n=ws.notes.find(n=>n.id===a.noteId);n.document={type:'doc',content:[{type:'paragraph'},{type:'attachment',attrs:{id:a.id,kind:a.kind,name:a.displayName}}]};flushSync(()=>root.render(React.createElement('div',{className:'app '+(mobile?'mobile':'desktop'),style:{display:'block',padding:16,width:'100vw',height:'100vh'}},React.createElement(NoteEditor,{key:'same-editor',note:n,onChange:()=>{},onReady:e=>window.editor=e,onFocus:()=>{}}))));};window.swap=id=>{const a=window.attachments.find(a=>a.id===id);let pos;window.editor.state.doc.descendants((n,p)=>{if(n.type.name==='attachment')pos=p;});flushSync(()=>window.editor.view.dispatch(window.editor.state.tr.setNodeMarkup(pos,undefined,{id:a.id,kind:a.kind,name:a.displayName})));return document.querySelector('.audio-recorded-at')?.textContent||null;};window.unmountNote=()=>flushSync(()=>root.render(null));`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve("artifacts/audio-card-ui-vite-cache"),
  plugins: [
    react(),
    {
      name: "real-audio-card-nodeview",
      enforce: "pre",
      resolveId: (id) =>
        id === "/__card.tsx"
          ? id
          : id === "@tauri-apps/api/core"
            ? "\0card-native-core"
            : undefined,
      load: (id) =>
        id === "/__card.tsx"
          ? entry
          : id === "\0card-native-core"
            ? "export const isTauri=()=>true;export const invoke=(...args)=>window.nativeInvoke(...args);"
            : undefined,
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
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__card.tsx"></script>',
      )
      .then((x) => res.end(x))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const results = [],
  errors = [],
  external = [],
  geometry = [];
let browser;
let mode = "normal",
  pending = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--mute-audio"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Shanghai",
  });
  await context.addInitScript(() => {
    const states = new WeakMap(),
      state = (a) => {
        if (!states.has(a))
          states.set(a, {
            duration: NaN,
            currentTime: 0,
            readyState: 0,
            paused: true,
            error: null,
            src: "",
          });
        return states.get(a);
      };
    for (const key of [
      "duration",
      "currentTime",
      "readyState",
      "paused",
      "error",
      "src",
    ])
      Object.defineProperty(HTMLMediaElement.prototype, key, {
        configurable: true,
        get() {
          return state(this)[key];
        },
        set(value) {
          state(this)[key] = value;
        },
      });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.pause = function () {
      state(this).paused = true;
      this.dispatchEvent(new Event("pause"));
    };
    HTMLMediaElement.prototype.play = function () {
      state(this).paused = false;
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    window.mediaReady = (duration) => {
      const a = document.querySelector("audio");
      a.duration = duration;
      a.readyState = 2;
      a.dispatchEvent(new Event("loadedmetadata"));
      a.dispatchEvent(new Event("canplay"));
    };
    window.mediaTime = (time) => {
      const a = document.querySelector("audio");
      a.currentTime = time;
      a.dispatchEvent(new Event("timeupdate"));
    };
  });
  const page = await context.newPage(),
    origin = `http://127.0.0.1:${server.address().port}`;
  await page.exposeFunction("nativeInvoke", async (command, params) => {
    if (command === "read_attachment") {
      if (mode === "fail") throw Error("受控读取失败");
      if (mode === "hold")
        return new Promise((resolve, reject) =>
          pending.push({ command, params, resolve, reject }),
        );
    }
    return store.call(command, params);
  });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:") || u.startsWith("blob:"))
      return route.continue();
    external.push(u);
    return route.abort();
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(origin + "/__check");
  await page.waitForFunction(() => !!window.mountNote);
  await page.evaluate((a) => (window.attachments = a), [known, unknown]);
  const knownDate = "2026年11月3日 23:59";
  const test = async (name, fn) => {
    await fn();
    results.push(name);
  };
  const mount = async (id = known.id, mobile = true) => {
    await page.evaluate(({ id, mobile }) => window.mountNote(id, mobile), {
      id,
      mobile,
    });
    await page.waitForFunction(() => !!window.editor);
  };
  const ready = async (seconds) => {
    await page.waitForFunction(() => document.querySelector("audio")?.src);
    await page.evaluate((x) => window.mediaReady(x), seconds);
  };
  await test("Known date/actual title, short total floors 2.60 while progress remains mm:ss", async () => {
    await mount();
    await page.getByText(knownDate, { exact: true }).waitFor();
    await ready(2.6);
    await page.getByText("音频 · 2秒", { exact: true }).waitFor();
    assert.equal(
      await page.locator(".audio-title-toggle strong").textContent(),
      known.displayName.replace(/\.[^.]+$/, ""),
    );
    await page.locator(".audio-title-toggle").click();
    await page.getByRole("slider", { name: "播放进度" }).waitFor();
    await page.evaluate(() => window.mediaTime(1.75));
    assert.equal(
      await page.locator(".audio-detail > span").textContent(),
      "0:01",
    );
    assert.equal(
      await page.locator(".audio-duration-mobile").textContent(),
      "音频 · 2秒",
    );
    await page.locator(".audio-title-toggle").click();
  });
  await test("Narrow/normal mobile actual three rows and reachable white play capsule", async () => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const g = await page.evaluate(() => {
        const rect = (n) => {
            const r = n.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              right: r.right,
              bottom: r.bottom,
            };
          },
          q = (s) => document.querySelector(s),
          title = q(".audio-title-toggle"),
          play = q(".audio-play-toggle");
        return {
          width: innerWidth,
          card: rect(q(".audio-card")),
          title: rect(title),
          strong: rect(title.querySelector("strong")),
          date: rect(q(".audio-recorded-at")),
          duration: rect(q(".audio-duration-mobile")),
          play: rect(play),
          playBackground: getComputedStyle(play).backgroundColor,
          playHitHeight: parseFloat(getComputedStyle(play, "::before").height),
          scrollWidth: document.documentElement.scrollWidth,
          desktopDuration: getComputedStyle(q(".audio-duration-desktop"))
            .display,
        };
      });
      assert(g.strong.bottom <= g.date.y + 0.1);
      assert(g.date.bottom <= g.duration.y + 0.1);
      assert(g.title.right <= g.play.x + 0.1);
      assert(g.play.right <= g.card.right + 0.1);
      assert(g.scrollWidth <= width);
      assert.equal(g.playBackground, "rgb(255, 255, 255)");
      assert(g.playHitHeight >= 44);
      assert.equal(g.desktopDuration, "none");
      geometry.push(g);
      await page.screenshot({
        path: resolve(output, `mobile-known-${width}.png`),
      });
    }
  });
  await test("Unknown old/external audio omits date; independent duration >=60 uses existing mm:ss", async () => {
    mode = "hold";
    await page.evaluate((id) => window.swap(id), unknown.id);
    await page.waitForFunction(
      () =>
        document.querySelector(".audio-title-toggle strong")?.textContent ===
        "外部音频",
    );
    while (!pending.length) await new Promise((r) => setTimeout(r, 5));
    assert.equal(
      await page.locator(".audio-recorded-at").count(),
      0,
      "new ID rendered before read resolves has no previous date",
    );
    const p = pending.shift();
    mode = "normal";
    p.resolve(await store.call(p.command, p.params));
    await ready(66.2);
    await page.getByText("音频 · 1:06", { exact: true }).waitFor();
    await page.screenshot({ path: resolve(output, "mobile-unknown.png") });
  });
  await test("Late successful read after ID switch cannot restore previous date", async () => {
    mode = "hold";
    await page.evaluate((id) => window.swap(id), known.id);
    while (!pending.length) await new Promise((r) => setTimeout(r, 5));
    mode = "normal";
    await page.evaluate((id) => window.swap(id), unknown.id);
    await page.waitForFunction(() => document.querySelector("audio")?.src);
    const p = pending.shift();
    p.resolve(await store.call(p.command, p.params));
    await page.waitForTimeout(50);
    assert.equal(await page.locator(".audio-recorded-at").count(), 0);
    assert.equal(
      await page.locator(".audio-title-toggle strong").textContent(),
      "外部音频",
    );
  });
  await test("Read failure clears metadata and reports actual error; subsequent known read recovers", async () => {
    mode = "fail";
    await page.evaluate((id) => window.swap(id), known.id);
    await page.getByText("受控读取失败", { exact: true }).waitFor();
    assert.equal(await page.locator(".audio-recorded-at").count(), 0);
    mode = "normal";
    await page.evaluate((id) => window.swap(id), unknown.id);
    await page.waitForFunction(() => document.querySelector("audio")?.src);
    await page.evaluate((id) => window.swap(id), known.id);
    await page.getByText(knownDate, { exact: true }).waitFor();
  });
  await test("Authority invalidation rejects pending authorized response without showing its date", async () => {
    await page.evaluate((id) => window.swap(id), unknown.id);
    await page.waitForFunction(() => document.querySelector("audio")?.src);
    mode = "hold";
    await page.evaluate((id) => window.swap(id), known.id);
    while (!pending.length) await new Promise((r) => setTimeout(r, 5));
    await page.evaluate(() => window.invalidateRead());
    const p = pending.shift();
    p.resolve(await store.call(p.command, p.params));
    await page.locator(".inline-error").waitFor();
    assert.equal(await page.locator(".audio-recorded-at").count(), 0);
    mode = "normal";
  });
  await test("Unmount rejects late read and no card/date revives", async () => {
    await page.evaluate(() => window.unmountNote());
    mode = "hold";
    await mount();
    while (!pending.length) await new Promise((r) => setTimeout(r, 5));
    await page.evaluate(() => window.unmountNote());
    const p = pending.shift();
    p.resolve(await store.call(p.command, p.params));
    await page.waitForTimeout(50);
    assert.equal(await page.locator(".audio-card").count(), 0);
    mode = "normal";
  });
  await test("Desktop keeps its existing title/录音 mm:ss row and hides mobile metadata", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mount(known.id, false);
    await page.waitForFunction(() =>
      document.querySelector(".audio-recorded-at"),
    );
    await ready(2.6);
    assert(await page.locator(".audio-duration-desktop").isVisible());
    assert.equal(
      await page.locator(".audio-duration-desktop").textContent(),
      "录音 · 0:02",
    );
    assert.equal(await page.locator(".audio-recorded-at").isVisible(), false);
    assert.equal(
      await page.locator(".audio-duration-mobile").isVisible(),
      false,
    );
    await page.screenshot({ path: resolve(output, "desktop-known.png") });
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const sources = {};
  for (const path of [
    "src/Editor.tsx",
    "src/bridge.ts",
    "src/recording-metadata.ts",
    "src/audio-playback.ts",
    "src/style.css",
  ])
    sources[path] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        status: "pass",
        browser: await browser.version(),
        results,
        geometry,
        sources,
        binarySHA256: createHash("sha256")
          .update(await readFile(binary))
          .digest("hex"),
        errors,
        external,
        limits: [
          "Actual mounted Editor/ReactNodeView/MediaView/AudioPlayer, production bridge metadata and access gate; shim only host IPC transport.",
          "Controlled HTML media readiness/progress, synthetic bytes, no decoder/microphone/device acceptance.",
          "Known and unknown metadata come from actual newly compiled Rust Session/Store reads; host errors/delays injected explicitly.",
          "Candidate layout at 320/390 CSS px and desktop1280; no original pixel measurement, dark/expanded interaction parity remains unknown.",
          "Authority test invalidates an in-flight bridge request; App teardown on access changes is covered by existing App boundary checks, not mounted here.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Audio card UI passed ${results.length} cases: ${output}/result.json`,
  );
} finally {
  await writeFile(
    resolve(output, "transport.json"),
    JSON.stringify(store.log, null, 2) + "\n",
  );
  await store.close();
  await browser?.close();
  await vite.close();
  await new Promise((done) => server.close(done));
}
