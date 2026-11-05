// Mount the actual dedicated child entry, Panel/Session and production owner.
// Native window/IPC and media events are controlled; this is not dual-window QA.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { installControlledRecording } from "./recording-platform-fixture.mjs";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error("Existing browser required");
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(
  process.argv[2] || "docs/verification/recording-interactions50/child-window",
);
await mkdir(output, { recursive: true });
const expectsPreflight = /import\(\s*["']\.\/native-recording-access["']\s*\)/.test(await readFile(resolve("src/recording-session.ts"), "utf8"));
const identity = {
  sessionId: "123e4567-e89b-42d3-a456-426614174000",
  operationId: "123e4567-e89b-42d3-a456-426614174001",
  owner: "main",
  child: "recording-123e4567-e89b-42d3-a456-426614174000",
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import RecordingWindow from'/src/RecordingWindow.tsx';import{RecordingOwner}from'/src/recording-coordinator.ts';import{decodeRecordingFile}from'/src/recording-window-transport.ts';import'/src/style.css';
const identity=${JSON.stringify(identity)};const root=createRoot(document.querySelector('#root'));const h=window.host={destroyed:0,finished:0,transfers:0,decoded:0,ownerAlive:true,terminal:false,messages:[],dropSaved:false};
window.__TAURI_INTERNALS__={};Object.defineProperty(navigator,'platform',{value:'MacIntel',configurable:true});h.microphoneAccess=[];
const emit=message=>h.listener?.({payload:{...identity,from:'owner',message}});
h.owner=new RecordingOwner(identity,{send:async message=>{h.messages.push(message);if(['saved','discarded'].includes(message.status))h.terminal=true;if(message.status==='saved'&&h.dropSaved){h.dropSaved=false;return}emit(message)},decode:transfer=>{h.decoded++;return decodeRecordingFile(transfer)},submit:result=>{window.platform.results.push(result);window.platform.files.push(result.file);return new Promise((resolve,reject)=>window.platform.saves.push({resolve,reject}))},discard:async()=>{window.platform.cancels++},view:state=>h.state=state,reveal:async()=>{},closed:()=>{}});
h.window={label:identity.child,listen:async(name,handler)=>{if(name==='notes-recording')h.listener=handler;return()=>{if(h.listener===handler)h.listener=null}},onCloseRequested:async handler=>{h.close=()=>handler({preventDefault:()=>h.prevented=(h.prevented||0)+1});return()=>{}},destroy:async()=>{h.destroyed++;await h.owner.receive({...identity,from:'host',message:{kind:'child-closed'}});root.render(null)}};
h.invoke=async(command,args)=>{if(command==='plugin:notes-ui|recording_access'){if(args?.windowLabel!==h.window.label||Object.keys(args).join(',')!=='windowLabel')throw Error('invalid microphone preflight identity');h.microphoneAccess.push({command,...args});return{status:'authorized'}}if(command==='recording_window_context')return identity;if(command==='recording_window_finish'){if(!h.terminal)throw Error('missing original document ACK');h.finished++;return}if(command==='recording_window_message'){if(!h.ownerAlive)throw Error('original owner lost; File retained');if(args.message.kind==='submit'){h.submitAttempts=(h.submitAttempts||0)+1;if(h.failFirstSubmit){h.failFirstSubmit=false;throw Error('injected first relay rejection before owner delivery')}}if(args.message.transfer)h.transfers++;void h.owner.receive({...identity,from:'child',message:args.message});return}throw Error('unexpected '+command)};
h.query=()=>h.owner.receive({...identity,from:'child',message:{kind:'hello'}});h.loseOwner=()=>{h.ownerAlive=false;h.listener?.({payload:{...identity,from:'host',message:{kind:'owner-lost'}}})};if(new URLSearchParams(location.search).get('early')==='1')h.earlyClose=h.owner.close();root.render(React.createElement(React.StrictMode,null,React.createElement(RecordingWindow)));`;
const modules = {
  "@tauri-apps/api/core":
    "export const isTauri=()=>true;export const invoke=(command,args)=>window.host.invoke(command,args)",
  "@tauri-apps/api/window":
    "export const getCurrentWindow=()=>window.host.window",
  "@tauri-apps/api/event": "export const listen=async()=>()=>{}",
};
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve(output, "vite-cache"),
  plugins: [
    react(),
    {
      name: "controlled-native-recording-window",
      enforce: "pre",
      resolveId(id) {
        if (id === "/__child50.tsx") return id;
        if (modules[id]) return "\0recording50:" + id;
      },
      load(id) {
        if (id === "/__child50.tsx") return entry;
        if (id.startsWith("\0recording50:"))
          return modules[id.slice("\0recording50:".length)];
      },
    },
  ],
  server: { middlewareMode: true, host: "127.0.0.1", hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url.startsWith("/__window")) {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__child50.tsx"></script>',
      )
      .then((s) => res.end(s))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const checks = [],
  errors = [],
  external = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 320, height: 600 },
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
  const state = (expected) =>
    page.waitForFunction(
      (expected) =>
        document.querySelector("[data-recording-state]")?.dataset
          .recordingState === expected,
      expected,
    );
  const open = async () => {
    await page.goto(
      origin +
        `/__window?recording=${identity.sessionId}&operation=${identity.operationId}`,
    );
    await state("idle");
    await page.waitForFunction(
      () => window.host.close && window.host.messages.length > 0,
    );
  };
  const begin = async () => {
    await page.locator(".recording-primary").click();
    await state("recording");
    assert.deepEqual(await page.evaluate(() => window.host.microphoneAccess), expectsPreflight ? [{command:"plugin:notes-ui|recording_access",windowLabel:identity.child}] : []);
  };
  const test = async (name, run) => {
    await run();
    checks.push(name);
  };
  await test("rejected first relay retries the retained encoding until actual owner receipt, then saves once", async () => {
    await open(); await begin();
    await page.evaluate(() => { window.host.failFirstSubmit = true; window.host.close(); });
    await state("finalizing");
    await page.evaluate(() => window.platform.emit("retained after rejected first relay"));
    await state("retry");
    assert.equal(await page.evaluate(() => window.host.decoded), 0);
    await page.evaluate(() => window.host.close());
    await page.waitForFunction(() => window.platform.saves.length === 1);
    assert.deepEqual(await page.evaluate(() => [window.host.submitAttempts,window.host.transfers,window.host.decoded,window.host.destroyed]), [2,1,1,0]);
    await page.evaluate(() => window.platform.saves[0].resolve());
    await page.waitForFunction(() => window.host.destroyed === 1);
  });
  await test("dedicated child entry mounts only recording view and its native idle close waits original discard", async () => {
    await open();
    assert.equal(await page.locator(".app").count(), 0);
    assert.equal(
      await page.locator(".recording-sheet").getAttribute("aria-modal"),
      null,
    );
    await page.screenshot({ path: resolve(output, "child-idle-320x600.png") });
    await page.evaluate(() => window.host.close());
    await page.waitForFunction(() => window.host.destroyed === 1);
    assert.deepEqual(
      await page.evaluate(() => ({
        requests: window.platform.requests,
        cancels: window.platform.cancels,
        finished: window.host.finished,
      })),
      { requests: 0, cancels: 1, finished: 1 },
    );
  });
  await test("a close requested before the child listener and Panel handle are ready is replayed through the actual hello handshake", async () => {
    await page.goto(
      origin +
        `/__window?recording=${identity.sessionId}&operation=${identity.operationId}&early=1`,
    );
    await page.waitForFunction(() => window.host?.destroyed === 1);
    assert.equal(await page.evaluate(() => window.platform.requests), 0);
    assert.equal(await page.evaluate(() => window.platform.cancels), 1);
  });
  await test("actual child blur/visibility does not stop capture; OS close finalizes and rejected owner ACK retains same File for one-transfer retry", async () => {
    await open();
    await begin();
    await page.evaluate(() => {
      window.platform.advance(2300);
      window.dispatchEvent(new Event("blur"));
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await page.evaluate(() => window.platform.stops), 0);
    assert.equal(await page.evaluate(() => window.platform.trackStops), 0);
    await page.evaluate(() => window.host.close());
    await state("finalizing");
    assert.equal(await page.evaluate(() => window.platform.stops), 1);
    await page.evaluate(() => window.platform.emit("terminal bytes"));
    await state("saving");
    await page.waitForFunction(() => window.platform.saves.length === 1);
    assert.equal(await page.evaluate(() => window.host.destroyed), 0);
    assert.equal(await page.evaluate(() => window.host.finished), 0);
    await page.evaluate(() =>
      window.platform.saves[0].reject(
        Error("controlled original A disk failure"),
      ),
    );
    await state("retry");
    await page.evaluate(() => window.host.close());
    await state("saving");
    await page.waitForFunction(() => window.platform.saves.length === 2);
    assert.equal(
      await page.evaluate(
        () => window.platform.files[0] === window.platform.files[1],
      ),
      true,
    );
    assert.equal(await page.evaluate(() => window.host.transfers), 1);
    assert.equal(await page.evaluate(() => window.host.decoded), 1);
    await page.evaluate(() => window.platform.saves[1].resolve());
    await page.waitForFunction(() => window.host.destroyed === 1);
    assert.equal(await page.evaluate(() => window.host.finished), 1);
    assert.equal(await page.evaluate(() => window.platform.stops), 1);
  });
  await test("lost saved response is recovered by original owner status query without repeated bytes, decode or submission", async () => {
    await open();
    await begin();
    await page.evaluate(() => {
      window.host.dropSaved = true;
      window.host.close();
    });
    await state("finalizing");
    await page.evaluate(() => window.platform.emit("one final file"));
    await state("saving");
    await page.waitForFunction(() => window.platform.saves.length === 1);
    await page.evaluate(() => window.platform.saves[0].resolve());
    await page.waitForFunction(() => window.host.terminal);
    assert.equal(await page.evaluate(() => window.host.destroyed), 0);
    await page.evaluate(() => window.host.query());
    await page.waitForFunction(() => window.host.destroyed === 1);
    assert.deepEqual(
      await page.evaluate(() => [
        window.host.transfers,
        window.host.decoded,
        window.platform.saves.length,
      ]),
      [1, 1, 1],
    );
  });
  await test("actual owner-loss event stays visible, does not stop capture and failed completion retains File/window", async () => {
    await open();
    await begin();
    await page.evaluate(() => window.host.loseOwner());
    assert.match(
      await page.getByRole("alert").textContent(),
      /原笔记窗口意外关闭/,
    );
    assert.equal(await page.evaluate(() => window.platform.stops), 0);
    await page.evaluate(() => window.host.close());
    await state("finalizing");
    await page.evaluate(() => window.platform.emit("orphan retained file"));
    await state("retry");
    assert.equal(await page.evaluate(() => window.host.destroyed), 0);
    assert.equal(await page.evaluate(() => window.host.finished), 0);
    assert.equal(
      await page
        .locator(".recording-sheet[data-recording-state=retry]")
        .count(),
      1,
    );
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = {
    status: "pass",
    checks,
    errors,
    external,
    limitations: [
      "Actual dedicated RecordingWindow, Panel, Session, File reconstruction and RecordingOwner mounted; Tauri registry/window operations and hardware media events are controlled.",
      "No real native dual window, background microphone, encoded audio/audibility or Apple pixel-parity acceptance. Actual App/latest-A SaveQueue checks are separate.",
    ],
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors, external },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
