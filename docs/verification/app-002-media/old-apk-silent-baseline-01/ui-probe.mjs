// Installed frozen APK only. UI actions are Android input; CDP observes the
// real platform APIs and reads state. No synthetic stream/editor/store writes.
import { execFileSync } from "node:child_process";
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const out = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(out, { recursive: true });
const adb = "/Users/water/Library/Android/sdk/platform-tools/adb";
const run = (...args) => execFileSync(adb, ["-s", "emulator-5580", ...args], { encoding: "utf8" });
const log = (value) => appendFileSync(path.join(out, "actions.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...value }) + "\n");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = await (await fetch("http://127.0.0.1:9227/json/list")).json();
const target = targets.find((t) => t.url.startsWith("http://tauri.localhost"));
if (!target) throw Error("Installed app target missing");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  const job = pending.get(message.id);
  if (!job) return;
  pending.delete(message.id); clearTimeout(job.timer);
  message.error ? job.reject(Error(message.error.message)) : job.resolve(message.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`timeout ${method}`)); }, 8000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function read(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const stateExpression = `(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
 const visible=e=>e.getBoundingClientRect().width>0;
 const ob=window.__mediaBaseline;
 return {url:location.href,viewport:[innerWidth,innerHeight,devicePixelRatio],text:document.body.innerText,
  document:document.querySelector('.tiptap')?.editor?.getJSON(),
  buttons:[...document.querySelectorAll('button')].filter(visible).map(b=>({text:b.textContent,label:b.getAttribute('aria-label'),disabled:b.disabled,cls:b.className,rect:rect(b)})),
  recording:document.querySelector('.recording-sheet')?.innerText,
  audio:[...document.querySelectorAll('audio')].map(a=>({srcPrefix:a.currentSrc.slice(0,48),duration:Number.isFinite(a.duration)?a.duration:String(a.duration),currentTime:a.currentTime,paused:a.paused,readyState:a.readyState,error:a.error&&{code:a.error.code,message:a.error.message}})),
  observer:ob?{logs:ob.logs,streams:ob.streams.map(s=>s.getTracks().map(t=>({kind:t.kind,readyState:t.readyState,enabled:t.enabled,muted:t.muted}))),recorders:ob.recorders.map(r=>({state:r.state,mimeType:r.mimeType})),contexts:ob.contexts.map(c=>({state:c.state,sampleRate:c.sampleRate}))}:null};
})()`;
const observeExpression = `(()=>{
 if(window.__mediaBaseline)return {alreadyInstalled:true};
 const ob={logs:[],streams:[],recorders:[],contexts:[]};window.__mediaBaseline=ob;
 const note=(type,value={})=>ob.logs.push({at:performance.now(),type,...value});
 const md=navigator.mediaDevices, originalGet=md?.getUserMedia;
 if(originalGet){ob.originalGet=originalGet;md.getUserMedia=async function(...args){note('getUserMedia-call',{constraints:args[0]});try{const s=await Reflect.apply(originalGet,this,args);ob.streams.push(s);note('getUserMedia-resolve',{tracks:s.getTracks().map(t=>({kind:t.kind,readyState:t.readyState}))});return s;}catch(e){note('getUserMedia-reject',{name:e.name,message:e.message});throw e;}};}
 for(const [name,key] of [['MediaRecorder','recorders'],['AudioContext','contexts']]){
  const original=window[name];ob['original'+name]=original;if(!original)continue;
  window[name]=new Proxy(original,{construct(target,args){const value=Reflect.construct(target,args);ob[key].push(value);note(name+'-construct',{mimeType:value.mimeType});if(name==='MediaRecorder')for(const type of ['start','pause','resume','stop','error','dataavailable'])value.addEventListener(type,e=>note('recorder-'+type,type==='dataavailable'?{size:e.data.size,mimeType:e.data.type}:{}));return value;}});
 }
 return {installed:true,hasGetUserMedia:!!originalGet,hasMediaRecorder:!!ob.originalMediaRecorder,hasAudioContext:!!ob.originalAudioContext};
})()`;
try {
  const [action = "inspect", name = "state", selector, text] = process.argv.slice(2);
  if (!/^[a-z0-9-]+$/.test(name)) throw Error("Invalid evidence name");
  if (action === "observe") console.log(JSON.stringify(await read(observeExpression)));
  else if (action === "tap") {
    const point = await read(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.getBoundingClientRect().width>0&&(${JSON.stringify(text)}===undefined||b.textContent.trim()===${JSON.stringify(text)}));if(!b)throw Error('visible target absent');const r=b.getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio+83]})()`);
    log({ op: "native-tap", name, selector, text, point });
    run("shell", "input", "tap", ...point.map((n) => String(Math.round(n)))); await sleep(600);
  } else if (action === "text") {
    log({ op: "native-text", name, text: selector });
    run("shell", "input", "text", selector.replaceAll(" ", "%s")); await sleep(500);
  } else if (action === "back") {
    log({ op: "native-back", name }); run("shell", "input", "keyevent", "4"); await sleep(500);
  } else if (action === "store") {
    const result = await read(`window.__TAURI_INTERNALS__.invoke('load_workspace').then(w=>({notes:w.notes.filter(n=>n.title.startsWith('MEDIA02-')),attachmentCountTotal:w.attachments.length,attachments:w.attachments.filter(a=>w.notes.some(n=>n.id===a.noteId&&n.title.startsWith('MEDIA02-')))}))`);
    writeFileSync(path.join(out, name + ".json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } else if (action === "cleanup") {
    console.log(JSON.stringify(await read(`(()=>{const ob=window.__mediaBaseline;if(!ob)return {absent:true};if(ob.originalGet)navigator.mediaDevices.getUserMedia=ob.originalGet;for(const n of ['MediaRecorder','AudioContext'])if(ob['original'+n])window[n]=ob['original'+n];delete window.__mediaBaseline;return {removed:true};})()`)));
  } else if (action !== "inspect") throw Error("Unknown action");
  if (!["store", "cleanup"].includes(action)) {
    const state = await read(stateExpression);
    writeFileSync(path.join(out, name + ".json"), JSON.stringify(state, null, 2) + "\n");
    writeFileSync(path.join(out, name + ".png"), execFileSync(adb, ["-s", "emulator-5580", "exec-out", "screencap", "-p"]));
    console.log(JSON.stringify({name, ...state}, null, 2));
  }
} finally { ws.close(); }
