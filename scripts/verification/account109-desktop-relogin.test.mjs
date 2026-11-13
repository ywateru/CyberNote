import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {options,checkProfile,isBRefreshFailure,refreshClassification,reauthorizeB,waitForOriginalAccount,assertLibrary,combineBaselines,readLibrary,priorGate,waitHealthy,connectionThenData,confirmEnableUi,finish} from './account109-desktop-relogin.mjs';
import {STORES,hash,boundedPoll,verifyBytes} from './account109-desktop-recovery.mjs';
import {noteBody,safeStatus} from './account109-desktop-helpers.mjs';

const note=(text='完整正文 中文 😀')=>({id:randomUUID(),folderId:'default',title:text,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]},createdAt:1,updatedAt:1,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:1});
function library(){const n=note(),a={id:randomUUID(),noteId:n.id,kind:'file',mime:'application/octet-stream',displayName:'synthetic.bin',size:4,relativePath:'synthetic.bin',sha256:hash(Buffer.from([0,255,128,1]))};n.document.content.push({type:'attachment',attrs:{id:a.id}});return {notes:[n],attachments:[a]};}
const status=(name='a')=>({state:'ready',enabled:true,profile:{subject:'synthetic-owner',username:'cybernoteqa20261113a'},devices:[{id:name,current:true,online:true,connected:false},{id:name==='a'?'b':'a',current:false,online:true,connected:true}],pendingCount:0,conflictCount:0});
const pair=()=>[status('a'),status('b')];
const network=()=>pair().map(s=>({...s,state:'error',error:{code:'account_network',stage:'coordinatorSession'}}));
function clock(){let time=0;return {now:()=>time,sleep:async ms=>{time+=ms;}};}

test('CLI requires explicit end state and rejects credential/URL/store/duplicate inputs',()=>{
  const args=['--binary','/tmp/candidate','--stores',STORES,'--output','/private/tmp/relogin-evidence','--end-state','paused'];
  assert.equal(options(args).endState,'paused');
  assert.equal(options(args).allowBRelogin,false);assert.equal(options([...args,'--allow-b-relogin']).allowBRelogin,true);
  for(const bad of [args.slice(0,-2),[...args,'--token','secret'],[...args,'--binary','/tmp/other'],args.map(x=>x===STORES?'/tmp/other':x),args.map(x=>x==='paused'?'signedOut':x),args.map(x=>x==='/private/tmp/relogin-evidence'?STORES+'/evidence':x)])assert.throws(()=>options(bad));
});

