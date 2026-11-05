// Mount the actual shared View, dedicated child Panel/Session and subscribed owner Dock.
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
  process.argv[2] || "docs/verification/recording-presentation55/components",
);
await mkdir(output, { recursive: true });
const expectsPreflight =
  /import\(\s*["']\.\/native-recording-access["']\s*\)/.test(
    await readFile(resolve("src/recording-session.ts"), "utf8"),
  );
const identity = {
  sessionId: "123e4567-e89b-42d3-a456-426614174000",
  operationId: "123e4567-e89b-42d3-a456-426614174001",
  owner: "main",
  child: "recording-123e4567-e89b-42d3-a456-426614174000",
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import RecordingWindow from'/src/RecordingWindow.tsx';import RecordingDock from'/src/RecordingDock.tsx';import{RecordingOwner,validRecordingState,validRecordingAction}from'/src/recording-coordinator.ts';import{decodeRecordingFile}from'/src/recording-window-transport.ts';import{RecordingWaveformHistory}from'/src/recording-waveform.tsx';import'/src/style.css';
const identity=${JSON.stringify(identity)};const root=createRoot(document.querySelector('#root'));const h=window.host={destroyed:0,finished:0,transfers:0,decoded:0,ownerAlive:true,terminal:false,messages:[],visibility:[],acks:[],errors:[],childVisible:true,ownerVisible:true};
window.__TAURI_INTERNALS__={};Object.defineProperty(navigator,'platform',{value:'MacIntel',configurable:true});h.microphoneAccess=[];
const emit=message=>h.listener?.({payload:{...identity,from:'owner',message}});
h.owner=new RecordingOwner(identity,{send:async message=>{h.messages.push(message);if(['saved','discarded'].includes(message.status))h.terminal=true;emit(message)},decode:transfer=>{h.decoded++;return decodeRecordingFile(transfer)},submit:result=>{window.platform.results.push(result);window.platform.files.push(result.file);return new Promise((resolve,reject)=>window.platform.saves.push({resolve,reject}))},discard:async()=>{window.platform.cancels++},view:state=>h.state=state,reveal:async()=>{},closed:()=>{},visibility:async(target,visible)=>{h.visibility.push({target,visible});if(h.failVisibility===target){h.failVisibility=null;throw Error('injected '+target+' visibility failure')}if(h.holdVisibility===target){h.holdVisibility=null;await new Promise(resolve=>h.releaseVisibility=resolve)}if(target==='child'&&!visible){const ack=h.acks.at(-1),s=h.owner.getSnapshot();if(!ack||ack.serial!==s.serial||ack.sequence!==s.state.sequence)throw Error('hidden before matching latest dock render ACK')}h[target+'Visible']=visible;if(target==='child')document.querySelector('#child').hidden=!visible;}});
const originalAck=h.owner.confirmDock.bind(h.owner);h.owner.confirmDock=(sequence,serial)=>{h.acks.push({sequence,serial});if(!h.suppressAck)originalAck(sequence,serial)};
h.window={label:identity.child,listen:async(name,handler)=>{if(name==='notes-recording')h.listener=handler;return()=>{if(h.listener===handler)h.listener=null}},onCloseRequested:async handler=>{h.close=()=>handler({preventDefault:()=>{}});return()=>{}},destroy:async()=>{h.destroyed++;await h.owner.receive({...identity,from:'host',message:{kind:'child-closed'}});root.render(null)}};
h.invoke=async(command,args)=>{if(command==='plugin:notes-ui|recording_access'){if(args?.windowLabel!==h.window.label||Object.keys(args).join(',')!=='windowLabel')throw Error('invalid microphone preflight identity');h.microphoneAccess.push({command,...args});return{status:'authorized'}}if(command==='recording_window_context')return identity;if(command==='recording_window_finish'){if(!h.terminal)throw Error('missing original document ACK');h.finished++;return}if(command==='recording_window_message'){if(!h.ownerAlive)throw Error('original owner lost; File retained');if(args.message.transfer)h.transfers++;void h.owner.receive({...identity,from:'child',message:args.message}).catch(e=>h.errors.push(String(e)));return}throw Error('unexpected '+command)};
h.query=message=>h.owner.receive({...identity,from:'child',message});h.validState=validRecordingState;h.validAction=validRecordingAction;h.bounded=()=>{const history=new RecordingWaveformHistory();for(let i=0;i<10000;i++)history.append(i*100,i%256);return history.samples()};
root.render(<><div className="recording-layout"><div className="app desktop separate"><textarea id="other-note" defaultValue="笔记B"/></div><RecordingDock owner={h.owner} fail={e=>h.errors.push(String(e))}/></div><div id="child"><RecordingWindow/></div></>);`;
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
        if (id === "/__presentation55.tsx") return id;
        if (modules[id]) return "\0recording55:" + id;
      },
      load(id) {
        if (id === "/__presentation55.tsx") return entry;
        if (id.startsWith("\0recording55:"))
          return modules[id.slice("\0recording55:".length)];
      },
    },
  ],
  server: { middlewareMode: true, host: "127.0.0.1", hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url.split("?")[0] === "/__presentation") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>#child{position:absolute;right:0;top:0;width:320px;height:600px}#child[hidden]{display:none}#child .recording-window-host{position:absolute}#other-note{width:100%;height:200px}</style><div id="root"></div><script type="module" src="/__presentation55.tsx"></script>',
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
    viewport: { width: 1120, height: 600 },
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
  const test = async (name, run) => {
    await run();
    checks.push(name);
  };
  const pump = async (ms = 0) => {
    await page.evaluate((ms) => window.platform.advance(ms), ms);
    await page.waitForTimeout(20);
    await page.evaluate(() => window.platform.advance(0));
    await page.waitForTimeout(20);
  };
  const phase = (expected) =>
    page.waitForFunction(
      (expected) => window.host.state?.phase === expected,
      expected,
    );
  const mode = (expected) =>
    page.waitForFunction(
      (expected) =>
        window.host.owner.getSnapshot().mode === expected &&
        !window.host.owner.getSnapshot().switching,
      expected,
    );
  const switchMode = async (expected) => {
    await page.evaluate(
      (expected) => window.host.owner.switchPresentation(expected),
      expected,
    );
    await mode(expected);
  };
  const open = async (config = { preview: true }) => {
    await page.goto(
      origin +
        `/__presentation?recording=${identity.sessionId}&operation=${identity.operationId}`,
    );
    await page.locator("#child .recording-primary").waitFor();
    await page.evaluate(
      (config) => Object.assign(window.platform.config, config),
      config,
    );
    await pump();
    await phase("idle");
  };
  const begin = async () => {
    await page.locator("#child .recording-primary").click();
    await pump();
    await phase("recording");
  };
  await test("default float and permission preparation switch retain one requesting Session and no capture reset", async () => {
    await open({ preview: true, deferPermission: true });
    assert.deepEqual(
      await page.evaluate(() => [
        window.host.owner.getSnapshot().mode,
        window.host.childVisible,
        document.querySelectorAll(".recording-dock").length,
      ]),
      ["float", true, 0],
    );
    await page.locator("#child .recording-primary").click();
    await pump();
    await phase("requesting");
    await page.getByRole("button", { name: "录音显示选项" }).click();
    await page.getByRole("menuitem", { name: "在当前窗口展开" }).click();
    await mode("dock");
    assert.deepEqual(
      await page.evaluate(() => [
        window.platform.requests,
        window.platform.starts,
        window.host.childVisible,
        document.querySelector(".recording-dock [data-recording-state]").dataset
          .recordingState,
      ]),
      [1, 0, false, "requesting"],
    );
    await page.getByRole("button", { name: "录音显示选项" }).click();
    await page.getByRole("menuitem", { name: "在浮动窗口中打开" }).click();
    await mode("float");
    await page.evaluate(() => window.platform.permission.resolve());
    await pump();
    await phase("recording");
    assert.equal(await page.evaluate(() => window.platform.requests), 1);
    assert.deepEqual(
      await page.evaluate(() => window.host.microphoneAccess),
      expectsPreflight
        ? [
            {
              command: "plugin:notes-ui|recording_access",
              windowLabel: identity.child,
            },
          ]
        : [],
    );
  });
  await test("recording float/dock cycles preserve stream, recorder, genuine activity clock and bounded real waveform", async () => {
    await pump(5000);
    const original = await page.evaluate(() => ({
      recordedAt: window.host.state.recordedAt,
      starts: window.platform.starts,
      requests: window.platform.requests,
    }));
    for (let i = 0; i < 3; i++) {
      await switchMode("dock");
      await pump(250);
      await switchMode("float");
    }
    await switchMode("dock");
    await pump(500);
    const actual = await page.evaluate(() => ({
      recordedAt: window.host.state.recordedAt,
      starts: window.platform.starts,
      requests: window.platform.requests,
      elapsed: window.host.state.elapsed,
      pauses: window.platform.pauses,
      stops: window.platform.stops,
      trackStops: window.platform.trackStops,
      peaks: window.host.state.samples,
    }));
    assert.equal(actual.recordedAt, original.recordedAt);
    assert.equal(actual.starts, 1);
    assert.equal(actual.requests, 1);
    assert.equal(actual.elapsed, 6250);
    assert.equal(actual.pauses, 0);
    assert.equal(actual.stops, 0);
    assert.equal(actual.trackStops, 0);
    assert.ok(actual.peaks.length > 0);
    assert.ok(actual.peaks.every((p) => p.peak === 12));
    const bounded = await page.evaluate(() => window.host.bounded());
    assert.ok(bounded.length <= 1800);
    assert.equal(bounded[0].at, 0);
    assert.ok(bounded.every((p) => p.peak >= 0 && p.peak <= 255));
    const bounds = await page.evaluate(() => ({
      app: document.querySelector(".app").getBoundingClientRect().toJSON(),
      dock: document
        .querySelector(".recording-dock")
        .getBoundingClientRect()
        .toJSON(),
    }));
    assert.equal(bounds.dock.width, 280);
    assert.ok(bounds.app.right <= bounds.dock.left);
    await page.screenshot({ path: resolve(output, "docked-recording.png") });
  });
  await test("remote pause, actual preview, play/seek and repeated presentation changes retain the same media element", async () => {
    await page.locator(".recording-dock .recording-primary").click();
    await pump();
    await phase("paused");
    await page.evaluate(() => {
      window.platform.pauseEvent();
      window.platform.emit("actual controlled snapshot", false);
    });
    await page.waitForFunction(() => window.platform.audios.length === 1);
    await page.evaluate(() => window.platform.audios[0].ready(45, [[0, 45]]));
    await pump();
    await page
      .locator(".recording-dock")
      .getByRole("button", { name: "播放录音", exact: true })
      .click();
    await pump();
    assert.equal(await page.evaluate(() => window.host.state.playing), true);
    await switchMode("float");
    await switchMode("dock");
    assert.equal(await page.evaluate(() => window.platform.audios.length), 1);
    assert.equal(
      await page.evaluate(() => window.platform.audios[0].paused),
      false,
    );
    await page
      .locator(".recording-dock")
      .getByRole("button", { name: "前进15秒" })
      .click();
    await pump();
    assert.equal(await page.evaluate(() => window.host.state.position), 0);
    assert.deepEqual(
      await page.evaluate(() => window.platform.audios[0].requests),
      [15],
    );
    await switchMode("float");
    await switchMode("dock");
    await page.evaluate(() => window.platform.audios[0].confirm(15));
    await pump();
    assert.equal(await page.evaluate(() => window.host.state.position), 15000);
    await page
      .locator(".recording-dock")
      .getByRole("button", { name: "暂停回放" })
      .click();
    await pump();
    await page.locator(".recording-dock [role=slider]").focus();
    await page.keyboard.press("ArrowRight");
    await pump();
    assert.equal(await page.evaluate(() => window.host.state.position), 15000);
    await page.evaluate(() => window.platform.audios[0].confirm(16));
    await pump();
    assert.equal(await page.evaluate(() => window.host.state.position), 16000);
    await page.screenshot({
      path: resolve(output, "docked-preview-confirmed.png"),
    });
  });
  await test("invalid identity, stale projection, unknown message/action and illegal seek/sample payloads cannot mutate confirmed state", async () => {
    const result = await page.evaluate(async () => {
      const h = window.host,
        original = h.state;
      const rejected = [];
      const bad = [
        { ...original, sequence: original.sequence + 1, position: NaN },
        {
          ...original,
          sequence: original.sequence + 1,
          samples: [{ at: 0, peak: Infinity }],
        },
        {
          ...original,
          sequence: original.sequence + 1,
          samples: Array(1801).fill({ at: 0, peak: 1 }),
        },
        {
          ...original,
          sequence: original.sequence + 1,
          seekable: [[0, Infinity]],
        },
      ];
      for (const state of bad) {
        try {
          await h.query({ kind: "state", state });
          rejected.push(false);
        } catch {
          rejected.push(true);
        }
      }
      await h.query({
        kind: "state",
        state: {
          ...original,
          sequence: original.sequence - 1,
          notice: "stale state",
        },
      });
      await h.owner.receive({
        ...h.owner.identity,
        sessionId: "wrong",
        from: "child",
        message: {
          kind: "state",
          state: { ...original, sequence: original.sequence + 9 },
        },
      });
      for (const action of [
        { action: "seek", milliseconds: Infinity },
        { action: "seek", milliseconds: 999999 },
        { action: "unknown" },
      ]) {
        try {
          await h.owner.action(action);
          rejected.push(false);
        } catch {
          rejected.push(true);
        }
      }
      try {
        await h.query({ kind: "unknown" });
        rejected.push(false);
      } catch {
        rejected.push(true);
      }
      return { rejected, unchanged: h.state === original };
    });
    assert.equal(result.unchanged, true);
    assert.ok(result.rejected.every(Boolean));
  });
  await test("failed target visibility retains actionable source; stale render ACK and superseded request cannot hide both", async () => {
    await page.evaluate(() => (window.host.failVisibility = "child"));
    const failed = await page.evaluate(() =>
      window.host.owner.switchPresentation("float").then(
        () => false,
        () => true,
      ),
    );
    assert.equal(failed, true);
    assert.equal(await page.locator(".recording-dock").count(), 1);
    assert.equal(await page.evaluate(() => window.host.childVisible), false);
    await switchMode("float");
    await page.evaluate(() => {
      const h = window.host;
      h.suppressAck = true;
      h.first = h.owner.switchPresentation("dock");
      h.first.catch(() => {});
    });
    await page.waitForFunction(() => window.host.owner.getSnapshot().dock);
    assert.equal(await page.evaluate(() => window.host.childVisible), true);
    await page.evaluate(() => {
      const h = window.host;
      const s = h.owner.getSnapshot();
      h.owner.confirmDock(s.state.sequence, s.serial - 1);
    });
    assert.equal(await page.evaluate(() => window.host.childVisible), true);
    await page.evaluate(async () => {
      const h = window.host;
      h.suppressAck = false;
      await h.owner.switchPresentation("float");
      await h.first;
    });
    await mode("float");
    assert.equal(await page.evaluate(() => window.host.childVisible), true);
    assert.equal(await page.locator(".recording-dock").count(), 0);
    await page.evaluate(() => (window.host.failVisibility = "owner"));
    assert.equal(
      await page.evaluate(() =>
        window.host.owner.switchPresentation("dock").then(
          () => false,
          () => true,
        ),
      ),
      true,
    );
    assert.equal(await page.evaluate(() => window.host.childVisible), true);
  });
  await test("normal owner close restores child before hide; visibility failure cancels close; capture and preview stay alive", async () => {
    await switchMode("dock");
    await page.evaluate(() => (window.host.failVisibility = "child"));
    assert.equal(
      await page.evaluate(async () => {
        const h = window.host;
        try {
          await h.owner.ensureFloating();
          h.ownerVisible = false;
          return false;
        } catch {
          return h.ownerVisible;
        }
      }),
      true,
    );
    assert.equal(await page.locator(".recording-dock").count(), 1);
    await page.evaluate(async () => {
      const h = window.host;
      await h.owner.ensureFloating();
      h.ownerVisible = false;
    });
    assert.equal(await page.evaluate(() => window.host.childVisible), true);
    assert.equal(await page.evaluate(() => window.platform.stops), 0);
    assert.equal(await page.evaluate(() => window.platform.audios.length), 1);
  });
  await test("saving switches retain the original File and one owner submit until the actual document ACK", async () => {
    await switchMode("dock");
    await page.locator(".recording-dock .recording-done").click();
    await pump();
    await phase("finalizing");
    await page.evaluate(() => window.platform.emit("final actual bytes"));
    await pump();
    await phase("saving");
    await switchMode("float");
    await switchMode("dock");
    assert.deepEqual(
      await page.evaluate(() => [
        window.platform.saves.length,
        window.host.decoded,
        window.host.transfers,
        window.host.destroyed,
      ]),
      [1, 1, 1, 0],
    );
    await page.evaluate(() => window.platform.saves[0].resolve());
    await page.waitForFunction(() => window.host.destroyed === 1);
    assert.equal(await page.evaluate(() => window.host.finished), 1);
  });
  await test("capture error remains identical through both views; prestart close cancels without creating audio", async () => {
    await open({ preview: true, startError: true });
    await page.locator("#child .recording-primary").click();
    await pump();
    await phase("error");
    await switchMode("dock");
    assert.match(
      await page.locator(".recording-dock .recording-notice").textContent(),
      /start failed/,
    );
    await switchMode("float");
    await page.locator("#child .recording-cancel").click();
    await page.waitForFunction(() => window.host.destroyed === 1);
    assert.equal(await page.evaluate(() => window.platform.saves.length), 0);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(await page.evaluate(() => window.host.errors), []);
  const result = {
    status: "pass",
    checks,
    errors,
    external,
    limitations: [
      "Actual RecordingView/Dock/RecordingWindow/Panel/Session/Owner; window/IPC/microphone/media events are controlled, serial browser only.",
      "No native window, WebKit remote user gesture, microphone/audio audibility, mobile device or Apple pixel-parity claim. Original App/PM/SaveQueue validation runs separately.",
    ],
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors, external },
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
