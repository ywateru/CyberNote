import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {resolve} from 'node:path';
import {parseArgs,parseStatus,command,safeStatus,safeFailure,safeAccountError,safeFailureReceipt,safeLifecycle,closeNativeClients,waitFor,observeWindow,syncOnce,validatePackage,ownedFile,expectedSummary,expectedAfter,validateDeployment,ProtocolProbes,main} from './account110-device-actions.mjs';

const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deploymentId='dpl_SyntheticApprovedDeployment';
const deploymentReceipt=()=>({schemaVersion:1,status:'READY-anonymous-smoke-passed-with-preserved-first-failure-and-bounded-health-followup',sourceRevision:source,reviewedServerRevision:'b'.repeat(40),serverSourceDiffEmpty:true,productionDeploymentId:deploymentId,readyState:'READY',finalProductionAssignmentConfirmed:true,publicSmokePassed:true,allUploadedSourceBytesFromPinnedCommit:true,sourceFramedSha256:'b'.repeat(64),sourceManifestFileSha256:'c'.repeat(64),projectName:'cybernote-sync',domains:['cybernote-sync.vercel.app','cybernote-sync.aixgg.com']});
const source='a'.repeat(40),sha=v=>createHash('sha256').update(v).digest('hex');
const row=(id,current=false)=>({id,name:'Synthetic name',online:true,current,connected:false,syncAvailable:true,summary:{noteCount:1,lastNoteUpdatedAt:1234,capturedAt:2345}});
const status=extra=>({state:'ready',enabled:true,profile:{subject:'private-subject',displayName:'private-display-name',username:'private-username'},devices:[row(a,true),row(b)],pendingCount:0,conflictCount:0,...extra});
const op=(phase='running',extra={})=>({deviceId:b,direction:'push',phase,startedAt:10,...(phase==='running'?{}:{finishedAt:70000}),...extra});
const expectCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
const rejection=(promise,code)=>assert.rejects(promise,e=>e.code===code);

