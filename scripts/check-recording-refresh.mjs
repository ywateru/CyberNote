import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state, saveJSON } from "./debug/runtime.mjs";

const output = resolve("artifacts/recording-refresh");
await mkdir(output, { recursive: true });
const runtime = await openRuntime({ nativeToolbar: true });
const { page, backend } = runtime;
const checks = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};
try {
  const image = {
    id: "recording-refresh-image",
    noteId: "note-a",
    kind: "image",
    mime: "image/svg+xml",
    displayName: "已有图片.svg",
    size: 0,
    relativePath: "refresh.svg",
  };
  const data = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#d8e6f2"/></svg>');
  image.size = data.length;
  backend.workspace.attachments.push(image);
  backend.files.set(image.id, data.toString("base64"));
  backend.workspace.notes[0].document.content.push({
    type: "attachment",
    attrs: { id: image.id, name: image.displayName, kind: image.kind },
  });
  backend.sequence++;
  await api(page, "app.refresh");
  await api(page, "folder.select", { id: "all" });
  await api(page, "note.select", { id: "note-a" });
  await page.locator('.note-row[data-note-id="note-a"] .note-thumbnail img').waitFor();
  await api(page, "recording.open");
  await api(page, "recording.action", { action: "toggle" });
  await page.waitForFunction(() => document.querySelector('[data-recording-state="recording"]'));
  await page.evaluate(() => window.__DEBUG_PLATFORM__.advance(1500));
  await backend.configure({ delay: { load: 70 } });
  await page.evaluate(() => {
    const app = document.querySelector(".app");
    window.refreshObservation = {
      editor: document.querySelector(".tiptap"),
      thumbnail: document.querySelector('.note-row[data-note-id="note-a"] .note-thumbnail img'),
      covers: 0,
      thumbnailRemovals: 0,
      thumbnailSourceRemovals: 0,
    };
    const observation = window.refreshObservation;
    observation.observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes" && record.target === app &&
            !(record.oldValue || "").split(" ").includes("access-sync") &&
            app.classList.contains("access-sync")) observation.covers++;
        if (record.type === "attributes" && record.target === observation.thumbnail &&
            !observation.thumbnail.hasAttribute("src")) observation.thumbnailSourceRemovals++;
        for (const node of record.removedNodes)
          if (node === observation.thumbnail || node.contains?.(observation.thumbnail)) observation.thumbnailRemovals++;
      }
    });
    observation.observer.observe(app, { attributes: true, attributeOldValue: true, attributeFilter: ["class", "src"], childList: true, subtree: true });
  });
  const before = backend.calls.length;
  await api(page, "recording.action", { action: "close" });
  await idle(page);
  const observation = await page.evaluate(() => {
    const value = window.refreshObservation;
    value.observer.disconnect();
    return {
      covers: value.covers,
      thumbnailRemovals: value.thumbnailRemovals,
      thumbnailSourceRemovals: value.thumbnailSourceRemovals,
      sameEditor: value.editor === document.querySelector(".tiptap"),
      sameThumbnail: value.thumbnail === document.querySelector('.note-row[data-note-id="note-a"] .note-thumbnail img'),
    };
  });
  const calls = backend.calls.slice(before);
  const audio = backend.workspace.attachments.filter(a => a.kind === "audio");
  const saved = backend.workspace.notes.find(n => n.id === "note-a");
  const result = { observation, calls, errors: runtime.errors, limits: runtime.metadata };
  await saveJSON(resolve(output, "observation.json"), result);
  check("final save keeps all four trusted workspace validations", calls.filter(c => c.command === "load_workspace").length >= 4);
  check("recording journal is committed before native release", [...backend.journal.values()].every(op => op.status === "committed") && backend.local === null);
  check("one saved recording belongs to the original note", audio.length === 1 && audio[0].noteId === "note-a" && JSON.stringify(saved.document).includes(audio[0].id));
  check("final save does not show any full-window synchronization cover", observation.covers === 0);
  check("existing thumbnail stays mounted with its source", observation.sameThumbnail && observation.thumbnailRemovals === 0 && observation.thumbnailSourceRemovals === 0);
  check("the original editor remains mounted", observation.sameEditor);
  check("no uncaught page errors", runtime.errors.length === 0);
  check("recording ownership has completed", !(await state(page)).recording.active);
  await page.screenshot({ path: resolve(output, "completed.png") });
  await saveJSON(resolve(output, "result.json"), { status: "pass", checks, ...result });
  console.log(JSON.stringify({ status: "pass", checks, observation }, null, 2));
} finally {
  await runtime.cleanup();
}
