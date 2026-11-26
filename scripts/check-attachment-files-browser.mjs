// Production App/Editor/attachment journal flow; only OS handoff is simulated.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state } from "./debug/runtime.mjs";
import { chooseFiles, tinyPNG, refs } from "./debug/mobile-attachments.mjs";
const output = resolve(process.argv[2] || "artifacts/attachment-files/browser");
await mkdir(output, { recursive: true });
let runtime;
const checks = [];
try {
  runtime = await openRuntime({ nativeToolbar: true });
  const { page, backend } = runtime;
  const originalCall = backend.call.bind(backend);
  let clipboard = [],
    failCopy = false,
    delayCopy = 0,
    delayRead = 0;
  const actions = [];
  backend.call = async (command, args) => {
    if (command !== "attachment_desktop") return originalCall(command, args);
    try {
      const a = backend.workspace.attachments.find((a) => a.id === args.id),
        owner = args.action === "readClipboard" ? args.noteId : a?.noteId;
      backend.assertNote(owner);
      assert.equal(args.expected.sessionId, backend.sessionId);
      if (args.action === "readClipboard") {
        if (delayRead) await new Promise((r) => setTimeout(r, delayRead));
        return { ok: true, value: { files: clipboard } };
      }
      if (args.action === "copy") {
        if (delayCopy) await new Promise((r) => setTimeout(r, delayCopy));
        if (failCopy) throw Error("Controlled clipboard failure");
        clipboard = [
          { name: a.displayName, mime: a.mime, data: backend.files.get(a.id) },
        ];
      }
      actions.push({ action: args.action, id: a.id });
      return { ok: true, value: { ok: true } };
    } catch (error) {
      return {
        ok: false,
        error: { code: "attachment", message: error.message },
      };
    }
  };
  await api(page, "note.select", { id: "note-a" });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 460"><rect width="800" height="460" fill="#241f32"/><rect x="110" y="90" width="580" height="280" rx="35" fill="#ffbf2f"/><path d="M280 300V160h110q90 0 90 70t-90 70z" fill="#241f32"/><circle cx="550" cy="230" r="32" fill="#fff3c8"/></svg>';
  await chooseFiles(
    page,
    [
      {
        name: "设计图.svg",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(svg),
      },
      {
        name: "说明.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("exact original attachment bytes"),
      },
    ],
    { emptyMime: true },
  );
  await idle(page);
  const original = backend.workspace.attachments.find(
    (a) => a.displayName === "设计图.svg",
  );
  assert.equal(original.kind, "image");
  assert.equal(original.mime, "image/svg+xml");
  assert.equal(
    Buffer.from(backend.files.get(original.id), "base64").toString(),
    svg,
  );
  const card = (id) =>
    page.locator(`.attachment-node[data-attachment-id="${id}"]:visible`);
  await page.waitForFunction((id) => {
    const img = document.querySelector(`[data-attachment-id="${id}"] img`);
    return img?.complete && img.naturalWidth > 0;
  }, original.id);
  assert(
    (await card(original.id).locator("img").getAttribute("src")).startsWith(
      "http://127.0.0.1:",
    ),
  );
  checks.push(
    "generic-MIME SVG becomes a decoded image; original bytes retained; document stores references",
  );
  const menu = page.getByRole("menu", { name: "附件菜单", exact: true });
  const info = page.getByRole("dialog", { name: "附件信息", exact: true });
  const pluginEvents = () =>
    page.evaluate(
      () =>
        window.__DEBUG_PLATFORM__.events.filter(
          event => event === "notes-plugins",
        ).length,
    );
  const updateAttachmentInspector = async update => {
    const before = await pluginEvents();
    await page.evaluate(
      async request => {
        await window.__TAURI_INTERNALS__.invoke("plugin_update", { request });
      },
      { id: "cybernote.attachments.inspector", ...update },
    );
    await page.waitForFunction(
      before =>
        window.__DEBUG_PLATFORM__.events.filter(
          event => event === "notes-plugins",
        ).length > before,
      before,
    );
    await idle(page);
  };
  const open = async (id) => {
    await card(id).scrollIntoViewIfNeeded();
    await card(id).click({ button: "right" });
    await menu.waitFor();
  };
  const baseline = (await state(page)).editorJSON;
  const imageButton = card(original.id).getByRole("button", {
    name: "选择图片 设计图.svg",
    exact: true,
  });
  await imageButton.click();
  assert.equal((await state(page)).editorSelection.type, "node");
  assert.equal(await page.locator(".image-preview").count(), 0);
  assert.deepEqual((await state(page)).editorJSON, baseline);
  // Start a new typing history group after fixture upload (PM default: 500ms).
  await page.waitForTimeout(550);
  await page.locator(".tiptap:visible p").last().click();
  await page.keyboard.type("After image selection");
  await idle(page);
  assert(
    JSON.stringify((await state(page)).editorJSON).includes(
      "After image selection",
    ),
  );
  await api(page, "editor.undo");
  await idle(page);
  assert.deepEqual((await state(page)).editorJSON, baseline);
  const thumbnail = page.locator(
    '.note-row[data-note-id="note-a"] .note-thumbnail img',
  );
  await thumbnail.waitFor();
  await thumbnail.evaluate((image) => image.decode());
  assert(await thumbnail.evaluate((image) => image.naturalWidth > 0));
  checks.push(
    "single click selects image without preview/document mutation; authorized SVG thumbnail decodes in list",
  );
  await api(page, "note.patch", { pinned: true });
  await idle(page);
  const pinnedHeading = page.locator(".pinned-heading");
  await page.mouse.move(1270, 850);
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".pinned-heading")).boxShadow ===
      "none",
  );
  assert.equal(await pinnedHeading.getAttribute("aria-expanded"), "true");
  assert.equal(
    await pinnedHeading.evaluate((e) => getComputedStyle(e).boxShadow),
    "none",
  );
  await pinnedHeading.click();
  await pinnedHeading.click();
  await page.mouse.move(1270, 850);
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".pinned-heading")).boxShadow ===
      "none",
  );
  assert.equal(
    await pinnedHeading.evaluate((e) => getComputedStyle(e).boxShadow),
    "none",
  );
  await api(page, "note.patch", { pinned: false });
  await idle(page);
  checks.push(
    "pinned heading stays ordinary when expanded and after collapse/expand",
  );
  await open(original.id);
  assert(await menu.evaluate((e) => e.classList.contains("unified-menu")));
  assert.equal(
    await page.evaluate(
      () => window.__DEBUG_PLATFORM__.toolbarStates.at(-1).contentOverlay,
    ),
    false,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__DEBUG_PLATFORM__.toolbarStates
          .at(-1)
          .actions.find((a) => a.action === "format").enabled,
    ),
    true,
  );
  await page.keyboard.press("End");
  assert.equal(await page.locator(":focus").innerText(), "从备忘录中移除");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await open(original.id);
  for (const name of [
    "剪切",
    "拷贝",
    "粘贴",
    "共享…",
    "快速查看附件",
    "打开附件",
    "在文件夹中显示",
    "保存附件…",
    "显示信息",
    "从备忘录中移除",
  ])
    assert(
      await menu.getByRole("menuitem", { name, exact: true }).isEnabled(),
      name,
    );
  await menu
    .getByRole("menuitem", { name: "显示信息", exact: true })
    .click();
  await info.waitFor();
  assert.match(await info.innerText(), /（[\d,]+ 字节）/);
  await info.getByRole("button", { name: "关闭", exact: true }).click();
  await info.waitFor({ state: "hidden" });
  await updateAttachmentInspector({
    config: { showByteCount: false, showRecordedAt: true },
  });
  await open(original.id);
  await menu
    .getByRole("menuitem", { name: "显示信息", exact: true })
    .click();
  await info.waitFor();
  assert.doesNotMatch(await info.innerText(), /（[\d,]+ 字节）/);
  await info.getByRole("button", { name: "关闭", exact: true }).click();
  await info.waitFor({ state: "hidden" });
  await updateAttachmentInspector({
    config: { showByteCount: true, showRecordedAt: true },
  });
  await open(original.id);
  await menu
    .getByRole("menuitem", { name: "显示信息", exact: true })
    .click();
  await info.waitFor();
  assert.match(await info.innerText(), /（[\d,]+ 字节）/);
  await info.getByRole("button", { name: "关闭", exact: true }).click();
  await info.waitFor({ state: "hidden" });
  await updateAttachmentInspector({ enabled: false });
  await open(original.id);
  assert.equal(
    await menu.getByRole("menuitem", { name: "显示信息", exact: true }).count(),
    0,
  );
  assert(
    await menu
      .getByRole("menuitem", { name: "快速查看附件", exact: true })
      .isEnabled(),
  );
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await updateAttachmentInspector({ enabled: true });
  await open(original.id);
  assert.equal(
    await menu.getByRole("menuitem", { name: "显示信息", exact: true }).count(),
    1,
  );
  await menu
    .getByRole("menuitem", { name: "显示信息", exact: true })
    .click();
  await info.waitFor();
  await updateAttachmentInspector({ enabled: false });
  await info.waitFor({ state: "hidden" });
  await updateAttachmentInspector({ enabled: true });
  await open(original.id);
  assert.equal(
    await menu.getByRole("menuitem", { name: "显示信息", exact: true }).count(),
    1,
  );
  await menu
    .getByRole("menuitem", { name: "显示信息", exact: true })
    .click();
  await info.waitFor();
  await info.getByRole("button", { name: "关闭", exact: true }).click();
  await info.waitFor({ state: "hidden" });
  checks.push(
    "attachment inspector plugin owns menu entry and live info panel; disabling removes the entry and closes an open panel, re-enabling restores it, and generated settings change displayed fields",
  );
  await open(original.id);
  await page.screenshot({ path: resolve(output, "attachment-menu.png") });
  await menu
    .getByRole("menuitem", { name: "快速查看附件", exact: true })
    .click();
  const preview = page.getByRole("dialog", { name: "图片预览", exact: true });
  await preview.waitFor();
  await page.waitForFunction(
    () => document.querySelector(".image-preview img")?.naturalWidth > 0,
  );
  assert.equal(await preview.getAttribute("aria-modal"), "false");
  assert.equal(
    await page.evaluate(
      () => window.__DEBUG_PLATFORM__.toolbarStates.at(-1).contentOverlay,
    ),
    false,
  );
  const origin = await preview.boundingBox();
  const title = await preview.locator("header > strong").boundingBox();
  await page.mouse.move(title.x + 20, title.y + 10);
  await page.mouse.down();
  await page.mouse.move(title.x - 80, title.y - 30, { steps: 8 });
  await page.mouse.up();
  const moved = await preview.boundingBox();
  assert(
    Math.abs(moved.x - origin.x + 100) < 2 &&
      Math.abs(moved.y - origin.y + 40) < 2,
  );
  // Move it back, leaving the list reachable. Main UI must keep real focus.
  await page.mouse.move(title.x - 80, title.y - 30);
  await page.mouse.down();
  await page.mouse.move(title.x + 20, title.y + 90, { steps: 8 });
  await page.mouse.up();
  await page
    .locator('.note-row[data-note-id="note-b"]')
    .click({ position: { x: 10, y: 10 } });
  assert.equal((await state(page)).selection.noteId, "note-b");
  assert(await preview.isVisible());
  assert(
    await preview
      .locator("img")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  );
  await preview
    .getByRole("button", { name: "通过默认应用打开", exact: true })
    .click();
  // A DOM click does not await the asynchronous renderer→IPC handoff.
  // Assert its actual fixture receipt, bounded independently of app idleness.
  const openDeadline = performance.now() + 3000;
  while (!actions.some(action => action.action === "open" && action.id === original.id)) {
    assert(performance.now() < openDeadline, "default-app open IPC receipt");
    await new Promise(done => setTimeout(done, 10));
  }
  assert(
    actions.some(
      (action) => action.action === "open" && action.id === original.id,
    ),
  );
  const otherBefore = (await state(page)).editorJSON;
  await page
    .locator(".tiptap:visible p")
    .last()
    .click({ position: { x: 12, y: 10 } });
  await page.keyboard.type("Floating preview input");
  await idle(page);
  assert(
    JSON.stringify((await state(page)).editorJSON).includes(
      "Floating preview input",
    ),
  );
  assert(await preview.isVisible());
  await api(page, "editor.undo");
  await idle(page);
  assert.deepEqual((await state(page)).editorJSON, otherBefore);
  await page.keyboard.press("Escape"); // Editor Escape does not steal the preview.
  assert(await preview.isVisible());
  await page.screenshot({
    path: resolve(output, "floating-preview-main-edit.png"),
  });
  await api(page, "note.select", { id: "note-a" });
  await idle(page);
  await page.screenshot({ path: resolve(output, "svg-preview.png") });
  checks.push(
    "nonmodal preview drags exactly, survives source editor unmount/navigation, and allows real main-editor typing/undo; toolbar stays present and enabled",
  );
  await preview.getByRole("button", { name: "放大预览窗口" }).click();
  assert(await page.locator(".image-preview-window.expanded").count());
  await preview.getByRole("button", { name: "还原预览窗口" }).click();
  await preview.getByRole("button", { name: "图片信息", exact: true }).click();
  assert.match(await preview.innerText(), /image\/svg\+xml/);
  await page.keyboard.press("Escape");
  checks.push(
    "reference preview frame, image decoding, information, expand/restore and Escape",
  );
  for (const [label, action] of [
    ["在文件夹中显示", "reveal"],
    ["打开附件", "open"],
    ["共享…", "share"],
  ]) {
    await open(original.id);
    await menu.getByRole("menuitem", { name: label, exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".attachment-context-menu"),
    );
    await new Promise((r) => setTimeout(r, 40));
    assert(actions.some((a) => a.id === original.id && a.action === action));
  }
  checks.push("open/reveal/share connect to original-file OS boundary");
  await open(original.id);
  await menu.getByRole("menuitem", { name: "拷贝", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector(".attachment-context-menu"),
  );
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(clipboard[0].data, backend.files.get(original.id));
  await page.locator('.note-row[data-note-id="note-b"]').click();
  await idle(page);
  // OS image clipboard paste event follows the actual editor handler.
  await page.locator(".tiptap:visible").evaluate((element, base64) => {
    const data = new DataTransfer();
    data.items.add(
      new File(
        [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
        "剪贴板图片.png",
        { type: "image/png" },
      ),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, tinyPNG.toString("base64"));
  await page.waitForFunction(() =>
    document.querySelector(".attachment-node.image"),
  );
  await idle(page);
  const png = backend.workspace.attachments.find((a) => a.noteId === "note-b");
  assert.equal(backend.files.get(png.id), tinyPNG.toString("base64"));
  await open(png.id);
  await menu.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".attachment-node.image")].filter(
        (x) => x.offsetParent,
      ).length === 2,
  );
  await idle(page);
  const pasted = backend.workspace.attachments.find(
    (a) => a.noteId === "note-b" && a.id !== png.id,
  );
  assert.notEqual(pasted.id, original.id);
  assert.equal(backend.files.get(pasted.id), backend.files.get(original.id));
  assert(
    refs(
      backend.workspace.notes.find((n) => n.id === "note-b").document,
    ).includes(png.id),
  );
  checks.push(
    "direct clipboard image becomes a persisted attachment; cross-note file paste allocates new owned file and preserves existing attachment",
  );
  await open(pasted.id);
  failCopy = true;
  await menu.getByRole("menuitem", { name: "剪切", exact: true }).click();
  await new Promise((r) => setTimeout(r, 100));
  assert(await card(pasted.id).count());
  failCopy = false;
  await api(page, "app.dismissError");
  await open(pasted.id);
  await menu.getByRole("menuitem", { name: "剪切", exact: true }).click();
  await card(pasted.id).waitFor({ state: "detached" });
  await idle(page);
  assert(backend.files.has(pasted.id));
  await api(page, "editor.undo");
  await idle(page);
  assert(await card(pasted.id).count());
  checks.push(
    "cut removes reference only after copy succeeds; failure retains node; undo restores attachment and original bytes",
  );
  // Some apps paste an image as HTML data without a FileList.
  await page.locator(".tiptap:visible p").last().click();
  const beforeHtml = backend.workspace.attachments.length;
  await page.locator(".tiptap:visible").evaluate((element, data) => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      `<img alt="HTML图片.png" src="data:image/png;base64,${data}">`,
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
  }, tinyPNG.toString("base64"));
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="选择图片 HTML图片.png"]'),
  );
  await idle(page);
  assert.equal(backend.workspace.attachments.length, beforeHtml + 1);
  const htmlImage = backend.workspace.attachments.find(
    (a) => a.displayName === "HTML图片.png",
  );
  assert.equal(backend.files.get(htmlImage.id), tinyPNG.toString("base64"));
  assert(
    !JSON.stringify(
      backend.workspace.notes.find((n) => n.id === "note-b").document,
    ).match(/data:image|blob:|http:\/\/127\.0\.0\.1:/),
  );
  checks.push(
    "HTML-only base64 image paste stores original file bytes and leaves no inline image data in the document",
  );

  const wav = Buffer.alloc(16044);
  wav.write("RIFF");
  wav.writeUInt32LE(16036, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(16000, 40);
  const mp4 = await readFile("scripts/fixtures/attachment-files/clip.mp4");
  await chooseFiles(page, [
    { name: "录音.wav", mimeType: "audio/wav", buffer: wav },
    { name: "视频.mp4", mimeType: "video/mp4", buffer: mp4 },
  ]);
  await idle(page);
  const audio = backend.workspace.attachments.find(
      (a) => a.displayName === "录音.wav",
    ),
    video = backend.workspace.attachments.find(
      (a) => a.displayName === "视频.mp4",
    );
  assert.equal(backend.files.get(audio.id), wav.toString("base64"));
  assert.equal(backend.files.get(video.id), mp4.toString("base64"));
  await card(video.id).scrollIntoViewIfNeeded();
  await card(video.id).getByRole("button",{name:`播放视频 ${video.displayName}`,exact:true}).click();
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video?.readyState >= 2 && video.duration > 0;
  });
  await card(video.id)
    .locator("video")
    .evaluate(async (video) => {
      video.muted = true;
      await video.play();
    });
  await page.waitForFunction(
    () => document.querySelector("video")?.currentTime > 0,
  );
  await card(video.id)
    .locator("video")
    .evaluate((video) => video.pause());
  await card(audio.id).scrollIntoViewIfNeeded();
  await card(audio.id).locator(".audio-play-toggle").click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("audio")].some(
      (audio) => audio.currentTime > 0,
    ),
  );
  await card(audio.id).locator(".audio-play-toggle").click();
  checks.push(
    "audio/video remain playable components backed by original WAV/MP4 files and leased streaming URLs",
  );
  audio.recordedAt = Date.UTC(2026, 0, 2, 3, 4);
  await api(page, "app.refresh");
  await idle(page);
  await updateAttachmentInspector({
    config: { showByteCount: true, showRecordedAt: false },
  });
  await open(audio.id);
  await menu
    .getByRole("menuitem", { name: "显示信息", exact: true })
    .click();
  await info.waitFor();
  assert.doesNotMatch(await info.innerText(), /录音时间/);
  await info.getByRole("button", { name: "关闭", exact: true }).click();
  await info.waitFor({ state: "hidden" });
  await updateAttachmentInspector({
    config: { showByteCount: true, showRecordedAt: true },
  });
  await open(audio.id);
  await menu
    .getByRole("menuitem", { name: "显示信息", exact: true })
    .click();
  await info.waitFor();
  assert.match(await info.innerText(), /录音时间/);
  await info.getByRole("button", { name: "关闭", exact: true }).click();
  await info.waitFor({ state: "hidden" });
  checks.push(
    "attachment inspector recording-time setting applies to the existing audio info panel",
  );
  // A late clipboard response must never insert into the newly selected note.
  await open(png.id);
  delayRead = 300;
  const before = backend.workspace.attachments.length;
  await menu.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await page.locator('.note-row[data-note-id="note-a"]').click();
  await new Promise((r) => setTimeout(r, 700));
  await api(page, "app.dismissError");
  await idle(page);
  assert.equal(backend.workspace.attachments.length, before);
  delayRead = 0;
  checks.push(
    "late clipboard paste after owner navigation cannot store or insert into another note",
  );
  await open(original.id);
  delayCopy = 300;
  await menu.getByRole("menuitem", { name: "剪切", exact: true }).click();
  await page.locator('.note-row[data-note-id="note-b"]').click();
  await new Promise((r) => setTimeout(r, 700));
  await idle(page);
  assert(
    refs(
      backend.workspace.notes.find((n) => n.id === "note-a").document,
    ).includes(original.id),
  );
  checks.push("late cut after navigation retains original document");
  await api(page, "note.select", { id: "note-a" });
  await idle(page);
  await api(page, "image.preview", { id: original.id });
  await preview.waitFor();
  await api(page, "editor.select", { from: 3, to: 3 });
  await chooseFiles(page, [
    {
      name: "预览期间添加.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("quiet attachment with independent preview"),
    },
  ]);
  await idle(page);
  assert(await preview.isVisible());
  assert.equal(await preview.getAttribute("data-preview-id"), original.id);
  checks.push(
    "ordinary attachment synchronization keeps the independent floating image alive",
  );
  await api(page, "note.select", { id: "note-b" });
  await idle(page);
  assert(await preview.isVisible());
  const prepared = backend.state();
  backend.suspended = ["note-a"];
  backend.operationId = "floating-prepare";
  const immediate = await page.evaluate(
    (value) => {
      const preview = document.querySelector(".image-preview");
      const thumbnail = document.querySelector(
        '.note-row[data-note-id="note-a"] .note-thumbnail img',
      );
      window.__DEBUG_PLATFORM__.emit("notes-access", value);
      return {
        preview: !preview?.isConnected || preview.hidden,
        thumbnail: !thumbnail?.getAttribute("src"),
      };
    },
    {
      phase: "prepare",
      operationId: "floating-prepare",
      noteIds: ["note-a"],
      access: {
        ...prepared.access,
        operationId: "floating-prepare",
        suspended: ["note-a"],
      },
    },
  );
  assert(immediate.preview && immediate.thumbnail);
  await preview.waitFor({ state: "hidden" });
  checks.push(
    "prepare for the original image owner synchronously hides retained preview and thumbnail even while another note is selected",
  );

  assert.deepEqual(runtime.errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      { passed: true, checks, actions, errors: runtime.errors },
      null,
      2,
    ),
  );
  console.log(
    "Attachment file/clipboard/preview integration passed:",
    checks.length,
  );
} catch (error) {
  if (runtime) {
    await runtime.page.screenshot({ path: resolve(output, "failure.png") });
    await writeFile(
      resolve(output, "failure.json"),
      JSON.stringify(
        {
          state: await state(runtime.page),
          images: await runtime.page
            .locator(".attachment-node")
            .evaluateAll((es) =>
              es.map((e) => ({
                html: e.outerHTML,
                rect: e.getBoundingClientRect().toJSON(),
              })),
            ),
        },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await runtime?.cleanup();
}
