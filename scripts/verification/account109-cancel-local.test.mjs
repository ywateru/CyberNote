import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,symlink,rm,realpath,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {options,preflight,SOURCE,BINARY_SHA,fixture,strictSignedOut,assertDocument,actionShown,stableSignedOut,assertNatural,exercise,finish} from './account109-cancel-local.mjs';
import {boundedPoll} from './account109-desktop-recovery.mjs';

const id='272b0013-7b6a-4729-88f0-a10e2fd48e43';
const signedOut=()=>({state:'signedOut',enabled:false,devices:[],pendingCount:0,conflictCount:0});
const clock=()=>{let time=0;return {now:()=>time,sleep:async ms=>{time+=ms;}};};
const lifecycle=()=>({pid:123456,forcedSignals:[],naturalExit:true,exit:{code:0,signal:null},close:{code:0,signal:null}});
const ws=(expected=fixture(false))=>({notes:[{id,...structuredClone(expected)}],attachments:[]});

test('fixed verified GUI candidate and fresh-only CLI reject original/default roots and arbitrary inputs',()=>{
  assert.equal(SOURCE,'920fa9cf3af6e3b3cc3b99fb1a78d960ab0c7d11');assert.equal(BINARY_SHA,'bea14bbe7fe136578d27d691c49425bc7e6e438097780154406dbde796ca83fd');
  const args=['--binary','/private/tmp/candidate','--store','/private/tmp/account109-cancel-local-unit-store','--output','/private/tmp/account109-cancel-local-unit-output'];
  assert.equal(options(args).store,args[3]);
  for(const bad of [args.slice(0,-2),[...args,'--token','secret'],[...args,'--callback','https://invalid.test'],[...args,'--headless'],[...args,'--store',args[3]],args.map(s=>s===args[3]?'/private/tmp/account109-desktop-real-90b8b28b-01/desktop-a':s),args.map(s=>s===args[3]?'/Users/synthetic/Library/Application Support/CyberNote':s),args.map(s=>s===args[3]?'/private/tmp/account109-cancel-local-nested/child':s),args.map(s=>s===args[3]?'/tmp/account109-cancel-local-unit-store':s),args.map(s=>s===args[5]?args[3]:s)])assert.throws(()=>options(bad));
});
test('preflight rejects existing store/output, dangling symlink and wrong binary before launching anything',async()=>{
  const root=await realpath(await mkdtemp('/private/tmp/account109-cancel-local-policy-'));
  const store=root+'-store',output=root+'-output',binary=join(root,'candidate');
  try{
    await writeFile(binary,'synthetic wrong binary');const o={store,output,binary};
    await assert.rejects(()=>preflight(o),/Only verified/);
    await mkdir(store);await assert.rejects(()=>preflight(o),/both be absent/);await rm(store,{recursive:true});
    await mkdir(output);await assert.rejects(()=>preflight(o),/both be absent/);await rm(output,{recursive:true});
    await symlink(join(root,'absent'),store);await assert.rejects(()=>preflight(o),/both be absent/);assert((await lstat(store)).isSymbolicLink());
  }finally{await rm(store,{force:true,recursive:true});await rm(output,{force:true,recursive:true});await rm(root,{recursive:true,force:true});}
});
test('signedOut requires authoritative state, disabled, absent profile/error, no connections/conflicts',()=>{
  assert(strictSignedOut(signedOut()));
  for(const change of [{state:'authorizing'},{enabled:true},{enabled:undefined},{profile:{subject:'unexpected'}},{error:{code:'account_network'}},{state:'error'},{devices:[{connected:true}]},{devices:undefined},{conflictCount:1},{conflictCount:undefined}])assert.throws(()=>strictSignedOut({...signedOut(),...change}));
});
test('complete document assertion catches same-plainText mark/structure loss, missing note and unexpected attachments',()=>{
  const expected=fixture(false);assertDocument(ws(),id,expected);
  for(const mutate of [s=>s.notes[0].document.content[1].content[0].marks=[],s=>s.notes[0].document.content[0].type='paragraph',s=>s.notes[0].document.content.pop(),s=>s.notes[0].plainText+='lost',s=>s.notes[0].id='other',s=>s.notes.pop(),s=>s.attachments.push({id:'unexpected'})]){const actual=ws();mutate(actual);assert.throws(()=>assertDocument(actual,id,expected));}
});
test('UI actions require visible enabled exact login/cancel controls and authoritative rendered state',()=>{
  for(const kind of ['signIn','cancel']){
    const p={state:kind==='signIn'?'signedOut':'authorizing',count:kind==='signIn'?2:1,label:kind==='signIn'?'登录':'取消登录',enabled:true,visible:true};assert(actionShown(p,kind));
    for(const change of [{state:'error'},{count:0},{count:3},{label:'重试'},{enabled:false},{visible:false}])assert.equal(actionShown({...p,...change},kind),false);
  }
  assert.throws(()=>actionShown({},'signOut'));
});
test('postcancel window uses repeated status plus full body samples and checks the 3s boundary',async()=>{
  const c=clock();let statuses=0,bodies=0;
  const proof=await stableSignedOut({status:async()=>{statuses++;return signedOut();},workspace:async()=>{bodies++;return ws();}},id,fixture(false),c);
  assert.equal(c.now(),3000);assert.equal(proof.durationMs,3000);assert.equal(proof.samples,7);assert.equal(statuses,7);assert.equal(bodies,7);
  for(const after of [1000,3000]){
    const bad=clock();await assert.rejects(()=>stableSignedOut({status:async()=>bad.now()>=after?{...signedOut(),state:'authorizing'}:signedOut(),workspace:async()=>ws()},id,fixture(false),bad));assert.equal(bad.now(),after);
  }
  const changed=clock();await assert.rejects(()=>stableSignedOut({status:async()=>signedOut(),workspace:async()=>{const w=ws();if(changed.now()>=1000)w.notes[0].document.content[1].content[0].marks=[];return w;}},id,fixture(false),changed));assert.equal(changed.now(),1000);
});

