#!/usr/bin/env node
// Fixed real-App diagnostic collector. Import/prepare does not launch anything.
// Session/target identifiers, arbitrary messages and raw stderr are never saved.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, lstat, realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeApp, delay} from './sync108-native-driver.mjs';
import {validatePackage, safeStatus, safeAccountError, safeFailure, closeNativeClients} from './account110-device-actions.mjs';

const fail=code=>Object.assign(new Error(code),{code});
const need=(condition,code='INVALID_SDK_DIAGNOSTIC')=>{if(!condition)throw fail(code);};
const exact=(v,keys)=>{need(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k)));return v;};
const count=v=>{need(Number.isSafeInteger(v)&&v>=0);return v;};
const choice=(v,values)=>{need(values.includes(v));return v;};
const nullable=(v,validate)=>v===null?null:validate(v);
export const SDK_VARIANTS=['Config','Api','OAuth','Protocol','Credentials','Cancelled','Timeout','NotLoggedIn','ExchangeOutcomeUnknown','RevocationPending','IdentityChanged','AuthorizationUnavailable','AuthorizationProvider','Transport','Io','Http'];
export const SDK_TIMEOUTS=['peer connection budget','remote tunnel readiness or authentication','remote port open','port selection','WebRTC direct','direct iroh handshake','device authorization','credential lock','peer TLS handshake','WebSocket connect','Quick Tunnel registration (30 seconds)','unknown'];
export const SDK_PHASES=['coordination-ready','requires-login','recovering','connecting','direct-attempt','iroh-attempt','iroh-skipped','fallback-attempt','websocket-dial','websocket-upgraded','mutual-tls-ready','multiplexer-ready','mapping-ready','mapping-disconnected','port-open','tunnel-ready','provider-failed','provider-restarting','error','closed','unknown'];
const transports=['webrtc-direct','iroh-direct','cloudflare-tunnel','unknown'];
const recordKeys=['sequence','elapsedMs','sdkGeneration','kind','phase','transport','operation','mapStage','mapOutcome','sdkVariant','timeout','apiStatus','selectedTransportMatchesExpected'];
// Reject, rather than copy or normalize, every unknown field/value. No raw dump
// is used as a fallback when a future candidate changes this private schema.
export function safeSdkDiagnostic(value){
 const s=exact(value,['schemaVersion','ownerGeneration','sdkGeneration','dropped','records']);
 need(s.schemaVersion===1&&Array.isArray(s.records)&&s.records.length<=256);
 count(s.ownerGeneration);nullable(s.sdkGeneration,count);count(s.dropped);
 let previous=0;
 const records=s.records.map(value=>{
  const r=exact(value,recordKeys);count(r.sequence);need(r.sequence>previous);previous=r.sequence;
  count(r.elapsedMs);count(r.sdkGeneration);choice(r.kind,['event','map']);
  nullable(r.phase,v=>choice(v,SDK_PHASES));nullable(r.transport,v=>choice(v,transports));
  nullable(r.operation,count);nullable(r.mapStage,v=>choice(v,['enroll','sync']));
  nullable(r.mapOutcome,v=>choice(v,['started','ok','error']));nullable(r.sdkVariant,v=>choice(v,SDK_VARIANTS));
  nullable(r.timeout,v=>choice(v,SDK_TIMEOUTS));nullable(r.apiStatus,v=>{need(Number.isInteger(v)&&v>=100&&v<=599);return v;});
  nullable(r.selectedTransportMatchesExpected,v=>{need(typeof v==='boolean');return v;});
  if(r.kind==='event'){
   need(r.phase!==null&&['operation','mapStage','mapOutcome','sdkVariant','timeout','apiStatus','selectedTransportMatchesExpected'].every(k=>r[k]===null));
  }else{
   need(r.phase===null&&r.transport===null&&r.operation!==null&&r.operation>0&&r.mapStage!==null&&r.mapOutcome!==null);
   if(r.mapOutcome==='error'){
    need(r.sdkVariant!==null);
    need((r.sdkVariant==='Timeout')===(r.timeout!==null));
    need(r.apiStatus===null||['Api','OAuth'].includes(r.sdkVariant));
   }else need(['sdkVariant','timeout','apiStatus'].every(k=>r[k]===null));
  }
  return Object.fromEntries(recordKeys.map(k=>[k,r[k]]));
 });
 return {schemaVersion:1,ownerGeneration:s.ownerGeneration,sdkGeneration:s.sdkGeneration,dropped:s.dropped,records};
}

