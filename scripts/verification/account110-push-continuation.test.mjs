import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActionTrace,ACTIONS,syncAction,argumentsFor} from './account110-push-continuation.mjs';
import {syncOnce} from './account110-device-actions.mjs';
const sentinel='private-sentinel https://invalid.test raw credential';
const target='22222222-2222-4222-8222-222222222222';
const status=op=>({state:'ready',enabled:true,devices:[],pendingCount:0,conflictCount:0,...(op?{deviceOperation:op}:{})});
const op=phase=>({deviceId:target,direction:'push',phase,startedAt:1,...(phase==='succeeded'?{finishedAt:2}:{})});
test('fixed CLI rejects alternate roots, signin, endpoint and duplicate options',()=>{
 assert.equal(argumentsFor(['--run','--output','/private/tmp/account110-device-actions-continuation-01']),'/private/tmp/account110-device-actions-continuation-01');
 for(const args of [[],['--output','/private/tmp/x'],['--run','--output','/tmp/account110-device-actions-continuation-01'],['--run','--output','/private/tmp/account110-device-actions-continuation-01','--endpoint',sentinel],['--run','--output','/private/tmp/account110-device-actions-continuation-../x']])assert.throws(()=>argumentsFor(args),{code:'INVALID_ARGUMENTS'});
});
test('action labels are fixed, never expression or arguments',()=>{
 assert.equal(syncAction({sequence:1,command:{type:'syncDevice'}}),'sync.start');assert.equal(syncAction({type:'status'}),'sync.status');assert.equal(syncAction({sequence:1}),'sync.poll');
 for(const a of [{type:'signIn'},{sequence:1,raw:sentinel},{type:'status',raw:sentinel},{sequence:0},null])assert.throws(()=>syncAction(a),{code:'INVALID_ARGUMENTS'});
});
test('durable finite begin precedes invocation and return data never reaches trace',async()=>{
 const events=[];let now=0;const t=new ActionTrace({now:()=>now,save:async()=>events.push(t.records.at(-1).event)});
 const value=await t.call('a','sync.start',async()=>{assert.deepEqual(events,['begin']);now=10;return {raw:sentinel};});
 assert.equal(value.raw,sentinel);assert.deepEqual(events,['begin','ok']);assert.equal(t.records[1].durationMs,10);assert(!JSON.stringify(t.records).includes(sentinel));
});
test('unknown action or exhausted bound never invokes native',async()=>{
 let calls=0;const t=new ActionTrace({limit:1});await assert.rejects(t.call('a','sync.start',()=>calls++),{code:'TRACE_LIMIT'});assert.equal(calls,0);
 await assert.rejects(new ActionTrace().call('a',sentinel,()=>calls++),{code:'INVALID_ARGUMENTS'});assert.equal(calls,0);
});
test('begin persistence failure never invokes native',async()=>{let calls=0;const t=new ActionTrace({save:async()=>{throw Error(sentinel);}});await assert.rejects(t.call('a','sync.start',()=>calls++));assert.equal(calls,0);});
test('native timeout retains finite phase only, no diagnostic or error text',async()=>{
 const t=new ActionTrace(),error=Object.assign(Error(sentinel),{code:'NATIVE_TIMEOUT',payload:sentinel});
 await assert.rejects(t.call('a','sync.status',()=>Promise.reject(error),{lifecycle:{failurePhase:'evalNotObserved',nativeDiagnostic:{message:sentinel}}}),e=>e===error);
 assert.equal(t.records.at(-1).code,'NATIVE_TIMEOUT');assert.equal(t.records.at(-1).nativePhase,'evalNotObserved');assert(!JSON.stringify(t.records).includes(sentinel));
 const u=new ActionTrace();await assert.rejects(u.call('a','sync.poll',()=>Promise.reject(Error(sentinel)),{lifecycle:{failurePhase:sentinel}}));assert.equal(u.records.at(-1).nativePhase,null);assert.equal(u.records.at(-1).code,'CHECK_FAILED');
});
for(const boundary of ['sync.start','sync.status','sync.poll'])test('real syncOnce marks exact '+boundary+' timeout without retry or changing default request timeout',async()=>{
 const t=new ActionTrace();const seen=[];let started=0;const facade={evaluate:async(...args)=>{
  assert.equal(args.length,2);const label=syncAction(args[1]);seen.push(label);
  return t.call('a',label,async()=>{if(label===boundary)throw Object.assign(Error(sentinel),{code:'NATIVE_TIMEOUT'});if(label==='sync.start'){started++;return {started:true,sequence:1};}if(label==='sync.status')return status(op('running'));return {sequence:1,done:false,failed:false};});
 }};
 await assert.rejects(syncOnce(facade,target,'push'),{code:'NATIVE_TIMEOUT'});assert.equal(t.records.at(-1).action,boundary);assert.equal(t.records.at(-1).event,'error');assert(seen.filter(s=>s==='sync.start').length===1);assert.equal(started,boundary==='sync.start'?0:1);assert(!JSON.stringify(t.records).includes(sentinel));
});
test('actual syncOnce still requires successful terminal and records all boundaries',async()=>{
 const t=new ActionTrace();const result=await syncOnce({evaluate:async(expression,arg)=>t.call('a',syncAction(arg),async()=>{switch(syncAction(arg)){case 'sync.start':return {started:true,sequence:1};case 'sync.status':return status(op('running'));case 'sync.poll':return {sequence:1,done:true,failed:false,status:status(op('succeeded'))};}})},target,'push');
 assert.equal(result.status.deviceOperation.phase,'succeeded');assert.deepEqual(t.records.filter(r=>r.event==='ok').map(r=>r.action),['sync.start','sync.status','sync.poll']);assert.equal(ACTIONS.filter(x=>x.startsWith('sync.')).length,3);
});
test('actual syncOnce failed terminal remains failure',async()=>{await assert.rejects(syncOnce({evaluate:async(expression,arg)=>{switch(syncAction(arg)){case 'sync.start':return {started:true,sequence:1};case 'sync.status':return status();case 'sync.poll':return {sequence:1,done:true,failed:true};}}},target,'push'),{code:'ACCOUNT_COMMAND_FAILED'});});
