// Installed app only. Android native inputs perform UI actions. CDP reads DOM,
// HTMLMediaElement and authoritative Rust load_workspace state; no editor/store
// mutation, MediaRecorder wrapper, synthetic event, or page-function shortcut.
import { execFileSync } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const out=dirname(fileURLToPath(import.meta.url));
const adb='/Users/water/Library/Android/sdk/platform-tools/adb';
const run=(...args)=>execFileSync(adb,['-s','emulator-5580',...args],{encoding:'utf8',timeout:15000});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const [action='inspect',name='state',selector,text]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid evidence name');
let target;
for(let attempt=0;attempt<20&&!target;attempt++){
 try{const targets=await(await fetch('http://127.0.0.1:9227/json/list')).json();target=targets.find(t=>t.url==='http://tauri.localhost/');}catch{}
 if(!target)await sleep(250);
}
if(!target)throw Error('Expected installed app target absent after bounded startup wait');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
let seq=0;const pending=new Map();const errors=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(!m.id){if(m.method==='Runtime.exceptionThrown')errors.push(m.params);return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method))},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
const read=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const log=value=>appendFileSync(join(out,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');
const state=`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};const visible=e=>e.getBoundingClientRect().width>0;const a=document.querySelector('audio');const range=document.querySelector('.audio-detail input');return {url:location.href,userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight,devicePixelRatio],text:document.body.innerText,activeElement:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')},buttons:[...document.querySelectorAll('button')].filter(visible).map(e=>({text:e.textContent,label:e.getAttribute('aria-label'),disabled:e.disabled,cls:e.className,rect:rect(e)})),inputs:[...document.querySelectorAll('input')].filter(visible).map(e=>({type:e.type,placeholder:e.placeholder,label:e.getAttribute('aria-label'),value:e.value,min:e.min,max:e.max,disabled:e.disabled,rect:rect(e)})),document:document.querySelector('.tiptap')?.editor?.getJSON(),paperStyle:document.querySelector('.tiptap')?.getAttribute('data-paper-style'),selection:document.querySelector('.tiptap')?.editor?.state?.selection?.toJSON(),selectedText:getSelection()?.toString(),audio:a?{duration:Number.isFinite(a.duration)?a.duration:String(a.duration),currentTime:a.currentTime,paused:a.paused,ended:a.ended,seeking:a.seeking,readyState:a.readyState,muted:a.muted,error:a.error&&{code:a.error.code,message:a.error.message},srcMime:a.currentSrc.startsWith('data:')?a.currentSrc.slice(5,a.currentSrc.indexOf(';base64,')):null,expand:(()=>{const e=document.querySelector('.audio-expand');return e?{display:getComputedStyle(e).display,rect:rect(e)}:null})(),range:range?{min:range.min,max:range.max,value:range.value,disabled:range.disabled,ariaValueText:range.getAttribute('aria-valuetext')}:null}:null,observer:!!window.__mediaBaseline};})()`;
try{
 await call('Runtime.enable');
 if(action==='store'){
  const value=await read(`window.__TAURI_INTERNALS__.invoke('load_workspace').then(w=>({notes:w.notes.filter(n=>['a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3','1a0718dd-c71c-4192-89b6-bd58cb9ba475'].includes(n.id)),attachments:w.attachments.filter(a=>a.noteId==='a9d1bbe7-a0ee-4f46-ba3e-e0889085cac3'),counts:{notes:w.notes.length,attachments:w.attachments.length}}))`);
  writeFileSync(join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify(value,null,2));
 }else{
  if(action==='tap'||action==='double-tap'||action==='long-press'){
   const point=await read(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0&&(${JSON.stringify(text)}===undefined||e.textContent.trim()===${JSON.stringify(text)}));if(!e)throw Error('Target absent');const r=e.getBoundingClientRect();return[(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio+83]})()`);
   log({action:'native-'+action,name,selector,text,point});const coords=point.map(n=>String(Math.round(n)));if(action==='long-press')run('shell','input','swipe',...coords,...coords,'700');else{run('shell','input','tap',...coords);if(action==='double-tap'){await sleep(80);run('shell','input','tap',...coords);}}await sleep(600);
  }else if(action==='text'){
   log({action:'native-text',name,text:selector});run('shell','input','text',selector.replaceAll(' ','%s'));await sleep(600);
  }else if(action==='back'){
   log({action:'native-back',name});run('shell','input','keyevent','4');await sleep(600);
  }else if(action==='range'){
   const points=await read(`(()=>{const r=document.querySelector('.audio-detail input');if(!r||r.disabled)throw Error('Range unavailable');const b=r.getBoundingClientRect();const left=b.x+8,width=b.width-16;return{start:(left+width*(+r.value)/(+r.max))*devicePixelRatio,end:(left+width*${Number(selector)})*devicePixelRatio,y:(b.y+b.height/2)*devicePixelRatio+83}})()`);
   log({action:'native-range-swipe',name,fraction:Number(selector),...points});run('shell','input','swipe',String(Math.round(points.start)),String(Math.round(points.y)),String(Math.round(points.end)),String(Math.round(points.y)),'350');await sleep(700);
  }else if(action!=='inspect')throw Error('Unknown action');
  const value=await read(state);value.runtimeErrorsSinceConnection=errors;
  writeFileSync(join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
  writeFileSync(join(out,name+'.png'),execFileSync(adb,['-s','emulator-5580','exec-out','screencap','-p'],{timeout:15000}));
  console.log(JSON.stringify({name,text:value.text,audio:value.audio,selection:value.selection,selectedText:value.selectedText,viewport:value.viewport,buttons:value.buttons.map(b=>({text:b.text,label:b.label,disabled:b.disabled}))},null,2));
 }
}finally{ws.close()}
