// Real shared RecordingView; controlled projection, never microphone or media.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const output = resolve(process.argv[2]);
const baseline = process.argv.includes("--baseline");
const baselineSources = new Map(
  baseline
    ? [
        "src/RecordingView.tsx",
        "src/recording-waveform.tsx",
        "src/RecordingPanel.css",
      ].map((path) => [
        resolve(path),
        execFileSync("git", ["show", `50144de:${path}`], { encoding: "utf8" }),
      ])
    : [],
);
await mkdir(output, { recursive: true });
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import RecordingView from'/src/RecordingView.tsx';import'/src/style.css';
const root=createRoot(document.querySelector('#root'));const now=new Date();now.setHours(8,53,0,0);
const base={sequence:1,phase:'paused',openedAt:now.getTime(),recordedAt:now.getTime(),elapsed:5000,paused:true,canToggle:true,canFinish:true,notice:'',hasError:false,position:2700,duration:5000,previewPosition:true,playing:false,playPending:false,previewPending:false,seeking:false,canPlay:true,canSeek:true,canRetryPreview:false,seekable:[[0,5000]],samples:[{at:2000,peak:20},{at:2500,peak:8},{at:3000,peak:12}]};
window.actions=[];window.mount=(mobile=false,patch={},dark=false)=>{window.actions=[];root.render(<div className={'app '+(mobile?'mobile':'desktop')+(dark?' dark':'')} style={{position:'relative',width:'100vw',height:'100vh',padding:0,display:'block'}}><RecordingView state={{...base,...patch}} mobile={mobile} act={a=>window.actions.push(a)} onPresentation={mobile?undefined:()=>{}}/></div>)};`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    react(),
    {
      name: "recording-visual58",
      enforce: "pre",
      resolveId: (id) => (id === "/__visual58.tsx" ? id : undefined),
      load: (id) =>
        id === "/__visual58.tsx" ? entry : baselineSources.get(id),
    },
  ],
  server: { middlewareMode: true, host: "127.0.0.1", hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__visual58") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__visual58.tsx"></script>',
      )
      .then((s) => res.end(s));
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
const results = {
  boundary:
    "controlled actual shared View; Chromium, no native material/audio/OS QA",
  baseline,
  checks: [],
  layouts: {},
  errors: [],
  external: [],
};
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 280, height: 467 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  page.on("pageerror", (e) => results.errors.push(String(e)));
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:")) return route.continue();
    results.external.push(u);
    return route.abort();
  });
  await page.goto(origin + "/__visual58");
  await page.waitForFunction(() => !!window.mount);
  const mount = async (mobile = false, patch = {}, dark = false) => {
    await page.evaluate(
      ({ mobile, patch, dark }) => window.mount(mobile, patch, dark),
      { mobile, patch, dark },
    );
    await page.locator(".recording-time").waitFor();
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  };
  const snapshot = async (name) => {
    await page.evaluate(() => document.activeElement?.blur());
    results.layouts[name] = await page.evaluate(() => {
      const selectors = [
        ".recording-sheet",
        "header",
        "header strong",
        "header small",
        ".recording-cancel",
        ".recording-presentation-menu > button",
        ".waveform",
        ".wave-samples",
        ".wave-axis",
        ".recording-playhead",
        ".recording-time",
        ".recording-notice",
        ".recording-playback",
        ".recording-primary",
        ".recording-done",
      ];
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return Object.fromEntries(
        selectors
          .map((s) => {
            const e = document.querySelector(s);
            return [
              s,
              e
                ? {
                    ...rect(e),
                    color: getComputedStyle(e).color,
                    background: getComputedStyle(e).background,
                    disabled: e.disabled,
                    text: e.textContent,
                  }
                : null,
            ];
          })
          .concat([
            [
              "ticks",
              [...document.querySelectorAll(".wave-axis span")].map((e) => ({
                ...rect(e),
                text: e.textContent,
              })),
            ],
            [
              "samples",
              [...document.querySelectorAll(".wave-samples i")].map(rect),
            ],
          ]),
      );
    });
    await page.screenshot({ path: resolve(output, name + ".png") });
  };
  await mount();
  await snapshot("desktop-paused-280x467");
  // Requested seek must leave displayed media-confirmed position untouched.
  const slider = page.locator("[role=slider]");
  const box = await slider.boundingBox();
  await page.mouse.click(box.x + box.width / 2 + 50, box.y + box.height / 2);
  let actions = await page.evaluate(() => window.actions);
  const expected = 2700 + (50 / (baseline ? 40 : 100)) * 1000;
  assert(Math.abs(actions.at(-1).milliseconds - expected) < 1);
  assert.equal(await slider.getAttribute("aria-valuenow"), "2.7");
  const secondThree = await page
    .locator(".wave-axis span")
    .filter({ hasText: /^00:03$/ })
    .boundingBox();
  // Click the visible 00:03 marker itself, an independent semantic target.
  // Old labels center on their marker; the calibrated label begins 2px left.
  await page.mouse.click(
    secondThree.x + (baseline ? secondThree.width / 2 : 2),
    box.y + box.height / 2,
  );
  assert(
    Math.abs(
      (await page.evaluate(() => window.actions)).at(-1).milliseconds - 3000,
    ) < 1,
  );
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    (await page.evaluate(() => window.actions)).at(-1).milliseconds,
    3700,
  );
  await page.keyboard.press("Home");
  assert.equal(
    (await page.evaluate(() => window.actions)).at(-1).milliseconds,
    0,
  );
  await page.keyboard.press("End");
  assert.equal(
    (await page.evaluate(() => window.actions)).at(-1).milliseconds,
    5000,
  );
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2);
  await page.mouse.up();
  assert(
    Math.abs(
      (await page.evaluate(() => window.actions)).at(-1).milliseconds -
        (2700 - (50 / (baseline ? 40 : 100)) * 1000),
    ) < 1,
  );
  results.checks.push(
    "desktop click/drag/keyboard request same drawing scale; no optimistic position",
  );
  await mount(false, { canToggle: false, previewPending: true });
  await snapshot("desktop-pending-280x467");
  for (const [name, width, height, patch, dark] of [
    [
      "desktop-idle-280x360",
      280,
      360,
      {
        phase: "idle",
        position: 0,
        elapsed: 0,
        duration: 0,
        samples: [],
        canPlay: false,
        canSeek: false,
      },
      false,
    ],
    [
      "desktop-error-320x467",
      320,
      467,
      { hasError: true, notice: "回放失败，请重试", canRetryPreview: true },
      false,
    ],
    [
      "desktop-busy-280x360",
      280,
      360,
      {
        phase: "saving",
        canToggle: false,
        notice: "正在保存录音",
        canPlay: false,
        canSeek: false,
      },
      false,
    ],
    ["desktop-dark-320x600", 320, 600, {}, true],
  ]) {
    await page.setViewportSize({ width, height });
    await mount(false, patch, dark);
    await snapshot(name);
    const l = results.layouts[name];
    assert(l[".recording-done"].y + l[".recording-done"].height <= height);
    assert(l[".recording-primary"].width > 0);
  }
  await page.setViewportSize({ width: 392, height: 840 });
  await mount(true, { elapsed: 2600, position: 2600, duration: 2600 });
  await snapshot("mobile-paused-392x840");
  const mb = await slider.boundingBox();
  await page.touchscreen.tap(mb.x + mb.width / 2 - 50, mb.y + mb.height / 2);
  assert(
    Math.abs(
      (await page.evaluate(() => window.actions)).at(-1).milliseconds -
        (2600 - (50 / (baseline ? 40 : 100)) * 1000),
    ) < 1,
  );
  results.checks.push("mobile actual touch requests seek at same scale");
  if (!baseline) {
    const l = results.layouts["desktop-paused-280x467"];
    const ticks = l.ticks.filter((t) => t.x >= 0 && t.x <= 280);
    assert.equal(Math.round(ticks[1].x - ticks[0].x), 100);
    assert.equal(l[".waveform"].background.includes("gradient"), false);
    assert.equal(
      results.layouts["desktop-dark-320x600"][".waveform"].background.includes(
        "gradient",
      ),
      false,
    );
    results.checks.push(
      "100px seconds; gray inherited gradient removed including dark",
    );
  }
  if (!baseline) {
    await page.setViewportSize({width:280,height:467});
    await mount();
    results.timeline = await page.evaluate(()=>({
      major:[...document.querySelectorAll('.wave-axis span')].map(e=>({text:e.textContent,x:e.getBoundingClientRect().x+2})),
      minor:[...document.querySelectorAll('.wave-axis > i')].map(e=>e.getBoundingClientRect().x),
      samples:[...document.querySelectorAll('.wave-samples i')].map(e=>{const r=e.getBoundingClientRect();return r.x+r.width/2}),
      axisBorder:getComputedStyle(document.querySelector('.wave-axis')).borderTopWidth,
      labelBeforeLeft:getComputedStyle(document.querySelector('.wave-axis span'),'::before').left,
    }));
    const visibleMinor=results.timeline.minor.filter(x=>x>=0&&x<=280);
    assert.deepEqual(visibleMinor.map(x=>Math.round(x)),[20,45,95,120,145,195,220,245]);
    assert.deepEqual(results.timeline.samples.map(x=>Math.round(x)),[70,120,170]);
    assert.equal(results.timeline.axisBorder,'0px');
    assert.equal(results.timeline.labelBeforeLeft,'2px');
    for(const name of ['后退15秒','播放录音','前进15秒','继续录音','完成录音']) await page.getByRole('button',{name,exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.actions),[
      {action:'skip',seconds:-15},{action:'playback'},{action:'skip',seconds:15},{action:'toggle'},{action:'finish'}
    ]);
    await mount(false,{phase:'saving',canToggle:false,canPlay:false,canSeek:false,notice:'正在保存录音'});
    await page.evaluate(()=>{for(const s of ['.recording-cancel','.recording-playback button','.recording-primary','.recording-done'])for(const e of document.querySelectorAll(s))e.click()});
    assert.deepEqual(await page.evaluate(()=>window.actions),[]);
    results.checks.push('independent actual glyph buttons retain directed actions and disabled saving controls emit none');
    await page.setViewportSize({width:280,height:360});
    await mount(false,{phase:'retry',hasError:true,notice:'原笔记或授权状态已改变；请保持窗口打开。'.repeat(5),canRetryPreview:true});
    await snapshot('independent-short-error-280x360');
    results.shortError=await page.evaluate(()=>{
      const selectors=['.recording-time','.recording-playback','.recording-playback-retry','.recording-controls'];
      const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height}};
      return {regions:selectors.map(rect),targets:[...document.querySelectorAll('.recording-playback button,.recording-primary,.recording-done,.recording-playback-retry')].map(e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {name:e.getAttribute('aria-label')||e.textContent,enabled:!e.disabled,inPane:r.x>=0&&r.y>=0&&r.right<=280&&r.bottom<=360,hit:e===hit||e.contains(hit)}})};
    });
    for(const t of results.shortError.targets){assert(t.inPane,t.name);assert(t.hit,t.name)}
    const r=results.shortError.regions;
    for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++)assert(!(r[i].x<r[j].x+r[j].w&&r[i].x+r[i].w>r[j].x&&r[i].y<r[j].y+r[j].h&&r[i].y+r[i].h>r[j].y),r[i].s+' overlaps '+r[j].s);
    results.checks.push('independent 280x360 long error keeps timer/playback/retry/footer separate and controls actually hittable');
    await page.setViewportSize({width:392,height:840});
    results.mobileStates={};
    for(const phase of ['idle','recording','paused']){
      await mount(true,{phase,canToggle:true,canPlay:phase==='paused',canSeek:phase==='paused'});
      results.mobileStates[phase]=await page.evaluate(()=>Object.fromEntries(['header','.waveform','.recording-time','.recording-playback','.recording-controls'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{x:r.x,y:r.y,width:r.width,height:r.height}]})));
    }
    assert.deepEqual(results.mobileStates.idle,results.mobileStates.paused);
    assert.deepEqual(results.mobileStates.recording,results.mobileStates.paused);
    results.checks.push('independent mobile idle/recording/paused preserve header/waveform/timer/playback/footer regions');
  }
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.external, []);
  results.status = "PASS";
} catch (e) {
  results.status = "FAIL";
  results.failure = String(e);
  throw e;
} finally {
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  await browser?.close();
  await new Promise((r) => server.close(r));
  await vite.close();
}
