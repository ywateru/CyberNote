// Frozen installed package only. All UI changes use native Android input.
// CDP reads actual DOM, React refs, browser objects, and the real Rust workspace.
// No platform wrappers, editor/ref writes, synthetic media, or DOM clicks.
import { execFileSync } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const out = path.dirname(fileURLToPath(import.meta.url));
export const adb = '/Users/water/Library/Android/sdk/platform-tools/adb';
export const run = (...args) => execFileSync(adb, ['-s', 'emulator-5580', ...args], { encoding: 'utf8' });
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export const log = action => appendFileSync(path.join(out, 'actions.jsonl'), JSON.stringify({at:new Date().toISOString(),...action})+'\n');
export const save = (name,value) => writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
export async function connect() {
  const pid=run('shell','pidof','com.local.notesclone').trim().split(' ')[0];
  run('forward','tcp:9227',`localabstract:webview_devtools_remote_${pid}`);
  const targets=await(await fetch('http://127.0.0.1:9227/json/list')).json();
  const target=targets.find(t=>new URL(t.url).origin==='http://tauri.localhost');
  if(!target)throw Error('Actual installed app target missing');
  const ws=new WebSocket(target.webSocketDebuggerUrl);let sequence=0;const jobs=new Map();
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  ws.onmessage=({data})=>{const m=JSON.parse(data),j=jobs.get(m.id);if(!j)return;jobs.delete(m.id);clearTimeout(j.timer);m.error?j.reject(Error(JSON.stringify(m.error))):j.resolve(m.result)};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{jobs.delete(id);reject(Error('CDP timeout '+method))},8000);jobs.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
  const read=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  const close=async()=>{await call('Runtime.releaseObjectGroup',{objectGroup:'independent-media-paper'}).catch(()=>{});ws.close()};
  return {pid,call,read,close};
}
export const stateExpression=`(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
 const ed=document.querySelector('.tiptap'),editor=ed?.editor;
 let fiber;for(let node=ed;node&&!fiber;node=node.parentElement){const k=Object.keys(node).find(k=>k.startsWith('__reactFiber$'));if(k)fiber=node[k]}
 const keyed=[];for(let i=0;fiber&&i<40;i++,fiber=fiber.return)if(fiber.key!==null)keyed.push({key:fiber.key,type:typeof fiber.type==='function'?fiber.type.name:typeof fiber.type==='string'?fiber.type:String(fiber.type)});
 const sheet=document.querySelector('.modal-paper'),css=sheet&&getComputedStyle(sheet);
 return {capturedAt:new Date().toISOString(),userAgent:navigator.userAgent,activeElement:document.activeElement?.tagName,url:location.href,viewport:[innerWidth,innerHeight,devicePixelRatio],app:document.querySelector('.app')?.className,text:document.body.innerText,observerPresent:!!window.__mediaBaseline,
 document:editor?.getJSON(),selection:editor?.state.selection.toJSON(),editable:editor?.isEditable,focused:editor?.isFocused,domSelection:window.getSelection()?.toString(),keyed,
 buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>({text:b.textContent,label:b.getAttribute('aria-label'),disabled:b.disabled,cls:b.className,rect:rect(b)})),
 sheet:sheet&&{rect:rect(sheet),clientHeight:sheet.clientHeight,scrollHeight:sheet.scrollHeight,scrollTop:sheet.scrollTop,paddingBottom:css.paddingBottom,paddingTop:css.paddingTop,overflowY:css.overflowY},
 paper:[...document.querySelectorAll('.paper-option')].map(b=>{const p=b.querySelector('.paper-preview'),c=p&&getComputedStyle(p);return {style:b.dataset.paperStyle,selected:b.classList.contains('selected'),rect:rect(b),preview:p&&{rect:rect(p),maskImage:c.maskImage,webkitMaskImage:c.webkitMaskImage,maskSize:c.maskSize,webkitMaskSize:c.webkitMaskSize,maskMode:c.maskMode,backgroundColor:c.backgroundColor}}}),
 recording:document.querySelector('.recording-sheet')?.innerText,
 audio:[...document.querySelectorAll('audio')].map(a=>({duration:Number.isFinite(a.duration)?a.duration:String(a.duration),currentTime:a.currentTime,paused:a.paused,ended:a.ended,seeking:a.seeking,expand:(()=>{const e=document.querySelector('.audio-expand');const r=e?.getBoundingClientRect();return e?{display:getComputedStyle(e).display,rect:{x:r.x,y:r.y,w:r.width,h:r.height}}:null})(),range:(()=>{const e=document.querySelector('.audio-detail input');return e?{value:e.value,max:e.max,min:e.min}:null})(),readyState:a.readyState,networkState:a.networkState,seekable:Array.from({length:a.seekable.length},(_,i)=>[a.seekable.start(i),Number.isFinite(a.seekable.end(i))?a.seekable.end(i):String(a.seekable.end(i))]),error:a.error&&{code:a.error.code,message:a.error.message}}))};
})()`;
export async function snapshot(c,name){const s=await c.read(stateExpression);s.imeShown=/mInputShown=true/.test(run('shell','dumpsys','input_method'));s.pid=run('shell','pidof','com.local.notesclone').trim();save(name,s);writeFileSync(path.join(out,name+'.png'),execFileSync(adb,['-s','emulator-5580','exec-out','screencap','-p']));return s}
export async function tap(c,selector,text,name){const point=await c.read(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.y+r.height>0&&r.y<innerHeight&&(${JSON.stringify(text)}===undefined||b.textContent.trim()===${JSON.stringify(text)})});if(!b)throw Error('Visible native target absent');const r=b.getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio+83]})()`);log({op:'native-tap',selector,text,point,name});run('shell','input','tap',...point.map(n=>String(Math.round(n))));await pause(500);return snapshot(c,name)}
export async function store(c,name){const value=await c.read(`window.__TAURI_INTERNALS__.invoke('load_workspace').then(w=>({notes:w.notes.filter(n=>n.title.startsWith('MEDIA02-')||n.title.startsWith('QA-PAPER-')),attachmentCountTotal:w.attachments.length,attachments:w.attachments.filter(a=>w.notes.some(n=>n.id===a.noteId&&(n.title.startsWith('MEDIA02-')||n.title.startsWith('QA-PAPER-'))))}))`);save(name,value);return value}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [action='inspect',name='current',selector,text]=process.argv.slice(2);const c=await connect();
 try{let value;if(action==='tap')value=await tap(c,selector,text,name);else if(action==='store')value=await store(c,name);else if(action==='text'){log({op:'native-text',value:selector,name});run('shell','input','text',selector.replaceAll(' ','%s'));await pause(500);value=await snapshot(c,name)}else if(action==='back'){log({op:'native-back',name});run('shell','input','keyevent','4');await pause(500);value=await snapshot(c,name)}else if(action==='inspect')value=await snapshot(c,name);else throw Error('Unknown finite action');console.log(JSON.stringify(value,null,2))}finally{await c.close()}
}
