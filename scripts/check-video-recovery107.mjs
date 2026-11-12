// Actual App/MediaView/video/network error/retry. HTTP lease fixture, not native
// Rust expiry or a reproduction of Mac106 live11/12; no synthetic success events.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state } from "./debug/runtime.mjs";
const output = resolve(
  process.argv[2] || "artifacts/video-recovery107/browser",
);
const fixture =
  process.env.VIDEO107_FIXTURE ||
  resolve("scripts/fixtures/video-recovery107/clip.mp4");
const bytes = await readFile(fixture);
assert(bytes.length < 256000, "existing small fixture only");
await mkdir(output, { recursive: true });
const checks = [],
  requests = [],
  grants = [],
  expired = new Set();
let runtime,
  holding = false,
  held = false;
const heldResolvers = [];
const releaseHold = () => {
  for (const r of heldResolvers.splice(0)) r();
};
try {
  runtime = await openRuntime({ nativeToolbar: true });
  const { page, backend } = runtime;
  const serve = backend.serveMedia.bind(backend);
  backend.serveMedia = (req, res) => {
    requests.push({
      url: req.url,
      range: req.headers.range || null,
      status: expired.has(req.url) ? 404 : 206,
    });
    if (expired.has(req.url)) {
      res.writeHead(404, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    serve(req, res);
  };
  const call = backend.call.bind(backend);
  backend.call = async (command, args = {}) => {
    if (
      command === "acquire_attachment_source" &&
      args.purpose === "original"
    ) {
      if (holding) {
        held = true;
        await new Promise((r) => heldResolvers.push(r));
      }
      const result = await call(command, args);
      if (result.ok) grants.push(result.value.url);
      return result;
    }
    return call(command, args);
  };
  const a = {
    id: "video107",
    noteId: "note-a",
    kind: "video",
    mime: "video/mp4",
    displayName: "owned-small107.mp4",
    relativePath: "video107.mp4",
    size: bytes.length,
  };
  backend.workspace.attachments.push(a);
  backend.files.set(a.id, bytes.toString("base64"));
  const paragraph = (t) => ({
    type: "paragraph",
    content: [{ type: "text", text: t }],
  });
  backend.workspace.notes[0].document = {
    type: "doc",
    content: [
      paragraph("Video107 owned fixture"),
      {
        type: "attachment",
        attrs: { id: a.id, name: a.displayName, kind: "video" },
      },
      ...Array.from({ length: 40 }, (_, i) => paragraph("owned spacer " + i)),
    ],
  };
  backend.sequence++;
  await page.reload();
  await page.waitForSelector("#startup", { state: "detached" });
  await idle(page);
  const card = page.locator('[data-attachment-id="video107"]:visible');
  const video = () => card.locator("video");
  const activate = async () => {
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: /播放视频/ }).click();
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-attachment-id="video107"] video');
      return v?.readyState >= 3 && v.currentTime > 0 && !v.paused;
    });
  };
  const sample = async () =>
    video().evaluate((v) => ({
      src: v.currentSrc,
      time: v.currentTime,
      duration: v.duration,
      paused: v.paused,
      error: v.error?.code ?? null,
    }));
  const save = async (name) =>
    writeFile(
      resolve(output, name + ".json"),
      JSON.stringify(await sample(), null, 2),
    );
  await activate();
  const initial = await sample();
  assert(initial.duration >= 2 && initial.duration <= 4);
  checks.push(
    "ordinary activation retains real native controls/autoplay and advancing media",
  );
  await video().evaluate((v) => {
    window.__video107Old = v;
    v.pause();
    v.currentTime = 0.8;
  });
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && !v.seeking && Math.abs(v.currentTime - 0.8) < 0.05;
  });
  const before = await sample();
  expired.add(new URL(before.src).pathname);
  await video().evaluate((v) => v.load());
  await card.getByRole("alert").waitFor();
  assert((await sample()).error);
  assert.equal(grants.length, 1);
  checks.push(
    "actual HTTP404 resource load produces native MediaError, visible error and no automatic acquire loop",
  );
  await save("01-native-error");
  await page.evaluate(() => {
    window.__video107Seeked = [];
    document.addEventListener(
      "seeked",
      (e) => {
        if (e.target instanceof HTMLVideoElement)
          window.__video107Seeked.push({
            src: e.target.currentSrc,
            time: e.target.currentTime,
            trusted: e.isTrusted,
          });
      },
      true,
    );
  });
  await card.getByRole("button", { name: "重试视频", exact: true }).click();
  await page.waitForFunction((old) => {
    const v = document.querySelector('[data-attachment-id="video107"] video');
    return (
      v &&
      v.currentSrc !== old &&
      !v.paused &&
      v.currentTime > 1 &&
      v.currentTime < 2.8
    );
  }, before.src);
  const recovered = await sample();
  assert.notEqual(recovered.src, before.src);
  assert.equal(grants.length, 2);
  const seeked = await page.evaluate(() => window.__video107Seeked);
  assert(
    seeked.some(
      (e) =>
        e.src === recovered.src && Math.abs(e.time - 0.8) < 0.05 && e.trusted,
    ),
    "native seeked at requested .8s on replacement",
  );
  await writeFile(
    resolve(output, "restored-seek-events.json"),
    JSON.stringify(seeked, null, 2),
  );
  assert((await video().getAttribute("controls")) !== null);
  checks.push(
    "explicit retry acquires changed URL and restores finite .8s position, then actual playback advances past1s",
  );
  await save("02-recovered");
  await page.evaluate(() => {
    window.__video107Old.dispatchEvent(new Event("error"));
    window.__video107Old.dispatchEvent(new Event("seeked"));
    window.__video107Old.dispatchEvent(new Event("canplay"));
  });
  assert.equal(await card.getByRole("alert").count(), 0);
  checks.push(
    "detached old-element late error/seek/metadata events cannot disturb replacement",
  );
  await video().evaluate((v) => v.pause());
  // Actual scrolling causes the production IntersectionObserver to withdraw media.
  await page.locator(".tiptap:visible p").last().scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => !document.querySelector('[data-attachment-id="video107"] video'),
  );
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: /播放视频/ }).waitFor();
  assert.equal(await card.locator("video").count(), 0);
  checks.push(
    "real offscreen scroll releases active media; return does not resurrect retry autoplay",
  );
  // Pool invalidation is a true source boundary, even with identical metadata.
  await activate();
  await video().evaluate((v) => {
    v.pause();
    v.currentTime = 0.7;
  });
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && !v.seeking && Math.abs(v.currentTime - 0.7) < 0.05;
  });
  const invalidating = await sample();
  expired.add(new URL(invalidating.src).pathname);
  await video().evaluate((v) => v.load());
  await card.getByRole("alert").waitFor();
  holding = true;
  held = false;
  await card.getByRole("button", { name: "重试视频", exact: true }).click();
  for (let i = 0; i < 100 && !held; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert(held);
  backend.sequence++;
  await page.evaluate(
    (meta) =>
      window.__DEBUG_PLATFORM__.emit("notes-metadata", {
        metadata: meta,
        changes: [{ kind: "attachment", id: "video107" }],
      }),
    backend.state().metadata,
  );
  await new Promise((r) => setTimeout(r, 100));
  holding = false;
  releaseHold();
  await page.waitForFunction((old) => {
    const v = document.querySelector('[data-attachment-id="video107"] video');
    return v && v.currentSrc !== old && v.readyState >= 1;
  }, invalidating.src);
  const invalidated = await sample();
  assert(invalidated.paused);
  assert.equal(invalidated.time, 0);
  checks.push(
    "same-field original pool invalidation cancels pending restore/play intent; late old grant cannot revive it",
  );
  // Trigger one further explicit error/retry and navigate while its grant is pending.
  const third = await sample();
  expired.add(new URL(third.src).pathname);
  await video().evaluate((v) => v.load());
  await card.getByRole("alert").waitFor();
  holding = true;
  held = false;
  await card.getByRole("button", { name: "重试视频", exact: true }).click();
  for (let i = 0; i < 100 && !held; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert(held, "held acquisition reached fixture");
  await api(page, "note.select", { id: "note-b" });
  await idle(page);
  holding = false;
  releaseHold();
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await page.locator(".tiptap:visible video").count(), 0);
  assert.equal((await state(page)).selection.noteId, "note-b");
  checks.push(
    "navigation/unmount cancels pending retry; delayed grant does not publish or autoplay in another owner",
  );
  await api(page, "note.select", { id: "note-a" });
  await idle(page);
  await activate();
  const old = await video().elementHandle();
  backend.workspace.notes[0].locked = true;
  backend.noteEpochs["note-a"] = (backend.noteEpochs["note-a"] || 0) + 1;
  backend.accessEpoch++;
  backend.sequence++;
  await api(page, "app.refresh");
  await idle(page);
  assert.equal(await page.locator(".tiptap:visible video").count(), 0);
  await old.evaluate((v) => {
    v.dispatchEvent(new Event("error"));
    v.dispatchEvent(new Event("canplay"));
    v.dispatchEvent(new Event("seeked"));
  });
  assert.equal(
    await page.locator("button:visible", { hasText: "重试视频" }).count(),
    0,
  );
  checks.push(
    "actual access refresh/owner epoch loss removes media and late old events cannot restore it",
  );
  assert.equal(runtime.errors.length, 0, JSON.stringify(runtime.errors));
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        scope:
          "real Chrome/App/HTMLVideoElement with small explicit HTTP lease fixture; no Rust/native or original stall root-cause claim",
        fixture,
        fixtureBytes: bytes.length,
        checks,
        requests,
        grants,
        errors: runtime.errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify({ error: error.stack, checks, requests, grants }, null, 2),
  );
  throw error;
} finally {
  if (releaseHold) releaseHold();
  if (runtime) await runtime.cleanup();
}
