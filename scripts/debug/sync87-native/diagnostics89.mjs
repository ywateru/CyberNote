/** Read-only APK20 v2 diagnostic reader; caller supplies existing receipt/lifetime guarded CDP client. */
import assert from 'node:assert/strict';
export const abortReasons = Object.freeze(['authorityChanged','participantChanged','pendingBarrier','timeout','probeBlocked','prepareNotReady','protectedTarget','noEligiblePlan','localIntent','planChanged','planStale','prepareMetadataError','applyError','evaluationError','mediaPrepareError','mediaAuthorityChanged','mediaInstallError','emitError','externalAbort']);
export const applyErrors = Object.freeze(['databaseForeignKey','databaseUnique','databaseNotNull','databaseCheck','databaseTrigger','databaseReadonly','databaseBusy','databaseLocked','databaseNoSuchTable','databaseNoSuchColumn','databaseNoSuchFunction','databaseSyntax','databaseFull','databaseIo','databaseOther','filesystem','document','syncInvalid','syncLimit','syncPendingFlush','syncMissingBlob','syncBlobCorrupt','syncMediaPublish','syncEquivocation','syncDisabled','syncWorkspaceMismatch','syncAttachmentConflict','notFound','other']);
const fields = ['version','commits','aborts','latestAbortReason','abortReasons','activePhase','latestApplyError','applyErrors'];
function dataObject(value, keys) {
  assert(value&&typeof value==='object'&&!Array.isArray(value),'fixed diagnostic object required');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  assert.deepEqual(Object.keys(descriptors).sort(),[...keys].sort(),'fixed diagnostic fields required');
  assert(Object.values(descriptors).every(d=>Object.hasOwn(d,'value')),'diagnostic accessors refused');
  return Object.fromEntries(Object.entries(descriptors).map(([key,d])=>[key,d.value]));
}
function counter(value){assert(Number.isSafeInteger(value)&&value>=0,'bounded diagnostic counter required');return value;}
function validateDiagnosticsValue(value) {
  const v=dataObject(value,fields),r=dataObject(v.abortReasons,abortReasons),a=dataObject(v.applyErrors,applyErrors);
  assert.equal(v.version,2);assert(v.latestAbortReason===null||abortReasons.includes(v.latestAbortReason),'fixed abort reason required');
  assert(v.latestApplyError===null||applyErrors.includes(v.latestApplyError),'fixed apply error required');
  assert(v.activePhase===null||['probe','prepare'].includes(v.activePhase),'fixed diagnostic phase required');
  return {version:2,commits:counter(v.commits),aborts:counter(v.aborts),latestAbortReason:v.latestAbortReason,abortReasons:Object.fromEntries(abortReasons.map(reason=>[reason,counter(r[reason])])),activePhase:v.activePhase,latestApplyError:v.latestApplyError,applyErrors:Object.fromEntries(applyErrors.map(category=>[category,counter(a[category])]))};
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
