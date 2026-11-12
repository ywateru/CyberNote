// Production App and shared feedback in a fresh, synthetic browser workspace.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error("Set existing PLAYWRIGHT_CORE_PATH and CHROME_PATH.");
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(process.argv[2] || "artifacts/button-feedback/browser");
await mkdir(output, { recursive: true });
const vite = await createServer({
  server: {
    port: 0,
    host: "127.0.0.1",
    watch: { ignored: ["**/src-tauri/target/**", "**/artifacts/**"] },
  },
});
await vite.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const p = (t) => ({
      type: "paragraph",
      content: [{ type: "text", text: t }],
    }),
    now = Date.now();
  const fixture = {
    folders: [
      {
        id: "default",
        name: "备忘录",
        kind: "default",
        parentId: null,
        sortOrder: 0,
        createdAt: now,
      },
    ],
    notes: ["甲", "乙", "锁定"].map((name, i) => ({
      id: "note-" + i,
      folderId: "default",
      title: "反馈验证" + name,
      plainText: "反馈验证" + name + "\n保留这段正文",
      document: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "反馈验证" + name }],
          },
          p("保留这段正文"),
        ],
      },
      createdAt: now,
      updatedAt: now - i,
      pinned: false,
      deletedAt: null,
      originalFolderId: null,
      locked: i === 2,
      paperStyle: "blank",
      revision: 1,
    })),
    attachments: [],
    settings: { selectedFolder: "all", selectedNote: "note-0", theme: "light" },
  };
  await page.addInitScript(
    (f) => localStorage.setItem("notes-browser-preview", JSON.stringify(f)),
    fixture,
  );
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}`);
  await page.locator(".tiptap").waitFor();
  const notes = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("notes-browser-preview")).notes.map(
        (n) => ({ id: n.id, document: n.document, revision: n.revision }),
      ),
    );
  const before = await notes(),
    cases = [];
  const style = (e) => {
    const c = getComputedStyle(e),
      r = e.getBoundingClientRect();
    return {
      shadow: c.boxShadow,
      cursor: c.cursor,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      activated: e.hasAttribute("data-button-activated"),
    };
  };
  const format = page.locator('.desktop-toolbar button[aria-label="格式"]'),
    settings = page.locator(".desktop-settings");
  for (const theme of ["light", "dark"]) {
    await settings.click();
    await page
      .getByRole("combobox", { name: "外观", exact: true })
      .selectOption(theme);
    await page.getByRole("button", { name: "关闭设置", exact: true }).click();
    for (const [name, button] of [
      ["text", format],
      ["icon", settings],
    ]) {
      await page.mouse.move(1430, 880);
      await page.waitForTimeout(220);
      const idle = await button.evaluate(style);
      await button.hover();
      await page.waitForTimeout(110);
      const hover = await button.evaluate(style);
      assert.notEqual(hover.shadow, idle.shadow);
      assert.equal(hover.cursor, "pointer");
      await page
        .locator(".editor-header")
        .screenshot({ path: resolve(output, `${theme}-${name}-hover.png`) });
      await page.mouse.down();
      const pressed = await button.evaluate(style);
      assert.notEqual(pressed.shadow, hover.shadow);
      assert.deepEqual(
        [pressed.x, pressed.y, pressed.width, pressed.height],
        [idle.x, idle.y, idle.width, idle.height],
      );
      await page
        .locator(".editor-header")
        .screenshot({ path: resolve(output, `${theme}-${name}-pressed.png`) });
      await page.mouse.move(1430, 880);
      await page.mouse.up();
      cases.push({ theme, name, idle, hover, pressed });
    }
    await format.click();
    assert.equal(await format.getAttribute("aria-expanded"), "true");
    assert.equal(await format.getAttribute("data-button-activated"), "");
    await page.mouse.move(1430, 880);
    await page.waitForTimeout(220);
    assert.notEqual((await format.evaluate(style)).shadow, "none");
    await page.screenshot({
      path: resolve(output, `${theme}-format-open.png`),
    });
    await page.keyboard.press("Escape");
  }
  // Settings text tabs share hover/press, keyboard focus and post-click feedback.
  await settings.click();
  const tab = page.getByRole("tab", { name: "数据", exact: true });
  await tab.hover();
  await page.waitForTimeout(110);
  assert.notEqual((await tab.evaluate(style)).shadow, "none");
  await tab.focus();
  await page.keyboard.press("Space");
  assert.equal(await tab.getAttribute("aria-selected"), "true");
  assert.equal(await tab.getAttribute("data-button-activated"), "");
  await page.waitForTimeout(220);
  assert.equal(await tab.getAttribute("data-button-activated"), null);
  const selectedHoverShadow = (await tab.evaluate(style)).shadow;
  assert.match(selectedHoverShadow, /255, 184, 36/);
  await page.mouse.move(1430, 880);
  await page.waitForTimeout(110);
  const selectedShadow = (await tab.evaluate(style)).shadow;
  assert.match(selectedShadow, /255, 184, 36/);
  assert.notEqual(selectedHoverShadow, selectedShadow);
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  // Same toolbar nodes survive switching notes; controls and note content remain intact.
  await format.evaluate((e) => (window.__retainedFormat = e));
  for (const name of ["反馈验证乙", "反馈验证甲", "反馈验证乙", "反馈验证甲"]) {
    await page.locator(".note-row").filter({ hasText: name }).click();
    await page.waitForTimeout(40);
    assert.equal(
      await format.evaluate((e) => e === window.__retainedFormat),
      true,
    );
  }
  await page.locator(".note-row").filter({ hasText: "反馈验证锁定" }).click();
  const disabled = page.locator('.desktop-toolbar button[aria-label="录音"]');
  assert.equal(await disabled.isDisabled(), true);
  await disabled.hover({ force: true });
  assert.equal((await disabled.evaluate(style)).shadow, "none");
  assert.equal((await disabled.evaluate(style)).cursor, "default");
  assert.equal(await disabled.getAttribute("data-button-activated"), null);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await disabled.evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  assert.deepEqual(await notes(), before);
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        passed: true,
        cases,
        checks: [
          "light/dark text and icon hover",
          "pressed feedback without geometry changes",
          "menu-open state persists",
          "keyboard activation and 180ms acknowledgement",
          "settings text tabs and focus",
          "same toolbar DOM nodes across note switches",
          "disabled controls show no clickable feedback",
          "reduced motion",
          "no note document/revision changes",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Production App button feedback checks passed");
} finally {
  await browser?.close();
  await vite.close();
}
