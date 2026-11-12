// Real App + production Android Back handler. Isolated IPC, no ADB/OS IME claim.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state } from "./debug/runtime.mjs";
import { chooseFiles } from "./debug/mobile-attachments.mjs";
const output = resolve("artifacts/session96-menu-back");
await mkdir(output, { recursive: true });
const runtime = await openRuntime({ mobile: true });
const { page } = runtime;
const checks = [];
const format = page.getByRole("dialog", { name: "格式", exact: true });
const p = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const check = (name, condition) => {
  assert(condition, name);
  checks.push(name);
};
const contextMenu = (locator) =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 10,
        clientY: rect.top + 10,
      }),
    );
  });
try {
  await api(page, "note.select", { id: "note-a" });
  await api(page, "editor.setContent", {
    document: {
      type: "doc",
      content: [
        p("before"),
        {
          type: "table",
          content: ["alpha", "beta"].map((text) => ({
            type: "tableRow",
            content: [0, 1].map((i) => ({
              type: "tableCell",
              content: [p(text + i)],
            })),
          })),
        },
        p("after"),
      ],
    },
  });
  await api(page, "app.flush");
  await chooseFiles(page, [
    {
      name: "back-menu.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="gold"/></svg>',
      ),
    },
  ]);
  await idle(page);
  const baseline = (await state(page)).editorJSON;
  const cell = page.locator(".tiptap td").first();
  const image = page.locator(".attachment-node").first();
  const tableMenu = page.getByRole("menu", { name: "行操作", exact: true });
  const attachmentMenu = page.getByRole("menu", {
    name: "附件菜单",
    exact: true,
  });
  for (const withFormat of [true, false]) {
    await cell.click();
    await api(page, "editor.select", { from: 12, to: 12 });
    if (withFormat) {
      await api(page, "menu.open", { menu: "format" });
      await format.waitFor();
    }
    await page.getByRole("button", { name: "选择行", exact: true }).tap();
    await tableMenu.waitFor();
    check(
      "table menu belongs to local controls, outside session.menu",
      (await state(page)).editorSession.menu === null,
    );
    await api(page, "app.back");
    await idle(page);
    let current = await state(page);
    check(
      `Back closes local table menu ${withFormat ? "above format" : "without navigating"}`,
      (await tableMenu.count()) === 0 &&
        (await format.count()) === (withFormat ? 1 : 0) &&
        current.selection.page === "editor" &&
        current.selection.noteId === "note-a",
    );
    if (withFormat) {
      await api(page, "app.back");
      current = await state(page);
      check(
        "next Back uses session format close reason",
        (await format.count()) === 0 &&
          current.editorSession.lastClose === "back" &&
          current.selection.page === "editor",
      );
    }
    // Clear table chrome by selecting ordinary body text before the next menu.
    await page.locator(".tiptap > p").last().tap();
    if (withFormat) {
      await api(page, "menu.open", { menu: "format" });
      await format.waitFor();
    }
    await image.scrollIntoViewIfNeeded();
    await contextMenu(image);
    await attachmentMenu.waitFor();
    check(
      "attachment menu belongs to local provider, outside session.menu",
      (await state(page)).editorSession.menu === null,
    );
    await api(page, "app.back");
    await idle(page);
    current = await state(page);
    check(
      `Back closes local attachment menu ${withFormat ? "above format" : "without navigating"}`,
      (await attachmentMenu.count()) === 0 &&
        (await format.count()) === (withFormat ? 1 : 0) &&
        current.selection.page === "editor" &&
        current.selection.noteId === "note-a",
    );
    if (withFormat) await api(page, "app.back");
  }
  check(
    "menu dismissal preserves document and has no browser errors",
    JSON.stringify((await state(page)).editorJSON) ===
      JSON.stringify(baseline) && runtime.errors.length === 0,
  );
  await page.screenshot({ path: resolve(output, "menus-dismissed.png") });
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        checks,
        scope:
          "Actual App/Chrome and Android Back handler with isolated IPC; no native runtime claims",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      { error: error.message, state: await state(page), checks },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await runtime.cleanup();
}
