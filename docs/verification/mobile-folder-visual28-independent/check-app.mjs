import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createServer as createViteServer} from 'vite';
import react from '@vitejs/plugin-react';
const out=resolve('docs/verification/mobile-folder-visual28-independent');
const paths=JSON.parse(await readFile('docs/verification/mobile-folder-visual28/execution-record.json','utf8')).environmentPaths;
const {chromium}=await import(pathToFileURL(paths.PLAYWRIGHT_CORE_PATH));
const entry=`import React from'react';import{createRoot}from'react-dom/client';import App from'/src/App.tsx';import'/src/style.css';createRoot(document.getElementById('root')).render(React.createElement(App));`;
const vite=await createViteServer({configFile:false,cacheDir:resolve(out,'vite-cache'),plugins:[{name:'independent28',resolveId(id){if(id==='/__independent28.tsx')return id},load(id){if(id==='/__independent28.tsx')return entry}},react()],server:{middlewareMode:true,hmr:false,watch:{ignored:['**/src-tauri/target/**','**/artifacts/**','**/docs/verification/**']}},appType:'custom'});
const server=createServer(async(req,res)=>{if(req.url==='/__check'){res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__independent28.tsx"></script></html>'))}else vite.middlewares(req,res)});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
let browser;const result={scope:'Small independent production App/fullCSS mock browser-host checks; isolated preview storage, no native device or OS input.',checks:[],errors:[],externalRequests:[]};
const check=(name,value)=>{result.checks.push({name,pass:!!value});assert(value,name)};
const f=(id,name,kind,sortOrder)=>({id,name,kind,parentId:null,sortOrder,createdAt:1793790000000});
const note=(id,folderId,deletedAt=null)=>({id,folderId,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'独立文件夹验收'}]}]},title:'独立文件夹验收',plainText:'独立文件夹验收',createdAt:1793790000000,updatedAt:1793790000000,pinned:true,deletedAt,originalFolderId:deletedAt?'default':null,locked:false,paperStyle:'plain',revision:0});
const ws={folders:[f('quick','快速备忘录','quick',-1),f('default','备忘录','default',0),f('trash','最近删除','trash',9999),{...f('smart','独立智能','smart',1),definitionRevision:1,query:{version:1,combine:'all',rules:[{type:'pinned',value:true}]}}],notes:[note('n1','default'),note('q1','quick'),note('t1','trash',1793790000000)],attachments:[],settings:{theme:'light',view:'list',selectedFolder:'all',selectedNote:''}};
try{
 browser=await chromium.launch({executablePath:paths.CHROME_PATH,headless:true,args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:390,height:746},deviceScaleFactor:2,hasTouch:true});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(result.externalRequests.push(r.request().url()),r.abort()));
 await context.addInitScript(data=>localStorage.setItem('notes-browser-preview',JSON.stringify(data)),ws);
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(String(e)));page.setDefaultTimeout(10000);await page.goto(origin+'/__check');await page.locator('.app.page-folders').waitFor();await page.evaluate(()=>document.fonts.ready);
 const rows=page.locator('.folder-row');
 result.branches=await rows.evaluateAll(rows=>rows.map(b=>({text:b.textContent,quickClass:b.classList.contains('mobile-quick-folder-row'),icon:b.querySelector('svg').outerHTML})));
 check('all/smart/trash retain original icons',result.branches.find(x=>x.text.startsWith('全部')).icon.includes('lucide-folder-open')&&result.branches.find(x=>x.text.startsWith('独立智能')).icon.includes('lucide-folder-cog')&&result.branches.find(x=>x.text.startsWith('最近删除')).icon.includes('lucide-trash2'));
 check('quick-only class and decorative local SVG',result.branches.filter(x=>x.quickClass).length===1&&result.branches.find(x=>x.quickClass).icon.includes('pointer-events="none"')&&result.branches.find(x=>x.text.startsWith('备忘录')).icon.includes('aria-hidden="true"'));
 await page.locator('.mobile-quick-folder-row > svg:first-child').click({force:true});await page.locator('.app.page-notes').waitFor();check('painted quick icon routes to real quick notes',await page.locator('.notes-large-title').textContent()==='快速备忘录');await page.locator('.notes-pane .back-button').click();await page.locator('.app.page-folders').waitFor();
 result.footerHit=await page.getByRole('button',{name:'新建文件夹',exact:true}).evaluate(button=>{const svg=button.querySelector('svg'),circle=svg.querySelector('circle'),s=svg.getBoundingClientRect(),b=button.getBoundingClientRect(),x=s.x+Number(circle.getAttribute('cx'))*s.width/24,y=s.y+Number(circle.getAttribute('cy'))*s.height/24,target=document.elementFromPoint(x,y);return{buttonRect:{x:b.x,y:b.y,width:b.width,height:b.height},svgRect:{x:s.x,y:s.y,width:s.width,height:s.height},paintedPlusCenter:{x,y},plusCenterWithinButton:x>=b.x&&x<=b.right&&y>=b.y&&y<=b.bottom,elementAtPlusCenter:target?.outerHTML.slice(0,300),plusCenterResolvesToButton:target===button||button.contains(target)}});
 const prior=await page.evaluate(()=>JSON.parse(localStorage.getItem('notes-browser-preview')).folders);
 await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});check('original footer button center opens; App Escape unmounts without folder mutation',JSON.stringify(await page.evaluate(()=>JSON.parse(localStorage.getItem('notes-browser-preview')).folders))===JSON.stringify(prior));
 await page.mouse.click(result.footerHit.paintedPlusCenter.x,result.footerHit.paintedPlusCenter.y);await page.waitForTimeout(80);result.footerHit.plusCenterClickOpensDialog=await page.getByRole('dialog').count()>0;
 if(result.footerHit.plusCenterClickOpensDialog){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'})}
 await page.screenshot({path:resolve(out,'mobile-current.png')});
 check('no JS errors or external requests',result.errors.length===0&&result.externalRequests.length===0);result.status='pass';
}catch(e){result.status='fail';result.failure=String(e);process.exitCode=1}
finally{await writeFile(resolve(out,'app-result.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await new Promise(done=>server.close(done));await vite.close()}
console.log(JSON.stringify(result));
