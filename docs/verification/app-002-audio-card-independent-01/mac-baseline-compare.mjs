import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, statfs } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as viteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { rust } from '../../../scripts/audio-card-rust-fixture.mjs';

const output=resolve('docs/verification/app-002-audio-card-independent-01/mac-compare01');
await mkdir(output);const space=await statfs(output);assert(space.bavail*space.bsize>=2*1024**3);
const binary=process.env.NOTES_AUDIO_CARD_BINARY;
const store=rust(binary,resolve(output,'store'));
let browser,vite,server;
const sha=x=>createHash('sha256').update(x).digest('hex');
const baseEditor=execFileSync('git',['show','96b2263:src/Editor.tsx'],{encoding:'utf8'});
const baseStyle=execFileSync('git',['show','96b2263:src/style.css'],{encoding:'utf8'});
const baseId=resolve('src/__review_base_editor.tsx'),styleId=resolve('src/__review_base_style.css');
try{
 const initial=await store.call('load_workspace');const expected={sessionId:initial.access.sessionId,epoch:initial.access.epoch,noteEpoch:null};
 const note=await store.call('workspace_action',{action:{type:'createNote'},expected});
 const known=(await store.call('store_attachment_operation',{operationId:randomUUID(),noteId:note.id,name:'这是非常长的真实录音标题用于验证窄屏下文字省略与播放按钮可达.webm',mime:'audio/webm',data:Buffer.from('independent synthetic mac compare').toString('base64'),recordedAt:1793721599123,expected:{...expected,noteEpoch:0}})).attachment;
 const entry=version=>`import React from'react';import{createRoot}from'react-dom/client';import NoteEditor from'${version==='baseline'?'/src/__review_base_editor.tsx':'/src/Editor.tsx'}';import{loadWorkspace}from'/src/bridge.ts';import'${version==='baseline'?'/src/__review_base_style.css':'/src/style.css'}';const ws=await loadWorkspace(),a=ws.attachments.find(a=>a.id===${JSON.stringify(known.id)}),n=ws.notes.find(n=>n.id===a.noteId);n.document={type:'doc',content:[{type:'paragraph'},{type:'attachment',attrs:{id:a.id,kind:a.kind,name:a.displayName}}]};createRoot(document.querySelector('#root')).render(React.createElement('div',{className:'app desktop',style:{display:'block',padding:16,width:'100vw',height:'100vh'}},React.createElement(NoteEditor,{note:n,onChange:()=>{},onReady:e=>window.editor=e,onFocus:()=>{}})));`;
 vite=await viteServer({configFile:false,cacheDir:resolve('artifacts/review-mac-compare-vite-cache'),plugins:[react(),{name:'review-actual-old-and-new',enforce:'pre',resolveId:id=>id==='/__baseline.tsx'||id==='/__candidate.tsx'?id:id==='/src/__review_base_editor.tsx'?baseId:id==='/src/__review_base_style.css'?styleId:id==='@tauri-apps/api/core'?'\0review-native':undefined,load:id=>id==='/__baseline.tsx'?entry('baseline'):id==='/__candidate.tsx'?entry('candidate'):id===baseId?baseEditor:id===styleId?baseStyle:id==='\0review-native'?"export const isTauri=()=>true;export const invoke=(...args)=>window.nativeInvoke(...args);":undefined}],server:{middlewareMode:true,hmr:false},appType:'custom'});
 server=createServer((req,res)=>{if(req.url==='/baseline'||req.url==='/candidate'){res.setHeader('Content-Type','text/html');vite.transformIndexHtml(req.url,`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__${req.url.slice(1)}.tsx"></script>`).then(x=>res.end(x));}else vite.middlewares(req,res);});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
 const{chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:1280,height:800},timezoneId:'Asia/Shanghai'});
 await context.addInitScript(()=>{const values=new WeakMap();const state=a=>{if(!values.has(a))values.set(a,{duration:NaN,currentTime:0,readyState:0,paused:true,error:null,src:''});return values.get(a);};for(const key of['duration','currentTime','readyState','paused','error','src'])Object.defineProperty(HTMLMediaElement.prototype,key,{configurable:true,get(){return state(this)[key];},set(x){state(this)[key]=x;}});HTMLMediaElement.prototype.load=function(){};HTMLMediaElement.prototype.pause=function(){state(this).paused=true;this.dispatchEvent(new Event('pause'));};});
 const results={},errors=[],external=[];let baselinePNG;
 for(const version of['baseline','candidate']){
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.exposeFunction('nativeInvoke',(c,p)=>store.call(c,p));
  await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();external.push(u);return route.abort();});
  await page.goto(origin+'/'+version);await page.waitForFunction(()=>!!document.querySelector('audio')?.src);
  await page.evaluate(()=>{const a=document.querySelector('audio');a.duration=2.6;a.readyState=2;a.dispatchEvent(new Event('loadedmetadata'));a.dispatchEvent(new Event('canplay'));});
  await page.getByText('录音 · 0:02',{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>{const q=s=>document.querySelector(s);const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};const elements=['.audio-card','.audio-summary','.audio-title-toggle','.audio-summary strong','.audio-play-toggle','.audio-expand'];return{elements:Object.fromEntries(elements.map(s=>[s,{rect:rect(q(s)),font:getComputedStyle(q(s)).font,color:getComputedStyle(q(s)).color,background:getComputedStyle(q(s)).backgroundColor}])),visibleSmall:[...document.querySelectorAll('.audio-summary small')].filter(x=>getComputedStyle(x).display!=='none').map(x=>({text:x.textContent,rect:rect(x),font:getComputedStyle(x).font})),title:q('.audio-summary strong').textContent};});
  const png=await page.locator('.audio-card').screenshot({path:resolve(output,version+'.png')});results[version]={geometry,pngSHA256:sha(png)};if(version==='baseline')baselinePNG=png;else results.exactPNGBinaryEqual=baselinePNG.equals(png);
  await page.close();
 }
 assert.deepEqual(results.candidate.geometry,results.baseline.geometry);assert.equal(results.exactPNGBinaryEqual,true);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({status:'pass',baseline:'96b226317d07877db65c6ea215bab73dd4cfb78e',candidate:'9303b48492a83ac21fe596591295d4973eb6f517',browser:await browser.version(),binarySHA256:sha(await readFile(binary)),baseEditorSHA256:sha(baseEditor),baseStyleSHA256:sha(baseStyle),...results,errors,external,limits:'Same 1280x800 Chrome/actual Editor and NodeView/controlled media/actual Rust authorized read. Identical compact card pixels for this one same-input fixture only; no native Mac or Apple Notes parity claim.'},null,2)+'\n');
 console.log('Desktop same-input baseline/candidate geometry and exact compact-card PNG bytes match.');
}finally{
 await writeFile(resolve(output,'transport.json'),JSON.stringify(store.log,null,2)+'\n');await store.close();await browser?.close();await vite?.close();if(server)await new Promise(done=>server.close(done));
}
