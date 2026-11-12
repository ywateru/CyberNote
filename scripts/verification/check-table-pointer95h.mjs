// Production NoteEditor/schema in real Chrome; only one mouseup is deliberately
// swallowed to model a lost upstream termination event. No user Store is used.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const before = process.argv.includes("--expect-leak");
const output = resolve(
  process.env.TABLE_POINTER_OUTPUT ||
    `artifacts/table-pointer95h/${before ? "before" : "after"}`,
);
await mkdir(output, { recursive: true });
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_CORE_PATH ||
      "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs",
  )
);
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import NoteEditor from '/src/Editor.tsx';import{CellSelection,tableEditingKey,columnResizingPluginKey}from'@tiptap/pm/tables';import{undoDepth}from'@tiptap/pm/history';
import '/src/style.css';import '/src/desktop.css';
const root=createRoot(document.getElementById('root')),p=text=>({type:'paragraph',content:text?[{type:'text',text}]:[]});
const table=(prefix,rows,cols)=>({type:'table',content:Array.from({length:rows},(_,r)=>({type:'tableRow',content:Array.from({length:cols},(_,c)=>({type:'tableCell',content:[p(prefix+r+c+' table text')]}))}))});
const documentFixture={type:'doc',content:[p('Table pointer lifecycle'),table('A',3,3),table('B',2,2),p('Paragraph text for native text selection remains editable')]};
window.rootListeners=new Map();
for(const method of ['addEventListener','removeEventListener']){const original=document[method].bind(document);document[method]=(type,listener,options)=>{if(['mouseup','mousemove','dragstart'].includes(type)){const capture=typeof options==='boolean'?options:!!options?.capture,key=type+':'+capture;const set=window.rootListeners.get(key)||new Set();if(method==='addEventListener')set.add(listener);else set.delete(listener);window.rootListeners.set(key,set);}return original(type,listener,options);};}
window.listenerCounts=()=>Object.fromEntries([...window.rootListeners].map(([key,set])=>[key,set.size]));
window.events=[];window.transactions=[];window.swallowNextMouseup=false;
for(const type of ['mousedown','mouseup','mousemove','pointercancel','blur','contextmenu'])window.addEventListener(type,event=>{
 window.events.push({type,buttons:event.buttons,button:event.button,trusted:event.isTrusted,x:event.clientX,y:event.clientY});
 if(type==='mouseup'&&window.swallowNextMouseup){window.swallowNextMouseup=false;window.events.at(-1).swallowed=true;event.stopImmediatePropagation();}
},true);
window.snapshot=()=>{const e=window.__editor,s=e.state,resize=columnResizingPluginKey.getState(s);return{selection:s.selection.toJSON(),isCell:s.selection instanceof CellSelection,tableDrag:tableEditingKey.getState(s),resize:{active:resize?.activeHandle,dragging:!!resize?.dragging},selectedPerTable:[...document.querySelectorAll('.tiptap table')].map(t=>t.querySelectorAll('.selectedCell').length),doc:e.getJSON(),undoDepth:undoDepth(s),destroyed:e.isDestroyed,listeners:window.listenerCounts()};};
window.reset=()=>{window.__editor=undefined;root.render(React.createElement('div',{className:'app desktop',style:{display:'block',height:'100vh','--ui-scale':'.78','--editor-scale':'.89','--editor-font-scale':'.89'}},React.createElement('div',{className:'editor-scroll',style:{height:'100vh',paddingTop:80}},React.createElement(NoteEditor,{key:Math.random(),note:{id:'pointer-fixture',document:documentFixture,paperStyle:'plain',revision:1},onReady:e=>{if(!e)return;window.__editor=e;e.on('transaction',({transaction:tr})=>window.transactions.push({docChanged:tr.docChanged,selection:tr.selection.toJSON(),tableMeta:tr.getMeta(tableEditingKey)}));},onChange:()=>{},onFocus:()=>{}}))));};window.reset();
`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve("artifacts/table-pointer95h/vite-cache"),
  plugins: [
    react(),
    {
      name: "table-pointer-fixture",
      resolveId: (id) => (id === "/__pointer.tsx" ? id : undefined),
      load: (id) => (id === "/__pointer.tsx" ? entry : undefined),
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
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__pointer.tsx"></script>',
      )
      .then((html) => res.end(html));
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser, page;
const checks = [],
  evidence = {},
  errors = [];
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__check`);
  await page.waitForFunction(() => window.__editor);
  const snapshot = () => page.evaluate(() => window.snapshot());
  const reset = async () => {
    await page.evaluate(() => window.reset());
    await page.waitForFunction(() => window.__editor);
    await page.waitForTimeout(80);
  };
  const point = async (index, table = 0) => {
    const b = await page
      .locator(".tiptap table")
      .nth(table)
      .locator("td")
      .nth(index)
      .boundingBox();
    return { x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 };
  };
  const move = async (index, table = 0) => {
    const p = await point(index, table);
    await page.mouse.move(p.x, p.y);
  };
  const drag = async () => {
    await move(0);
    await page.mouse.down();
    await move(1);
    await page.waitForTimeout(40);
    return snapshot();
  };
  const initial = await snapshot();
  evidence.initial = initial;
  await drag();
  await page.mouse.up();
  const released = await snapshot();
  await move(8);
  const normal = await snapshot();
  assert.deepEqual(normal.selection, released.selection);
  assert.equal(normal.tableDrag, null);
  checks.push(
    "Normal mouseup ends table drag; buttons=0 move does not extend selection",
  );
  evidence.normal = { released, afterMove: normal };
  await reset();
  const held = await drag();
  assert.ok(held.isCell);
  assert.notEqual(held.tableDrag, null);
  assert.equal(held.selectedPerTable[0], 2);
  assert.equal(held.selectedPerTable[1], 0);
  await page.evaluate(() => (window.swallowNextMouseup = true));
  await page.mouse.up();
  const lostRelease = await snapshot();
  await move(8);
  await page.waitForTimeout(40);
  const lostMove = await snapshot();
  evidence.lostMouseup = {
    held,
    lostRelease,
    afterButtonsZeroMove: lostMove,
    events: await page.evaluate(() => window.events.slice(-9)),
  };
  const lastMove = evidence.lostMouseup.events
    .filter((e) => e.type === "mousemove")
    .at(-1);
  assert.equal(lastMove.buttons, 0);
  assert.equal(lastMove.trusted, true);
  assert.ok(
    evidence.lostMouseup.events.some(
      (e) => e.type === "mouseup" && e.swallowed && e.buttons === 0,
    ),
  );
  if (before) {
    assert.notDeepEqual(lostMove.selection, lostRelease.selection);
    assert.notEqual(lostMove.tableDrag, null);
    assert.equal(lostMove.selectedPerTable[0], 9);
    checks.push(
      "Controlled lost mouseup reproduced: trusted buttons=0 movement expands CellSelection 2 -> 9, stale plugin drag remains",
    );
  } else {
    assert.deepEqual(lostMove.selection, lostRelease.selection);
    assert.equal(lostMove.tableDrag, null);
    assert.equal(lostMove.selectedPerTable[0], 2);
    checks.push(
      "Controlled lost mouseup is terminated before trusted buttons=0 move, without changing selection",
    );
  }
  assert.deepEqual(lostMove.doc, initial.doc);
  assert.equal(lostMove.undoDepth, 0);
  assert.equal(lostMove.selectedPerTable[1], 0);
  await page.screenshot({ path: resolve(output, "lost-mouseup.png") });
  if (!before) {
    await move(0, 1);
    assert.deepEqual((await snapshot()).selection, lostMove.selection);
    assert.equal((await snapshot()).selectedPerTable[1], 0);
    checks.push(
      "Released move into adjacent table leaves selection and second table untouched",
    );
    await reset();
    await move(0);
    await page.mouse.down();
    await page.evaluate(() => (window.swallowNextMouseup = true));
    await page.mouse.up();
    await move(8);
    const beforeThreshold = await snapshot();
    assert.equal(beforeThreshold.isCell, false);
    assert.equal(beforeThreshold.tableDrag, null);
    assert.equal(beforeThreshold.selectedPerTable[0], 0);
    checks.push(
      "Lost release before crossing first cell does not create CellSelection on later hover",
    );
    await reset();
    await drag();
    await page.mouse.up();
    await page.keyboard.down("Shift");
    await move(8);
    await page.mouse.down();
    const shifted = await snapshot();
    await page.mouse.up();
    await page.keyboard.up("Shift");
    assert.equal(shifted.selectedPerTable[0], 9);
    assert.equal(shifted.selectedPerTable[1], 0);
    assert.equal((await snapshot()).tableDrag, null);
    checks.push("Normal held-left and Shift cell selection remain available");
    for (const type of ["blur", "pointercancel"]) {
      await reset();
      const baseline = await snapshot();
      const active = await drag();
      await page.evaluate(
        (type) => window.dispatchEvent(new Event(type)),
        type,
      );
      const ended = await snapshot();
      await page.mouse.up();
      const released = await snapshot();
      await move(8);
      const after = await snapshot();
      assert.equal(ended.tableDrag, null);
      assert.deepEqual(after.selection, released.selection);
      assert.deepEqual(ended.listeners, baseline.listeners);
      assert.deepEqual(after.doc, initial.doc);
      assert.equal(after.undoDepth, 0);
      evidence[type] = { active, ended, after };
    }
    checks.push(
      "Window blur and pointercancel stop upstream drag and restore root listener counts without doc/history changes",
    );
    await reset();
    await drag();
    await page.evaluate(() => window.__editor.setEditable(false));
    const readonly = await snapshot();
    await page.mouse.up();
    const readonlyReleased = await snapshot();
    await move(8);
    assert.equal(readonly.tableDrag, null);
    assert.deepEqual((await snapshot()).selection, readonlyReleased.selection);
    assert.equal((await snapshot()).undoDepth, 0);
    evidence.readonly = readonly;
    checks.push(
      "Readonly transition cancels existing gesture and permits no later hover selection",
    );
    await reset();
    await drag();
    const destroyPoint = await point(8);
    await page.evaluate(() => {
      window.__editor.destroy();
    });
    const destroyed = await snapshot();
    await page.mouse.move(destroyPoint.x, destroyPoint.y);
    await page.mouse.up();
    assert.equal(destroyed.destroyed, true);
    assert.equal(destroyed.listeners["mousemove:false"], 0);
    assert.equal(destroyed.listeners["mouseup:false"], 0);
    assert.equal(destroyed.listeners["dragstart:false"], 0);
    evidence.destroyed = destroyed;
    checks.push(
      "Destroy during active drag removes upstream mouse listeners and is safe under subsequent input",
    );
    await reset();
    await page.locator(".tiptap > p").last().click();
    const textBox = await page.locator(".tiptap > p").last().boundingBox();
    await page.mouse.move(textBox.x + 10, textBox.y + textBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(textBox.x + 180, textBox.y + textBox.height / 2, {
      steps: 5,
    });
    const text = await snapshot();
    await page.mouse.up();
    assert.equal(text.selection.type, "text");
    assert.notEqual(text.selection.anchor, text.selection.head);
    assert.equal(text.tableDrag, null);
    checks.push("Native paragraph text drag remains a nonempty TextSelection");
    await reset();
    const cellBox = await page
      .locator(".tiptap table")
      .first()
      .locator("td")
      .first()
      .boundingBox();
    await page.mouse.move(
      cellBox.x + cellBox.width - 1,
      cellBox.y + cellBox.height / 2,
    );
    await page.waitForTimeout(50);
    const resizeBefore = await snapshot();
    assert.notEqual(resizeBefore.resize.active, -1);
    await page.mouse.down();
    assert.equal((await snapshot()).resize.dragging, true);
    await page.mouse.move(
      cellBox.x + cellBox.width + 30,
      cellBox.y + cellBox.height / 2,
    );
    await page.mouse.up();
    const resized = await snapshot();
    assert.equal(resized.resize.dragging, false);
    assert.equal(resized.tableDrag, null);
    assert.ok(
      resized.doc.content[1].content[0].content[0].attrs.colwidth[0] > 0,
    );
    await page.evaluate(() => window.__editor.commands.undo());
    assert.deepEqual((await snapshot()).doc, initial.doc);
    evidence.resize = { resizeBefore, resized };
    checks.push(
      "Real column resizing keeps its own gesture and width change is undoable",
    );
    await page.locator(".tiptap table").first().locator("td").first().click();
    await page.getByRole("button", { name: "选择行", exact: true }).click();
    await page.getByRole("menu", { name: "行操作", exact: true }).waitFor();
    assert.equal((await snapshot()).selectedPerTable[0], 3);
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "选择列", exact: true }).click();
    await page.getByRole("menu", { name: "列操作", exact: true }).waitFor();
    assert.equal((await snapshot()).selectedPerTable[0], 3);
    await page.keyboard.press("Escape");
    checks.push(
      "Row/column dots still select and open shared menus, with keyboard Escape",
    );
    await page
      .locator(".tiptap table")
      .first()
      .locator("td")
      .first()
      .click({ button: "right" });
    assert.ok(
      await page.evaluate(() =>
        window.events.some((e) => e.type === "contextmenu" && e.trusted),
      ),
    );
    assert.equal((await snapshot()).tableDrag, null);
    await page.keyboard.press("Escape");
    checks.push(
      "Trusted browser contextmenu event remains reachable; guard does not intercept right clicks",
    );
    await page.locator(".tiptap table").first().locator("td").first().click();
    await page.keyboard.press("ArrowRight");
    assert.equal((await snapshot()).selection.type, "text");
    assert.deepEqual((await snapshot()).doc, initial.doc);
    checks.push("Table keyboard navigation does not mutate the document");
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        passed: true,
        mode: before ? "before controlled reproduction" : "after lifecycle fix",
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        browser: browser.version(),
        checks,
        evidence,
        transactions: await page.evaluate(() => window.transactions),
        errors,
        limitation:
          "Real production NoteEditor/Chrome controlled lost event; not native Mac WebKit/AppKit reproduction.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ passed: true, output, checks }, null, 2));
} catch (error) {
  if (page)
    await page
      .screenshot({ path: resolve(output, "failure.png") })
      .catch(() => {});
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify({ error: error.stack, evidence, errors }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
