// Isolated offline headless render of the production App/Editor/preview bridge.
// No native package, GUI session, ADB, user data, or external requests.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
assert(process.env.PLAYWRIGHT_CORE_PATH && process.env.CHROME_PATH);
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const temp=await mkdtemp('/private/tmp/notes-paper-order-02-');
const sourceRef='8463ed896847f891fd4fd5579affb253a11d681b';
const pinnedCss=execFileSync('git',['show',sourceRef+':src/style.css']);
const observeSelection=process.env.PAPER_OBSERVE_SELECTION==='1';
const appSource=sourceRef?execFileSync('git',['show',sourceRef+':src/App.tsx']):await readFile('src/App.tsx');
const entry="import React from 'react';import{createRoot}from'react-dom/client';import App from '/src/App.tsx';import'/src/style.css';createRoot(document.getElementById('root')).render(React.createElement(App));";
const vite=await createViteServer({root:process.cwd(),configFile:false,cacheDir:temp+'/vite-cache',plugins:[react(),{name:'actual-paper-app',resolveId(id){if(id==='/__paper.tsx')return id;},load(id){if(id==='/__paper.tsx')return entry;if(id===resolve('src/App.tsx'))return appSource.toString();if(id===resolve('src/style.css'))return pinnedCss.toString();}}],server:{middlewareMode:true,hmr:false,watch:{ignored:['**/src-tauri/target/**','**/artifacts/**','**/docs/verification/**']}},appType:'custom'});
const server=createServer((req,res)=>{if(req.url==='/__check'){res.setHeader('Content-Type','text/html');vite.transformIndexHtml(req.url,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__paper.tsx"></script>').then(html=>res.end(html)).catch(e=>{res.statusCode=500;res.end(String(e));});}else vite.middlewares(req,res);});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const expected=[['plain','空白'],['lines-small','密横线'],['lines-medium','中横线'],['lines-large','疏横线'],['grid-small','密网格'],['grid-medium','中网格'],['grid-large','疏网格']];
const result={sourceRef,observeSelection,sourceSHA256:createHash('sha256').update(appSource).digest('hex'),cssSHA256:createHash('sha256').update(pinnedCss).digest('hex'),independentCandidateOrderAssertionsEnabled:true,scope:'Real production App + Editor + unchanged browser-preview bridge, isolated headless Chrome; no Android/native acceptance',expected,steps:[],errors:[],externalRequests:[]};
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});result.browser=await browser.version();
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const origin='http://127.0.0.1:'+server.address().port;
 await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:'))return route.continue();result.externalRequests.push(url);return route.abort();});
 page.on('pageerror',e=>result.errors.push(String(e)));await page.goto(origin+'/__check');
 await page.getByRole('button',{name:'新建备忘录',exact:true}).click();await page.locator('.tiptap').waitFor();
 await page.locator('.tiptap').fill('QA-PAPER-ORDER-02 Alpha Beta');
 await page.waitForFunction(()=>{const n=JSON.parse(localStorage.getItem('notes-browser-preview'))?.notes[0];return n?.plainText==='QA-PAPER-ORDER-02 Alpha Beta'&&n.revision>0&&!document.querySelector('.save-status');});
 await page.waitForFunction(()=>document.querySelector('.tiptap')?.editor);
 await page.evaluate(()=>{const e=document.querySelector('.tiptap').editor;e.commands.setTextSelection({from:3,to:8});e.commands.blur();});
 await page.waitForFunction(()=>!document.querySelector('.tiptap').editor.isFocused);
 const snapshot=()=>page.evaluate(()=>{const e=document.querySelector('.tiptap').editor;return {document:e.getJSON(),selection:e.state.selection.toJSON(),editable:e.isEditable,focused:e.isFocused,stored:JSON.parse(localStorage.getItem('notes-browser-preview')).notes[0].paperStyle};});
 const initial=await snapshot();
 const open=async()=>{await page.locator('button[aria-label="更多"]:visible').first().click();await page.getByRole('button',{name:'横线与网格',exact:true}).click();await page.locator('.modal-paper').waitFor();};
 const picker=()=>page.evaluate(()=>[...document.querySelectorAll('.paper-option')].map(b=>{const r=b.getBoundingClientRect();return{id:b.dataset.paperStyle,label:b.getAttribute('aria-label'),selected:b.classList.contains('selected'),rect:[r.x,r.y,r.width,r.height],preview:b.querySelector('.paper-preview')?.style.getPropertyValue('--paper-preview-url')??null};}));
 await open();const observed=await picker();result.steps.push({name:'mobile-initial-render',options:observed});
 result.referenceOrderMatches=JSON.stringify(observed.map(x=>[x.id,x.label]))===JSON.stringify(expected);
 if(true)assert.deepEqual(observed.map(x=>[x.id,x.label]),expected,'Reference row order and label/data-style association');
 assert.deepEqual([...observed.map(x=>[x.id,x.label])].sort(),[...expected].sort());
 assert.equal(observed[0].rect[2],observed[1].rect[2]);
 const rows=[];for(const option of observed){let row=rows.find(r=>Math.abs(r.y-option.rect[1])<.5);if(!row){row={y:option.rect[1],ids:[]};rows.push(row);}row.ids.push(option.id);}
 if(true)assert.deepEqual(rows.map(r=>r.ids),[['plain'],['lines-small','lines-medium'],['lines-large','grid-small'],['grid-medium','grid-large']]);result.steps.push({name:'actual-css-grid-rows',rows});
 await page.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await snapshot(),initial);
 for(const [style] of expected){
  await page.evaluate(()=>{const e=document.querySelector('.tiptap').editor;e.commands.setTextSelection({from:3,to:8});e.commands.blur();});await page.waitForFunction(()=>!document.querySelector('.tiptap').editor.isFocused);
  const before=await snapshot();await open();await page.locator('button[data-paper-style="'+style+'"]').click();await page.locator('.modal-paper').waitFor({state:'detached'});const after=await snapshot();assert.equal(after.stored,style);assert.deepEqual(after.document,initial.document);const selectionPreserved=JSON.stringify(after.selection)===JSON.stringify(before.selection);if(!observeSelection)assert.deepEqual(after.selection,before.selection);assert.equal(after.editable,true);assert.equal(after.focused,false);
  await open();const selected=(await picker()).filter(x=>x.selected).map(x=>x.id);assert.deepEqual(selected,[style]);await page.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await snapshot(),after);result.steps.push({name:'choose-reopen-cancel',style,selected,before,after,selectionPreserved});
 }
 for(const method of ['Escape','backdrop-handler']){const before=await snapshot();await open();if(method==='Escape')await page.keyboard.press('Escape');else await page.locator('.modal-backdrop').dispatchEvent('click');await page.locator('.modal-paper').waitFor({state:'detached'});assert.deepEqual(await snapshot(),before);result.steps.push({name:'close-'+method,preserved:true});}
 await page.setViewportSize({width:1088,height:800});await open();const desktop=await picker();assert.deepEqual(desktop.map(x=>[x.id,x.label]),expected);assert(desktop.every(x=>x.preview===null));await page.getByRole('button',{name:'取消',exact:true}).click();result.steps.push({name:'desktop-real-render-unchanged',options:desktop});
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.externalRequests,[]);result.pass=true;
}catch(error){result.pass=false;result.failure={message:String(error),stack:error.stack};process.exitCode=1;}
finally{await browser?.close();await vite.close();await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,output,steps:result.steps.length,failure:result.failure?.message}));}
