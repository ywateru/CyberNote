import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile('src/recording-session.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {RecordingSession}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function queueAt(n,callback){if(n===0)callback();else queueMicrotask(()=>queueAt(n-1,callback))}
const results=[];
for(const authorize of [false,true]) for(let cut=0;cut<=6;cut++) {
 let resolveMedia, created=0, recorded=0, errors=0;
 const stops=[0,0,0];const pending=new Promise(resolve=>resolveMedia=resolve);
 const tracks=stops.map((_,i)=>({stop(){stops[i]++},addEventListener(){},removeEventListener(){}}));
 const environment={...(authorize?{authorize:async()=>{}}:{}),getStream:()=>pending,
 createRecorder(){created++;return {state:'inactive',start(){this.state='recording'},stop(){this.state='inactive'}}},
 createContext:()=>({createAnalyser:()=>({frequencyBinCount:1,disconnect(){}}),createMediaStreamSource:()=>({connect(){},disconnect(){}}),close:async()=>{}}),setInterval:()=>1,clearInterval(){}};
 const session=new RecordingSession({onRecording(){recorded++},onStopped(){},onLevel(){},onError(){errors++}},environment);
 const start=session.start();await tick();resolveMedia({getTracks:()=>tracks});queueAt(cut,()=>session.dispose());await start;await tick();
 const pass=stops.every(x=>x===1)&&errors===0;
 results.push({authorize,cut,stops,created,recorded,errors,pass});
}
console.log(JSON.stringify({status:results.every(x=>x.pass)?'PASS':'BLOCKED',checks:results.length,results,limits:'Production Session, controlled media/context and microtask cancellation; no microphone'},null,2));
assert.ok(results.every(x=>x.pass),'every cancellation cut must release each track once');
