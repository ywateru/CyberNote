// Actual shared RecordingView projection; no native/media/device operations.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const output = resolve(process.argv[2]);
const baseline = process.argv.includes("--baseline");
const compareArg = process.argv.indexOf("--compare");
const compare = compareArg < 0 ? null : resolve(process.argv[compareArg + 1]);
await mkdir(output, { recursive: true });
const oldSources = new Map(
  baseline
    ? ["src/RecordingView.tsx", "src/RecordingPanel.css"].map((p) => [
        resolve(p),
        execFileSync("git", ["show", `a4af6b8:${p}`], { encoding: "utf8" }),
      ])
    : [],
);
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const entry = `import React from'react';import{createRoot}from'react-dom/client';import RecordingView from'/src/RecordingView.tsx';import'/src/style.css';const root=createRoot(document.querySelector('#root'));
const date=new Date();date.setHours(10,26,0,0);const base={sequence:1,phase:'paused',openedAt:date.getTime(),recordedAt:date.getTime(),elapsed:2600,paused:true,canToggle:true,canFinish:true,notice:'',hasError:false,position:2600,duration:2600,previewPosition:true,playing:false,playPending:false,previewPending:false,seeking:false,canPlay:true,canSeek:true,canRetryPreview:false,seekable:[[0,2600]],samples:[]};window.actions=[];window.mount=(mobile,patch={},dark=false)=>{window.actions=[];root.render(<div className={'app '+(mobile?'mobile':'desktop')+(dark?' dark':'')} style={{position:'relative',height:'100vh',width:'100vw',padding:0,display:'block'}}><RecordingView mobile={mobile} state={{...base,...patch}} act={a=>window.actions.push(a)} onPresentation={mobile?undefined:()=>{}}/></div>)};`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    react(),
    {
      name: "mobile-recording59",
      enforce: "pre",
      resolveId: (id) => (id === "/__mobile59.tsx" ? id : undefined),
      load: (id) => (id === "/__mobile59.tsx" ? entry : oldSources.get(id)),
    },
  ],
  server: { middlewareMode: true, host: "127.0.0.1", hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__mobile59") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__mobile59.tsx"></script>',
      )
      .then((s) => res.end(s));
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
const result = {
  boundary:
    "actual shared View, controlled valid state projection and action sink; no media/native/device",
  baseline,
  checks: [],
  layouts: {},
  errors: [],
  external: [],
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 392, height: 840 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  page.on("pageerror", (e) => result.errors.push(String(e)));
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:")) return route.continue();
    result.external.push(u);
    return route.abort();
  });
  await page.goto(origin + "/__mobile59");
  await page.waitForFunction(() => !!window.mount);
  const mount = async (mobile, patch = {}, dark = false) => {
    await page.evaluate(
      ({ mobile, patch, dark }) => window.mount(mobile, patch, dark),
      { mobile, patch, dark },
    );
    await page.locator(".recording-time").waitFor();
    await page.evaluate(() => {
      document.activeElement?.blur();
      return new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    });
  };
  const snap = async (name) => {
    const layout = await page.evaluate(() => {
      const r = (e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      const sels = [
        ".recording-sheet",
        ".waveform",
        ".recording-time",
        ".recording-playback",
        ".recording-primary",
        ".recording-done",
        ".recording-notice",
        ".recording-playback-retry",
      ];
      return {
        dom: document.querySelector(".recording-backdrop").outerHTML,
        computed: [
          ...document.querySelectorAll(
            ".recording-backdrop, .recording-backdrop *",
          ),
        ].map((e) => {
          const style = getComputedStyle(e);
          return Object.fromEntries(
            [...style].map((k) => [k, style.getPropertyValue(k)]),
          );
        }),
        regions: Object.fromEntries(
          sels.map((s) => {
            const e = document.querySelector(s);
            return [
              s,
              e
                ? {
                    ...r(e),
                    color: getComputedStyle(e).color,
                    weight: getComputedStyle(e).fontWeight,
                  }
                : null,
            ];
          }),
        ),
        buttons: [
          ...document.querySelectorAll(".recording-playback button"),
        ].map((e) => ({
          ...r(e),
          label: e.getAttribute("aria-label"),
          disabled: e.disabled,
          hit: [0.15, 0.5, 0.85].every((v) =>
            e.contains(
              document.elementFromPoint(
                e.getBoundingClientRect().x +
                  e.getBoundingClientRect().width * v,
                e.getBoundingClientRect().y +
                  e.getBoundingClientRect().height / 2,
              ),
            ),
          ),
          svg: r(e.querySelector("svg")),
        })),
      };
    });
    await writeFile(resolve(output, name + ".dom.txt"), layout.dom);
    const bytes = await page.screenshot({
      path: resolve(output, name + ".png"),
    });
    layout.pngSha256 = sha(bytes);
    result.layouts[name] = layout;
    if (compare && name.startsWith("desktop")) {
      layout.pngBytesUnchanged =
        sha(await readFile(resolve(compare, name + ".png"))) ===
        layout.pngSha256;
      assert.equal(
        await readFile(resolve(compare, name + ".dom.txt"), "utf8"),
        layout.dom,
      );
      const previous = JSON.parse(
        await readFile(resolve(compare, "result.json"), "utf8"),
      ).layouts[name];
      assert.deepEqual(layout.computed, previous.computed);
      assert.deepEqual(layout.regions, previous.regions);
      assert.deepEqual(layout.buttons, previous.buttons);
    }
  };
  const actions = () => page.evaluate(() => window.actions);
  const button = (i) => page.locator(".recording-playback button").nth(i);
  const assertNoticeClear = (l) => {
    for (const selector of [".recording-notice", ".recording-playback-retry"]) {
      const r = l.regions[selector];
      assert(r.y >= l.regions[".waveform"].y + l.regions[".waveform"].height);
      assert(r.y + r.height <= l.regions[".recording-time"].y);
    }
    const n = l.regions[".recording-notice"],
      retry = l.regions[".recording-playback-retry"];
    assert(n.x + n.width <= retry.x);
  };
  const cases = [
    [
      "idle",
      {
        phase: "idle",
        elapsed: 0,
        position: 0,
        duration: 0,
        canPlay: false,
        canSeek: false,
        previewPosition: false,
      },
    ],
    [
      "recording",
      {
        phase: "recording",
        elapsed: 1070,
        position: 1070,
        paused: false,
        previewPosition: false,
        canPlay: false,
        canSeek: false,
      },
    ],
    ["paused", {}],
    ["playing", { playing: true, canToggle: false }],
    ["pending", { playPending: true, canToggle: false }],
    [
      "error",
      {
        hasError: true,
        notice: "回放失败，请重试",
        canRetryPreview: true,
        canPlay: false,
      },
    ],
    [
      "saving",
      {
        phase: "saving",
        canToggle: false,
        canPlay: false,
        canSeek: false,
        notice: "正在保存录音",
      },
    ],
  ];
  for (const [name, patch] of cases) {
    await mount(true, patch);
    await snap("mobile-" + name + "-392x840");
    const l = result.layouts["mobile-" + name + "-392x840"];
    assert(l.buttons.every((b) => b.hit));
    if (name === "error" && !baseline) assertNoticeClear(l);
    for (let i = 0; i < 3; i++) {
      const b = l.buttons[i];
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    }
    const expected = [];
    if (["paused", "playing"].includes(name))
      expected.push(
        { action: "skip", seconds: -15 },
        { action: "playback" },
        { action: "skip", seconds: 15 },
      );
    else if (name === "pending" || name === "error")
      expected.push(
        { action: "skip", seconds: -15 },
        { action: "skip", seconds: 15 },
      );
    assert.deepEqual(await actions(), expected);
    if (name === "playing") assert.equal(l.buttons[1].label, "暂停回放");
    if (name === "error") {
      await page.getByRole("button", { name: "重试回放", exact: true }).click();
      assert.deepEqual((await actions()).at(-1), { action: "preview-retry" });
    }
  }
  result.checks.push(
    "seven mobile states: real touch hit tests and existing actions; disabled playback emits none; playing displays pause",
  );
  for (const [w, h, dark] of [
    [320, 568, false],
    [280, 600, false],
    [392, 840, true],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await mount(true, {}, dark);
    const name = `mobile-paused-${w}x${h}${dark ? "-dark" : ""}`;
    await snap(name);
    const l = result.layouts[name];
    assert(l.buttons.every((b) => b.hit));
    assert(l.buttons[0].x + l.buttons[0].width <= l.buttons[1].x);
    assert(l.buttons[1].x + l.buttons[1].width <= l.buttons[2].x);
    for (const b of l.buttons) {
      assert(b.svg.x >= b.x - 1 && b.svg.x + b.svg.width <= b.x + b.width + 1);
      assert(
        b.svg.y >= b.y - 1 && b.svg.y + b.svg.height <= b.y + b.height + 1,
      );
    }
    await button(1).click();
    assert.deepEqual(await actions(), [{ action: "playback" }]);
  }
  result.checks.push(
    "280/320 narrow and dark: icons inside actual hit boxes, buttons disjoint and playback action reachable",
  );
  for (const [w, h] of [
    [320, 568],
    [280, 600],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await mount(true, {
      hasError: true,
      notice: "无法回放这段录音，请重试。录音仍保留，完成后可保存。",
      canRetryPreview: true,
      canPlay: false,
    });
    const name = `mobile-error-${w}x${h}`;
    await snap(name);
    const l = result.layouts[name];
    if (!baseline)
      assert(
        l.regions[".recording-notice"].y +
          l.regions[".recording-notice"].height <=
          l.buttons[1].y,
        "error notice overlaps playback touch row",
      );
    if (!baseline) assertNoticeClear(l);
    assert(l.buttons.every((b) => b.hit));
    await page.getByRole("button", { name: "重试回放", exact: true }).click();
    await button(0).click();
    await page.getByRole("button", { name: "完成录音", exact: true }).click();
    assert.deepEqual(await actions(), [
      { action: "preview-retry" },
      { action: "skip", seconds: -15 },
      { action: "finish" },
    ]);
    await mount(true, {
      phase: "saving",
      notice: "正在保存录音，请稍候",
      canToggle: false,
      canPlay: false,
      canSeek: false,
    });
    await snap(`mobile-saving-${w}x${h}`);
    for (let i = 0; i < 3; i++) {
      const b = await button(i).boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    }
    assert.deepEqual(await actions(), []);
  }
  result.checks.push(
    "narrow long error notice clear of playback row, retry/skip/finish actionable; busy transport emits no action",
  );
  for (const [w, h, dark, patch] of [
    [280, 467, false, {}],
    [320, 600, true, { playing: true, canToggle: false }],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await mount(false, patch, dark);
    await snap(`desktop-${w}x${h}${dark ? "-dark" : ""}`);
  }
  result.checks.push(
    compare
      ? "desktop DOM/all computed styles/geometry unchanged; PNG byte equality recorded separately without masks"
      : "desktop baseline bytes preserved",
  );
  // Evidence-only candidate styles, applied after canonical snapshots/actions.
  if (process.argv.includes("--candidates")) {
    await page.setViewportSize({ width: 392, height: 840 });
    await mount(true);
    for (const weight of [600, 650, 700]) {
      const style = await page.addStyleTag({
        content: `.mobile .recording-backdrop .recording-sheet .recording-time {font-weight:${weight};color:#000}`,
      });
      await snap(`candidate-timer-${weight}`);
      await style.evaluate((e) => e.remove());
    }
  }
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.external, []);
  result.status = Object.values(result.layouts).some(
    (l) => l.pngBytesUnchanged === false,
  )
    ? "VIEW_PASS_DESKTOP_RASTER_OPEN"
    : "PASS";
} catch (e) {
  result.status = "FAIL";
  result.failure = String(e);
  throw e;
} finally {
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await browser?.close();
  await new Promise((r) => server.close(r));
  await vite.close();
}
