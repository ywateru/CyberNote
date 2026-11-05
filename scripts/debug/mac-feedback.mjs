import { resolve } from "node:path";
import { state, idle, snapshot, saveJSON } from "./runtime.mjs";

export async function runMacFeedback(runtime, { command, check, output }) {
  const page = runtime.page;
  const observations = [];
  const searchGeometry = {};
  const capture = async (name, selector = ".app") => {
    await saveJSON(
      resolve(output, name + ".snapshot.json"),
      await snapshot(page, { selector, maxChars: 42000, maxNodes: 150 }),
    );
    await page.screenshot({ path: resolve(output, name + ".png") });
  };
  const row = (id) => page.locator(`.note-row[data-note-id="${id}"]`);
  const dismiss = async () => {
    if (await page.locator(".menu-scrim").count()) {
      await page.locator(".menu-scrim").click({ position: { x: 2, y: 2 } });
      await idle(page);
    }
  };
  const menuRect = async (label, point) => {
    const rect = await page.locator(".menu-note").boundingBox();
    const viewport = page.viewportSize();
    observations.push({ label, point, rect, viewport });
    await saveJSON(resolve(output, "mac-feedback-observations.json"), {
      observations,
      pageErrors: runtime.errors,
      boundary: runtime.metadata,
    });
    check(
      label + " menu stays inside visible viewport",
      rect.x >= 8 &&
        rect.y >= 8 &&
        rect.x + rect.width <= viewport.width - 8 + 0.1 &&
        rect.y + rect.height <= viewport.height - 8 + 0.1,
    );
    if (point)
      check(
        label + " uses actual pointer position clamped by actual menu size",
        Math.abs(
          rect.x -
            Math.max(8, Math.min(point.x, viewport.width - rect.width - 8)),
        ) < 1 &&
          Math.abs(
            rect.y -
              Math.max(8, Math.min(point.y, viewport.height - rect.height - 8)),
          ) < 1,
      );
    return rect;
  };
  const rightClick = async (id, position, label) => {
    await row(id).scrollIntoViewIfNeeded();
    const rect = await row(id).boundingBox();
    await row(id).click({ button: "right", position });
    await idle(page);
    return menuRect(label, { x: rect.x + position.x, y: rect.y + position.y });
  };
  const document = (title, body) => ({
    type: "doc",
    content: [title, body].map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  });

  check(
    "Mac removes only bottom new-folder entry",
    (await page.locator('.folder-footer [aria-label="新建文件夹"]').count()) ===
      0 &&
      (await page.locator('.folder-footer [aria-label="更多设置"]').count()) ===
        1,
  );
  const footer = await page.locator(".folder-footer").boundingBox(),
    more = await page
      .locator('.folder-footer [aria-label="更多设置"]')
      .boundingBox();
  check(
    "Remaining bottom more button retains right alignment",
    footer.x + footer.width - (more.x + more.width) <= 9,
  );
  await command("folder.open");
  await command("folder.updateDraft", {
    draft: { name: "QA Feedback 77", smart: false },
  });
  await command("folder.submit");
  check(
    "Existing new-folder form still persists folder",
    (await state(page)).workspace.folders.some(
      (folder) => folder.name === "QA Feedback 77",
    ),
  );
  await command("folder.select", { id: "default" });
  await command("note.select", { id: "note-a" });
  const aBefore = (await state(page)).workspace.notes.find(
    (note) => note.id === "note-a",
  ).pinned;
  await rightClick("note-b", { x: 80, y: 25 }, "middle nonselected target");
  await capture("context-middle");
  await page.locator(".menu-note .menu-quick button").first().click();
  await idle(page);
  let s = await state(page);
  check(
    "Right-click menu pin operates on target B while editor A stays selected",
    s.selection.noteId === "note-a" &&
      s.workspace.notes.find((note) => note.id === "note-b").pinned &&
      s.workspace.notes.find((note) => note.id === "note-a").pinned === aBefore,
  );
  // Switch directly while the note menu still exists: its measured inline
  // positioning must not leak into the toolbar menu on the reused DOM node.
  await command("menu.open", { menu: "more" });
  const toolbarMenu = await page.locator(".menu-more").boundingBox();
  check(
    "Toolbar more menu retains independent top-right anchor",
    toolbarMenu.y === 52 &&
      Math.abs(
        toolbarMenu.x + toolbarMenu.width - (page.viewportSize().width - 20),
      ) < 1,
  );
  await dismiss();
  await command("menu.open", { menu: "note" });
  const fallback = await menuRect("command fallback");
  const currentRect = await row("note-a").boundingBox();
  check(
    "Command note menu clears old context and uses selected-row fallback",
    Math.abs(fallback.x - (currentRect.x + 16)) < 1 &&
      (await page
        .locator(".menu-note .menu-quick button")
        .first()
        .innerText()) === "置顶",
  );
  await dismiss();
  await row("note-a").dispatchEvent("contextmenu", {
    clientX: 0,
    clientY: 0,
    button: 2,
  });
  await idle(page);
  const keyboard = await menuRect("keyboard fallback");
  check(
    "Keyboard context event anchors to visible target card",
    Math.abs(keyboard.x - (currentRect.x + 16)) < 1,
  );
  await dismiss();

  await command("settings.update", {
    settings: { view: "gallery", sidebarWidth: 360, listWidth: 440 },
  });
  await command("sidebar.toggle");
  const gallery = await row("note-a").boundingBox();
  await rightClick(
    "note-a",
    { x: gallery.width - 3, y: gallery.height - 3 },
    "gallery and hidden sidebar",
  );
  await page.setViewportSize({ width: 710, height: 220 });
  await idle(page);
  await menuRect("resize while open");
  check(
    "Short viewport constrains actual menu height and retains scroll access",
    await page
      .locator(".menu-note")
      .evaluate(
        (element) =>
          element.scrollHeight > element.clientHeight &&
          getComputedStyle(element).overflowY === "auto",
      ),
  );
  await capture("context-resize");
  await dismiss();
  await page.setViewportSize({ width: 1280, height: 800 });
  await idle(page);
  await command("sidebar.toggle");
  await command("settings.update", {
    settings: { view: "list", sidebarWidth: 228, listWidth: 280 },
  });
  for (let i = 0; i < 10; i++) await command("note.create");
  await command("settings.update", { settings: { sort: "created" } });
  await row("note-a").scrollIntoViewIfNeeded();
  const scroll = await page
    .locator(".notes-scroll")
    .evaluate((element) => element.scrollTop);
  await rightClick("note-a", { x: 70, y: 40 }, "scrolled lower card");
  check("Scroll scenario actually changes list scroll position", scroll > 0);
  await capture("context-scrolled");
  await dismiss();
  // A real contextmenu event can carry pointer coordinates near the bottom/right
  // viewport edge even when a compact card is elsewhere (e.g. synthetic drivers).
  await row("note-a").evaluate((element) =>
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 1278,
        clientY: 798,
        button: 2,
      }),
    ),
  );
  await idle(page);
  await menuRect("bottom right edge event", { x: 1278, y: 798 });
  await capture("context-edge");
  await dismiss();
  await rightClick("note-b", { x: 45, y: 18 }, "reopen new pointer");
  await dismiss();

  await runtime.reset();
  await command("editor.setContent", {
    document: document("搜索 搜索", "开始 搜索 搜索 codex"),
  });
  await command("app.flush");
  const originalDoc = JSON.stringify(
    (await state(page)).workspace.notes.find((note) => note.id === "note-a")
      .document,
  );
  await command("search.set", { query: "搜索" });
  await command("search.find", { query: "codex" });
  check(
    "All repeated Chinese title and snippet matches are highlighted",
    (await page.locator(".note-row strong .search-match").count()) === 2 &&
      (await page.locator(".snippet-text .search-match").count()) === 2,
  );
  const styles = await page
    .locator(".search-match")
    .first()
    .evaluate((element) => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
      weight: getComputedStyle(element).fontWeight,
    }));
  check(
    "Highlight uses reference orange text without background",
    styles.color === "rgb(252, 184, 40)" &&
      styles.background === "rgba(0, 0, 0, 0)",
  );
  check(
    "In-note find query remains independent of global search highlighting",
    (await page.locator(".find-bar input").inputValue()) === "codex" &&
      (await page.locator(".search-match").allTextContents()).every(
        (text) => text === "搜索",
      ),
  );
  await capture("search-chinese-find-independent");
  await command("search.set", { query: "" });
  check(
    "Clearing global query removes all list highlights",
    (await page.locator(".note-row .search-match").count()) === 0,
  );
  check(
    "Search display never changes persisted document",
    JSON.stringify(
      (await state(page)).workspace.notes.find((note) => note.id === "note-a")
        .document,
    ) === originalDoc,
  );

  for (const [label, title, body, query, expected] of [
    [
      "ASCII case",
      "NeEdLe needle",
      "NEEDLE Needle",
      "needle",
      ["NeEdLe", "needle", "NEEDLE", "Needle"],
    ],
    [
      "literal punctuation",
      "a.*[x] a.*[x]",
      "body a.*[x]",
      "a.*[x]",
      ["a.*[x]", "a.*[x]", "a.*[x]"],
    ],
    [
      "HTML text",
      "<img> & <img>",
      "literal <img> & text",
      "<img>",
      ["<img>", "<img>", "<img>"],
    ],
    [
      "Unicode offsets after folded expansion",
      "İX İX",
      "body İX and final",
      "x",
      ["X", "X", "X"],
    ],
    [
      "Unicode expanded match",
      "İX İX",
      "body İX and final",
      "i̇",
      ["İ", "İ", "İ"],
    ],
  ]) {
    await command("search.set", { query: "" });
    await command("note.select", { id: "note-a" });
    await command("editor.setContent", { document: document(title, body) });
    await command("app.flush");
    await command("search.set", { query });
    check(
      label + " preserves original text with literal complete match ranges",
      JSON.stringify(
        await row("note-a").locator(".search-match").allTextContents(),
      ) === JSON.stringify(expected),
    );
    check(
      label + " renders text without injected elements",
      (await page
        .locator(".note-row-content img, .note-row-content script")
        .count()) === 0,
    );
  }
  await command("search.set", { query: "" });
  await command("note.select", { id: "note-a" });
  await command("editor.setContent", {
    document: document("Continuity", "甲乙搜索丙丁"),
  });
  await command("app.flush");
  const characters = async () =>
    row("note-a")
      .locator(".snippet-copy")
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT),
          chars = [];
        let node;
        while ((node = walker.nextNode())) {
          let offset = 0;
          for (const character of node.textContent) {
            const range = document.createRange();
            range.setStart(node, offset);
            offset += character.length;
            range.setEnd(node, offset);
            const rect = range.getBoundingClientRect();
            chars.push({
              character,
              x: rect.x,
              right: rect.right,
              width: rect.width,
            });
          }
        }
        return {
          text: element.textContent,
          chars,
          clip: element.getBoundingClientRect().toJSON(),
          overflow: getComputedStyle(element).textOverflow,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      });
  searchGeometry.continuityBefore = await characters();
  await command("search.set", { query: "搜索" });
  searchGeometry.continuityAfter = await characters();
  const beforeChars = searchGeometry.continuityBefore.chars,
    afterChars = searchGeometry.continuityAfter.chars;
  check(
    "Highlight preserves adjacent character positions without flex gaps",
    beforeChars.length === 6 &&
      afterChars.length === 6 &&
      afterChars.every(
        (character, index) =>
          Math.abs(
            character.x -
              afterChars[0].x -
              (beforeChars[index].x - beforeChars[0].x),
          ) < 0.1 &&
          (!index || Math.abs(character.x - afterChars[index - 1].right) < 0.1),
      ),
  );
  await capture("search-inline-continuity");

  await command("search.set", { query: "" });
  await command("editor.setContent", {
    document: document(
      "Far context",
      "很长的前文 ".repeat(120) + "远处匹配 还有远处匹配",
    ),
  });
  await command("app.flush");
  await command("search.set", { query: "远处匹配" });
  const snippet = await page.locator(".snippet-text").innerText();
  check(
    "Far body hit is visible in ellipsized context with repeated matches",
    snippet.startsWith("…") &&
      snippet.indexOf("远处匹配") < 15 &&
      (await page.locator(".snippet-text .search-match").count()) === 2,
  );
  const hitRect = await page
      .locator(".snippet-text .search-match")
      .first()
      .boundingBox(),
    snippetRect = await page.locator(".snippet-text").boundingBox();
  check(
    "First far-body hit starts within visible snippet bounds",
    hitRect.x >= snippetRect.x && hitRect.x < snippetRect.x + snippetRect.width,
  );
  await capture("search-far-context");
  await command("search.set", { query: "" });
  await command("editor.setContent", {
    document: document(
      "Narrow context",
      "上下文".repeat(80) + "搜索结尾搜索" + "后文".repeat(80),
    ),
  });
  await command("app.flush");
  await command("settings.update", { settings: { listWidth: 220 } });
  await command("search.set", { query: "搜索" });
  searchGeometry.narrow = await characters();
  const firstFullyVisible = async () =>
    row("note-a")
      .locator(".snippet-copy")
      .evaluate((element) => {
        const first = element
            .querySelector(".search-match")
            .getBoundingClientRect(),
          clip = element.getBoundingClientRect();
        return first.left >= clip.left && first.right <= clip.right + 0.1;
      });
  check(
    "At list width220 first repeated far Chinese match is fully visible",
    (await firstFullyVisible()) &&
      (await page.locator(".snippet-copy .search-match").count()) === 2 &&
      searchGeometry.narrow.text.startsWith("…搜索"),
  );
  check(
    "Highlighted single inline snippet retains real ellipsis overflow",
    searchGeometry.narrow.overflow === "ellipsis" &&
      searchGeometry.narrow.scrollWidth > searchGeometry.narrow.clientWidth,
  );
  await capture("search-narrow-220");
  await command("settings.update", { settings: { listWidth: 280 } });
  searchGeometry.wide = await characters();
  check(
    "Width220 to280 restores preceding context while keeping full first hit",
    searchGeometry.wide.text.startsWith("…上下文上下文搜索") &&
      (await firstFullyVisible()),
  );
  await capture("search-restored-280");
  await command("settings.update", { settings: { listWidth: 220 } });
  searchGeometry.narrowAgain = await characters();
  check(
    "Shrinking again recomputes first-hit visibility without stale context",
    searchGeometry.narrowAgain.text.startsWith("…搜索") &&
      (await firstFullyVisible()),
  );
  await command("settings.update", { settings: { listWidth: 280 } });
  await saveJSON(
    resolve(output, "mac-feedback-search-geometry.json"),
    searchGeometry,
  );
  await command("settings.update", { settings: { view: "gallery" } });
  check(
    "Gallery preview and caption both use safe global highlighting",
    (await page.locator(".gallery-preview .search-match").count()) === 2 &&
      (await page.locator(".snippet-text .search-match").count()) === 2,
  );
  await capture("search-gallery");
  await command("settings.update", { settings: { view: "list" } });
  await command("search.set", { query: "" });
  await command("editor.setContent", {
    document: document("Locked 搜索", "SECRET 搜索 never preview"),
  });
  await command("app.flush");
  await command("modal.open", { type: "lock" });
  await command("dom.fill", {
    selector: 'input[aria-label="密码"]',
    value: "feedback77-password",
  });
  await command("modal.submit");
  await command("search.set", { query: "搜索" });
  check(
    "Locked note keeps title highlight but never leaks body snippet",
    (await page.locator(".note-row strong .search-match").count()) === 1 &&
      (await page
        .locator(".snippet-text")
        .innerText()
        .then((text) => text.includes("已锁定") && !text.includes("SECRET"))) &&
      (await page.locator(".snippet-text .search-match").count()) === 0,
  );
  await capture("search-locked");
  await saveJSON(resolve(output, "mac-feedback-observations.json"), {
    observations,
    pageErrors: runtime.errors,
    boundary: runtime.metadata,
  });
}
