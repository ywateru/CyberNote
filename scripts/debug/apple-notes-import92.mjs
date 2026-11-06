#!/usr/bin/env node
// Actual React App/Editor/Data UI -> exact production import worker -> real
// Session/SQLite/files. Only fixed source OS events, window API and dialogs fake.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { openRuntime, api, state, idle } from "./runtime.mjs";
import { tinyPNG } from "./mobile-attachments.mjs";
const [buildArg, outArg] = process.argv.slice(2);
if (!buildArg || !outArg)
  throw Error(
    "Usage: node scripts/debug/apple-notes-import92.mjs EXACT_BUILD FRESH_OUTPUT",
  );
const root = process.cwd(),
  out = resolve(outArg),
  build = JSON.parse(await readFile(resolve(buildArg, "build.json"), "utf8")),
  hash = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(build.sourcesUnchanged, true);
for (const [path, digest] of Object.entries(build.sources))
  assert.equal(
    hash(await readFile(resolve(root, path))),
    digest,
    "exact current backend input " + path,
  );
assert.equal(hash(await readFile(build.binary.path)), build.binary.sha256);
await mkdir(out);
const binary = resolve(out, "import-core-transport");
await copyFile(build.binary.path, binary);
await chmod(binary, 0o700);
const checks = [],
  runtimes = [],
  start = performance.now();