const refreshFailure=()=>({...status('b'),state:'error',enabled:false,profile:{subject:'synthetic-owner'},devices:[],error:{code:'account_authentication',stage:'identityRefresh'}});
test('partial refresh-failure profile retains its actual error, while healthy username remains strict',async()=>{
  const failed=refreshFailure();assert.equal(checkProfile(failed),failed);assert(isBRefreshFailure(failed));
  await assert.rejects(()=>waitHealthy('original auth error',async()=>[checkProfile(failed)],()=>true,120000),e=>e.code==='ACCOUNT_AUTHENTICATION_FAILED');
  assert.throws(()=>checkProfile({...failed,state:'paused',error:undefined}));assert.throws(()=>checkProfile({...status('b'),profile:{subject:'synthetic-owner',username:'different-owner'}}));
});
test('pinned ambiguous refresh failure cannot invoke SignIn even with explicit opt-in',async()=>{
  for(const providerReason of [undefined,'refreshFailed','identityRejected','network']){
    const initial=refreshFailure();if(providerReason)initial.error.providerReason=providerReason;
    const records=[];let calls=0;
    await assert.rejects(()=>reauthorizeB(initial,{allowed:true,record:async row=>records.push(row),login:async()=>{calls++;},enable:async()=>{calls++;}}),e=>e.code==='B_REFRESH_CLASSIFICATION_UNAVAILABLE');
    assert.equal(calls,0);assert.equal(records.length,1);assert.equal(records[0].classification,'unclassified');assert.deepEqual(records[0].error,initial.error);assert.equal(records[0].originalSubjectSha256,hash(initial.profile.subject));assert(!JSON.stringify(records).includes(initial.profile.subject));
  }
  const transport={...refreshFailure(),error:{code:'account_network',stage:'identityRefresh'}};assert.equal(refreshClassification(transport),'transport');let calls=0;
  await assert.rejects(()=>reauthorizeB(transport,{allowed:true,record:async()=>{},login:async()=>{calls++;}}),e=>e.code==='ACCOUNT_STATUS_FAILED');assert.equal(calls,0);
});
test('authorizing partial profile waits for strict same-subject terminal after initial refresh failure',async()=>{
  const initial=refreshFailure();assert.equal(checkProfile(initial),initial);
  const partial={...initial,state:'authorizing',error:undefined},terminal={...status('b'),state:'paused',enabled:false};
  assert.equal(checkProfile(partial),partial);let reads=0;
  const c=clock(),poll=(l,p,m)=>boundedPoll(l,p,m,c);
  const [result]=await waitForOriginalAccount('authorization sequence',async()=>[++reads<3?partial:terminal],initial.profile.subject,{poll});assert.equal(result,terminal);assert.equal(reads,3);
  for(const bad of [{...partial,profile:{subject:'other'}},{...terminal,profile:{subject:'other',username:'cybernoteqa20261113a'}},{...terminal,profile:{subject:'synthetic-owner'}},{...terminal,profile:{subject:'synthetic-owner',username:'other'}},initial]){
    let samples=0;await assert.rejects(()=>waitForOriginalAccount('rejected terminal',async()=>[++samples===1?partial:bad],initial.profile.subject,{poll}));assert.equal(samples,2);
  }
  const pendingClock=clock();await assert.rejects(()=>waitForOriginalAccount('bounded pending',async()=>[partial],initial.profile.subject,{poll:(l,p,m)=>boundedPoll(l,p,m,pendingClock)}),e=>e.code==='CONDITION_TIMEOUT:bounded pending');assert.equal(pendingClock.now(),120000);
});
test('B recovery is opt-in and rejects other authentication stages, states and connected profiles',async()=>{
  for(const [allowed,initial] of [[false,refreshFailure()],[true,{...refreshFailure(),error:{code:'account_authentication',stage:'authorizationProvider'}}],[true,{...refreshFailure(),enabled:true}],[true,{...refreshFailure(),profile:{subject:'synthetic-owner',username:'cybernoteqa20261113a'}}],[true,{...refreshFailure(),devices:[{connected:true}]}],[true,{...refreshFailure(),conflictCount:1}]]){
    let calls=0;await assert.rejects(()=>reauthorizeB(initial,{allowed,record:async()=>{},login:async()=>{calls++;},enable:async()=>{calls++;}}),e=>e.code==='ACCOUNT_AUTHENTICATION_FAILED');assert.equal(calls,0);
  }
});

