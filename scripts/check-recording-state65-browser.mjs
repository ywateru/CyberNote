import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { installControlledRecording } from "./recording-platform-fixture.mjs";
const output = resolve(
  process.argv[2] ||
    "docs/verification/mac-recording-commit-gate65/author/state",
);
await mkdir(output, { recursive: true });
const baseline = execFileSync(
  "git",
  ["show", "0633b0ec:src/DesktopRecordingPanel.tsx"],
  { encoding: "utf8" },
);
let oldSource = false;
const entry = `import React from'react';import{createRoot}from'react-dom/client';import DesktopRecordingPanel from'/src/DesktopRecordingPanel.tsx';import RecordingDock from'/src/RecordingDock.tsx';import{RecordingOwner,validRecordingState}from'/src/recording-coordinator.ts';import'/src/style.css';
window.platform.config.preview=true;AudioContext.prototype.decodeAudioData=async()=>({sampleRate:24000,numberOfChannels:1,length:72000,getChannelData:()=>new Float32Array(72000)});
const h=window.host={states:[],invalid:[],results:[],ownerErrors:[],identity:{sessionId:'s',operationId:'o',owner:'main',child:'child'}};
h.owner=new RecordingOwner(h.identity,{send:async m=>{if(m.kind==='action')h.handle.dispatch(m)},decode:()=>{throw Error('not used')},submit:async()=>{},discard:async()=>{},view(){},reveal:async()=>{},closed(){},visibility:async()=>{}});
h.inspect=s=>{const valid=validRecordingState(s);h.states.push(s);if(!valid)h.invalid.push({state:s,samplesAhead:s.samples.some(p=>p.at>s.elapsed),rangeOverflow:s.seekable.some(r=>r[1]>s.duration)});void h.owner.receive({...h.identity,from:'child',message:{kind:'state',state:s}}).catch(e=>h.ownerErrors.push(e.message))};
const root=createRoot(document.getElementById('root'));root.render(<><DesktopRecordingPanel onHandle={x=>h.handle=x} onState={h.inspect} onCancel={()=>{}} onRevision={async r=>{h.results.push(r);throw Error('controlled save rejection')}}/><RecordingDock owner={h.owner} fail={e=>h.ownerErrors.push(e.message)}/></>);`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    {
      name: "state65",
      enforce: "pre",
      resolveId: (id) => (id === "/__state65.tsx" ? id : undefined),
      load: (id) => (id === "/__state65.tsx" ? entry : undefined),
      transform(code, id) {
        if (oldSource && id.endsWith("/src/DesktopRecordingPanel.tsx"))
          return baseline;
      },
    },
    react(),
  ],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__check")
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><div id="root"></div><script type="module" src="/__state65.tsx"></script>',
      )
      .then((x) => res.end(x));
  else vite.middlewares(req, res);
});
await new Promise((r, j) => {
  server.once("error", j);
  server.listen(0, "127.0.0.1", r);
});
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
let browser, page, context;
const checks = [],
  observations = [],
  errors = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const run = async (old) => {
    oldSource = old;
    vite.moduleGraph.invalidateAll();
    await context?.close();
    context = await browser.newContext();
    await context.addInitScript(installControlledRecording);
    page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(origin + "/__check");
    await page.locator(".recording-primary").click();
    await page.waitForFunction(() => window.platform.starts === 1);
    await page.evaluate(() => {
      const p = window.platform;
      p.advance(350, false);
      [...p.intervals.values()].at(-1)();
    });
    await page.waitForTimeout(30);
    await page.evaluate(() => [...window.platform.intervals.values()][0]());
    await page.waitForTimeout(30);
    const recording = await page.evaluate(() => ({
      states: window.host.states,
      invalid: window.host.invalid,
    }));
    await page.locator(".recording-primary").click();
    await page.evaluate(() =>
      window.platform.emit("synthetic complete segment"),
    );
    await page.waitForFunction(() => window.host.results.length === 1);
    await page
      .getByRole("button", { name: "重试保存录音", exact: true })
      .waitFor();
    await page.evaluate(() => {
      window.platform.audios.at(-1).ready(3, [[0, 3.001]]);
    });
    await page.waitForTimeout(30);
    await page.evaluate(() => [...window.platform.intervals.values()][0]());
    await page.waitForTimeout(30);
    await page.evaluate(() => window.host.owner.switchPresentation("dock"));
    await page.locator(".recording-dock").waitFor();
    const result = await page.evaluate(() => ({
      invalid: window.host.invalid,
      ownerErrors: window.host.ownerErrors,
      latest: window.host.owner.getSnapshot(),
      allStates: window.host.states,
    }));
    return { recording, result };
  };
  const baselineState = await run(true);
  assert(baselineState.recording.invalid.some((x) => x.samplesAhead));
  assert(baselineState.result.invalid.some((x) => x.rangeOverflow));
  checks.push({
    name: "Mac18 desktop projection independently reproduces samples ahead of stale elapsed and retry preview range beyond duration, with accepted retry phase",
    pass: true,
  });
  observations.push({ baseline: baselineState });
  if (!process.argv.includes("--baseline-only")) {
    const candidate = await run(false);
    assert.deepEqual(candidate.result.invalid, []);
    assert.deepEqual(candidate.result.ownerErrors, []);
    assert.equal(candidate.result.latest.mode, "dock");
    assert.equal(candidate.result.latest.state.phase, "retry");
    assert(
      candidate.result.latest.state.seekable.every(
        (r) => r[1] <= candidate.result.latest.state.duration,
      ),
    );
    checks.push({
      name: "production desktop retry projections remain valid after clock/media events and real Dock commits current retry state",
      pass: true,
    });
    observations.push({ candidate });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify({ pass: true, checks, observations, errors }, null, 2),
  );
  console.log(JSON.stringify({ pass: true, checks }));
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        checks,
        observations,
        snapshot: await page?.evaluate(() => window.host).catch(() => null),
        errors,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await vite.close();
}
