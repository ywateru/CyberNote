import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {openRuntime,waitForState,state,saveJSON} from '../../../scripts/debug/runtime.mjs';
import {sourceFingerprint} from '../../../scripts/debug/source-identity.mjs';
const out=resolve(process.argv[2]),start=performance.now();let runtime, failure;const cases=[];const input=await sourceFingerprint(process.cwd());
try{runtime=await openRuntime();const p=runtime.page;
 const reject=async(label,page,predicate,timeoutMs)=>{const began=performance.now();let error;try{await waitForState(page,predicate,{timeoutMs,label});}catch(e){error=e;}const result={label,code:error?.code,lastState:!!error?.lastState?.workspace,elapsedMs:performance.now()-began,timeoutMs};cases.push(result);assert.equal(result.code,'TIMEOUT');assert.ok(result.elapsedMs>=timeoutMs-10&&result.elapsedMs<timeoutMs+1500);return result;};
 let count=0;const noMatch=await reject('real App async false',p,async()=>{count++;return false;},750);assert.ok(count>0&&noMatch.lastState);noMatch.predicateCalls=count;
 const began=performance.now();let truthyCalls=0;const actual=await waitForState(p,async s=>{truthyCalls++;return performance.now()-began>125&&s.selection.noteId==='note-a';},{timeoutMs:1000});cases.push({label:'real App delayed true',elapsedMs:performance.now()-began,predicateCalls:truthyCalls,noteId:actual.selection.noteId});assert.ok(truthyCalls>1&&performance.now()-began>125);
 count=0;await reject('real App late true predicate',p,async()=>{count++;await new Promise(r=>setTimeout(r,220));return true;},100);assert.ok(count===1);
 count=0;await reject('real App never settling predicate',p,()=>{count++;return new Promise(()=>{});},100);assert.ok(count===1);
 count=0;let transportCalls=0;const slowPage={evaluate:async(...args)=>{transportCalls++;await new Promise(r=>setTimeout(r,150));return p.evaluate(...args);}};const slow=await reject('slow initial real App transport',slowPage,()=>{count++;return false;},60);assert.ok(!slow.lastState&&count===0&&transportCalls===1);slow.predicateCalls=count;
 count=0;const stalled=await reject('never settling transport',{evaluate:()=>new Promise(()=>{})},()=>{count++;return true;},60);assert.ok(!stalled.lastState&&count===0);stalled.predicateCalls=count;
 assert.ok((await state(p)).workspace);assert.deepEqual(runtime.errors,[]);
}catch(e){failure={message:e.message,stack:e.stack};process.exitCode=1;}finally{const pageErrors=runtime?.errors??[];await runtime?.cleanup();await saveJSON(resolve(out,'result.json'),{input,inputAfter:await sourceFingerprint(process.cwd()),cases,failure,pageErrors,completeWallMs:performance.now()-start});console.log(JSON.stringify({pass:!failure,cases:cases.length,failure,completeWallMs:performance.now()-start}));}
