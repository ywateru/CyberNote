import { resolve } from "node:path";
import { idle, state, saveJSON } from "./runtime.mjs";

/** Scrollable information areas can be sequentially focusable in Chromium.
 * Follow ordinary document order and reject a real focus cycle inside preview. */
export async function tabOutsidePreview(page, key = "Tab") {
  const visited = [],
    path = [];
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.keyboard.press(key);
      const focus = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        label: document.activeElement?.getAttribute("aria-label"),
        inside:
          document.hasFocus() &&
          !!document
            .querySelector(".image-preview")
            ?.contains(document.activeElement),
      }));
      path.push(focus);
      if (!focus.inside) return { ...focus, path };
      const current = await page.evaluateHandle(() => document.activeElement);
      if (
        await current.evaluate(
          (element, previous) => previous.includes(element),
          visited,
        )
      ) {
        await current.dispose();
        return { ...focus, path, cycle: true };
      }
      visited.push(current);
    }
    return { inside: true, path, exhausted: true };
  } finally {
    for (const handle of visited) await handle.dispose();
  }
}

/** Exercise real save button lifecycle with only picker/output boundaries mocked. */
export async function runImageExportKeyboard(
  runtime,
  { command, check, output, id },
) {
  const { page, backend } = runtime;
  const before = JSON.stringify((await state(page)).editorJSON);
  const rows = [];
  const focus = () =>
    page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      label:
        document.activeElement?.getAttribute("aria-label") ||
        document.activeElement?.textContent?.slice(0, 80),
      inside: !!document
        .querySelector(".image-preview")
        ?.contains(document.activeElement),
    }));
  const save = async (outcome) => {
    await command("image.preview", { id });
    const exportsBefore = backend.exports.length;
    if (outcome === "error") backend.configure({ fail: { export: 1 } });
    await page.evaluate(
      (path) =>
        window.__DEBUG_PLATFORM__.configure({ dialog: { save: [path] } }),
      outcome === "cancel"
        ? null
        : `content://synthetic/keyboard-${outcome}.png`,
    );
    await page.getByRole("button", { name: "导出原图…", exact: true }).click();
    await idle(page);
    const notice = await page.locator(".image-export-status").allTextContents();
    return {
      exports: backend.exports.length - exportsBefore,
      focus: await focus(),
      notice,
      correctResult:
        outcome === "success"
          ? backend.exports.length === exportsBefore + 1 &&
            notice.some((text) => text.includes("图片已保存"))
          : backend.exports.length === exportsBefore &&
            (outcome === "cancel"
              ? notice.length === 0
              : notice.some((text) => text.includes("Controlled export")) &&
                !notice.some((text) => text.includes("图片已保存"))),
    };
  };
  for (const outcome of ["cancel", "success", "error"]) {
    const escapeSave = await save(outcome);
    await page.screenshot({
      path: resolve(output, `image-keyboard-${outcome}.png`),
    });
    await page.keyboard.press("Escape");
    await idle(page);
    const escaped = (await page.locator(".image-preview").count()) === 0;
    const triggerFocused = await page
      .locator(".image-open")
      .evaluate((node) => node === document.activeElement);
    if (!escaped) await command("image.close");
    const tabSave = await save(outcome);
    // Nonmodal controls use ordinary document order instead of a Tab trap.
    await page.locator(".image-preview header button").last().focus();
    const tabFocus = await tabOutsidePreview(page);
    await page
      .getByRole("button", { name: "关闭图片预览", exact: true })
      .focus();
    const shiftTabFocus = await tabOutsidePreview(page, "Shift+Tab");
    await command("image.close");
    rows.push({
      outcome,
      escapeSave,
      escaped,
      triggerFocused,
      tabSave,
      tabFocus,
      shiftTabFocus,
      documentUnchanged:
        before === JSON.stringify((await state(page)).editorJSON),
    });
  }
  await saveJSON(resolve(output, "image-keyboard-results.json"), rows);
  for (const row of rows) {
    check(
      `${row.outcome} export preserves its result and immediate Escape closes preview from returned focus`,
      row.escapeSave.correctResult &&
        row.escaped &&
        row.triggerFocused &&
        row.documentUnchanged,
    );
    check(
      `${row.outcome} export leaves Tab and Shift Tab free to return to the main interface`,
      row.tabSave.correctResult &&
        !row.tabFocus.inside &&
        !row.shiftTabFocus.inside,
    );
  }
}
