import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { runImageExportKeyboard } from "./image-preview-keyboard.mjs";
import { api, idle, state, snapshot, saveJSON } from "./runtime.mjs";
import { chooseFiles, tinyPNG } from "./mobile-attachments.mjs";
export async function runImagePreview(runtime, { command, check, output }) {
  const { page, backend } = runtime,
    geometry = [];
  if (runtime.mobile) await command("note.select", { id: "note-a" });
  const name = "原始长文件名称".repeat(14) + ".png";
  await chooseFiles(page, [{ name, mimeType: "image/png", buffer: tinyPNG }]);
  await idle(page);
  const id = backend.workspace.attachments[0].id;
  await page.waitForFunction(
    () => document.querySelector(".image-open img")?.naturalWidth > 0,
  );
  const before = JSON.stringify((await state(page)).editorJSON),
    selection = (await state(page)).editorSelection;
  check(
    "Body contains only the image preview trigger, no outside save or export status",
    (await page.locator(".image-attachment .save-image").count()) === 0 &&
      (await page.locator(".attachment-node .image-export-status").count()) ===
        0,
  );
  await command("image.preview", { id });
  check(
    "Preview is a direct protected app child outside editor ancestors",
    await page
      .locator(".image-preview")
      .evaluate(
        (n) =>
          n.parentElement.classList.contains("app") &&
          !n.closest(".tiptap,.editor-scroll,.attachment-node"),
      ),
  );
  check(
    "Opening preview focuses its actual close control",
    await page
      .getByRole("button", { name: "关闭图片预览", exact: true })
      .evaluate((n) => document.activeElement === n),
  );
  await command("image.info");
  const info = await page.locator(".image-preview-info").innerText();
  check(
    "Information uses authorized name, MIME, original byte length and natural image size with no invented timestamp",
    info.includes(name) &&
      info.includes("image/png") &&
      info.includes(`${tinyPNG.length} 字节`) &&
      info.includes("1 × 1 像素") &&
      !info.includes("拍摄时间") &&
      !info.includes("修改时间"),
  );
  await page.keyboard.press("Tab");
  check(
    "Tab wraps from close to information",
    await page
      .getByRole("button", { name: "图片信息", exact: true })
      .evaluate((n) => document.activeElement === n),
  );
  await page.keyboard.press("Shift+Tab");
  check(
    "Shift Tab wraps back to close",
    await page
      .getByRole("button", { name: "关闭图片预览", exact: true })
      .evaluate((n) => document.activeElement === n),
  );
  for (const [width, theme, reservedTop] of [
    [320, "light", 0],
    [390, "dark", 0],
    [800, "light", 52],
    [800, "dark", 52],
  ]) {
    await command("image.close");
    await page.setViewportSize({ width, height: 844 });
    await command("settings.update", { settings: { theme } });
    await command("note.select", { id: "note-a" });
    await command("image.preview", { id });
    await command("image.info");
    // Presentation-only reservedTop simulation; real NSView proof is separate AppKit harness.
    await page
      .locator(".app")
      .evaluate(
        (n, top) => n.style.setProperty("--native-top", top + "px"),
        reservedTop,
      );
    const value = await page.locator(".image-preview").evaluate((n) => {
      const rect = (x) => x.getBoundingClientRect().toJSON();
      return {
        preview: rect(n),
        scrollWidth: n.scrollWidth,
        clientWidth: n.clientWidth,
        buttons: [...n.querySelectorAll("header button")].map((x) => ({
          rect: rect(x),
          label: x.getAttribute("aria-label") || x.textContent,
          visible:
            document.elementFromPoint(
              x.getBoundingClientRect().x + 4,
              x.getBoundingClientRect().y + 4,
            ) === x,
        })),
        figure: rect(n.querySelector("figure")),
        image: rect(n.querySelector("figure img")),
      };
    });
    geometry.push({ width, theme, reservedTop, ...value });
    check(
      `${width}px ${theme} reservedTop ${reservedTop} keeps all header actions visible, nonoverlapping and no horizontal overflow`,
      value.scrollWidth <= value.clientWidth &&
        value.buttons.every(
          (x) =>
            x.rect.left >= 0 &&
            x.rect.right <= width &&
            x.rect.top >= reservedTop &&
            x.visible,
        ) &&
        value.buttons.every(
          (x, i) => !i || x.rect.left >= value.buttons[i - 1].rect.right,
        ),
    );
    await page.screenshot({
      path: resolve(output, `image80-${width}-${theme}.png`),
    });
  }
  await command("image.close");
  await page.setViewportSize(runtime.viewport);
  await page
    .locator(".app")
    .evaluate((n) => n.style.setProperty("--native-top", "0px"));
  check(
    "Close restores image trigger focus without changing editor JSON",
    (await page
      .locator(".image-open")
      .evaluate((n) => document.activeElement === n)) &&
      JSON.stringify((await state(page)).editorJSON) === before &&
      JSON.stringify((await state(page)).editorSelection) ===
        JSON.stringify(selection),
  );
  await command("image.preview", { id });
  await page.keyboard.press("Escape");
  await idle(page);
  check(
    "Escape closes actual preview and returns focus",
    (await page.locator(".image-preview").count()) === 0 &&
      (await page
        .locator(".image-open")
        .evaluate((n) => document.activeElement === n)),
  );
  await runImageExportKeyboard(runtime, { command, check, output, id });
  await command("editor.insertText", { text: " UNDO80" });
  await command("editor.undo");
  check(
    "Opening/info/closing preview adds no Undo entry",
    JSON.stringify((await state(page)).editorJSON) === before,
  );
  await command("image.preview", { id });
  await command("app.back");
  await command("note.select", { id: "note-b" });
  check(
    "Navigation closes preview and removes protected image bytes from overlay",
    (await page.locator(".image-preview").count()) === 0,
  );
  await command("note.select", { id: "note-a" });
  await command("image.preview", { id });
  const prepared = backend.state();
  backend.suspended = ["note-a"];
  backend.operationId = "image80-prepare";
  const immediate = await page.evaluate(
    (value) => {
      const node = document.querySelector(".image-preview");
      window.__DEBUG_PLATFORM__.emit("notes-access", value);
      return !node?.isConnected || node.hidden;
    },
    {
      phase: "prepare",
      operationId: "image80-prepare",
      noteIds: ["note-a"],
      access: {
        ...prepared.access,
        operationId: "image80-prepare",
        suspended: ["note-a"],
      },
    },
  );
  await page.waitForSelector(".access-cover");
  check(
    "Access prepare closes app-level preview synchronously under protected cover",
    immediate &&
      (await page.locator(".image-preview").count()) === 0 &&
      (await page.locator(".app.access-sync").count()) === 1,
  );
  await saveJSON(resolve(output, "image80-layout.json"), {
    geometry,
    selection,
    scope: runtime.metadata,
    limits: [
      "Reserved top browser geometry is presentation simulation. Actual production AppKit titlebar and native layer are verified by scripts/native/image-preview80.m.",
      "No real microphone, original app or Android device touched.",
    ],
  });
  await runtime.reset();
  if (!runtime.mobile) {
    // Exact official Tauri 2.12.5 drag.js (Cargo.lock), vendored unchanged with
    // upstream copyright. Exercise injected runtime + React event chain together.
    const dragScript = await readFile(
      new URL("./fixtures/tauri-drag-2.12.5.js", import.meta.url),
      "utf8",
    );
    await page.addScriptTag({
      content: dragScript.replace("__TEMPLATE_os_name__", '"linux"'),
    });
    const doubleClick = async (selector) => {
      const node = page.locator(selector).first();
      await node.dispatchEvent("mousedown", {
        button: 0,
        detail: 2,
        clientX: 1,
        clientY: 1,
      });
      await node.dispatchEvent("mouseup", {
        button: 0,
        detail: 2,
        clientX: 1,
        clientY: 1,
      });
      await node.dispatchEvent("dblclick", {
        button: 0,
        detail: 2,
        clientX: 1,
        clientY: 1,
      });
    };
    const count = await page.evaluate(
      () => window.__DEBUG_PLATFORM__.calls.length,
    );
    for (const selector of [
      ".sidebar-toolbar",
      ".notes-header",
      ".editor-header",
    ])
      await doubleClick(selector);
    const calls = await page.evaluate(
      (start) => window.__DEBUG_PLATFORM__.calls.slice(start),
      count,
    );
    check(
      "Official Tauri drag injection and React together dispatch exactly one toggle per blank header",
      calls.filter(
        (x) => x.command === "plugin:window|internal_toggle_maximize",
      ).length === 3,
    );
    const countControls = await page.evaluate(
      () => window.__DEBUG_PLATFORM__.calls.length,
    );
    for (const selector of [
      ".sidebar-toolbar button",
      ".notes-header button",
      ".editor-header button",
      ".desktop-search input",
      ".tiptap",
    ])
      await doubleClick(selector);
    check(
      "Fallback button/search/editor double clicks do not dispatch native zoom",
      !(
        await page.evaluate(
          (start) => window.__DEBUG_PLATFORM__.calls.slice(start),
          countControls,
        )
      ).some((x) => x.command === "plugin:window|internal_toggle_maximize"),
    );
  }
  // Direct production media-source/component lifetime probe: disposal must hide
  // the protected bytes synchronously even before React processes onClose.
  const lifetime = await page.evaluate(async () =>
    (
      await import("/scripts/debug/image-preview-lifetime.tsx")
    ).probeImageSourceDisposal(),
  );
  check(
    "Actual media source disposal synchronously hides overlay bytes and calls close once",
    lifetime.closed === 1 && lifetime.hidden && !lifetime.hasSrc,
  );
  check(
    "Hidden, disconnected, disposed and unmounted previews do not consume global Escape or Tab",
    lifetime.inactiveKeyboardIgnored,
  );
  check(
    "Mobile headers have no native desktop drag regions",
    !runtime.mobile ||
      (await page.locator("[data-tauri-drag-region]").count()) === 0,
  );
  await saveJSON(
    resolve(output, "image80-final.snapshot.json"),
    await snapshot(page, { selector: ".app", maxChars: 18000, maxNodes: 100 }),
  );
}
