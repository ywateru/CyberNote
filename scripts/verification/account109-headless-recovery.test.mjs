// In-memory native-function orchestration with synthetic disk bytes only.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {STORES,hash,boundedPoll,finishRecovery} from './account109-desktop-recovery.mjs';
import {options,checkpoint,connectedPair,assertExistingConflict,plainDocument,assertCreated,runCases} from './account109-headless-recovery.mjs';
const entityId='272b0013-7b6a-4729-88f0-a10e2fd48e43';
const fixtureBytes=[Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64'),Buffer.from(Array.from({length:4096},(_,i)=>i%256))];
function heads(){return ['甲端并发版本：保留全部甲中文','乙端并发版本：保留全部乙中文'].map((title,i)=>{
  const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
  return {digest:String(i+1).repeat(64),payload:{note:{id:entityId,folderId:'default',title,plainText:title+'\n中文第二段 😀',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:title,marks:[{type:'bold'}]}]},{type:'paragraph',content:[{type:'text',text:'中文第二段 😀'}]},...ids.map(id=>({type:'attachment',attrs:{id}}))]},createdAt:1,updatedAt:10+i,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',sealed:null},attachments:fixtureBytes.map((bytes,j)=>({id:ids[j],noteId:entityId,kind:j?'file':'image',mime:j?'application/octet-stream':'image/png',displayName:j?'account109.bin':'account109.png',size:bytes.length,sha256:hash(bytes)}))}};
});}
const conflict=heads=>({conflicts:[{kind:'note',entityId,variants:heads.map(h=>({digest:h.digest,title:h.payload.note.title,updatedAt:h.payload.note.updatedAt,deleted:false,purged:false,locked:false,attachmentCount:2}))}]});
const initialReport=()=>({status:'running',phase:'baseline',checks:[],observations:[],scenarios:{conflict:'not-run',logout:'not-run'}});

