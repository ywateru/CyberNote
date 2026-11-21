// Runner policy only. Importing this module never launches a native process.
import assert from 'node:assert/strict';
import {until} from './sync108-native-driver.mjs';

const states=['signedOut','authorizing','connecting','ready','paused','error'];
const codes=['account_sdk_failed','account_unknown_outcome','account_deadline_exceeded','account_configuration','account_authentication','account_auth_callback_invalid','account_auth_identity_invalid','account_auth_code_rejected','account_auth_token_response_invalid','account_auth_refresh_missing','account_owner_workspace_mismatch','account_network','account_enrollment_invalid','account_storage','account_cancelled','account_busy','account_platform_unsupported','account_cleanup_required','account_sync_failed','account_sync_protocol','account_sync_adoption_blocked','account_window_invalid','account_device_offline','account_device_incompatible','account_sync_not_enabled','account_directory_unavailable','account_directory_unsupported'];
const sdkStages=['init','authStart','authCallback','authState','authRestore','authCancel','authLogout','publishProfile','networkStart','networkStop'];
// Includes the endpoint/provider diagnostics from account109 coordination work.
const stages=['callbackListen','browserOpen','callbackReceive','identityProvider','coordinator','coordinatorConfiguration','coordinatorRegistration','coordinatorProfile','coordinatorEnrollment','coordinatorJwks','authorizationProvider','identitySession','identityRefresh','identityRevocation','coordinatorSession'];
const reasons=['responseMetadata','missingIdToken','issuer','audience','expired','nonce','signingKey','signature','algorithm','subject','authorizedParty','issuedAt','accessTokenHash','otherClaims'];
const providerReasons=['configuration','network','invalidCallback','invalidIdentity','identityRejected','codeExchangeRejected','tokenResponseInvalid','missingRefreshToken','cancelled','noSession','ownershipMismatch','storage','refreshFailed','revocationFailed','busy'];
const tokenOperations=['codeExchange','refresh'];
const tokenFields=['tokenType','accessToken','expiresIn','scope'];
const requestReasons=['timeout','connect','request','responseBody','httpStatus','invalidResponse'];
function safeRequestDiagnostic(e){
  if(!e||!['account_network','account_authentication'].includes(e.code)||!['coordinatorProfile','coordinatorEnrollment','coordinatorJwks'].includes(e.stage)||
    !requestReasons.includes(e.requestReason)||'reason' in e||'providerReason' in e||'tokenOperation' in e||'tokenField' in e)return {};
  if(e.requestReason==='httpStatus')return Number.isInteger(e.httpStatus)&&e.httpStatus>=100&&e.httpStatus<=599&&!(e.httpStatus>=200&&e.httpStatus<300)&&(e.code==='account_authentication')===(e.httpStatus===401||e.httpStatus===403)?{requestReason:e.requestReason,httpStatus:e.httpStatus}:{};
  return 'httpStatus' in e||e.code!=='account_network'?{}:{requestReason:e.requestReason};
}
const transportKinds=['cyberbus','webrtc-direct','iroh-direct','cloudflare-tunnel','unavailable','unknown'];
const positive=value=>Number.isSafeInteger(value)&&value>0;
export function safeMappingObservation(t,generation){
  if(!t||!positive(generation)||t.generation!==generation||!positive(t.sample)||count(t.ageMs)===undefined||t.ageMs>3000||!transportKinds.includes(t.enrollment)||!transportKinds.includes(t.sync))return undefined;
  return {generation,sample:t.sample,ageMs:t.ageMs,enrollment:t.enrollment,sync:t.sync};
}
const label=(value,allowed)=>allowed.includes(value)?value:'unknown';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:undefined;
export const fail=code=>Object.assign(new Error(code),{code});
export function safeStatus(s){
  const e=s?.error;
  const sdkDiagnostic=e?.code==='account_sdk_failed'&&Number.isInteger(e.cyberbusCode)&&e.cyberbusCode>=1&&e.cyberbusCode<=26&&(!('sdkStage' in e)||sdkStages.includes(e.sdkStage))
    ?{cyberbusCode:e.cyberbusCode,...(e.sdkStage===undefined?{}:{sdkStage:e.sdkStage})}:{};
  const tokenDiagnostic=e?.code==='account_auth_identity_invalid'&&e.reason==='responseMetadata'&&e.stage===undefined&&e.providerReason===undefined&&!('requestReason' in e)&&!('httpStatus' in e)&&tokenOperations.includes(e.tokenOperation)&&tokenFields.includes(e.tokenField)
    ?{tokenOperation:e.tokenOperation,tokenField:e.tokenField}:{};
  const generation=s?.state==='ready'&&s.enabled===true&&!s.error&&positive(s.transportGeneration)?s.transportGeneration:undefined;
  return {state:label(s?.state,states),enabled:s?.enabled===true,hasProfile:!!s?.profile,
    identityCheck:s?.profile?.username===undefined?'unverified':s.profile.username==='cybernoteqa20261113a'?'expectedSyntheticUser':'differentUser',
    error:s?.error?{code:label(s.error.code,codes),...sdkDiagnostic,...(s.error.stage===undefined?{}:{stage:label(s.error.stage,stages)}),...(s.error.reason===undefined?{}:{reason:label(s.error.reason,reasons)}),...(s.error.providerReason===undefined?{}:{providerReason:label(s.error.providerReason,providerReasons)}),...tokenDiagnostic,...safeRequestDiagnostic(e)}:undefined,
    ...(generation===undefined?{}:{transportGeneration:generation}),
    devices:Array.isArray(s?.devices)?s.devices.slice(0,256).map(d=>{
      const transport=d?.online===true&&d.current===false?safeMappingObservation(d.transport,generation):undefined;
      return {online:d?.online===true,current:d?.current===true,connected:d?.connected===true,...(transport===undefined?{}:{transport})};
    }):[],
    pendingCount:count(s?.pendingCount),conflictCount:count(s?.conflictCount)};
}
export function requireHealthy(s,{pendingNetwork=false}={}){
  if(pendingNetwork&&s?.error?.code==='account_network')return false;
  if(s?.error||s?.state==='error')throw fail(codes.includes(s?.error?.code)&&/^account_auth/.test(s.error.code)?'ACCOUNT_AUTHENTICATION_FAILED':'ACCOUNT_STATUS_FAILED');
  return true;
}
// Only bounded waits opt into network-pending status. Never let a matching data
// projection or enabled flag turn an error sample into phase success.
export async function waitForAccountStatuses(name,readStatuses,ready,timeoutMs,begin){
  let started=false,statuses;
  await until(name,async()=>{
    if(!started){started=true;await begin?.();}
    statuses=await readStatuses();
    const healthy=statuses.map(s=>requireHealthy(s,{pendingNetwork:true}));
    return healthy.every(Boolean)&&await ready(statuses);
  },timeoutMs);
  return statuses;
}
export const accountEnabled=s=>s.enabled&&!s.error&&s.state!=='authorizing'&&s.state!=='error';
export const accountConnected=s=>s.state==='ready'&&s.enabled&&!s.error&&s.devices.some(d=>!d.current&&d.connected);
export async function waitForConnectedData(name,readStatuses,ready){
  await waitForAccountStatuses(name+' connection',readStatuses,statuses=>statuses.every(accountConnected),120000);
  return waitForAccountStatuses(name,readStatuses,ready,60000);
}
export function statusObserver(report,getPhase){
  const previous=new Map();
  return (device,status)=>{
    const safe=safeStatus(status),phase=getPhase(),key=JSON.stringify({phase,...safe});
    if(previous.get(device)===key)return false;
    previous.set(device,key);
    // Bound reports even if a runtime oscillates during a long bounded wait.
    if((report.statusTransitions??=[]).length<256)report.statusTransitions.push({device,phase,...safe});
    else report.droppedStatusTransitions=(report.droppedStatusTransitions||0)+1;
    return true;
  };
}
// Explicit commands only: no arbitrary account command, token, grant or URL payload.
export async function nativeAccount(app,type,args={}){
  assert(['status','signIn','signOut','syncNow','setEnabled'].includes(type),'Unsupported runner account command');
  assert(args&&Object.getPrototypeOf(args)===Object.prototype,'Invalid account arguments');
  assert(Object.keys(args).every(k=>type==='setEnabled'&&k==='enabled'),'Unexpected account arguments');
  if(type==='setEnabled')assert.equal(typeof args.enabled,'boolean');
  const command=type==='setEnabled'?{type,enabled:args.enabled}:{type};
  return app.evaluate("window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})",command);
}
export function signedOut(s){return s.state==='signedOut'&&!s.profile&&!s.enabled&&!s.error&&!s.devices.some(d=>d.connected);}
export const noteBody=n=>JSON.stringify({document:n.document,plainText:n.plainText});
export const attachmentRefs=node=>[...(node?.type==='attachment'?[node.attrs?.id]:[]),...(node?.content||[]).flatMap(attachmentRefs)];
export function preserveAttachments(current,replacement){
  const collect=node=>node.type==='attachment'?[structuredClone(node)]:(node.content||[]).flatMap(collect);
  return {...replacement,content:[...replacement.content,...collect(current)]};
}
// keepAll legitimately allocates new note/attachment IDs. Resolve every ID to
// owned metadata before comparing; actual original bytes are checked separately.
export function canonicalBody(workspace,note){
  const normalize=node=>{
    const result={...node};
    if(node.type==='attachment'){
      const matches=workspace.attachments.filter(a=>a.id===node.attrs?.id&&a.noteId===note.id);
      assert.equal(matches.length,1,'Every document attachment must resolve to exactly one owned row');
      const a=matches[0];result.attrs={...node.attrs,id:{name:a.displayName,mime:a.mime,size:a.size,kind:a.kind}};
    }
    if(node.content)result.content=node.content.map(normalize);
    return result;
  };
  return JSON.stringify({document:normalize(note.document),plainText:note.plainText});
}
export function snapshotNotes(notes){return notes.map(n=>({id:n.id,body:noteBody(n)})).sort((a,b)=>a.id.localeCompare(b.id));}
export function assertPreserved(notes,snapshot){
  for(const saved of snapshot){const n=notes.find(n=>n.id===saved.id);assert(n,'Logout must retain every pre-logout note');assert.equal(noteBody(n),saved.body,'Logout must retain full document/plainText');}
}
// Negative evidence requires repeated reads for the entire observation window.
export async function observeLogout({readStatus,readNotes,snapshot,remoteIds,durationMs=3000,now=Date.now,sleep=ms=>new Promise(done=>setTimeout(done,ms))}){
  const started=now();let samples=0;
  for(;;){
    assert(signedOut(await readStatus()),'Logout must stay signed out with no connected account streams');
    const notes=await readNotes();assertPreserved(notes,snapshot);
    assert(remoteIds.every(id=>!notes.some(n=>n.id===id)),'Signed-out device applied a post-logout remote note');
    samples++;
    if(now()-started>=durationMs){assert(samples>=2,'Logout exclusion requires repeated samples');return {samples,observedMs:now()-started};}
    await sleep(Math.min(100,durationMs-(now()-started)));
  }
}
export function failureCode(error){
  const allowed=['ACCOUNT_AUTHENTICATION_FAILED','ACCOUNT_STATUS_FAILED','LOGIN_ENDED_SIGNED_OUT','LOGIN_NOT_ACCEPTED','ENABLE_FAILED','SPAWN_ERROR','HELLO_TIMEOUT','NOT_NATIVE_DEBUG_APP','NATIVE_TIMEOUT','DRIVER_TIMEOUT','TIMEOUT','STDIN_ERROR','APP_EXITED','APP_CLOSING','EXIT_BEFORE_RESPONSE','INVALID_FRAME','INVALID_RESPONSE','UNEXPECTED_RESPONSE','NATURAL_EXIT_TIMEOUT','NON_NATURAL_EXIT','CLEANUP_FAILED'];
  allowed.push('ANDROID_DEVICE_AUTH_REQUIRED','ANDROID_OWNED_APP_NOT_FOREGROUND','ANDROID_NATIVE_XML_INVALID','ANDROID_NATIVE_LOGIN_FORM_REQUIRED','ANDROID_PID_CHANGED','ANDROID_DRIVER_LOCK_BUSY','ANDROID_CDP_TIMEOUT','ANDROID_PAGE_EVALUATION_FAILED','ANDROID_CDP_COMMAND_REJECTED','ANDROID_UI_TIMEOUT','ANDROID_NATIVE_ACCOUNT_STATUS_REJECTED');
  if(allowed.includes(error?.code))return error.code;
  if(typeof error?.code==='string'&&error.code.startsWith('CONDITION_TIMEOUT:'))return 'CONDITION_TIMEOUT';
  return 'CHECK_FAILED';
}
export async function finishReport(report,children,save){
  const closed=await Promise.allSettled(children.map(app=>app.close()));
  report.lifecycle=children.map(app=>app.lifecycle);
  if(closed.some(r=>r.status==='rejected')||children.some(app=>app.lifecycle.naturalExit!==true)){
    report.cleanupFailure={code:'CLEANUP_FAILED'};
    report.failure??={phase:'cleanup',code:'CLEANUP_FAILED'};
    report.status='fail';
  }
  if(report.status!=='fail'){
    if(report.scenarios.logout==='pass'&&report.scenarios.concurrentOffline==='pass')report.status='pass';
    else{report.status='fail';report.failure={phase:'completion',code:'CHECK_FAILED'};}
  }
  report.finishedAt=new Date().toISOString();await save();
}