function harness({signInError,pendingForever=false,cancelError,restartMutation,afterCancelStatus}={}){
  const c=clock(),events=[],peers=[],proofs=[];let document,plainText;
  async function open(){
    const index=peers.length;events.push('open '+index);let mode='signedOut',cancelReads=0,closed=false;
    const peer={lifecycle:lifecycle(),pidAbsent:true,
      status:async()=>{
        if(mode==='cancelling'&&++cancelReads>=3)mode='signedOut';
        if(mode==='signedOut'&&cancelReads&&afterCancelStatus)return afterCancelStatus();
        return {...signedOut(),state:mode==='cancelling'?'authorizing':mode};
      },
      workspace:async()=>{const w={notes:document?[{id,document:structuredClone(document),plainText}]:[],attachments:[]};if(index&&restartMutation)restartMutation(w);return w;},
      create:async doc=>{events.push('create');document=structuredClone(doc);plainText=fixture(false).plainText;return id;},
      edit:async(noteId,doc)=>{assert.equal(noteId,id);events.push('edit');document=structuredClone(doc);plainText=fixture(true).plainText;},
      enterAccount:async()=>events.push('enter account'),leaveAccount:async()=>events.push('leave account'),requireSettingsClosed:async()=>events.push('settings closed'),
      inspectAction:async kind=>events.push('inspect '+kind),
      action:async kind=>{events.push(kind);if(kind==='signIn'){if(signInError)throw signInError;if(!pendingForever)mode='authorizing';}else{if(cancelError)throw cancelError;mode='cancelling';}},
      close:async()=>{if(!closed){events.push('close '+index);closed=true;}}
    };peers.push(peer);return peer;
  }
  return {c,events,peers,proofs,args:{open,record:async(name,proof)=>proofs.push({name,...proof}),checkpoint:async phase=>events.push('phase '+phase),clock:c,poll:(l,p,m)=>boundedPoll(l,p,m,c)}};
}
test('one GUI SignIn/cancel, postcancel full body window, local edit, natural restart and second window',async()=>{
  const h=harness();await exercise(h.args);
  assert.equal(h.events.filter(x=>x==='signIn').length,1);assert.equal(h.events.filter(x=>x==='cancel').length,1);assert.equal(h.peers.length,2);assert.equal(h.c.now(),8000);
  assert(h.events.indexOf('create')<h.events.indexOf('signIn'));assert(h.events.indexOf('cancel')<h.events.indexOf('edit'));assert(h.events.indexOf('close 0')<h.events.indexOf('open 1'));
  assert.deepEqual(h.proofs.map(p=>p.name),['localSave','authorizing','cancelledWindow','localEdit','restartWindow']);assert.equal(h.proofs[2].samples,7);assert.equal(h.proofs[4].samples,7);
  assert(!h.events.includes('enable'));assert(h.proofs[4].sameStore);
});
test('SignIn/bind or cancel error stops without retry, port change, local edit or restart',async()=>{
  for(const config of [{signInError:Object.assign(Error('unexported native text'),{code:'CALLBACK_BIND_FAILED'})},{cancelError:Error('unexported cancellation failure')},{afterCancelStatus:()=>({...signedOut(),error:{code:'account_auth_identity_invalid'}})}]){
    const h=harness(config);await assert.rejects(()=>exercise(h.args));assert.equal(h.events.filter(x=>x==='signIn').length,1);assert(h.events.filter(x=>x==='cancel').length<=1);assert(!h.events.includes('edit'));assert.equal(h.peers.length,1);
  }
  const h=harness({pendingForever:true});await assert.rejects(()=>exercise(h.args),e=>e.code==='CONDITION_TIMEOUT:one SignIn authorizing');assert.equal(h.c.now(),30000);assert.equal(h.events.filter(x=>x==='signIn').length,1);assert(!h.events.includes('cancel'));
});
test('restart catches document mark loss despite identical plainText and never produces final proof',async()=>{
  const h=harness({restartMutation:w=>{w.notes[0].document.content[1].content[0].marks=[];}});await assert.rejects(()=>exercise(h.args));assert.equal(h.peers.length,2);assert(!h.proofs.some(p=>p.name==='restartWindow'));
});
test('natural-exit proof rejects forced signals, nonzero exit and unconfirmed PID absence',()=>{
  assertNatural({lifecycle:lifecycle(),pidAbsent:true});
  for(const change of [{naturalExit:false},{exit:{code:1,signal:null}},{close:{code:0,signal:'SIGTERM'}},{forcedSignals:['SIGTERM']}])assert.throws(()=>assertNatural({lifecycle:{...lifecycle(),...change},pidAbsent:true}));
  assert.throws(()=>assertNatural({lifecycle:lifecycle(),pidAbsent:false}));
});
const completed=()=>({status:'running',checks:['localSave','authorizing','cancelledWindow','localEdit','restartWindow'].map(name=>({name,status:'pass'}))});
test('PASS awaits both natural closes; cleanup preserves operation failure and attempts every owned peer',async()=>{
  const report=completed(),events=[];let release;
  const p={lifecycle:lifecycle(),pidAbsent:true,close:()=>new Promise(done=>{release=()=>{events.push('a');done();};})};
  const done=finish(report,[p,{lifecycle:lifecycle(),pidAbsent:true,close:async()=>events.push('b')}],async()=>{});await Promise.resolve();assert.equal(report.status,'running');release();await done;assert.equal(report.status,'pass');assert.equal(events.length,2);
  const failed=completed();failed.failure={phase:'authorizing',code:'CALLBACK_BIND_FAILED'};const visited=[];
  await finish(failed,[{lifecycle:{...lifecycle(),naturalExit:false},pidAbsent:false,close:async()=>{visited.push('a');throw Error('close failure');}},{lifecycle:lifecycle(),pidAbsent:true,close:async()=>visited.push('b')}],async()=>{});
  assert.deepEqual(visited,['a','b']);assert.equal(failed.status,'fail');assert.equal(failed.failure.code,'CALLBACK_BIND_FAILED');assert.equal(failed.cleanupFailure.code,'CLEANUP_FAILED');
  const incomplete=completed();await finish(incomplete,[],async()=>{});assert.equal(incomplete.status,'fail');
});
