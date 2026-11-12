import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openRuntime, api, idle, state, saveJSON } from "./debug/runtime.mjs";
const output = resolve("artifacts/drawing-interactions");
await mkdir(output, { recursive: true });
const r = await openRuntime({ mobile: true });
const { page } = r;
const exports = [];
const originalCall = r.backend.call.bind(r.backend);
r.backend.call = async (command, args) => {
  if (command !== "export_drawing") return originalCall(command, args);
  r.backend.assertNote(args.noteId);
  assert.equal(args.expected.sessionId, r.backend.sessionId);
  exports.push(args);
  await writeFile(resolve(output, "exported-drawing.svg"), args.svg);
  return { ok: true, value: null };
};
const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
const initial = [
  {
    tool: "pen",
    width: 4,
    color: "#007aff",
    points: [
      [20, 30],
      [200, 100],
      [350, 45],
    ],
  },
];
const panel = page.getByRole("dialog", { name: "速绘", exact: true });
const drawing = () =>
  page.getByRole("button", { name: "编辑手绘笔迹" }).first();
const gestures = async (events) => {
  await panel.locator('svg[aria-label="绘图画布"]').evaluate((el, events) => {
    const rect = el.getBoundingClientRect();
    // Synthetic pointers use the same event pipeline. Capture is stubbed only because
    // dispatchEvent does not create a browser-level active pointer to capture.
    const capture = el.setPointerCapture;
    el.setPointerCapture = () => {};
    try {
      for (const [type, id, x, y] of events)
        el.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: id,
            pointerType: "touch",
            clientX: rect.left + x,
            clientY: rect.top + y,
            button: 0,
          }),
        );
    } finally {
      el.setPointerCapture = capture;
    }
  }, events);
};
try {
  await api(page, "folder.select", { id: "all" });
  await api(page, "note.select", { id: "note-a" });
  await api(page, "editor.setContent", {
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "速绘交互验证" }],
        },
        { type: "drawing", attrs: { strokes: initial } },
        { type: "paragraph" },
      ],
    },
  });
  await api(page, "editor.done");
  check(
    "mobile header has no inert done checkmark",
    (await page.locator(".mobile-editor-done").count()) === 0,
  );
  await drawing().tap();
  await panel.waitFor();
  check(
    "single tap opens drawing without focusing text input",
    !(await page
      .locator(".tiptap")
      .evaluate((el) => el.contains(document.activeElement))),
  );
  const before = await panel.locator("polyline").count();
  await gestures([["pointerdown", 1, 90, 150]]);
  await gestures([["pointerdown", 2, 220, 150]]);
  await gestures([
    ["pointermove", 1, 60, 160],
    ["pointermove", 2, 300, 160],
  ]);
  await gestures([
    ["pointerup", 1, 60, 160],
    ["pointermove", 2, 310, 170],
    ["pointerup", 2, 310, 170],
  ]);
  check(
    "pinch and pan leave no provisional or residual strokes",
    (await panel.locator("polyline").count()) === before,
  );
  const transform = await panel
    .locator("[data-drawing-transform]")
    .getAttribute("transform");
  const [, tx, ty, scale] =
    /translate\(([-.\d]+) ([-.\d]+)\) scale\(([-.\d]+)\)/
      .exec(transform)
      .map(Number);
  check("two finger gesture changes view scale", scale > 0.8);
  await gestures([["pointerdown", 3, 140, 200]]);
  await gestures([["pointermove", 3, 160, 220]]);
  await gestures([["pointerup", 3, 160, 220]]);
  const points = await panel.locator("polyline").last().getAttribute("points");
  const start = points.split(" ")[0].split(",").map(Number);
  check(
    "drawing coordinates invert zoom and pan",
    Math.abs(start[0] - (140 - tx) / scale) < 0.01 &&
      Math.abs(start[1] - (200 - ty) / scale) < 0.01,
  );
  await panel.getByRole("button", { name: "撤销笔画", exact: true }).tap();
  check(
    "undo removes new stroke",
    (await panel.locator("polyline").count()) === before,
  );
  await panel.getByRole("button", { name: "重做笔画", exact: true }).tap();
  await panel.getByRole("button", { name: "横线与网格", exact: true }).tap();
  await page.getByRole("menuitem", { name: "中网格", exact: true }).tap();
  check(
    "background lives inside transformed canvas",
    (await panel.locator("[data-drawing-transform] > rect").count()) === 1,
  );
  await page.screenshot({ path: resolve(output, "mobile-drawing.png") });
  await panel.getByRole("button", { name: "完成", exact: true }).tap();
  await idle(page);
  check(
    "done saves strokes and background to original note",
    (await state(page)).editorJSON.content.find((n) => n.type === "drawing")
      .attrs.strokes.length === 2 &&
      (await state(page)).workspace.notes.find((n) => n.id === "note-a")
        .paperStyle === "grid-medium",
  );
  check(
    "saving drawing keeps keyboard text focus closed",
    !(await page
      .locator(".tiptap")
      .evaluate((el) => el.contains(document.activeElement))),
  );
  await drawing().tap(); await panel.waitFor();
  await panel.getByRole("button", { name: "完成", exact: true }).tap(); await idle(page);
  await drawing().tap(); await panel.waitFor();
  check("saving identical drawing data still allows immediate single tap reentry", await panel.isVisible());
  await panel.getByRole("button", { name: "取消", exact: true }).tap();
  // A touch hold must open the shared menu and swallow its trailing click.
  await drawing().evaluate((el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        pointerId: 8,
        clientX: r.left + 30,
        clientY: r.top + 30,
        button: 0,
      }),
    );
  });
  const menu = page.getByRole("menu", { name: "速绘操作", exact: true });
  await menu.waitFor();
  await drawing().dispatchEvent("pointerup", {
    pointerId: 8,
    pointerType: "touch",
  });
  await drawing().dispatchEvent("click");
  check(
    "long press opens shared menu without editor",
    (await menu.isVisible()) && (await panel.count()) === 0,
  );
  check(
    "drawing actions have icons",
    (await menu.getByRole("menuitem").count()) === 6 &&
      (await menu.locator(".menu-icon svg").count()) === 6,
  );
  await page.screenshot({ path: resolve(output, "mobile-drawing-menu.png") });
  await menu.getByRole("menuitem", { name: "复制", exact: true }).tap();
  await idle(page);
  await drawing().click({ button: "right" });
  await menu.waitFor();
  await menu.getByRole("menuitem", { name: "粘贴", exact: true }).tap();
  await page.waitForFunction(
    () => document.querySelectorAll(".drawing-node").length === 2,
  );
  check(
    "paste retains editable vector strokes",
    (await state(page)).editorJSON.content
      .filter((n) => n.type === "drawing")
      .every((n) => n.attrs.strokes.length === 2),
  );
  await drawing().click({ button: "right" });
  await menu.waitFor();
  await menu.getByRole("menuitem", { name: "导出 SVG…", exact: true }).tap();
  await page.waitForFunction(() =>
    window.__DEBUG_PLATFORM__.calls.some((c) => c.command === "export_drawing"),
  );
  await idle(page);
  check(
    "export sends vector SVG and original owner authority through native bridge",
    exports.length === 1 &&
      exports[0].noteId === "note-a" &&
      (
        await readFile(resolve(output, "exported-drawing.svg"), "utf8")
      ).includes("<polyline"),
  );

  await drawing().tap();
  await panel.waitFor();
  await panel.getByRole("button", { name: "横线与网格", exact: true }).tap();
  await page.getByRole("menuitem", { name: "空白", exact: true }).tap();
  await panel.getByRole("button", { name: "取消", exact: true }).tap();
  check(
    "cancel discards background changes",
    (await state(page)).workspace.notes.find((n) => n.id === "note-a")
      .paperStyle === "grid-medium",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await drawing().tap();
  await panel.waitFor();
  check(
    "narrow screen has no toolbar overflow",
    await panel.evaluate(
      (el) =>
        el.scrollWidth <= 320 &&
        [...el.querySelectorAll("header button, footer button")].every((b) => {
          const r = b.getBoundingClientRect();
          return r.left >= 0 && r.right <= 320;
        }),
    ),
  );
  await page.screenshot({ path: resolve(output, "narrow-drawing.png") });
  await api(page, "app.back");
  check("Android back cancels drawing", (await panel.count()) === 0);
  await page.getByRole("button", { name: "更多", exact: true }).tap();
  check(
    "old note background entry removed",
    (await page
      .getByRole("menuitem", { name: "横线与网格", exact: true })
      .count()) === 0,
  );
  await page.keyboard.press("Escape");
  await api(page, "drawing.open"); await panel.waitFor();
  await gestures([["pointerdown", 20, 60, 120]]);
  await gestures([["pointermove", 20, 120, 140]]);
  await gestures([["pointerup", 20, 120, 140]]);
  await panel.getByRole("button", { name: "完成", exact: true }).tap(); await idle(page);
  check("new drawing uses captured insertion selection and saves", (await state(page)).editorJSON.content.filter(n => n.type === "drawing").length === 3);
  check("no uncaught page errors", r.errors.length === 0);
} finally {
  await r.cleanup();
}

