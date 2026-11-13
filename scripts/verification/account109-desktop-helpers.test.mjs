// Policy tests and in-memory callbacks only: no App, browser, ADB, or native build.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {until} from './sync108-native-driver.mjs';
import {safeStatus,requireHealthy,waitForAccountStatuses,waitForConnectedData,accountEnabled,statusObserver,nativeAccount,attachmentRefs,preserveAttachments,canonicalBody,snapshotNotes,observeLogout,failureCode,finishReport} from './account109-desktop-helpers.mjs';

const status=(overrides={})=>({state:'ready',enabled:true,profile:{subject:'private-subject',username:'cybernoteqa20261113a'},devices:[{id:'private-device-id',name:'private-name',online:true,current:true,connected:false}],pendingCount:0,conflictCount:0,...overrides});
const out=()=>status({state:'signedOut',enabled:false,profile:undefined,devices:[]});
const local={id:'local',document:{type:'doc',content:[{type:'text',text:'完整中文 😀'}]},plainText:'完整中文 😀'};

test('token response diagnostics survive safe status recording before terminal failure',()=>{
 for(const tokenOperation of ['codeExchange','refresh']) for(const tokenField of ['tokenType','accessToken','expiresIn','scope']) {
  const error={code:'account_auth_identity_invalid',reason:'responseMetadata',tokenOperation,tokenField,message:'private-response-sentinel',token:'private-response-sentinel'};
  const s=status({state:'error',error}),report={};
  statusObserver(report,()=> 'b-recovery')('b',s);
  assert.deepEqual(report.statusTransitions[0].error,{code:error.code,reason:error.reason,tokenOperation,tokenField});
  assert(!JSON.stringify(report).includes('private-response-sentinel'));
  assert.throws(()=>requireHealthy(s),{code:'ACCOUNT_AUTHENTICATION_FAILED'});
 }
});

test('safe status never guesses partial or cross-branch token diagnostics',()=>{
 const valid={code:'account_auth_identity_invalid',reason:'responseMetadata',tokenOperation:'refresh',tokenField:'scope'};
 const {tokenOperation,...missingOperation}=valid,{tokenField,...missingField}=valid;
 for(const error of [missingOperation,missingField,{code:valid.code,reason:valid.reason},
  ...[null,0,{},[], 'private-response-sentinel'].flatMap(value=>[{...valid,tokenOperation:value},{...valid,tokenField:value}]),
  {...valid,code:'account_cleanup_required'},{...valid,reason:'signature'},
  {...valid,stage:'identityRefresh'},{...valid,providerReason:'identityRejected'},
 ]) {
  const safe=safeStatus(status({state:'error',error}));
  assert.equal(safe.error.tokenOperation,undefined);assert.equal(safe.error.tokenField,undefined);
  assert(!JSON.stringify(safe).includes('private-response-sentinel'));
 }
});

test('safe status preserves live per-path samples and drops stale or inactive evidence without raw provider text',()=>{
 const transport={generation:3,sample:8,ageMs:20,enrollment:'webrtc-direct',sync:'cloudflare-tunnel',address:'private-provider-sentinel'};
 const s=status({transportGeneration:3,devices:[{id:'private-id',name:'private-name',online:true,current:false,connected:true,transport}]});
 const safe=safeStatus(s);assert.deepEqual(safe.devices[0].transport,{generation:3,sample:8,ageMs:20,enrollment:'webrtc-direct',sync:'cloudflare-tunnel'});
 assert.equal(safe.transportGeneration,3);assert(!JSON.stringify(safe).includes('private-'));
 for(const change of [x=>{x.state='paused';},x=>{x.enabled=false;},x=>{x.error={code:'account_network'};},x=>{x.transportGeneration=4;},x=>{x.devices[0].current=true;},x=>{x.devices[0].transport.ageMs=3001;},x=>{x.devices[0].transport.sync='private-provider-sentinel';},x=>{delete x.devices[0].transport.sample;}]){
  const copy=structuredClone(s);change(copy);const value=safeStatus(copy);assert.equal(value.devices[0].transport,undefined);assert(!JSON.stringify(value).includes('private-'));
 }
});