test('complete baseline rejects missing notes, changed text/marks, ownership and lost refs',()=>{
  const expected=library();assertLibrary(structuredClone(expected),expected);
  for(const mutate of [ws=>ws.notes.pop(),ws=>ws.notes[0].plainText+=' loss',ws=>ws.notes[0].document.content[0].content[0].marks=[{type:'italic'}],ws=>ws.attachments[0].noteId=randomUUID(),ws=>ws.attachments.pop(),ws=>ws.notes[0].document.content.pop(),ws=>ws.attachments[0].mime='text/plain']){
    const actual=structuredClone(expected);mutate(actual);assert.throws(()=>assertLibrary(actual,expected));
  }
  const extra=structuredClone(expected);extra.notes.push(note('legitimate catchup'));assertLibrary(extra,expected);
});
test('shared-note baseline rejects B metadata loss while allowing local revision/path differences',()=>{
  const a=library(),b=structuredClone(a);b.notes[0].revision=12;b.attachments[0].relativePath='different-local-file.bin';b.notes.push(note('B independent original'));
  const combined=combineBaselines(a,b);assert.equal(combined.notes.length,2);assertLibrary(combined,a);assertLibrary(combined,b);
  for(const change of [n=>n.pinned=true,n=>n.folderId='other',n=>n.updatedAt=2,n=>n.title='changed',n=>n.document.content[0].content[0].marks=[{type:'bold'}]]){
    const other=structuredClone(b);change(other.notes[0]);assert.throws(()=>combineBaselines(a,other),/Overlapping note/);
  }
  // The review counterexample passed the historical body-only gate, but must
  // now fail the shared-ID gate before a combined baseline can be constructed.
  const f=priorFixture();f.b.notes[0].pinned=true;priorGate(f.prior,f.a,f.b);assert.throws(()=>combineBaselines(f.a,f.b),/Overlapping note/);
});
test('shared attachment IDs require identical original owner, metadata, hash and exact references',()=>{
  const a=library();a.notes.push(note('second valid owner'));
  for(const change of [row=>row.mime='text/plain',row=>row.displayName='other.bin',row=>row.size=5,row=>row.sha256='0'.repeat(64),row=>row.recordedAt=1]){
    const b=structuredClone(a);change(b.attachments[0]);assert.throws(()=>combineBaselines(a,b),/Overlapping attachment/);
  }
  const reassigned=structuredClone(a),row=reassigned.attachments[0],ref=reassigned.notes[0].document.content.pop();row.noteId=reassigned.notes[1].id;reassigned.notes[1].document.content.push(ref);assert.throws(()=>combineBaselines(a,reassigned),/Overlapping attachment/);
  const remapped=structuredClone(a);remapped.attachments[0].id=randomUUID();remapped.notes[0].document.content.at(-1).attrs.id=remapped.attachments[0].id;
  assertLibrary(remapped,a);assert.throws(()=>combineBaselines(a,remapped),/Overlapping note/,'Semantic descriptor equality cannot hide a different original reference ID');
});

test('readonly copy captures full projection and original bytes without querying account tables',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'account109-relogin-unit-')));
  try{
    const store=join(root,'store'),destination=join(root,'snapshot');await mkdir(store);await mkdir(join(store,'attachments'));
    const ws=library();await writeFile(join(store,'attachments','synthetic.bin'),Buffer.from([0,255,128,1]));
    execFileSync('python3',['-c',`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]);c.execute('create table notes(id text, body text)');c.execute('create table attachments(id text, body text)')
w=json.loads(sys.argv[2])
for n in w['notes']: c.execute('insert into notes values (?,?)',(n['id'],json.dumps(n)))
for a in w['attachments']: c.execute('insert into attachments values (?,?)',(a['id'],json.dumps(a)))
c.commit();c.close()`,join(store,'notes.sqlite3'),JSON.stringify(ws)]);
    const before=hash(await readFile(join(store,'notes.sqlite3'))),result=await readLibrary(store,destination);
    assert.equal(result.queryOnly,true);assert.equal(result.mode,'ro');assert.equal(result.originalFilesUnchanged,true);assert.equal(hash(await readFile(join(store,'notes.sqlite3'))),before);assertLibrary(result,ws);
    assert.equal(result.attachments[0].sha256,ws.attachments[0].sha256);assert.deepEqual(await readFile(join(destination,ws.attachments[0].id+'.bytes')),Buffer.from([0,255,128,1]));
    // The fixture has no account/grant tables; success depends only on the projection.
    await assert.rejects(()=>readLibrary(store,destination));
  }finally{await rm(root,{recursive:true,force:true});}
});

