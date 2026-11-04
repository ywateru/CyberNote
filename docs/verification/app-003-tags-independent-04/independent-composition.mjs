// Real production App/Editor/queue, controlled DOM composition, exact existing
// Rust Store CLI. Only preview action and access event transports are adapted.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const root = process.cwd(),
  out = resolve(process.argv[2] || "artifacts/tags-composition/run01");
const binary = process.env.NOTES_TAG_STORE_BINARY;
assert.ok(binary, "Use the existing reviewed Store binary, without compiling.");
const guard = async () => {
  const d = await statfs(root);
  assert.ok(d.bavail * d.bsize >= 2 * 1024 ** 3, "free space below 2 GiB");
};
await guard();
await mkdir(out, { recursive: true });
const binaryHash = createHash("sha256")
  .update(await readFile(binary))
  .digest("hex");
assert.equal(
  binaryHash,
  "f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf",
);
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH)
);
const records = [],
  results = [],
  errors = [];
let activeStore,
  context,
  origin,
  browser,
  entryLoaded = false,
  actionInjected = false,
  accessInjected = false;
function store(action) {
  const p = spawnSync(binary, [activeStore], {
    input: JSON.stringify(action),
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(p.status, 0, p.stderr);
  const response = JSON.parse(p.stdout);
  records.push({ store: activeStore, action, response });
  return response;
}
function must(a) {
  const r = store(a);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
}
const tag = (name) => ({ type: "noteTag", attrs: { name } });
const doc = (suffix) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "#独", marks: [tag("独审"), { type: "bold" }] },
        { type: "text", text: "审", marks: [tag("独审"), { type: "italic" }] },
        { type: "text", text: " " + (suffix || "A") },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "保持格式", marks: [{ type: "bold" }] }],
    },
  ],
});
const entry =
  "import React from'react';import{createRoot}from'react-dom/client';import App from'/src/App.tsx';import{documentTags}from'/src/note-tags.ts';import{editorSaveSnapshot}from'/src/editor-save-snapshot.ts';import{accessGate}from'/src/bridge.ts';import{TagComposition}from'/src/tag-composition.ts';import'/src/style.css';window.api={documentTags,editorSaveSnapshot,accessGate,TagComposition};window.mount=()=>createRoot(document.getElementById('root')).render(React.createElement(App));";