test('recorded recovery authentication failure terminates discovery on the first poll',async()=>{
  // Same safe DTO shape as recovery01: one ready device and one auth error.
  const report={};const observe=statusObserver(report,()=> 'automatic-discovery');let polls=0;
  const statuses=[status(),status({state:'error',error:{code:'account_authentication',message:'not retained'},devices:[]})];
  await assert.rejects(until('discovery',async()=>{
    polls++;
    for(const [i,s] of statuses.entries()){observe(i===0?'a':'b',s);requireHealthy(s);}
    return false;
  },120000),{code:'ACCOUNT_AUTHENTICATION_FAILED'});
  assert.equal(polls,1);assert.equal(report.statusTransitions[1].error.code,'account_authentication');
});

test('authorization, restore and enable errors fail immediately, including errors with profiles',()=>{
  for(const code of ['account_authentication','account_auth_callback_invalid','account_auth_identity_invalid','account_auth_code_rejected','account_auth_token_response_invalid','account_auth_refresh_missing']){
    for(const state of ['authorizing','connecting','error'])assert.throws(()=>requireHealthy(status({state,error:{code}})),{code:'ACCOUNT_AUTHENTICATION_FAILED'});
  }
  assert.throws(()=>requireHealthy(status({state:'error',error:undefined})),{code:'ACCOUNT_STATUS_FAILED'});
  assert.throws(()=>requireHealthy(status({error:{code:'account_network'}})),{code:'ACCOUNT_STATUS_FAILED'});
  for(const state of ['authorizing','connecting','ready','paused','signedOut'])assert.doesNotThrow(()=>requireHealthy(status({state})));
});

const network=()=>status({state:'error',error:{code:'account_network',stage:'coordinatorRegistration'}});
for(const scenario of ['slow connection then data','connection timeout','data timeout'])test(scenario+' keeps connection and data deadlines separate',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:0});
  const connectedAt=scenario==='connection timeout'?Infinity:80000,appliedAt=scenario==='slow connection then data'?130000:Infinity;
  let firstDataPoll,finished=false,rejection;
  const pending=waitForConnectedData('controlled catch-up',async()=>[status({state:Date.now()<connectedAt?'connecting':'ready',devices:[{current:false,connected:Date.now()>=connectedAt}]})],()=>{
    firstDataPoll??=Date.now();return Date.now()>=appliedAt;
  });
  pending.then(()=>{finished=true;},error=>{rejection=error;finished=true;});
  // Drive the real until() implementation without wall-clock sleeps or devices.
  for(let tick=0;tick<=150&&!finished;tick++){await new Promise(resolve=>setImmediate(resolve));if(!finished)t.mock.timers.tick(1000);}
  assert(finished,'Both phase budgets must remain bounded');
  if(scenario==='connection timeout'){assert.equal(firstDataPoll,undefined);assert.equal(rejection.code,'CONDITION_TIMEOUT:controlled catch-up connection');assert.equal(Date.now(),120000);}
  else{
    assert.equal(firstDataPoll,80000,'No data polling before connection readiness');
    if(scenario==='data timeout'){assert.equal(rejection.code,'CONDITION_TIMEOUT:controlled catch-up');assert.equal(Date.now(),140000,'Data gets its own 60 seconds after connection');}
    else{assert.equal(rejection,undefined);assert.equal(Date.now(),130000,'80-second setup plus 50-second data transfer succeeds');}
  }
});
test('bounded polling retains network transitions and waits for ready before evaluating success',async()=>{
  const report={},observe=statusObserver(report,()=> 'automatic-discovery');let polls=0,successCalls=0;
  const result=await waitForAccountStatuses('network recovers',async()=>{
    const s=polls++===0?network():status();observe('a',s);return [s];
  },([s])=>{successCalls++;return s.state==='ready';},1000);
  assert.equal(polls,2);assert.equal(successCalls,1);assert.equal(result[0].state,'ready');
  assert.equal(report.statusTransitions[0].error.code,'account_network');assert.equal(report.statusTransitions[1].state,'ready');
});
test('persistent network status reaches the bounded timeout even if data already matches',async()=>{
  let polls=0,successCalls=0;
  await assert.rejects(waitForAccountStatuses('persistent network',async()=>{polls++;return [network()];},()=>{successCalls++;return true;},150),{code:'CONDITION_TIMEOUT:persistent network'});
  assert(polls>=2);assert.equal(successCalls,0);
  assert.throws(()=>requireHealthy(network()),{code:'ACCOUNT_STATUS_FAILED'},'Network remains fatal outside bounded waits');
});
test('authentication and permanent failures still fail immediately inside bounded waits',async()=>{
  for(const code of ['account_authentication','account_configuration','account_owner_workspace_mismatch','account_enrollment_invalid','account_storage','account_sync_protocol','account_sync_failed','account_cancelled','account_busy','account_platform_unsupported','account_cleanup_required','unknown']){
    let polls=0,successCalls=0;
    const s=status({state:'error',error:{code,providerReason:'network'}});
    await assert.rejects(waitForAccountStatuses('permanent failure',async()=>{polls++;return [network(),s];},()=>{successCalls++;return true;},120000),{code:code==='account_authentication'?'ACCOUNT_AUTHENTICATION_FAILED':'ACCOUNT_STATUS_FAILED'});
    assert.equal(polls,1);assert.equal(successCalls,0);
  }
  assert.throws(()=>requireHealthy(status({state:'error'}),{pendingNetwork:true}),{code:'ACCOUNT_STATUS_FAILED'});
});
test('enable stays pending through a transient command result and enabled error sample',async()=>{
  let began=0,polls=0,successCalls=0;
  const transient=status({state:'ready',enabled:true,error:{code:'account_network'}});
  assert.equal(accountEnabled(transient),false);
  assert.equal(accountEnabled(status({state:'error'})),false);
  assert.equal(accountEnabled(status({state:'authorizing'})),false);
  assert.equal(accountEnabled(status({enabled:false})),false);
  const [enabled]=await waitForAccountStatuses('enable settles',async()=>[polls++===0?transient:status({state:'connecting'})],([s])=>{successCalls++;return accountEnabled(s);},1000,async()=>{began++;assert.equal(requireHealthy(transient,{pendingNetwork:true}),false);});
  assert.equal(began,1);assert.equal(polls,2);assert.equal(successCalls,1);assert.equal(enabled.state,'connecting');assert(!enabled.error);
});

