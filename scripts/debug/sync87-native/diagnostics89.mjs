/** Read-only APK19 diagnostic reader; caller supplies existing receipt/lifetime guarded CDP client. */
import assert from 'node:assert/strict';
export const abortReasons = Object.freeze(['authorityChanged','participantChanged','pendingBarrier','timeout','probeBlocked','prepareNotReady','protectedTarget','noEligiblePlan','localIntent','planChanged','planStale','prepareMetadataError','applyError','evaluationError','mediaPrepareError','mediaAuthorityChanged','mediaInstallError','emitError','externalAbort']);
const fields = ['version','commits','aborts','latestAbortReason','abortReasons','activePhase'];
function dataObject(value, keys) {
  assert(value&&typeof value==='object'&&!Array.isArray(value),'fixed diagnostic object required');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  assert.deepEqual(Object.keys(descriptors).sort(),[...keys].sort(),'fixed diagnostic fields required');
  assert(Object.values(descriptors).every(d=>Object.hasOwn(d,'value')),'diagnostic accessors refused');
  return Object.fromEntries(Object.entries(descriptors).map(([key,d])=>[key,d.value]));
}
function counter(value){assert(Number.isSafeInteger(value)&&value>=0,'bounded diagnostic counter required');return value;}
function validateDiagnosticsValue(value) {
  const v=dataObject(value,fields),r=dataObject(v.abortReasons,abortReasons);
  assert.equal(v.version,1);assert(v.latestAbortReason===null||abortReasons.includes(v.latestAbortReason),'fixed abort reason required');
  assert(v.activePhase===null||['probe','prepare'].includes(v.activePhase),'fixed diagnostic phase required');
  return {version:1,commits:counter(v.commits),aborts:counter(v.aborts),latestAbortReason:v.latestAbortReason,abortReasons:Object.fromEntries(abortReasons.map(reason=>[reason,counter(r[reason])])),activePhase:v.activePhase};
}
export function validateDiagnostics(value) {
  try{return validateDiagnosticsValue(value);}catch{throw Error('native diagnostics refused');}
}
export async function readNativeDiagnostics(client) {
  try{
  const result=await client.read(`(async()=>{const w=await window.__TAURI_INTERNALS__.invoke('load_workspace');return window.__TAURI_INTERNALS__.invoke('sync_diagnostics',{expected:{sessionId:w.access.sessionId,epoch:w.access.epoch}})})()`);
  return validateDiagnostics(result);
  }catch{throw Error('native diagnostics refused');}
}
