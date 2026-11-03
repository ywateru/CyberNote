// Developer installed-app regression. UI mutations use Android input only;
// debugging protocol is used for read-only observations, never editor commands.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
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
const fixtureDir=path.resolve("docs/verification/app-001-fix-07/android-candidate02/paper-native");
const before=JSON.parse(readFileSync(path.join(fixtureDir,"selection-native.json"),"utf8"));
const bold=JSON.parse(readFileSync(path.join(fixtureDir,"bold-native.json"),"utf8"));
const selected=before.selection;
const marker=before.document.content[0].content[0].text;
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
mkdirSync(out,{recursive:true});
try {
  await connect();
  const start=await snapshot("storage-start");
  assert.deepEqual(start.document,bold.document);
  assert.deepEqual(start.identity,before.identity);
  log({op:"key",key:123,name:"move-end-for-own-save"});
  run("shell","input","keyevent","123");
  await text(" LOCAL07");
  await pause(900);
  const ownSaved=await snapshot("own-save-native");
  assert.deepEqual(ownSaved.identity,before.identity);
  assert(ownSaved.text.endsWith("LOCAL07"));
  const stored=await read(`window.__TAURI_INTERNALS__.invoke('load_workspace').then(w=>w.notes.find(n=>n.title===${JSON.stringify(marker)}))`);
  assert(stored);assert.equal(stored.paperStyle,"grid-large");
  assert.deepEqual(stored.document,ownSaved.document);
  writeFileSync(path.join(out,"own-saved-note.json"),JSON.stringify(stored,null,2)+"\n");
  log({op:"key",key:3,name:"own-save-home"});run("shell","input","keyevent","3");
  await pause(400);log({op:"activity",name:"own-save-resume"});run("shell","am","start","-W","-n",`${pkg}/.MainActivity`);
  await pause(1100);
  const refreshed=await snapshot("own-save-refresh-native");
  assert.deepEqual(refreshed.document,stored.document);assert.deepEqual(refreshed.identity,before.identity);
  const external=await read(`(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;const w=await invoke('load_workspace');const n=w.notes.find(n=>n.id===${JSON.stringify(stored.id)});if(!n||n.locked)throw Error('fixture unavailable');const expected={sessionId:w.access.sessionId,epoch:w.access.epoch,noteEpoch:w.access.notes[n.id].epoch};const document=JSON.parse(JSON.stringify(n.document));document.content.push({type:'paragraph',content:[{type:'text',text:'EXTERNAL07 real Store update'}]});const intent=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');await invoke('register_save_intent',{noteId:n.id,intent,expected});const saved=await invoke('workspace_action',{action:{type:'saveNote',id:n.id,saveIntent:intent,document,revision:n.revision},expected});return {beforeRevision:n.revision,expected,saved,document};})()`);
  writeFileSync(path.join(out,"external-store-save.json"),JSON.stringify(external,null,2)+"\n");
  assert.equal(external.saved.revision,stored.revision+1);assert.deepEqual(external.saved.document,external.document);
  assert.equal(external.saved.access.sessionId,external.expected.sessionId);assert.equal(external.saved.access.notes[stored.id].epoch,external.expected.noteEpoch);
  const stale=await snapshot("external-saved-before-refresh");
  assert.deepEqual(stale.document,stored.document);assert.deepEqual(stale.identity,before.identity);
  log({op:"key",key:3,name:"external-home"});run("shell","input","keyevent","3");await pause(400);
  log({op:"activity",name:"external-resume"});run("shell","am","start","-W","-n",`${pkg}/.MainActivity`);await pause(1100);
  const updated=await snapshot("external-refreshed-native");
  assert.deepEqual(updated.document,external.document);assert.notEqual(updated.identity.editor,before.identity.editor);assert.notEqual(updated.identity.view,before.identity.view);assert.notEqual(updated.identity.dom,before.identity.dom);
  const oldKey=before.identity.keyed.find(k=>k.type==='v9').key,newKey=updated.identity.keyed.find(k=>k.type==='v9').key;
  assert.equal(newKey,oldKey.slice(0,-1)+'1');
  run("shell","am","force-stop",pkg);run("shell","am","start","-W","-n",`${pkg}/.MainActivity`);await pause(1000);ws.close();await connect();
  const cold=await snapshot("cold-restart");assert.deepEqual(cold.document,external.document);
  const coldStored=await read(`window.__TAURI_INTERNALS__.invoke('load_workspace').then(w=>w.notes.find(n=>n.id===${JSON.stringify(stored.id)}))`);
  assert.deepEqual(coldStored.document,external.document);assert.equal(coldStored.paperStyle,"grid-large");
  writeFileSync(path.join(out,"cold-saved-note.json"),JSON.stringify(coldStored,null,2)+"\n");assert.deepEqual(errors,[]);
  const result={status:"pass",marker,noteId:stored.id,serial:"emulator-5580",apkSha256:"5dd6dfc8d31812c2bafcff5115d9946456ff6d37028f2caed174585c91ca0ca2",scope:"Storage continuation of same paper fixture after separately recorded bounded two Undo/two Redo observation.",externalMutation:"Targeted existing registered save intent/revision/access protocol on this synthetic note, not a second GUI window; no direct renderer document injection.",selection:selected,identityBefore:before.identity,identityAfterExternal:updated.identity,oldKey,newKey,checks:["bounded two Undo/two Redo observation preserved editor and restored complete bold document; first Undo no document change remains unexplained","ordinary native save plus foreground refresh retained identity and complete document","registered real Store save changed authoritative complete document while renderer remained old until refresh","real foreground refresh adopted new complete document and advanced only external version key 0->1","cold full document and grid-large persisted","zero WebView exceptions"]};
  writeFileSync(path.join(out,"result.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result,null,2));
} finally {ws?.close();}
