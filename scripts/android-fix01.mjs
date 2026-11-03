/** Installed-app regression: UI input -> Tiptap -> Rust/SQLite -> force-stop -> UI. */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";

const serial = process.env.ANDROID_SERIAL || "emulator-5580";
const adb = path.join(
  process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`,
  "platform-tools/adb",
);
const pkg = "com.local.notesclone";
const output = path.resolve("artifacts/android/fix01");
await mkdir(output, { recursive: true });
const run = (...args) =>
  execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8" });
const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
let client;
async function connect() {
  const pid = run("shell", "pidof", pkg).trim().split(" ")[0];
  run("forward", "tcp:9224", `localabstract:webview_devtools_remote_${pid}`);
  const targets = await (await fetch("http://127.0.0.1:9224/json/list")).json();
  const ws = new WebSocket(
    targets.find((t) => t.url.startsWith("http://tauri.localhost"))
      .webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const job = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(job.timer);
      if (m.error) job.reject(Error(JSON.stringify(m.error)));
      else job.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown")
      errors.push(m.params.exceptionDetails);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const callId = ++id;
      const timer = setTimeout(() => {
        pending.delete(callId);
        reject(Error(`CDP timeout: ${method}`));
      }, 10000);
      pending.set(callId, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: callId, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result?.value;
  };
  await send("Runtime.enable");
  return { send, evaluate, errors, close: () => ws.close() };
}
const visibleClick = async (selector) => {
  assert.equal(
    await client.evaluate(
      `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.getBoundingClientRect().width>0);if(!b)return false;b.click();return true})()`,
    ),
    true,
    `Missing visible ${selector}`,
  );
  await pause();
};
const workspace = () =>
  client.evaluate("window.__TAURI_INTERNALS__.invoke('load_workspace')");
const flatten = (node) => [node, ...(node.content || []).flatMap(flatten)];
const screenshot = (name) =>
  writeFile(
    path.join(output, name),
    execFileSync(adb, ["-s", serial, "exec-out", "screencap", "-p"]),
  );

const marker = `FIX01 Android ${new Date().toISOString()}`;
const ime = () =>
  /mInputShown=true/.test(run("shell", "dumpsys", "input_method"));
const snap = async (name) => {
  const state = await client.evaluate(
    `(()=>{const e=document.querySelector('.tiptap').editor;return {selection:e.state.selection.toJSON(),document:e.getJSON(),focused:e.isFocused,panel:!!document.querySelector('.mobile-format-panel'),viewport:[innerWidth,innerHeight]}})()`,
  );
  state.imeShown = ime();
  await writeFile(
    path.join(output, `${name}.json`),
    JSON.stringify(state, null, 2),
  );
  await screenshot(`${name}.png`);
  return state;
};
try {
  run("shell", "am", "force-stop", pkg);
  run("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  await pause(800);
  client = await connect();
  await visibleClick('button[aria-label="新建备忘录"]');
  await client.send("Input.insertText", { text: marker });
  // Establish a body paragraph through the production editor command; this case tests formatting, not Enter key dispatch.
  await client.evaluate(
    "document.querySelector('.tiptap').editor.commands.enter()",
  );
  await pause();
  await client.send("Input.insertText", { text: "Alpha Beta Gamma" });
  await pause(400);
  // Establish native WebView focus with an Android touch, then set the exact selection fixture.
  const inputPoint = await client.evaluate(
    "(()=>{const r=document.querySelector('.tiptap p').getBoundingClientRect();return {x:r.x+20,y:r.y+r.height/2,scale:devicePixelRatio}})()",
  );
  run(
    "shell",
    "input",
    "tap",
    String(Math.round(inputPoint.x * inputPoint.scale)),
    String(Math.round(inputPoint.y * inputPoint.scale)),
  );
  await pause(400);
  // Real production editor selection; commands are subsequently triggered through UI buttons.
  const selection = await client.evaluate(
    `(()=>{const e=document.querySelector('.tiptap').editor;let p=0;e.state.doc.descendants((n,pos)=>{if(n.isText&&n.text==='Alpha Beta Gamma')p=pos});if(!p)throw Error('Body paragraph not found');e.commands.setTextSelection({from:p+6,to:p+10});e.commands.focus();window.NotesKeyboard.show();return e.state.selection.toJSON()})()`,
  );
  await pause(600);
  const initial = await snap("keyboard-before");
  assert(ime(), "Keyboard did not show before format test");
  await visibleClick('button[aria-label="格式"]');
  await pause(500);
  const opened = await snap("format-open");
  assert(opened.panel);
  assert(!opened.imeShown);
  assert(!opened.focused);
  assert.equal(
    await client.evaluate(
      "Array.from(document.querySelectorAll('.type-styles button')).map(b=>b.textContent).join('|')",
    ),
    "标题|小标题|副标题|正文|等宽样式",
  );
  await visibleClick('.mobile-format-panel button[aria-label="粗体"]');
  const bold = await snap("format-bold");
  assert(!bold.imeShown);
  assert(!bold.focused);
  assert(bold.panel);
  assert.deepEqual(bold.selection, selection);
  assert(
    flatten(bold.document).some(
      (n) => n.text === "Beta" && n.marks?.some((m) => m.type === "bold"),
    ),
  );
  await visibleClick('button[aria-label="关闭格式"]');
  await pause(500);
  const closed = await snap("format-x");
  assert(!closed.panel);
  assert(closed.focused);
  assert(closed.imeShown);
  assert.deepEqual(closed.selection, selection);
  await visibleClick('button[aria-label="格式"]');
  await visibleClick('.mobile-format-panel button[aria-label="短划线列表"]');
  let dash = await snap("format-dash");
  assert(
    flatten(dash.document).some(
      (n) => n.type === "bulletList" && n.attrs.listStyle === "dash",
    ),
  );
  assert(!dash.imeShown);
  await visibleClick('.mobile-format-panel button[aria-label="短划线列表"]');
  await visibleClick('.mobile-format-panel button[aria-label="块引用"]');
  assert(
    await client.evaluate(
      "document.querySelector('.tiptap').editor.isActive('blockquote')",
    ),
  );
  run("shell", "input", "keyevent", "4");
  await pause(400);
  const back = await snap("format-back");
  assert(!back.panel);
  assert(!back.focused);
  assert(!back.imeShown);
  assert.equal(
    await client.evaluate(
      "document.querySelector('.app').classList.contains('page-editor')",
    ),
    true,
  );
  await visibleClick('button[aria-label="更多"]');
  assert.equal(
    await client.evaluate(
      "(()=>{const b=Array.from(document.querySelectorAll('.menu-row')).find(b=>b.textContent.includes('横线与网格'));if(!b)return false;b.click();return true})()",
    ),
    true,
  );
  await pause();
  assert.equal(
    await client.evaluate(
      "document.querySelectorAll('.paper-options button').length",
    ),
    7,
  );
  await screenshot("paper-options.png");
  await visibleClick('.paper-options button[data-paper-style="grid-medium"]');
  await visibleClick('button[aria-label="绘画"]');
  const rect = await client.evaluate(
    "(()=>{const r=document.querySelector('svg[aria-label=绘图画布]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()",
  );
  assert(
    await client.evaluate(
      "document.querySelector('.drawing-surface').classList.contains('paper-grid-medium')",
    ),
  );
  // Coordinates taken from the emulator's captured medium-grid canvas (1080 × 2280).
  run("shell", "input", "swipe", "150", "500", "450", "750", "600");
  await pause();
  await screenshot("drawing-grid-medium.png");
  assert.equal(
    await client.evaluate(
      "(()=>{const b=Array.from(document.querySelectorAll('.drawing-overlay header button')).find(b=>b.textContent==='完成');if(!b)return false;b.click();return true})()",
    ),
    true,
  );
  await pause(800);
  const before = (await workspace()).notes.find((n) => n.title === marker);
  assert(before);
  assert.equal(before.paperStyle, "grid-medium");
  assert(
    flatten(before.document).some(
      (n) => n.type === "drawing" && n.attrs.strokes.length,
    ),
  );
  await writeFile(
    path.join(output, "before.json"),
    JSON.stringify(before, null, 2),
  );
  await screenshot("drawing-saved.png");
  client.close();
  run("shell", "am", "force-stop", pkg);
  run("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  await pause(800);
  client = await connect();
  const after = (await workspace()).notes.find((n) => n.id === before.id);
  assert.deepEqual(after, before);
  await writeFile(
    path.join(output, "after.json"),
    JSON.stringify(after, null, 2),
  );
  await client.evaluate(
    "Array.from(document.querySelectorAll('.folder-group button')).find(b=>b.textContent.startsWith('全部备忘录')).click()",
  );
  await pause();
  await client.evaluate(
    `Array.from(document.querySelectorAll('button.note-row')).find(b=>b.textContent.includes(${JSON.stringify(marker)})).click()`,
  );
  await pause();
  assert.deepEqual(
    await client.evaluate("document.querySelector('.tiptap').editor.getJSON()"),
    after.document,
  );
  assert.equal(
    await client.evaluate(
      "getComputedStyle(document.querySelector('.drawing-node')).backgroundSize",
    ),
    "21px 21px, 21px 21px",
  );
  await screenshot("drawing-reopened.png");
  assert.deepEqual(client.errors, []);
  const result = {
    status: "pass",
    serial,
    marker,
    noteId: after.id,
    checks: [
      "native IME visible before format",
      "panel replaces IME",
      "saved selection bold target",
      "commands keep IME hidden",
      "X restores selection and IME",
      "dash attr persisted",
      "blockquote command",
      "Android Back closes panel, stays editor and hides IME",
      "seven paper buttons",
      "medium grid drawing touch input",
      "Rust saved doc and paper equality after force-stop",
      "reopened drawing medium-grid background",
      "zero WebView exceptions",
    ],
    selection,
  };
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  client?.close();
}
