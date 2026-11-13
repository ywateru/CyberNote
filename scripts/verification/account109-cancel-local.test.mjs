import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,symlink,rm,realpath,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {options,preflight,SOURCE,BINARY_SHA,surfacePolicy,authorizationSurface,beginAuthorization,fixture,strictSignedOut,assertDocument,actionShown,ACTION_PROJECTION,stableSignedOut,assertNatural,exercise,finish} from './account109-cancel-local.mjs';
import {boundedPoll} from './account109-desktop-recovery.mjs';

const id='272b0013-7b6a-4729-88f0-a10e2fd48e43';
const signedOut=()=>({state:'signedOut',enabled:false,devices:[],pendingCount:0,conflictCount:0});
const clock=()=>{let time=0;return {now:()=>time,sleep:async ms=>{time+=ms;}};};
const lifecycle=()=>({pid:123456,forcedSignals:[],naturalExit:true,exit:{code:0,signal:null},close:{code:0,signal:null}});
const ws=(expected=fixture(false))=>({notes:[{id,...structuredClone(expected)}],attachments:[]});

test('fixed verified GUI candidate and fresh-only CLI reject original/default roots and arbitrary inputs',()=>{
  assert.equal(SOURCE,'9e7c46d2fcc8ed31bf1210ce4272f73edffe9143');assert.equal(BINARY_SHA,'3fa9a3851e610348352f5594f976f145e2d344fd97a9f0d27124566f458ce65c');
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
test('surface CLI preserves browser default and permits only fixed embedded continuation',()=>{
  const args=['--binary','/private/tmp/candidate','--store','/private/tmp/account109-cancel-local-unit-store','--output','/private/tmp/account109-cancel-local-unit-output'];
  assert.deepEqual(surfacePolicy(),{surface:'browser',continueInBrowser:false,cancelViaWindow:false});assert.equal(options(args).surface,'browser');assert.equal(options(args).continueInBrowser,false);assert.equal(options(args).cancelViaWindow,false);
  for(const surface of ['embedded','browser'])assert.equal(options([...args,'--surface',surface]).surface,surface);
  const mode=options([...args,'--surface','embedded','--continue-in-browser']);assert.equal(mode.surface,'embedded');assert.equal(mode.continueInBrowser,true);
  for(const more of [['--surface'],['--surface','unknown'],['--surface','https://invalid.test'],['--surface','embedded','--surface','browser'],['--continue-in-browser'],['--surface','browser','--continue-in-browser'],['--surface','embedded','--continue-in-browser','true'],['--surface','embedded','--continue-in-browser','--continue-in-browser']])assert.throws(()=>options([...args,...more]));
  for(const mode of [{surface:'unknown'},{surface:'embedded',url:'https://invalid.test'},{surface:'embedded',continueInBrowser:1},{surface:'browser',continueInBrowser:true}])assert.throws(()=>surfacePolicy(mode));
});
test('window cancellation is explicit, embedded-only and mutually exclusive with browser continuation',async()=>{
  const args=['--binary','/private/tmp/candidate','--store','/private/tmp/account109-cancel-local-unit-store','--output','/private/tmp/account109-cancel-local-unit-output'];
  assert.equal(options([...args,'--surface','embedded','--cancel-via-window']).cancelViaWindow,true);
  for(const more of [['--cancel-via-window'],['--surface','browser','--cancel-via-window'],['--surface','embedded','--continue-in-browser','--cancel-via-window'],['--surface','embedded','--cancel-via-window','--cancel-via-window'],['--surface','embedded','--cancel-via-window','true']])assert.throws(()=>options([...args,...more]));
  for(const mode of [{surface:'embedded',cancelViaWindow:1},{surface:'browser',cancelViaWindow:true},{surface:'embedded',continueInBrowser:true,cancelViaWindow:true}]){
    assert.throws(()=>surfacePolicy(mode));const h=harness();await assert.rejects(()=>exercise({...h.args,...mode}));assert.equal(h.peers.length,0);
  }
});
test('actual surface is finite, required during authorizing and absent after authorization',()=>{
  for(const surface of ['embedded','browser'])assert.equal(authorizationSurface({...signedOut(),state:'authorizing',authorizationSurface:surface}),surface);
  for(const surface of [undefined,null,'unknown','https://invalid.test'])assert.throws(()=>authorizationSurface({...signedOut(),state:'authorizing',authorizationSurface:surface}));
  for(const state of ['signedOut','ready','error'])for(const authorizationSurfaceValue of ['embedded','browser'])assert.throws(()=>authorizationSurface({...signedOut(),state,authorizationSurface:authorizationSurfaceValue}));
});
test('signedOut requires authoritative state, disabled, absent profile/error, no connections/conflicts',()=>{
  assert(strictSignedOut(signedOut()));
  for(const change of [{state:'authorizing'},{authorizationSurface:'embedded'},{authorizationSurface:'browser'},{enabled:true},{enabled:undefined},{profile:{subject:'unexpected'}},{error:{code:'account_network'}},{state:'error'},{devices:[{connected:true}]},{devices:undefined},{conflictCount:1},{conflictCount:undefined}])assert.throws(()=>strictSignedOut({...signedOut(),...change}));
});
test('complete document assertion catches same-plainText mark/structure loss, missing note and unexpected attachments',()=>{
  const expected=fixture(false);assertDocument(ws(),id,expected);
  for(const mutate of [s=>s.notes[0].document.content[1].content[0].marks=[],s=>s.notes[0].document.content[0].type='paragraph',s=>s.notes[0].document.content.pop(),s=>s.notes[0].plainText+='lost',s=>s.notes[0].id='other',s=>s.notes.pop(),s=>s.attachments.push({id:'unexpected'})]){const actual=ws();mutate(actual);assert.throws(()=>assertDocument(actual,id,expected));}
});
test('UI actions require exact surface, ordered labels/count, target visibility and frozen radios',()=>{
  for(const [kind,surface] of [['signIn','browser'],['signIn','embedded'],['cancel','browser'],['cancel','embedded'],['openLoginInBrowser','embedded']]){
    const labels=kind==='signIn'?['登录','创建账户']:surface==='embedded'?['取消登录','在浏览器中继续']:['取消登录'];
    const p={state:kind==='signIn'?'signedOut':'authorizing',authorizationSurface:kind==='signIn'?undefined:surface,count:labels.length,labels,label:kind==='openLoginInBrowser'?labels[1]:labels[0],enabled:true,visible:true,radioValues:['embedded','browser'],radioDisabled:[kind!=='signIn',kind!=='signIn']};assert(actionShown(p,kind,surface));
    for(const change of [{state:'error'},{count:0},{count:3},{labels:labels.slice().reverse().concat('extra')},{label:'重试'},{enabled:false},{visible:false},{authorizationSurface:'unknown'},{radioValues:['browser','embedded']},{radioDisabled:[false,true]},{radioDisabled:[]}])assert.equal(actionShown({...p,...change},kind,surface),false);
    if(kind!=='signIn')assert.equal(actionShown({...p,authorizationSurface:undefined},kind,surface),false);
  }
  assert.equal(actionShown({},'openLoginInBrowser','browser'),false);
  assert.throws(()=>actionShown({},'signOut'));
});
test('fixed DOM projection reads effective fieldset-disabled radios rather than their own disabled attributes',()=>{
  // Device-free DOM API fixture: input.disabled is false while :disabled reflects
  // the disabled ancestor fieldset. Execute the same fixed expression as native.
  for(const surface of ['embedded','browser']){
    const fieldset={disabled:true},seen=[];
    const radios=['embedded','browser'].map(value=>({value,disabled:false,matches(selector){assert.equal(selector,':disabled');seen.push(value);return this.disabled||fieldset.disabled;}}));
    const labels=surface==='embedded'?['取消登录','在浏览器中继续']:['取消登录'];
    const buttons=labels.map(textContent=>({textContent,disabled:false,getClientRects:()=>[{}]}));
    const panel={dataset:{accountState:'authorizing',accountAuthorizationSurface:surface},querySelectorAll(selector){if(selector==='input[name="account-login-surface"]')return radios;assert.equal(selector,'.account-group[aria-label="CyberNote 账户"] .account-actions button');return buttons;}};
    const document={querySelector(selector){assert.equal(selector,'.account-settings');return panel;}};
    const project=kind=>structuredClone(runInNewContext(ACTION_PROJECTION,{document,arg:kind}));
    assert.deepEqual(radios.map(r=>r.disabled),[false,false]);assert(actionShown(project('cancel'),'cancel',surface));assert.deepEqual(seen,['embedded','browser']);
    if(surface==='embedded')assert(actionShown(project('openLoginInBrowser'),'openLoginInBrowser',surface));
    fieldset.disabled=false;assert.equal(actionShown(project('cancel'),'cancel',surface),false);
    panel.dataset={accountState:'signedOut'};buttons.splice(0,buttons.length,...['登录','创建账户'].map(textContent=>({textContent,disabled:false,getClientRects:()=>[{}]})));
    assert(actionShown(project('signIn'),'signIn',surface));
    radios[0].disabled=true;assert.equal(actionShown(project('signIn'),'signIn',surface),false);
  }
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

function harness({signInError,pendingForever=false,cancelError,restartMutation,afterCancelStatus,transferError,transferStatus,transferStuck=false,initialSurface,cancelSurface,windowStatus}={}){
  const c=clock(),events=[],peers=[],proofs=[],calls=[],checkpoints=[];let document,plainText,awaitingWindow=false;
  async function open(){
    const index=peers.length;events.push('open '+index);let mode='signedOut',surface,cancelReads=0,closed=false,transferred=false;
    const peer={lifecycle:lifecycle(),pidAbsent:true,
      status:async()=>{
        if(mode==='authorizing'&&awaitingWindow&&windowStatus)return windowStatus(c.now());
        if(mode==='cancelling'&&++cancelReads>=3)mode='signedOut';
        if(mode==='signedOut'&&cancelReads&&afterCancelStatus)return afterCancelStatus();
        if(transferred&&transferStatus)return transferStatus();
        return {...signedOut(),state:mode==='cancelling'?'authorizing':mode,...(mode!=='signedOut'?{authorizationSurface:mode==='cancelling'?cancelSurface??surface:surface}:{})};
      },
      workspace:async()=>{const w={notes:document?[{id,document:structuredClone(document),plainText}]:[],attachments:[]};if(index&&restartMutation)restartMutation(w);return w;},
      create:async doc=>{events.push('create');document=structuredClone(doc);plainText=fixture(false).plainText;return id;},
      edit:async(noteId,doc)=>{assert.equal(noteId,id);events.push('edit');document=structuredClone(doc);plainText=fixture(true).plainText;},
      enterAccount:async()=>events.push('enter account'),leaveAccount:async()=>events.push('leave account'),requireSettingsClosed:async()=>events.push('settings closed'),
      inspectAction:async(kind,surface)=>{events.push('inspect '+kind);calls.push({inspect:kind,surface});},
      action:async(kind,args)=>{events.push(kind);calls.push({action:kind,args});if(kind==='signIn'){if(signInError)throw signInError;if(!pendingForever){mode='authorizing';surface=initialSurface??args.surface;}}else if(kind==='openLoginInBrowser'){if(transferError)throw transferError;transferred=true;if(!transferStuck)surface='browser';}else{assert.equal(kind,'cancel');if(cancelError)throw cancelError;mode='cancelling';}},
      close:async()=>{if(!closed){events.push('close '+index);closed=true;}}
    };peers.push(peer);return peer;
  }
  return {c,events,peers,proofs,calls,checkpoints,args:{open,record:async(name,proof)=>proofs.push({name,...proof}),checkpoint:async(phase,proof)=>{events.push('phase '+phase);checkpoints.push({phase,proof});if(phase==='awaitingNativeWindowClose')awaitingWindow=true;},clock:c,poll:(l,p,m)=>boundedPoll(l,p,m,c)}};
}
test('one GUI SignIn/cancel, postcancel full body window, local edit, natural restart and second window',async()=>{
  const h=harness();await exercise(h.args);
  assert.equal(h.events.filter(x=>x==='signIn').length,1);assert.equal(h.events.filter(x=>x==='cancel').length,1);assert.equal(h.peers.length,2);assert.equal(h.c.now(),8000);
  assert(h.events.indexOf('create')<h.events.indexOf('signIn'));assert(h.events.indexOf('cancel')<h.events.indexOf('edit'));assert(h.events.indexOf('close 0')<h.events.indexOf('open 1'));
  assert.deepEqual(h.proofs.map(p=>p.name),['localSave','authorizing','cancelledWindow','localEdit','restartWindow']);assert.equal(h.proofs[2].samples,7);assert.equal(h.proofs[4].samples,7);
  assert(!h.events.includes('enable'));assert(h.proofs[4].sameStore);
  assert.deepEqual(h.calls.filter(c=>c.action),[{action:'signIn',args:{surface:'browser'}},{action:'cancel',args:undefined}]);assert.equal(h.proofs[1].authorizationSurface,'browser');assert.equal(h.proofs[1].browserContinuation,false);
});
test('embedded cancel and embedded-to-browser keep five full-body/natural-restart checks with single commands',async()=>{
  for(const continueInBrowser of [false,true]){
    const h=harness();await exercise({...h.args,surface:'embedded',continueInBrowser});
    assert.deepEqual(h.calls.filter(c=>c.action),[{action:'signIn',args:{surface:'embedded'}},...(continueInBrowser?[{action:'openLoginInBrowser',args:undefined}]:[]),{action:'cancel',args:undefined}]);
    assert.equal(h.proofs.length,5);assert.equal(h.peers.length,2);assert.equal(h.c.now(),8000);assert.equal(h.proofs[1].requestedSurface,'embedded');assert.equal(h.proofs[1].authorizationSurface,continueInBrowser?'browser':'embedded');assert.equal(h.proofs[1].browserContinuation,continueInBrowser);assert.equal(h.proofs[1].physicalInput,false);
    assert.deepEqual(h.calls.filter(c=>c.inspect).map(c=>[c.inspect,c.surface]),[['signIn','embedded'],...(continueInBrowser?[['openLoginInBrowser','embedded']]:[]),['cancel',continueInBrowser?'browser':'embedded']]);
    assert.equal(h.proofs[2].samples,7);assert.equal(h.proofs[4].samples,7);for(const peer of h.peers)assertNatural(peer);
  }
});
const embeddedPending=()=>({...signedOut(),state:'authorizing',authorizationSurface:'embedded'});
test('window mode saves checkpoint before read-only wait, never sends cancel, and retains all five checks',async()=>{
  let reads=0;const h=harness({cancelError:Error('cancel must never be sent'),windowStatus:now=>{reads++;assert(h.checkpoints.some(c=>c.phase==='awaitingNativeWindowClose'));return now>=45000?signedOut():embeddedPending();}});
  await exercise({...h.args,surface:'embedded',cancelViaWindow:true});
  assert.deepEqual(h.calls,[{inspect:'signIn',surface:'embedded'},{action:'signIn',args:{surface:'embedded'}}]);
  assert.deepEqual(h.checkpoints.find(c=>c.phase==='awaitingNativeWindowClose').proof,{event:'awaiting-native-window-close',authorizationSurface:'embedded',timeoutMs:60000,readOnlyWait:true});
  assert.equal(h.c.now(),51000);assert(reads>45);assert.equal(h.peers.length,2);
  assert.deepEqual(h.proofs.map(p=>p.name),['localSave','authorizing','cancelledWindow','localEdit','restartWindow']);assert.equal(h.proofs[2].cancelOrigin,'native-window-close-observed');assert(!Object.hasOwn(h.proofs[2],'uiHandler'));assert(!Object.hasOwn(h.proofs[2],'physicalInput'));assert.equal(h.proofs[2].samples,7);assert.equal(h.proofs[4].samples,7);
  for(const peer of h.peers)assertNatural(peer);
});
test('unconfirmed window close times out at fixed 60s with no automatic cancel or later PASS',async()=>{
  for(const windowStatus of [embeddedPending,now=>now>=60000?signedOut():embeddedPending()]){
    const h=harness({windowStatus});await assert.rejects(()=>exercise({...h.args,surface:'embedded',cancelViaWindow:true}),e=>e.code==='CONDITION_TIMEOUT:native window close signedOut');
    assert.equal(h.c.now(),60000);assert.deepEqual(h.calls.filter(c=>c.action),[{action:'signIn',args:{surface:'embedded'}}]);assert(!h.events.includes('edit'));assert.equal(h.peers.length,1);assert.deepEqual(h.proofs.map(p=>p.name),['localSave','authorizing']);
    const report={status:'running',checks:h.proofs.map(p=>({name:p.name,status:'pass'})),failure:{code:'CONDITION_TIMEOUT:native window close signedOut'}};
    await finish(report,h.peers,async()=>{});assert.equal(report.status,'fail');assert.equal(report.failure.code,'CONDITION_TIMEOUT:native window close signedOut');
  }
});
test('status begun at 59s cannot pass when its awaited signedOut arrives at or beyond the fixed deadline',async()=>{
  for(const delayMs of [999,1000,2000]){
    let delayed=0;
    const h=harness({windowStatus:async now=>{if(now<59000)return embeddedPending();if(!delayed++){assert.equal(now,59000);await h.c.sleep(delayMs);}return signedOut();}});
    if(delayMs===999){await exercise({...h.args,surface:'embedded',cancelViaWindow:true});assert.equal(h.c.now(),65999);assert.equal(h.proofs.length,5);continue;}
    let failure;await assert.rejects(()=>exercise({...h.args,surface:'embedded',cancelViaWindow:true}),e=>{failure=e;return e.code==='CONDITION_TIMEOUT:native window close signedOut';});
    assert.equal(h.c.now(),59000+delayMs);assert.deepEqual(h.proofs.map(p=>p.name),['localSave','authorizing']);assert.equal(h.peers.length,1);assert(!h.events.includes('edit'));assert.deepEqual(h.calls.filter(c=>c.action),[{action:'signIn',args:{surface:'embedded'}}]);
    const report={status:'running',checks:h.proofs.map(p=>({name:p.name,status:'pass'})),failure:{code:failure.code}};
    await finish(report,h.peers,async()=>{});assert.equal(report.status,'fail');assert.equal(report.failure.code,'CONDITION_TIMEOUT:native window close signedOut');
  }
});
test('window wait rejects errors, changed surface and invalid signedOut; full-body restart loss still fails',async()=>{
  for(const windowStatus of [()=>({...embeddedPending(),error:{code:'account_network'}}),()=>({...embeddedPending(),authorizationSurface:'browser'}),()=>({...signedOut(),profile:{subject:'synthetic'}}),()=>({...signedOut(),enabled:true}),()=>({...signedOut(),authorizationSurface:'embedded'}),()=>({...signedOut(),devices:[{connected:true}]}),()=>({...signedOut(),conflictCount:1})]){
    const h=harness({windowStatus});await assert.rejects(()=>exercise({...h.args,surface:'embedded',cancelViaWindow:true}));assert.equal(h.c.now(),0);assert(!h.events.includes('cancel'));assert(!h.events.includes('edit'));assert.equal(h.peers.length,1);assert(!h.proofs.some(p=>p.name==='cancelledWindow'));
  }
  const h=harness({windowStatus:signedOut,restartMutation:w=>{w.notes[0].document.content[1].content[0].marks=[];}});await assert.rejects(()=>exercise({...h.args,surface:'embedded',cancelViaWindow:true}));assert.equal(h.peers.length,2);assert(!h.proofs.some(p=>p.name==='restartWindow'));assert(!h.events.includes('cancel'));
});
test('wrong/missing actual surface and transfer errors never pass authorizing or retry/fall back',async()=>{
  for(const config of [{initialSurface:'browser'},{initialSurface:'unknown'},{transferError:Error('private unexported failure')},{transferStatus:()=>({...signedOut(),state:'authorizing',authorizationSurface:'embedded',error:{code:'account_network'}})},{transferStatus:()=>({...signedOut(),state:'authorizing'})},{transferStatus:signedOut},{transferStuck:true}]){
    const h=harness(config);await assert.rejects(()=>exercise({...h.args,surface:'embedded',continueInBrowser:true}));
    assert.equal(h.events.filter(x=>x==='signIn').length,1);assert(h.events.filter(x=>x==='openLoginInBrowser').length<=1);assert(!h.events.includes('cancel'));assert(!h.events.includes('edit'));assert.equal(h.peers.length,1);assert.deepEqual(h.proofs.map(p=>p.name),['localSave']);
    if(config.transferStuck)assert.equal(h.c.now(),30000);
  }
  const h=harness({cancelSurface:'embedded'});await assert.rejects(()=>exercise({...h.args,surface:'embedded',continueInBrowser:true}));assert(!h.events.includes('edit'));
});
test('transfer consumes only remaining authorizing budget, including inspection/action time',async()=>{
  for(const transferTime of [3000,25000]){
    const c=clock(),budgets=[],calls=[];let started=false;
    const peer={enterAccount:async()=>{},inspectAction:async kind=>{if(kind==='openLoginInBrowser')await c.sleep(2000);},action:async(kind,args)=>{calls.push([kind,args]);if(kind==='signIn')started=true;else await c.sleep(transferTime);},status:async()=>c.now()<10000?signedOut():({...signedOut(),state:'authorizing',authorizationSurface:'embedded'})};
    const poll=(label,predicate,ms)=>{budgets.push(ms);return boundedPoll(label,predicate,ms,c);};
    await assert.rejects(()=>beginAuthorization(peer,{surface:'embedded',continueInBrowser:true},{now:c.now,poll}),e=>e.code==='CONDITION_TIMEOUT:same authorization continues in browser');
    assert(started);assert.deepEqual(budgets,[30000,transferTime===3000?15000:0]);assert.equal(c.now(),transferTime===3000?30000:37000);assert.deepEqual(calls,[['signIn',{surface:'embedded'}],['openLoginInBrowser',undefined]]);
  }
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
