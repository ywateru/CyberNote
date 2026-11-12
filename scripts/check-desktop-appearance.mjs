// Isolated real-App appearance, font persistence and waveform checks.
// Uses synthetic local media and a fresh headless profile, never native user data.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error(
    "Use existing PLAYWRIGHT_CORE_PATH and CHROME_PATH; no downloads required.",
  );
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
import { mkdir, writeFile } from "node:fs/promises";
const output = resolve(process.argv[2] || "artifacts/cybernote");
await mkdir(output, { recursive: true });
const vite = await createServer({
  server: {
    port: 0,
    strictPort: false,
    host: "127.0.0.1",
    watch: { ignored: ["**/src-tauri/target/**", "**/artifacts/**"] },
  },
});
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--mute-audio"],
  });
  const page = await browser.newPage({
    viewport: { width: 1560, height: 960 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const stamp = new Date().setHours(10, 30, 0, 0),
    day = 86400000;
  const t = (text) => ({ type: "text", text }),
    p = (text) => ({ type: "paragraph", content: text ? [t(text)] : [] }),
    h = (text, level = 1) => ({
      type: "heading",
      attrs: { level },
      content: [t(text)],
    });
  const tag = (name) => ({
    type: "text",
    text: "#" + name,
    marks: [{ type: "noteTag", attrs: { name } }],
  });
  const document = {
    type: "doc",
    content: [
      h("周五的产品讨论"),
      { type: "paragraph", content: [tag("产品设计"), t("  "), tag("工作")] },
      p(),
      p("让记录更自然，让灵感有处安放。"),
      p(),
      h("这次讨论的重点", 2),
      {
        type: "taskList",
        content: [
          "梳理搜索与工具栏的层级",
          "增加随手录音和快速标签",
          "统一视觉细节与操作反馈",
        ].map((text, i) => ({
          type: "taskItem",
          attrs: { checked: i === 0 },
          content: [p(text)],
        })),
      },
      p(),
      h("下一步", 2),
      p("先把常用操作放在顺手的位置，再打磨每一次记录的体验。"),
    ],
  };
  const note = (id, title, text, offset = 0, extra = {}) => ({
    id,
    folderId: "work",
    title,
    plainText: title + "\n" + text,
    document: { type: "doc", content: [h(title), p(text)] },
    createdAt: stamp - offset,
    updatedAt: stamp - offset,
    pinned: false,
    deletedAt: null,
    originalFolderId: null,
    locked: false,
    paperStyle: "blank",
    revision: 0,
    ...extra,
  });
  const folder = (
    id,
    name,
    kind = "normal",
    parentId = null,
    sortOrder = 0,
  ) => ({ id, name, kind, parentId, sortOrder, createdAt: stamp });
  const rate = 8000,
    sampleCount = 154 * rate,
    bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(sampleCount * 2, 40);
  for (let i = 0; i < sampleCount; i++) {
    const at = i / rate,
      envelope =
        (0.1 + 0.9 * Math.abs(Math.sin(at * 1.7) * Math.sin(at * 0.33))) *
        (0.25 + 0.75 * Math.abs(Math.cos(at * 0.81)));
    bytes.writeInt16LE(
      Math.round(Math.sin(at * 2 * Math.PI * 180) * envelope * 22000),
      44 + i * 2,
    );
  }

  document.content.splice(document.content.length - 2, 0, {
    type: "attachment",
    attrs: { id: "recording", name: "产品讨论录音.wav", kind: "audio" },
  });
  const fixture = {
    folders: [
      folder("quick", "快速备忘录", "quick"),
      folder("default", "备忘录", "default"),
      folder("work", "工作项目"),
      folder("design", "产品设计", "normal", "work"),
      folder("life", "生活记录"),
      folder("trash", "最近删除", "trash"),
    ],
    notes: [
      note("pinned", "产品设计备忘", "让记录更自然，让灵感有处安放。", 1000, {
        pinned: true,
      }),
      note("discussion", "周五的产品讨论", "关于备忘录体验的一些想法…", 0, {
        document,
      }),
      note("todo", "本周待办清单", "整理资料，确认下一步计划", 4500000),
      note("reading", "阅读摘录", "一些值得反复思考的观点。", day - 36000000),
      note("weekend", "周末的小计划", "去公园走走，整理阅读笔记。", day),
      note("quicknote", "随手记", "周末去看看展览", day, { folderId: "quick" }),
      note("deleted", "旧笔记", "已删除的笔记", day, {
        deletedAt: stamp,
        folderId: "trash",
      }),
    ],
    attachments: [
      {
        id: "recording",
        noteId: "discussion",
        kind: "audio",
        relativePath: "fixture.wav",
        mime: "audio/wav",
        displayName: "产品讨论录音.wav",
        size: bytes.length,
        recordedAt: stamp - 360000,
      },
    ],
    settings: {
      selectedFolder: "all",
      selectedNote: "discussion",
      theme: "light",
    },
  };
  await page.addInitScript(
    (fixture) =>
      localStorage.getItem("notes-browser-preview") ||
      localStorage.setItem("notes-browser-preview", JSON.stringify(fixture)),
    fixture,
  );
  await page.addInitScript(
    (data) => localStorage.setItem("preview-file-recording", data),
    bytes.toString("base64"),
  );
  await page.goto(origin);
  await page.locator(".tiptap").waitFor();
  await page
    .waitForFunction(
      () => document.querySelector(".audio-waveform-track input")?.max > 0,
      {},
      { timeout: 10000 },
    )
    .catch(async (e) => {
      console.log(
        errors,
        await page.locator(".editor-pane").innerText(),
        await page.evaluate(() =>
          [...document.querySelectorAll("audio")].map((a) => ({
            src: a.src,
            ready: a.readyState,
            error: a.error?.message,
          })),
        ),
      );
      await page.screenshot({ path: resolve(output, "failed.png") });
      throw e;
    });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".audio-waveform-unplayed rect")
        ?.getAttribute("height") !== "2",
  );
  await page.screenshot({ path: resolve(output, "desktop.png") });
  console.log(
    await page.evaluate(() =>
      Object.fromEntries(
        [
          ".sidebar",
          ".notes-pane",
          ".editor-pane",
          ".editor-header",
          ".notes-header",
        ].map((s) => {
          let r = document.querySelector(s).getBoundingClientRect();
          return [s, { x: r.x, y: r.y, width: r.width, height: r.height }];
        }),
      ),
    ),
  );
  await page.getByRole("button", { name: "收起工作项目", exact: true }).click();
  await page.getByRole("button", { name: "展开工作项目", exact: true }).click();
  await page.getByRole("button", { name: "隐藏文件夹", exact: true }).click();
  await page.getByRole("button", { name: "显示文件夹", exact: true }).click();
  await page
    .getByRole("button", { name: "设置", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("heading", { name: "CyberNote 设置" }).waitFor();
  await page.screenshot({ path: resolve(output, "preferences.png") });
  const sizes = [];
  const metrics = () =>
    page.evaluate(() => ({
      ui: parseFloat(
        getComputedStyle(document.querySelector(".sidebar .folder-row"))
          .fontSize,
      ),
      editor: parseFloat(
        getComputedStyle(document.querySelector(".tiptap")).fontSize,
      ),
    }));
  assert.equal(
    await page
      .getByRole("combobox", { name: "界面字体大小", exact: true })
      .inputValue(),
    "medium",
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "编辑器字体大小", exact: true })
      .inputValue(),
    "medium",
  );
  for (const [value, ui, editor] of [
    ["tiny", 12, 12],
    ["small", 13, 14],
    ["medium", 14, 16],
    ["large", 16, 18],
    ["huge", 18, 20],
  ]) {
    await page
      .getByRole("combobox", { name: "界面字体大小", exact: true })
      .selectOption(value);
    let actual = await metrics();
    assert(Math.abs(actual.ui - ui) < 0.01);
    assert.equal(actual.editor, sizes.at(-1)?.editor ?? 16);
    await page
      .getByRole("combobox", { name: "编辑器字体大小", exact: true })
      .selectOption(value);
    actual = await metrics();
    assert(Math.abs(actual.ui - ui) < 0.01);
    assert(Math.abs(actual.editor - editor) < 0.01);
    sizes.push({ value, ...actual });
  }
  await page
    .getByRole("combobox", { name: "界面字体大小", exact: true })
    .selectOption("small");
  await page
    .getByRole("combobox", { name: "编辑器字体大小", exact: true })
    .selectOption("large");
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await page.reload();
  await page.locator(".tiptap").waitFor();
  let actual = await metrics();
  assert(Math.abs(actual.ui - 13) < 0.01);
  assert.equal(actual.editor, 18);
  await page
    .getByRole("button", { name: "设置", exact: true })
    .filter({ visible: true })
    .click();
  assert.equal(
    await page
      .getByRole("combobox", { name: "界面字体大小", exact: true })
      .inputValue(),
    "small",
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "编辑器字体大小", exact: true })
      .inputValue(),
    "large",
  );
  await page
    .getByRole("combobox", { name: "界面字体大小", exact: true })
    .selectOption("medium");
  await page
    .getByRole("combobox", { name: "编辑器字体大小", exact: true })
    .selectOption("medium");
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await page.screenshot({ path: resolve(output, "desktop.png") });

  await page
    .getByRole("textbox", { name: "搜索备忘录", exact: true })
    .fill("阅读");
  await page.locator(".note-row").filter({ hasText: "阅读摘录" }).waitFor();
  await page.getByRole("button", { name: "清除搜索", exact: true }).click();
  await page.setViewportSize({ width: 1390, height: 900 });
  await page.screenshot({ path: resolve(output, "medium.png") });
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.screenshot({ path: resolve(output, "compact.png") });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll(".editor-header button,.editor-header input")]
      .filter((e) => e.getClientRects().length)
      .map((e) => ({
        name: e.getAttribute("aria-label"),
        right: e.getBoundingClientRect().right,
      }))
      .filter((e) => e.right > innerWidth),
  );
  let densityMatrix, densityInteractions;
  if (
    process.env.DENSITY_MATRIX === "1" ||
    process.env.DENSITY_INTERACTIONS_ONLY === "1"
  ) {
    const { checkDensityMatrix, checkDensityInteractions } =
      await import("./check-density-matrix.mjs");
    if (process.env.DENSITY_INTERACTIONS_ONLY !== "1")
      densityMatrix = await checkDensityMatrix(browser, origin, page, output);
    densityInteractions = await checkDensityInteractions(page, output);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, "mobile.png") });
  await writeFile(
    resolve(output, "browser-check.json"),
    JSON.stringify(
      {
        errors,
        overflow,
        sizes,
        persistence: "passed",
        independentSizing: "passed",
        densityMatrix,
        densityInteractions,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(overflow, []);
  console.log(
    `Desktop appearance and five independent font presets passed: ${output}`,
  );
} finally {
  await browser?.close();
  await vite.close();
}
