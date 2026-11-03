// Independent installed-app test driver. UI mutations use Android input only;
// debugging protocol is used for read-only observations, never editor commands.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
const out=path.dirname(new URL(import.meta.url).pathname);
const adb='/Users/water/Library/Android/sdk/platform-tools/adb';
const pkg='com.local.notesclone';
const run=(...a)=>execFileSync(adb,['-s','emulator-5580',...a],{encoding:'utf8'});
const pause=(ms=350)=>new Promise(r=>setTimeout(r,ms));
let ws, seq=0, jobs=new Map();
const errors=[];
async function connect(){
 const pid=run('shell','pidof',pkg).trim().split(' ')[0];
 run('forward','tcp:9226',`localabstract:webview_devtools_remote_${pid}`);
 const list=await(await fetch('http://127.0.0.1:9226/json/list')).json();
 const target=list.find(t=>t.url.startsWith('http://tauri.localhost'));
 if(!target)throw Error('Installed Tauri target absent');
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const job=jobs.get(m.id);jobs.delete(m.id);clearTimeout(job.timer);m.error?job.reject(Error(JSON.stringify(m.error))):job.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params)};
 await send('Runtime.enable');
}
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{jobs.delete(id);reject(Error(`timeout ${method}`))},10000);jobs.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})}
async function read(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value}
const inspect=`(()=>{const ed=document.querySelector('.tiptap'), e=ed?.editor;const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};return {url:location.href,title:document.title,app:document.querySelector('.app')?.className,active:document.activeElement?.outerHTML?.slice(0,300),viewport:[innerWidth,innerHeight,devicePixelRatio],selection:e?.state.selection.toJSON(),document:e?.getJSON(),focused:e?.isFocused,editor:ed?rect(ed):null,buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>({label:b.getAttribute('aria-label'),text:b.textContent,cls:b.className,paper:b.dataset.paperStyle,rect:rect(b)})),paper:[...document.querySelectorAll('.paper-option')].map(b=>({style:b.dataset.paperStyle,selected:b.classList.contains('selected'),rect:rect(b)})),drawings:[...document.querySelectorAll('.drawing-surface,.drawing-node')].map(b=>({cls:b.className,style:getComputedStyle(b).backgroundImage,size:getComputedStyle(b).backgroundSize,rect:rect(b)})),text:ed?.innerText,domSelection:window.getSelection()?.toString()}})()`;
async function snapshot(name){
 const state=await read(inspect);state.imeShown=/mInputShown=true/.test(run('shell','dumpsys','input_method'));state.errors=errors;
 if(name){writeFileSync(path.join(out,`${name}.json`),JSON.stringify(state,null,2)+'\n');writeFileSync(path.join(out,`${name}.png`),execFileSync(adb,['-s','emulator-5580','exec-out','screencap','-p']));}
 return state;
}
mkdirSync(out,{recursive:true});await connect();
console.log(JSON.stringify({ready:true,state:await snapshot('android-initial')}));
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{
  const a=JSON.parse(line);appendFileSync(path.join(out,'android-actions.jsonl'),JSON.stringify({at:new Date().toISOString(),...a})+'\n');
  let result;
  if(a.op==='snap')result=await snapshot(a.name);
  else if(a.op==='workspace')result=await read("window.__TAURI_INTERNALS__.invoke('load_workspace')");
  else if(a.op==='read')result=await read(a.expression);
  else if(a.op==='tap'){
   let p=a.point;if(a.selector){const r=await read(`(()=>{const all=[...document.querySelectorAll(${JSON.stringify(a.selector)})].filter(b=>b.getBoundingClientRect().width>0);const b=all[${a.index||0}];if(!b)throw Error('No visible target');const r=b.getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio]})()`);p=r}
   if(a.selector)p[1]+=83; // observed WebView top below native status bar in this device's 1080x2280 screenshot
   run('shell','input','tap',...p.map(n=>String(Math.round(n))));await pause();result=await snapshot(a.name);
  }else if(a.op==='text'){run('shell','input','text',a.text.replaceAll(' ','%s'));await pause();result=await snapshot(a.name)}
  else if(a.op==='key'){run('shell','input','keyevent',String(a.key));await pause();result=await snapshot(a.name)}
  else if(a.op==='swipe'){run('shell','input','swipe',...a.points.map(String),String(a.duration||400));await pause();result=await snapshot(a.name)}
  else if(a.op==='cold'){ws.close();run('shell','am','force-stop',pkg);run('shell','am','start','-W','-n',`${pkg}/.MainActivity`);await pause(800);await connect();result=await snapshot(a.name)}
  else throw Error('unknown operation');
  console.log(JSON.stringify({ok:true,op:a.op,result:a.op==='read'?result:{app:result.app,viewport:result.viewport,selection:result.selection,imeShown:result.imeShown,domSelection:result.domSelection,paper:result.paper,buttons:result.buttons?.map(b=>({label:b.label,text:b.text})),text:result.text}}));
 }catch(e){console.log(JSON.stringify({ok:false,error:e.stack}))}
}