test('transitions are deduplicated per device/phase, record recovery, and bound oscillation',()=>{
  const report={};let phase='restore-existing-grants';const observe=statusObserver(report,()=>phase);
  assert(observe('a',status({state:'connecting'})));assert(!observe('a',status({state:'connecting'})));
  assert(observe('a',status()));assert(observe('b',status()));phase='automatic-discovery';assert(observe('a',status()));
  assert(observe('a',status({state:'error',error:{code:'account_authentication'}})));
  assert(observe('a',status()));assert.equal(report.statusTransitions.length,6);
  for(let i=0;i<300;i++)observe('a',status({enabled:i%2===0}));
  assert.equal(report.statusTransitions.length,256);assert(report.droppedStatusTransitions>0);
});

test('safe projection retains only fixed labels, booleans and bounded numeric metrics',()=>{
  const secret='https://private.invalid/?token=DO_NOT_RECORD';
  const s=status({state:secret,enabled:secret,profile:{subject:secret,displayName:secret,username:secret},error:{code:secret,message:secret,stage:secret,reason:secret,providerReason:secret,token:secret},devices:[{id:secret,name:secret,online:secret,current:true,connected:false}],pendingCount:secret,conflictCount:-1});
  const safe=safeStatus(s);assert(!JSON.stringify(safe).includes(secret));
  assert.equal(safe.state,'unknown');assert.deepEqual(safe.error,{code:'unknown',stage:'unknown',reason:'unknown',providerReason:'unknown'});
  assert.equal(safe.enabled,false);assert.equal(safe.pendingCount,undefined);assert.equal(safe.conflictCount,undefined);
  assert.deepEqual(safe.devices,[{online:false,current:true,connected:false}]);
  const known=safeStatus(status({error:{code:'account_auth_identity_invalid',stage:'identityProvider',reason:'nonce',message:secret}}));
  assert.deepEqual(known.error,{code:'account_auth_identity_invalid',stage:'identityProvider',reason:'nonce'});
  assert.equal(safeStatus(status({devices:Array(300).fill({})})).devices.length,256);
});
test('new fixed endpoint stages and finite provider failure categories survive transitions and failure snapshots',()=>{
  for(const stage of ['coordinatorProfile','coordinatorEnrollment','coordinatorJwks','authorizationProvider','identitySession','identityRefresh','identityRevocation','coordinatorSession']){
    assert.equal(safeStatus(status({error:{code:'account_authentication',stage}})).error.stage,stage);
  }
  for(const providerReason of ['configuration','network','invalidCallback','invalidIdentity','identityRejected','codeExchangeRejected','tokenResponseInvalid','missingRefreshToken','cancelled','noSession','ownershipMismatch','storage','refreshFailed','revocationFailed','busy']){
    const error={code:'account_authentication',stage:'authorizationProvider',providerReason};
    const s=status({state:'error',error:{...error,message:'private provider detail'}}),report={};
    statusObserver(report,()=> 'automatic-discovery')('b',s);
    assert.deepEqual(safeStatus(s).error,error);assert.deepEqual(report.statusTransitions[0].error,error);
    assert.throws(()=>requireHealthy(s),{code:'ACCOUNT_AUTHENTICATION_FAILED'});
    assert(!JSON.stringify(report).includes('private provider detail'));
  }
});