test('retained raw-byte check rejects same-size corruption and production-read disagreement',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'account109-relogin-bytes-')));
  try{
    const ws=library(),row=ws.attachments[0],p=join(root,'attachments',row.relativePath);await mkdir(join(root,'attachments'));await writeFile(p,Buffer.from([0,255,128,1]));
    const read=async()=>({data:(await readFile(p)).toString('base64')});
    await verifyBytes({directory:root},ws,read,ws.attachments);
    await assert.rejects(()=>verifyBytes({directory:root},ws,async()=>({data:Buffer.from([0,255,128,2]).toString('base64')}),ws.attachments));
    await writeFile(p,Buffer.from([0,255,128,3]));await assert.rejects(()=>verifyBytes({directory:root},ws,read,ws.attachments));
    await assert.rejects(()=>verifyBytes({directory:root},{attachments:[]},read,ws.attachments));
  }finally{await rm(root,{recursive:true,force:true});}
});

function priorFixture(){
  const a=library(),b=structuredClone(a),local=note('A signed-out local edit'),remotes=[note('B missed note 1'),note('B missed note 2')];a.notes.push(local);b.notes.push(...remotes);
  const prior={kind:'account109-preserved-full02-headless-recovery',status:'pass',scenarios:{conflict:'pass',logout:'pass'},preLogout:{notes:[{id:a.notes[0].id,fullBodySha256:hash(noteBody(a.notes[0]))}],attachments:a.attachments},postLogoutLocalEdit:{noteId:local.id,fullBodySha256:hash(noteBody(local))},observations:[{kind:'two-way-logout-exclusion',label:'after restart',remoteNoteIds:remotes.map(n=>n.id)}]};
  return {a,b,prior};
}
test('preserved continuation gate rejects historical loss/byte changes and pre-applied remote notes',()=>{
  const {a,b,prior}=priorFixture();assert.equal(priorGate(prior,a,b).remoteIds.length,2);
  for(const mutate of [f=>f.a.notes.shift(),f=>f.b.notes[0].document.content.pop(),f=>f.a.attachments[0].sha256='0'.repeat(64),f=>f.a.notes.push(f.b.notes.at(-1)),f=>f.b.notes.push(f.a.notes.at(-1)),f=>f.prior.status='fail']){const f=structuredClone({a,b,prior});mutate(f);assert.throws(()=>priorGate(f.prior,f.a,f.b));}
});

