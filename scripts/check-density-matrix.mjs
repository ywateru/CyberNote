import assert from "node:assert/strict";
import { resolve } from "node:path";
/** Runs against the real App with the smoke check's isolated browser fixture. */
export async function checkDensityMatrix(browser, origin, sourcePage, output) {
  const storageState = await sourcePage.context().storageState();
  const cases = [];
  const sizes = [
    ["tiny", 12],
    ["small", 13],
    ["medium", 14],
    ["large", 16],
    ["huge", 18],
  ];
  const toolLabels = [
    "格式",
    "核对清单",
    "表格",
    "添加附件",
    "录音",
    "标签",
    "共享",
    "更多",
  ];
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({
      storageState,
      deviceScaleFactor: dpr,
      viewport: { width: 1560, height: 960 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(origin);
    await page.locator(".tiptap").waitFor();
    const search = page.getByRole("textbox", {
      name: "搜索备忘录",
      exact: true,
    });
    for (const theme of ["light", "dark"])
      for (const [preset, px] of sizes) {
        await page
          .getByRole("button", { name: "设置", exact: true })
          .filter({ visible: true })
          .click();
        await page
          .getByRole("combobox", { name: "外观", exact: true })
          .selectOption(theme);
        await page
          .getByRole("combobox", { name: "界面字体大小", exact: true })
          .selectOption(preset);
        await page
          .getByRole("combobox", { name: "编辑器字体大小", exact: true })
          .selectOption("medium");
        await page
          .getByRole("button", { name: "关闭设置", exact: true })
          .click();
        for (const width of [1000, 1280, 1560, 1920]) {
          await page.setViewportSize({
            width,
            height: width === 1000 ? 600 : 960,
          });
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          const key = `${theme}-${width}-${preset}-${dpr}x`,
            scale = px / 18;
          await search.evaluate((e) => e.blur());
          await page.mouse.move(0, 500);
          const measure = () =>
            page.evaluate(() => {
              const box = (s) => {
                const e = document.querySelector(s),
                  r = e.getBoundingClientRect(),
                  c = getComputedStyle(e);
                return {
                  x: r.x,
                  y: r.y,
                  width: r.width,
                  height: r.height,
                  font: parseFloat(c.fontSize),
                  padding: parseFloat(c.paddingLeft),
                  radius: parseFloat(c.borderRadius),
                  border: c.borderColor,
                  shadow: c.boxShadow,
                  outline: c.outlineStyle,
                };
              };
              return {
                folder: box(".sidebar .folder-row"),
                icon: box(".sidebar .folder-row>svg"),
                header: box(".editor-header"),
                search: box(".desktop-search .search-box"),
                input: box(".desktop-search input"),
                editor: box(".tiptap"),
                row: box(".notes-scroll:not(.gallery) .note-row"),
                sidebar: box(".sidebar"),
                list: box(".notes-pane"),
                settingsIcon: box(".desktop-settings svg"),
                overflow: document.documentElement.scrollWidth > innerWidth,
              };
            });
          let normal = await measure();
          assert(Math.abs(normal.folder.font - px) < 0.02, key + " UI font");
          assert(
            Math.abs(normal.editor.font - 16) < 0.02,
            key + " editor independent",
          );
          assert(
            Math.abs(normal.folder.height - 44 * scale) < 0.1,
            key + " row density",
          );
          assert(
            Math.abs(normal.icon.width - 23 * scale) < 0.1,
            key + " icon density",
          );
          assert(
            Math.abs(normal.folder.padding - 14 * scale) < 0.1,
            key + " padding density",
          );
          assert(
            Math.abs(normal.settingsIcon.width - 24 * scale) < 0.1,
            key + " toolbar icon consistency",
          );
          assert.equal(
            normal.header.height,
            Math.round(68 * scale),
            key + " header density",
          );
          assert.equal(
            normal.sidebar.width,
            Math.round((width <= 1100 ? 220 : 272) * scale),
            key + " sidebar density",
          );
          assert.equal(
            normal.list.width,
            Math.round((width <= 1100 ? 280 : 390) * scale),
            key + " list density",
          );
          assert(!normal.overflow, key + " horizontal overflow");
          const controls = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                ".desktop-toolbar-actions>button,.desktop-tool-overflow>summary,.desktop-search,.desktop-settings",
              ),
            ]
              .filter((e) => e.checkVisibility())
              .map((e) => {
                let r = e.getBoundingClientRect();
                return {
                  name: e.getAttribute("aria-label") || e.className,
                  x: r.x,
                  y: r.y,
                  right: r.right,
                  bottom: r.bottom,
                };
              }),
          );
          for (let i = 0; i < controls.length; i++) {
            const a = controls[i];
            assert(
              a.x >= 0 && a.right <= width + 0.1,
              key + " " + a.name + " within viewport",
            );
            for (const b of controls.slice(i + 1))
              assert(
                !(
                  a.x < b.right - 0.1 &&
                  b.x < a.right - 0.1 &&
                  a.y < b.bottom - 0.1 &&
                  b.y < a.bottom - 0.1
                ),
                key + " overlapping " + a.name + "/" + b.name,
              );
          }
          const overflow = page
            .getByLabel("其他工具", { exact: true })
            .filter({ visible: true });
          if (await overflow.count()) {
            await overflow.click();
            const menu = page.getByRole("menu", {
              name: "其他工具",
              exact: true,
            });
            const rect = await menu.boundingBox();
            assert(
              rect.x >= 0 && rect.x + rect.width <= width + 0.1,
              key + " menu bounds",
            );
            for (const label of toolLabels)
              assert.equal(
                await page
                  .getByRole("button", { name: label, exact: true })
                  .or(page.getByRole("menuitem", { name: label, exact: true }))
                  .filter({ visible: true })
                  .count(),
                1,
                key + " reachable " + label,
              );
            await page.keyboard.press("Escape");
            assert.equal(
              await overflow.evaluate((e) => document.activeElement === e),
              true,
              key + " escape restores focus",
            );
          } else
            for (const label of toolLabels)
              assert.equal(
                await page
                  .getByRole("button", { name: label, exact: true })
                  .filter({ visible: true })
                  .count(),
                1,
                key + " reachable " + label,
              );
          await page.mouse.move(0, 500);
          await search.evaluate((e) => e.blur());
          await page.screenshot({ path: resolve(output, key + ".png") });
          const searchBox = page.locator(".desktop-search .search-box");
          await searchBox.hover();
          let hover = await measure();
          assert.notEqual(
            hover.search.border,
            normal.search.border,
            key + " hover feedback",
          );
          await search.focus();
          let focus = await measure();
          for (const state of [hover, focus])
            for (const property of ["x", "y", "width", "height", "radius"])
              assert.equal(
                state.search[property],
                normal.search[property],
                key + " stable capsule " + property,
              );
          assert.equal(
            focus.input.outline,
            "none",
            key + " no nested focus outline",
          );
          assert.notEqual(
            focus.search.border,
            normal.search.border,
            key + " focus feedback",
          );
          await searchBox.screenshot({
            path: resolve(output, key + "-focus.png"),
          });
          await search.fill("阅读");
          await page
            .locator(".note-row")
            .filter({ hasText: "阅读摘录" })
            .waitFor();
          assert.equal(
            await page.locator(".note-row").count(),
            2,
            key + " search filters",
          );
          assert.equal(
            await page
              .locator(".note-row")
              .filter({ hasText: "周五的产品讨论" })
              .count(),
            0,
            key + " unrelated note excluded",
          );
          await searchBox.screenshot({
            path: resolve(output, key + "-typed.png"),
          });
          await page
            .getByRole("button", { name: "清除搜索", exact: true })
            .click();
          assert.equal(await search.inputValue(), "");
          await page
            .locator(".note-row")
            .filter({ hasText: "周五的产品讨论" })
            .click();
          await page
            .getByRole("button", { name: "设置", exact: true })
            .filter({ visible: true })
            .click();
          const dialog = page.getByRole("dialog");
          const bounds = await dialog.boundingBox();
          assert(
            bounds.x >= 0 &&
              bounds.y >= 0 &&
              bounds.x + bounds.width <= width + 0.1 &&
              bounds.y + bounds.height <= (width === 1000 ? 600 : 960) + 0.1,
            key + " settings fit",
          );
          for (const label of ["界面字体大小", "编辑器字体大小"]) {
            const select = page.getByRole("combobox", {
              name: label,
              exact: true,
            });
            assert.deepEqual(await select.locator("option").allTextContents(), [
              "极小",
              "小",
              "中",
              "大",
              "极大",
            ]);
            await select.scrollIntoViewIfNeeded();
            const r = await select.boundingBox();
            assert(
              r.x >= bounds.x && r.x + r.width <= bounds.x + bounds.width + 0.1,
              key + " select fits",
            );
          }
          if (width === 1000 && dpr === 2)
            await dialog.screenshot({
              path: resolve(output, key + "-settings.png"),
            });
          await page
            .getByRole("button", { name: "关闭设置", exact: true })
            .click();
          cases.push({
            case: key,
            normal,
            hover: hover.search,
            focus: focus.search,
            visibleTools: controls.map((c) => c.name),
          });
        }
      }
    assert.deepEqual(errors, []);
    await context.close();
  }
  return cases;
}

