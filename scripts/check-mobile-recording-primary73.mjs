// Replays the actual shared RecordingView against preserved stable source PNGs.
// Controlled legal view state only: no App/media/native/device operations.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { compareScreenshots } from "./debug/compare.mjs";
const output = resolve(process.argv[2] || "/private/tmp/notes-primary73");
const refIndex = process.argv.indexOf("--baseline-ref");
const baselineRef = refIndex < 0 ? "3534acaf" : process.argv[refIndex + 1];
assert(
  /^[a-f0-9]{7,40}$/.test(baselineRef),
  "Use a concrete baseline commit SHA",
);
const baselineHead = execFileSync("git", ["rev-parse", baselineRef], {
  encoding: "utf8",
}).trim();
const baselineViewSHA256 = shaFile("src/RecordingView.tsx");
function shaFile(file) {
  return createHash("sha256")
    .update(execFileSync("git", ["show", baselineHead + ":" + file]))
    .digest("hex");
}
assert.equal(
  baselineViewSHA256,
  createHash("sha256")
    .update(await readFile("src/RecordingView.tsx"))
    .digest("hex"),
  "View must match baseline for CSS-only comparison",
);
const oldCSS = execFileSync(
  "git",
  ["show", baselineHead + ":src/RecordingPanel.css"],
  { encoding: "utf8" },
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const inputs = [
  "src/RecordingView.tsx",
  "src/RecordingPanel.css",
  "src/style.css",
  "src/recording-coordinator.ts",
  "src/recording-waveform.tsx",
  "src/recording-clock.ts",
  "scripts/check-mobile-recording-primary73.mjs",
];
const fingerprint = async () => {
  const hash = createHash("sha256");
  for (const file of inputs) {
    hash.update(file + "\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
};
const result = {
  boundary:
    "actual shared RecordingView, controlled legal projection/action sink; no media/native/device",
  baselineHead,
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceInputs: inputs,
  sourceFingerprintAtStart: await fingerprint(),
  baselineViewSHA256,
  rendering: {
    viewport: [392, 840],
    deviceScaleFactor: 2,
    projection: [224, 480],
    canvas:
      "high quality full-frame drawImage; browser color-managed PNG decode",
    chromeArgs: ["--disable-gpu", "--force-color-profile=srgb"],
    fonts:
      "document.fonts.ready, two frames, await running finite animations (<=500ms), two frames",
    thresholds: [210, 235],
    contourBandPixels: 2.5,
  },
  variants: {},
  checks: [],
  errors: [],
};
await mkdir(output, { recursive: true });
const temp = await mkdtemp(resolve(tmpdir(), "notes-primary73-"));
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_CORE_PATH ||
      "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs",
  )
);
let browser;
const entry = `import React from'react';import{createRoot}from'react-dom/client';import RecordingView from'/src/RecordingView.tsx';import'/src/style.css';const root=createRoot(document.querySelector('#root'));const date=new Date();date.setHours(10,26,0,0);const base={sequence:1,phase:'paused',openedAt:date.getTime(),recordedAt:date.getTime(),elapsed:2600,paused:true,canToggle:true,canFinish:true,notice:'',hasError:false,position:2600,duration:2600,previewPosition:true,playing:false,playPending:false,previewPending:false,seeking:false,canPlay:true,canSeek:true,canRetryPreview:false,seekable:[[0,2600]],samples:[]};window.mount=(mobile,phase,dark=false,disabled=false)=>{window.actions=[];const active=phase==='recording',idle=phase==='idle';const disabledPhase=disabled?(idle?'requesting':active?'saving':'paused'):phase;const state={...base,phase:disabledPhase,recordedAt:idle?undefined:base.recordedAt,playing:disabled&&phase==='paused',paused:phase==='paused',elapsed:idle?0:active?1070:2600,position:idle?0:active?1070:disabled?1100:2600,duration:idle?0:active?1070:2600,canToggle:!disabled,canFinish:phase==='paused',previewPosition:phase==='paused',canPlay:phase==='paused',canSeek:phase==='paused',seekable:phase==='paused'?[[0,2600]]:[]};root.render(<div className={'app '+(mobile?'mobile':'desktop')+(dark?' dark':'')} style={{position:'relative',height:'100vh',width:'100vw',padding:0,display:'block'}}><RecordingView mobile={mobile} state={state} act={a=>window.actions.push(a)}/></div>)};`;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--disable-gpu", "--force-color-profile=srgb"],
  });
  for (const variant of ["before", "after"]) {
    const directory = resolve(output, variant);
    await mkdir(directory, { recursive: true });
    const vite = await createViteServer({
      configFile: false,
      cacheDir: resolve(temp, variant),
      plugins: [
        react(),
        {
          name: "primary73-view",
          enforce: "pre",
          resolveId: (id) => (id === "/__primary73.tsx" ? id : undefined),
          load: (id) =>
            id === "/__primary73.tsx"
              ? entry
              : variant === "before" && id === resolve("src/RecordingPanel.css")
                ? oldCSS
                : undefined,
        },
      ],
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
    });
    const server = createServer((req, res) => {
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        void vite
          .transformIndexHtml(
            "/",
            '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__primary73.tsx"></script>',
          )
          .then((html) => res.end(html));
      } else vite.middlewares(req, res);
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const origin = "http://127.0.0.1:" + server.address().port;
    const context = await browser.newContext({
      viewport: { width: 392, height: 840 },
      deviceScaleFactor: 2,
      hasTouch: true,
    });
    const page = await context.newPage();
    const layouts = {};
    result.variants[variant] = {
      cssSHA256: sha(
        variant === "before"
          ? oldCSS
          : await readFile("src/RecordingPanel.css"),
      ),
      layouts,
    };
    try {
      page.on("pageerror", (error) => result.errors.push(String(error)));
      await page.route("**/*", (route) =>
        route.request().url().startsWith(origin) ||
        /^(data:|blob:)/.test(route.request().url())
          ? route.continue()
          : route.abort(),
      );
      await page.goto(origin);
      await page.waitForFunction(() => !!window.mount);
      for (const mobile of [true, false])
        for (const [width, height] of mobile
          ? [
              [392, 840],
              [320, 568],
              [280, 600],
            ]
          : [[280, 467]])
          for (const dark of [false, true])
            for (const phase of ["idle", "recording", "paused"]) {
              await page.setViewportSize({ width, height });
              await page.evaluate(
                ({ mobile, phase, dark }) => window.mount(mobile, phase, dark),
                { mobile, phase, dark },
              );
              await page.waitForSelector(".recording-primary-" + phase);
              await page.mouse.move(0, 0);
              const settledAnimations = await page.evaluate(async () => {
                document.activeElement?.blur();
                await document.fonts.ready;
                const frames = () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  );
                await frames();
                const animations = document
                  .getAnimations()
                  .filter(
                    (a) =>
                      a.playState === "running" &&
                      Number.isFinite(a.effect?.getComputedTiming().endTime),
                  );
                const names = animations.map(
                  (a) =>
                    a.transitionProperty ||
                    a.animationName ||
                    a.constructor.name,
                );
                let timer;
                try {
                  await Promise.race([
                    Promise.all(animations.map((a) => a.finished)),
                    new Promise((_, reject) => {
                      timer = setTimeout(
                        () =>
                          reject(
                            Error(
                              "Finite view animations did not settle within 500ms",
                            ),
                          ),
                        500,
                      );
                    }),
                  ]);
                } finally {
                  clearTimeout(timer);
                }
                await frames();
                return names;
              });
              const name = `${mobile ? "mobile" : "desktop"}-${phase}-${width}x${height}-${dark ? "dark" : "light"}`;
              const layout = await page.evaluate(() => {
                const rect = (e) => {
                  const r = e.getBoundingClientRect();
                  return { x: r.x, y: r.y, width: r.width, height: r.height };
                };
                const primary = document.querySelector(".recording-primary");
                const css = getComputedStyle(primary);
                const before = getComputedStyle(primary, "::before");
                const nodes = [
                  ...document.querySelectorAll(
                    ".recording-backdrop,.recording-backdrop *",
                  ),
                ];
                return {
                  html: document.querySelector(".recording-backdrop").outerHTML,
                  rects: nodes.map(rect),
                  computed: nodes.map((e) => {
                    const c = getComputedStyle(e);
                    return Object.fromEntries(
                      [...c].map((k) => [k, c.getPropertyValue(k)]),
                    );
                  }),
                  primary: {
                    ...rect(primary),
                    border: css.border,
                    background: css.backgroundColor,
                    color: css.color,
                    pseudo: {
                      background: before.backgroundColor,
                      inset: before.inset,
                      content: before.content,
                    },
                    disabled: primary.disabled,
                    hit: [0.15, 0.5, 0.85].every((f) =>
                      primary.contains(
                        document.elementFromPoint(
                          primary.getBoundingClientRect().x +
                            primary.getBoundingClientRect().width * f,
                          primary.getBoundingClientRect().y +
                            primary.getBoundingClientRect().height / 2,
                        ),
                      ),
                    ),
                  },
                };
              });
              const png = await page.screenshot({
                path: resolve(directory, name + ".png"),
              });
              layouts[name] = {
                settledAnimations,
                htmlSHA256: sha(layout.html),
                rectSHA256: sha(JSON.stringify(layout.rects)),
                allComputedSHA256: sha(JSON.stringify(layout.computed)),
                pngSHA256: sha(png),
                primary: layout.primary,
              };
              if (!mobile) {
                await writeFile(
                  resolve(directory, name + ".computed.json"),
                  JSON.stringify(layout.computed, null, 2),
                );
                await writeFile(
                  resolve(directory, name + ".dom.txt"),
                  layout.html,
                );
              }
              if (mobile) {
                const samples = await page.evaluate(
                  async ({ bytes, p }) => {
                    const im = await createImageBitmap(
                      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
                    );
                    const c = document.createElement("canvas");
                    c.width = im.width;
                    c.height = im.height;
                    const x = c.getContext("2d");
                    x.drawImage(im, 0, 0);
                    const pixel = (dy) =>
                      Array.from(
                        x.getImageData(
                          Math.round((p.x + p.width / 2) * 2),
                          Math.round((p.y + dy) * 2),
                          1,
                          1,
                        ).data,
                      ).slice(0, 3);
                    im.close();
                    return { ring: pixel(1.5), gap: pixel(4), inner: pixel(8) };
                  },
                  { bytes: [...png], p: layout.primary },
                );
                layouts[name].primaryPixels = samples;
                if (variant === "after" && dark) {
                  assert(
                    samples.gap.every(
                      (v, i) => Math.abs(v - [28, 28, 30][i]) <= 5,
                    ),
                    "Dark gap must retain paper pixels: " + name,
                  );
                  assert(
                    Math.max(
                      ...samples.ring.map((v, i) =>
                        Math.abs(v - samples.gap[i]),
                      ),
                    ) > 60,
                    "Visible dark outline: " + name,
                  );
                  if (phase === "paused")
                    assert(
                      samples.inner[0] - samples.gap[0] > 50,
                      "Visible dark inner fill: " + name,
                    );
                }
                assert(
                  layout.primary.width >= 44 &&
                    layout.primary.height >= 44 &&
                    layout.primary.hit,
                  name + " hit target",
                );
                assert(
                  layout.primary.x >= 0 &&
                    layout.primary.y >= 0 &&
                    layout.primary.x + layout.primary.width <= width &&
                    layout.primary.y + layout.primary.height <= height,
                  name + " viewport containment",
                );
              }
              if (variant === "after") {
                const old = result.variants.before.layouts[name];
                assert.deepEqual(
                  layouts[name].primary.width,
                  old.primary.width,
                );
                assert.deepEqual(
                  layouts[name].primary.height,
                  old.primary.height,
                );
                assert.deepEqual(
                  layout.rects,
                  JSON.parse(
                    await readFile(resolve(temp, name + ".rect.json"), "utf8"),
                  ),
                  "All geometry must remain unchanged: " + name,
                );
                if (!mobile) {
                  assert.equal(layouts[name].htmlSHA256, old.htmlSHA256);
                  assert.equal(
                    layouts[name].allComputedSHA256,
                    old.allComputedSHA256,
                    "Desktop computed styles changed: " + name,
                  );
                  const pixels = await compareScreenshots(
                    page,
                    resolve(output, "before", name + ".png"),
                    resolve(directory, name + ".png"),
                  );
                  layouts[name].pixelComparison = pixels;
                  assert(pixels.equal, "Desktop raster changed: " + name);
                }
              } else
                await writeFile(
                  resolve(temp, name + ".rect.json"),
                  JSON.stringify(layout.rects),
                );
              const p = layout.primary;
              await page.touchscreen.tap(p.x + p.width / 2, p.y + p.height / 2);
              assert.deepEqual(await page.evaluate(() => window.actions), [
                { action: "toggle" },
              ]);
              await page.evaluate(() => {
                window.actions = [];
                document.querySelector(".recording-primary").focus();
              });
              await page.keyboard.press("Enter");
              await page.keyboard.press("Space");
              assert.deepEqual(await page.evaluate(() => window.actions), [
                { action: "toggle" },
                { action: "toggle" },
              ]);
              await page.evaluate(
                ({ mobile, phase, dark }) =>
                  window.mount(mobile, phase, dark, true),
                { mobile, phase, dark },
              );
              await page.waitForFunction(
                () => document.querySelector(".recording-primary").disabled,
              );
              await page.touchscreen.tap(p.x + p.width / 2, p.y + p.height / 2);
              assert.deepEqual(await page.evaluate(() => window.actions), []);
            }
      // Exact source images are preserved; only clone full-frame renders are
      // uniformly downsampled via Chrome canvas high-quality drawImage.
      for (const [phase, index] of [
        ["idle", "0833"],
        ["recording", "0870"],
        ["paused", "0960"],
      ]) {
        const sourcePath = `docs/research/mobile-recording-sequence-01/representative/frame-n${index}.png`;
        const original = await readFile(sourcePath);
        if (variant === "before")
          await writeFile(
            resolve(output, "original-" + phase + ".png"),
            original,
          );
        const rendered = await readFile(
          resolve(directory, `mobile-${phase}-392x840-light.png`),
        );
        const measured = await page.evaluate(
          async ({ original, rendered, phase }) => {
            const decode = async (bytes, width, height) => {
              const image = await createImageBitmap(
                new Blob([new Uint8Array(bytes)], { type: "image/png" }),
              );
              const c = document.createElement("canvas");
              c.width = width;
              c.height = height;
              const x = c.getContext("2d");
              x.imageSmoothingEnabled = true;
              x.imageSmoothingQuality = "high";
              x.drawImage(image, 0, 0, width, height);
              image.close();
              return {
                pixels: x.getImageData(0, 0, width, height).data,
                png: c.toDataURL("image/png").split(",")[1],
              };
            };
            const ref = await decode(original, 224, 480),
              clone = await decode(rendered, 224, 480);
            const bounds =
                phase === "idle" ? [95, 415, 129, 448] : [71, 415, 154, 448],
              core =
                phase === "idle" ? [104, 423, 120, 439] : [87, 422, 101, 440];
            const stats = (pixels, roi) => {
              const counts = new Map();
              let sum = [0, 0, 0],
                n = 0;
              for (let y = roi[1]; y < roi[3]; y++)
                for (let x = roi[0]; x < roi[2]; x++) {
                  const c = Array.from(
                    pixels.slice((y * 224 + x) * 4, (y * 224 + x) * 4 + 3),
                  );
                  const key = c.join(",");
                  counts.set(key, (counts.get(key) || 0) + 1);
                  c.forEach((v, i) => (sum[i] += v));
                  n++;
                }
              const mode = [...counts].sort((a, b) => b[1] - a[1])[0];
              return {
                mode: mode[0].split(",").map(Number),
                modeCount: mode[1],
                pixels: n,
                mean: sum.map((x) => x / n),
              };
            };
            const mae = (roi) => {
              let n = 0,
                sum = 0;
              for (let y = roi[1]; y < roi[3]; y++)
                for (let x = roi[0]; x < roi[2]; x++)
                  for (let c = 0; c < 3; c++) {
                    sum += Math.abs(
                      ref.pixels[(y * 224 + x) * 4 + c] -
                        clone.pixels[(y * 224 + x) * 4 + c],
                    );
                    n++;
                  }
              return sum / n;
            };
            const masks = [];
            for (const threshold of [210, 235]) {
              let intersection = 0,
                union = 0,
                xor = 0,
                refCount = 0,
                cloneCount = 0;
              const [cx, cy, w, h] = [
                (bounds[0] + bounds[2]) / 2,
                (bounds[1] + bounds[3]) / 2,
                bounds[2] - bounds[0],
                bounds[3] - bounds[1],
              ];
              for (let y = bounds[1] - 2; y < bounds[3] + 2; y++)
                for (let x = bounds[0] - 2; x < bounds[2] + 2; x++) {
                  const dx = Math.max(Math.abs(x + 0.5 - cx) - (w - h) / 2, 0),
                    dy = y + 0.5 - cy;
                  if (Math.abs(Math.hypot(dx, dy) - h / 2) > 2.5) continue;
                  const mask = (p) => {
                    const i = (y * 224 + x) * 4,
                      [r, g, b] = p.slice(i, i + 3);
                    return phase === "paused"
                      ? r - g > 45 && r - b > 45 && g < threshold - 40
                      : Math.max(r, g, b) - Math.min(r, g, b) < 15 &&
                          Math.max(r, g, b) < threshold;
                  };
                  const a = mask(ref.pixels),
                    b = mask(clone.pixels);
                  if (a) refCount++;
                  if (b) cloneCount++;
                  if (a && b) intersection++;
                  if (a || b) union++;
                  if (a !== b) xor++;
                }
              masks.push({
                threshold,
                referencePixels: refCount,
                clonePixels: cloneCount,
                xor,
                intersectionOverUnion: intersection / union,
              });
            }
            return {
              projectionPNG: clone.png,
              metrics: {
                bounds,
                coreROI: core,
                referenceCore: stats(ref.pixels, core),
                cloneCore: stats(clone.pixels, core),
                coreMAE: mae(core),
                buttonMAE: mae(bounds),
                centerGlyphMAE: mae([103, 425, 122, 438]),
                outerRingMasks: masks,
              },
            };
          },
          { original: [...original], rendered: [...rendered], phase },
        );
        await writeFile(
          resolve(directory, "projection-" + phase + ".png"),
          Buffer.from(measured.projectionPNG, "base64"),
        );
        layouts[phase + "-reference"] = {
          originalPath: sourcePath,
          originalSHA256: sha(original),
          ...measured.metrics,
        };
      }
    } finally {
      await context.close();
      await new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      });
      await vite.close();
    }
  }
  for (const phase of ["idle", "recording", "paused"]) {
    const a = result.variants.before.layouts[phase + "-reference"],
      b = result.variants.after.layouts[phase + "-reference"];
    assert(b.buttonMAE < a.buttonMAE, "Button ROI must improve: " + phase);
    b.outerRingMasks.forEach((m, i) => {
      assert(
        m.intersectionOverUnion > a.outerRingMasks[i].intersectionOverUnion,
        "Ring IoU must improve at both thresholds: " + phase,
      );
      assert(
        m.xor < a.outerRingMasks[i].xor,
        "Ring XOR must decrease: " + phase,
      );
    });
  }
  assert(
    result.variants.after.layouts["paused-reference"].coreMAE <
      result.variants.before.layouts["paused-reference"].coreMAE,
    "Paused core ROI must improve",
  );
  result.checks.push(
    "Three legal mobile phases at three viewports in light/dark: full >=44px hit targets, tap/Enter/Space, disabled no action; all before/after element geometry equal",
    "Six desktop same-props states: HTML, every computed property, geometry and actual PNG RGBA all unchanged",
  );
  result.sourceFingerprintAtEnd = await fingerprint();
  assert.equal(result.sourceFingerprintAtStart, result.sourceFingerprintAtEnd);
  assert.deepEqual(result.errors, []);
  result.status = "PASS";
} catch (error) {
  result.status = "FAIL";
  result.failure = String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await rm(temp, { recursive: true, force: true });
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        status: result.status,
        failure: result.failure,
        output,
        sourceFingerprint:
          result.sourceFingerprintAtEnd || result.sourceFingerprintAtStart,
        metrics: Object.fromEntries(
          ["idle", "recording", "paused"].map((p) => [
            p,
            {
              before: result.variants.before?.layouts[p + "-reference"],
              after: result.variants.after?.layouts[p + "-reference"],
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
}
