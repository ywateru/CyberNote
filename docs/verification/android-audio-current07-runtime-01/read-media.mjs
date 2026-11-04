// Passive CDP reads only. No clicks, writes, IPC, audio bytes or database reads.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const out=dirname(fileURLToPath(import.meta.url));
const tag=process.argv[2]; if(!/^[a-z0-9-]+$/.test(tag))throw Error('tag');
const targets=await(await fetch('http://127.0.0.1:9237/json/list')).json();
const target=targets.find(x=>x.url==='http://tauri.localhost/');if(!target)throw Error('App target absent');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
let id=0;const pending=new Map();ws.onmessage=({data})=>{const m=JSON.parse(data);if(!m.id)return;const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.j(m.error):p.r(m.result)};
const call=(method,params)=>new Promise((r,j)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);j(Error('timeout'))},10000);pending.set(n,{r,j,timer});ws.send(JSON.stringify({id:n,method,params}))});
try{
 const read=await call('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return{url:location.href,viewport:[innerWidth,innerHeight,devicePixelRatio],visibleText:document.body.innerText,audio:[...document.querySelectorAll('audio')].map(a=>({duration:Number.isFinite(a.duration)?a.duration:String(a.duration),currentTime:a.currentTime,paused:a.paused,ended:a.ended,seeking:a.seeking,readyState:a.readyState,muted:a.muted,error:a.error&&{code:a.error.code,message:a.error.message}})),buttons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({text:e.textContent,label:e.getAttribute('aria-label'),disabled:e.disabled,rect:rect(e)}))}})()`});
 if(read.exceptionDetails)throw Error(JSON.stringify(read.exceptionDetails));
 const proto=await call('Runtime.evaluate',{expression:'HTMLAudioElement.prototype'});
 const instances=await call('Runtime.queryObjects',{prototypeObjectId:proto.result.objectId});
 const detached=await call('Runtime.callFunctionOn',{objectId:instances.objects.objectId,returnByValue:true,functionDeclaration:'function(){return Array.from(this).map(a=>({connected:a.isConnected,duration:Number.isFinite(a.duration)?a.duration:String(a.duration),currentTime:a.currentTime,paused:a.paused,ended:a.ended,seeking:a.seeking,readyState:a.readyState,muted:a.muted,error:a.error&&{code:a.error.code,message:a.error.message}}))}'});
 if(detached.exceptionDetails)throw Error(JSON.stringify(detached.exceptionDetails));
 const result={readAtUtc:new Date().toISOString(),scope:'Passive DOM and actual HTMLAudioElement scalar reads (including detached preview elements via CDP queryObjects); src, bytes, private app state and database omitted.',...read.result.value,allAudioElements:detached.result.value};
 await call('Runtime.releaseObject',{objectId:instances.objects.objectId});
 await call('Runtime.releaseObject',{objectId:proto.result.objectId});
 writeFileSync(join(out,tag+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({tag,readAtUtc:result.readAtUtc,text:result.visibleText,allAudioElements:result.allAudioElements},null,2));
}finally{ws.close()}