// Tracks one owned client's bounded ring across samples, detects retirement or
// truncation, and preserves earlier safe records if a later read is malformed.
export class SdkTrace {
 constructor(){this.owner=null;this.last=0;this.records=[];this.dropped=0;this.overflow=false;}
 accept(value){
  const s=safeSdkDiagnostic(value);
  need(this.owner===null||this.owner===s.ownerGeneration,'SDK_OWNER_CHANGED');
  need(!s.records.length||s.records.at(-1).sequence>=this.last);
  for(const r of s.records){
   const prior=this.records.find(p=>p.sequence===r.sequence);
   need(!prior||JSON.stringify(prior)===JSON.stringify(r));
  }
  this.owner=s.ownerGeneration;this.dropped=Math.max(this.dropped,s.dropped);
  const fresh=s.records.filter(r=>r.sequence>this.last);
  if(fresh.length&&fresh[0].sequence!==this.last+1)this.overflow=true;
  for(const r of fresh){if(this.records.length<512)this.records.push(r);else this.overflow=true;this.last=r.sequence;}
  return fresh;
 }
 safe(){return {ownerGeneration:this.owner,dropped:this.dropped,overflow:this.overflow,records:this.records};}
}

export function mapEvidence(records,baseline=0){
 const maps=records.filter(r=>r.kind==='map'&&r.sequence>baseline);
 const operations=new Set(maps.map(r=>r.operation));
 return {oneOperation:maps.length>0&&operations.size===1,
  bothMapsReturnedOk:['enroll','sync'].every(stage=>maps.some(r=>r.mapStage===stage&&r.mapOutcome==='ok')),
  hasStartedWithoutReturn:maps.some(r=>r.mapOutcome==='started'&&!maps.some(other=>other.operation===r.operation&&other.mapStage===r.mapStage&&other.mapOutcome!=='started'))};
}

// Status/diagnostic callbacks latch safe errors themselves. An intermediate
// account error must never short-circuit the actual native command's terminal.
export async function observeOperation({sample,diagnostic,poll,save=async()=>{},now=Date.now,sleep=delay,timeoutMs=210000}){
 const began=now();
 for(;;){
  await sample('a','push');await sample('b','push');
  await diagnostic('a');await diagnostic('b');
  const marker=await poll();
  need(marker&&typeof marker.done==='boolean'&&typeof marker.failed==='boolean','INVALID_DTO');
  if(marker.done)return {marker,elapsedMs:now()-began};
  await save();need(now()-began<timeoutMs,'DEVICE_OPERATION_TIMEOUT');await sleep(400);
 }
}

