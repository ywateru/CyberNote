#!/usr/bin/env node
// Actual React App/Editor/Data UI -> exact production import worker -> real
// Session/SQLite/files. Only fixed source OS events, window API and dialogs fake.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openRuntime, api, state, idle } from "./runtime.mjs";
import { tinyPNG, chooseFiles } from "./mobile-attachments.mjs";
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
const frontendPaths = execFileSync("git", ["ls-files", "-z", "src", "scripts/debug/apple-notes-import92.mjs"], { encoding: "utf8" }).split("\0").filter(Boolean);
const frontendSources = Object.fromEntries(await Promise.all(frontendPaths.map(async path => [path, hash(await readFile(resolve(root, path)))])));
const frontendHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

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
  await page
    .locator(".apple-import-panel")
    .screenshot({ path: resolve(out, "preview-panel.png") });
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
  const internal = ws.attachments.filter(a => a.internal);
  check("APP93 internal records absent from all public note documents", internal.length === 2 && internal.every(a => !JSON.stringify(ws.notes.find(n => n.id === a.noteId).document).includes(a.id)));

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
  await page
    .locator(".apple-import-panel")
    .screenshot({ path: resolve(out, "complete-panel.png") });
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
  await page.getByRole("button", { name: "导出完整备份…" }).click();
  await until("backup written", async () => {
    try {
      await readFile(backup);
      return true;
    } catch {
      return false;
    }
  });
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

  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await api(page, "folder.select", { id: "all" });
  await api(page, "note.select", { id: rich.id });
  await page.waitForSelector('.attachment-node.image img');
  await until("all imported media loaded", () => page.locator('.attachment-node.image img').evaluate(n => n.naturalWidth > 0));
  check("APP93 actual Editor contains user media only", await page.locator('.attachment-node').count() === 3 && !(await page.locator('.note-document').innerText()).includes('Apple 备忘录原始记录.json'));
  const menu = page.getByRole("menu", { name: "附件菜单", exact: true });
  const openMenu = async (kind) => {
    await page.locator(`.attachment-node.${kind}`).first().evaluate(n => n.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1277, clientY: 795, button: 2 })));
    await menu.waitFor();
  };
  await openMenu("image");
  const bounds = await menu.boundingBox();
  await writeFile(resolve(out, "menu-geometry.json"), JSON.stringify({ bounds, viewport: page.viewportSize(), computed: await menu.evaluate(n => ({ left: n.style.left, top: n.style.top, width: n.offsetWidth, height: n.offsetHeight, right: getComputedStyle(n).right, bottom: getComputedStyle(n).bottom, margin: getComputedStyle(n).margin })) }, null, 2));
  await page.screenshot({ path: resolve(out, "attachment-image-menu-dark.png") });
  check("APP93 menu clamps bottom and right edges", bounds.x >= 8 && bounds.y >= 8 && bounds.x + bounds.width <= 1272 && bounds.y + bounds.height <= 792);
  await page.screenshot({ path: resolve(out, "attachment-image-menu-dark.png") });
  await menu.getByRole("menuitem", { name: "显示信息", exact: true }).click();
  const information = page.getByRole("dialog", { name: "附件信息", exact: true });
  await information.waitFor();
  check("APP93 information uses real authorized original bytes", (await information.innerText()).includes("image/png") && (await information.innerText()).includes(`${tinyPNG.length} 字节`));
  await page.screenshot({ path: resolve(out, "attachment-information.png") });
  await information.getByRole("button", { name: "关闭", exact: true }).click();
  await openMenu("image");
  await menu.getByRole("menuitem", { name: "预览图片", exact: true }).click();
  await page.getByRole("dialog", { name: "图片预览", exact: true }).waitFor();
  check("APP93 image action uses existing preview", await page.locator('.image-preview img').count() === 1);
  await api(page, "image.close");
  const menuExport = resolve(out, "menu-original.png");
  await page.evaluate(path => window.__DEBUG_PLATFORM__.configure({ dialog: { save: [path] } }), menuExport);
  await openMenu("image");
  await menu.getByRole("menuitem", { name: "保存附件…", exact: true }).click();
  await until("menu original export", async () => { try { return hash(await readFile(menuExport)) === hash(tinyPNG); } catch { return false; } });
  check("APP93 menu exports exact original bytes", hash(await readFile(menuExport)) === hash(tinyPNG));
  const callsBeforeCancel = rt.backend.calls.filter(c => c.command === "export_attachment").length;
  await page.evaluate(() => window.__DEBUG_PLATFORM__.configure({ dialog: { save: [null] } }));
  await openMenu("file");
  await menu.getByRole("menuitem", { name: "保存附件…", exact: true }).click();
  await idle(page);
  check("APP93 cancelled picker publishes no export", rt.backend.calls.filter(c => c.command === "export_attachment").length === callsBeforeCancel);
  const badPath = resolve(out, "missing-directory", "failure.txt");
  await page.evaluate(path => window.__DEBUG_PLATFORM__.configure({ dialog: { save: [path] } }), badPath);
  await openMenu("file");
  await menu.getByRole("menuitem", { name: "保存附件…", exact: true }).click();
  await until("export error visible", () => page.locator('.error-banner').count().then(n => n > 0));
  check("APP93 failed export reports a retryable error", await page.locator('.error-banner').count() === 1);
  await api(page, "app.dismissError");
  const beforeRemove = JSON.stringify((await state(page)).editorJSON);
  await openMenu("file");
  await menu.getByRole("menuitem", { name: "从备忘录中移除", exact: true }).click();
  await until("file node removed", () => page.locator('.attachment-node.file').count().then(n => n === 0));
  await api(page, "app.flush");
  await api(page, "editor.undo");
  await api(page, "app.flush");
  const undoState = await state(page);
  await writeFile(resolve(out, "undo-document.json"), JSON.stringify({ before: JSON.parse(beforeRemove), after: undoState.editorJSON, attachments: undoState.workspace.attachments }, null, 2));
  check("APP93 remove and Undo preserve original public document and managed files", JSON.stringify(undoState.editorJSON) === beforeRemove && undoState.workspace.attachments.length === 5);
  await openMenu("audio");
  check("APP93 saved audio exposes real play capability", await menu.getByRole("menuitem", { name: "播放", exact: true }).isEnabled());
  await page.screenshot({ path: resolve(out, "attachment-audio-menu-dark.png") });
  await page.keyboard.press("Escape");
  check("APP93 Escape restores focused attachment", await page.locator('.attachment-node.audio').evaluate(n => n === document.activeElement));
  await page.locator('.attachment-node.audio').press("Shift+F10");
  await menu.waitFor();
  await page.keyboard.press("ArrowDown");
  check("APP93 menu keyboard navigates actual enabled actions", await menu.getByRole("menuitem", { name: "保存附件…", exact: true }).evaluate(n => n === document.activeElement));
  await page.keyboard.press("Escape");
  await chooseFiles(page, [{ name: "合成视频.mp4", mimeType: "video/mp4", buffer: Buffer.from("synthetic media OS boundary") }]);
  await api(page, "app.flush");
  await page.waitForSelector('.attachment-node.video video');
  await page.locator('.attachment-node.video video').evaluate(n => {
    let paused = true; Object.defineProperty(n, "paused", { get: () => paused });
    n.play = async () => { paused = false; n.dispatchEvent(new Event("play")); };
    n.pause = () => { paused = true; n.dispatchEvent(new Event("pause")); };
  });
  await openMenu("video");
  await menu.getByRole("menuitem", { name: "播放", exact: true }).click();
  await openMenu("video");
  check("APP93 video action invokes scoped synthetic playback boundary", await menu.getByRole("menuitem", { name: "暂停", exact: true }).isEnabled());
  await menu.getByRole("menuitem", { name: "暂停", exact: true }).click();
  const late = resolve(out, "must-not-export-after-navigation.txt");
  const beforeDelayed = rt.backend.calls.filter(c => c.command === "export_attachment").length;
  await page.evaluate(path => { window.__DEBUG_PLATFORM__.dialogDelay = 600; window.__DEBUG_PLATFORM__.configure({ dialog: { save: [path] } }); }, late);
  await openMenu("file");
  await menu.getByRole("menuitem", { name: "保存附件…", exact: true }).click();
  await api(page, "note.select", { id: baseline.notes[0].id });
  await new Promise(done => setTimeout(done, 700));
  check("APP93 delayed picker refuses old owner action after navigation", rt.backend.calls.filter(c => c.command === "export_attachment").length === beforeDelayed);
  await page.evaluate(() => { window.__DEBUG_PLATFORM__.dialogDelay = 0; });
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
  const restored = await openRuntime({
    root,
    transport: binary,
    storeDirectory: resolve(out, "restored-store"),
    nativeToolbar: true,
    rustEvents: true,
    bundleDebug: true,
    keep: true,
  });
  runtimes.push(restored);
  await api(restored.page, "data.open");
  await restored.page.evaluate(
    (path) => window.__DEBUG_PLATFORM__.configure({ dialog: { open: [path] } }),
    backup,
  );
  await restored.page
    .getByRole("button", { name: "导入备份…", exact: true })
    .click();
  await until(
    "backup restored",
    async () => (await state(restored.page)).workspace.notes.length === 3,
  );
  const restoredWS = (await state(restored.page)).workspace;
  check(
    "actual backup restore retains raw records and file ownership",
    restoredWS.attachments.length === 5 &&
      restoredWS.attachments.every((a) =>
        restoredWS.notes.some((n) => n.id === a.noteId),
      ),
  );
  assert((await restored.backend.call("debug_apple_source", fixture)).ok);
  await api(restored.page, "appleImport.open");
  await api(restored.page, "appleImport.scan");
  await until(
    "restored preview",
    async () =>
      (await api(restored.page, "appleImport.inspect")).result.state?.phase ===
      "preview",
  );
  await api(restored.page, "appleImport.start");
  await until(
    "restored dedup",
    async () =>
      (await api(restored.page, "appleImport.inspect")).result.state?.phase ===
      "complete",
  );
  check(
    "restored managed raw ledger skips identical source on same worker",
    (
      await api(restored.page, "appleImport.inspect")
    ).result.state.results.filter((r) => r.status === "existing").length ===
      2 && (await state(restored.page)).workspace.notes.length === 3,
  );
  check(
    "restored App has no renderer exceptions",
    restored.errors.length === 0,
  );
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
        frontendHead,
        rendererErrors: runtimes.flatMap(rt => rt.errors),
        frontendSources,
        frontendSourcesUnchanged: (await Promise.all(Object.entries(frontendSources).map(async ([path, digest]) => hash(await readFile(resolve(root, path))) === digest))).every(Boolean),
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
