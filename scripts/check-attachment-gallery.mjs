import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state, saveJSON } from "./debug/runtime.mjs";
const output = resolve("artifacts/attachment-gallery");
await mkdir(output, { recursive: true });
const checks = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
};
function wav() {
  const rate = 8000,
    n = rate * 2,
    b = Buffer.alloc(44 + n * 2);
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
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(Math.sin((i * 440 * Math.PI * 2) / rate) * 8000, i * 2 + 44);
  return b;
}
function seed(backend) {
  backend.galleryReads = [];
  const call = backend.call.bind(backend);
  backend.call = async (command, args = {}) => {
    if (command === "read_attachment" || command === "acquire_attachment_source") backend.galleryReads.push(args.id);
    return call(command, args);
  };
  const ws = backend.workspace;
  ws.folders.push({
    id: "project",
    name: "工作项目",
    kind: "normal",
    parentId: null,
    sortOrder: 1,
    createdAt: 1,
  });
  ws.notes[0].title = "产品设计备忘";
  ws.notes[0].document.content[0].content[0].text = "产品设计备忘";
  ws.notes[1].title = "周五的产品讨论";
  ws.notes[1].folderId = "project";
  ws.notes[1].document.content = [
    { type: "paragraph", content: [{ type: "text", text: "周五的产品讨论" }] },
    ...Array.from({ length: 45 }, (_, i) => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `讨论记录 ${i + 1}：让记录更自然，让灵感有处安放。`,
        },
      ],
    })),
  ];
  ws.notes.push({
    ...structuredClone(ws.notes[0]),
    id: "locked",
    title: "锁定备忘录",
    locked: true,
    document: { type: "doc", content: [] },
  });
  ws.notes.push({
    ...structuredClone(ws.notes[0]),
    id: "deleted",
    title: "已删除备忘录",
    deletedAt: 1,
    folderId: "trash",
    document: { type: "doc", content: [] },
  });
  const add = (
    id,
    noteId,
    kind,
    mime,
    name,
    bytes,
    extra = {},
    reference = true,
  ) => {
    const a = {
      id,
      noteId,
      kind,
      mime,
      displayName: name,
      relativePath: "synthetic/" + id,
      size: bytes.length,
      ...extra,
    };
    ws.attachments.push(a);
    backend.files.set(id, bytes.toString("base64"));
    if (reference)
      ws.notes
        .find((n) => n.id === noteId)
        .document.content.push({
          type: "attachment",
          attrs: { id, kind, name },
        });
  };
  const palettes = [
    ["#f6e6d3", "#c68152"],
    ["#e3ece7", "#638e7b"],
    ["#e2e7f0", "#697aa4"],
    ["#f0e4ec", "#a37390"],
    ["#e9e5d8", "#9f925b"],
    ["#e1e9ec", "#5f8b98"],
  ];
  palettes.forEach(([bg, ink], i) =>
    add(
      "photo-" + i,
      i < 3 ? "note-a" : "note-b",
      "image",
      "image/svg+xml",
      `设计草图-${i + 1}.svg`,
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="460"><rect width="640" height="460" fill="${bg}"/><circle cx="320" cy="215" r="125" fill="${ink}"/><rect x="210" y="165" width="220" height="190" rx="18" fill="${bg}" opacity=".55"/><text x="35" y="425" font-family="sans-serif" font-size="20" fill="${ink}">CyberNote / Design study 0${i + 1}</text></svg>`,
      ),
    ),
  );
  add("audio-a", "note-a", "audio", "audio/wav", "产品讨论录音.wav", wav(), {
    recordedAt: 1794000000000,
  });
  add("audio-b", "note-b", "audio", "audio/wav", "采访记录.wav", wav());
  add(
    "file-a",
    "note-a",
    "file",
    "application/pdf",
    "项目说明.pdf",
    Buffer.from("%PDF-1.4\nfixture"),
  );
  add(
    "file-b",
    "note-b",
    "file",
    "text/plain",
    "会议摘要.txt",
    Buffer.from("会议摘要"),
  );
  add(
    "orphan",
    "note-a",
    "image",
    "image/svg+xml",
    "未引用.svg",
    Buffer.from("<svg/>"),
    {},
    false,
  );
  add(
    "internal",
    "note-a",
    "file",
    "application/json",
    "来源记录.json",
    Buffer.from("{}"),
    { internal: true },
    false,
  );
  add(
    "locked-photo",
    "locked",
    "image",
    "image/svg+xml",
    "锁定内容.svg",
    Buffer.from("<svg/>"),
  );
  add(
    "deleted-photo",
    "deleted",
    "image",
    "image/svg+xml",
    "已删除.svg",
    Buffer.from("<svg/>"),
  );
  backend.sequence++;
}
const runtime = await openRuntime({ bundleDebug: true });
const { page, backend } = runtime;
const open = async () => {
  await page.getByRole("button", { name: "显示选项", exact: true }).click();
  await page.getByRole("menuitem", { name: "查看附件", exact: true }).click();
  await page.locator(".attachment-gallery").waitFor();
};
const card = (id) =>
  page.locator(`.attachment-gallery-card[data-attachment-id="${id}"]`);
const tab = (name) => page.getByRole("tab", { name: new RegExp("^" + name) });
try {
  seed(backend);
  await page.reload();
  await page.waitForSelector("#startup", { state: "detached" });
  await idle(page);
  await api(page, "folder.select", { id: "all" });
  await idle(page);
  await open();
  await page.waitForFunction(
    () => document.querySelectorAll(".attachment-gallery-card img").length >= 4,
  );
  check(
    "View menu opens a gallery with sidebar and no editor column",
    (await page.locator(".app.attachment-browse").count()) === 1 &&
      (await page.locator(".sidebar").isVisible()) &&
      !(await page.locator(".editor-pane").isVisible()),
  );
  check(
    "Image tab includes referenced SVG attachments across notes",
    (await page.locator(".attachment-gallery-card").count()) === 6,
  );
  check(
    "Internal, orphan, locked and deleted attachments are excluded",
    (await page
      .locator(
        '.attachment-gallery-card[data-attachment-id="orphan"],.attachment-gallery-card[data-attachment-id="locked-photo"],.attachment-gallery-card[data-attachment-id="deleted-photo"],.attachment-gallery-card[data-attachment-id="internal"]',
      )
      .count()) === 0,
  );
  await card("photo-4").locator(".attachment-gallery-select").click();
  check(
    "Single click selects without opening a preview",
    (await card("photo-4")
      .getAttribute("class")
      .then((s) => s.includes("selected"))) &&
      (await page.locator(".image-preview").count()) === 0,
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: resolve(output, "photos-desktop.png") });
  await card("photo-4").click({ button: "right" });
  check(
    "Gallery uses shared menu component and includes note location",
    (await page.getByRole("menu", { name: "附件画廊菜单" }).count()) === 1 &&
      (await page
        .getByRole("menuitem", { name: "在备忘录中显示", exact: true })
        .count()) === 1,
  );
  await page.screenshot({ path: resolve(output, "context-menu.png") });
  await page
    .getByRole("menuitem", { name: "快速查看附件", exact: true })
    .click();
  await page.locator(".image-preview").waitFor();
  check(
    "A non-selected note can open the existing floating preview",
    (await page.locator(".image-preview").getAttribute("data-preview-id")) ===
      "photo-4",
  );
  await api(page, "image.close");
  await idle(page);
  await card("photo-4").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "在备忘录中显示", exact: true })
    .click();
  await page.waitForSelector(
    '.attachment-node[data-attachment-id="photo-4"][data-attachment-jump="true"]',
  );
  const located = await state(page);
  check(
    "Location changes to the owning physical folder and note",
    located.selection.folderId === "project" &&
      located.selection.noteId === "note-b" &&
      !located.selection.attachmentBrowser,
  );
  await page.waitForFunction(() => {
    const r = document
      .querySelector('.attachment-node[data-attachment-id="photo-4"]')
      ?.getBoundingClientRect();
    return r && r.y >= 0 && r.y < innerHeight;
  });
  const bounds = await page
    .locator('.attachment-node[data-attachment-id="photo-4"]')
    .boundingBox();
  check(
    "Deep attachment is selected and scrolled into the editor",
    located.editorSelection.type === "node" && bounds.y >= 0 && bounds.y < 960,
  );
  await page.screenshot({ path: resolve(output, "located-note.png") });
  await api(page, "folder.select", { id: "all" });
  await idle(page);
  await open();
  await tab("音频").click();
  check(
    "Audio attachments use gallery cards and real playback controls",
    (await page.locator(".attachment-gallery-card").count()) === 2 &&
      (await page.getByRole("button",{name:/^播放 .*\.wav$/}).count()) === 2,
  );
  await card("audio-a")
    .getByRole("button", { name: "播放 产品讨论录音.wav", exact: true })
    .click();
  const playingElement = await card("audio-a").locator("audio").elementHandle();
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        ".attachment-gallery-audio audio:not([data-none])",
      ) &&
      [...document.querySelectorAll(".attachment-gallery-audio audio")].some(
        (a) => !a.paused,
      ),
  );
  check(
    "Audio can play directly in gallery",
    await page
      .locator(".attachment-gallery-audio audio")
      .evaluateAll((nodes) => nodes.some((n) => !n.paused)),
  );
  await page.screenshot({ path: resolve(output, "audio-desktop.png") });
  await card("audio-b").locator(".gallery-note-link").click();
  await page.waitForSelector(
    '.attachment-node[data-attachment-id="audio-b"][data-attachment-jump="true"]',
  );
  check(
    "Audio link locates its attachment in the owning note",
    (await state(page)).selection.noteId === "note-b",
  );
  check(
    "Leaving gallery disposes its playback elements",
    (await page.locator(".attachment-gallery-audio audio").count()) === 0,
  );
  check(
    "The old audio actually pauses and releases its source after navigation",
    await playingElement.evaluate((n) => n.paused && !n.getAttribute("src")),
  );
  await api(page, "folder.select", { id: "all" });
  await idle(page);
  await open();
  await tab("文稿").click();
  check(
    "Other files also use gallery cards",
    (await page.locator(".attachment-gallery-card").count()) === 2,
  );
  await card("file-b").click({ button: "right" });
  await page.getByRole("menuitem", { name: "保存附件…", exact: true }).click();
  await page.waitForFunction(() =>
    window.__DEBUG_PLATFORM__.calls.some(
      (c) => c.command === "export_attachment",
    ),
  );
  check(
    "Gallery exports the original attachment bytes",
    backend.exports.some(
      (e) => e.id === "file-b" && e.data === backend.files.get("file-b"),
    ),
  );
  await page.locator(".gallery-header-search input").fill("采访记录");
  await idle(page);
  await tab("全部附件").click();
  check(
    "Gallery search matches attachment filenames",
    (await page.locator(".attachment-gallery-card").count()) === 1 &&
      (await card("audio-b").count()) === 1,
  );
  await card("audio-b").locator(".gallery-note-link").click();
  await page.waitForSelector(
    '.attachment-node[data-attachment-id="audio-b"][data-attachment-jump="true"]',
  );
  check(
    "Locating from search clears the query that could hide the target",
    (await state(page)).selection.query === "",
  );
  await api(page, "folder.select", { id: "default" });
  await idle(page);
  await open();
  await tab("全部附件").click();
  check(
    "Folder scope limits attachment owners",
    (await page.locator(".attachment-gallery-card").count()) === 5,
  );
  check(
    "Hidden attachments never trigger file reads",
    !backend.galleryReads.some((id) =>
      ["locked-photo", "deleted-photo", "internal", "orphan"].includes(id),
    ),
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: resolve(output, "dark-desktop.png") });
  await tab("文稿").focus();
  await page.keyboard.press("ArrowRight");
  check(
    "Category tabs support keyboard navigation",
    (await tab("全部附件").getAttribute("aria-selected")) === "true",
  );
  await page.keyboard.press("Escape");
  check(
    "Escape leaves attachment mode",
    (await state(page)).selection.attachmentBrowser === false,
  );
  await api(page, "folder.select", { id: "all" });
  await idle(page);
  await open();
  await tab("音频").click();
  await card("audio-a")
    .getByRole("button", { name: "播放 产品讨论录音.wav", exact: true })
    .click();
  await card("audio-a").click({ button: "right" });
  const prepared = backend.state();
  backend.suspended = ["note-a"];
  backend.operationId = "gallery-prepare";
  const sealed = await page.evaluate(
    (value) => {
      const card = document.querySelector(
        '.attachment-gallery-card[data-attachment-id="audio-a"]',
      );
      const audio = card?.querySelector("audio");
      window.__DEBUG_PLATFORM__.emit("notes-access", value);
      return (!card?.isConnected || card.hidden) && (!audio || audio.paused);
    },
    {
      phase: "prepare",
      operationId: "gallery-prepare",
      noteIds: ["note-a"],
      access: {
        ...prepared.access,
        operationId: "gallery-prepare",
        suspended: ["note-a"],
      },
    },
  );
  await page.waitForSelector(".access-cover");
  check(
    "Access prepare synchronously hides gallery media and stops audio",
    sealed,
  );
  check(
    "Access change closes the old attachment context menu",
    (await page.getByRole("menu", { name: "附件画廊菜单" }).count()) === 0,
  );
  check("No uncaught browser errors", runtime.errors.length === 0);
  await saveJSON(resolve(output, "desktop-result.json"), {
    passed: true,
    checks,
    scope: runtime.metadata,
  });
  console.log("Desktop gallery:", checks.length, "checks passed");
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png") })
    .catch(() => {});
  await saveJSON(resolve(output, "desktop-result.json"), {
    passed: false,
    error: error.message,
    checks,
    pageErrors: runtime.errors,
  });
  throw error;
} finally {
  await runtime.cleanup();
}

const mac = await openRuntime({ bundleDebug: true, nativeToolbar: true });
try {
  seed(mac.backend);
  await mac.page.reload();
  await mac.page.waitForSelector("#startup", { state: "detached" });
  await idle(mac.page);
  const enabled = await mac.page.evaluate(
    () =>
      window.__DEBUG_PLATFORM__.toolbarStates
        .at(-1)
        .menus.find((m) => m.owner === "viewOptions")
        .items.find((i) => i.command === "viewAttachments").enabled,
  );
  assert.ok(enabled);
  await mac.page.evaluate(() => {
    const p = window.__DEBUG_PLATFORM__;
    const s = p.toolbarStates.at(-1);
    return p.emit("notes-ui://intent", {
      windowLabel: "main",
      bindingId: "synthetic-toolbar82",
      stateRevision: s.revision,
      sequence: 1,
      intent: {
        kind: "menu",
        owner: "viewOptions",
        command: "viewAttachments",
      },
    });
  });
  await mac.page.locator(".attachment-gallery").waitFor();
  await idle(mac.page);
  const projection = await mac.page.evaluate(() =>
    window.__DEBUG_PLATFORM__.toolbarStates.at(-1),
  );
  assert.equal(projection.layout, "galleryBrowse");
  assert.ok(projection.actions.some((a) => a.action === "viewOptions"));
  assert.ok(
    projection.menus
      .find((m) => m.owner === "viewOptions")
      .items.some((i) => i.command === "viewAttachments" && i.selected),
  );
  assert.equal(mac.errors.length, 0);
  await saveJSON(resolve(output, "native-result.json"), {
    passed: true,
    checks: [
      "Native menu enables View Attachments",
      "Native intent opens actual gallery",
      "Browsing toolbar retains view options",
      "Attachment mode is selected",
      "No uncaught errors",
    ],
    scope: mac.metadata,
  });
  console.log("Native projection: 5 checks passed");
} finally {
  await mac.cleanup();
}

const mobile = await openRuntime({ bundleDebug: true, mobile: true });
try {
  seed(mobile.backend);
  await mobile.page.reload();
  await mobile.page.waitForSelector("#startup", { state: "detached" });
  await idle(mobile.page);
  await mobile.page
    .getByRole("button", { name: "显示选项", exact: true })
    .click();
  await mobile.page
    .getByRole("menuitem", { name: "查看附件", exact: true })
    .click();
  await mobile.page.locator(".attachment-gallery").waitFor();
  await mobile.page.screenshot({ path: resolve(output, "photos-mobile.png") });
  assert.ok(
    (await mobile.page.locator(".attachment-gallery-card").count()) > 0,
  );
  await mobile.page
    .locator(
      '.attachment-gallery-card[data-attachment-id="photo-4"] .gallery-note-link',
    )
    .click();
  await mobile.page.waitForSelector(
    '.attachment-node[data-attachment-id="photo-4"][data-attachment-jump="true"]',
  );
  assert.equal((await state(mobile.page)).selection.noteId, "note-b");
  assert.equal(mobile.errors.length, 0);
  await saveJSON(resolve(output, "mobile-result.json"), {
    passed: true,
    checks: [
      "Mobile view menu opens gallery",
      "Mobile gallery is populated",
      "Note link locates exact attachment",
      "No uncaught errors",
    ],
    scope: mobile.metadata,
  });
  console.log("Mobile gallery: 4 checks passed");
} finally {
  await mobile.cleanup();
}