// Every fixture is synthetic. None instantiates NativeApp, invokes product modules,
// opens a socket, reads a real library, or accesses auth/credential files.
test('prepare is the default; run requires exact finite inputs; credential/URL options rejected',()=>{
 const base=['--output','/private/tmp/account110-device-actions-fixture'];
 assert.equal(parseArgs(base).mode,'prepare');
 assert.equal(parseArgs(base).authorizationTimeoutMs,120000);
 expectCode(()=>parseArgs([...base,'--run']),'LIVE_INPUTS_REQUIRED');
 for(const flag of ['--token','--grant','--url','--endpoint','--password','--resume-from'])expectCode(()=>parseArgs([...base,flag,'secret']),'INVALID_ARGUMENTS');
 for(const path of ['/Users/water/Library','/private/tmp/account109-old','/private/tmp/account110-device-actions-x/../other'])expectCode(()=>parseArgs(['--output',path]),'INVALID_OUTPUT');
 expectCode(()=>parseArgs([...base,'--output','/private/tmp/account110-device-actions-b']),'INVALID_ARGUMENTS');
 const run=parseArgs([...base,'--run','--source',source,'--package-receipt','/private/tmp/package.json','--deployment-source',source,'--deployment-id',deploymentId,'--deployment-receipt','/private/tmp/deploy.json','--deployment-sha256','b'.repeat(64)]);
 assert.equal(run.mode,'run');
});
test('authorization timeout uses strict decimal bounded integers, startup/network budgets stay separate',()=>{
 const base=['--output','/private/tmp/account110-device-actions-fixture'];
 for(const n of ['120000','600000'])assert.equal(parseArgs([...base,'--authorization-timeout-ms',n]).authorizationTimeoutMs,Number(n));
 for(const n of ['119999','600001','1e5','120000.0','+120000',' 120000','NaN','Infinity','9007199254740992'])expectCode(()=>parseArgs([...base,'--authorization-timeout-ms',n]),'INVALID_ARGUMENTS');
});
test('strict status rejects malformed DTOs, duplicates, offline summaries and terminal errors',()=>{
 assert.equal(parseStatus(status()).devices.length,2);
 for(const mutate of [s=>s.extra='secret',s=>s.devices.push(row(a.toUpperCase())),s=>s.devices[1].summary.noteCount=0,s=>s.devices[1].online=false,s=>s.devices[1].syncAvailable='true',s=>s.deviceOperation=op('running',{finishedAt:12}),s=>s.deviceOperation=op('succeeded',{finishedAt:1}),s=>s.deviceOperation=op('succeeded',{direction:'auto'}),s=>s.devices[1].transport={generation:1,sample:1,ageMs:0,enrollment:'unavailable',sync:'unknown'}]){
  const s=status();mutate(s);expectCode(()=>parseStatus(s),'INVALID_DTO');
 }
 expectCode(()=>parseStatus(status({error:{code:'account_network',message:'private provider body'}})),'ACCOUNT_FAILURE');
 expectCode(()=>parseStatus(status({state:'error'})),'ACCOUNT_FAILURE');
 expectCode(()=>parseStatus(status({deviceOperation:op('failed')})),'DEVICE_OPERATION_FAILED');
});
test('safe reports contain finite device labels/counts, never profile, IDs, names or raw failures',()=>{
 const s=parseStatus(status({deviceOperation:op('succeeded')})),safe=JSON.stringify(safeStatus(s,new Map([[a,'a'],[b,'b']])));
 for(const privateValue of [a,b,'private-subject','private-display-name','private-username','Synthetic name'])assert(!safe.includes(privateValue));
 assert(safe.includes('"device":"b"'));assert(safe.includes('"noteCount":1'));
 assert.equal(safeFailure(Object.assign(new Error('private raw error'),{code:'private_code'})),'CHECK_FAILED');
});
test('account failure retains only validated finite fields before parseStatus throws',()=>{
 const error={code:'account_network',stage:'coordinatorJwks',requestReason:'httpStatus',httpStatus:503,message:'DO NOT EMIT https://private/ bearer secret'};
 assert.throws(()=>parseStatus(status({error,deviceOperation:op()})),e=>{
  assert.equal(e.code,'ACCOUNT_FAILURE');assert.deepEqual(safeFailureReceipt(e),{code:'ACCOUNT_FAILURE',accountError:{code:'account_network',stage:'coordinatorJwks',requestReason:'httpStatus',httpStatus:503}});
  assert(!JSON.stringify(e).includes('private'));return true;
 });
 assert.deepEqual(safeAccountError({code:'account_auth_identity_invalid',message:'secret',reason:'responseMetadata',tokenOperation:'codeExchange',tokenField:'scope'}),{code:'account_auth_identity_invalid'});
 assert.deepEqual(safeAccountError({code:'account_sync_failed'}),{code:'account_sync_failed'}); // Legacy generic error remains valid.
});
test('sync error diagnostics require exact paired enums and account_sync_failed',()=>{
 for(const syncStage of ['pair','recoverPairing','transfer','retirement'])for(const syncReason of ['io','invalid_input','corrupt_identity','authentication','expired','revoked','workspace_mismatch','protocol','limit','timeout','stopped','backend','plan_stale','busy','transport']){
  const error={code:'account_sync_failed',syncStage,syncReason,message:'secret'};
  assert.deepEqual(safeAccountError(error),{code:error.code,syncStage,syncReason});
  assert.throws(()=>parseStatus(status({error,deviceOperation:op('failed')})),e=>e.code==='ACCOUNT_FAILURE'&&e.accountError.syncStage===syncStage&&e.accountError.syncReason===syncReason);
 }
 for(const error of [
  {code:'account_sync_failed',syncStage:'pair'},{code:'account_sync_failed',syncReason:'timeout'},
  ...[null,1,'Pair','unknown','https://private/'].map(syncStage=>({code:'account_sync_failed',syncStage,syncReason:'timeout'})),
  ...[null,1,'Timeout','workspaceMismatch','private message'].map(syncReason=>({code:'account_sync_failed',syncStage:'pair',syncReason})),
  {code:'account_network',syncStage:'pair',syncReason:'timeout'},
  {code:'account_sync_failed',syncStage:'pair',syncReason:'timeout',stage:'coordinator'},
  {code:'account_sync_failed',syncStage:'pair',syncReason:'timeout',httpStatus:500},
 ])expectCode(()=>parseStatus(status({error})),'INVALID_DTO');
});
test('request diagnostics preserve valid HTTP/code combinations and reject false or unknown details',()=>{
 for(const stage of ['coordinatorProfile','coordinatorEnrollment','coordinatorJwks']){
  for(const httpStatus of [100,199,300,400,401,403,500,599]){
   const code=[401,403].includes(httpStatus)?'account_authentication':'account_network';
   assert.deepEqual(safeAccountError({code,stage,requestReason:'httpStatus',httpStatus}),{code,stage,requestReason:'httpStatus',httpStatus});
  }
  for(const requestReason of ['timeout','connect','request','responseBody','invalidResponse'])assert.deepEqual(safeAccountError({code:'account_network',stage,requestReason}),{code:'account_network',stage,requestReason});
 }
 const base={code:'account_network',stage:'coordinatorJwks',requestReason:'httpStatus',httpStatus:500};
 for(const extra of [{httpStatus:200},{httpStatus:299},{httpStatus:600},{httpStatus:999},{httpStatus:null},{httpStatus:'500'},{httpStatus:401},{code:'account_authentication'},{stage:'coordinator'},{stage:'private'},{requestReason:'private'},{requestReason:'timeout'},{requestReason:null},{requestReason:undefined}])expectCode(()=>safeAccountError({...base,...extra}),'INVALID_DTO');
 for(const e of [{code:'account_network',httpStatus:500},{code:'account_network',requestReason:'timeout'},{code:'account_authentication',stage:'coordinatorJwks',requestReason:'timeout'}])expectCode(()=>safeAccountError(e),'INVALID_DTO');
});
test('unknown account diagnostics never become report strings or inferred native reasons',()=>{
 for(const error of [{code:'PRIVATE_PROVIDER_BODY',message:'private'}, {code:'account_network',stage:'https://private/'}, {code:'account_network',rawBody:'private'},null,'private'])expectCode(()=>parseStatus(status({error})),'INVALID_DTO');
 assert.deepEqual(safeFailureReceipt({code:'ACCOUNT_FAILURE',accountError:{code:'PRIVATE_PROVIDER_BODY',message:'private'}}),{code:'ACCOUNT_FAILURE'});
 assert.deepEqual(safeFailureReceipt({code:'ACCOUNT_FAILURE',accountError:{code:'account_network',message:'private',stage:'coordinator'}}),{code:'ACCOUNT_FAILURE',accountError:{code:'account_network',stage:'coordinator'}});
 assert.deepEqual(safeFailureReceipt({code:'CHECK_FAILED',accountError:{code:'account_network'}}),{code:'CHECK_FAILED'});
 assert.deepEqual(safeFailureReceipt({code:'ACCOUNT_FAILURE',message:'account_network HTTP 503'}),{code:'ACCOUNT_FAILURE'});
});
test('observed fixed driver/bridge failures survive safe mapping; unknown errors and raw strings do not',()=>{
 for(const code of ['APP_EXITED','EXIT_BEFORE_RESPONSE','EXIT_BEFORE_HELLO','STDIN_ERROR','INVALID_FRAME','TRUNCATED_FRAME','UNEXPECTED_RESPONSE','EVAL_FAILED','JS_ERROR','NATIVE_TIMEOUT','PIPE_CLOSE_TIMEOUT','NON_NATURAL_EXIT'])
  assert.equal(safeFailure(Object.assign(new Error('private raw message and authorization URL'),{code})),code);
 for(const code of ['PRIVATE_PROVIDER_BODY','SIGABRT','APP_EXITED https://private/','private_code'])assert.equal(safeFailure({code}),'CHECK_FAILED');
 assert.equal(safeFailure(new Error('APP_EXITED')),'CHECK_FAILED'); // Do not infer a code from text.
});
test('lifecycle distinguishes observed signal exits from unknown exit state without emitting private fields',()=>{
 const app={name:'a',lifecycle:{naturalExit:true,pid:999,directory:'/private/library',argv:['private'],failureCode:'EXIT_BEFORE_RESPONSE',forcedSignals:[]}};
 let safe=safeLifecycle(app);assert.equal(safe.exitObserved,false);assert.equal(safe.exitSignal,null);assert.equal(safe.closeObserved,false);assert.equal(safe.naturalExit,false);assert.equal(safe.driverFailureCode,'EXIT_BEFORE_RESPONSE');
 app.lifecycle.exit={code:null,signal:'SIGABRT'};app.lifecycle.close={code:null,signal:'SIGABRT'};
 safe=safeLifecycle(app,{closeConfirmed:true});assert.equal(safe.exitObserved,true);assert.equal(safe.exitSignal,'SIGABRT');assert.equal(safe.exitCode,null);assert.equal(safe.closeConfirmed,true);assert.equal(safe.naturalExit,false);
 app.lifecycle.exit={code:0,signal:null};assert.equal(safeLifecycle(app,{closeConfirmed:true}).naturalExit,false);delete app.lifecycle.failureCode;assert.equal(safeLifecycle(app,{closeConfirmed:true}).naturalExit,true);
 app.lifecycle.exit.signal='private signal';app.lifecycle.failureCode='PRIVATE_PROVIDER_BODY';safe=safeLifecycle(app,{closeConfirmed:true});assert.equal(safe.exitSignal,'unknown');assert.equal(safe.driverFailureCode,'CHECK_FAILED');assert.equal(safe.naturalExit,false);
 for(const secret of ['private','999','argv','directory'])assert(!JSON.stringify(safe).includes(secret));
});
function nativeLifecycleFixture(name='a'){
 let finish;const lifecycle={naturalExit:true,forcedSignals:[]};const closed=new Promise(resolve=>{finish=(code=0,signal=null)=>{lifecycle.close={code,signal};resolve(lifecycle);};});
 return {app:{name,lifecycle,closed,close:async()=>{}},finish};
}
test('native finalization waits for observed pipe close after exit or shutdown ACK',async()=>{
 const f=nativeLifecycleFixture();f.app.lifecycle.exit={code:0,signal:null};let settled=false;
 const cleanup=closeNativeClients([f.app]).then(value=>{settled=true;return value;});
 await Promise.resolve();await Promise.resolve();assert.equal(settled,false); // close() ACK and exit are insufficient.
 f.finish();const result=await cleanup;assert(result.allClosed);assert(!result.failed);assert(result.lifecycle[0].naturalExit);assert(result.lifecycle[0].closeConfirmed);
});
test('native failure retains observed signal/driver/cleanup codes and joins the healthy sibling',async()=>{
 const a=nativeLifecycleFixture('a'),b=nativeLifecycleFixture('b');
 a.app.lifecycle.exit={code:null,signal:'SIGABRT'};a.app.lifecycle.failureCode='EXIT_BEFORE_RESPONSE';a.app.lifecycle.naturalExit=false;
 a.app.close=async()=>{throw Object.assign(new Error('private process error with URL'),{code:'EXIT_BEFORE_RESPONSE'});};a.finish(null,'SIGABRT');
 b.app.lifecycle.exit={code:0,signal:null};let settled=false;
 const cleanup=closeNativeClients([a.app,b.app]).then(value=>{settled=true;return value;});await Promise.resolve();await Promise.resolve();assert(!settled);
 b.finish();const result=await cleanup;assert(result.allClosed);assert(result.failed);assert(!result.lifecycle[0].naturalExit);assert(result.lifecycle[1].naturalExit);
 assert.equal(result.lifecycle[0].exitSignal,'SIGABRT');assert.equal(result.lifecycle[0].driverFailureCode,'EXIT_BEFORE_RESPONSE');assert.equal(result.lifecycle[0].cleanupErrorCode,'EXIT_BEFORE_RESPONSE');assert(!JSON.stringify(result).includes('private'));
});
test('unconfirmed close is bounded, remains failed, and does not invent exit or signal evidence',async()=>{
 const f=nativeLifecycleFixture(),result=await closeNativeClients([f.app],{closeWaitMs:5});
 assert(!result.allClosed);assert(result.failed);const l=result.lifecycle[0];assert(!l.exitObserved);assert(!l.closeObserved);assert(!l.closeConfirmed);assert.equal(l.exitCode,null);assert.equal(l.exitSignal,null);assert.equal(l.cleanupErrorCode,'PIPE_CLOSE_TIMEOUT');
 f.finish();assert(!l.closeConfirmed); // Late close does not rewrite the captured failure receipt.
 const invalid=await closeNativeClients([{name:'b',lifecycle:{naturalExit:true},close:async()=>{}}]);assert(!invalid.allClosed);assert.equal(invalid.lifecycle[0].cleanupErrorCode,'INVALID_LIFECYCLE');
 const rejected=nativeLifecycleFixture();rejected.app.lifecycle.exit={code:0,signal:null};rejected.finish();rejected.app.close=async()=>{throw null;};const nullError=await closeNativeClients([rejected.app]);assert(nullError.failed);assert.equal(nullError.lifecycle[0].cleanupErrorCode,'CHECK_FAILED');
});
test('command builder accepts only fixed commands/directions and bounded names',()=>{
 assert.deepEqual(command('signIn'),{type:'signIn',surface:'browser'});
 for(const direction of ['push','pull','both'])assert.deepEqual(command('syncDevice',{deviceId:b,direction}),{type:'syncDevice',deviceId:b,direction});
 for(const args of [{deviceId:b,direction:'auto'},{deviceId:b,direction:'push',url:'https://private/'},{deviceId:'not-uuid',direction:'push'}])assert.throws(()=>command('syncDevice',args));
 for(const name of ['',' x','x\n','x'.repeat(97)])assert.throws(()=>command('renameDevice',{name}));
 assert.equal(command('renameDevice',{name:'测试 A'}).name,'测试 A');
 for(const type of ['signOut','refresh','setEndpoint','exportGrant'])expectCode(()=>command(type),'INVALID_COMMAND');
 assert.throws(()=>command('status',{token:'private'}));
});
test('direction expectations retain all existing content and exclude the reverse direction',()=>{
 const initial={a:new Set(['a','shared']),b:new Set(['b','shared'])};
 assert.deepEqual([...expectedAfter(initial,'push').a],['a','shared']);
 assert.deepEqual(new Set(expectedAfter(initial,'push').b),new Set(['a','b','shared']));
 assert.deepEqual([...expectedAfter(initial,'pull').b],['b','shared']);
 assert.deepEqual(new Set(expectedAfter(initial,'pull').a),new Set(['a','b','shared']));
 for(const values of Object.values(expectedAfter(initial,'both')))assert.deepEqual(new Set(values),new Set(['a','b','shared']));
 assert.deepEqual([...initial.a],['a','shared']);
 assert.deepEqual(expectedSummary({notes:[{deletedAt:null,updatedAt:50,locked:true},{deletedAt:null,updatedAt:30},{deletedAt:40,updatedAt:90}]}),{noteCount:2,lastNoteUpdatedAt:50});
 assert.deepEqual(expectedSummary({notes:[]}),{noteCount:0,lastNoteUpdatedAt:null});
});
test('bounded wait and negative observation sample the full finite window; failures stop immediately',async()=>{
 let time=0,reads=0;const clock={now:()=>time,sleep:async ms=>{time+=ms;}};
 const sample=await observeWindow(async()=>++reads,v=>assert(v>0),{...clock,durationMs:1000});
 assert.equal(sample.observedMs,1000);assert(sample.samples>=5);
 time=0;reads=0;await rejection(waitFor(async()=>++reads,()=>false,{...clock,timeoutMs:1000,code:'DEADLINE'}),'DEADLINE');assert.equal(time,1000);
 time=0;reads=0;await rejection(waitFor(async()=>{reads++;return parseStatus(status({error:{code:'account_authentication'}}));},()=>true,{...clock,timeoutMs:1000}),'ACCOUNT_FAILURE');assert.equal(reads,1);assert.equal(time,0);
});
function mockApp({finishAt=61000,reject=false,terminal=status({deviceOperation:op('succeeded')}),statusError=false,terminalOnly=false}={}){
 let time=0,calls=0,resolver;let done=false;const pending=new Promise((ok,no)=>{resolver=()=>{done=true;reject?no(new Error('DO NOT REPORT private token or URL')):ok(terminal);};});
 const window={__TAURI_INTERNALS__:{invoke:(name,{command})=>{
  assert.equal(name,'account_command');
  if(command.type==='status')return Promise.resolve(statusError?status({error:statusError===true?{code:'account_network'}:statusError,deviceOperation:op()}):status({deviceOperation:done&&!terminalOnly?terminal.deviceOperation:op()}));
  calls++;assert.deepEqual(JSON.parse(JSON.stringify(command)),{type:'syncDevice',deviceId:b,direction:'push'});return pending;
 }}};
 const context=vm.createContext({window,Promise});
 return {app:{evaluate:async(expression,arg)=>{context.arg=arg;const result=await vm.runInContext(expression,context);return JSON.parse(JSON.stringify(result));}},
  clock:{now:()=>time,sleep:async ms=>{time+=ms;if(!done&&time>=finishAt)resolver();await Promise.resolve();}},calls:()=>calls,time:()=>time};
}
test('syncDevice is submitted exactly once and outlives the 60s driver request ceiling',async()=>{
 const m=mockApp(),seen=[];const result=await syncOnce(m.app,b,'push',{...m.clock,onStatus:s=>seen.push(s.deviceOperation.phase)});
 assert.equal(m.calls(),1);assert(m.time()>=61000);assert.equal(result.status.deviceOperation.phase,'succeeded');assert(result.runningObserved);assert(seen.includes('running'));
});
test('async command rejection, wrong receipt, status error and timeout all fail without replay',async()=>{
 for(const [options,code] of [[{finishAt:150,reject:true},'ACCOUNT_COMMAND_FAILED'],[{finishAt:150,terminal:status({deviceOperation:op('succeeded',{deviceId:a})})},'ACTION_RECEIPT'],[{statusError:true},'ACCOUNT_FAILURE'],[{finishAt:1e9},'DEVICE_OPERATION_TIMEOUT']]){
  const m=mockApp(options);await rejection(syncOnce(m.app,b,'push',{...m.clock,timeoutMs:1000}),code);assert.equal(m.calls(),1);
 }
});
test('both status polling and command terminal retain finite failure details without replay or acceptance',async()=>{
 const error={code:'account_sync_failed',syncStage:'transfer',syncReason:'protocol',message:'private raw URL'};
 for(const options of [{statusError:error},{finishAt:150,terminalOnly:true,terminal:status({error,deviceOperation:op('failed')})}]){
  const m=mockApp(options);await assert.rejects(syncOnce(m.app,b,'push',{...m.clock}),e=>{
   assert.deepEqual(safeFailureReceipt(e),{code:'ACCOUNT_FAILURE',accountError:{code:'account_sync_failed',syncStage:'transfer',syncReason:'protocol'}});return true;
  });assert.equal(m.calls(),1);
 }
 const directory=mockApp({statusError:{code:'account_directory_unavailable',message:'private'}});
 await rejection(syncOnce(directory.app,b,'push',{...directory.clock}),'ACCOUNT_FAILURE');assert.equal(directory.calls(),1);assert.equal(directory.time(),0); // A running operation never excuses a directory error.
});
test('owned filesystem checks reject traversal and symlinks; prepare creates no clients',async()=>{
 const root=await mkdtemp('/private/tmp/account110-device-actions-fixture-');
 try{
  await mkdir(resolve(root,'attachments'));await writeFile(resolve(root,'attachments','ok.bin'),'synthetic');
  assert.equal(await ownedFile(root,'attachments/ok.bin'),resolve(root,'attachments','ok.bin'));
  assert.equal(await ownedFile(root,'.sync/blobs/missing.blob',{optional:true}),null);
  await symlink(resolve(root,'attachments'),resolve(root,'link'));
  for(const p of ['../outside','/etc/passwd','link/ok.bin'])await rejection(ownedFile(root,p),'OWNERSHIP_FAILED');
  const output=root+'-prepare';let launches=0;
  try{const result=await main(['--output',output],{App:class{constructor(){launches++;throw Error('APP MUST NOT LAUNCH');}},print:()=>{}});assert.equal(result.status,'prepared-not-run');assert.equal(launches,0);assert.equal(JSON.parse(await readFile(resolve(output,'result.json'))).mode,'prepare');}
  finally{await rm(output,{recursive:true,force:true});}
 }finally{await rm(root,{recursive:true,force:true});}
});
test('exact package identity, clean source and executable bytes are required before any launch',async()=>{
 const root=await mkdtemp('/private/tmp/account110-device-actions-package-fixture-');
 try{
  const appPath=resolve(root,'candidate.app'),binary=resolve(appPath,'Contents/MacOS/notes-clone');await mkdir(resolve(appPath,'Contents/MacOS'),{recursive:true});await writeFile(binary,'synthetic fixture executable');
  const sum=sha(await readFile(binary)),receipt=resolve(root,'package.json');
  const packageValue=()=>({schema:1,status:'packaged-adhoc-signed-static-verified-not-launched',sourceRevision:source,appPath,executable:binary,binarySha256:sum,embeddedIdentity:{info:{sourceRevision:source,sourceDirty:false,sourceFingerprint:'b'.repeat(64)},nativeBinarySha256:sum,currentSourceRevalidated:true}});
  await writeFile(receipt,JSON.stringify(packageValue()));assert.equal((await validatePackage(receipt,source)).binarySha256,sum);
  for(const mutate of [p=>p.sourceRevision='c'.repeat(40),p=>p.embeddedIdentity.info.sourceDirty=true,p=>p.embeddedIdentity.currentSourceRevalidated=false,p=>p.embeddedIdentity.nativeBinarySha256='c'.repeat(64),p=>p.status='building']){const p=packageValue();mutate(p);await writeFile(receipt,JSON.stringify(p));await rejection(validatePackage(receipt,source),'INVALID_PACKAGE');}
  await writeFile(receipt,JSON.stringify(packageValue()));await writeFile(binary,'changed bytes');await rejection(validatePackage(receipt,source),'BINARY_CHANGED');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('run verifies deployment evidence before any client and always passes an owned fresh data-dir',async()=>{
 const root=await mkdtemp('/private/tmp/account110-device-actions-gate-fixture-'),output=root+'-run',crashOutput=root+'-crash',accountOutput=root+'-account';
 try{
  const appPath=resolve(root,'candidate.app'),binary=resolve(appPath,'Contents/MacOS/notes-clone'),receipt=resolve(root,'package.json'),deployment=resolve(root,'deployment.json');
  await mkdir(resolve(appPath,'Contents/MacOS'),{recursive:true});await writeFile(binary,'synthetic executable, never started');const sum=sha(await readFile(binary));
  await writeFile(receipt,JSON.stringify({schema:1,status:'packaged-adhoc-signed-static-verified-not-launched',sourceRevision:source,appPath,executable:binary,binarySha256:sum,embeddedIdentity:{info:{sourceRevision:source,sourceDirty:false,sourceFingerprint:'b'.repeat(64)},nativeBinarySha256:sum,currentSourceRevalidated:true}}));
  const deploymentBytes=Buffer.from(JSON.stringify(deploymentReceipt()));await writeFile(deployment,deploymentBytes);
  const args=['--run','--output',output,'--package-receipt',receipt,'--source',source,'--deployment-receipt',deployment,'--deployment-source',source,'--deployment-id',deploymentId,'--deployment-sha256','c'.repeat(64)];let calls=0;
  const App=class{
   constructor(executable,directory,options){calls++;assert.equal(executable,binary);assert.equal(directory,resolve(output,'desktop-a'));assert.equal(options.name,'a');this.name=options.name;this.directory=directory;this.lifecycle={exit:{code:0,signal:null},forcedSignals:[]};this.closed=Promise.resolve();}
   async ready(timeout){assert.equal(timeout,60000);throw new Error('synthetic startup stop; no app launched');}
   async close(){this.lifecycle.naturalExit=true;this.lifecycle.close={code:0,signal:null};}
  };
  await rejection(main(args,{App,print:()=>{}}),'DEPLOYMENT_EVIDENCE_INVALID');assert.equal(calls,0);
  for(const value of ['ordinary text',JSON.stringify({...deploymentReceipt(),readyState:'ERROR'}),JSON.stringify({...deploymentReceipt(),sourceRevision:'b'.repeat(40)}),JSON.stringify({...deploymentReceipt(),productionDeploymentId:'dpl_WrongDeployment'})]){await writeFile(deployment,value);args[args.length-1]=sha(value);await rejection(main(args,{App,print:()=>{}}),'DEPLOYMENT_EVIDENCE_INVALID');assert.equal(calls,0);}
  await writeFile(deployment,deploymentBytes);args[args.length-1]=sha(deploymentBytes);const report=await main(args,{App,print:()=>{}});assert.equal(calls,1);assert.equal(report.status,'fail');assert.equal(report.failure.phase,'startup');assert.equal(report.failure.code,'CHECK_FAILED');assert(report.lifecycle.every(v=>v.naturalExit));
  assert(!JSON.stringify(report).includes('synthetic startup stop'));
  const CrashedApp=class{
   constructor(executable,directory,options){assert.equal(executable,binary);assert.equal(directory,resolve(crashOutput,'desktop-a'));this.name=options.name;this.lifecycle={exit:{code:null,signal:'SIGABRT'},failureCode:'EXIT_BEFORE_RESPONSE',forcedSignals:[]};this.closed=Promise.resolve();}
   async ready(){throw Object.assign(new Error('private raw callback URL'),{code:'EXIT_BEFORE_RESPONSE'});}
   async close(){this.lifecycle.close={code:null,signal:'SIGABRT'};this.lifecycle.naturalExit=false;throw Object.assign(new Error('private cleanup error'),{code:'NON_NATURAL_EXIT'});}
  };
  const crashArgs=[...args];crashArgs[2]=crashOutput;const crashed=await main(crashArgs,{App:CrashedApp,print:()=>{}});
  assert.equal(crashed.failure.code,'EXIT_BEFORE_RESPONSE');assert.equal(crashed.cleanupFailure.code,'CLEANUP_FAILED');assert(crashed.nativeCleanup.allClosed);assert.equal(crashed.lifecycle[0].exitSignal,'SIGABRT');assert.equal(crashed.lifecycle[0].driverFailureCode,'EXIT_BEFORE_RESPONSE');assert.equal(crashed.lifecycle[0].cleanupErrorCode,'NON_NATURAL_EXIT');
  const persisted=JSON.parse(await readFile(resolve(crashOutput,'result.json')));assert.deepEqual(persisted.failure,crashed.failure);assert(!JSON.stringify(persisted).includes('private raw'));assert(!JSON.stringify(persisted).includes('private cleanup'));
  const AccountFailedApp=class extends App{
   constructor(executable,directory,options){super(executable,resolve(output,'desktop-a'),options);this.directory=directory;}
   async ready(){parseStatus(status({error:{code:'account_sync_failed',syncStage:'pair',syncReason:'timeout',message:'private raw callback URL'},deviceOperation:op('failed')}));}
  };
  const accountArgs=[...args];accountArgs[2]=accountOutput;const failed=await main(accountArgs,{App:AccountFailedApp,print:()=>{}});
  assert.equal(failed.status,'fail');assert.deepEqual(failed.failure,{phase:'startup',code:'ACCOUNT_FAILURE',accountError:{code:'account_sync_failed',syncStage:'pair',syncReason:'timeout'}});assert(failed.nativeCleanup.allClosed);
  const saved=JSON.parse(await readFile(resolve(accountOutput,'result.json')));assert.deepEqual(saved.failure,failed.failure);assert(!JSON.stringify(saved).includes('private'));assert(!JSON.stringify(saved).includes('raw callback'));
 }finally{await rm(root,{recursive:true,force:true});await rm(output,{recursive:true,force:true});await rm(crashOutput,{recursive:true,force:true});await rm(accountOutput,{recursive:true,force:true});}
});
test('deployment receipt validates successful state and exact source/deployment/hash, not arbitrary hashed text',()=>{
 const validate=value=>{const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));return validateDeployment(bytes,{source,id:deploymentId,sha256:sha(bytes)});};
 assert.equal(validate(deploymentReceipt()).deploymentId,deploymentId);
 for(const value of ['ordinary text','{}', {...deploymentReceipt(),schemaVersion:2},{...deploymentReceipt(),status:'FAILED'},{...deploymentReceipt(),readyState:'BUILDING'},{...deploymentReceipt(),productionDeploymentId:'dpl_Other'},{...deploymentReceipt(),sourceRevision:'c'.repeat(40)},{...deploymentReceipt(),finalProductionAssignmentConfirmed:false},{...deploymentReceipt(),publicSmokePassed:false},{...deploymentReceipt(),serverSourceDiffEmpty:false},{...deploymentReceipt(),allUploadedSourceBytesFromPinnedCommit:false},{...deploymentReceipt(),unknown:'private'}])expectCode(()=>validate(value),'DEPLOYMENT_EVIDENCE_INVALID');
 const bytes=Buffer.from(JSON.stringify(deploymentReceipt()));expectCode(()=>validateDeployment(bytes,{source,id:deploymentId,sha256:'d'.repeat(64)}),'DEPLOYMENT_EVIDENCE_INVALID');
});
test('observation continues after a slow first or later sample until both conditions are satisfied',async()=>{
 for(const costs of [[6000,0],[0,6000],[3000,3000]]){
  let time=0,reads=0;const pauses=[];
  const result=await observeWindow(async()=>{time+=costs[Math.min(reads,costs.length-1)];return ++reads;},()=>{}, {durationMs:5000,totalBudgetMs:15000,now:()=>time,sleep:async ms=>{assert(ms>=0);pauses.push(ms);time+=ms;}});
  assert.equal(reads,2);assert(result.observedMs>=5000&&result.observedMs<=15000);assert.equal(result.samples,2);
  if(costs[0]===6000)assert.deepEqual(pauses,[]);
 }
});
test('observation fails within the total budget, preserves check errors, and bounds a stuck read',async()=>{
 let time=0,reads=0;
 await rejection(observeWindow(async()=>{reads++;time+=6000;},()=>{}, {durationMs:5000,totalBudgetMs:10000,now:()=>time,sleep:async ms=>{time+=ms;}}),'OBSERVATION_TIMEOUT');assert.equal(reads,2);
 reads=0;const error=Object.assign(new Error('finite check failure'),{code:'REVERSE_CONTENT'});
 await assert.rejects(observeWindow(async()=>{reads++;return 1;},()=>{throw error;}),e=>e===error);assert.equal(reads,1);
 let signal;
 await rejection(observeWindow(async s=>{signal=s;return new Promise(()=>{});},()=>{}, {durationMs:1,totalBudgetMs:10}),'OBSERVATION_TIMEOUT');assert(signal.aborted);
});
class FakeTimers {
 now=0;next=0;tasks=new Map();
 set=(fn,ms)=>{const id=++this.next;this.tasks.set(id,{at:this.now+ms,fn});return id;};
 clear=id=>{this.tasks.delete(id);};
 advance(ms){const end=this.now+ms;for(let steps=0;;steps++){assert(steps<1000);const next=[...this.tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.tasks.delete(next[0]);this.now=next[1].at;next[1].fn();}this.now=end;}
}
function probeFixture(){
 const timers=new FakeTimers(),child=new EventEmitter(),signals=[];
 child.stdout=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=input=>{assert.deepEqual(JSON.parse(input),{notes:['synthetic'],requireSync:true});};
 child.kill=signal=>{signals.push(signal);return true;};
 const probes=new ProtocolProbes({spawnProcess:(exe,args,opts)=>{assert.equal(exe,'/usr/bin/python3');assert.deepEqual(args.slice(0,2),['-I','-c']);assert.equal(args[3],'/private/tmp/synthetic-only/notes.sqlite3');assert.deepEqual(opts.stdio,['pipe','pipe','ignore']);return child;},setTimer:timers.set,clearTimer:timers.clear,runMs:10,termMs:3,killMs:3});
 const run=options=>probes.run('/private/tmp/synthetic-only/notes.sqlite3',{notes:['synthetic'],requireSync:true},options);
 return {timers,child,signals,probes,run};
}
test('probe success waits for close, not merely stdout or exit',async()=>{
 const f=probeFixture();let settled=false;const result=f.run().then(v=>{settled=true;return v;});
 f.child.stdout.emit('data',Buffer.from('{"heads":0}'));f.child.emit('exit',0,null);await Promise.resolve();assert(!settled);assert.equal(f.probes.active.size,1);
 f.child.emit('close',0,null);assert.deepEqual(await result,{heads:0});const receipt=await f.probes.closeAll();assert(receipt.allClosed);assert(!receipt.hadFailures);assert.deepEqual(f.signals,[]);
});
test('probe timeout, output limit and stdin error retain ownership until close and escalate ignored SIGTERM',async()=>{
 for(const [trigger,code] of [[f=>f.timers.advance(10),'PROBE_TIMEOUT'],[f=>f.child.stdout.emit('data',Buffer.alloc(2049)),'PROBE_OUTPUT_LIMIT'],[f=>f.child.stdin.emit('error',new Error('raw private error')),'PROBE_STDIN_ERROR']]){
  const f=probeFixture();let settled=false;const result=f.run().catch(e=>{settled=true;return e;});trigger(f);await Promise.resolve();assert(!settled);assert.deepEqual(f.signals,['SIGTERM']);assert.equal(f.probes.active.size,1);
  f.timers.advance(3);assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);assert.equal(f.probes.active.size,1);await Promise.resolve();assert(!settled);
  f.child.emit('close',null,'SIGKILL');const error=await result;assert.equal(error.code,code);assert.equal(error.cleanupFailure,undefined);
  const receipt=await f.probes.closeAll();assert(receipt.allClosed);assert.equal(receipt.receipts[0].failureCode,code);assert.equal(receipt.receipts[0].cleanupFailure,undefined);assert(!JSON.stringify(receipt).includes('raw private error'));
 }
});
test('probe final cleanup failure preserves original error and registry ownership for later confirmation',async()=>{
 const f=probeFixture(),result=f.run().catch(e=>e);f.timers.advance(16);const error=await result;
 assert.equal(error.code,'PROBE_TIMEOUT');assert.equal(error.cleanupFailure.code,'PROBE_CLEANUP_FAILED');assert.equal(f.probes.active.size,1);
 const cleanup=f.probes.closeAll();await Promise.resolve();f.timers.advance(3);const receipt=await cleanup;
 assert(!receipt.allClosed);assert.equal(receipt.receipts[0].failureCode,'PROBE_TIMEOUT');assert.equal(receipt.receipts[0].cleanupFailure.code,'PROBE_CLEANUP_FAILED');assert.equal(f.probes.active.size,1);
 f.child.emit('close',null,'SIGKILL');assert.equal(f.probes.active.size,0);assert((await f.probes.closeAll()).allClosed);
});
test('aborted observation cancels only its owned probe and final cleanup waits for close',async()=>{
 const f=probeFixture(),controller=new AbortController(),result=f.run({signal:controller.signal}).catch(e=>e);controller.abort();assert.deepEqual(f.signals,['SIGTERM']);
 const cleanup=f.probes.closeAll();f.child.emit('close',null,'SIGTERM');assert.equal((await result).code,'PROBE_CANCELLED');assert((await cleanup).allClosed);
});