const actionInjection = `  if (!native) { const result=await fetch('/__store-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a)}).then(r=>r.json()); ((window as any).__storeResults ||= []).push({action:a,result}); if(!result.ok)throw result.error; const latest=await fetch('/__store-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'__workspace'})}).then(r=>r.json()); if(!latest.ok)throw latest.error; preview=latest.value; persist(); return result.value as T; }\n`;
const accessInjection = `  if (!native) { const receive=(event:Event)=>{const payload=(event as CustomEvent<AccessEvent>).detail;accessGate.invalidate(payload.access);handler(payload);};window.addEventListener('__controlled-access',receive);return()=>window.removeEventListener('__controlled-access',receive); }`;
const vite = await createViteServer({
  root,
  configFile: false,
  cacheDir: resolve("artifacts/tags-browser-cache"),
  plugins: [
    {
      name: "composition-transport-only",
      enforce: "pre",
      resolveId(id) {
        if (id === "/__composition.tsx") return id;
      },
      load(id) {
        if (id === "/__composition.tsx") {
          entryLoaded = true;
          return entry;
        }
      },
      transform(code, id) {
        if (id === resolve("src/bridge.ts")) {
          const needle = "): Promise<T> {\n  if (native) {";
          assert.equal(code.split(needle).length, 2);
          code = code.replace(
            needle,
            "): Promise<T> {\n" + actionInjection + "  if (native) {",
          );
          actionInjected = true;
          const access = "  if (!native) return () => {};";
          assert.equal(code.split(access).length, 2);
          code = code.replace(access, accessInjection);
          accessInjected = true;
          return { code, map: null };
        }
      },
    },
    react(),
  ],
  server: { middlewareMode: true, hmr: { host: "127.0.0.1", port: 0 } },
  appType: "custom",
});
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/__store-action") {
      let body = "";
      for await (const c of req) body += c;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(store(JSON.parse(body))));
    } else if (req.url === "/__check") {
      res.setHeader("content-type", "text/html");
      res.end(
        await vite.transformIndexHtml(
          req.url,
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__composition.tsx"></script>',
        ),
      );
    } else vite.middlewares(req, res);
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e) }));
  }
});
async function snapshot(page) {
  return page.evaluate(() => {
    const e = window.probe,
      host = e.view.dom.closest(".editor-scroll"),
      sel = getSelection();
    return {
      html: e.view.dom.innerHTML,
      raw: e.getJSON(),
      legal: window.api.editorSaveSnapshot(e.getJSON()),
      selection: e.state.selection.toJSON(),
      domSelection: {
        anchorText: sel?.anchorNode?.textContent,
        anchorOffset: sel?.anchorOffset,
        focusText: sel?.focusNode?.textContent,
        focusOffset: sel?.focusOffset,
        inside: !!sel?.anchorNode && e.view.dom.contains(sel.anchorNode),
      },
      composing: e.view.composing,
      focused: e.isFocused,
      hasFocus: e.view.hasFocus(),
      editable: e.isEditable,
      contentEditable: e.view.dom.contentEditable,
      hidden: host.hidden,
      inert: host.inert,
      alive: !e.isDestroyed,
      same: window.probeDom === e.view.dom,
      events: window.events,
      rows: [...document.querySelectorAll(".note-row")].map(
        (x) => x.textContent,
      ),
      tags: document.querySelector(".tag-browser")?.textContent,
      bodyText: document.body.innerText,
      storeResults: window.__storeResults || [],
    };
  });
}
const stored = (id) =>
  must({ type: "__workspace" }).notes.find((n) => n.id === id);
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector(".save-status"));
}
async function waitText(page, id, text) {
  await page.waitForFunction(
    ({ id, text }) =>
      window.__storeResults?.some(
        (x) =>
          x.action.type === "saveNote" &&
          x.action.id === id &&
          (() => {
            const walk = (n) =>
              (n.text || "") + (n.content || []).map(walk).join("");
            return walk(x.action.document).includes(text);
          })(),
      ),
    { id, text },
  );
  await settle(page);
  assert.ok(stored(id).plainText.includes(text));
}
async function begin(
  name,
  { multiple = false, all = false, selection = 3 } = {},
) {
  await guard();
  await context?.close();
  activeStore = resolve(out, "stores", name);
  await mkdir(activeStore, { recursive: true });
  const n = must({ type: "createNote" });
  must({ type: "saveNote", id: n.id, revision: 0, document: doc() });
  let other;
  if (multiple) {
    other = must({ type: "createNote" });
    must({
      type: "saveNote",
      id: other.id,
      revision: 0,
      document: doc("Other"),
    });
  }
  const ws = must({ type: "__workspace" });
  ws.settings = {
    ...ws.settings,
    selectedFolder: "default",
    selectedNote: n.id,
  };
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/*", (r) =>
    r.request().url().startsWith(origin) ||
    r.request().url().startsWith("data:")
      ? r.continue()
      : r.abort(),
  );
  await page.goto(origin + "/__check");
  await page.waitForFunction(() => window.mount);
  await page.evaluate(
    (ws) => localStorage.setItem("notes-browser-preview", JSON.stringify(ws)),
    ws,
  );
  await page.reload();
  await page.waitForFunction(() => window.mount);
  await page.evaluate(() => window.mount());
  await page.waitForFunction(() => document.querySelector(".tiptap")?.editor);
  await page
    .getByRole("button", { name: all ? "所有标签" : "#独审", exact: true })
    .click();
  await page.locator(".tiptap:visible").click();
  await page.evaluate((selection) => {
    const e = [...document.querySelectorAll(".tiptap")].find(
      (x) => !x.closest(".editor-scroll").hidden,
    ).editor;
    window.probe = e;
    window.probeDom = e.view.dom;
    window.events = [];
    for (const type of [
      "compositionstart",
      "compositionupdate",
      "compositionend",
      "blur",
      "focus",
      "beforeinput",
      "input",
    ])
      e.view.dom.addEventListener(
        type,
        (ev) =>
          window.events.push({
            type: ev.type,
            trusted: ev.isTrusted,
            data: ev.data,
            inputType: ev.inputType,
            isComposing: ev.isComposing,
            composing: e.view.composing,
            editable: e.isEditable,
          }),
        true,
      );
    e.commands.setTextSelection(selection);
  }, selection);
  return { page, n, other };
}
async function start(page, text = "变") {
  await page.evaluate(() =>
    window.probe.view.dom.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    ),
  );
  assert.equal((await snapshot(page)).composing, true);
  await page.keyboard.insertText(text);
}
async function end(page, text, waitForActualEnd = true) {
  await page.evaluate(
    (text) =>
      window.probe.view.dom.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: text }),
      ),
    text,
  );
  if (waitForActualEnd)
    await page.waitForFunction(() => !window.probe.view.composing);
}
async function select(page, from, to) {
  await page.evaluate(
    ({ from, to }) => window.probe.commands.setTextSelection({ from, to }),
    { from, to },
  );
}
function active(s) {
  assert.equal(s.alive, true);
  assert.equal(s.same, true);
  assert.equal(s.hidden, false);
  assert.equal(s.inert, false);
  assert.equal(s.editable, true);
  assert.equal(s.focused, true);
  assert.equal(s.hasFocus, true);
  assert.equal(
    s.events.some((e) => e.type === "blur" && e.trusted),
    false,
  );
}
async function parked(page) {
  await page.waitForFunction(
    () =>
      window.probe.view.dom.closest(".editor-scroll").hidden &&
      !window.probe.isEditable,
  );
  const s = await snapshot(page);
  assert.equal(s.hidden, true);
  assert.equal(s.inert, true);
  assert.equal(s.editable, false);
  assert.equal(s.focused, false);
  return s;
}
async function noWrite(page, id) {
  const before = stored(id);
  await page.keyboard.insertText("禁止旧目标");
  await settle(page);
  assert.deepEqual(stored(id), before);
  return before;
}
async function observers(page) {
 const cdp=await context.newCDPSession(page);
 const proto=await cdp.send('Runtime.evaluate',{expression:'window.api.TagComposition.prototype'});
 const objects=await cdp.send('Runtime.queryObjects',{prototypeObjectId:proto.result.objectId});
 const result=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objects.objectId,functionDeclaration:'function(){return Array.from(this).map(x=>({sameEditor:x.editor===window.probe,pending:x.pending,cycle:x.cycle,from:x.from,to:x.to,finalText:x.finalText,finishedTransaction:x.finishedTransaction,rangeText:x.editor.state.doc.textBetween(x.from,x.to)}))}',returnByValue:true});
 return result.result.value;
}
async function run(name, body) {
  const r = { name, stages: [] };
  results.push(r);
  try {
    await body(r);
    r.pass = true;
  } catch (e) {
    r.pass = false;
    r.error = String(e.stack || e);
    try {const p=context.pages().at(-1);r.failureSnapshot=await snapshot(p);r.failureObservers=await observers(p);r.failureWorkspace=must({type:'__workspace'});}catch(observationError){r.observationError=String(observationError);}
    throw e;
  } finally {
    await writeFile(
      resolve(out, "progress.json"),
      JSON.stringify({ results, errors }, null, 2) + "\n",
    );
  }
}
try {
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  await guard();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--disk-cache-size=1048576", "--media-cache-size=1048576"],
  });

  await run('independent02-last-reference-repro-now-retained', async r => {
    const {page,n}=await begin(r.name);
    r.stages.push({before:await snapshot(page)});
    await start(page,'变');
    const immediate=await snapshot(page);
    await waitText(page,n.id,'变');
    const acked=await snapshot(page);
    active(acked);assert.equal(acked.composing,true);assert.deepEqual(acked.rows,[]);
    assert.equal(acked.tags.includes('#独审'),false);
    for(const key of ['raw','selection','domSelection','html'])assert.deepEqual(acked[key],immediate[key]);
    assert.deepEqual(stored(n.id).document,acked.legal);
    await page.keyboard.insertText('续');await waitText(page,n.id,'变续');
    const continued=await snapshot(page);active(continued);assert.equal(continued.composing,true);
    r.stages.push({immediate,acked,continued,stored:stored(n.id)});
    await end(page,'变续');r.stages.push({ended:await parked(page),stored:stored(n.id)});
    await noWrite(page,n.id);
  });
  // Browser-engine composition events through Playwright's CDP session, not
  // synthetic DOM dispatch. This still does not represent any operating-system IME.
  await run('engine-composition-multiple-candidates-and-commit', async r => {
    const {page,n}=await begin(r.name);
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'bian',selectionStart:4,selectionEnd:4});
    await waitText(page,n.id,'bian');active(await snapshot(page));
    await cdp.send('Input.imeSetComposition',{text:'变化',selectionStart:2,selectionEnd:2});
    await waitText(page,n.id,'变化');active(await snapshot(page));
    r.stages.push({during:await snapshot(page),stored:stored(n.id)});
    await cdp.send('Input.insertText',{text:'最终'});
    await waitText(page,n.id,'最终');r.stages.push({ended:await parked(page),stored:stored(n.id),observers:await observers(page)});
    const before=stored(n.id);await page.keyboard.insertText('ENDED-ORDINARY');await settle(page);assert.deepEqual(stored(n.id),before);
    await noWrite(page,n.id);
  });
  await run('engine-composition-selected-range-cancel', async r => {
    const {page,n}=await begin(r.name,{selection:{from:2,to:4}});
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'候选',selectionStart:2,selectionEnd:2});
    await waitText(page,n.id,'候选');active(await snapshot(page));
    r.stages.push({during:await snapshot(page)});
    await cdp.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});
    await settle(page);await page.waitForFunction(()=>!window.probe.view.composing);
    const after=await snapshot(page);r.stages.push({after,stored:stored(n.id)});
    if(after.rows.length===0) {assert.equal(after.hidden,true);assert.equal(after.editable,false);await noWrite(page,n.id);}
    else {active(after);assert.equal(stored(n.id).plainText.includes('#独审'),true);}
  });
  await run('end-before-final-empty-replacement', async r => {
    const {page,n}=await begin(r.name,{selection:{from:2,to:4}});
    await start(page,'候选');await waitText(page,n.id,'候选');
    await end(page,'');const beforeDeletion=await snapshot(page);active(beforeDeletion);assert.equal(beforeDeletion.composing,false);
    await select(page,2,4);await page.keyboard.press('Backspace');await settle(page);
    r.stages.push({beforeDeletion,after:await parked(page),stored:stored(n.id)});
    assert.equal(stored(n.id).plainText.split('\n')[0],'# A');
  });
  await run('end-before-final-surrogate-and-combining-replacement', async r => {
    const {page,n}=await begin(r.name);
    await start(page,'候');await waitText(page,n.id,'候');
    await end(page,'🧪e\u0301');active(await snapshot(page));
    await select(page,3,4);await page.keyboard.insertText('🧪e\u0301');
    await waitText(page,n.id,'🧪e\u0301');
    r.stages.push({after:await parked(page),stored:stored(n.id)});
  });
  await run('multiple-results-real-continuation-does-not-retarget', async r => {
    const {page,n,other}=await begin(r.name,{multiple:true,all:true});const otherBefore=stored(other.id);
    await start(page,'改');await waitText(page,n.id,'改');
    const during=await snapshot(page);active(during);assert.equal(during.rows.length,1);assert.equal(during.rows[0].includes('Other'),true);
    await page.keyboard.insertText('续');await waitText(page,n.id,'改续');assert.deepEqual(stored(other.id),otherBefore);
    r.stages.push({during,continued:await snapshot(page)});
    await end(page,'改续');r.stages.push({after:await parked(page)});assert.deepEqual(stored(other.id),otherBefore);
  });
  await run('ordinary-edit-and-explicit-other-note-old-end', async r => {
    const {page,n,other}=await begin(r.name,{multiple:true});
    await start(page,'改');await waitText(page,n.id,'改');active(await snapshot(page));
    await page.locator('.note-row').filter({hasText:'Other'}).click();
    const old=await parked(page),oldStored=stored(n.id);
    await page.locator('.tiptap:visible').click();await page.keyboard.insertText('NEW-OWNER');await waitText(page,other.id,'NEW-OWNER');
    const otherStored=stored(other.id);
    await end(page,'改',false);await settle(page);const after=await snapshot(page);
    assert.equal(after.hidden,true);assert.equal(after.editable,false);assert.deepEqual(stored(n.id),oldStored);assert.deepEqual(stored(other.id),otherStored);
    r.stages.push({old,after,oldStored,otherStored});
  });
  await run('prepare-immediate-freeze-and-abort-does-not-revive', async r => {
    const {page,n}=await begin(r.name);await start(page,'改');await waitText(page,n.id,'改');active(await snapshot(page));
    const immediate=await page.evaluate(id=>{
      const access=structuredClone(window.api.accessGate.state);access.operationId='independent03';access.suspended=[id];window.savedAccess=structuredClone(access);
      window.dispatchEvent(new CustomEvent('__controlled-access',{detail:{phase:'prepare',operationId:'independent03',noteIds:[id],access}}));
      return{editable:window.probe.isEditable,composing:window.probe.view.composing};
    },n.id);assert.equal(immediate.editable,false);
    await page.locator('.access-cover').waitFor();const covered=await snapshot(page);assert.equal(covered.tags.includes('#独审'),false);
    const saved=stored(n.id);await page.keyboard.insertText('BLOCKED');await settle(page);assert.deepEqual(stored(n.id),saved);
    await page.evaluate(id=>{const access=structuredClone(window.savedAccess);access.operationId=null;access.suspended=[];window.dispatchEvent(new CustomEvent('__controlled-access',{detail:{phase:'abort',operationId:'independent03',noteIds:[id],access}}));},n.id);
    await page.locator('.access-cover').waitFor({state:'hidden'});await settle(page);const aborted=await parked(page);assert.equal(aborted.focused,false);
    await end(page,'改',false);await noWrite(page,n.id);assert.equal((await snapshot(page)).hidden,true);
    r.stages.push({immediate,covered,aborted,saved});
  });

  await run('ordinary-no-composition-immediate-parking',async r=>{
    const {page,n}=await begin(r.name);await page.keyboard.insertText('普通');await waitText(page,n.id,'普通');
    const after=await parked(page);assert.equal(after.composing,false);r.stages.push({after,stored:stored(n.id)});await noWrite(page,n.id);
  });
  await run('cancel-restores-nonempty-original-selection-then-no-stale-retention',async r=>{
    const {page,n}=await begin(r.name,{selection:{from:2,to:3}});await start(page,'候');await waitText(page,n.id,'候');active(await snapshot(page));
    await select(page,2,3);await page.keyboard.insertText('独');await waitText(page,n.id,'#独');
    const restored=await snapshot(page);active(restored);assert.equal(restored.rows.length,1);
    await end(page,'');await settle(page);const cancelled=await snapshot(page);active(cancelled);assert.equal(cancelled.composing,false);
    await select(page,3,3);await page.keyboard.insertText('普通');await waitText(page,n.id,'普通');
    r.stages.push({restored,cancelled,afterOrdinary:await parked(page),stored:stored(n.id)});
  });
  await run('explicit-clear-filter-exits-retention-without-focus-revival',async r=>{
    const {page,n}=await begin(r.name);await start(page,'改');await waitText(page,n.id,'改');active(await snapshot(page));
    await page.getByRole('button',{name:'清除标签筛选',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.tag-browser'));await end(page,'改');await settle(page);
    const natural=await snapshot(page);assert.equal(natural.hidden,false);assert.equal(natural.editable,true);assert.equal(natural.composing,false);
    assert.equal(natural.events.filter(x=>x.type==='focus').length,0);r.stages.push({natural,stored:stored(n.id)});
  });
  await run('engine-replaces-previous-character-at-caret',async r=>{
    const {page,n}=await begin(r.name);const cdp=await context.newCDPSession(page);
    r.stages.push({before:await snapshot(page)});
    await cdp.send('Input.imeSetComposition',{text:'改',selectionStart:1,selectionEnd:1,replacementStart:1,replacementEnd:2});
    await waitText(page,n.id,'改');active(await snapshot(page));r.stages.push({during:await snapshot(page),observers:await observers(page)});
    await cdp.send('Input.insertText',{text:'终'});await waitText(page,n.id,'终');await page.waitForFunction(()=>!window.probe.view.composing);
    r.stages.push({finalBeforeParking:await snapshot(page),observers:await observers(page),stored:stored(n.id)});
    r.stages.push({parked:await parked(page)});await noWrite(page,n.id);
  });
  assert.ok(entryLoaded && actionInjected && accessInjected);
  assert.deepEqual(errors, []);
  console.log(
    `Production App/Editor → existing Rust Store composition retention: ${results.length} scenarios passed.`,
  );
} catch (error) {
  errors.push(String(error.stack || error));
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(out, "result.json"),
    JSON.stringify(
      {
        binary,
        binaryHash,
        method:
          "production App/Editor; controlled browser DOM composition with real browser input; only preview action/access transports adapted",
        results,
        records,
        errors,
        actionInjection,
        accessInjection,
        limitations: [
          "Not native IME, Android, native IPC or Session barrier acceptance",
          "Only synthetic notes in isolated temporary stores",
          "No forced DOM flush, manual composing mutation, fake final transaction, build or package change",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await context?.close();
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
