// Isolated production NoteEditor: no user notes or app database are accessed.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error(
    "Set PLAYWRIGHT_CORE_PATH and CHROME_PATH to existing browser dependencies.",
  );
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const output = resolve(process.argv[2] || "artifacts/table-controls");
await mkdir(output, { recursive: true });
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import NoteEditor from '/src/Editor.tsx';import '/src/style.css';import '/src/desktop.css';
const root=createRoot(document.getElementById('root'));
const p=text=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
window.reset=()=>{window.__changes=[];const note={id:'table-fixture',document:{type:'doc',content:[p('表格编辑'),{type:'table',content:['甲','乙'].map((v,r)=>({type:'tableRow',content:[0,1].map(c=>({type:'tableCell',content:[p(v+(c+1))]}))}))},p('表格后的正文'),{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[p('另一张表格')]}]}]},p('末尾正文')]},paperStyle:'plain',revision:1};root.render(React.createElement('div',{className:'app desktop',style:{display:'block',height:'100vh','--ui-scale':'.78','--editor-scale':'.89','--editor-font-scale':'.89'}},React.createElement('div',{className:'editor-scroll',style:{height:'100vh',paddingTop:80}},React.createElement(NoteEditor,{key:Date.now(),note,onReady:e=>window.__editor=e,onChange:(_id,doc)=>window.__changes.push(doc),onFocus:()=>{}}))));};window.reset();
`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve("artifacts/table-vite-cache"),
  plugins: [
    react(),
    {
      name: "table-check",
      resolveId: (id) => (id === "/__table.tsx" ? id : undefined),
      load: (id) => (id === "/__table.tsx" ? entry : undefined),
    },
  ],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__check") {
    res.setHeader("Content-Type", "text/html");
    vite
      .transformIndexHtml(
        req.url,
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__table.tsx"></script>',
      )
      .then((s) => res.end(s));
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 960, height: 650 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/__check`);
  await page.waitForFunction(() => window.__editor);
  const snap = () => page.evaluate(() => window.__editor.getJSON());
  const initial = await snap();
  await page.evaluate((doc) => (window.__initial = doc), initial);
  const table = page.locator(".tiptap table").first(),
    first = table.locator("td").first();
  await first.click();
  await page.getByRole("button", { name: "选择行", exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "01-handles.png") });
  await page.getByRole("button", { name: "选择列", exact: true }).click();
  await page.getByRole("button", { name: "列操作", exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "02-column-selected.png") });
  assert.deepEqual(await snap(), initial);
  await page.getByRole("menu", { name: "列操作" }).waitFor();
  assert.equal(await page.locator(".table-selection-outline.column").count(), 1);
  assert.equal(await table.locator(".selectedCell").count(), 2);
  assert.equal(await page.locator(".tiptap table").last().locator(".selectedCell").count(), 0);
  await page.screenshot({ path: resolve(output, "03-column-menu.png") });
  await page.getByRole("menuitem", { name: "在右侧添加列" }).click();
  await page.waitForFunction(
    () => window.__editor.getJSON().content[1].content[0].content.length === 3,
  );
  assert.equal((await snap()).content[3].content[0].content.length, 1);
  await page.evaluate(() => window.__editor.commands.undo());
  assert.deepEqual(await snap(), initial);
  await page.evaluate(() => window.__editor.commands.redo());
  assert.equal((await snap()).content[1].content[0].content.length, 3);
  await page.evaluate(() => window.__editor.commands.undo());
  for (const [axis, label, insert, dim] of [
    ["row", "行", "在上面添加行", "rows"],
    ["row", "行", "在下面添加行", "rows"],
    ["column", "列", "在左侧添加列", "columns"],
  ]) {
    await first.click();
    await page
      .getByRole("button", { name: "选择" + label, exact: true })
      .click();
    if (insert === "在上面添加行")
      await page.screenshot({ path: resolve(output, "04-row-menu.png") });
    await page.getByRole("menuitem", { name: insert }).click();
    const doc = await snap();
    assert.equal(
      dim === "rows"
        ? doc.content[1].content.length
        : doc.content[1].content[0].content.length,
      3,
    );
    await page.evaluate(() => window.__editor.commands.undo());
    assert.deepEqual(await snap(), initial);
  }
  for (const label of ["行", "列"]) {
    await first.click();
    await page
      .getByRole("button", { name: "选择" + label, exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "删除1" + label, exact: true })
      .click();
    const doc = await snap();
    assert.equal(
      label === "行"
        ? doc.content[1].content.length
        : doc.content[1].content[0].content.length,
      1,
    );
    await page.evaluate(() => window.__editor.commands.undo());
    assert.deepEqual(await snap(), initial);
  }
  // Keyboard menus, Escape and outside click must not edit the note.
  await first.click();
  await page.getByRole("button", { name: "选择行", exact: true }).click();
  await page.keyboard.press("End");
  assert.equal(await page.locator(":focus").textContent(), "删除1行");
  await page.keyboard.press("Escape");
  await page.getByRole("menu").waitFor({ state: "hidden" });
  assert.equal(
    await page.locator(":focus").getAttribute("aria-label"),
    "选择行",
  );
  await page.keyboard.press("Escape");
  await page.locator(".table-selection-outline").waitFor({ state: "hidden" });
  assert.deepEqual(await snap(), initial);
  await page.locator(".tiptap > p").last().click();
  await page
    .getByRole("button", { name: "选择行", exact: true })
    .waitFor({ state: "hidden" });
  // Mere hover after selection/menu dismissal must not extend CellSelection,
  // including adjacent tables with no paragraph separating them.
  const hoverOnly = async () => {
    const before = await page.evaluate(() => window.__editor.state.selection.toJSON());
    for (const cell of await page.locator(".tiptap td").all()) {
      await cell.hover();
      const box = await cell.boundingBox();
      await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
      assert.deepEqual(await page.evaluate(() => window.__editor.state.selection.toJSON()), before);
      assert.equal(await page.locator(".selectedCell").count(), 0);
    }
  };
  await hoverOnly();
  await page.evaluate(() => {
    const doc = structuredClone(window.__initial);
    doc.content.splice(2, 1);
    window.__editor.commands.setContent(doc);
    window.__editor.commands.setTextSelection(1);
  });
  await hoverOnly();
  await page.screenshot({path: resolve(output, "hover-adjacent-tables.png")});
  await page.evaluate(() => window.__editor.commands.setContent(window.__initial));
  // Switching table, deleting the last row, and Undo preserve surrounding content.
  await page.locator(".tiptap table").last().locator("td").click();
  await page.getByRole("button", { name: "选择行", exact: true }).click();
  await page.getByRole("menuitem", { name: "删除1行", exact: true }).click();
  assert.equal(await page.locator(".tiptap table").count(), 1);
  await page.evaluate(() => window.__editor.commands.undo());
  assert.deepEqual(await snap(), initial);
  // Geometry follows editor scroll and font changes.
  await page.evaluate(
    () =>
      (document.querySelector(".note-document").style.paddingBottom = "800px"),
  );
  await first.click();
  // Undo/focus can schedule a scroll into view. Measure the actual starting
  // offset after those frames rather than assuming it is still zero.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const scrollBefore = await page
    .locator(".editor-scroll")
    .evaluate((e) => e.scrollTop);
  const before = await page
    .getByRole("button", { name: "选择列", exact: true })
    .boundingBox();
  await page.evaluate(() => {
    document.querySelector(".editor-scroll").scrollTop += 40;
  });
  await page.waitForTimeout(60);
  const after = await page
    .getByRole("button", { name: "选择列", exact: true })
    .boundingBox();
  const scrollAfter = await page
    .locator(".editor-scroll")
    .evaluate((e) => e.scrollTop);
  assert.ok(scrollAfter > scrollBefore);
  assert.ok(Math.abs(before.y - after.y - (scrollAfter - scrollBefore)) < 1);
  for (const [name, scale] of [
    ["tiny", 0.67],
    ["small", 0.78],
    ["medium", 0.89],
    ["large", 1],
    ["huge", 1.11],
  ]) {
    await page.evaluate((s) => {
      document
        .querySelector(".app")
        .style.setProperty("--editor-font-scale", s);
      document.querySelector(".app").style.setProperty("--editor-scale", s);
    }, String(scale));
    await first.click();
    await page.getByRole("button", { name: "选择行", exact: true }).click();
    await page.screenshot({ path: resolve(output, "size-" + name + ".png") });
    const bounds = await page.evaluate(() => {
      const a = document
          .querySelector(".table-selection-outline")
          .getBoundingClientRect(),
        b = document.querySelector(".tiptap td").getBoundingClientRect();
      return {
        a: { y: a.y, height: a.height },
        b: { y: b.y, height: b.height },
      };
    });
    assert.ok(
      Math.abs(bounds.a.y - bounds.b.y) < 1 &&
        Math.abs(bounds.a.height - bounds.b.height) < 1,
    );
  }

  // Merged imported cells select their complete logical column span.
  await page.evaluate(() => {
    const p = (t) => ({
      type: "paragraph",
      content: [{ type: "text", text: t }],
    });
    window.__editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 2 },
                  content: [p("合并单元格")],
                },
                { type: "tableCell", content: [p("右侧")] },
              ],
            },
            {
              type: "tableRow",
              content: [0, 1, 2].map((i) => ({
                type: "tableCell",
                content: [p(String(i))],
              })),
            },
          ],
        },
        p("保留正文"),
      ],
    });
    document.querySelector(".editor-scroll").scrollTop = 0;
  });
  const merged = await snap();
  await first.click();
  await page.getByRole("button", { name: "选择列", exact: true }).click();
  await page.getByRole("menuitem", { name: "删除2列", exact: true }).click();
  assert.equal((await snap()).content[0].content[0].content.length, 1);
  await page.evaluate(() => window.__editor.commands.undo());
  assert.deepEqual(await snap(), merged);
  await page.evaluate(() =>
    window.__editor.commands.setContent(window.__initial),
  );
  await page.evaluate(() => window.__editor.setEditable(false));
  await page.mouse.click(900, 600);
  await page
    .getByRole("button", { name: "选择行", exact: true })
    .waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  assert.deepEqual(await snap(), initial);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "real production editor and table commands",
          "handles and amber row/column outline",
          "all four insertion positions",
          "row/column deletion and last-row table removal",
          "single Undo/Redo and preservation of other content/tables",
          "keyboard menu navigation and Escape",
          "table switching and paragraph dismissal",
          "scroll geometry and five font sizes",
          "read-only controls hidden",
          "merged-column span selection and deletion",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Table control integration checks passed");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
