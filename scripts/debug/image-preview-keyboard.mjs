import { resolve } from "node:path";
import { idle, state, saveJSON } from "./runtime.mjs";

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
    // A picker may return focus to body. Preserve the observed focus in evidence,
    // then explicitly exercise that boundary even on browsers which retain it.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Tab");
    const tabFocus = await focus();
    await page.keyboard.press("Shift+Tab");
    const shiftTabFocus = await focus();
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
      `${row.outcome} export lets Tab recover body focus and Shift Tab wrap inside preview`,
      row.tabSave.correctResult &&
        row.tabFocus.inside &&
        row.tabFocus.label === "图片信息" &&
        row.shiftTabFocus.inside &&
        row.shiftTabFocus.label === "关闭图片预览",
    );
  }
}
