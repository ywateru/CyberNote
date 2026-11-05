// Actual Panel, Session, recording transport and production PM schema/widget.
// Only hardware media events, clocks and the parent-save Promise are controlled.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { installControlledRecording } from "./recording-platform-fixture.mjs";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error("Existing browser paths required; no downloads.");
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(
  process.argv[2] || "docs/verification/recording-interactions50/interactions",
);
await mkdir(output, { recursive: true });
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{Editor}from'@tiptap/core';import{undoDepth,redoDepth}from'@tiptap/pm/history';import{createEditorExtensions}from'/src/editor-schema.ts';import RecordingPanel from'/src/RecordingPanel.tsx';import{mountRecordingCard}from'/src/recording-live-card.ts';import{RecordingWaveformHistory}from'/src/recording-waveform.tsx';import'/src/style.css';
const source=new Editor({element:document.querySelector('#editor'),extensions:createEditorExtensions(),content:'<h1>录音交互 QA</h1><p>原位置之前，原位置之后。</p>'});const other=new Editor({element:document.querySelector('#other'),extensions:createEditorExtensions(),content:'<p>另一笔记</p>'});source.commands.setTextSelection(18);source.commands.insertContent('测试');source.commands.setTextSelection(18);window.sourceEditor=source;let version=0;source.on('transaction',({transaction})=>{if(transaction.docChanged)version++});window.snapshot=()=>({json:source.getJSON(),selection:source.state.selection.toJSON(),undo:undoDepth(source.state),redo:redoDepth(source.state),version,editable:source.isEditable});window.original=window.snapshot();window.otherSnapshot=()=>other.getJSON();const target={editor:source,bookmark:source.state.selection.getBookmark()};const root=createRoot(document.querySelector('#panel-host'));let mobile=false,card=null;const render=()=>root.render(React.createElement(React.StrictMode,null,React.createElement(RecordingPanel,{mobile,onHandle:h=>window.panelHandle=h,onState:state=>{if(mobile||state.recordedAt===undefined)return;card??=mountRecordingCard(target);card.update({...state,toggle:()=>window.panelHandle.toggle(),finish:()=>window.panelHandle.close()})},onCancel:()=>{window.platform.cancels++;card?.dispose();card=null;root.render(null)},onDone:result=>{const p=window.platform;p.results.push(result);p.files.push(result.file);return new Promise((resolve,reject)=>p.saves.push({resolve,reject}))}})));window.mountPanel=(phone=false)=>{mobile=phone;document.querySelector('.app').className=phone?'app mobile page-editor':'app desktop sidebar-hidden';const host=document.querySelector('#panel-host');host.className=phone?'':'recording-window-host desktop';host.style.cssText=phone?'display:contents':'left:auto;width:320px';render()};window.unmountPanel=()=>{card?.dispose();card=null;root.render(null)};window.switchTarget=show=>{document.querySelector('#editor').hidden=!show;document.querySelector('#other').hidden=show};window.waveformBound=()=>{const history=new RecordingWaveformHistory();for(let i=0;i<10000;i++)history.append(i*100,(i%50)+1);const values=history.samples();return{count:values.length,first:values[0],last:values.at(-1),max:Math.max(...values.map(s=>s.peak))}};`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    react(),
    {
      name: "recording50-actual-components",
      resolveId: (id) => (id === "/__recording50.tsx" ? id : undefined),
      load: (id) => (id === "/__recording50.tsx" ? entry : undefined),
    },
  ],
  server: { middlewareMode: true, host: "127.0.0.1", hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__check") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div class="app desktop sidebar-hidden" style="--list-width:280px;--sidebar-width:228px"><aside class="notes-pane">录音交互专用检查</aside><main class="editor-pane"><div class="editor-scroll"><div class="note-document"><div id="editor"></div><div id="other" hidden></div></div></div></main><div id="panel-host" style="display:contents"></div></div><script type="module" src="/__recording50.tsx"></script>',
      )
      .then((s) => res.end(s))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const results = [],
  errors = [],
  external = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--mute-audio"],
  });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
  });
  await context.addInitScript(installControlledRecording);
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith(origin) ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    )
      return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  const state = async (expected) => {
    await page.waitForFunction(
      (expected) =>
        document.querySelector("[data-recording-state]")?.dataset
          .recordingState === expected,
      expected,
    );
  };
  const open = async ({ mobile = false, ...config } = {}) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1200, height: 800 },
    );
    await page.goto(origin + "/__check");
    await page.waitForFunction(() => !!window.mountPanel);
    await page.evaluate(
      ({ config, mobile }) => {
        Object.assign(window.platform.config, config);
        window.mountPanel(mobile);
      },
      { config, mobile },
    );
    await state("idle");
  };
  const primary = () => page.locator(".recording-primary");
  const done = () => page.locator(".recording-done");
  const begin = async () => {
    await primary().click();
    await state("recording");
  };
  const pauseReady = async () => {
    await primary().click();
    await state("paused");
    await page.evaluate(() => {
      window.platform.pauseEvent();
      window.platform.emit("prefix", false);
    });
    await page.waitForFunction(() => window.platform.audios.length > 0);
    await page.evaluate(() =>
      window.platform.audios.at(-1).ready(45, [[0, 45]]),
    );
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="播放录音"]').disabled,
    );
  };
  const sameDocument = async () =>
    assert.deepEqual(
      await page.evaluate(() => window.snapshot()),
      await page.evaluate(() => window.original),
    );
  const test = async (name, run) => {
    await run();
    results.push(name);
  };
  await test("desktop standalone panel fills a 320px host, has no dim backdrop, and creates no live card before actual capture", async () => {
    await open({ preview: true });
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector(".recording-backdrop"),
        main = document.querySelector(".editor-pane");
      const p = panel.getBoundingClientRect(),
        m = main.getBoundingClientRect();
      return {
        panel: { x: p.x, y: p.y, width: p.width, height: p.height },
        editorRight: m.right,
        position: getComputedStyle(panel).position,
        background: getComputedStyle(panel).backgroundColor,
        modal: document
          .querySelector(".recording-sheet")
          .getAttribute("aria-modal"),
      };
    });
    assert.equal(geometry.panel.width, 320);
    assert.equal(geometry.panel.x, 880);
    assert.equal(geometry.position, "absolute");
    assert.equal(geometry.modal, null);
    assert.equal(await page.locator("[data-recording-live-card]").count(), 0);
    await sameDocument();
    await writeFile(
      resolve(output, "desktop-geometry.json"),
      JSON.stringify(geometry, null, 2) + "\n",
    );
    await page.screenshot({ path: resolve(output, "desktop-idle.png") });
  });
  await test("live card shares capture time/actions; register/update/remove leaves JSON, history, selection and document version unchanged", async () => {
    await begin();
    await page.evaluate(() => window.platform.advance(1250));
    await page.locator("[data-recording-live-card]").waitFor();
    assert.match(
      await page.locator(".live-recording-metadata").textContent(),
      /00:01/,
    );
    await sameDocument();
    await page.locator(".live-recording-toggle").click();
    await state("paused");
    await sameDocument();
    await page.evaluate(() => window.platform.advance(8000));
    assert.match(
      await page.locator(".live-recording-metadata").textContent(),
      /00:01/,
    );
    await sameDocument();
    await page.screenshot({
      path: resolve(output, "desktop-paused-live-card.png"),
    });
    await page.evaluate(() => window.switchTarget(false));
    assert.equal(
      await page.locator("[data-recording-live-card]").isVisible(),
      false,
    );
    assert.deepEqual(await page.evaluate(() => window.otherSnapshot()), {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "另一笔记" }] },
      ],
    });
    await page.evaluate(() => window.switchTarget(true));
    await page.locator("[data-recording-live-card]").waitFor();
    await sameDocument();
    await page.evaluate(() => window.unmountPanel());
    assert.equal(await page.locator("[data-recording-live-card]").count(), 0);
    await sameDocument();
  });
  await test("source remains editable during capture; actual typing and Undo/Redo remain available", async () => {
    await open({ preview: true });
    await begin();
    await page.locator("#editor .tiptap").focus();
    await page.keyboard.type(" allowed during capture");
    const edited = await page.evaluate(() => window.snapshot().json);
    assert.notDeepEqual(
      edited,
      await page.evaluate(() => window.original.json),
    );
    await page.evaluate(() => window.sourceEditor.commands.undo());
    assert.notDeepEqual(
      await page.evaluate(() => window.snapshot().json),
      edited,
    );
    await page.evaluate(() => window.sourceEditor.commands.redo());
    assert.deepEqual(await page.evaluate(() => window.snapshot().json), edited);
    assert.equal(await page.evaluate(() => window.platform.stops), 0);
  });
  for (const mobile of [false, true])
    await test(`${mobile ? "mobile" : "desktop"} transport retains paused preview position, keyboard/pointer absolute seeks and ±15 boundaries use confirmed media`, async () => {
      await open({ preview: true, mobile });
      await begin();
      await page.evaluate(() => window.platform.advance(4260));
      await pauseReady();
      assert.equal(
        await page.locator(".recording-time").textContent(),
        "00:00.00",
      );
      await page.getByRole("button", { name: "播放录音", exact: true }).click();
      assert.ok(await primary().isDisabled());
      await page.evaluate(() => {
        const a = window.platform.audios.at(-1);
        a.position = 8.2;
        a.emit("timeupdate");
      });
      await page.getByRole("button", { name: "暂停回放", exact: true }).click();
      assert.equal(
        await page.locator(".recording-time").textContent(),
        "00:08.20",
      );
      await page.getByRole("button", { name: "前进15秒", exact: true }).click();
      assert.equal(
        await page.evaluate(() =>
          window.platform.audios.at(-1).requests.at(-1),
        ),
        23.2,
      );
      assert.equal(
        await page.locator(".recording-time").textContent(),
        "00:08.20",
      );
      await page.evaluate(() => window.platform.audios.at(-1).confirm(23.2));
      assert.equal(
        await page.locator(".recording-time").textContent(),
        "00:23.20",
      );
      const slider = page.getByRole("slider", { name: "录音回放位置" });
      await slider.focus();
      await page.keyboard.press("End");
      assert.equal(
        await page.evaluate(() =>
          window.platform.audios.at(-1).requests.at(-1),
        ),
        45,
      );
      await page.evaluate(() => window.platform.audios.at(-1).confirm(45));
      await page.getByRole("button", { name: "前进15秒", exact: true }).click();
      assert.equal(
        await page.locator(".recording-time").textContent(),
        "00:45.00",
      );
      await slider.focus();
      await page.keyboard.press("Home");
      await page.evaluate(() => window.platform.audios.at(-1).confirm(0));
      await page.getByRole("button", { name: "后退15秒", exact: true }).click();
      assert.equal(
        await page.locator(".recording-time").textContent(),
        "00:00.00",
      );
      const bounds = await slider.boundingBox();
      const x = bounds.x + bounds.width / 2,
        y = bounds.y + bounds.height / 2;
      await page.mouse.move(x + 40, y);
      await page.mouse.down();
      await page.mouse.move(x + 80, y);
      await page.mouse.up();
      assert.equal(
        await page.evaluate(() =>
          window.platform.audios.at(-1).requests.at(-1),
        ),
        1,
      );
      assert.equal(
        await page.locator(".recording-time").textContent(),
        "00:00.00",
      );
      await page.evaluate(() => window.platform.audios.at(-1).confirm(1));
      assert.equal(
        await page.evaluate(() =>
          window.platform.audios.at(-1).requests.at(-1),
        ),
        2,
      );
      await page.evaluate(() => window.platform.audios.at(-1).confirm(2));
      assert.equal(
        await page.locator(".recording-time").textContent(),
        "00:02.00",
      );
      await sameDocument();
      await page.screenshot({
        path: resolve(
          output,
          mobile ? "mobile-seek-paused.png" : "desktop-seek-paused.png",
        ),
      });
    });
  await test("pending play and actual playing disable both Continue surfaces; ended replay waits actual start seek", async () => {
    await open({ preview: true, holdPlay: true });
    await begin();
    await pauseReady();
    await page.getByRole("button", { name: "播放录音", exact: true }).click();
    assert.ok(await primary().isDisabled());
    assert.ok(await page.locator(".live-recording-toggle").isDisabled());
    await page.evaluate(() => {
      document.querySelector(".recording-primary").click();
      const a = window.platform.audios.at(-1);
      a.resolvePlay();
      a.paused = false;
      a.emit("play");
    });
    assert.equal(await page.evaluate(() => window.platform.resumes), 0);
    assert.ok(await primary().isDisabled());
    await page.evaluate(() => {
      const a = window.platform.audios.at(-1);
      a.position = 45;
      a.paused = true;
      a.emit("ended");
    });
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:45.00",
    );
    await page.getByRole("button", { name: "播放录音", exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.platform.audios.at(-1).requests.at(-1)),
      0,
    );
    assert.ok(await primary().isDisabled());
    await page.evaluate(() => {
      window.platform.config.holdPlay = false;
      window.platform.audios.at(-1).confirm(0);
    });
    await page.waitForFunction(
      () => !!document.querySelector('[aria-label="暂停回放"]'),
    );
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:00.00",
    );
    await page.getByRole("button", { name: "暂停回放", exact: true }).click();
    await primary().click();
    await state("recording");
    assert.equal(await page.evaluate(() => window.platform.resumes), 1);
    assert.equal(await page.evaluate(() => window.platform.revoked.length), 1);
    await page.evaluate(() => window.platform.advance(1500));
    assert.equal(
      await page.locator(".recording-time").textContent(),
      "00:01.50",
    );
  });
  await test("idle and permission-wait close release only their own resources; late permission cannot capture", async () => {
    await open();
    await page.getByRole("button", { name: "关闭录音", exact: true }).click();
    await page.waitForFunction(() => window.platform.cancels === 1);
    assert.equal(await page.evaluate(() => window.platform.requests), 0);
    await open({ deferPermission: true });
    await primary().click();
    await state("requesting");
    await page.evaluate(() => window.panelHandle.close());
    await page.evaluate(() => window.platform.permission.resolve());
    await page.waitForFunction(() => window.platform.trackStops === 1);
    assert.equal(await page.evaluate(() => window.platform.starts), 0);
    assert.equal(await page.evaluate(() => window.platform.files.length), 0);
  });
  for (const mode of [
    "active-close",
    "paused-escape",
    "mobile-back-handle",
    "live-card-stop",
  ])
    await test(`${mode} finalizes once, waits same-file parent ACK, keeps failure retry and never cancels captured audio`, async () => {
      await open({ preview: true, mobile: mode === "mobile-back-handle" });
      await begin();
      await page.evaluate(() => window.platform.advance(2600));
      if (mode === "paused-escape") await pauseReady();
      if (mode === "active-close")
        await page
          .getByRole("button", { name: "关闭录音", exact: true })
          .click();
      else if (mode === "paused-escape") await page.keyboard.press("Escape");
      else if (mode === "live-card-stop")
        await page.locator(".live-recording-stop").click();
      else await page.evaluate(() => window.panelHandle.close());
      await state("finalizing");
      assert.equal(await page.evaluate(() => window.platform.stops), 1);
      assert.equal(await page.evaluate(() => window.platform.files.length), 0);
      await page.evaluate(() => window.platform.emit("final-tail"));
      await state("saving");
      assert.equal(await page.evaluate(() => window.platform.cancels), 0);
      assert.ok(await page.locator(".recording-cancel").isDisabled());
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => window.platform.files.length), 1);
      await page.evaluate(() =>
        window.platform.saves[0].reject(Error("controlled disk failure")),
      );
      await state("retry");
      assert.match(
        await page.getByRole("alert").textContent(),
        /controlled disk failure/,
      );
      await page.evaluate(() => window.panelHandle.close());
      await state("saving");
      assert.equal(
        await page.evaluate(
          () => window.platform.files[0] === window.platform.files[1],
        ),
        true,
      );
      assert.equal(await page.evaluate(() => window.platform.stops), 1);
      await page.evaluate(() => window.platform.saves[1].resolve());
      await state("submitted");
      await page.evaluate(() => window.unmountPanel());
      assert.equal(await page.locator("[data-recording-live-card]").count(), 0);
    });
  await test("long capture waveform retains real full-timeline peaks with bounded buckets", async () => {
    await open();
    const bound = await page.evaluate(() => window.waveformBound());
    assert.ok(bound.count <= 1800);
    assert.equal(bound.first.at, 0);
    assert.ok(bound.last.at > 990000);
    assert.equal(bound.max, 50);
    await writeFile(
      resolve(output, "waveform-bound.json"),
      JSON.stringify(bound, null, 2) + "\n",
    );
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        status: "pass",
        checks: results.length,
        results,
        errors,
        external,
        limits: [
          "Actual production Panel+Session+playback+PM widget; controlled hardware/clock/save Promise. Parent App closure save regression is separate.",
          "No native/Android/iOS microphone, encoded audibility, real-device UI or Apple pixel parity claim.",
          "Desktop host in this component fixture is a controlled element; it does not establish two real native windows. Actual original-A owner/coordinator and App save closures are checked separately.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ status: "pass", checks: results.length, results }),
  );
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      {
        status: "fail",
        results,
        errors,
        external,
        error: String(error),
        stack: error.stack,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