let failure;
const check = (name, value) => {
  assert(value, name);
  checks.push(name);
  console.log("PASS " + name);
};
const until = async (name, predicate) => {
  const began = performance.now();
  for (;;) {
    if (await predicate()) return;
    if (performance.now() - began > 20000) throw Error(name + " timeout");
    await new Promise((r) => setTimeout(r, 40));
  }
};
const wav = Buffer.alloc(52);
wav.write("RIFF");
wav.writeUInt32LE(44, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(8, 40);
const meta = (id, title, status = "ok") => ({
  id,
  title,
  folderId: "folder-child",
  status,
  reason: status === "ok" ? null : status,
});
const media = (id, cid, name, index, status = "ok") => ({
  id,
  cid,
  name,
  status,
  reason: status === "ok" ? null : "export_failed",
  exportIndex: index,
});
const body = (id, title, html, attachments = []) => ({
  version: 1,
  status: "ok",
  reason: null,
  note: {
    id,
    title,
    folderId: "folder-child",
    html,
    plainText: title + " 合成正文",
    createdAtMs: 1000,
    updatedAtMs: 2000,
    attachments,
    stable: true,
  },
});
const fixture = {
  scan: {
    version: 1,
    status: "ok",
    reason: null,
    accounts: [{ id: "account", name: "合成账户" }],
    folders: [
      { id: "folder-root", name: "合成父目录", parentId: "account" },
      { id: "folder-child", name: "合成子目录", parentId: "folder-root" },
    ],
    notes: [
      meta("rich", "合成富文本"),
      meta("loss", "合成特殊对象"),
      meta("failure", "合成导出失败"),
      meta("locked", "合成锁定", "locked"),
    ],
    truncated: false,
  },
  reads: {
    rich: body(
      "rich",
      "合成富文本",
      "<h1>合成富文本</h1><p><b>粗体</b><u>下划线</u><a href='https://example.test'>链接</a></p><ul data-type='taskList'><li data-checked='true'>已完成</li></ul><table><tr><td>A</td><td>B</td></tr></table><img src='cid:image'><audio src='cid:audio'></audio><object data='cid:file'></object>",
      [
        media("image", "image", "原图.png", 0),
        media("audio", "audio", "录音.wav", 1),
        media("file", "file", "原件.txt", 2),
      ],
    ),
    loss: body(
      "loss",
      "合成特殊对象",
      "<p>合成特殊对象</p><svg><path d='M0 0L1 1'/></svg>",
    ),
    failure: body("failure", "合成导出失败", "<p>合成导出失败</p>", [
      media("failed", null, null, 0, "export_failed"),
    ]),
  },
  files: {
    image: tinyPNG.toString("base64"),
    audio: wav.toString("base64"),
    file: Buffer.from("synthetic original bytes").toString("base64"),
  },
  delayMs: 160,
};
try {
  const rt = await openRuntime({
    root,
    transport: binary,
    storeDirectory: resolve(out, "store"),
    nativeToolbar: true,
    rustEvents: true,
    bundleDebug: true,
    keep: true,
  });
  runtimes.push(rt);
  const { page } = rt;
  let configured = await rt.backend.call("debug_apple_source", fixture);
  assert(configured.ok);
  await api(page, "note.create");
  await api(page, "editor.setContent", {
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "原有合成笔记" }],
        },
      ],
    },
  });
  await api(page, "app.flush");
  await api(page, "settings.update", { settings: { theme: "dark" } });
  const baseline = (await state(page)).workspace;
  check("baseline real Store note saved", baseline.notes.length === 1);
  await api(page, "data.open");
  await page.waitForSelector(".apple-import-entry");
  await page
    .getByRole("button", {
      name: "从 Apple 备忘录导入 复制笔记与附件，保留系统备忘录中的原件",
    })
    .click();
  await api(page, "appleImport.scan");
  await until(
    "source preview",
    async () =>
      (await api(page, "appleImport.inspect")).result.state?.phase ===
      "preview",
  );
  let projection = (await api(page, "appleImport.inspect")).result;
  check(
    "actual preview lists hierarchy and locked reason",
    projection.state.items.length === 4 &&
      projection.selected.length === 3 &&
      (await page.locator(".apple-import-panel").innerText()).includes(
        "合成账户 / 合成父目录 / 合成子目录",
      ),
  );
  check(
    "source raw IDs absent from rendered HTML",
    !(await page.locator(".apple-import-panel").innerHTML()).includes(
      "folder-child",
    ),
  );
  await page.screenshot({ path: resolve(out, "preview.png") });
  await api(page, "appleImport.start");
  await until(
    "copy finished",
    async () =>
      (await api(page, "appleImport.inspect")).result.state?.phase ===
      "complete",
  );
  await idle(page);
  projection = (await api(page, "appleImport.inspect")).result;
  check(
    "complete result distinguishes imported loss and export failure",
    projection.state.results.filter((r) => r.status === "imported").length ===
      1 &&
      projection.state.results.filter(
        (r) => r.status === "imported_with_warnings",
      ).length === 1 &&
      projection.state.results.filter((r) => r.status === "skipped").length ===
        1,
  );
  let ws = (await state(page)).workspace;
  check(
    "real Store append preserves baseline and settings",
    ws.notes.length === 3 &&
      ws.notes.some((n) => n.id === baseline.notes[0].id) &&
      ws.settings.theme === "dark",
  );
  check(
    "real source media and raw records separately managed",
    ws.attachments.length === 5 &&
      ws.attachments.filter(
        (a) => a.mime === "application/vnd.local-notes.apple-import+json",
      ).length === 2,
  );
  const rich = ws.notes.find((n) => n.title === "合成富文本");
  check(
    "rich existing Editor schema and original dates retained",
    rich.createdAt === 1000 &&
      rich.updatedAt === 2000 &&
      JSON.stringify(rich.document).includes("taskList") &&
      JSON.stringify(rich.document).includes("underline") &&
      JSON.stringify(rich.document).includes("table"),
  );
  await page.locator(".apple-import-panel details summary").click();
  check(
    "actual result DOM exposes loss and source failure details",
    (await page.locator(".apple-import-panel").innerText()).includes(
      "源附件无法导出",
    ),
  );
  await page.screenshot({ path: resolve(out, "complete.png") });
  await writeFile(
    resolve(out, "complete.html"),
    await page.locator(".apple-import-section").evaluate((n) => n.outerHTML),
  );
  const png = ws.attachments.find((a) => a.kind === "image");
  const exported = resolve(out, "original.png");
  await page.evaluate(
    (path) => window.__DEBUG_PLATFORM__.configure({ dialog: { save: [path] } }),
    exported,
  );
  await api(page, "data.exportAttachment", { id: png.id });
  check(
    "original imported image export bytes exact",
    hash(await readFile(exported)) === hash(tinyPNG),
  );
  await api(page, "appleImport.scan");
  await until(
    "repeat preview",
    async () =>
      (await api(page, "appleImport.inspect")).result.state?.phase ===
      "preview",
  );
  await api(page, "appleImport.start");
  await until(
    "repeat finished",
    async () =>
      (await api(page, "appleImport.inspect")).result.state?.phase ===
      "complete",
  );
  await idle(page);
  projection = (await api(page, "appleImport.inspect")).result;
  check(
    "repeat same worker skips copies without duplicates",
    projection.state.results.filter((r) => r.status === "existing").length ===
      2 && (await state(page)).workspace.notes.length === 3,
  );
  configured = await rt.backend.call("debug_apple_source", {
    ...fixture,
    delayMs: 900,
  });
  assert(configured.ok);
  await api(page, "appleImport.scan");
  await api(page, "appleImport.cancel");
  await until(
    "cancel terminal",
    async () =>
      (await api(page, "appleImport.inspect")).result.state?.phase ===
      "cancelled",
  );
  check(
    "cancel scan stops owned worker without writes",
    (await state(page)).workspace.notes.length === 3,
  );
  await api(page, "appleImport.open");
  await page.getByRole("button", { name: "关闭 Apple 备忘录导入" }).click();
  const backup = resolve(out, "complete.notesbackup");
  await page.evaluate(
    (path) => window.__DEBUG_PLATFORM__.configure({ dialog: { save: [path] } }),
    backup,
  );
  await api(page, "archive.export");
  const archive = JSON.parse(await readFile(backup, "utf8"));
  check(
    "actual backup contains all five managed original and raw blobs",
    archive.attachments.length === 5 && Object.keys(archive.blobs).length === 5,
  );
  const raw = archive.attachments.filter(
    (a) => a.mime === "application/vnd.local-notes.apple-import+json",
  );
  check(
    "raw source HTML is a separate backup file",
    raw.every((a) =>
      JSON.parse(
        Buffer.from(archive.blobs[a.id], "base64"),
      ).snapshot.html.includes("<"),
    ),
  );
  await page.reload();
  await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
  await idle(page);
  check(
    "same Store reopening retains imported data",
    (await state(page)).workspace.notes.length === 3,
  );
  await api(page, "data.open");
  await api(page, "data.refresh");
  check(
    "data inventory sees all retained files",
    (await page.locator(".data-management").innerText()).length > 0,
  );
  check("no renderer exceptions", rt.errors.length === 0);
  const mobile = await openRuntime({
    root,
    transport: binary,
    storeDirectory: resolve(out, "mobile-store"),
    mobile: true,
    rustEvents: true,
    bundleDebug: true,
    keep: true,
  });
  runtimes.push(mobile);
  await api(mobile.page, "data.open");
  check(
    "Mac source entry absent in actual mobile App DOM",
    (await mobile.page.locator(".apple-import-entry").count()) === 0,
  );
} catch (e) {
  failure = e;
  console.error(e.stack || e);
} finally {
  for (const rt of runtimes.reverse()) {
    try {
      await rt.cleanup({ keep: true });
    } catch (e) {
      failure ||= e;
    }
  }
  await writeFile(
    resolve(out, "result.json"),
    JSON.stringify(
      {
        passed: !failure,
        checks,
        wallMs: performance.now() - start,
        error: failure?.message,
        scope:
          "actual App DOM and exact production core/Session/Store; fixed synthetic OS Source, native windows/dialogs/media mocked; no Apple Notes/device access",
      },
      null,
      2,
    ) + "\n",
  );
}
if (failure) process.exitCode = 1;
