// Real App integration; native intent transport is simulated, not AppKit/WebKit.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state } from "./debug/runtime.mjs";
const output = resolve("artifacts/table95/app");
await mkdir(output, { recursive: true });
const p = (text) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});
const fixture = {
  type: "doc",
  content: [p("之前"), p("甲\t乙"), p("丙\t"), p("之后")],
};
const results = [];
for (const nativeToolbar of [false, true]) {
  const runtime = await openRuntime({ nativeToolbar });
  const { page } = runtime;
  const doc = async () => (await state(page)).editorJSON;
  try {
    await api(page, "folder.select", { id: "all" });
    await api(page, "note.select", { id: "note-a" });
    await api(page, "editor.setContent", { document: fixture });
    await api(page, "app.flush");
    await idle(page);
    // Native DOM Range generates the production editor selectionchange path.
    await page.evaluate(() => {
      document.querySelector(".tiptap").focus();
      const paragraphs = document.querySelectorAll(".tiptap > p");
      const range = document.createRange();
      range.setStart(paragraphs[1].firstChild, 0);
      range.setEnd(paragraphs[2].firstChild, 2);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    assert.equal(
      await page.evaluate(() =>
        window.getSelection()?.toString().replace(/\n+/g, "\n"),
      ),
      "甲\t乙\n丙\t",
    );
    await page.waitForFunction(async () => {
      const s = (await window.__NOTES_DEBUG__.execute("app.state")).result;
      return s.editorSelection?.from === 5 && s.editorSelection?.to === 12;
    });
    if (nativeToolbar) {
      await page.waitForFunction(() =>
        window.__DEBUG_PLATFORM__.toolbarStates
          .at(-1)
          ?.menus.some(
            (m) =>
              m.owner === "table" &&
              m.items.some(
                (i) => i.command === "convertTextToTable" && i.enabled,
              ),
          ),
      );
      await page.evaluate(() => {
        const revision =
          window.__DEBUG_PLATFORM__.toolbarStates.at(-1).revision;
        window.__DEBUG_PLATFORM__.emit("notes-ui://intent", {
          windowLabel: "main",
          bindingId: "synthetic-toolbar82",
          stateRevision: revision,
          sequence: 1,
          intent: {
            kind: "menu",
            owner: "table",
            command: "convertTextToTable",
          },
        });
      });
    } else {
      await page.getByRole("button", { name: "表格", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "将所选文字转换为表格", exact: true })
        .click();
    }
    await page.locator(".tiptap table").waitFor();
    await idle(page);
    const converted = await doc();
    assert.equal(converted.content[1].type, "table");
    assert.equal(converted.content[1].content.length, 2);
    assert.equal(converted.content[1].content[1].content.length, 2);
    assert.equal(converted.content[0].content[0].text, "之前");
    assert.equal(converted.content.at(-1).content[0].text, "之后");
    await api(page, "editor.undo");
    assert.deepEqual(await doc(), fixture);
    await api(page, "editor.redo");
    assert.deepEqual(await doc(), converted);
    await api(page, "app.flush");
    assert.deepEqual(
      runtime.backend.workspace.notes.find((n) => n.id === "note-a").document,
      converted,
    );
    await page.screenshot({
      path: resolve(
        output,
        nativeToolbar ? "native-intent.png" : "web-menu.png",
      ),
    });
    // Production table-to-text menu then immediate inverse preserves exact structure.
    await page.locator(".tiptap td").first().click();
    await api(page, "editor.table", { action: "convertToText" });
    await api(page, "editor.table", { action: "convertToTable" });
    assert.deepEqual(await doc(), converted);
    await api(page, "app.flush");
    await page.reload();
    await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
    await idle(page);
    assert.deepEqual(await doc(), converted);
    if (nativeToolbar) {
      const oldRevision = await page.evaluate(
        () => window.__DEBUG_PLATFORM__.toolbarStates.at(-1).revision,
      );
      await api(page, "note.select", { id: "note-b" });
      await idle(page);
      const untouched = await doc();
      await page.evaluate(
        (revision) =>
          window.__DEBUG_PLATFORM__.emit("notes-ui://intent", {
            windowLabel: "main",
            bindingId: "synthetic-toolbar82",
            stateRevision: revision,
            sequence: 2,
            intent: {
              kind: "menu",
              owner: "table",
              command: "convertTextToTable",
            },
          }),
        oldRevision,
      );
      await idle(page);
      assert.deepEqual(await doc(), untouched);
    }
    // Actual lock flow revokes editing, including table conversion commands.
    await api(page, "modal.open", {
      type: "lock",
      value: "table-fixture-secret",
    });
    await api(page, "modal.submit");
    await idle(page);
    const locked = (await state(page)).workspace.notes.find(
      (n) => n.id === (nativeToolbar ? "note-b" : "note-a"),
    );
    assert.equal(locked.locked, true);
    await assert.rejects(() =>
      api(page, "editor.table", { action: "convertToTable" }),
    );
    assert.deepEqual(runtime.errors, []);
    results.push({
      path: nativeToolbar ? "native intent (synthetic IPC)" : "Web toolbar",
      passed: true,
      checks: [
        "DOM range selection",
        "conversion menu capability",
        "surrounding text and empty cell",
        "single Undo/Redo",
        "save ACK and reload",
        "exact immediate roundtrip",
        "locked editor rejects conversion",
        ...(nativeToolbar ? ["stale intent after navigation rejected"] : []),
      ],
    });
  } catch (error) {
    await page.screenshot({
      path: resolve(
        output,
        nativeToolbar ? "native-failure.png" : "web-failure.png",
      ),
    });
    throw error;
  } finally {
    await runtime.cleanup();
  }
}
await writeFile(
  resolve(output, "result.json"),
  JSON.stringify(
    {
      results,
      limitation:
        "Chrome + isolated fixture backend. AppKit menu tracking/WebKit hover require final Mac package verification.",
    },
    null,
    2,
  ),
);
console.log(
  "TABLE95 App Web/native-intent conversion, history and persistence passed",
);
