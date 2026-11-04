// Production React form + complete CSS, isolated callbacks and local headless browser only.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';

const sourceOut=resolve('docs/verification/mac-folder-form-geometry15');
const out=resolve(process.argv[2]||resolve(sourceOut,'browser-attempt02'));
await mkdir(out,{recursive:false});
const base=await readFile('src/style.css','utf8');
const baseline=await readFile(resolve(sourceOut,'baseline-smart-folders.css'),'utf8');
const candidate=await readFile('src/smart-folders.css','utf8');
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{SmartFolderForm}from'/src/SmartFolderForm.tsx';import'/src/style.css';const root=createRoot(document.getElementById('root'));let key=0;window.mountForm=(options={})=>{window.events={cancels:0,saves:[]};document.getElementById('root').className=options.mobile?'app mobile':'app desktop native-toolbar';flushSync(()=>root.render(React.createElement(SmartFolderForm,{key:++key,mobile:false,catalog:['校准'],...options,onCancel:()=>window.events.cancels++,onSave:async(draft)=>{window.events.saves.push(structuredClone(draft));return{id:'controlled',complete:true}},onRefresh:async()=>{throw Error('No backend in geometry fixture')},onHandle:handle=>window.formHandle=handle})));};window.fixtureReady=true;`;
const vite=await createViteServer({configFile:false,cacheDir:resolve(out,'vite-cache'),plugins:[{name:'isolated-folder-fixture',resolveId(id){if(id==='/__folder.tsx')return id},load(id){if(id==='/__folder.tsx')return entry}},react()],server:{middlewareMode:true,hmr:false,watch:{ignored:['**/src-tauri/target/**','**/artifacts/**','**/docs/verification/**']}},appType:'custom'});
const server=createServer((req,res)=>{if(req.url==='/__folder'){res.setHeader('content-type','text/html');vite.transformIndexHtml(req.url,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__folder.tsx"></script></html>').then(html=>res.end(html));}else vite.middlewares(req,res)});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const result={scope:'Actual production React form and complete production CSS; callbacks isolated, no App bridge/backend/DB/native input. Headless Chromium plus separate WK snapshots are not installed-package pixel acceptance.',cases:[],errors:[],externalRequests:[]};let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:1088,height:660},deviceScaleFactor:2});
 await context.route('**/*',route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();result.externalRequests.push(route.request().url());return route.abort()});
 const page=await context.newPage();page.on('pageerror',error=>result.errors.push(String(error)));page.setDefaultTimeout(10000);
 await page.goto(origin+'/__folder');await page.waitForFunction(()=>window.fixtureReady);
 await page.evaluate(()=>{document.querySelectorAll('style').forEach(s=>s.remove());const s=document.createElement('style');s.id='controlled-css';document.head.append(s)});
 const css=async value=>{await page.evaluate(value=>document.querySelector('#controlled-css').textContent=value,base+'\n'+value);await page.evaluate(()=>document.fonts.ready)};
 const mount=async(options={})=>{await page.evaluate(options=>window.mountForm(options),options);await page.locator('[role=dialog]').waitFor()};
 const snapshot=()=>page.evaluate(()=>{const panel=document.querySelector('.smart-form'),p=panel.getBoundingClientRect();const box=e=>{const r=e.getBoundingClientRect();return{x:r.x-p.x,y:r.y-p.y,width:r.width,height:r.height}};const inspect=e=>e?({rect:box(e),style:Object.fromEntries(Array.from(getComputedStyle(e)).map(k=>[k,getComputedStyle(e).getPropertyValue(k)]))}):null;return{panel:inspect(panel),name:inspect(document.querySelector('input[aria-label="名称"]')),heading:inspect(panel.querySelector('h2,strong')),checkbox:panel.querySelector('.smart-make input')?inspect(panel.querySelector('.smart-make input')):null,make:panel.querySelector('.smart-make')?inspect(panel.querySelector('.smart-make')):null,explanation:panel.querySelector('.smart-make p')?inspect(panel.querySelector('.smart-make p')):null,footer:panel.querySelector('footer')?inspect(panel.querySelector('footer')):null,buttons:[...panel.querySelectorAll('footer button,.smart-mobile-header button')].map(inspect),ordinary:panel.classList.contains('smart-ordinary'),scroll:{clientWidth:panel.clientWidth,scrollWidth:panel.scrollWidth,clientHeight:panel.clientHeight,scrollHeight:panel.scrollHeight}}});
 const approx=(value,target,tolerance=.1)=>assert(Math.abs(value-target)<tolerance,`${value} != ${target}`);
 await css(baseline);await mount();const old=await snapshot();await page.screenshot({path:resolve(out,'baseline-chromium.png')});
 approx(old.panel.rect.width,680);approx(old.buttons[0].rect.width,80);approx(old.buttons[1].rect.x-old.buttons[0].rect.x-old.buttons[0].rect.width,8);
 await css(candidate);const ordinary=await snapshot();await page.screenshot({path:resolve(out,'candidate-chromium.png')});
 result.cases.push({name:'ordinary-production-layout',baseline:old,candidate:ordinary});
 // Chromium rounds a 0.5px border differently; native WK geometry is checked separately.
 approx(ordinary.panel.rect.width,400);approx(ordinary.panel.rect.height,207,.6);approx(ordinary.footer.rect.x,20);approx(ordinary.footer.rect.y,146);approx(ordinary.footer.rect.width,360);
 approx(ordinary.buttons[0].rect.x,212);approx(ordinary.buttons[1].rect.x,300);approx(ordinary.buttons[0].rect.y,163,.6);approx(ordinary.buttons[0].rect.width,80);approx(ordinary.buttons[0].rect.height,24);
 assert.equal(ordinary.heading.style['font-size'],'13px');approx(ordinary.checkbox.rect.y,96);approx(ordinary.checkbox.rect.width,16);approx(ordinary.name.rect.y,56);approx(ordinary.name.rect.height,24);
 assert.equal(ordinary.name.style['outline-width'],'2px');assert.equal(ordinary.footer.style['border-top-width'],'1px');
 const markup=await page.locator('.smart-form-backdrop').evaluate(e=>e.outerHTML);
 await writeFile(resolve(out,'candidate-native.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+base+'\n'+candidate+'</style><div id="root"><div class="app desktop native-toolbar">'+markup+'</div></div></html>');
 await page.getByRole('textbox',{name:'名称',exact:true}).fill('保留草稿名称');
 await page.getByRole('checkbox').check();assert.equal(await page.locator('.smart-ordinary').count(),0);const smart=await snapshot();approx(smart.panel.rect.width,680);
 await css(baseline);const smartOld=await snapshot();assert.deepEqual(smart,smartOld);await css(candidate);
 await page.getByRole('checkbox').uncheck();assert.equal(await page.locator('.smart-ordinary').count(),1);assert.equal(await page.getByRole('textbox',{name:'名称',exact:true}).inputValue(),'保留草稿名称');approx((await snapshot()).panel.rect.width,400);
 await page.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.events),{cancels:1,saves:[]});result.cases.push({name:'smart-toggle-retains-name-and-cancel',smartUnchanged:smart});
 await mount();await page.getByRole('textbox',{name:'名称',exact:true}).fill('');await page.getByRole('button',{name:'好',exact:true}).click();await page.getByRole('alert').waitFor();const error=await snapshot();assert(error.panel.rect.height>ordinary.panel.rect.height);assert.equal(await page.evaluate(()=>window.events.saves.length),0);assert(error.buttons.every(b=>b.rect.y+b.rect.height<=error.panel.rect.height));result.cases.push({name:'empty-name-error-grows-with-footer',layout:error});
 await page.getByRole('textbox',{name:'名称',exact:true}).fill('长名称'.repeat(80));const long=await snapshot();approx(long.panel.rect.width,400);assert(long.scroll.scrollWidth<=long.scroll.clientWidth);result.cases.push({name:'long-name-contained',layout:long});
 await mount();await page.getByRole('textbox',{name:'名称',exact:true}).fill('普通文件夹');await page.getByRole('button',{name:'好',exact:true}).click();await page.getByRole('dialog',{name:'同步文件夹'}).waitFor();assert.equal(await page.locator('.smart-ordinary').count(),0);assert.equal((await page.evaluate(()=>window.events.saves))[0].smart,false);approx(await page.locator('.smart-form').evaluate(e=>e.getBoundingClientRect().width),680);result.cases.push({name:'ordinary-submit-and-sync-excluded',events:await page.evaluate(()=>window.events)});
 for(const width of [700,390,280]){await page.setViewportSize({width,height:660});await mount();const s=await snapshot();assert(s.panel.rect.width<=width-20);assert(s.scroll.scrollWidth<=s.scroll.clientWidth);assert(s.buttons.every(b=>b.rect.x>=0&&b.rect.x+b.rect.width<=s.panel.rect.width));result.cases.push({name:'narrow-'+width,layout:s})}
 await page.setViewportSize({width:280,height:180});await mount();await page.getByRole('textbox',{name:'名称',exact:true}).fill('');await page.getByRole('button',{name:'好',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).scrollIntoViewIfNeeded();assert(await page.getByRole('button',{name:'取消',exact:true}).isVisible());const short=await snapshot();assert(short.scroll.scrollHeight>short.scroll.clientHeight);result.cases.push({name:'short-viewport-error-scrolls',layout:short});
 const folder={id:'controlled-smart',kind:'smart',parentId:null,name:'智能定义',sortOrder:0,createdAt:1,definitionRevision:1,query:{version:1,combine:'all',rules:[{type:'pinned',value:true}]}};
 await page.setViewportSize({width:1088,height:660});await mount({folder});await css(baseline);const editOld=await snapshot();await css(candidate);assert.deepEqual(await snapshot(),editOld);assert.equal(await page.locator('.smart-make').count(),0);assert.equal(await page.locator('.smart-ordinary').count(),0);result.cases.push({name:'smart-edit-excluded',layout:editOld});
 await page.setViewportSize({width:390,height:844});await mount({mobile:true});await css(baseline);const mobileOld=await snapshot();await css(candidate);assert.deepEqual(await snapshot(),mobileOld);assert.equal(await page.locator('.smart-ordinary').count(),0);result.cases.push({name:'mobile-create-excluded',layout:mobileOld});
 await page.getByRole('button',{name:/过滤条件/}).click();await css(baseline);const filterOld=await snapshot();await css(candidate);assert.deepEqual(await snapshot(),filterOld);result.cases.push({name:'mobile-filter-excluded',layout:filterOld});
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.externalRequests,[]);result.status='pass';
}catch(error){result.status='fail';result.failure=String(error);throw error}finally{await writeFile(resolve(out,'browser-result.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await new Promise(done=>server.close(done));await vite.close()}
console.log(JSON.stringify({status:result.status,cases:result.cases.map(c=>c.name)}));
