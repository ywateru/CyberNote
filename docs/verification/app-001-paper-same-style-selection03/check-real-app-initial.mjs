// Real production React App/Editor. Only observational probes and isolated host I/O.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const sourceRef=process.env.SAME_SOURCE_REF||null,observe=process.env.SAME_OBSERVE==='1';
const source=sourceRef?execFileSync('git',['show',sourceRef+':src/App.tsx']).toString():await readFile('src/App.tsx','utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
let instrumented=source;
const inject=(needle,addition)=>{assert.equal(instrumented.split(needle).length,2,'Unique production observation site');instrumented=instrumented.replace(needle,needle+addition);};
inject('const previous = wsRef.current;', '\n globalThis.__paperTrace.push({stage:"hydrate",previousAccess:structuredClone(previous.access),incomingAccess:structuredClone(data.access),pending:[...pendingDocs.current.keys()],documents:data.notes.map(n=>({id:n.id,same:!!previous.notes.find(o=>o.id===n.id)&&documentsEqual(previous.notes.find(o=>o.id===n.id).document,n.document)}))});');
inject('if (changed.length) clearSensitive.current(changed);','\n globalThis.__paperTrace.push({stage:"hydrate-access-changed",changed});');
inject('clearSensitive.current = (ids) => {','\n globalThis.__paperTrace.push({stage:"clearSensitive",ids:[...ids]});');
inject('revisions.current.confirmed(n.id, n.revision);','\n globalThis.__paperTrace.push({stage:"create-response",noteId:n.id,responseAccess:structuredClone(n.access),previousAccess:structuredClone(wsRef.current.access)});');
inject('const result = await action(a);','\n globalThis.__paperTrace.push({stage:"action-result",action:structuredClone(a),resultHasWorkspace:!!result&&typeof result==="object"&&"notes" in result});');
inject('pendingDocs.current.set(id, doc);','\n globalThis.__paperTrace.push({stage:"save-submit",id,pending:[...pendingDocs.current.keys()]});');
inject('revisions.current.confirmed(id, n.revision);','\n globalThis.__paperTrace.push({stage:"save-ack",id,revision:n.revision,pending:[...pendingDocs.current.keys()]});');
const temp=await mkdtemp('/private/tmp/notes-paper-same03-');
const entry="import React from 'react';import{createRoot}from'react-dom/client';import App from '/src/App.tsx';import '/src/style.css';createRoot(document.getElementById('root')).render(React.createElement(App));";
const server=createServer((req,res)=>{if(req.url==='/__check'){res.setHeader('Content-Type','text/html');vite.transformIndexHtml(req.url,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>window.__paperTrace=[]</script><script type="module" src="/__same.tsx"></script>').then(html=>res.end(html)).catch(e=>{res.statusCode=500;res.end(String(e));});}else vite.middlewares(req,res);});
const vite=await createViteServer({root:process.cwd(),configFile:false,cacheDir:temp+'/vite-cache',plugins:[react(),{name:'actual-paper-same',resolveId(id){if(id==='/__same.tsx')return id;},load(id){if(id==='/__same.tsx')return entry;if(id===resolve('src/App.tsx'))return instrumented;}}],server:{middlewareMode:true,hmr:{server},watch:{ignored:['**/src-tauri/target/**','**/artifacts/**','**/docs/verification/**']}},appType:'custom'});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const result={scope:'Actual mounted App and Editor, unchanged browser-preview bridge, observational probes. No native/Rust/APK acceptance.',sourceRef,observe,sourceSHA256:sha(source),instrumentedSHA256:sha(instrumented),cssSHA256:sha(await readFile('src/style.css')),scenarios:[],errors:[],externalRequests:[]};
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});result.browser=await browser.version();
 const origin='http://127.0.0.1:'+server.address().port;
 for(const scenario of ['first-current-plain','first-change-grid']){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});const page=await context.newPage();
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:'))return route.continue();result.externalRequests.push(url);return route.abort();});page.on('pageerror',e=>result.errors.push(String(e)));
  await page.goto(origin+'/__check');await page.getByRole('button',{name:'新建备忘录',exact:true}).click();await page.locator('.tiptap').fill('QA-PAPER-SAME-03 Alpha Beta\n第二段：保留正文与撤销记录。');
  await page.waitForFunction(()=>{const n=JSON.parse(localStorage.getItem('notes-browser-preview'))?.notes[0];return n?.plainText.includes('第二段')&&n.revision>0&&!document.querySelector('.save-status');});
  const settle=async()=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});await page.waitForTimeout(250);};
  const prepare=async()=>{await page.evaluate(()=>{const dom=document.querySelector('.tiptap'),editor=dom.editor;editor.commands.setTextSelection({from:3,to:8});editor.commands.blur();window.__paperBefore={dom,editor,view:editor.view,viewDOM:editor.view.dom};});await settle();};
  const snapshot=()=>page.evaluate(()=>{const dom=document.querySelector('.tiptap'),e=dom.editor,p=window.__paperBefore;let host=dom,fiber;while(host&&!fiber){fiber=host[Object.keys(host).find(k=>k.startsWith('__reactFiber$'))];host=host.parentElement;}const keys=[];while(fiber){if(fiber.key!==null)keys.push({key:fiber.key,type:typeof fiber.type==='string'?fiber.type:fiber.type?.name||fiber.type?.type?.name||null});fiber=fiber.return;}const h=e.state.plugins.find(p=>p.key.startsWith('history$'))?.getState(e.state);const n=JSON.parse(localStorage.getItem('notes-browser-preview')).notes[0];return {document:e.getJSON(),selection:e.state.selection.toJSON(),editable:e.isEditable,focused:e.isFocused,identity:{editor:e===p.editor,view:e.view===p.view,dom:dom===p.dom,viewDOM:e.view.dom===p.viewDOM},keys,history:h?{done:h.done.eventCount,undone:h.undone.eventCount}:null,stored:{paperStyle:n.paperStyle,revision:n.revision,document:n.document},trace:structuredClone(window.__paperTrace)};});
  const open=async()=>{await page.locator('button[aria-label="更多"]:visible').first().click();await page.getByRole('button',{name:'横线与网格',exact:true}).click();await page.locator('.modal-paper').waitFor();await settle();};
  const record={scenario,steps:[]};result.scenarios.push(record);
  const choices=scenario==='first-current-plain'?['plain','plain','grid-large','grid-large','plain']:['grid-large','grid-large','plain'];
  for(const style of choices){
   await prepare();const before=await snapshot();await open();await page.locator(`button[data-paper-style="${style}"]`).click();await page.locator('.modal-paper').waitFor({state:'detached'});await settle();const after=await snapshot();
   const step={kind:'choose',style,before,after,preserved:{identity:Object.values(after.identity).every(Boolean),key:JSON.stringify(before.keys)===JSON.stringify(after.keys),selection:JSON.stringify(before.selection)===JSON.stringify(after.selection),history:JSON.stringify(before.history)===JSON.stringify(after.history),document:JSON.stringify(before.document)===JSON.stringify(after.document)},actionCount:after.trace.filter(x=>x.stage==='action-result').length-before.trace.filter(x=>x.stage==='action-result').length};record.steps.push(step);
   assert(step.preserved.document);assert.equal(after.stored.paperStyle,style);assert.equal(after.editable,true);assert.equal(after.focused,false);
   if(!observe){assert(Object.values(step.preserved).every(Boolean),scenario+' '+style+' retains actual editor state');assert.equal(step.actionCount,before.stored.paperStyle===style?0:1,'Only changed paper style reaches original action');if(before.stored.paperStyle===style)assert.equal(after.stored.revision,before.stored.revision,'No no-op revision write');}
  }
  for(const method of ['cancel','Escape','backdrop-handler']){await prepare();const before=await snapshot();await open();if(method==='cancel')await page.getByRole('button',{name:'取消',exact:true}).click();else if(method==='Escape')await page.keyboard.press('Escape');else await page.locator('.modal-backdrop').dispatchEvent('click');await page.locator('.modal-paper').waitFor({state:'detached'});await settle();const after=await snapshot();record.steps.push({kind:'close',method,before,after});assert.deepEqual(after,before);}
  await page.screenshot({path:resolve(output,scenario+'-after.png')});await context.close();
 }
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.externalRequests,[]);result.pass=true;
}catch(error){result.pass=false;result.failure={message:String(error),stack:error.stack};process.exitCode=1;}
finally{await browser?.close();await vite.close();await new Promise(done=>server.close(done));await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,output,failure:result.failure?.message}));}