const attachmentNode=id=>({type:'attachment',attrs:{id,name:'fixture.bin',kind:'file'}});
const mediaNote=(id,attachmentId)=>({...local,id,document:{type:'doc',content:[...local.document.content,attachmentNode(attachmentId)]}});
const mediaRow=(id,noteId)=>({id,noteId,displayName:'fixture.bin',mime:'application/octet-stream',kind:'file',size:4096});
test('branch edits preserve attachment nodes while replacing complete rich text',()=>{
  const original=mediaNote('source','old-attachment'),replacement={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'new Chinese 中文',marks:[{type:'bold'}]}]}]};
  const edited=preserveAttachments(original.document,replacement);
  assert.deepEqual(attachmentRefs(edited),['old-attachment']);assert.deepEqual(edited.content[0],replacement.content[0]);
  assert.notEqual(edited.content[1],original.document.content[1]);assert.deepEqual(original.document,mediaNote('source','old-attachment').document);
});
test('keepAll comparisons resolve remapped IDs to owned metadata and retain full content/reference checks',()=>{
  const a=mediaNote('source','old-attachment'),b=mediaNote('copy','new-attachment');
  const wa={attachments:[mediaRow('old-attachment','source')]},wb={attachments:[mediaRow('new-attachment','copy')]};
  const expected=canonicalBody(wa,a);assert.equal(canonicalBody(wb,b),expected);
  assert.notEqual(canonicalBody(wb,{...b,document:local.document}),expected,'Missing attachment nodes cannot match');
  assert.notEqual(canonicalBody(wb,{...b,plainText:'different'}),expected);
  assert.notEqual(canonicalBody({attachments:[{...wb.attachments[0],mime:'wrong/type'}]},b),expected);
  assert.notEqual(canonicalBody(wb,{...b,document:{...b.document,content:[{...b.document.content[0],marks:[{type:'italic'}]},b.document.content[1]]}}),expected,'Formatting remains part of the comparison');
  for(const attachments of [[],[mediaRow('new-attachment','someone-else')],[...wb.attachments,...wb.attachments]])assert.throws(()=>canonicalBody({attachments},b),/exactly one owned row/);
});

test('failure reporting never copies arbitrary upstream error strings',()=>{
  for(const code of ['TOKEN_SECRET','https://private.invalid/token','account_authentication'])assert.equal(failureCode({code,message:code}),'CHECK_FAILED');
  assert.equal(failureCode({code:'CONDITION_TIMEOUT:private token'}),'CONDITION_TIMEOUT');
  assert.equal(failureCode({code:'ACCOUNT_AUTHENTICATION_FAILED'}),'ACCOUNT_AUTHENTICATION_FAILED');
});

