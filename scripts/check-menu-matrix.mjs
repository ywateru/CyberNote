// Real App menus, with isolated notes and files. No user store or clipboard.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state } from "./debug/runtime.mjs";
import { chooseFiles } from "./debug/mobile-attachments.mjs";
const output = resolve("artifacts/unified-menus/matrix");
await mkdir(output, { recursive: true });
const runtime = await openRuntime();
const { page, backend } = runtime;
const checks = [];
const sample = async () =>
  page.locator(".unified-menu:visible").evaluate((e) => {
    const row = e.querySelector('[role="menuitem"]'),
      m = getComputedStyle(e),
      r = getComputedStyle(row),
      b = e.getBoundingClientRect();
    return {
      radius: m.borderRadius,
      background: m.backgroundColor,
      shadow: m.boxShadow,
      font: r.fontSize,
      rowHeight: r.minHeight,
      padding: r.padding,
      border: r.borderRadius,
      inside:
        b.left >= 0 &&
        b.top >= 0 &&
        b.right <= innerWidth &&
        b.bottom <= innerHeight,
    };
  });
try {
  await chooseFiles(page, [
    {
      name: "菜单测试.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><rect width="160" height="80" fill="gold"/></svg>',
      ),
    },
  ]);
  await idle(page);
  const image = backend.workspace.attachments[0];
  await page.waitForFunction(
    () => document.querySelector(".image-open img")?.naturalWidth > 0,
  );
  await page.locator(".tiptap p").last().click();
  await api(page, "editor.table", { action: "insert" });
  await idle(page);
  const before = (await state(page)).editorJSON;
  for (const theme of ["light", "dark"])
    for (const size of ["tiny", "small", "medium", "large", "huge"]) {
      await api(page, "settings.update", {
        settings: { theme, interfaceFontSize: size },
      });
      await idle(page);
      await api(page, "menu.open", { menu: "media" });
      const toolbar = await sample();
      await page.keyboard.press("Escape");
      await page
        .locator(`[data-attachment-id="${image.id}"]:visible`)
        .click({ button: "right" });
      const attachment = await sample();
      await page.keyboard.press("Escape");
      await page
        .locator('.note-row[data-note-id="note-a"]')
        .click({ button: "right" });
      const note = await sample();
      assert.equal(
        await page.getByRole("menuitem", { name: "置顶", exact: true }).count(),
        1,
      );
      await page.keyboard.press("End");
      assert.equal(await page.locator(":focus").innerText(), "删除");
      await page.keyboard.press("Escape");
      await page.locator(".tiptap td p").first().click();
      await page.getByRole("button", { name: "选择行", exact: true }).click();
      await page.getByRole("button", { name: "行操作", exact: true }).click();
      const table = await sample();
      for (const value of [toolbar, attachment, note, table])
        assert(value.inside);
      assert.deepEqual(attachment, toolbar);
      assert.deepEqual(note, toolbar);
      assert.deepEqual(table, toolbar);
      if (size === "small")
        await page.screenshot({
          path: resolve(output, `${theme}-small-table-menu.png`),
        });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      assert.deepEqual((await state(page)).editorJSON, before);
      checks.push({ theme, size, toolbar, attachment, note, table });
    }
  // Fallback overflow is the same shared surface, with keyboard and outside close.
  await page.setViewportSize({ width: 900, height: 800 });
  await api(page, "settings.update", {
    settings: { interfaceFontSize: "huge" },
  });
  await idle(page);
  const overflow = page.getByRole("button", { name: "其他工具", exact: true });
  await overflow.click();
  assert(
    await page
      .getByRole("menu", { name: "其他工具", exact: true })
      .evaluate((e) => e.classList.contains("unified-menu")),
  );
  await page.keyboard.press("Escape");
  assert.equal(await overflow.getAttribute("aria-expanded"), "false");
  assert.deepEqual(runtime.errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      { passed: true, checks, overflow: true, documentUnchanged: true },
      null,
      2,
    ),
  );
  console.log(
    "Shared menus: 10 theme/size combinations × 4 menu types, keyboard, viewport bounds and overflow passed",
  );
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(await state(page), null, 2),
  );
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw error;
} finally {
  await runtime.cleanup();
}
