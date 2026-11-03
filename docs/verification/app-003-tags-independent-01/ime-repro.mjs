import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from '/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
const root=process.cwd(),output=resolve('docs/verification/app-003-tags-independent-01');
const binary='/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-qa-fix-store';
const storeRoot=resolve('artifacts/tags-independent-rust/ime-store-run02');
const records=[];
function storeAction(action){const p=spawnSync(binary,[storeRoot],{input:JSON.stringify(action),encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr);const response=JSON.parse(p.stdout);records.push({action,response});return response;}
const created=storeAction({type:'createNote'}).value;
const mark={type:'noteTag',attrs:{name:'UI对照'}};
const original={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'#UI对照',marks:[mark]},{type:'text',text:' '}]}]};
const saved=storeAction({type:'saveNote',id:created.id,revision:created.revision,document:original});assert.equal(saved.ok,true);
const ws=storeAction({type:'__workspace'}).value;ws.settings={...ws.settings,selectedFolder:'default',selectedNote:created.id};
const entry="import React from 'react';import{createRoot}from'react-dom/client';import App from '/src/App.tsx';import{documentTags}from'/src/note-tags.ts';import'/src/style.css';window.documentTags=documentTags;window.mountApp=()=>createRoot(document.getElementById('root')).render(React.createElement(App));";
// Only replace the browser-preview save transport with a real temporary Rust Store.
// Actual App.saveDoc, registerSaveIntent, queue, NoteEditor.onUpdate, extension,
// revisions, optimistic state and visible error rendering remain production code.
const injection=`  if (!native && a.type === "saveNote") { const result = await fetch('/__store-action', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a)}).then(r=>r.json()); (window.__reviewStoreResults ||= []).push(result); if (!result.ok) throw result.error; return result.value as T; }\n`;
let bridgeInjected=false;
const vite=await createViteServer({root,configFile:false,cacheDir:resolve('artifacts/tags-independent-vite-cache'),plugins:[{name:'independent-store-transport',enforce:'pre',resolveId(id){if(id==='/__independent.tsx')return id;},load(id){if(id==='/__independent.tsx')return entry;},transform(code,id){if(id===resolve('src/bridge.ts')){const needle='): Promise<T> {\n  if (native) {';assert.equal(code.split(needle).length,2);bridgeInjected=true;const transformed=code.replace(needle,'): Promise<T> {\n'+injection+'  if (native) {');return {code:transformed,map:null};}}},react()],server:{middlewareMode:true,hmr:{host:'127.0.0.1',port:0}},appType:'custom'});
const server=createServer(async(req,res)=>{if(req.url==='/__store-action'){let body='';for await(const chunk of req)body+=chunk;res.setHeader('content-type','application/json');res.end(JSON.stringify(storeAction(JSON.parse(body))));}else if(req.url==='/__check'){res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><div id="root"></div><script type="module" src="/__independent.tsx"></script>'));}else vite.middlewares(req,res);});
let browser;
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort());
 await page.goto(origin+'/__check');await page.evaluate(ws=>localStorage.setItem('notes-browser-preview',JSON.stringify(ws)),ws);await page.reload();await page.waitForFunction(()=>window.mountApp);await page.evaluate(()=>window.mountApp());await page.waitForFunction(()=>!!document.querySelector('.tiptap')?.editor);
 const before=await page.evaluate(()=>{const e=document.querySelector('.tiptap').editor;window.reviewEditor=e;e.commands.focus();e.commands.setTextSelection(4);return{doc:e.getJSON(),selection:e.state.selection.toJSON(),composing:e.view.composing};});
 await page.evaluate(()=>{const e=window.reviewEditor;e.view.dom.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'变'}));});
 assert.equal(await page.evaluate(()=>window.reviewEditor.view.composing),true);
 await page.keyboard.insertText('变');
 await page.waitForFunction(()=>window.__reviewStoreResults?.some(r=>!r.ok));
 const during=await page.evaluate(()=>{const e=window.reviewEditor;return{doc:e.getJSON(),selection:e.state.selection.toJSON(),composing:e.view.composing,tags:window.documentTags(e.getJSON()),results:window.__reviewStoreResults,bodyText:document.body.innerText};});
 assert.equal(during.composing,true);assert.ok(during.bodyText.includes('标签完整跨度与名称不符'));assert.equal(during.results.at(-1).error.code,'archive_invalid');
 const unchanged=storeAction({type:'__workspace'}).value.notes.find(n=>n.id===created.id);assert.equal(unchanged.revision,saved.value.revision);assert.deepEqual(unchanged.document,original);
 const failing=records.filter(r=>r.action.type==='saveNote'&&!r.response.ok).at(-1);assert.ok(failing);await writeFile(resolve(output,'invalid-preedit-document.json'),JSON.stringify(failing.action.document,null,2)+'\n');
 await page.evaluate(()=>window.reviewEditor.view.dom.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'变'})));
 await page.waitForFunction(()=>window.__reviewStoreResults?.at(-1)?.ok===true);
 const after=await page.evaluate(()=>({doc:window.reviewEditor.getJSON(),composing:window.reviewEditor.view.composing,tags:window.documentTags(window.reviewEditor.getJSON()),results:window.__reviewStoreResults,bodyText:document.body.innerText}));
 assert.deepEqual(after.tags,[]);assert.ok(after.bodyText.includes('标签完整跨度与名称不符'));
 assert.equal(bridgeInjected,true);assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'ime-repro.json'),JSON.stringify({result:'P2 CONFIRMED',sourceRoot:root,method:'Production App + NoteEditor with controlled compositionstart, browser text insertion inside existing tag, compositionend; only preview save transport adapted to actual isolated production Rust Store. Not native IME, not native IPC/Session.',before,during,storedAfterRejectedPreedit:unchanged,after,storeRecords:records,errors,transportInjection:injection,limitations:['DOM composition events are controlled and untrusted; no native IME behavior claim.','The transport adapter leaves production onUpdate/saveDoc/queue/error UI untouched but bypasses native IPC and Session.']},null,2)+'\n');
 console.log('P2 confirmed: composing=true, real App visible Rust archive_invalid; old revision/doc unchanged; later cleanup success does not erase error.');
}finally{await browser?.close();await new Promise(done=>server.close(done));await vite.close();}
