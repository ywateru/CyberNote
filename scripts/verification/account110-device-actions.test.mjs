import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {parseArgs,parseStatus,command,safeStatus,safeFailure,waitFor,observeWindow,syncOnce,validatePackage,ownedFile,expectedSummary,expectedAfter,main} from './account110-device-actions.mjs';

const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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
 const run=parseArgs([...base,'--run','--source',source,'--package-receipt','/private/tmp/package.json','--deployment-source',source,'--deployment-receipt','/private/tmp/deploy.json','--deployment-sha256','b'.repeat(64)]);
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
function mockApp({finishAt=61000,reject=false,terminal=status({deviceOperation:op('succeeded')}),statusError=false}={}){
 let time=0,calls=0,resolver;let done=false;const pending=new Promise((ok,no)=>{resolver=()=>{done=true;reject?no(new Error('DO NOT REPORT private token or URL')):ok(terminal);};});
 const window={__TAURI_INTERNALS__:{invoke:(name,{command})=>{
  assert.equal(name,'account_command');
  if(command.type==='status')return Promise.resolve(statusError?status({error:{code:'account_network'}}):status({deviceOperation:done?terminal.deviceOperation:op()}));
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
 const root=await mkdtemp('/private/tmp/account110-device-actions-gate-fixture-'),output=root+'-run';
 try{
  const appPath=resolve(root,'candidate.app'),binary=resolve(appPath,'Contents/MacOS/notes-clone'),receipt=resolve(root,'package.json'),deployment=resolve(root,'deployment.json');
  await mkdir(resolve(appPath,'Contents/MacOS'),{recursive:true});await writeFile(binary,'synthetic executable, never started');const sum=sha(await readFile(binary));
  await writeFile(receipt,JSON.stringify({schema:1,status:'packaged-adhoc-signed-static-verified-not-launched',sourceRevision:source,appPath,executable:binary,binarySha256:sum,embeddedIdentity:{info:{sourceRevision:source,sourceDirty:false,sourceFingerprint:'b'.repeat(64)},nativeBinarySha256:sum,currentSourceRevalidated:true}}));
  const deploymentBytes=Buffer.from('synthetic independently supplied deployment receipt');await writeFile(deployment,deploymentBytes);
  const args=['--run','--output',output,'--package-receipt',receipt,'--source',source,'--deployment-receipt',deployment,'--deployment-source',source,'--deployment-sha256','c'.repeat(64)];let calls=0;
  const App=class{
   constructor(executable,directory,options){calls++;assert.equal(executable,binary);assert.equal(directory,resolve(output,'desktop-a'));assert.equal(options.name,'a');this.name=options.name;this.directory=directory;this.lifecycle={exit:{code:0},forcedSignals:[]};}
   async ready(timeout){assert.equal(timeout,60000);throw new Error('synthetic startup stop; no app launched');}
   async close(){this.lifecycle.naturalExit=true;}
  };
  await rejection(main(args,{App,print:()=>{}}),'DEPLOYMENT_EVIDENCE_INVALID');assert.equal(calls,0);
  args[args.length-1]=sha(deploymentBytes);const report=await main(args,{App,print:()=>{}});assert.equal(calls,1);assert.equal(report.status,'fail');assert.equal(report.failure.phase,'startup');assert.equal(report.failure.code,'CHECK_FAILED');assert(report.lifecycle.every(v=>v.naturalExit));
  assert(!JSON.stringify(report).includes('synthetic startup stop'));
 }finally{await rm(root,{recursive:true,force:true});await rm(output,{recursive:true,force:true});}
});
