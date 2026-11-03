// Independent finite replay adapted from frozen candidate02 regression. UI mutations use Android input only;
// debugging protocol is used for read-only observations, never editor commands.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
const out = path.resolve(
  process.env.NOTES_IME_EVIDENCE_DIR || "artifacts/android/fix01-ime",
);
const adb = "/Users/water/Library/Android/sdk/platform-tools/adb";
const pkg = "com.local.notesclone";
const paperRegression = true;
const run = (...a) =>
  execFileSync(adb, ["-s", "emulator-5580", ...a], { encoding: "utf8" });
const pause = (ms = 350) => new Promise((r) => setTimeout(r, ms));
let ws,
  seq = 0,
  jobs = new Map();
const errors = [];
async function connect() {
  const pid = run("shell", "pidof", pkg).trim().split(" ")[0];
  run("forward", "tcp:9227", `localabstract:webview_devtools_remote_${pid}`);
  const list = await (await fetch("http://127.0.0.1:9227/json/list")).json();
  const target = list.find((t) => t.url.startsWith("http://tauri.localhost"));
  if (!target) throw Error("Installed Tauri target absent");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const job = jobs.get(m.id);
      jobs.delete(m.id);
      clearTimeout(job.timer);
      m.error
        ? job.reject(Error(JSON.stringify(m.error)))
        : job.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown") errors.push(m.params);
  };
  await send("Runtime.enable");
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      jobs.delete(id);
      reject(Error(`timeout ${method}`));
    }, 10000);
    jobs.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function read(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result.value;
}
const inspect = `(()=>{const ed=document.querySelector('.tiptap'), e=ed?.editor;const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};const ids=window.__fix07Identity||(window.__fix07Identity={map:new WeakMap(),next:1});const id=o=>o&&(typeof o==='object'||typeof o==='function')?(ids.map.has(o)?ids.map.get(o):(ids.map.set(o,ids.next++),ids.map.get(o))):null;let node=ed,fiber;while(node&&!fiber){const k=Object.keys(node).find(k=>k.startsWith('__reactFiber$'));if(k)fiber=node[k];else node=node.parentElement;}let keyed=[];for(let i=0;fiber&&i<30;i++,fiber=fiber.return){if(fiber.key!==null)keyed.push({key:fiber.key,type:typeof fiber.type==='function'?fiber.type.name:(typeof fiber.type==='string'?fiber.type:String(fiber.type))});}return {identity:{editor:id(e),view:id(e?.view),dom:id(ed),keyed},url:location.href,title:document.title,app:document.querySelector('.app')?.className,active:document.activeElement?.outerHTML?.slice(0,300),viewport:[innerWidth,innerHeight,devicePixelRatio],selection:e?.state.selection.toJSON(),document:e?.getJSON(),focused:e?.isFocused,editable:e?.isEditable,paperModal:!!document.querySelector('.modal-paper'),editor:ed?rect(ed):null,toolbars:[...document.querySelectorAll('.editor-tools')].map(b=>({cls:b.className,rect:rect(b)})),formatPanel:document.querySelector('.mobile-format-panel')?rect(document.querySelector('.mobile-format-panel')):null,buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>({label:b.getAttribute('aria-label'),text:b.textContent,cls:b.className,paper:b.dataset.paperStyle,rect:rect(b)})),paper:[...document.querySelectorAll('.paper-option')].map(b=>({style:b.dataset.paperStyle,selected:b.classList.contains('selected'),rect:rect(b)})),drawings:[...document.querySelectorAll('.drawing-surface,.drawing-node')].map(b=>({cls:b.className,style:getComputedStyle(b).backgroundImage,size:getComputedStyle(b).backgroundSize,rect:rect(b)})),text:ed?.innerText,domSelection:window.getSelection()?.toString()}})()`;
async function snapshot(name) {
  const state = await read(inspect);
  state.imeShown = /mInputShown=true/.test(
    run("shell", "dumpsys", "input_method"),
  );
  state.errors = errors;
  if (name) {
    writeFileSync(
      path.join(out, `${name}.json`),
      JSON.stringify(state, null, 2) + "\n",
    );
    writeFileSync(
      path.join(out, `${name}.png`),
      execFileSync(adb, ["-s", "emulator-5580", "exec-out", "screencap", "-p"]),
    );
  }
  return state;
}