test('native account path constructs only existing command payloads and rejects injection',async()=>{
  const calls=[];const app={evaluate:async(expression,arg)=>{calls.push({expression,arg});return out();}};
  for(const type of ['status','signIn','signOut','syncNow'])await nativeAccount(app,type);
  await nativeAccount(app,'setEnabled',{enabled:false});await nativeAccount(app,'setEnabled',{enabled:true});
  assert.deepEqual(calls.map(c=>c.arg),[{type:'status'},{type:'signIn'},{type:'signOut'},{type:'syncNow'},{type:'setEnabled',enabled:false},{type:'setEnabled',enabled:true}]);
  assert(calls.every(c=>c.expression==="window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})"));
  for(const [type,args] of [['grant',{}],['signIn',{url:'https://x.invalid'}],['status',{token:'secret'}],['setEnabled',{enabled:true,grant:'secret'}],['setEnabled',{}],['setEnabled',{enabled:'true'}]])await assert.rejects(nativeAccount(app,type,args));
  assert.equal(calls.length,6);
});

function logoutCallbacks({notes=()=>[local],account=out}={}){
  let clock=0;
  return {readStatus:async()=>account(clock),readNotes:async()=>notes(clock),snapshot:snapshotNotes([local]),remoteIds:['remote-before','remote-after'],durationMs:3000,now:()=>clock,sleep:async ms=>{clock+=ms;}};
}
test('logout samples full windows before/after restart and preserves complete local bodies',async()=>{
  for(const phase of ['before restart','after restart']){
    const result=await observeLogout(logoutCallbacks());assert.equal(result.observedMs,3000,phase);assert.equal(result.samples,31,phase);
  }
});
test('logout detects delayed remote application, lost notes, changed rich document and reauthentication',async()=>{
  for(const callbacks of [
    logoutCallbacks({notes:ms=>ms>=2500?[local,{...local,id:'remote-before'}]:[local]}),
    logoutCallbacks({notes:ms=>ms>=2500?[local,{...local,id:'remote-after'}]:[local]}),
    logoutCallbacks({notes:()=>[]}),
    logoutCallbacks({notes:()=>[{...local,document:{type:'doc'}}]}),
    logoutCallbacks({notes:()=>[{...local,plainText:'changed'}]}),
    logoutCallbacks({account:ms=>ms>=2500?status():out()}),
    logoutCallbacks({account:()=>outWithConnection()}),
  ])await assert.rejects(observeLogout(callbacks));
  function outWithConnection(){return {...out(),devices:[{connected:true}]};}
});
test('one slow read cannot substitute for repeated logout observations',async()=>{
  let clock=0;
  const callbacks=logoutCallbacks();
  callbacks.now=()=>clock;callbacks.readNotes=async()=>{clock=4000;return [local];};
  await assert.rejects(observeLogout(callbacks),/requires repeated samples/);
});

test('overall pass is deferred until all owned processes close naturally',async()=>{
  const report={status:'running',scenarios:{logout:'pass',concurrentOffline:'pass'}};let release,saved=false;
  const app={lifecycle:{},close:()=>new Promise(resolve=>{release=()=>{app.lifecycle.naturalExit=true;resolve();};})};
  const finishing=finishReport(report,[app],async()=>{saved=true;assert.equal(report.status,'pass');});
  assert.equal(report.status,'running');assert.equal(saved,false);release();await finishing;assert(saved);
});
test('cleanup rejection, nonnatural exit, prior failure and unfinished coverage cannot pass',async()=>{
  for(const mode of ['rejected','forced','prior-failure','missing-scenario']){
    const report={status:mode==='prior-failure'?'fail':'running',scenarios:{logout:mode==='missing-scenario'?'running':'pass',concurrentOffline:'pass'}};
    if(mode==='prior-failure')report.failure={phase:'automatic-discovery',code:'ACCOUNT_AUTHENTICATION_FAILED'};
    const app={lifecycle:{naturalExit:!['forced','rejected'].includes(mode)},close:async()=>{if(mode==='rejected')throw Error('private cleanup detail');}};
    let saved;await finishReport(report,[app],async()=>{saved=JSON.stringify(report);});
    assert.equal(report.status,'fail');assert(saved);assert(!saved.includes('private cleanup detail'));
    if(mode==='prior-failure')assert.equal(report.failure.code,'ACCOUNT_AUTHENTICATION_FAILED');
    if(['forced','rejected'].includes(mode))assert.equal(report.cleanupFailure.code,'CLEANUP_FAILED');
  }
});
