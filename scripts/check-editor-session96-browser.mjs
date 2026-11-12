// Production App with isolated persistence and native keyboard bridge spy.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state } from "./debug/runtime.mjs";
const output = resolve("artifacts/session96/app");
await mkdir(output, { recursive: true });
const r = await openRuntime({ mobile: true });
const { page } = r;
const checks = [];
const check = (name, value) => {
  assert(value, name);
  checks.push(name);
};
const panel = page.getByRole("dialog", { name: "格式", exact: true });
try {
  await page.evaluate(() => {
    window.keyboardCalls = [];
    window.NotesKeyboard = {
      show() {
        window.keyboardCalls.push({
          kind: "show",
          owner: document.activeElement?.closest("[data-mobile-editor-note]")
            ?.dataset.mobileEditorNote,
        });
      },
      hide() {
        window.keyboardCalls.push({ kind: "hide" });
      },
    };
  });
  await api(page, "note.select", { id: "note-a" });
  await idle(page);
  check(
    "entering existing note stays browse without explicit native show",
    !(await page.evaluate(() =>
      window.keyboardCalls.some((c) => c.kind === "show"),
    )) && (await state(page)).editorSession.body === "browse",
  );
  await api(page, "editor.setContent", {
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "alpha beta" }] },
      ],
    },
  });
  await api(page, "editor.select", { from: 1, to: 6 });
  await page.getByRole("button", { name: "格式", exact: true }).tap();
  await panel.waitFor();
  await api(page, "menu.open", { menu: "more" });
  await page.locator(".menu-more").waitFor();
  check(
    "ordinary more menu coexists with persistent format panel",
    (await panel.isVisible()) &&
      (await state(page)).editorSession.panel === "format",
  );
  await page.getByRole("menuitem", { name: "移动到", exact: true }).tap();
  await page.getByRole("menu", { name: "移动到", exact: true }).waitFor();
  await api(page, "app.back");
  check(
    "Back closes only innermost submenu",
    (await page
      .getByRole("menu", { name: "移动到", exact: true })
      .isHidden()) &&
      (await page.locator(".menu-more").isVisible()) &&
      (await panel.isVisible()),
  );
  await api(page, "app.back");
  check(
    "next Back closes ordinary menu while format remains",
    (await page.locator(".menu-more").count()) === 0 &&
      (await panel.isVisible()),
  );
  await api(page, "menu.open", { menu: "media" });
  await page.keyboard.press("Escape");
  check(
    "Escape closes top ordinary menu rather than format",
    (await page.locator(".menu-media").count()) === 0 &&
      (await panel.isVisible()),
  );
  await api(page, "editor.select", { from: 7, to: 11 });
  await panel.getByRole("button", { name: "粗体", exact: true }).tap();
  await idle(page);
  check(
    "format bookmark follows selection while ordinary menu is closed",
    (await page.locator(".tiptap strong").textContent()) === "beta",
  );
  const before = await page.evaluate(() => window.keyboardCalls.length);
  await panel.getByRole("button", { name: "关闭格式", exact: true }).tap();
  check(
    "manual format close focuses exact owner and emits native show",
    await page.evaluate(
      (n) =>
        window.keyboardCalls
          .slice(n)
          .some((c) => c.kind === "show" && c.owner === "note-a"),
      before,
    ),
  );
  await api(page, "menu.open", { menu: "format" });
  await api(page, "app.back");
  check(
    "Back format close hides IME without leaving note",
    (await panel.count()) === 0 &&
      (await state(page)).selection.noteId === "note-a" &&
      (await page.evaluate(() => window.keyboardCalls.at(-1).kind === "hide")),
  );
  await api(page, "menu.open", { menu: "format" });
  await api(page, "note.select", { id: "note-b" });
  await idle(page);
  check(
    "navigation drops old format and pending focus with a native hide boundary",
    (await panel.count()) === 0 &&
      (await state(page)).editorSession.pendingFocus === null &&
      (await page.evaluate(() => window.keyboardCalls.at(-1).kind === "hide")),
  );
  // A created note is admitted only after its own real Editor is registered.
  const index = await page.evaluate(() => window.keyboardCalls.length);
  await api(page, "note.create");
  await idle(page);
  const created = (await state(page)).selection.noteId;
  check(
    "creation focuses registered receipt owner and emits one show",
    await page.evaluate(
      ({ index, created }) => {
        const calls = window.keyboardCalls
          .slice(index)
          .filter((c) => c.kind === "show");
        return calls.length === 1 && calls[0].owner === created;
      },
      { index, created },
    ),
  );
  // Opening drawing after show must hide/cancel pending Android IME work.
  await page.getByRole("button", { name: "绘画", exact: true }).tap();
  await page.getByRole("dialog", { name: "速绘", exact: true }).waitFor();
  check(
    "drawing supersedes keyboard request and freezes source editor",
    (await page.evaluate(() => window.keyboardCalls.at(-1).kind === "hide")) &&
      (await page.locator(".tiptap").getAttribute("contenteditable")) ===
        "false",
  );
  await page
    .getByRole("dialog", { name: "速绘", exact: true })
    .getByRole("button", { name: "取消", exact: true })
    .tap();
  check(
    "drawing cancel stays browse with no automatic IME return",
    (await state(page)).editorSession.body === "browse" &&
      (await page.evaluate(() => window.keyboardCalls.at(-1).kind === "hide")),
  );
  await page.locator(".tiptap").tap();
  await api(page, "menu.open", { menu: "format" });
  await api(page, "modal.open", {
    type: "lock",
    value: "session-fixture-passphrase",
  });
  await api(page, "modal.submit");
  await idle(page);
  check(
    "access revocation clears panel and leaves no editable old owner",
    (await panel.count()) === 0 &&
      (await page.locator(".tiptap[contenteditable=true]").count()) === 0 &&
      (await state(page)).editorSession.pendingFocus === null,
  );
  check("no uncaught browser errors", r.errors.length === 0);
  const kotlin = await readFile(
    "src-tauri/gen/android/app/src/main/java/com/local/notesclone/MainActivity.kt",
    "utf8",
  );
  assert.match(kotlin, /fun hide\(\)[\s\S]*?cancelKeyboardShow\(webView\)/);
  assert.match(kotlin, /removeCallbacks\(it\)/);
  assert.match(kotlin, /generation == keyboardGeneration/);
  await page.screenshot({ path: resolve(output, "access-boundary.png") });
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        checks,
        keyboardCalls: await page.evaluate(() => window.keyboardCalls),
        scope:
          "Actual App + bridge spy; source-reviewed Android generation/callback cancellation. No Android OS IME or native build.",
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
      {
        error: error.message,
        state: await state(page),
        checks,
        errors: r.errors,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await r.cleanup();
}