const desktop = await openRuntime({ nativeToolbar: true });
try {
  const page = desktop.page;
  await api(page, "folder.select", { id: "all" });
  await api(page, "note.select", { id: "note-a" });
  await page.evaluate(async () => {
    const p = window.__DEBUG_PLATFORM__, toolbar = p.toolbarStates.at(-1);
    const entry = toolbar.menus.find(m => m.owner === "attachment").items.find(i => i.command === "addSketch");
    if (!entry.enabled) throw Error("Native drawing entry disabled");
    await p.emit("notes-ui://intent", { windowLabel: "main", bindingId: "synthetic-toolbar82", stateRevision: toolbar.revision, sequence: 100, intent: { kind: "menu", owner: "attachment", command: "addSketch" } });
  });
  const panel = page.getByRole("dialog", { name: "速绘", exact: true }); await panel.waitFor();
  check("Mac native addSketch menu routes to drawing editor", await panel.isVisible());
  check("Mac drawing header clears native toolbar", await panel.locator("header").evaluate(el => el.getBoundingClientRect().top >= 52));
  const canvas = panel.locator('svg[aria-label="绘图画布"]');
  const matrix = async () => {
    const value = await panel.locator('[data-drawing-transform]').getAttribute('transform');
    const [, x, y, scale] = /translate\(([-.\d]+) ([-.\d]+)\) scale\(([-.\d]+)\)/.exec(value).map(Number);
    return { x, y, scale };
  };
  const near = (a, b) => Math.abs(a - b) < 0.001;
  const wheel = (values) => canvas.evaluate((el, values) => {
    const box = el.getBoundingClientRect();
    return !el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: box.left + 180, clientY: box.top + 140, ...values }));
  }, values);
  const webkitGesture = (type, scale = 1) => canvas.evaluate((el, { type, scale }) => {
    const box = el.getBoundingClientRect();
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { scale: { value: scale }, clientX: { value: box.left + 180 }, clientY: { value: box.top + 140 } });
    return !el.dispatchEvent(event);
  }, { type, scale });
  const beforePan = await matrix();
  await canvas.hover(); await page.mouse.wheel(75, 45);
  await page.waitForFunction(x => {
    const transform = document.querySelector('[data-drawing-transform]').getAttribute('transform');
    return Math.abs(Number(/translate\(([-.\d]+)/.exec(transform)[1]) - x) < .001;
  }, beforePan.x - 75);
  const panned = await matrix();
  check('trackpad wheel pans both axes without scaling or scrolling the page', near(panned.x, beforePan.x - 75) && near(panned.y, beforePan.y - 45) && near(panned.scale, beforePan.scale) && await page.evaluate(() => scrollY === 0));
  check('canvas wheel listener can cancel browser page zoom', await wheel({ ctrlKey: true, deltaY: -30 }));
  const zoomed = await matrix();
  check('Ctrl+wheel pinch zooms around the gesture position', zoomed.scale > panned.scale && near((180 - zoomed.x) / zoomed.scale, (180 - panned.x) / panned.scale) && near((140 - zoomed.y) / zoomed.scale, (140 - panned.y) / panned.scale));
  await webkitGesture('gesturestart');
  await webkitGesture('gesturechange', 1.2);
  await webkitGesture('gesturechange', 1.5);
  const nativeZoom = await matrix();
  check('WKWebView pinch uses cumulative scale with a stable anchor', near(nativeZoom.scale, zoomed.scale * 1.5) && near((180 - nativeZoom.x) / nativeZoom.scale, (180 - zoomed.x) / zoomed.scale));
  await wheel({ ctrlKey: true, deltaY: -40 });
  check('WebKit pinch ignores duplicate wheel events', JSON.stringify(await matrix()) === JSON.stringify(nativeZoom));
  await webkitGesture('gestureend');
  await wheel({ deltaY: 20, deltaMode: 1 });
  check('pan resumes after WebKit pinch and normalizes line deltas', near((await matrix()).y, nativeZoom.y - 320));
  await wheel({ ctrlKey: true, deltaY: -100000 });
  check('trackpad zoom has a finite upper limit', (await matrix()).scale === 8);
  await wheel({ ctrlKey: true, deltaY: 100000 });
  check('trackpad zoom has a finite lower limit', (await matrix()).scale === .15);
  check('trackpad navigation creates no strokes or undo entries', await panel.locator('polyline').count() === 0 && await panel.getByRole('button', { name: '撤销笔画', exact: true }).isDisabled());
  const box = await canvas.boundingBox();
  const beforeStroke = await matrix();
  await page.mouse.move(box.x + 180, box.y + 140); await page.mouse.down();
  await wheel({ deltaX: 40, deltaY: 50 });
  check('trackpad navigation cannot move canvas during an active stroke', JSON.stringify(await matrix()) === JSON.stringify(beforeStroke));
  await page.mouse.move(box.x + 200, box.y + 160); await page.mouse.up();
  const start = (await panel.locator('polyline').getAttribute('points')).split(' ')[0].split(',').map(Number);
  check('drawing after trackpad transforms still uses document coordinates', near(start[0], (180 - beforeStroke.x) / beforeStroke.scale) && near(start[1], (140 - beforeStroke.y) / beforeStroke.scale));
  await panel.getByRole('button', { name: '撤销笔画', exact: true }).click();
  await wheel({ deltaY: 10 });
  check('trackpad pan preserves redo history', await panel.getByRole('button', { name: '重做笔画', exact: true }).isEnabled());
  await panel.getByRole('button', { name: '适合画布', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'desktop-trackpad.png') });
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  check("Mac cancellation restores ordinary editor", await page.locator('.tiptap').evaluate(el => el.getAttribute('contenteditable') === 'true'));
} finally { await desktop.cleanup(); }
await saveJSON(resolve(output, "result.json"), { ok: true, checks, nativeExport: "dialog and IPC simulated; vector bytes verified" });
console.log(JSON.stringify({ ok: true, checks }, null, 2));
