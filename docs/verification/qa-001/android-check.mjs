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
const output = path.resolve("docs/verification/qa-001/android");
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
const marker = `安卓重启验证 ${new Date().toISOString()}`;
try {
  run("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  await pause(800);
  client = await connect();
  assert.equal(await client.evaluate("!!window.__TAURI_INTERNALS__"), true);
  assert.equal(
    await client.evaluate("localStorage.getItem('notes-browser-preview')"),
    null,
  );
  await visibleClick('button[aria-label="新建备忘录"]');
  await client.send("Input.insertText", {
    text: `${marker}\n中文正文重启后保留`,
  });
  await pause();
  await visibleClick('button[aria-label="核对清单"]');
  await client.send("Input.insertText", { text: "核对项目" });
  await pause();
  await visibleClick('.tiptap input[type="checkbox"]');
  await visibleClick('button[aria-label="表格"]');
  await client.evaluate(
    "(()=>{const p=document.querySelector('.tiptap td p');const r=document.createRange();r.selectNodeContents(p);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);document.querySelector('.tiptap').focus()})()",
  );
  await client.send("Input.insertText", { text: "中文表格单元格" });
  await pause(700);
  const before = (await workspace()).notes.find((n) => n.title === marker);
  assert(before, "UI input did not create persisted note title");
  assert(before.revision > 0, "No save revision");
  assert(
    flatten(before.document).some(
      (n) => n.type === "taskItem" && n.attrs.checked,
    ),
  );
  assert(flatten(before.document).some((n) => n.type === "table"));
  assert(JSON.stringify(before.document).includes("中文表格单元格"));
  await screenshot("before.png");
  await writeFile(
    path.join(output, "before.json"),
    JSON.stringify(before, null, 2),
  );
  assert.deepEqual(
    client.errors,
    [],
    "Unexpected WebView exception during input",
  );
  client.close();
  run("shell", "am", "force-stop", pkg);
  const coldStart = run(
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    `${pkg}/.MainActivity`,
  );
  await pause(800);
  client = await connect();
  const after = (await workspace()).notes.find((n) => n.id === before.id);
  assert.deepEqual(
    after,
    before,
    "Native document changed across force-stop/cold-start",
  );
  await writeFile(
    path.join(output, "after.json"),
    JSON.stringify(after, null, 2),
  );
  // Launch starts at folders; open the persisted note through both navigation levels.
  await client.evaluate(
    "[...document.querySelectorAll('.folder-group button')].find(b=>b.textContent.startsWith('全部备忘录')).click()",
  );
  await pause();
  await client.evaluate(
    `[...document.querySelectorAll('button.note-row')].find(b=>b.textContent.includes(${JSON.stringify(marker)})).click()`,
  );
  await pause();
  const displayed = await client.evaluate(
    "document.querySelector('.tiptap').editor.getJSON()",
  );
  assert.deepEqual(displayed, after.document);
  await screenshot("after.png");
  run("shell", "input", "keyevent", "4");
  await pause();
  assert.equal(
    await client.evaluate("!!document.querySelector('.app.page-notes')"),
    true,
    "Android Back did not return editor to list",
  );
  assert.deepEqual(
    client.errors,
    [],
    "Unexpected WebView exception after restart",
  );
  const result = {
    status: "pass",
    serial,
    package: pkg,
    marker,
    noteId: after.id,
    revision: after.revision,
    native: true,
    browserPreview: null,
    coldStart,
    checks: [
      "Chinese UI input",
      "checked task item",
      "Chinese table cell",
      "native document equality across force-stop",
      "reopened editor equality",
      "Android Back to list",
      "zero WebView exceptions",
    ],
  };
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  client?.close();
}
