// Device-free pause timing policies only. No App, ADB, private data or network.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {samplePhonePause,phoneSnapshot,USERNAME} from './account109-three-peers.mjs';

function fixture({statusMs=()=>0,workspaceMs=()=>0,statusChange=()=>{},workspaceChange=()=>{}}={}){
  let time=0,statuses=0,workspaces=0;const waits=[];
  const workspace={notes:[{id:'local',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'synthetic local body'}]},{type:'attachment',attrs:{id:'attachment'}}]},plainText:'synthetic local body'}],attachments:[{id:'attachment',noteId:'local',displayName:'synthetic.bin',mime:'application/octet-stream',kind:'file',size:1}]};
  return {waits,counts:()=>({statuses,workspaces}),args:{before:phoneSnapshot(workspace),remoteId:'remote',now:()=>time,
    sleep:async ms=>{assert(ms>=0&&ms<=100);waits.push(ms);time+=ms;},
    readStatus:async()=>{time+=statusMs(++statuses);const s={state:'paused',enabled:false,profile:{subject:'synthetic-owner',username:USERNAME},devices:[{current:true,connected:false},{current:false,connected:false}]};statusChange(s,statuses);return s;},
    readWorkspace:async()=>{time+=workspaceMs(++workspaces);const ws=structuredClone(workspace);workspaceChange(ws,workspaces);return ws;}}};
}

test('pause requires both repeated samples and three seconds, with nonnegative bounded waits',async()=>{
  const f=fixture();assert.deepEqual(await samplePhonePause(f.args),{samples:31,observedMs:3000});assert.deepEqual(f.waits,Array(30).fill(100));
  for(const delay of [{statusMs:()=>1600,workspaceMs:()=>1600},{statusMs:n=>n===1?3200:0},{workspaceMs:n=>n===1?3200:0}]){
    // The old duration-only exit asserted on the first slow sample; a second is still required.
    const slow=fixture(delay);const proof=await samplePhonePause(slow.args);
    assert.equal(proof.samples,2);assert.equal(proof.observedMs,delay.statusMs&&delay.workspaceMs?6400:3200);assert.deepEqual(slow.counts(),{statuses:2,workspaces:2});assert.deepEqual(slow.waits,[]);
  }
});

test('pause accepts before the fixed deadline but rejects at/after it, without starting more reads',async()=>{
  const early=fixture({workspaceMs:n=>n===1?3200:26799});assert.deepEqual(await samplePhonePause(early.args),{samples:2,observedMs:29999});assert.deepEqual(early.waits,[]);
  for(const end of [30000,30001]){
    const late=fixture({workspaceMs:n=>n===1?3200:end-3200});await assert.rejects(()=>samplePhonePause(late.args),{code:'CONDITION_TIMEOUT:phone pause'});assert.deepEqual(late.counts(),{statuses:2,workspaces:2});assert.deepEqual(late.waits,[]);
  }
  for(const kind of ['statusMs','workspaceMs']){
    const expired=fixture({[kind]:()=>30000});await assert.rejects(()=>samplePhonePause(expired.args),{code:'CONDITION_TIMEOUT:phone pause'});assert.deepEqual(expired.counts(),{statuses:1,workspaces:kind==='statusMs'?0:1});assert.deepEqual(expired.waits,[]);
  }
});

test('pause state, owner, exclusion and full snapshot failures stop immediately instead of resampling',async()=>{
  for(const change of [s=>{s.state='ready';},s=>{s.enabled=true;},s=>{s.devices[1].connected=true;},s=>{s.profile.username='different-synthetic-user';},s=>{s.error={code:'account_network'};}]){
    const f=fixture({workspaceMs:()=>3200,statusChange:(s,n)=>{if(n===2)change(s);}});await assert.rejects(()=>samplePhonePause(f.args));assert.deepEqual(f.counts(),{statuses:2,workspaces:1});assert.deepEqual(f.waits,[]);
  }
  for(const change of [ws=>{ws.notes.push({id:'remote'});},ws=>{ws.notes=[];},ws=>{ws.notes[0].document.content[0].content[0].text='changed';},ws=>{ws.notes[0].plainText='changed';},ws=>{ws.attachments[0].noteId='different-owner';},ws=>{ws.attachments[0].size=2;}]){
    const f=fixture({workspaceMs:()=>3200,workspaceChange:(ws,n)=>{if(n===2)change(ws);}});await assert.rejects(()=>samplePhonePause(f.args));assert.deepEqual(f.counts(),{statuses:2,workspaces:2});assert.deepEqual(f.waits,[]);
  }
});

test('pause propagates the original status/workspace read error without another attempt',async()=>{
  const error=Object.assign(Error('synthetic read failure'),{code:'ANDROID_CDP_TIMEOUT'});
  for(const kind of ['statusChange','workspaceChange']){
    const f=fixture({workspaceMs:()=>3200,[kind]:(_,n)=>{if(n===2)throw error;}});await assert.rejects(()=>samplePhonePause(f.args),e=>e===error);assert.deepEqual(f.counts(),{statuses:2,workspaces:kind==='statusChange'?1:2});assert.deepEqual(f.waits,[]);
  }
});
