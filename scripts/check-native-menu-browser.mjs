// Real React MenuSurface/platform adapter; OS tracking reply is simulated here.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state } from "./debug/runtime.mjs";
import { chooseFiles } from "./debug/mobile-attachments.mjs";
const output = resolve("artifacts/unified-menus/native-client");
await mkdir(output, { recursive: true });
const runtime = await openRuntime({ nativeToolbar: true });
const { page, backend } = runtime;
try {
  await chooseFiles(page, [
    {
      name: "浮动图.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="gold"/></svg>',
      ),
    },
  ]);
  await idle(page);
  const image = backend.workspace.attachments[0];
  await page.waitForFunction(
    () => !!document.querySelector(".image-open img")?.naturalWidth,
  );
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke.bind(
      window.__TAURI_INTERNALS__,
    );
    window.__menuCalls = [];
    window.__cancelled = [];
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === "plugin:notes-ui|popup_menu") {
        window.__menuCalls.push(args);
        return new Promise((resolve) => {
          window.__replyMenu = resolve;
        });
      }
      if (command === "plugin:notes-ui|cancel_popup_menu") {
        window.__cancelled.push(args.token);
        return;
      }
      const result = await invoke(command, args);
      if (command.startsWith("plugin:notes-ui|") && result?.native)
        result.native.popupMenus = true;
      return result;
    };
  });
  await api(page, "settings.update", { settings: { theme: "dark" } });
  await idle(page);
  const waitMenu = async (count) =>
    page.waitForFunction((n) => window.__menuCalls.length === n, count);
  const reply = async (label) =>
    page.evaluate((label) => {
      const request = window.__menuCalls.at(-1).request;
      const item = request.items.find((item) => item.label === label);
      if (!item) throw Error("missing native item " + label);
      window.__replyMenu(item.index);
    }, label);
  const card = page.locator(`[data-attachment-id="${image.id}"]:visible`);
  await card.click({ button: "right" });
  await waitMenu(1);
  const request = await page.evaluate(() => window.__menuCalls.at(-1));
  assert.equal(request.windowLabel, "main");
  assert(
    request.request.items.find((i) => i.label === "快速查看附件")?.enabled,
  );
  assert.equal(
    request.request.items.find((i) => i.label === "拷贝").symbol,
    "doc.on.doc",
  );
  assert(
    await page
      .locator(".attachment-context-menu")
      .evaluate((e) => e.classList.contains("native-menu-surface")),
  );
  assert.equal(
    await page.evaluate(
      () => window.__DEBUG_PLATFORM__.toolbarStates.at(-1).contentOverlay,
    ),
    false,
  );
  await reply("快速查看附件");
  await page.getByRole("dialog", { name: "图片预览", exact: true }).waitFor();
  await page.getByRole("button", { name: "关闭图片预览", exact: true }).click();
  await card.click({ button: "right" });
  await waitMenu(2);
  const cancellationToken = await page.evaluate(
    () => window.__menuCalls.at(-1).request.token,
  );
  await api(page, "note.select", { id: "note-b" });
  await idle(page);
  await page.waitForFunction(
    (token) => window.__cancelled.includes(token),
    cancellationToken,
  );
  await page.evaluate(() => window.__replyMenu(0));
  await idle(page);
  assert(!backend.workspace.notes.find((n) => n.id === "note-a").deletedAt);
  assert.equal(await page.locator(".image-preview").count(), 0);
  await page
    .locator('.note-row[data-note-id="note-b"]')
    .click({ button: "right" });
  await waitMenu(3);
  await reply("置顶");
  await idle(page);
  assert(backend.workspace.notes.find((n) => n.id === "note-b").pinned);
  await api(page, "editor.table", { action: "insert" });
  await idle(page);
  await page.locator(".tiptap:visible td").first().click();
  await page.getByRole("button", { name: "选择行", exact: true }).click();
  await waitMenu(4);
  await reply("在下面添加行");
  await idle(page);
  assert.equal(await page.locator(".tiptap:visible tr").count(), 3);
  assert.deepEqual(runtime.errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "native adapter receives real semantic rows/icons/coordinates",
          "selection reply opens preview without hiding toolbar",
          "unmount cancels native tracking and rejects late selected index",
          "note context menu uses same adapter",
          "table row insertion uses same adapter",
        ],
        requests: await page.evaluate(() =>
          window.__menuCalls.map((c) => ({
            windowLabel: c.windowLabel,
            labels: c.request.items.map((i) => i.label),
          })),
        ),
      },
      null,
      2,
    ),
  );
  console.log("Native MenuSurface adapter: 5 integration groups passed");
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw error;
} finally {
  await runtime.cleanup();
}
