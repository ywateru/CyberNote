import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
const out=resolve('docs/verification/mobile-folder-visual28-fix01-independent');
const paths=JSON.parse(await readFile('docs/verification/mobile-folder-visual28/execution-record.json','utf8')).environmentPaths;
const {chromium}=await import(pathToFileURL(paths.PLAYWRIGHT_CORE_PATH));
const entry=`import React from'react';import{createRoot}from'react-dom/client';import App from'/src/App.tsx';import'/src/style.css';createRoot(document.getElementById('root')).render(React.createElement(App));`;
const vite=await createViteServer({configFile:false,cacheDir:resolve(out,'vite-cache'),plugins:[{name:'independent28',resolveId(id){if(id==='/__independent28.tsx')return id},load(id){if(id==='/__independent28.tsx')return entry}},react()],server:{middlewareMode:true,hmr:false,watch:{ignored:['**/src-tauri/target/**','**/artifacts/**','**/docs/verification/**']}},appType:'custom'});
const server=createServer(async(req,res)=>{if(req.url==='/__check'){res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__independent28.tsx"></script></html>'))}else vite.middlewares(req,res)});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
let browser;const result={scope:'Narrow fix01 independent actual App/fullCSS coordinate hit and page isolation; no native device or OS input.',checks:[],errors:[],externalRequests:[]};
const check=(name,value)=>{result.checks.push({name,pass:!!value});assert(value,name)};
const f=(id,name,kind,sortOrder)=>({id,name,kind,parentId:null,sortOrder,createdAt:1793790000000});
const note=(id,folderId,deletedAt=null)=>({id,folderId,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'独立文件夹验收'}]}]},title:'独立文件夹验收',plainText:'独立文件夹验收',createdAt:1793790000000,updatedAt:1793790000000,pinned:true,deletedAt,originalFolderId:deletedAt?'default':null,locked:false,paperStyle:'plain',revision:0});
const ws={folders:[f('quick','快速备忘录','quick',-1),f('default','备忘录','default',0),f('trash','最近删除','trash',9999),{...f('smart','独立智能','smart',1),definitionRevision:1,query:{version:1,combine:'all',rules:[{type:'pinned',value:true}]}}],notes:[note('n1','default'),note('q1','quick'),note('t1','trash',1793790000000)],attachments:[],settings:{theme:'light',view:'list',selectedFolder:'all',selectedNote:''}};
try{
 browser=await chromium.launch({executablePath:paths.CHROME_PATH,headless:true,args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:390,height:746},deviceScaleFactor:1080/390,hasTouch:true});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(result.externalRequests.push(r.request().url()),r.abort()));
 await context.addInitScript(data=>localStorage.setItem('notes-browser-preview',JSON.stringify(data)),ws);
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(String(e)));page.setDefaultTimeout(10000);await page.goto(origin+'/__check');await page.locator('.app.page-folders').waitFor();await page.evaluate(()=>document.fonts.ready);
 const inspect=()=>page.locator('.folder-footer > button').first().evaluate(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b,'::before');return{rect:{x:r.x,y:r.y,width:r.width,height:r.height},position:getComputedStyle(b).position,pseudo:{content:s.content,width:s.width,height:s.height,right:s.right,top:s.top,bottom:s.bottom,left:s.left},svg:b.querySelector('svg').outerHTML}});
 result.mobile=await inspect();const b=result.mobile.rect;
 check('original24x24 button and34x24 extension',b.x===17&&b.y===708&&b.width===24&&b.height===24&&result.mobile.position==='relative'&&result.mobile.pseudo.width==='34px'&&result.mobile.pseudo.height==='24px');
 result.clicks=[];
 for(const [name,dx,dy,expected] of [['plus-center',28.6,5,true],['circle-near-right-inside',32,5,true],['original-button-center',12,12,true],['one-pixel-outside-right',35,5,false],['one-pixel-outside-top',28.6,-1,false],['one-pixel-outside-bottom',28.6,25,false]]){
  const point={x:b.x+dx,y:b.y+dy};const element=await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return{tag:e?.tagName,class:e?.className,label:e?.getAttribute('aria-label')}},point);
  await page.mouse.click(point.x,point.y);await page.waitForTimeout(50);const count=await page.getByRole('dialog').count();result.clicks.push({name,point,element,expectedOpen:expected,actualDialogs:count});check(name+' actual coordinate opens exactly expected dialog',count===(expected?1:0));
  if(count){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'})}
 }
 await page.screenshot({path:resolve(out,'mobile-current.png')});
 await page.getByRole('button',{name:/快速备忘录/}).click();await page.locator('.app.page-notes').waitFor();result.notes=await inspect();check('notes has no pseudo and unchanged static position',result.notes.pseudo.content==='none'&&result.notes.position==='static');
 await page.setViewportSize({width:1088,height:660});await page.locator('.app.desktop').waitFor();result.desktop=await inspect();check('desktop has no pseudo and unchanged static position',result.desktop.pseudo.content==='none'&&result.desktop.position==='static');
 check('no JS errors or external requests',result.errors.length===0&&result.externalRequests.length===0);result.status='pass';await context.close();
}catch(e){result.status='fail';result.failure=String(e);process.exitCode=1}
finally{await writeFile(resolve(out,'app-result.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await new Promise(done=>server.close(done));await vite.close()}
console.log(JSON.stringify(result));