test('transient network becomes ready; persistent network times out despite matching predicate',async()=>{
  let reads=0;const c=clock(),poll=(label,predicate,ms)=>boundedPoll(label,predicate,ms,c);
  await waitHealthy('network then ready',async()=>++reads<3?network():pair(),()=>true,4000,{poll});assert.equal(reads,3);
  let accepted=0;await assert.rejects(()=>waitHealthy('persistent network',async()=>network(),()=>{accepted++;return true;},3000,{poll}),e=>e.code==='CONDITION_TIMEOUT:persistent network');assert.equal(accepted,0);
});
test('authentication fails immediately and enable-pending cannot pass until healthy',async()=>{
  const c=clock(),poll=(label,predicate,ms)=>boundedPoll(label,predicate,ms,c);let reads=0;
  await assert.rejects(()=>waitHealthy('auth',async()=>{reads++;return [{...status(),state:'error',error:{code:'account_authentication',stage:'authorizationProvider',providerReason:'identityRejected'}}];},()=>true,120000,{poll}),e=>e.code==='ACCOUNT_AUTHENTICATION_FAILED');assert.equal(reads,1);assert.equal(c.now(),0);
  reads=0;await waitHealthy('enable pending',async()=>++reads===1?network():pair(),ss=>ss.every(s=>s.enabled),3000,{poll});assert.equal(reads,2);
  const safe=safeStatus({...status(),error:{code:'account_authentication',stage:'authorizationProvider',providerReason:'network',message:'never emit raw'}});assert.deepEqual(safe.error,{code:'account_authentication',stage:'authorizationProvider',providerReason:'network'});
});
test('connection time is excluded from the data deadline; data health stays strict',async()=>{
  const c=clock(),deadlines=[],poll=(label,predicate,ms)=>{deadlines.push({label,ms,begin:c.now()});return boundedPoll(label,predicate,ms,c);};
  let reads=0,dataChecks=0;
  await connectionThenData('catchup',async()=>{reads++;return c.now()<78000?pair().map(s=>({...s,state:'connecting'})):pair();},()=>++dataChecks===59,{poll});
  assert.equal(deadlines[0].ms,120000);assert.equal(deadlines[1].ms,60000);assert.equal(deadlines[1].begin,78000);assert.equal(c.now(),136000);
  const bad=clock();await assert.rejects(()=>connectionThenData('never connected',async()=>network(),()=>true,{poll:(l,p,m)=>boundedPoll(l,p,m,bad),connectionMs:3000}),e=>e.code==='CONDITION_TIMEOUT:never connected connection');
  const dataClock=clock();let samples=0,accepted=0;
  await assert.rejects(()=>connectionThenData('network after connect',async()=>++samples===1?pair():network(),()=>{accepted++;return true;},{poll:(l,p,m)=>boundedPoll(l,p,m,dataClock),dataMs:3000}),e=>e.code==='CONDITION_TIMEOUT:network after connect data');assert.equal(accepted,0);
  assert(reads>dataChecks);
});
test('real UI confirmation requires complete explanation and enabled button before one click',async()=>{
  const prompt={count:1,visible:true,title:'开启账户同步？',explanation:'此设备的本地备忘录将与该账户其他设备的备忘录合并。请确认你登录了正确的账户。',buttons:2,cancel:'取消',confirm:'开启并合并',confirmEnabled:true},events=[];
  await confirmEnableUi({inspect:async()=>{events.push('inspect');return prompt;},click:async()=>events.push('dom.click'),record:async kind=>events.push(kind)});
  assert.deepEqual(events,['inspect','merge-confirmation-shown','dom.click','merge-confirmation-clicked']);
  for(const change of [{count:0},{count:2},{visible:false},{title:'other'},{explanation:'本地备忘录'},{buttons:1},{confirm:'other'},{confirmEnabled:false}]){
    let clicks=0;await assert.rejects(()=>confirmEnableUi({inspect:async()=>({...prompt,...change}),click:async()=>{clicks++;},record:async()=>{}}));assert.equal(clicks,0);
  }
  const failed=[];await assert.rejects(()=>confirmEnableUi({inspect:async()=>prompt,click:async()=>{throw Error('injected click failure');},record:async kind=>failed.push(kind)}));assert.deepEqual(failed,['merge-confirmation-shown']);
});
const completed=()=>({status:'running',scenarios:Object.fromEntries(['baseline','login','pausedEdits','catchup','bidirectional','restart','endState'].map(k=>[k,'pass']))});
test('PASS waits for every natural close and cleanup attempts all children after a failure',async()=>{
  const report=completed();let release;const first={lifecycle:{naturalExit:false},close:()=>new Promise(done=>{release=()=>{first.lifecycle.naturalExit=true;done();};})};
  const pending=finish(report,[first],async()=>{});await Promise.resolve();assert.equal(report.status,'running');release();await pending;assert.equal(report.status,'pass');
  const failed=completed();failed.failure={phase:'login',code:'ACCOUNT_AUTHENTICATION_FAILED'};const visited=[];
  await finish(failed,[{lifecycle:{naturalExit:false},close:async()=>{visited.push('a');throw Error('injected close failure');}},{lifecycle:{naturalExit:true},close:async()=>{visited.push('b');}}],async()=>{});
  assert.deepEqual(visited,['a','b']);assert.equal(failed.status,'fail');assert.equal(failed.failure.code,'ACCOUNT_AUTHENTICATION_FAILED');assert.equal(failed.cleanupFailure.code,'CLEANUP_FAILED');
  const incomplete=completed();incomplete.scenarios.restart='not-run';await finish(incomplete,[],async()=>{});assert.equal(incomplete.status,'fail');
});