const OWNED='/private/tmp/account110-device-actions-0a4a4cda-live02';
const ORIGINAL_HASH='af7cc9c56d3b46ddfbc2f86983df6cd9764c1bf9ed1ceb7206a4c51889649571';
const hash=b=>createHash('sha256').update(b).digest('hex');
const account="window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})";
const begin="(()=>{const s={done:false,failed:false};window.__ACCOUNT110_MAP_DIAGNOSTIC__=s;Promise.resolve().then(()=>window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})).then(v=>{s.status=v;s.done=true},()=>{s.failed=true;s.done=true});return true})()";
const poll="(()=>{const s=window.__ACCOUNT110_MAP_DIAGNOSTIC__;return {done:s.done,failed:s.failed,...(s.done&&!s.failed?{status:s.status}:{})}})()";
export function parseDiagnosticArgs(args){
 const o={run:false};const seen=new Set();
 for(let i=0;i<args.length;i++){
  const k=args[i];need(['--run','--source','--package-receipt','--output'].includes(k)&&!seen.has(k),'INVALID_ARGUMENTS');seen.add(k);
  if(k==='--run'){o.run=true;continue;}
  const v=args[++i];need(typeof v==='string'&&!v.startsWith('--'),'INVALID_ARGUMENTS');o[k.slice(2)]=v;
 }
 need(/^\/private\/tmp\/account110-device-actions-[A-Za-z0-9-]+$/.test(o.output??''),'INVALID_ARGUMENTS');
 need(/^[a-f0-9]{40}$/.test(o.source??'')&&isAbsolute(o['package-receipt']??''),'INVALID_ARGUMENTS');return o;
}
const diagnosticCodes=['INVALID_SDK_DIAGNOSTIC','SDK_OWNER_CHANGED','SDK_DIAGNOSTIC_DISABLED','SDK_DIAGNOSTIC_INCOMPLETE','SOURCE_CHANGED','FIRST_RESULT_CHANGED','OWNERSHIP_FAILED','ACCOUNT_FAILURE','ACCOUNT_OWNER_CHANGED','ACTION_OWNER','RESTORE_TIMEOUT','DEVICE_OPERATION_TIMEOUT'];
const failure=e=>({code:diagnosticCodes.includes(e?.code)?e.code:safeFailure(e)});