export async function checkDensityInteractions(page, output) {
  const open = () =>
    page
      .getByRole("button", { name: "设置", exact: true })
      .filter({ visible: true })
      .click();
  const close = () =>
    page.getByRole("button", { name: "关闭设置", exact: true }).click();
  const choose = async (ui, editor) => {
    await open();
    await page
      .getByRole("combobox", { name: "界面字体大小", exact: true })
      .selectOption(ui);
    if (editor)
      await page
        .getByRole("combobox", { name: "编辑器字体大小", exact: true })
        .selectOption(editor);
    await close();
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  };
  await page.setViewportSize({ width: 1560, height: 960 });
  const resize = [];
  for (const [preset, px] of [
    ["tiny", 12],
    ["small", 13],
    ["medium", 14],
    ["large", 16],
    ["huge", 18],
  ]) {
    const scale = px / 18;
    await choose(preset, "huge");
    assert.equal(
      await page
        .locator(".tiptap")
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      20,
      "UI density preserves large editor",
    );
    for (const [selector, column, max] of [
      [".sidebar-resize", "sidebarWidth", 360],
      [".list-resize", "listWidth", 480],
    ]) {
      const separator = page.locator(selector),
        before = Number(await separator.getAttribute("aria-valuenow")),
        bounds = await separator.boundingBox(),
        delta = Math.round(20 * scale);
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 120);
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width / 2 + delta,
        bounds.y + 120,
        { steps: 4 },
      );
      await page.mouse.up();
      const expected = Math.min(Math.round(max * scale), before + delta);
      await page.waitForFunction(
        ({ selector, expected }) =>
          Math.abs(
            Number(
              document.querySelector(selector).getAttribute("aria-valuenow"),
            ) - expected,
          ) < 1.1,
        { selector, expected },
      );
      await page.waitForFunction(
        ({ column, expected, scale }) =>
          Math.abs(
            JSON.parse(localStorage.getItem("notes-browser-preview")).settings[
              column
            ] *
              scale -
              expected,
          ) < 1.1,
        { column, expected, scale },
      );
      const logical = await page.evaluate(
        (column) =>
          JSON.parse(localStorage.getItem("notes-browser-preview")).settings[
            column
          ],
        column,
      );
      await page.reload();
      await page.locator(".tiptap").waitFor();
      assert(
        Math.abs(
          Number(await page.locator(selector).getAttribute("aria-valuenow")) -
            expected,
        ) < 1.1,
        "resized width survives reload",
      );
      resize.push({
        preset,
        column,
        logical,
        actual: Number(
          await page.locator(selector).getAttribute("aria-valuenow"),
        ),
      });
    }
  }
  // Exercise an overflow item against the real editor, then Undo the fixture edit.
  await page.setViewportSize({ width: 1000, height: 720 });
  await choose("huge", "medium");
  const text = await page.locator(".tiptap").innerText();
  await page.locator(".desktop-tool-overflow>summary").click();
  await page.getByRole("menuitem", { name: "标签", exact: true }).click();
  assert(
    (await page.locator(".tiptap").innerText()).length > text.length,
    "overflow action reaches editor",
  );
  await page.keyboard.press("Meta+z");
  await page.waitForFunction(
    (text) => document.querySelector(".tiptap").innerText === text,
    text,
  );
  // Mobile settings remain usable, with the selected independent editor value.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".app.mobile").waitFor();
  for (const name of ["返回笔记", "返回全部笔记"]) {
    const back = page
      .getByRole("button", { name, exact: true })
      .filter({ visible: true });
    if (await back.count()) await back.first().click();
  }
  await page
    .getByRole("button", { name: "设置", exact: true })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog"),
    bounds = await dialog.boundingBox();
  assert.equal(bounds.width, 390);
  assert(bounds.y >= 0 && bounds.y + bounds.height <= 844.1);
  await page
    .getByRole("combobox", { name: "界面字体大小", exact: true })
    .selectOption("small");
  await page
    .getByRole("combobox", { name: "编辑器字体大小", exact: true })
    .selectOption("large");
  await dialog.screenshot({ path: resolve(output, "mobile-settings.png") });
  await close();
  return { resize, overflowActionAndUndo: "passed", mobileSettings: "passed" };
}