// Android 11 emulator fixture: the app's WebView starts at y=83 px below status bar.
// All mutations below use native Android input. CDP only reads DOM/editor/Rust state.
const webTop = 83;
const marker = `QA07-${Date.now()}`;
const log = (a) =>
  appendFileSync(
    path.join(out, "native-actions.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), ...a }) + "\n",
  );
const nativeTap = async (point, name) => {
  log({ op: "tap", point, name });
  run("shell", "input", "tap", ...point.map((n) => String(Math.round(n))));
  await pause(500);
};
async function tapButton(selector, name, buttonText) {
  const p = await read(
    `(()=>{const b=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.getBoundingClientRect().width>0&&(${JSON.stringify(buttonText)}===undefined||b.textContent.trim()===${JSON.stringify(buttonText)}));if(!b)throw Error('No visible button');const r=b.getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio]})()`,
  );
  p[1] += webTop;
  await nativeTap(p, name);
  return snapshot(name);
}
const text = async (value) => {
  log({ op: "text", value });
  run("shell", "input", "text", value.replaceAll(" ", "%s"));
  await pause(400);
};
const back = async (name) => {
  log({ op: "key", key: 4, name });
  run("shell", "input", "keyevent", "4");
  await pause(500);
  return snapshot(name);
};
const flat = (n) => [n, ...(n.content || []).flatMap(flat)];
const isPanel = (s) => s.buttons.some((b) => b.label === "关闭格式");
const assertPanelStructure = (s) => {
  assert(isPanel(s), "Format panel's own close button absent");
  assert.equal(
    s.toolbars.length,
    0,
    "Extra accessory toolbar above format panel",
  );
  assert(s.formatPanel, "Format panel absent");
  assert(
    Math.abs(s.formatPanel.y + s.formatPanel.h - s.viewport[1]) < 2,
    "Format panel does not meet the bottom of the viewport",
  );
};
const assertKeyboardReachable = (base, s) => {
  assert(s.imeShown, "Native IME is not displayed");
  assert(s.focused, "Editor not focused");
  assert(
    base.viewport[1] - s.viewport[1] > 100,
    "WebView did not resize above visible IME",
  );
  const b = s.buttons.find((b) => b.label === "格式");
  assert(b, "Format button absent");
  assert.equal(
    s.toolbars.length,
    1,
    "Keyboard accessory not restored exactly once",
  );
  assert(
    !s.toolbars[0].cls.includes("bottom-tools"),
    "Idle footer shown over IME",
  );
  assert(
    b.rect.y + b.rect.h <= s.viewport[1] + 1,
    "Format toolbar lies outside resized WebView",
  );
  return {
    viewportHeight: s.viewport[1],
    formatTopPhysical: Math.round(webTop + b.rect.y * s.viewport[2]),
    formatBottomPhysical: Math.round(
      webTop + (b.rect.y + b.rect.h) * s.viewport[2],
    ),
    visibleAppBottomPhysical: Math.round(
      webTop + s.viewport[1] * s.viewport[2],
    ),
  };
};
mkdirSync(out, { recursive: true });
try {
  run("shell", "am", "force-stop", pkg);
  run("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  await pause(800);
  await connect();
  const base = await snapshot("initial");
  await tapButton('button[aria-label="新建备忘录"]', "new-native");
  await text(marker);
  // Press the actual Google LatinIME Enter key shown at this coordinate in fixture screenshots.
  await nativeTap([991, 2077], "ime-enter-native");
  await text("Alpha Beta Gamma");
  let before = await snapshot("keyboard-before-native");
  const geometry = assertKeyboardReachable(base, before);
  assert(
    before.document.content.some(
      (n) =>
        n.type === "paragraph" &&
        flat(n).some((x) => x.text === "Alpha Beta Gamma"),
    ),
    "Native IME Enter did not create a body paragraph",
  );
  // Read only the word bounds, then use a native long press to select Beta.
  const word = await read(
    `(()=>{const p=Array.from(document.querySelectorAll('.tiptap p')).find(p=>p.textContent==='Alpha Beta Gamma');const t=p.firstChild,r=document.createRange();r.setStart(t,6);r.setEnd(t,10);const b=r.getBoundingClientRect();return [(b.x+b.width/2)*devicePixelRatio,(b.y+b.height/2)*devicePixelRatio]})()`,
  );
  word[1] += webTop;
  log({ op: "long-press", point: word });
  run(
    "shell",
    "input",
    "swipe",
    String(Math.round(word[0])),
    String(Math.round(word[1])),
    String(Math.round(word[0])),
    String(Math.round(word[1])),
    "650",
  );
  await pause(500);
  before = await snapshot("selection-native");
  assert.equal(before.domSelection, "Beta");
  const selected = before.selection;
  const opened = await tapButton('button[aria-label="格式"]', "format-native");
  assert(isPanel(opened), "Native touch did not open format panel");
  assertPanelStructure(opened);
  assert(!opened.imeShown, "IME overlaps format panel");
  assert(!opened.focused);
  assert.deepEqual(opened.selection, selected);
  const bold = await tapButton(
    '.mobile-format-panel button[aria-label="粗体"]',
    "bold-native",
  );
  assert(isPanel(bold));
  assertPanelStructure(bold);
  assert(!bold.imeShown);
  assert(!bold.focused);
  assert.deepEqual(bold.selection, selected);
  assert(
    flat(bold.document).some(
      (n) => n.text === "Beta" && n.marks?.some((m) => m.type === "bold"),
    ),
  );
  const x = await tapButton('button[aria-label="关闭格式"]', "x-native");
  assert(!isPanel(x));
  assert.deepEqual(x.selection, selected);
  assertKeyboardReachable(base, x);
  if (paperRegression) {
    const assertPaper = (s) => {
      assert(s.paperModal, "Paper picker absent");
      assert(!s.imeShown, "IME overlaps paper picker");
      assert(!s.focused, "Underlying editor still focused");
      assert.equal(s.editable, false, "Underlying editor not frozen");
      assert(Math.abs(s.viewport[1] - base.viewport[1]) < 2);
      assert.deepEqual(s.selection, selected);
      assert.deepEqual(s.document, bold.document);
      assert.equal(s.paper.length, 7);
      for (const p of s.paper) {
        assert(
          p.rect.y >= 0 && p.rect.y + p.rect.h <= s.viewport[1] + 1,
          `Paper option ${p.style} extends outside visible viewport`,
        );
      }
    };
    const assertReturned = (s) => {
      assert(!s.paperModal);
      assert(!s.imeShown);
      assert(!s.focused);
      assert.equal(s.editable, true);
      assert.deepEqual(s.selection, selected);
      assert.deepEqual(s.document, bold.document);
      assert(s.app.includes("page-editor"));
    };
    // Exact independent finding entry: X -> native Back -> More -> paper picker.
    const hidden = await back("paper-ime-back-native");
    assert(!hidden.imeShown);
    assert.deepEqual(hidden.selection, selected);
    await tapButton('button[aria-label="更多"]', "paper-more-native");
    const picker = await tapButton(
      "button.menu-row",
      "paper-picker-native",
      "横线与网格",
    );
    assertPaper(picker);
    const cancelled = await tapButton(
      ".modal-paper .sheet-top button",
      "paper-cancel-native",
    );
    assertReturned(cancelled);
    await tapButton('button[aria-label="更多"]', "paper-more-select-native");
    assertPaper(
      await tapButton(
        "button.menu-row",
        "paper-picker-select-native",
        "横线与网格",
      ),
    );
    const chosen = await tapButton(
      '.modal-paper [data-paper-style="grid-large"]',
      "paper-grid-large-native",
    );
    assertReturned(chosen);
    await tapButton('button[aria-label="更多"]', "paper-more-back-native");
    const reopened = await tapButton(
      "button.menu-row",
      "paper-picker-back-native",
      "横线与网格",
    );
    assertPaper(reopened);
    assert(reopened.paper.find((p) => p.style === "grid-large").selected);
    assertReturned(await back("paper-back-native"));
    await pause(1300);
    const settled = await snapshot("paper-settled-native");
    assertReturned(settled);
    assert.deepEqual(settled.identity, before.identity, "Editor/View/DOM/key changed after equivalent paper hydration");

  } else {
    const openedAgain = await tapButton(
      'button[aria-label="格式"]',
      "format-again-native",
    );
    assert(isPanel(openedAgain));
    assertPanelStructure(openedAgain);
    assert(!openedAgain.imeShown);
    const panelBack = await back("panel-back-native");
    assert(!isPanel(panelBack));
    assert(!panelBack.imeShown);
    assert(panelBack.app.includes("page-editor"));
    assert(Math.abs(panelBack.viewport[1] - base.viewport[1]) < 2);
    // Resume native editing and verify ordinary system Back hides the IME, keeping this note open.
    const ep = await read(
      `(()=>{const p=document.querySelector('.tiptap p'),r=p.getBoundingClientRect();return [(r.x+r.width-10)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio]})()`,
    );
    ep[1] += webTop;
    await nativeTap(ep, "resume-native");
    const resumed = await snapshot("keyboard-resumed-native");
    assertKeyboardReachable(base, resumed);
    const imeBack = await back("ime-back-native");
    assert(!imeBack.imeShown);
    assert(imeBack.app.includes("page-editor"));
    assert(Math.abs(imeBack.viewport[1] - base.viewport[1]) < 2);
  }
  // Do not assume one Undo removes bold: that earlier script premise is unproven.
  // Resume with one real body tap, leaving all paper assertions above unchanged.
  const resumePoint = await read(`(()=>{const p=document.querySelector('.tiptap p'),r=p.getBoundingClientRect();return [(r.x+r.width-10)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio]})()`);
  resumePoint[1]+=webTop;
  await nativeTap(resumePoint,"resume-for-own-save");
  const resumed=await snapshot("resume-for-own-save");
  assert(resumed.imeShown && resumed.focused);
  assert.deepEqual(resumed.document,bold.document);
  assert.deepEqual(resumed.identity,before.identity);
  log({op:"key",key:123,name:"move-end-for-own-save"});
  run("shell","input","keyevent","123");
  await text(" LOCAL07");
  await pause(900);
  const ownSaved = await snapshot("own-save-native");
  assert.deepEqual(ownSaved.identity, before.identity);
  assert(ownSaved.text.endsWith("LOCAL07"));
  const ownStored = await read(`window.__TAURI_INTERNALS__.invoke('load_workspace').then(w=>w.notes.find(n=>n.title===${JSON.stringify(marker)}))`);
  writeFileSync(path.join(out,"own-saved-note.json"),JSON.stringify(ownStored,null,2)+"\n");
  assert.deepEqual(ownStored.document, ownSaved.document);
  log({op:"key",key:3,name:"own-save-home"});
  run("shell","input","keyevent","3");
  await pause(400);
  log({op:"activity",name:"own-save-resume"});
  run("shell","am","start","-W","-n",`${pkg}/.MainActivity`);
  await pause(1100);
  const ownRefreshed = await snapshot("own-save-refresh-native");
  assert.deepEqual(ownRefreshed.document, ownStored.document);
  assert.deepEqual(ownRefreshed.identity, before.identity);
  const note = await read(
    `window.__TAURI_INTERNALS__.invoke('load_workspace').then(w=>w.notes.find(n=>n.title===${JSON.stringify(marker)}))`,
  );
  assert(note);
  if (paperRegression) assert.equal(note.paperStyle, "grid-large");
  assert(
    flat(note.document).some(
      (n) => n.text === "Beta" && n.marks?.some((m) => m.type === "bold"),
    ),
  );
  writeFileSync(
    path.join(out, "saved-note.json"),
    JSON.stringify(note, null, 2) + "\n",
  );
  assert.deepEqual(errors, []);
  const beforeRestart = await snapshot("before-cold-restart");
  assert.deepEqual(note.document, beforeRestart.document);
  run("shell", "am", "force-stop", pkg);
  const stopped=run("shell","sh","-c","pidof com.local.notesclone || true").trim();
  assert.equal(stopped,"");
  const coldStart=run("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  writeFileSync(path.join(out,"cold-process.json"),JSON.stringify({pidAfterForceStop:stopped,startReport:coldStart,pidAfterStart:run("shell","pidof",pkg).trim()},null,2)+"\n");
  await pause(900);
  ws.close();
  await connect();
  const cold = await snapshot("cold-restart");
  assert.deepEqual(cold.document, note.document);
  const result = {status:"pass",marker,noteId:note.id,package:pkg,serial:"emulator-5580",source:"Independent candidate02 preserved APK replay after same-AVD environment recovery",scope:"Finite native paper regression through grid-large, re-open/Back and complete saved/cold document. No other old matrix.",input:"UI actions all native Android input; runtime reads plus WeakMap identity instrumentation, no editor commands.",selection:selected,identity:before.identity,savedRevision:note.revision,checks:["cancel preserved selection","grid-large persisted","same Editor/View/DOM and actual parent React key after equivalent hydration","complete document preserved","re-open and Back preserved selection","ordinary own save and real foreground refresh kept identity/document","cold restart complete document equal","zero WebView exceptions"]};
  writeFileSync(path.join(out,"result.json"),JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result,null,2));

} finally {
  ws?.close();
  run("forward","--remove","tcp:9227");
}
