// Mounted production App/Editor/SaveQueue, with only the browser transport's ACK timing held.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=await readFile('src/App.tsx','utf8'),bridge=await readFile('src/bridge.ts','utf8');
const appNeedle='const pendingDocs = useRef(new Map<string, JSONContent>());';assert.equal(source.split(appNeedle).length,2);
const instrumented=source.replace(appNeedle,appNeedle+'\n globalThis.__paperSaveState=()=>({pending:structuredClone([...pendingDocs.current.entries()]),failures:[...saveFailures.current.keys()]});');
const bridgeNeedle='): Promise<T> {\n  if (native) {';assert.equal(bridge.split(bridgeNeedle).length,2);
const delayedBridge=bridge.replace(bridgeNeedle,'): Promise<T> {\n globalThis.__paperActions.push(structuredClone(a)); if(a.type === "saveNote" && globalThis.__paperHoldSave) await new Promise<void>(resolve=>globalThis.__paperSaveWaiters.push(resolve));\n  if (native) {');
const temp=await mkdtemp('/private/tmp/notes-paper-pending03-');
const entry="import React from 'react';import{createRoot}from'react-dom/client';import App from '/src/App.tsx';import '/src/style.css';createRoot(document.getElementById('root')).render(React.createElement(App));";
const server=createServer((req,res)=>{if(req.url==='/__check'){res.setHeader('Content-Type','text/html');vite.transformIndexHtml(req.url,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>window.__paperActions=[];window.__paperSaveWaiters=[];window.__paperHoldSave=false</script><script type="module" src="/__pending.tsx"></script>').then(html=>res.end(html)).catch(e=>{res.statusCode=500;res.end(String(e));});}else vite.middlewares(req,res);});
const vite=await createViteServer({root:process.cwd(),configFile:false,cacheDir:temp+'/vite-cache',plugins:[react(),{name:'actual-pending-paper',resolveId(id){if(id==='/__pending.tsx')return id;},load(id){if(id==='/__pending.tsx')return entry;if(id===resolve('src/App.tsx'))return instrumented;if(id===resolve('src/bridge.ts'))return delayedBridge;}}],server:{middlewareMode:true,hmr:{server},watch:{ignored:['**/src-tauri/target/**','**/artifacts/**','**/docs/verification/**']}},appType:'custom'});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const result={scope:'Actual React App, Tiptap, production save closures/SaveQueue and browser persistence. Only saveNote transport ACK timing held; actual pending ref observed read-only. No Rust/native/APK acceptance.',sourceSHA256:sha(source),bridgeSHA256:sha(bridge),instrumentedAppSHA256:sha(instrumented),instrumentedBridgeSHA256:sha(delayedBridge),cases:[],errors:[],externalRequests:[]};let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});result.browser=await browser.version();const origin='http://127.0.0.1:'+server.address().port;
 for(const style of ['plain','grid-large']){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:'))return route.continue();result.externalRequests.push(url);return route.abort();});page.on('pageerror',e=>result.errors.push(String(e)));await page.goto(origin+'/__check');
  await page.getByRole('button',{name:'新建备忘录',exact:true}).click();await page.locator('.tiptap').fill('QA-PAPER-PENDING-03 Alpha Beta\n待确认正文属于原编辑器。');
  await page.waitForFunction(()=>{const n=JSON.parse(localStorage.getItem('notes-browser-preview'))?.notes[0];return n?.plainText.includes('待确认正文')&&n.revision>0&&!document.querySelector('.save-status');});
  const settle=async()=>{await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));await page.waitForTimeout(250);};
  const open=async()=>{await page.locator('button[aria-label="更多"]:visible').first().click();await page.getByRole('button',{name:'横线与网格',exact:true}).click();await page.locator('.modal-paper').waitFor();await settle();};
  if(style!=='plain'){await open();await page.locator(`button[data-paper-style="${style}"]`).click();await page.locator('.modal-paper').waitFor({state:'detached'});await settle();}
  await page.evaluate(()=>{window.__paperHoldSave=true;const dom=document.querySelector('.tiptap'),editor=dom.editor;window.__paperBefore={dom,editor,view:editor.view,viewDOM:editor.view.dom};editor.commands.insertContentAt(editor.state.doc.content.size-1,' Pending ACK');editor.commands.setTextSelection({from:3,to:8});editor.commands.blur();});
  await page.waitForFunction(()=>window.__paperSaveWaiters.length===1&&window.__paperSaveState().pending.length===1);await settle();
  const snapshot=()=>page.evaluate(()=>{const dom=document.querySelector('.tiptap'),e=dom.editor,p=window.__paperBefore;let host=dom,fiber;while(host&&!fiber){fiber=host[Object.keys(host).find(k=>k.startsWith('__reactFiber$'))];host=host.parentElement;}const keys=[];while(fiber){if(fiber.key!==null)keys.push({key:fiber.key,type:typeof fiber.type==='string'?fiber.type:fiber.type?.name||fiber.type?.type?.name||null});fiber=fiber.return;}const h=e.state.plugins.find(p=>p.key.startsWith('history$'))?.getState(e.state);return {document:e.getJSON(),selection:e.state.selection.toJSON(),editable:e.isEditable,focused:e.isFocused,identity:{editor:e===p.editor,view:e.view===p.view,dom:dom===p.dom,viewDOM:e.view.dom===p.viewDOM},keys,history:{done:h.done.eventCount,undone:h.undone.eventCount},stored:JSON.parse(localStorage.getItem('notes-browser-preview')).notes[0],save:window.__paperSaveState(),actions:structuredClone(window.__paperActions),waiting:window.__paperSaveWaiters.length};});
  const before=await snapshot();assert.notDeepEqual(before.document,before.stored.document);assert.equal(before.save.pending.length,1);await open();await page.locator(`button[data-paper-style="${style}"]`).click();await page.locator('.modal-paper').waitFor({state:'detached',timeout:3000});await settle();const closedBeforeACK=await snapshot();const record={style,before,closedBeforeACK};result.cases.push(record);
  assert.deepEqual(closedBeforeACK,before,'Same-style close retains actual pending body, bookmark, history, identity and queues without waiting or writing');assert(Object.values(closedBeforeACK.identity).every(Boolean));assert.equal(closedBeforeACK.editable,true);assert.equal(closedBeforeACK.focused,false);
  await page.screenshot({path:resolve(output,style+'-closed-awaiting-ack.png')});await page.evaluate(()=>{window.__paperHoldSave=false;for(const done of window.__paperSaveWaiters.splice(0))done();});
  await page.waitForFunction(()=>!window.__paperSaveState().pending.length&&!document.querySelector('.save-status'));await settle();record.afterACK=await snapshot();
  assert.deepEqual(record.afterACK.document,before.document);assert.deepEqual(record.afterACK.stored.document,before.document);assert.deepEqual(record.afterACK.selection,before.selection);assert.deepEqual(record.afterACK.keys,before.keys);assert.deepEqual(record.afterACK.history,before.history);assert(Object.values(record.afterACK.identity).every(Boolean));assert.equal(record.afterACK.save.failures.length,0);assert.equal(record.afterACK.stored.revision,before.stored.revision+1);
  const undoRedo=await page.evaluate(()=>{const e=document.querySelector('.tiptap').editor;const undo=e.commands.undo(),afterUndo=e.getJSON(),redo=e.commands.redo(),afterRedo=e.getJSON();return {undo,afterUndo,redo,afterRedo};});record.undoRedo=undoRedo;assert(undoRedo.undo&&undoRedo.redo);assert.notDeepEqual(undoRedo.afterUndo,before.document);assert.deepEqual(undoRedo.afterRedo,before.document);
  await page.waitForFunction(()=>!window.__paperSaveState().pending.length&&!document.querySelector('.save-status'));await context.close();
 }
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.externalRequests,[]);result.pass=true;
}catch(error){result.pass=false;result.failure={message:String(error),stack:error.stack};process.exitCode=1;}
finally{await browser?.close();await vite.close();await new Promise(done=>server.close(done));await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,output,failure:result.failure?.message}));}
