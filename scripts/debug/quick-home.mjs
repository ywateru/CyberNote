import { resolve } from "node:path";
import {
  api,
  idle,
  state,
  snapshot,
  saveJSON,
  waitForState,
} from "./runtime.mjs";
import { chooseFiles, tinyPNG } from "./mobile-attachments.mjs";

// This group exercises the real mobile navigation, create handler and registered
// Tiptap instances. Only persistence/device boundaries are synthetic.
export async function runQuickHome(runtime, { command, check, output }) {
  const { page, backend } = runtime;
  if (!runtime.mobile) throw Error("quick-home is mobile scoped");
  await page.setViewportSize(runtime.viewport);
  await runtime.reset();
  const baseCall = backend.call.bind(backend);
  const plus = () => page.locator(".mobile-add-note");
  const current = async () => {
    const s = await state(page);
    return s.workspace.notes.find((n) => n.id === s.selection.noteId);
  };
  const createdCount = () =>
    backend.calls.filter(
      (c) => c.command === "workspace_action" && c.type === "createNote",
    ).length;
  const reset = async () => {
    backend.call = baseCall;
    await runtime.reset();
  };
  const focused = async (id) =>
    page.evaluate((id) => {
      const el = document.activeElement;
      return (
        el?.matches('.tiptap[contenteditable="true"]') &&
        el
          .closest("[data-mobile-editor-note]")
          ?.getAttribute("data-mobile-editor-note") === id
      );
    }, id);
  const capture = async (name) => {
    await page.screenshot({
      path: resolve(output, name + ".png"),
      animations: "disabled",
    });
    await saveJSON(
      resolve(output, name + ".snapshot.json"),
      await snapshot(page, {
        selector: ".app",
        maxChars: 24000,
        maxNodes: 100,
      }),
    );
  };
  let s = await state(page);
  check(
    "Cold start opens all active notes directly with no editor focus or desktop view write",
    s.selection.page === "notes" &&
      s.selection.folderId === "all" &&
      s.selection.listed.length === 2 &&
      s.selection.noteId === null &&
      (await page.locator(".tiptap").count()) === 0 &&
      !backend.workspace.settings.view &&
      !(await page.evaluate(() => document.activeElement?.matches(".tiptap"))),
  );
  check(
    "Home has one visible create action, folder/settings and no old count footer or fake microphone",
    (await page
      .getByRole("button", { name: "新建备忘录", exact: true })
      .count()) === 1 &&
      (await page.locator(".mobile-home-actions button").count()) === 2 &&
      (await page.locator(".notes-footer:visible").count()) === 0 &&
      (await page.locator(".mobile-list-search svg.lucide-mic").count()) === 0,
  );
  backend.configure({ delay: { create: 180 } });
  await page.evaluate(() => {
    const b = document.querySelector(".mobile-add-note");
    b.click();
    b.click();
  });
  await waitForState(page, (s) => s.creation.pending, {
    label: "create admission",
  });
  check(
    "Pending creation disables real plus and advertises busy",
    (await plus().isDisabled()) &&
      (await plus().getAttribute("aria-busy")) === "true",
  );
  await api(page, "note.create");
  await idle(page);
  s = await state(page);
  const first = s.selection.noteId;
  check(
    "DOM double click and semantic create share one persisted receipt and exact editable focus",
    createdCount() === 1 &&
      s.selection.page === "editor" &&
      s.selection.folderId === "all" &&
      (await current()).folderId === "default" &&
      (await focused(first)),
  );
  await page.keyboard.insertText("快速输入83\n真实保存正文");
  await command("editor.done");
  await command("app.flush");
  check(
    "Done flushes real input and removes editor focus",
    backend.workspace.notes
      .find((n) => n.id === first)
      .plainText.includes("真实保存正文") &&
      !(await page.evaluate(() => document.activeElement?.matches(".tiptap"))),
  );
  check(
    "Mobile editor keeps compact navigation and real tools without duplicate New or Share",
    (await page.locator('.editor-header [aria-label="返回笔记"]').count()) ===
      1 &&
      (await page.locator('.editor-header [aria-label="共享"]').count()) ===
        0 &&
      (await page.locator('.editor-pane [aria-label="新建备忘录"]').count()) ===
        0 &&
      (await page
        .locator('.editor-tools:visible [aria-label="格式"]')
        .count()) === 1,
  );
  await page.getByRole("button", { name: "返回笔记", exact: true }).click();
  await idle(page);
  check(
    "Editor Back returns to source all gallery and retains saved body",
    (await state(page)).selection.folderId === "all" &&
      (await state(page)).selection.page === "notes" &&
      (await page.locator(`[data-note-id="${first}"]`).innerText()).includes(
        "真实保存正文",
      ),
  );
  await page.reload();
  await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
  await idle(page);
  check(
    "Reload retains saved entity while cold navigation stays all without autofocus",
    backend.workspace.notes
      .find((n) => n.id === first)
      .plainText.includes("快速输入83") &&
      (await state(page)).selection.folderId === "all" &&
      !(await page.evaluate(() => document.activeElement?.matches(".tiptap"))),
  );
  await page.getByRole("button", { name: "文件夹", exact: true }).click();
  await idle(page);
  check(
    "Folders is a secondary page",
    (await state(page)).selection.page === "folders",
  );
  await command("app.back");
  check(
    "Folders Back returns to all gallery instead of exiting",
    (await state(page)).selection.page === "notes" &&
      (await state(page)).selection.folderId === "all",
  );
  await command("folder.open");
  await command("folder.updateDraft", {
    draft: { name: "83物理目录", smart: false },
  });
  await command("folder.submit");
  const physical = backend.workspace.folders.find(
    (f) => f.name === "83物理目录",
  ).id;
  await command("folder.select", { id: physical });
  await plus().click();
  await idle(page);
  const physicalNote = await current();
  check(
    "Physical folder creation preserves storage owner and source",
    physicalNote.folderId === physical &&
      (await state(page)).selection.folderId === physical &&
      (await focused(physicalNote.id)),
  );
  await command("app.back");
  check(
    "Physical editor returns to its folder",
    (await state(page)).selection.page === "notes" &&
      (await state(page)).selection.folderId === physical,
  );
  await command("app.back");
  check(
    "Folder gallery Back returns to all",
    (await state(page)).selection.folderId === "all",
  );
  await command("folder.open");
  await command("folder.updateDraft", {
    draft: {
      name: "83置顶智能",
      smart: true,
      combine: "all",
      rules: [
        {
          key: 0,
          type: "pinned",
          mode: "allSelected",
          names: [],
          pinned: true,
        },
      ],
    },
  });
  await command("folder.submit");
  const smart = backend.workspace.folders.find(
    (f) => f.name === "83置顶智能",
  ).id;
  await command("folder.select", { id: smart });
  await plus().click();
  await idle(page);
  const smartNote = await current();
  check(
    "Unmatched smart-folder creation opens its receipt rather than an unrelated projected note",
    smartNote &&
      smartNote.folderId === "default" &&
      smartNote.pinned === false &&
      (await state(page)).selection.folderId === smart &&
      (await focused(smartNote.id)),
  );
  await page.keyboard.insertText("智能目录新建83\n空结果中仍能输入");
  await command("editor.done");
  await page.locator('.editor-tools:visible [aria-label="格式"]').click();
  await idle(page);
  check(
    "Unmatched smart receipt supports real input and enabled format controls without changing result membership",
    backend.workspace.notes
      .find((n) => n.id === smartNote.id)
      .plainText.includes("空结果中仍能输入") &&
      (await state(page)).selection.listed.length === 0 &&
      (await state(page)).selection.menu === "format",
  );
  await command("app.back");
  await chooseFiles(
    page,
    [{ name: "smart-receipt83.png", mimeType: "image/png", buffer: tinyPNG }],
    { menu: true },
  );
  await idle(page);
  await page.locator('.editor-tools:visible [aria-label="添加附件"]').click();
  await page.getByRole("button", { name: "录音", exact: true }).click();
  await idle(page);
  await command("recording.action", { action: "toggle" });
  await page.evaluate(() => window.__DEBUG_PLATFORM__.advance(1300));
  await command("recording.action", { action: "close" });
  check(
    "Unmatched smart receipt media actions save to its exact physical owner while smart count stays zero",
    backend.workspace.attachments.some(
      (a) => a.noteId === smartNote.id && a.kind === "image",
    ) &&
      backend.workspace.attachments.some(
        (a) => a.noteId === smartNote.id && a.kind === "audio",
      ) &&
      (await state(page)).selection.listed.length === 0 &&
      !(await state(page)).recording.active,
  );
  await command("app.back");
  check(
    "Smart editor returns to original empty smart result",
    (await state(page)).selection.folderId === smart &&
      (await state(page)).selection.listed.length === 0 &&
      (await state(page)).selection.page === "notes",
  );
  await command("folder.select", { id: physical });
  await command("search.set", { query: "not-a-match" });
  await plus().click();
  await idle(page);
  s = await state(page);
  check(
    "New clears temporary search while retaining physical source",
    s.selection.folderId === physical &&
      s.selection.query === "" &&
      !s.selection.searching &&
      s.selection.tagFilter === undefined &&
      (await current()).folderId === physical,
  );
  await reset();
  backend.configure({ fail: { create: 1 } });
  await plus().click();
  await idle(page).catch(() => {});
  check(
    "Create failure keeps gallery and explicit recoverable error with no fake entity",
    (await state(page)).selection.page === "notes" &&
      backend.workspace.notes.length === 2 &&
      !!(await state(page)).creation.error &&
      !(await plus().isDisabled()),
  );
  await command("app.dismissError");
  await plus().click();
  await idle(page);
  check(
    "Explicit create retry succeeds once after failure",
    backend.workspace.notes.length === 3 &&
      (await focused((await state(page)).selection.noteId)),
  );
  await reset();
  backend.configure({ fail: { load: 100 } });
  await plus().click();
  await idle(page).catch(() => {});
  s = await state(page);
  check(
    "Successful receipt survives metadata failure without pretending editor is ready",
    backend.workspace.notes.length === 3 &&
      s.creation.receipt &&
      s.creation.error &&
      s.selection.page === "notes",
  );
  const receipt = s.creation.receipt;
  backend.configure({ fail: { load: 0 } });
  await command("app.dismissError");
  await plus().click();
  await idle(page);
  check(
    "Same-source retry recovers exact existing receipt without another create",
    createdCount() === 1 &&
      (await state(page)).selection.noteId === receipt &&
      (await focused(receipt)),
  );
  await reset();
  let release, started;
  const began = new Promise((done) => (started = done));
  let hold = false;
  backend.call = async (c, a) => {
    const result = await baseCall(c, a);
    if (c === "workspace_action" && a.action?.type === "createNote")
      hold = true;
    if (c === "load_workspace" && hold) {
      hold = false;
      started();
      await new Promise((done) => (release = done));
    }
    return result;
  };
  try {
    await plus().click();
    await began;
    await api(page, "note.select", { id: "note-b" });
    await page.locator(".tiptap:visible").click();
    release();
    await idle(page);
    check(
      "Delayed metadata never reopens or steals focus from a user-selected editor",
      (await state(page)).selection.noteId === "note-b" &&
        (await focused("note-b")) &&
        backend.workspace.notes.length === 3,
    );
  } finally {
    release?.();
    backend.call = baseCall;
  }
  await reset();
  backend.configure({ delay: { create: 220 } });
  await plus().click();
  await waitForState(page, (s) => s.creation.pending);
  await api(page, "app.back");
  check(
    "Root Back cannot exit through a pending create",
    !(await page.evaluate(() =>
      window.__DEBUG_PLATFORM__.quitAcknowledgements.some((a) => a.success),
    )),
  );
  await idle(page);
  check(
    "Root Back cancels pending focus but preserves committed entity",
    (await state(page)).selection.page === "notes" &&
      backend.workspace.notes.length === 3 &&
      !(await page.evaluate(() => document.activeElement?.matches(".tiptap"))),
  );
  await reset();
  await command("note.select", { id: "note-a" });
  await command("editor.setContent", {
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Fixture A" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "LOCKED-SECRET-83-正文不可泄露" }],
        },
      ],
    },
  });
  await command("app.flush");
  await command("modal.open", { type: "lock" });
  await command("dom.fill", {
    selector: 'input[aria-label="密码"]',
    value: "83-password",
  });
  await command("modal.submit");
  await command("app.back");
  check(
    "Locked card hides body preview from home HTML",
    !(await page.locator(".notes-pane").innerHTML()).includes(
      "LOCKED-SECRET-83",
    ) &&
      (await page.locator('[data-note-id="note-a"]').innerText()).includes(
        "已锁定",
      ),
  );
  await page.locator(".mobile-home-settings").click();
  await idle(page);
  check(
    "Home settings opens shared settings tab with desktop-only view labels",
    (await state(page)).preferences.tab === "settings" &&
      (await page
        .getByRole("combobox", { name: "桌面显示方式", exact: true })
        .count()) === 1 &&
      (await page
        .getByRole("checkbox", { name: "桌面按日期分组", exact: true })
        .count()) === 1,
  );
  await page.getByRole("tab", { name: "数据", exact: true }).click();
  await idle(page);
  check(
    "Shared data tab remains reachable from quick home",
    (await page.locator(".storage-summary").count()) === 1,
  );
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await idle(page);
  check(
    "Settings close restores actual visible home gear",
    await page
      .locator(".mobile-home-settings")
      .evaluate((n) => n === document.activeElement),
  );
  await reset();
  await command("note.select", { id: "note-a" });
  await chooseFiles(
    page,
    [{ name: "quick-home83.png", mimeType: "image/png", buffer: tinyPNG }],
    { menu: true },
  );
  await idle(page);
  check(
    "Compact editor media menu still saves attachment through actual FileList and body ACK",
    backend.workspace.attachments.length === 1 &&
      JSON.stringify(
        backend.workspace.notes.find((n) => n.id === "note-a").document,
      ).includes(backend.workspace.attachments[0].id),
  );
  const readsBeforeCold = backend.calls.filter(
    (c) => c.command === "read_attachment",
  ).length;
  const savedSelectedNote = backend.workspace.settings.selectedNote;
  await page.reload();
  await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
  await idle(page);
  check(
    "Cold gallery leaves restored selection unmounted and does not read hidden media payloads",
    (await state(page)).selection.noteId === null &&
      (await page.locator(".tiptap").count()) === 0 &&
      backend.workspace.settings.selectedNote === savedSelectedNote &&
      backend.calls.filter((c) => c.command === "read_attachment").length ===
        readsBeforeCold,
  );
  await page.locator('[data-note-id="note-a"]').click();
  await idle(page);
  await page.waitForFunction(() => {
    const img = document.querySelector(".attachment-node img");
    return img?.complete && img.naturalWidth > 0;
  });
  check(
    "Opening a media card mounts only its chosen editor and reads its saved attachment",
    (await state(page)).selection.noteId === "note-a" &&
      (await page.locator(".tiptap").count()) === 1 &&
      backend.calls.filter((c) => c.command === "read_attachment").length >
        readsBeforeCold,
  );
  await page.locator('.editor-tools:visible [aria-label="添加附件"]').click();
  await page.getByRole("button", { name: "录音", exact: true }).click();
  await idle(page);
  await command("recording.action", { action: "toggle" });
  await page.evaluate(() => window.__DEBUG_PLATFORM__.advance(1300));
  await command("recording.action", { action: "close" });
  check(
    "Existing synthetic recorder remains reachable and closes through audio/body save",
    backend.workspace.attachments.some((a) => a.kind === "audio") &&
      !(await state(page)).recording.active,
  );
  await reset();
  const template = backend.workspace.notes[0];
  backend.workspace.notes = Array.from({ length: 8 }, (_, i) => ({
    ...structuredClone(template),
    id: "layout83-" + i,
    title: "合成标题" + i + (i % 2 ? "很长的文字用于换行" : ""),
    plainText:
      "合成标题" +
      i +
      "\n这是一段用于检查两列卡片布局的合成正文。".repeat((i % 4) + 1),
    updatedAt: 1793923200000 - i * 1000,
  }));
  await page.reload();
  await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
  await idle(page);
  const metrics = [];
  for (const width of [320, 390, 430, 800])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 844 });
      await command("settings.update", { settings: { theme } });
      await page
        .locator(".notes-pane")
        .evaluate((n) => n.getAnimations().forEach((a) => a.finish()));
      const value = await page.evaluate(() => ({
        mobile: document.querySelector(".app").classList.contains("mobile"),
        overflow: document.querySelector(".app").scrollWidth > innerWidth,
        columns: getComputedStyle(document.querySelector(".notes-scroll"))
          .gridTemplateColumns,
        cards: [...document.querySelectorAll(".mobile-note-card")].map((n) => ({
          titles: n.querySelectorAll("strong").length,
          dates: n.querySelectorAll("time").length,
          right: n.getBoundingClientRect().right,
        })),
        plus: document
          .querySelector(".mobile-add-note")
          ?.getBoundingClientRect()
          .toJSON(),
      }));
      metrics.push({ width, theme, ...value });
      check(
        `${width}px ${theme} presentation fits without overflow or duplicate card title/date`,
        !value.overflow &&
          value.cards.every(
            (n) => n.titles === 1 && n.dates === 1 && n.right <= width + 1,
          ) &&
          (width < 700
            ? value.mobile &&
              value.columns.split(" ").length === 2 &&
              value.plus.width >= 48
            : !value.mobile) &&
          !backend.workspace.settings.view,
      );
      if (width === 390 && theme === "light")
        await capture("quick-home83-390-final");
    }
  await page.setViewportSize({ width: 320, height: 360 });
  await idle(page);
  await page
    .locator(".notes-pane")
    .evaluate((n) => n.getAnimations().forEach((a) => a.finish()));
  await page
    .locator(".notes-scroll")
    .evaluate((n) => (n.scrollTop = n.scrollHeight));
  const clearance = await page.evaluate(() => ({
    last: document
      .querySelector(".mobile-gallery .note-entry:last-child")
      .getBoundingClientRect().bottom,
    plus: document.querySelector(".mobile-add-note").getBoundingClientRect()
      .top,
    scroll:
      document.querySelector(".mobile-gallery").scrollHeight >
      document.querySelector(".mobile-gallery").clientHeight,
  }));
  check(
    "Short screens can scroll the last card above the plus",
    clearance.scroll && clearance.last <= clearance.plus,
  );
  await page.addStyleTag({
    content:
      ".mobile-note-card strong{font-size:36px!important}.mobile-note-card p{font-size:28px!important}.mobile-card-date{font-size:24px!important}",
  });
  const enlargedText = await page
    .locator(".mobile-note-card")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        width: n.clientWidth,
        scrollWidth: n.scrollWidth,
        right: n.getBoundingClientRect().right,
        children: [...n.children].map((child) => ({
          tag: child.tagName,
          width: child.clientWidth,
          scrollWidth: child.scrollWidth,
        })),
      })),
    );
  await saveJSON(resolve(output, "quick-home83-layout.json"), {
    metrics,
    clearance,
    enlargedText,
    scope: runtime.metadata,
  });
  check(
    "Two hundred percent card text remains inside narrow viewport",
    enlargedText.every((n) => n.scrollWidth <= n.width && n.right <= 320),
  );
  await page.setViewportSize(runtime.viewport);
  await reset();
  await api(page, "app.back");
  await page.waitForFunction(() =>
    window.__DEBUG_PLATFORM__.quitAcknowledgements.some((a) => a.success),
  );
  check(
    "All-gallery root Back reaches real flush and simulated successful quit without folders detour",
    await page.evaluate(() =>
      window.__DEBUG_PLATFORM__.quitAcknowledgements.some((a) => a.success),
    ),
  );
}
