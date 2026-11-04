// Real RecordingPanel/RecordingSession -> actual App closures -> production
// bridge/submission/SaveQueue -> newly compiled production Rust Session/Store.
// Only microphone/encoder/host IPC and React/Editor host boundaries are controlled.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, statfs, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { rust } from "./audio-card-rust-fixture.mjs";
import { fixture, bridge, hashes } from "./check-recording-submit.mjs";
import { installControlledRecording } from "./recording-platform-fixture.mjs";

const output = resolve(
  process.argv[2] || "artifacts/audio-card-integration/run01",
);
await mkdir(output, { recursive: true });
const disk = await statfs(output);
assert(disk.bavail * disk.bsize >= 2 * 1024 ** 3, "2 GiB output guard");
const binary = process.env.NOTES_AUDIO_CARD_BINARY;
assert(binary, "fresh compiled NOTES_AUDIO_CARD_BINARY required");
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const entry = `import React from 'react';import{createRoot}from'react-dom/client';import RecordingPanel from '/src/RecordingPanel.tsx';import'/src/style.css';const root=createRoot(document.querySelector('#root'));window.mountPanel=()=>root.render(React.createElement(React.StrictMode,null,React.createElement('div',{className:'app mobile'},React.createElement(RecordingPanel,{onCancel:()=>root.render(null),onDone:async result=>{const p=window.platform;p.results.push(result);p.files.push(result.file);return window.submitRecorded({name:result.file.name,type:result.file.type,bytes:Array.from(new Uint8Array(await result.file.arrayBuffer())),recordedAt:result.recordedAt});}}))));window.unmountPanel=()=>root.render(null);`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve("artifacts/audio-card-integration-vite-cache"),
  plugins: [
    react(),
    {
      name: "recording-real-store-check",
      resolveId: (id) => (id === "/__audio-card.tsx" ? id : undefined),
      load: (id) => (id === "/__audio-card.tsx" ? entry : undefined),
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
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__audio-card.tsx"></script>',
      )
      .then((x) => res.end(x))
      .catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`,
  results = [],
  pageErrors = [],
  external = [];
let browser, active;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--mute-audio"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: "Asia/Shanghai",
  });
  await context.addInitScript(installControlledRecording);
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:") || u.startsWith("blob:"))
      return route.continue();
    external.push(u);
    return route.abort();
  });
  let app, ticket, nodeFile, captured, submitCount;
  await page.exposeFunction("submitRecorded", async (result) => {
    submitCount++;
    if (!nodeFile) {
      nodeFile = new File([Uint8Array.from(result.bytes)], result.name, {
        type: result.type,
        lastModified: Date.now(),
      });
      captured = result;
    } else
      assert.deepEqual(
        result,
        captured,
        "same final file bytes/name/MIME/date on Panel retry",
      );
    return app
      .props(ticket)
      .onDone(Object.freeze({ file: nodeFile, recordedAt: result.recordedAt }));
  });
  const state = (expected) =>
    page.waitForFunction(
      (x) =>
        document.querySelector("[data-recording-state]")?.dataset
          .recordingState === x,
      expected,
    );
  const primary = () => page.locator(".recording-primary"),
    done = () => page.locator(".recording-done");
  for (const scenario of [
    "permission-cross-day-long-pause",
    "lost-first-store-response",
    "body-ack-failure",
    "refresh-failure",
    "old-target-late-store",
  ]) {
    const root = resolve(output, scenario, "store");
    await mkdir(root, { recursive: true });
    active = rust(binary, root);
    let ws = await active.call("load_workspace");
    const token = {
      sessionId: ws.access.sessionId,
      epoch: ws.access.epoch,
      noteEpoch: null,
    };
    const a = await active.call("workspace_action", {
        action: { type: "createNote" },
        expected: token,
      }),
      b = await active.call("workspace_action", {
        action: { type: "createNote" },
        expected: token,
      });
    ws = await active.call("load_workspace");
    ws.notes.sort((x, y) => (x.id === a.id ? -1 : y.id === a.id ? 1 : 0));
    const options = {
      backend: ws,
      noteIds: [a.id, b.id],
      secureId: randomUUID,
      invoke: (...args) => active.call(...args),
    };
    if (scenario === "lost-first-store-response") options.rejectStore = true;
    if (scenario === "body-ack-failure") options.saveFailures = 2;
    if (scenario === "refresh-failure") options.refreshFailure = true;
    let release;
    if (scenario === "old-target-late-store")
      options.storeWait = { promise: new Promise((done) => (release = done)) };
    app = fixture(options);
    ticket = app.open();
    nodeFile = null;
    captured = null;
    submitCount = 0;
    await page.goto(origin + "/__check");
    await page.waitForFunction(() => !!window.mountPanel);
    await page.evaluate(() => {
      window.platform.config.deferPermission = true;
      window.platform.wall = Date.UTC(2026, 10, 3, 15, 59, 50);
      window.mountPanel();
    });
    await state("idle");
    await primary().click();
    await state("requesting");
    assert.equal(await page.evaluate(() => window.platform.results.length), 0);
    await page.evaluate(() => {
      window.platform.advance(9000);
      window.platform.permission.resolve();
    });
    await state("recording");
    const observed = await page.evaluate(() => window.platform.startObserved);
    await page.evaluate(() => window.platform.advance(2500));
    await primary().click();
    await state("paused");
    await page.evaluate(() => window.platform.advance(3 * 86400000));
    await primary().click();
    await state("recording");
    await page.evaluate(() => window.platform.advance(100));
    await primary().click();
    await state("paused");
    await done().click();
    await state("finalizing");
    await page.evaluate(() =>
      window.platform.emit("synthetic-controlled-audio-only"),
    );
    if (scenario === "old-target-late-store") {
      while (!app.calls.some((c) => c.command === "store_attachment_operation"))
        await new Promise((r) => setTimeout(r, 5));
      app.env.nativeScope = "scope-b";
      app.render();
      app.targetChanged();
      release();
      await state("retry");
      assert.equal(app.counts().inserts, 0);
      assert.equal(app.backend.notes.find((n) => n.id === b.id).revision, 0);
    } else if (scenario === "body-ack-failure") {
      await state("retry");
      const op = app.env.attachmentSubmissions.current.get(
        ticket.batch.operationIds[0],
      );
      assert(op.inserted && !op.documentAck);
      await page.evaluate(() => window.platform.advance(2 * 86400000));
      await done().click();
      await state("submitted");
      assert.equal(submitCount, 2);
      assert(
        await page.evaluate(
          () =>
            window.platform.results[0] === window.platform.results[1] &&
            window.platform.files[0] === window.platform.files[1],
        ),
      );
    } else {
      await state("submitted");
      if (scenario === "refresh-failure") {
        assert.match(app.env.error, /刷新失败/);
        options.refreshFailure = false;
        await app.api.retryAttachments();
      }
    }
    assert.equal(
      captured.recordedAt,
      observed,
      "first start observation survives permission wait and cross-day pause",
    );
    assert.equal(ticket.recordedAt, observed);
    assert.equal(ticket.file, nodeFile);
    const opid = ticket.batch.operationIds[0],
      op = await active.call("query_attachment_operation", {
        operationId: opid,
        noteId: a.id,
        expected: bridge.accessGate.expected(a.id),
      });
    assert.equal(op.attachment.recordedAt, observed);
    const read = await active.call("read_attachment", {
      id: op.attachment.id,
      expected: bridge.accessGate.expected(a.id),
    });
    assert.equal(read.recordedAt, observed);
    assert.equal(read.data, Buffer.from(captured.bytes).toString("base64"));
    const before = await active.call("load_workspace"),
      physicalBefore = await readFile(
        resolve(root, "attachments", op.attachment.relativePath),
      );
    for (const date of [undefined, observed + 1])
      await assert.rejects(
        active.call("store_attachment_operation", {
          operationId: opid,
          noteId: a.id,
          name: captured.name,
          mime: captured.type,
          data: read.data,
          recordedAt: date,
          expected: bridge.accessGate.expected(a.id),
        }),
        (e) => e.code === "attachment_operation_conflict",
      );
    assert.deepEqual(await active.call("load_workspace"), before);
    assert.deepEqual(
      await readFile(resolve(root, "attachments", op.attachment.relativePath)),
      physicalBefore,
    );
    assert.equal(
      app.calls.filter((c) => c.command === "store_attachment_operation")
        .length,
      1,
    );
    if (scenario !== "old-target-late-store") {
      assert.equal(op.status, "committed");
      assert.equal(app.counts().inserts, 1);
    }
    await writeFile(
      resolve(output, scenario, "transport.json"),
      JSON.stringify(active.log, null, 2) + "\n",
    );
    await active.close();
    active = null;
    let cold = null;
    if (scenario !== "old-target-late-store") {
      active = rust(binary, root);
      const fresh = await active.call("load_workspace"),
        date = fresh.attachments.find(
          (x) => x.id === op.attachment.id,
        ).recordedAt;
      assert.equal(date, observed);
      const access = fresh.access;
      const coldRead = await active.call("read_attachment", {
        id: op.attachment.id,
        expected: {
          sessionId: access.sessionId,
          epoch: access.epoch,
          noteEpoch: access.notes[a.id].epoch,
        },
      });
      assert.equal(coldRead.recordedAt, observed);
      assert.equal(coldRead.data, read.data);
      cold = { date, bytesSHA256: sha(Buffer.from(coldRead.data, "base64")) };
      await active.close();
      active = null;
    }
    results.push({
      scenario,
      recordedAt: observed,
      dateISO: new Date(observed).toISOString(),
      operationId: opid,
      attachmentId: op.attachment.id,
      status: op.status,
      submitCount,
      counts: app.counts(),
      cold,
      byteSHA256: sha(physicalBefore),
    });
    await page.evaluate(() => window.unmountPanel());
  }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(external, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        status: "pass",
        browser: await browser.version(),
        results,
        sourceHashes: {
          ...hashes,
          RecordingPanel: sha(await readFile("src/RecordingPanel.tsx")),
          RecordingSession: sha(await readFile("src/recording-session.ts")),
        },
        binary: { path: binary, sha256: sha(await readFile(binary)) },
        pageErrors,
        external,
        limits: [
          "Actual mounted Panel/Session, AST-extracted production App closures and PM document/bookmark; React setters and Editor command host controlled. App shell not mounted.",
          "Transport replacement invokes actual Rust Session/Store in a fresh isolated temporary database, including real access tokens/window owner/save intent and full body ACK. No Tauri IPC serialization/native GUI/device build.",
          "Synthetic controlled bytes, no microphone/codec/audibility/native media acceptance.",
          "Old target late response retains original attachment without insertion; unreferenced operation deliberately not cold-reopened because existing Store recovery compensates it.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Audio card integration passed ${results.length} cases: ${output}/result.json`,
  );
} finally {
  if (active) {
    await writeFile(
      resolve(output, "interrupted-transport.json"),
      JSON.stringify(active.log, null, 2) + "\n",
    );
    await active.close();
  }
  await browser?.close();
  await vite.close();
  await new Promise((done) => server.close(done));
}
