// Read actual mounted RecordingSession refs through React Fiber. No app/ref or
// platform API mutation. The only action is one real native Cancel button tap.
import { execFileSync } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url));
const targets=await(await fetch('http://127.0.0.1:9227/json/list')).json();
const target=targets.find(t=>new URL(t.url).origin==='http://tauri.localhost');
if(!target)throw Error('Missing actual app target');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let seq=0;const jobs=new Map();
ws.onmessage=({data})=>{const m=JSON.parse(data),j=jobs.get(m.id);if(!j)return;jobs.delete(m.id);clearTimeout(j.timer);m.error?j.reject(Error(m.error.message)):j.resolve(m.result)};
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{jobs.delete(id);reject(Error('CDP timeout'))},8000);jobs.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))})}
const find=`(()=>{const el=document.querySelector('.recording-sheet');if(!el)throw Error('No recording sheet');const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));let f=el[key];for(let i=0;f&&i<40;i++,f=f.return){let h=f.memoizedState;for(let j=0;h&&j<40;j++,h=h.next){const s=h.memoizedState?.current;if(s&&'recorder'in s&&typeof s.start==='function'&&typeof s.dispose==='function'&&typeof s.stop==='function')return {session:s,recorder:s.recorder,context:s.context,tracks:[...(s.tracks||[])]};}}throw Error('Actual session ref absent')})()`;
const snapshot=`function(){const s=this.session;return {at:performance.now(),observerPresent:!!window.__mediaBaseline,panelPresent:!!document.querySelector('.recording-sheet'),session:{live:s.live,started:s.started,failed:s.failed,finished:s.finished,stopping:s.stopping,timer:s.timer,recorderIsNull:s.recorder===null,contextIsNull:s.context===null,trackCount:s.tracks?.length},heldRecorder:this.recorder&&{state:this.recorder.state,mimeType:this.recorder.mimeType},heldContext:this.context&&{state:this.context.state},heldTracks:this.tracks.map(t=>({kind:t.kind,readyState:t.readyState,enabled:t.enabled,muted:t.muted}))}}`;
try{
 const found=await call('Runtime.evaluate',{expression:find,objectGroup:'media02-session-read',returnByValue:false});if(found.exceptionDetails)throw Error(JSON.stringify(found.exceptionDetails));const objectId=found.result.objectId;if(!objectId)throw Error('Missing session handle');
 const read=async()=>{const r=await call('Runtime.callFunctionOn',{objectId,functionDeclaration:snapshot,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 const before=await read();if(before.observerPresent)throw Error('Observer must be removed before clean sample');if(before.heldRecorder?.state!=='recording')throw Error('Actual recording not active');
 const r=await call('Runtime.evaluate',{expression:`(()=>{const b=[...document.querySelectorAll('.recording-sheet button')].find(e=>e.textContent.trim()==='取消');if(!b)throw Error('Cancel missing');const r=b.getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio+83]})()`,returnByValue:true});const point=r.result.value.map(Math.round);
 appendFileSync(path.join(out,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),op:'native-cancel-with-readonly-session-handle',point,observationWrappersPresent:false})+'\n');
 execFileSync('/Users/water/Library/Android/sdk/platform-tools/adb',['-s','emulator-5580','shell','input','tap',...point.map(String)]);
 await new Promise(resolve=>setTimeout(resolve,800));const after=await read();
 writeFileSync(path.join(out,'unwrapped-cancel-session-refs.json'),JSON.stringify({method:'Read-only CDP handle to actual React RecordingSession and original recorder/context/tracks; native Cancel; no API wrappers or app/ref writes',before,after},null,2)+'\n');
 console.log(JSON.stringify({before,after},null,2));
}finally{await call('Runtime.releaseObjectGroup',{objectGroup:'media02-session-read'}).catch(()=>{});ws.close()}
