// Real App/hook/DOM against an explicit HTTP lease fixture. Not native/Rust or a
// large-media performance measurement (99M/99C/FINAL101 remain separate).
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { openRuntime, api, idle, state } from "./debug/runtime.mjs";
const output = "artifacts/media99ui/app";
await mkdir(output, { recursive: true });
const runtime = await openRuntime({ nativeToolbar: true });
const { page, backend } = runtime;
const checks = [],
  grants = [],
  releases = [],
  fileActions = [];
const check = (name, value) => {
  assert(value, name);
  checks.push(name);
};
const originalCall = backend.call.bind(backend);
let hold = false,
  releaseHold;
let holdStarted;
backend.call = async (command, args = {}) => {
  if (command === "acquire_attachment_source") {
    grants.push({ id: args.id, purpose: args.purpose, pixels: args.pixels });
    if (hold && args.id === "image-visible" && args.purpose === "original") {
      holdStarted?.();
      await new Promise((resolve) => (releaseHold = resolve));
    }
  }
  if (command === "attachment_desktop") {
    const a = backend.workspace.attachments.find((a) => a.id === args.id);
    backend.assertNote(a?.noteId);
    fileActions.push({
      id: args.id,
      action: args.action,
      bytes: backend.files.get(args.id),
    });
    return { ok: true, value: { ok: true } };
  }
  if (command === "release_attachment_source") releases.push(args.leaseId);
  return originalCall(command, args);
};
const p = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const add = (id, kind, mime, bytes) => {
  const attachment = {
    id,
    noteId: "note-a",
    kind,
    mime,
    displayName:
      id + (kind === "image" ? ".svg" : kind === "audio" ? ".wav" : ".txt"),
    relativePath: id,
    size: bytes.length,
    recordedAt: kind === "audio" ? 1794000000000 : undefined,
  };
  backend.workspace.attachments.push(attachment);
  backend.files.set(id, bytes.toString("base64"));
  return {
    type: "attachment",
    attrs: { id, kind, name: attachment.displayName },
  };
};
function wav(seconds) {
  const rate = 8000,
    frames = rate * seconds,
    b = Buffer.alloc(44 + frames * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(frames * 2, 40);
  return b;
}
const image = (id) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="460"><rect width="800" height="460" fill="gold"/><text y="50">${id}</text></svg>`,
  );
const node = (id) =>
  page.locator(`.attachment-node[data-attachment-id="${id}"]:visible`);
const count = (id, purpose) =>
  grants.filter((g) => g.id === id && g.purpose === purpose).length;
const wait = async (predicate, label) => {
  const until = Date.now() + 5000;
  while (!predicate()) {
    assert(Date.now() < until, label);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
};
try {
  const nodes = [
    p("Media99 source UI"),
    add("image-visible", "image", "image/svg+xml", image("visible")),
    add(
      "ordinary-file",
      "file",
      "text/plain",
      Buffer.from("EXACT original export bytes"),
    ),
    p("before playback"),
    add("long-audio", "audio", "audio/wav", wav(601)),
    ...Array.from({ length: 30 }, (_, i) => p("spacer " + i)),
    add("image-offscreen", "image", "image/svg+xml", image("offscreen")),
  ];
  backend.workspace.notes[0].document = { type: "doc", content: nodes };
  backend.sequence++;
  await page.reload();
  await page.waitForSelector("#startup", { state: "detached" });
  await idle(page);
  await node("image-visible").locator("img").waitFor();
  await wait(
    () => count("image-visible", "thumbnail") > 0,
    "visible thumbnail",
  );
  check(
    "visible body requests1024/list160 thumbnails, not original; offscreen body not acquired",
    grants.some((g) => g.id === "image-visible" && g.pixels === 1024) &&
      grants.some((g) => g.id === "image-visible" && g.pixels === 160) &&
      !grants.some((g) => g.purpose === "original") &&
      !grants.some((g) => g.id === "image-offscreen"),
  );
  check(
    "ordinary file and audio idle perform no source acquisition or legacy byte reads",
    !grants.some((g) => ["ordinary-file", "long-audio"].includes(g.id)) &&
      !backend.calls.some((c) => c.command === "read_attachment"),
  );
  await node("ordinary-file").click({ button: "right" });
  const context = page.getByRole("menu", { name: "附件菜单", exact: true });
  for (const name of ["拷贝", "保存附件…", "打开附件"])
    check(
      "unloaded file menu enables " + name,
      await context.getByRole("menuitem", { name, exact: true }).isEnabled(),
    );
  await context.getByRole("menuitem", { name: "拷贝", exact: true }).click();
  await wait(() => fileActions.length > 0, "copy file receipt");
  await node("ordinary-file").click({ button: "right" });
  await page.evaluate(() =>
    window.__DEBUG_PLATFORM__.dialogResults.save.push("/synthetic/export.txt"),
  );
  await context
    .getByRole("menuitem", { name: "保存附件…", exact: true })
    .click();
  await wait(() => backend.exports.length > 0, "export file receipt");
  check(
    "unloaded file copy/export preserves exact original bytes with zero media prefetch",
    fileActions[0].bytes ===
      Buffer.from("EXACT original export bytes").toString("base64") &&
      backend.exports[0].data === fileActions[0].bytes &&
      !grants.some((g) => g.id === "ordinary-file"),
  );
  const originalBefore = count("image-visible", "original");
  await node("image-visible").locator(".image-open").dblclick();
  await page.locator(".image-preview").waitFor();
  check(
    "floating preview upgrades thumbnail to separately acquired original",
    count("image-visible", "original") === originalBefore + 1 &&
      (await page.locator(".image-preview img").getAttribute("src")) !==
        (await node("image-visible").locator("img").getAttribute("src")),
  );
  await api(page, "note.select", { id: "note-b" });
  await idle(page);
  check(
    "floating original retain survives owner card leaving viewport",
    await page.locator(".image-preview").isVisible(),
  );
  await api(page, "image.close");
  await api(page, "note.select", { id: "note-a" });
  await idle(page);
  await node("image-visible").scrollIntoViewIfNeeded();
  // Same identity/size replacement must invalidate by exact attachment event,
  // even though all public metadata fields are unchanged.
  const oldThumb = count("image-visible", "thumbnail");
  backend.files.set(
    "image-visible",
    Buffer.from(
      Buffer.from(backend.files.get("image-visible"), "base64")
        .toString()
        .replace("gold", "blue"),
    ).toString("base64"),
  );
  backend.sequence++;
  await page.evaluate(
    (value) => window.__DEBUG_PLATFORM__.emit("notes-metadata", value),
    {
      metadata: backend.state().metadata,
      changes: [{ kind: "attachment", id: "image-visible" }],
    },
  );
  await wait(
    () => count("image-visible", "thumbnail") > oldThumb,
    "replacement reacquire",
  );
  check(
    "exact attachment metadata event reacquires same-field replacement",
    true,
  );
  // A pending original upgrade is discarded when its actual owner selection changes.
  hold = true;
  const began = new Promise((resolve) => (holdStarted = resolve));
  await node("image-visible").locator(".image-open").dblclick();
  await began;
  await api(page, "note.select", { id: "note-b" });
  releaseHold();
  hold = false;
  await idle(page);
  await new Promise((resolve) => setTimeout(resolve, 60));
  check(
    "late original preview cannot publish after owner navigation",
    (await page.locator(".image-preview").count()) === 0,
  );
  await api(page, "note.select", { id: "note-a" });
  await idle(page);
  await node("long-audio").scrollIntoViewIfNeeded();
  const decodes = await page.evaluate(() => window.__DEBUG_PLATFORM__.decodes);
  await node("long-audio")
    .getByRole("button", { name: "播放", exact: true })
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".audio-card audio")].some(
      (a) => a.duration > 600,
    ),
  );
  check(
    "audio activation acquires original and displays workspace recordedAt",
    count("long-audio", "original") === 1 &&
      (
        await node("long-audio").locator(".audio-recorded-at").innerText()
      ).includes("2026"),
  );
  await node("long-audio")
    .locator("audio")
    .evaluate((a) => {
      a.currentTime = 540;
    });
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".audio-card audio")].some(
      (a) => a.currentTime >= 539,
    ),
  );
  check(
    "long recording remains seekable without full Web Audio decode",
    (await page.evaluate(() => window.__DEBUG_PLATFORM__.decodes)) === decodes,
  );
  const budget = await page.evaluate(async () => {
    const { checkWaveformBudgets } =
      await import("/scripts/fixtures/media99-ui/waveform-budget.tsx");
    return checkWaveformBudgets();
  });
  check(
    "waveform checks known size and duration independently before fetch",
    budget.unknownSize === 0 &&
      budget.oversize === 0 &&
      budget.unknownDuration === 0 &&
      budget.longDuration === 0 &&
      budget.bounded === 1,
  );
  const audioSrc = await node("long-audio")
      .locator("audio")
      .getAttribute("src"),
    beforeSave = grants.length;
  await api(page, "editor.select", {
    from: nodes[0].content[0].text.length + 5,
    to: nodes[0].content[0].text.length + 5,
  });
  await api(page, "editor.insertText", { text: " saved" });
  await api(page, "app.flush");
  await idle(page);
  check(
    "ordinary note save does not reacquire media or replace active audio source",
    grants.length === beforeSave &&
      (await node("long-audio").locator("audio").getAttribute("src")) ===
        audioSrc,
  );
  // A cache clear should only refresh thumbnail consumers, preserving originals.
  await api(page, "data.open");
  await page
    .getByRole("button", { name: "清理缩略图缓存", exact: true })
    .click();
  await page
    .getByText("缩略图缓存已清理，查看附件时会重新生成", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  check(
    "thumbnail cache clear leaves activated original intact",
    count("long-audio", "original") === 1 &&
      (await node("long-audio").locator("audio").getAttribute("src")) ===
        audioSrc,
  );
  const audioHandle = await node("long-audio").locator("audio").elementHandle();
  const access = backend.state().access;
  backend.suspended = ["note-a"];
  backend.operationId = "media-prepare";
  const stopped = await page.evaluate((access) => {
    const audio = document.querySelector(".audio-card audio");
    window.__DEBUG_PLATFORM__.emit("notes-access", {
      phase: "prepare",
      operationId: "media-prepare",
      noteIds: ["note-a"],
      access: {
        ...access,
        suspended: ["note-a"],
        operationId: "media-prepare",
      },
    });
    return !audio || (audio.paused && !audio.getAttribute("src"));
  }, access);
  check(
    "prepare synchronously pauses and clears leased playback before ACK",
    stopped,
  );
  check("no uncaught browser errors", runtime.errors.length === 0);
  await writeFile(
    output + "/result.json",
    JSON.stringify(
      {
        passed: true,
        checks,
        grants,
        releaseCount: releases.length,
        metadata: runtime.metadata,
      },
      null,
      2,
    ),
  );
  console.log("MEDIA99 real App UI:", checks.length, "checks passed");
} catch (error) {
  await page.screenshot({ path: output + "/failure.png" });
  await writeFile(
    output + "/failure.json",
    JSON.stringify(
      {
        message: error.stack,
        checks,
        grants,
        errors: runtime.errors,
        body: (await page.locator("body").innerText()).slice(0, 1800),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  releaseHold?.();
  await runtime.cleanup();
}
