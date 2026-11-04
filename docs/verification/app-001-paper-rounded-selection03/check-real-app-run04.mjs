// Isolated production App/Editor render. No native app, ADB, external requests or user profile.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
assert(process.env.PLAYWRIGHT_CORE_PATH && process.env.CHROME_PATH);
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const baselineRef='832be31f13998f20aa87edcd9987831e0a1fed91';
const baseline=execFileSync('git',['show',baselineRef+':src/style.css']).toString();
const candidate=await readFile('src/style.css','utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
const temp=await mkdtemp('/private/tmp/notes-paper-rounded03-');
const entry="import React from 'react';import{createRoot}from'react-dom/client';import App from '/src/App.tsx';import '/src/style.css';createRoot(document.getElementById('root')).render(React.createElement(App));";
const server=createServer((req,res)=>{if(req.url==='/__check'){res.setHeader('Content-Type','text/html');vite.transformIndexHtml(req.url,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__paper.tsx"></script>').then(html=>res.end(html)).catch(e=>{res.statusCode=500;res.end(String(e));});}else vite.middlewares(req,res);});
const vite=await createViteServer({root:process.cwd(),configFile:false,cacheDir:temp+'/vite-cache',plugins:[react(),{name:'paper-rounded-actual-app',resolveId(id){if(id==='/__paper.tsx')return id;},load(id){if(id==='/__paper.tsx')return entry;}}],server:{middlewareMode:true,hmr:{server},watch:{ignored:['**/src-tauri/target/**','**/artifacts/**','**/docs/verification/**']}},appType:'custom'});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const result={scope:'Production App, Editor and complete stylesheet in isolated headless Chrome. Not Android or Apple pixel acceptance.',baselineRef,cssSHA256:{baseline:sha(baseline),candidate:sha(candidate)},sourceSHA256:{},runs:[],paintPairs:[],errors:[],externalRequests:[]};
for(const p of ['src/App.tsx','src/Editor.tsx','package.json','pnpm-lock.yaml'])result.sourceSHA256[p]=sha(await readFile(p));
const styles=['plain','lines-small','lines-medium','lines-large','grid-small','grid-medium','grid-large'];
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});result.browser=await browser.version();
 const origin='http://127.0.0.1:'+server.address().port;
 const run=async(version)=>{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:'))return route.continue();result.externalRequests.push(url);return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>result.errors.push(String(e)));await page.clock.setFixedTime(new Date('2026-11-04T04:00:00Z'));await page.goto(origin+'/__check');
  const settle=async()=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});await page.waitForTimeout(320);};
  const swap=async(name)=>{await page.evaluate(css=>{const element=[...document.querySelectorAll('style[data-vite-dev-id]')].find(e=>e.dataset.viteDevId.endsWith('/src/style.css'));if(!element)throw Error('Production stylesheet element missing');element.textContent=css;},name==='baseline'?baseline:candidate);await settle();};
  await swap(version);await page.getByRole('button',{name:'新建备忘录',exact:true}).click();await page.locator('.tiptap').fill('QA-PAPER-ROUNDED-03 Alpha Beta\n第二段：正文与撤销历史保留。');
  await page.waitForFunction(()=>{const n=JSON.parse(localStorage.getItem('notes-browser-preview'))?.notes[0];return n?.plainText.includes('第二段')&&n.revision>0&&!document.querySelector('.save-status');});
  await page.waitForFunction(()=>document.querySelector('.tiptap')?.editor);
  await page.evaluate(()=>{const dom=document.querySelector('.tiptap'),editor=dom.editor;window.__paperIdentity={dom,editor,view:editor.view,viewDOM:editor.view.dom};});
  const freezePath=()=>page.evaluate(()=>{const dom=document.querySelector('.tiptap'),editor=dom.editor;window.__paperPathIdentity={dom,editor,view:editor.view,viewDOM:editor.view.dom};});
  const snapshot=()=>page.evaluate(()=>{const dom=document.querySelector('.tiptap'),e=dom.editor,p=window.__paperIdentity,q=window.__paperPathIdentity||p;let host=dom,fiber;while(host&&!fiber){fiber=host[Object.keys(host).find(k=>k.startsWith('__reactFiber$'))];host=host.parentElement;}const keyed=[];while(fiber){if(fiber.key!==null)keyed.push({key:fiber.key,type:typeof fiber.type==='string'?fiber.type:fiber.type?.name||fiber.type?.type?.name||null});fiber=fiber.return;}return {document:e.getJSON(),selection:e.state.selection.toJSON(),editable:e.isEditable,focused:e.isFocused,stored:JSON.parse(localStorage.getItem('notes-browser-preview')).notes[0].paperStyle,history:(()=>{const p=e.state.plugins.find(p=>p.key.startsWith('history$')),h=p?.getState(e.state);return h?{done:h.done.eventCount,undone:h.undone.eventCount}:null;})(),identity:{editor:e===p.editor,view:e.view===p.view,dom:dom===p.dom,viewDOM:e.view.dom===p.viewDOM},pathIdentity:{editor:e===q.editor,view:e.view===q.view,dom:dom===q.dom,viewDOM:e.view.dom===q.viewDOM},keyed};});
  const reselection=async()=>{await page.evaluate(()=>{const e=document.querySelector('.tiptap').editor;e.commands.setTextSelection({from:3,to:8});e.commands.blur();});await page.waitForFunction(()=>!document.querySelector('.tiptap').editor.isFocused);};
  const open=async()=>{await page.locator('button[aria-label="更多"]:visible').first().click();await page.getByRole('button',{name:'横线与网格',exact:true}).click();await page.locator('.modal-paper').waitFor();await settle();};
  const picker=()=>page.evaluate(()=>{const props=['width','height','borderRadius','borderTopWidth','borderTopColor','backgroundColor','backgroundImage','boxShadow','position','overflow','padding','margin','outlineStyle','outlineWidth','outlineOffset'];return [...document.querySelectorAll('.paper-option')].map(b=>{const r=b.getBoundingClientRect(),c=getComputedStyle(b),a=getComputedStyle(b,'::after'),p=b.querySelector('.paper-preview');return{id:b.dataset.paperStyle,selected:b.classList.contains('selected'),rect:[r.x,r.y,r.width,r.height],computed:Object.fromEntries(props.map(k=>[k,c[k]])),after:Object.fromEntries(['content','position','top','right','bottom','left','borderTopWidth','borderTopColor','borderRadius','pointerEvents','boxSizing','width','height'].map(k=>[k,a[k]])),preview:p?{rect:(()=>{const r=p.getBoundingClientRect();return[r.x,r.y,r.width,r.height];})(),mask:getComputedStyle(p).maskImage}:null,hits:[[-1,-1],[0.5,0.5],[r.width/2,0.5],[r.width/2,r.height/2],[r.width+1,r.height+1]].map(([x,y])=>{const h=document.elementFromPoint(r.x+x,r.y+y);return {point:[x,y],target:h?.closest('button')?.dataset.paperStyle||h?.className||null};})};});});
  const invariant=state=>{assert(state.keyed.some(x=>x.type==='SearchEditorHost'),'Actual keyed SearchEditorHost observed');assert.equal(state.editable,true);assert.equal(state.focused,false);};
  const record={version,initial:null,choices:[],closes:[],short:null};result.runs.push(record);await reselection();record.initial=await snapshot();invariant(record.initial);
  for(const style of styles){
   await reselection();await freezePath();const before=await snapshot();await open();await page.locator(`button[data-paper-style="${style}"]`).click();await page.locator('.modal-paper').waitFor({state:'detached'});await settle();const after=await snapshot();const observation={style,before,after,selectionPreserved:JSON.stringify(before.selection)===JSON.stringify(after.selection),keyPreserved:JSON.stringify(before.keyed)===JSON.stringify(after.keyed),historyPreserved:JSON.stringify(before.history)===JSON.stringify(after.history)};record.choices.push(observation);invariant(after);assert.deepEqual(after.document,record.initial.document);assert.equal(after.stored,style);
   await open();const options=await picker();assert.deepEqual(options.filter(x=>x.selected).map(x=>x.id),[style]);
   if(version==='candidate'){
    const beforePaint=await snapshot();const pair={style,viewport:{width:390,height:844},deviceScaleFactor:2};
    for(const paint of ['baseline','candidate']){await swap(paint);pair[paint]=await picker();await page.locator('.modal-paper').screenshot({path:resolve(output,`mobile-${style}-${paint}.png`),animations:'disabled'});}
    const geometry=o=>o.map(({after,computed,...rest})=>({...rest,computed:Object.fromEntries(Object.entries(computed).filter(([k])=>!k.startsWith('outline')))}));
    assert.deepEqual(await snapshot(),beforePaint,'Full CSS swap preserves actual App/Editor state');assert.deepEqual(geometry(pair.candidate),geometry(pair.baseline),'White card, pattern, position and hit targets preserved across full CSS swap');result.paintPairs.push(pair);
   }
   await page.getByRole('button',{name:'取消',exact:true}).click();await settle();const cancelled=await snapshot();assert.deepEqual(cancelled,after);
  }
  for(const method of ['Escape','backdrop-handler']){const before=await snapshot();await open();if(method==='Escape')await page.keyboard.press('Escape');else await page.locator('.modal-backdrop').dispatchEvent('click');await page.locator('.modal-paper').waitFor({state:'detached'});await settle();assert.deepEqual(await snapshot(),before);record.closes.push({method,preserved:true,kind:method==='backdrop-handler'?'DOM event dispatched to unchanged production handler':'headless keyboard'});}
  await page.setViewportSize({width:390,height:500});await open();await page.locator('button[data-paper-style="grid-large"]').scrollIntoViewIfNeeded();await settle();record.short={options:await picker(),sheet:await page.locator('.modal-paper').evaluate(el=>({scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}))};assert(record.short.sheet.scrollTop>0);await page.locator('.modal-paper').screenshot({path:resolve(output,`short-${version}.png`),animations:'disabled'});await page.locator('button[data-paper-style="grid-large"]').click();await page.locator('.modal-paper').waitFor({state:'detached'});await settle();invariant(await snapshot());
  await page.setViewportSize({width:1088,height:800});await open();const desktop={};for(const paint of ['baseline','candidate']){await swap(paint);desktop[paint]=await picker();await page.locator('.modal-paper').screenshot({path:resolve(output,`desktop-${version}-${paint}.png`),animations:'disabled'});}assert.deepEqual(desktop.baseline,desktop.candidate);record.desktop=desktop;
  await page.getByRole('button',{name:'取消',exact:true}).click();await settle();invariant(await snapshot());await context.close();
 };
 await run('baseline');await run('candidate');
 const [a,b]=result.runs;
 // Keys contain random note IDs; compare their persistence within each real App above.
 for(let i=0;i<styles.length;i++){assert.deepEqual(a.choices[i].after.document,b.choices[i].after.document);assert.deepEqual(a.choices[i].after.selection,b.choices[i].after.selection);assert.equal(a.choices[i].selectionPreserved,b.choices[i].selectionPreserved);assert.equal(a.choices[i].keyPreserved,b.choices[i].keyPreserved);assert.equal(a.choices[i].historyPreserved,b.choices[i].historyPreserved);assert.deepEqual(a.choices[i].after.pathIdentity,b.choices[i].after.pathIdentity);}
 result.preexistingRisks=result.runs[0].choices.filter(x=>!x.selectionPreserved||!x.keyPreserved||!x.historyPreserved||!Object.values(x.after.pathIdentity).every(Boolean)).map(x=>({style:x.style,selectionBefore:x.before.selection,selectionAfter:x.after.selection,keyPreserved:x.keyPreserved,historyBefore:x.before.history,historyAfter:x.after.history,pathIdentity:x.after.pathIdentity}));assert.deepEqual(result.errors,[]);assert.deepEqual(result.externalRequests,[]);result.pass=true;result.acceptance='CSS no-regression comparison passed; preexistingRisks remain separate open behavior gaps.';
}catch(error){result.pass=false;result.failure={message:String(error),stack:error.stack};process.exitCode=1;}
finally{await browser?.close();await vite.close();await new Promise(done=>server.close(done));await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,output,failure:result.failure?.message}));}