async function harness(mode='ok'){
  const root=await realpath(await mkdtemp(resolve(tmpdir(),'account109-headless-unit-'))),branches=heads(),events=[],children=[],stores={};let clock=0,loggedOut=false,restarted=false;
  for(const name of ['a','b']){const directory=resolve(root,name);await mkdir(resolve(directory,'attachments'),{recursive:true});const payload=structuredClone(branches[name==='a'?0:1].payload);stores[name]={directory,ws:{notes:[payload.note],attachments:payload.attachments.map((a,i)=>({...a,relativePath:'original-'+i}))},conflict:true};for(const [i,bytes] of fixtureBytes.entries())await writeFile(resolve(directory,'attachments','original-'+i),bytes);}
  const statuses=name=>({state:loggedOut&&name==='a'?'signedOut':'ready',enabled:!(loggedOut&&name==='a'),...(loggedOut&&name==='a'?{}:{profile:{username:'cybernoteqa20261113a',subject:'synthetic-owner'}}),conflictCount:stores[name].conflict?1:0,pendingCount:0,devices:loggedOut&&name==='a'?[]:['a','b'].map(id=>({id,current:id===name,online:true,connected:id!==name&&!loggedOut}))});
  async function resolveHeads(){
    for(const name of ['a','b']){const s=stores[name];s.conflict=false;s.ws={notes:[],attachments:[]};for(const [i,h] of branches.entries()){
      const copy=structuredClone(h.payload),id=i?randomUUID():entityId;copy.note.id=id;copy.note.revision=99;s.ws.notes.push(copy.note);
      for(const [j,a] of copy.attachments.entries()){a.id=i?randomUUID():a.id;a.noteId=id;a.relativePath='resolved-'+i+'-'+j;copy.note.document.content[2+j].attrs.id=a.id;s.ws.attachments.push(a);await writeFile(resolve(s.directory,'attachments',a.relativePath),fixtureBytes[j]);}
    }}
  }
  const open=async name=>{
    if(name==='a'&&children.some(c=>c.name==='a'))restarted=true;
    const s=stores[name],peer={name,directory:s.directory,lifecycle:{name,naturalExit:false},ready:async()=>{events.push(name+':ready');return {windows:0};},workspace:async()=>{const ws=structuredClone(s.ws);if(restarted&&name==='a'&&mode==='lost-local')ws.notes=ws.notes.filter(n=>!n.title.startsWith('account109-local-'));return ws;},accountStatus:async()=>{
      if(mode==='auth')return {...statuses(name),state:'error',error:{code:'account_authentication',stage:'coordinatorProfile',providerReason:'identityRejected'}};
      return statuses(name);
    },conflicts:async()=>{events.push(name+':conflicts');const value=s.conflict?conflict(branches):{conflicts:[]};if(mode==='wrong-digest'&&s.conflict)value.conflicts[0].variants[0].digest='f'.repeat(64);if(mode==='extra-conflict'&&s.conflict)value.conflicts.push({...value.conflicts[0],entityId:randomUUID()});return value;},keepAll:async(id,digest)=>{
      events.push(name+':keepAll');assert.equal(id,entityId);assert.equal(digest,branches[0].digest);assert.equal(events.filter(e=>e.endsWith(':keepAll')).length,1,'No repeated resolve');await resolveHeads();return {conflicts:[]};
    },readAttachment:async id=>{const a=s.ws.attachments.find(a=>a.id===id);assert(a);const bytes=mode==='corrupt-read'?Buffer.alloc(a.size):fixtureBytes[a.displayName.endsWith('.png')?0:1];return {data:bytes.toString('base64')};},signOut:async()=>{events.push(name+':signOut');assert.equal(name,'a');loggedOut=true;return statuses(name);},createPlainNote:async(title,text)=>{
      assert(loggedOut,'No new note/conflict base created before real sign-out');const note={...structuredClone(branches[0].payload.note),id:randomUUID(),title,plainText:title+'\n'+text,document:plainDocument(title,text),revision:1};s.ws.notes.push(note);events.push(name+':createPlainNote');return structuredClone(note);
    },close:async()=>{events.push(name+':close');peer.lifecycle.naturalExit=mode!=='cleanup';}};children.push(peer);return peer;
  };
  const clockOptions={now:()=>clock,sleep:async ms=>{
    clock+=ms;
    if(mode==='a-to-b'&&loggedOut&&clock>=200){const local=stores.a.ws.notes.find(n=>n.title.startsWith('account109-local-'));if(local&&!stores.b.ws.notes.some(n=>n.id===local.id))stores.b.ws.notes.push(structuredClone(local));}
    if(mode==='b-to-a'&&loggedOut&&clock>=200){const remote=stores.b.ws.notes.find(n=>n.title.startsWith('account109-remote-'));if(remote&&!stores.a.ws.notes.some(n=>n.id===remote.id))stores.a.ws.notes.push(structuredClone(remote));}
  }};
  return {root,branches,events,children,stores,open,clock:clockOptions,cleanup:()=>rm(root,{recursive:true,force:true})};
}
async function runFixture(h,report=initialReport(),overrides={}){
  const steps=[],saved=[],save=async()=>{saved.push(structuredClone(report));},trace=checkpoint(report,save,async row=>steps.push(row));
  const promise=runCases({open:h.open,report,save,trace,heads:h.branches,entityId,connectionMs:1000,dataMs:1000,logoutMs:300,clock:h.clock,...overrides});
  return {promise,report,steps,saved,save,trace};
}
test('CLI requires explicit independent binary source revision and only original stores/full02/fresh output',()=>{
  const argv=['--binary','/unit/native','--stores',STORES,'--output','/private/tmp/fresh','--prior-run','/private/tmp/account109-desktop-real-fixture-full02','--binary-source-revision','a'.repeat(40)];assert.equal(options(argv).sourceRevision,'a'.repeat(40));
  assert.throws(()=>options(argv.slice(0,-2)));assert.throws(()=>options([...argv,'--binary-source-revision','b'.repeat(40)]));assert.throws(()=>options(argv.map(v=>v==='a'.repeat(40)?'short':v)));assert.throws(()=>options([...argv,'--token','private']));
});
test('native conflict gate checks exact existing digest pair, target, sole conflict and full variant metadata',()=>{
  const h=heads();assertExistingConflict(conflict(h),h,entityId);
  for(const change of [v=>v.conflicts.push(v.conflicts[0]),v=>v.conflicts[0].entityId=randomUUID(),v=>v.conflicts[0].variants[0].digest='f'.repeat(64),v=>v.conflicts[0].variants[0].attachmentCount=0,v=>v.conflicts[0].variants[0].title='wrong',v=>v.conflicts[0].variants[0].locked=true]){const v=conflict(h);change(v);assert.throws(()=>assertExistingConflict(v,h,entityId));}
});
test('connection readiness requires both actual peers, not another remote or an errored enabled status',()=>{
  const ss=['a','b'].map(name=>({state:'ready',enabled:true,devices:['a','b'].map(id=>({id,current:id===name,online:true,connected:id!==name}))}));assert(connectedPair(ss));const wrong=structuredClone(ss);wrong[0].devices[1].id='phone';assert(!connectedPair(wrong));assert(!connectedPair([{...ss[0],error:{code:'account_network'}},ss[1]]));
});
test('exact native save-note shape is required for local and remote synthetic bodies',()=>{
  const title='account109-local',text='account109-完整正文 😀',note={id:randomUUID(),document:plainDocument(title,text),plainText:title+'\n'+text};assertCreated(note,title,text);
  assert.throws(()=>assertCreated({...note,plainText:text},title,text));const bad=structuredClone(note);bad.document.content.pop();assert.throws(()=>assertCreated(bad,title,text));
});
test('headless continuation resolves once, validates full remapped branches/raw files, then checks both logout directions and real restart ordering',async()=>{
  const h=await harness();try{
    const f=await runFixture(h);await f.promise;
    assert.deepEqual(f.report.scenarios,{conflict:'pass',logout:'pass'});assert.equal(f.report.status,'running');assert(f.saved.every(r=>r.status==='running'));
    assert.equal(h.events.filter(e=>e.endsWith(':keepAll')).length,1);assert.equal(h.children.length,3);assert(h.events.indexOf('a:signOut')<h.events.indexOf('a:createPlainNote'));
    const firstClose=h.events.indexOf('a:close'),secondReady=h.events.lastIndexOf('a:ready');assert(firstClose<secondReady);assert(h.events.indexOf('b:createPlainNote')<firstClose);assert(h.events.lastIndexOf('b:createPlainNote')>secondReady);
    assert.equal(f.report.observations.filter(o=>o.kind==='resolved-complete-branch').length,4);const windows=f.report.observations.filter(o=>o.kind==='two-way-logout-exclusion');assert.equal(windows.length,2);assert(windows.every(w=>w.samples>=2&&w.observedMs>=300));
    assert(!JSON.stringify(f.report).includes('中文第二段'));assert(!JSON.stringify(f.steps).includes('完整正文'));assert(f.steps.some(s=>s.operation==='keepAll'&&s.event==='before'));assert(!f.steps.some(s=>['eval','execute'].includes(s.operation)));
    await finishRecovery(f.report,h.children,peer=>f.trace(peer.name,'close',()=>peer.close()),f.save);assert.equal(f.report.status,'pass');
  }finally{await h.cleanup();}
});
test('changed or additional existing conflict fails before any keep-all, sign-out or new note',async()=>{
  for(const mode of ['wrong-digest','extra-conflict']){const h=await harness(mode);try{const f=await runFixture(h);await assert.rejects(f.promise);assert(!h.events.some(e=>/:keepAll|:signOut|:createPlainNote/.test(e)));assert.equal(f.report.scenarios.logout,'not-run');}finally{await h.cleanup();}}
});
test('80-second connection phases leave a fresh 60-second data budget for 50-second body convergence',async()=>{
  const h=await harness();let clock=0;const phases=[];
  try{
    const poll=async(label,ready,budget)=>{const start=clock,delay=label==='both native peers connected'?80000:label==='both complete branches applied'?50000:0;phases.push({label,budget});return boundedPoll(label,()=>clock-start>=delay?ready():false,budget,{now:()=>clock,sleep:async ms=>{clock+=ms;}});};
    const f=await runFixture(h,initialReport(),{connectionMs:120000,dataMs:60000,poll});await f.promise;
    assert.deepEqual(phases.slice(0,3),[{label:'both native peers connected',budget:120000},{label:'both native peers connected',budget:120000},{label:'both complete branches applied',budget:60000}]);assert.equal(clock,210000);assert.equal(f.report.scenarios.logout,'pass');
  }finally{await h.cleanup();}
});
test('authentication fails on the first bounded connection check and retains fixed endpoint/provider diagnostics',async()=>{
  const h=await harness('auth');try{const f=await runFixture(h);await assert.rejects(f.promise,{code:'ACCOUNT_AUTHENTICATION_FAILED'});assert(!h.events.some(e=>e.endsWith(':conflicts')));assert(f.report.statusTransitions.some(s=>s.error?.stage==='coordinatorProfile'&&s.error.providerReason==='identityRejected'));}finally{await h.cleanup();}
});
test('original-byte corruption prevents conflict pass and leaves logout untouched',async()=>{
  const h=await harness('corrupt-read');try{const f=await runFixture(h);await assert.rejects(f.promise);assert.equal(f.report.scenarios.conflict,'running');assert.equal(f.report.scenarios.logout,'not-run');assert(!h.events.some(e=>e.endsWith(':signOut')));}finally{await h.cleanup();}
});
test('delayed notes in either direction and lost local edit after restart cannot pass logout',async()=>{
  for(const mode of ['a-to-b','b-to-a','lost-local']){const h=await harness(mode);try{const f=await runFixture(h);await assert.rejects(f.promise);assert.equal(f.report.scenarios.conflict,'pass');assert.equal(f.report.scenarios.logout,'running');await finishRecovery(f.report,h.children,peer=>peer.close(),f.save);assert.equal(f.report.status,'fail');}finally{await h.cleanup();}}
});
test('successful business assertions still cannot pass after non-natural owned cleanup',async()=>{
  const h=await harness('cleanup');try{const f=await runFixture(h);await assert.rejects(f.promise,/naturalExit/);await finishRecovery(f.report,h.children,peer=>peer.close(),f.save);assert.equal(f.report.status,'fail');}finally{await h.cleanup();}
});
