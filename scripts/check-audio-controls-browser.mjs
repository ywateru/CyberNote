// Offline integration check of the real NoteEditor -> ReactNodeView -> MediaView
// -> AudioPlayer, using the unchanged preview bridge to load the preserved WebM.
// No application package, device, microphone, user browser or external requests.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";

if (!process.env.PLAYWRIGHT_CORE_PATH || !process.env.CHROME_PATH)
  throw Error("Use existing external PLAYWRIGHT_CORE_PATH and CHROME_PATH; no install required.");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const output = resolve(process.argv[2] || "artifacts/audio-controls-browser");
await mkdir(output, { recursive: true });
const mediaPath = "docs/verification/app-002-media/android-candidate01/managed-recording.webm";
const bytes = await readFile(mediaPath);
const hash = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(hash(bytes), "cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f");
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {NodeView} from '@tiptap/core';
import NoteEditor from '/src/Editor.tsx';
import {storeAttachment} from '/src/bridge.ts';
import '/src/style.css';
window.__stops=[];window.__changes=[];window.__focus=[];
const originalStop=NodeView.prototype.stopEvent;
NodeView.prototype.stopEvent=function(event){const result=originalStop.call(this,event);window.__stops.push({type:event.type,target:event.target.tagName,result});return result;};
const root=createRoot(document.querySelector('#root'));
window.mountNote=async(base64)=>{
 const file=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'真实录音.webm',{type:'audio/webm;codecs=opus'});
 const a=await storeAttachment('audio-control-fixture',file);
 const note={id:'audio-control-fixture',folderId:'default',document:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'NodeView boundary'}]},{type:'paragraph',content:[{type:'text',text:'Before recording'}]},{type:'attachment',attrs:{id:a.id,name:a.displayName,kind:'audio'}},{type:'paragraph',content:[{type:'text',text:'After recording'}]}]},title:'NodeView boundary',plainText:'Before recording',createdAt:1,updatedAt:1,pinned:false,deletedAt:null,locked:false,paperStyle:'plain',revision:7};
 window.__note=note;
 root.render(React.createElement('div',{className:'app mobile node-harness',style:{padding:'16px'}},React.createElement(NoteEditor,{key:a.id,note,onChange:(id,doc)=>window.__changes.push({id,doc}),onReady:e=>window.__editor=e,onFocus:f=>window.__focus.push(f)})));
};
window.unmountNote=()=>root.render(null);
`;
const vite = await createViteServer({
  configFile: false,
  cacheDir: resolve("artifacts/audio-controls-vite-cache"),
  plugins: [react(), {
    name: "real-audio-nodeview-check",
    resolveId(id) { if (id === "/__audio_controls.tsx") return id; },
    load(id) { if (id === "/__audio_controls.tsx") return entry; },
  }],
  server: { middlewareMode: true, hmr: false }, appType: "custom",
});
const server = createServer((req, res) => {
  if (req.url === "/__check") {
    res.setHeader("Content-Type", "text/html");
    vite.transformIndexHtml(req.url, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__audio_controls.tsx"></script>')
      .then((html) => res.end(html)).catch((e) => { res.statusCode = 500; res.end(String(e)); });
  } else vite.middlewares(req, res);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH, headless: true, args: ["--mute-audio"]});
  const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page = await context.newPage();
  const errors = [], external = [];
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (route) => {
    const url=route.request().url();
    if(url.startsWith(origin)||url.startsWith("data:")) return route.continue();
    external.push(url);return route.abort();
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(origin+"/__check");
  await page.waitForFunction(()=>!!window.mountNote);
  await page.evaluate((data)=>window.mountNote(data),bytes.toString("base64"));
  await page.getByText("录音 · 1:06",{exact:true}).waitFor();
  await page.waitForFunction(()=>!!window.__editor);
  const title=page.locator(".audio-title-toggle"), play=page.locator(".audio-play-toggle");
  const snapshot=()=>page.evaluate(()=>{
    const a=document.querySelector("audio"),r=document.querySelector('input[type="range"]'),e=window.__editor;
    return {doc:e.getJSON(),selection:e.state.selection.toJSON(),editorFocused:e.isFocused,activeElement:document.activeElement?.tagName,changes:window.__changes.length,focusEvents:[...window.__focus],time:a.currentTime,paused:a.paused,duration:String(a.duration),max:r?.max??null,expanded:document.querySelector('.audio-title-toggle').getAttribute('aria-expanded'),revision:window.__note.revision};
  });
  const initial=await snapshot();
  assert.equal(initial.time,0);assert.equal(initial.paused,true);assert.equal(initial.expanded,"false");
  await page.screenshot({path:resolve(output,'nodeview-mobile-compact.png')});
  const tap=async(locator)=>{const b=await locator.boundingBox();assert.ok(b);await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);};
  await tap(title.locator("strong"));
  await page.getByRole("slider",{name:"播放进度"}).waitFor();
  const expanded=await snapshot();
  assert.equal(expanded.expanded,"true");assert.equal(expanded.time,0);assert.equal(expanded.paused,true);
  assert.ok(Number(expanded.max)>66&&Number(expanded.max)<67);
  assert.deepEqual(expanded.doc,initial.doc);assert.deepEqual(expanded.selection,initial.selection);assert.equal(expanded.editorFocused,false);
  assert.equal(await title.getAttribute('aria-controls'),await page.locator('.audio-detail').getAttribute('id'));
  await page.screenshot({path:resolve(output,'nodeview-mobile-expanded.png')});
  const geometry=await page.evaluate(()=>{
    const card=document.querySelector('.audio-card'),title=document.querySelector('.audio-title-toggle'),play=document.querySelector('.audio-play-toggle'),range=document.querySelector('input[type="range"]'),back=document.querySelector('[aria-label="后退15秒"]'),forward=document.querySelector('[aria-label="前进15秒"]');
    const box=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right};};
    return {card:box(card),title:box(title),play:box(play),range:box(range),back:box(back),forward:box(forward),arrowDisplay:getComputedStyle(document.querySelector('.audio-expand')).display,playTouchHeight:parseFloat(getComputedStyle(play,'::before').height),textPointerEvents:getComputedStyle(title.querySelector('strong')).pointerEvents,iconPointerEvents:getComputedStyle(play.querySelector('svg')).pointerEvents};
  });
  assert.equal(geometry.arrowDisplay,"none");assert.ok(geometry.title.height>=44);assert.equal(geometry.playTouchHeight,44);assert.equal(geometry.textPointerEvents,"none");assert.equal(geometry.iconPointerEvents,"none");
  for(const name of ['back','forward'])assert.ok(geometry[name].height>=44&&geometry[name].width>=44);
  assert.ok(geometry.forward.right<=geometry.card.right+.1);assert.ok(geometry.range.width>0);
  await tap(play.locator("svg"));
  await page.waitForFunction(()=>!document.querySelector('audio').paused&&document.querySelector('audio').currentTime>.1);
  await tap(play.locator("svg"));
  const paused=await snapshot();assert.equal(paused.paused,true);assert.equal(paused.expanded,"true");
  // Trusted headless Chrome touch events exercise the actual native range.
  const cdp=await context.newCDPSession(page),b=await page.getByRole('slider',{name:'播放进度'}).boundingBox();
  const y=b.y+b.height/2,start=b.x+8,target=b.x+8+(b.width-16)*30/Number(expanded.max);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
  for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(target-start)*i/5,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>Math.abs(document.querySelector('audio').currentTime-30)<1);
  const middle=await snapshot();
  await tap(page.getByRole('button',{name:'前进15秒',exact:true}));
  await page.waitForFunction(t=>Math.abs(document.querySelector('audio').currentTime-(t+15))<.1,middle.time);
  await tap(page.getByRole('button',{name:'后退15秒',exact:true}));
  await page.waitForFunction(t=>Math.abs(document.querySelector('audio').currentTime-t)<.1,middle.time);
  // Native keyboard semantics, through the actual NodeView, without editor input.
  await page.getByRole('slider',{name:'播放进度'}).focus();
  await page.keyboard.press('Home');
  await tap(page.getByRole('button',{name:'后退15秒',exact:true}));
  const lower=await snapshot();assert.equal(lower.time,0);
  await page.getByRole('slider',{name:'播放进度'}).focus();await page.keyboard.press('End');
  await tap(page.getByRole('button',{name:'前进15秒',exact:true}));
  const upper=await snapshot();assert.ok(Math.abs(upper.time-Number(expanded.max))<.1);
  await title.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!document.querySelector('input[type="range"]'));
  await page.keyboard.press('Space');
  await page.getByRole('slider',{name:'播放进度'}).waitFor();
  const keyboard=await snapshot();assert.equal(keyboard.time,upper.time);assert.equal(keyboard.paused,true);
  await tap(title.locator('small'));
  assert.equal((await snapshot()).expanded,'false');
  // Narrow geometry; title text and existing play structure remain the compact UI.
  await page.setViewportSize({width:280,height:700});await tap(title);await page.getByRole('slider',{name:'播放进度'}).waitFor();
  const narrow=await page.evaluate(()=>{const card=document.querySelector('.audio-card').getBoundingClientRect(),d=document.querySelector('.audio-detail');return {width:card.width,client:d.clientWidth,scroll:d.scrollWidth,right:d.getBoundingClientRect().right,cardRight:card.right};});
  assert.ok(narrow.scroll<=narrow.client);assert.ok(narrow.right<=narrow.cardRight+.1);
  await page.setViewportSize({width:900,height:700});
  await page.evaluate(()=>document.querySelector('.app').classList.remove('mobile'));
  const arrow=page.locator('.audio-expand');assert.ok(await arrow.isVisible());
  await arrow.click();assert.equal((await snapshot()).expanded,'false');
  await title.dblclick();assert.equal((await snapshot()).expanded,'true');
  const gap=await page.evaluate(()=>{const a=document.querySelector('.audio-title-toggle').getBoundingClientRect(),b=document.querySelector('.audio-play-toggle').getBoundingClientRect();return{x:(a.right+b.x)/2,y:a.y+a.height/2};});
  await page.mouse.dblclick(gap.x,gap.y);assert.equal((await snapshot()).expanded,'false');
  await arrow.click();assert.equal((await snapshot()).expanded,'true');
  await play.dblclick();assert.equal((await snapshot()).expanded,'true');
  const beforeFinal=await snapshot();
  assert.deepEqual(beforeFinal.doc,initial.doc);assert.deepEqual(beforeFinal.selection,initial.selection);assert.equal(beforeFinal.changes,0);assert.equal(beforeFinal.editorFocused,false);assert.ok(!beforeFinal.focusEvents.includes(true));assert.equal(beforeFinal.revision,7);
  const stops=await page.evaluate(()=>window.__stops);
  assert.ok(stops.some(e=>e.type==='touchstart'&&e.target==='BUTTON'&&e.result));
  assert.ok(stops.some(e=>e.target==='INPUT'&&e.result));
  await page.screenshot({path:resolve(output,'nodeview-expanded.png')});
  await page.evaluate(()=>{window.__oldAudio=document.querySelector('audio');window.unmountNote();});
  await page.waitForFunction(()=>!document.querySelector('audio'));
  const released=await page.evaluate(()=>({src:window.__oldAudio.getAttribute('src'),paused:window.__oldAudio.paused}));assert.equal(released.src,null);assert.equal(released.paused,true);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(hash(await readFile(mediaPath)),hash(bytes));
  await writeFile(resolve(output,'result.json'),JSON.stringify({browser:await browser.version(),media:{path:mediaPath,bytes:bytes.length,sha256:hash(bytes)},initial,expanded,geometry,paused,middle,lower,upper,keyboard,narrow,beforeFinal,stopEvents:stops,released,pageErrors:errors,externalRequests:external,checks:['actual production NoteEditor/ReactNodeView/MediaView/AudioPlayer','unchanged preview bridge stores/reads original WebM','trusted touch title expansion and collapse; play icon does not toggle expansion','native touch range; ±15 and both bounds','Enter/Space/native range keyboard semantics','real NodeView stopEvent observed without changing return value','no document/selection/revision change or editor focus','280px non-overflow and 44px mobile transport hit areas','desktop arrow and title double click','unmount releases real media'],limitations:['Chrome156 headless mobile emulation; not installed Android WebView91 or macOS application','preview bridge uses localStorage; no Rust/IPC/ACK/cold persistence validation','browser cannot establish Android IME behavior; lack of editor focus is a bounded precursor check','original Apple Notes expansion gesture remains unknown; no pixel-parity claim']},null,2)+'\n');
  console.log('Real production audio NodeView controls checks passed: '+resolve(output,'result.json'));
} finally {
  await browser?.close();await vite.close();await new Promise(done=>server.close(done));
}
