// Device-free fixtures only; importing the collector starts no App or network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeSdkDiagnostic,SdkTrace,SDK_VARIANTS,SDK_TIMEOUTS,SDK_PHASES,parseDiagnosticArgs,mapEvidence,observeOperation} from './account110-sdk-diagnostic.mjs';
import {encodeRequest} from './sync108-native-driver.mjs';

const map=(overrides={})=>({sequence:1,elapsedMs:10,sdkGeneration:2,kind:'map',phase:null,transport:null,operation:1,mapStage:'enroll',mapOutcome:'started',sdkVariant:null,timeout:null,apiStatus:null,selectedTransportMatchesExpected:null,...overrides});
const event=(overrides={})=>map({kind:'event',phase:'connecting',transport:null,operation:null,mapStage:null,mapOutcome:null,...overrides});
const ring=(records=[],overrides={})=>({schemaVersion:1,ownerGeneration:1,sdkGeneration:2,dropped:0,records,...overrides});
const rejected=value=>assert.throws(()=>safeSdkDiagnostic(value),{code:'INVALID_SDK_DIAGNOSTIC'});

test('diagnostic action is parameterless and rejects expressions, extra fields and endpoint inputs',()=>{
 assert.deepEqual(JSON.parse(encodeRequest(1,{op:'accountSdkDiagnostic'})).action,{op:'accountSdkDiagnostic'});
 for(const extra of [{args:{}},{expression:'private-sentinel'},{endpoint:'https://invalid.test'},{transportDeviceId:'private-sentinel'}]){
  assert.throws(()=>encodeRequest(1,{op:'accountSdkDiagnostic',...extra}),{code:'INVALID_REQUEST'});
 }
});
test('all sixteen typed SDK errors survive only as finite variants',()=>{
 assert.equal(SDK_VARIANTS.length,16);
 for(const sdkVariant of SDK_VARIANTS){
  const r=map({mapOutcome:'error',sdkVariant,timeout:sdkVariant==='Timeout'?'unknown':null,apiStatus:['Api','OAuth'].includes(sdkVariant)?503:null});
  assert.equal(safeSdkDiagnostic(ring([r])).records[0].sdkVariant,sdkVariant);
 }
});
test('static timeout labels are exhaustive and unknown is explicit, never raw text',()=>{
 assert.equal(SDK_TIMEOUTS.length,12);
 for(const timeout of SDK_TIMEOUTS)assert.equal(safeSdkDiagnostic(ring([map({mapOutcome:'error',sdkVariant:'Timeout',timeout})])).records[0].timeout,timeout);
 rejected(ring([map({mapOutcome:'error',sdkVariant:'Timeout',timeout:'private-sentinel https://invalid.test'})]));
});
test('only audited event phases and transport labels are admitted',()=>{
 for(const phase of SDK_PHASES)for(const transport of [null,'webrtc-direct','iroh-direct','cloudflare-tunnel','unknown']){
  assert.equal(safeSdkDiagnostic(ring([event({phase,transport})])).records[0].phase,phase);
 }
 rejected(ring([event({phase:'new-upstream-phase'})]));rejected(ring([event({transport:'https://invalid.test'})]));
});
test('raw messages, IDs, epoch, credentials and unknown fields are never copied',()=>{
 for(const key of ['message','url','peerId','peer_id','epoch','deviceId','transportDeviceId','code','credentials','sha256']){
  rejected(ring([map({[key]:'private-sentinel'})]));rejected(ring([],{[key]:'private-sentinel'}));
 }
});
test('inapplicable fields must be null and paired error fields must agree',()=>{
 for(const r of [map({sdkVariant:'Io'}),map({timeout:'unknown'}),map({apiStatus:503}),map({phase:'connecting'}),
  map({transport:'cloudflare-tunnel'}),map({mapOutcome:'error'}),map({mapOutcome:'error',sdkVariant:'Io',timeout:'unknown'}),
  map({mapOutcome:'error',sdkVariant:'Timeout'}),
  map({mapOutcome:'error',sdkVariant:'Io',apiStatus:503}),event({operation:1}),event({mapStage:'enroll'}),event({phase:null}),
  event({selectedTransportMatchesExpected:true})])rejected(ring([r]));
});
test('API and OAuth numeric statuses are bounded, no upstream code/string escapes',()=>{
 assert.equal(safeSdkDiagnostic(ring([map({mapOutcome:'error',sdkVariant:'Api',apiStatus:null})])).records[0].apiStatus,null);
 for(const apiStatus of [100,200,401,403,599])assert.equal(safeSdkDiagnostic(ring([map({mapOutcome:'error',sdkVariant:'Api',apiStatus})])).records[0].apiStatus,apiStatus);
 for(const apiStatus of [99,600,999,'503',503.5])rejected(ring([map({mapOutcome:'error',sdkVariant:'OAuth',apiStatus})]));
});
test('exact schema and safe numeric bounds reject partial or unbounded snapshots',()=>{
 for(const key of Object.keys(ring())){const r=ring();delete r[key];rejected(r);}
 for(const key of Object.keys(map())){const r=map();delete r[key];rejected(ring([r]));}
 for(const key of ['ownerGeneration','sdkGeneration','dropped'])for(const bad of [-1,1.5,Number.MAX_SAFE_INTEGER+1,'1'])rejected(ring([],{[key]:bad}));
 for(const key of ['sequence','elapsedMs','sdkGeneration','operation'])rejected(ring([map({[key]:-1})]));
 rejected(ring([map({operation:0})]));rejected(ring([map({sequence:0})]));rejected(ring([],{schemaVersion:2}));
 rejected(ring(Array.from({length:257},(_,i)=>map({sequence:i+1}))));
});
test('map stage/outcome and boolean route evidence are finite without inventing a match',()=>{
 for(const mapStage of ['enroll','sync'])for(const mapOutcome of ['started','ok'])for(const selectedTransportMatchesExpected of [true,false,null]){
  assert.equal(safeSdkDiagnostic(ring([map({mapStage,mapOutcome,selectedTransportMatchesExpected})])).records[0].selectedTransportMatchesExpected,selectedTransportMatchesExpected);
 }
 for(const bad of [map({mapStage:'bootstrap'}),map({mapOutcome:'failed'}),map({selectedTransportMatchesExpected:'true'})])rejected(ring([bad]));
});
test('collector deduplicates overlapping samples and retains finite earlier failure',()=>{
 const t=new SdkTrace(),r1=map(),r2=map({sequence:2,mapOutcome:'error',sdkVariant:'Http'});
 assert.equal(t.accept(ring([r1])).length,1);assert.equal(t.accept(ring([r1,r2])).length,1);
 assert.equal(t.accept(ring([r1,r2])).length,0);assert.equal(t.safe().records.length,2);
 assert.throws(()=>t.accept(ring([map({sequence:3,message:'private-sentinel'})])),{code:'INVALID_SDK_DIAGNOSTIC'});
 assert.equal(t.safe().records.at(-1).sdkVariant,'Http');assert(!JSON.stringify(t.safe()).includes('private-sentinel'));
});
test('retired owner cannot contribute records to a new owned client',()=>{
 const t=new SdkTrace();t.accept(ring([map()]));
 assert.throws(()=>t.accept(ring([map({sequence:2})],{ownerGeneration:2})),{code:'SDK_OWNER_CHANGED'});
 assert.equal(t.safe().ownerGeneration,1);assert.equal(t.safe().records.length,1);
});
test('ring drop and finite collection overflow remain visible instead of claiming complete evidence',()=>{
 const t=new SdkTrace();t.accept(ring([map({sequence:10})],{dropped:9}));
 assert.equal(t.safe().dropped,9);assert.equal(t.safe().overflow,true);
 const full=new SdkTrace();for(let k=0;k<3;k++)full.accept(ring(Array.from({length:256},(_,i)=>map({sequence:k*256+i+1}))));
 assert.equal(full.safe().records.length,512);assert.equal(full.safe().overflow,true);
});
test('out of order or duplicate sequences are rejected inside one native snapshot',()=>{
 rejected(ring([map({sequence:2}),map({sequence:1})]));rejected(ring([map(),map()]));
});
test('absent/retired SDK generation may be null only at snapshot root',()=>{
 assert.equal(safeSdkDiagnostic(ring([],{ownerGeneration:0,sdkGeneration:null})).sdkGeneration,null);
 rejected(ring([map({sdkGeneration:null})]));
});
test('a repeated sequence cannot change meaning or rewind the owned ring',()=>{
 const t=new SdkTrace();t.accept(ring([map(),map({sequence:2})]));
 assert.throws(()=>t.accept(ring([map(),map({sequence:2,mapOutcome:'ok'})])),{code:'INVALID_SDK_DIAGNOSTIC'});
 assert.throws(()=>t.accept(ring([map()])),{code:'INVALID_SDK_DIAGNOSTIC'});
});
test('a dropped map future is not invented as an SDK Cancelled result',()=>{
 const evidence=mapEvidence([map()]);
 assert.equal(evidence.hasStartedWithoutReturn,true);assert.equal(evidence.bothMapsReturnedOk,false);
 const complete=mapEvidence([map(),map({sequence:2,mapOutcome:'ok'}),map({sequence:3,mapStage:'sync'}),map({sequence:4,mapStage:'sync',mapOutcome:'ok'})]);
 assert.deepEqual(complete,{oneOperation:true,bothMapsReturnedOk:true,hasStartedWithoutReturn:false});
 assert.equal(mapEvidence([map({operation:1}),map({sequence:2,operation:2})]).oneOperation,false);
});
test('intermediate account/diagnostic errors do not discard eventual operation terminal',async()=>{
 let clock=0,polls=0;const statuses=[],diagnostics=[];
 const result=await observeOperation({sample:async device=>{statuses.push({device,error:polls===0?'account_network':null});},diagnostic:async device=>{diagnostics.push({device,failed:polls===0});},poll:async()=>({done:++polls===3,failed:false,status:polls===3?{deviceOperation:{phase:'failed'}}:undefined}),now:()=>clock,sleep:async ms=>{clock+=ms;}});
 assert.equal(polls,3);assert.equal(statuses.length,6);assert.equal(diagnostics.length,6);
 assert.equal(result.marker.status.deviceOperation.phase,'failed');assert.equal(result.elapsedMs,800);
});
test('finite operation observation timeout neither fabricates terminal nor extends on sampling',async()=>{
 let clock=0,polls=0;
 await assert.rejects(observeOperation({sample:async()=>{clock+=10;},diagnostic:async()=>{},poll:async()=>{polls++;return {done:false,failed:false};},now:()=>clock,sleep:async ms=>{clock+=ms;},timeoutMs:500}),{code:'DEVICE_OPERATION_TIMEOUT'});
 assert.equal(polls,3);assert.equal(clock,860);
});
test('actual command rejection is returned separately from collected diagnostic failures',async()=>{
 const result=await observeOperation({sample:async()=>{},diagnostic:async()=>{},poll:async()=>({done:true,failed:true}),now:()=>0});
 assert.equal(result.marker.failed,true);assert.equal(result.marker.status,undefined);
});
test('run requires exact source/package and a new finite private output name; no endpoint/data-dir override',()=>{
 const good=['--source','a'.repeat(40),'--package-receipt','/unit/package.json','--output','/private/tmp/account110-device-actions-unit-sdk'];
 assert.equal(parseDiagnosticArgs(good).run,false);assert.equal(parseDiagnosticArgs(['--run',...good]).run,true);
 for(const args of [[],[...good,'--data-dir','/private'],[...good,'--endpoint','https://invalid.test'],[...good,'--run','--run'],good.map(x=>x==='a'.repeat(40)?'latest':x),good.map(x=>x==='/private/tmp/account110-device-actions-unit-sdk'?'/tmp/reuse':x)])assert.throws(()=>parseDiagnosticArgs(args),{code:'INVALID_ARGUMENTS'});
});