export async function main(argv,{App=NativeApp,print=console.log}={}){
 const opts=parseDiagnosticArgs(argv),repo=resolve(fileURLToPath(new URL('../..',import.meta.url)));
 const source=()=>({head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),clean:execFileSync('git',['status','--porcelain'],{cwd:repo}).length===0});
 const initial=source();need(initial.head===opts.source&&initial.clean,'SOURCE_CHANGED');
 const candidate=await validatePackage(opts['package-receipt'],opts.source);
 need(await realpath('/private/tmp')==='/private/tmp','OWNERSHIP_FAILED');
 const original=hash(await readFile(OWNED+'/result.json'));need(original===ORIGINAL_HASH,'FIRST_RESULT_CHANGED');
 await mkdir(opts.output,{mode:0o700});
 const report={schema:1,kind:'owned-real-App-sdk-map-diagnostic',status:opts.run?'running':'prepared-not-run',source:opts.source,candidate,collectorSha256:hash(await readFile(fileURLToPath(import.meta.url))),driverSha256:hash(await readFile(new URL('./sync108-native-driver.mjs',import.meta.url))),firstResultSha256:original,pushSubmitted:false,samples:[],diagnostics:{},routeComparison:{available:false,selectedTransportMatchesLiveB:null},boundaries:['Only existing owned live02 A/B, normal restore, at most one real push.','No copied grant/Noise, no fresh signin, no default library access.','Fixed native diagnostic opt-in; no raw stderr, message, URL, account/device IDs or identity witnesses saved.','Diagnostic collection failure remains distinct from actual operation terminal; no error can pass acceptance.']};
 const save=()=>writeFile(opts.output+'/result.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 if(!opts.run){await save();return report;}
 const apps={},raw={},labels=new Map(),traces={a:new SdkTrace(),b:new SdkTrace()};let diagnosticFailed=false;
 const sample=async(n,phase)=>{
  const s=await apps[n].evaluate(account,{type:'status'});raw[n]=s;
  const own=s.devices?.find(d=>d.current);if(own)labels.set(own.id,n);
  const row={device:n,phase,...safeStatus(s,labels),error:s.error===undefined?null:safeAccountError(s.error)};
  if(row.error)report.accountErrorObserved=true;
  const previous=report.samples.findLast(x=>x.device===n);
  if(JSON.stringify(previous)!==JSON.stringify(row)&&report.samples.length<512)report.samples.push(row);
  return s;
 };
 const diagnostic=async n=>{
  try{
   const fresh=traces[n].accept(await apps[n].request({op:'accountSdkDiagnostic'},3000));
   report.diagnostics[n]=traces[n].safe();
   for(const r of fresh)if(r.kind==='map'&&r.mapOutcome==='error')print(JSON.stringify({device:n,firstActualMapError:r}));
  }catch(e){diagnosticFailed=true;report.diagnosticFailure??={device:n,...failure(e)};}
 };
 try{
  for(const n of ['a','b']){
   const dir=OWNED+'/desktop-'+n,st=await lstat(dir);
   need(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(dir)===dir,'OWNERSHIP_FAILED');
   apps[n]=new App(candidate.binary,dir,{name:n,env:{NOTES_SYNC_E2E_SLOT:n==='a'?'left':'right',NOTES_SYNC_E2E_SDK_DIAGNOSTIC:'1'}});
   await apps[n].ready(60000);await sample(n,'restore');
  }
  const until=Date.now()+90000;
  for(;;){
   await sample('a','restore');await sample('b','restore');
   need(!raw.a.error&&!raw.b.error,'ACCOUNT_FAILURE');
   if(raw.a.profile&&raw.b.profile)need(raw.a.profile.subject===raw.b.profile.subject,'ACCOUNT_OWNER_CHANGED');
   if(['a','b'].every(n=>raw[n].state==='ready'&&raw[n].enabled&&raw[n].profile&&raw[n].devices.some(d=>!d.current&&d.online&&d.syncAvailable)))break;
   need(Date.now()<until,'RESTORE_TIMEOUT');await delay(300);
  }
  // The fixed diagnostic must be available before any new push is submitted.
  await diagnostic('a');await diagnostic('b');need(!diagnosticFailed,'SDK_DIAGNOSTIC_INCOMPLETE');
  const baseline=traces.a.last;
  const target=raw.b.devices.find(d=>d.current)?.id;
  need(target&&raw.a.devices.some(d=>d.id===target&&!d.current&&d.online&&d.syncAvailable),'ACTION_OWNER');
  await apps.a.evaluate(begin,{type:'syncDevice',deviceId:target,direction:'push'});
  report.pushSubmitted=true;await save();print('PUSH_SUBMITTED_ONCE');
  const {marker,elapsedMs}=await observeOperation({sample,diagnostic,poll:()=>apps.a.evaluate(poll),save});
    report.pushElapsedMs=elapsedMs;report.commandDone=true;report.commandRejected=marker.failed;
    if(marker.status)report.commandTerminal={...safeStatus(marker.status,labels),error:marker.status.error===undefined?null:safeAccountError(marker.status.error)};
    report.mapEvidence=mapEvidence(traces.a.records,baseline);
    report.mapEvidenceComplete=report.mapEvidence.oneOperation&&!report.mapEvidence.hasStartedWithoutReturn&&!traces.a.overflow&&traces.a.dropped===0;
    const op=marker.status?.deviceOperation;
    report.status=report.accountErrorObserved||marker.failed||marker.status?.error||op?.phase!=='succeeded'||op?.deviceId!==target||op?.direction!=='push'||diagnosticFailed||!report.mapEvidenceComplete||!report.mapEvidence.bothMapsReturnedOk?'fail':'push-command-succeeded-not-acceptance';
    await save();print(JSON.stringify({status:report.status,pushElapsedMs:report.pushElapsedMs,terminal:report.commandTerminal,diagnosticFailure:report.diagnosticFailure}));
 }catch(e){report.status='fail';report.failure=failure(e);}
 finally{
  // Best effort final finite snapshot never overwrites an earlier failure.
  for(const n of ['a','b'])if(apps[n])await diagnostic(n);
  const c=await closeNativeClients(Object.values(apps));report.lifecycle=c.lifecycle;report.nativeCleanup={allClosed:c.allClosed,failed:c.failed};
  if(c.failed||!c.allClosed){report.status='fail';report.cleanupFailure={code:'CLEANUP_FAILED'};}
  const after=source();report.sourceHeadAfter=after.head;report.sourceCleanAfter=after.clean;
  report.firstResultUnchanged=hash(await readFile(OWNED+'/result.json'))===original;
  if(after.head!==opts.source||!after.clean||!report.firstResultUnchanged||diagnosticFailed)report.status='fail';
  await save();print(JSON.stringify({status:report.status,nativeCleanup:report.nativeCleanup,lifecycle:report.lifecycle}));
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await main(process.argv.slice(2));}catch(e){console.error(JSON.stringify(failure(e)));process.exitCode=1;}
}
