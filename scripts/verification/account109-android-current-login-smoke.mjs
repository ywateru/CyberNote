#!/usr/bin/env node
// Fixed current-data smoke after the reviewed live01 preserving upgrade. Import is inert.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {connectAndroid,ownedForwardPresent,SERIAL,PACKAGE} from './account109-android.mjs';
import {exercise,cleanSignedOut} from './account109-android-login-surfaces.mjs';
import {PIN,hash,capture as currentCapture,sameSnapshot,fixedEvidence} from './account109-android-preserving-upgrade.mjs';
import {safeStatus,failureCode} from './account109-desktop-helpers.mjs';

export const CURRENT=Object.freeze({
  receipt:'/private/tmp/account109-android-preserving-upgrade-live01/result.json',
  receiptSha256:'960a6fc409c039f36d3925c3d604b313dd1cf92ca7fac81ed44d74fa20cdc1b9',
  snapshot:'/private/tmp/account109-android-preserving-upgrade-live01/before.private.json',
  snapshotSha256:'df83265e2b527804bdfa88cc673ba82b6edb38a2d2b4e0acb1423b3d5339fa18',
});
const cases=['embedded-back','browser'];
export function receiptGate(r){
  assert.equal(r.schema,1);assert.equal(r.scope,'account109-android-current-data-preserving-upgrade');
  assert.equal(r.status,'pass-data-preservation-only');assert.equal(r.serial,SERIAL);assert.equal(r.package,PACKAGE);
  assert.equal(r.source,PIN.source);assert.equal(r.apkSha256,PIN.apkSha256);assert.equal(r.oldApkSha256,PIN.oldApkSha256);assert.equal(r.certificateSha256,PIN.certificateSha256);
  assert.equal(r.privateSnapshotSha256,CURRENT.snapshotSha256);assert.equal(r.postReadSamples,2);assert(!r.failure&&!r.cleanupFailure);
  for(const key of ['candidateVerified','currentDataCaptured','preInstallLeaseAndForwardReleased','installAttempted','installCompleted','installedReviewedSourceVerified','allCurrentDataPreserved','comparisonCompleted','cleanupComplete'])assert.equal(r[key],true);
  for(const key of ['historicalBaselineAccepted','attachmentOriginExplained','accountMutationSent','notesOrAttachmentsWritten','dbOrGrantRead','loginOrSyncAccepted'])assert.equal(r[key],false);
  assert.equal(r.accountAfter.state,'signedOut');assert.equal(r.accountAfter.enabled,false);assert.equal(r.accountAfter.hasProfile,false);assert(!r.accountAfter.error);
  assert.equal(r.accountAfter.conflictCount,0);assert(Array.isArray(r.accountAfter.devices)&&!r.accountAfter.devices.some(d=>d.connected));
}
async function pinnedPrivate(path,digest){
  const s=await lstat(path);assert(s.isFile()&&!s.isSymbolicLink());assert.equal(s.mode&0o777,0o600);assert(s.size<1_000_000);
  const bytes=await readFile(path);assert.equal(hash(bytes),digest);return JSON.parse(bytes);
}
export async function loadInputs(){
  const receipt=await pinnedPrivate(CURRENT.receipt,CURRENT.receiptSha256);receiptGate(receipt);
  const expected=await pinnedPrivate(CURRENT.snapshot,CURRENT.snapshotSha256);
  assert.deepEqual(Object.keys(expected).sort(),['attachmentBytes','attachments','notes']);
  const historyBytes=await readFile(new URL('../../docs/verification/account109/android/9263-debug/synthetic-after-restart.json',import.meta.url));
  assert.equal(hash(historyBytes),PIN.historySha256);const history=JSON.parse(historyBytes);
  assert.equal(expected.notes.length,4);assert.deepEqual(expected.notes.map(n=>n.id).sort(),history.notes.map(n=>n.id).sort());
  assert.equal(expected.attachments.length,1);assert.equal(expected.attachmentBytes.length,1);
  const a=expected.attachments[0],b=expected.attachmentBytes[0],note=expected.notes.find(n=>n.id===PIN.noteId);
  assert.equal(a.noteId,PIN.noteId);assert.equal(b.id,a.id);assert.equal(b.noteId,a.noteId);assert.equal(a.size,b.byteLength);
  fixedEvidence({idSha256:hash(a.id),nodeSha256:hash(JSON.stringify(note.document.content[3])),byteLength:b.byteLength,sha256:b.sha256});
  // Genuine authorization, historical prefix and reference checks run again in currentCapture before SignIn.
  return {expected,history};
}
export async function exerciseCurrent({peer,expected,history,scenario,reopen,record,clock={},read=currentCapture}){
  return exercise({peer,baseline:expected,scenario,reopen,record,clock,capture:async p=>{
    const observed=await read(p,history);sameSnapshot(expected,observed);return observed;
  }});
}
export function options(args){
  assert.equal(args.length,4);assert.equal(args[0],'--case');assert(cases.includes(args[1]));assert.equal(args[2],'--output');
  const output=args[3];assert(typeof output==='string'&&resolve(output)===output&&dirname(output)==='/private/tmp'&&/^account109-android-current-login-smoke-[a-zA-Z0-9-]+$/.test(basename(output)));
  return {scenario:args[1],output};
}
async function absent(path){try{await lstat(path);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}}
export async function run(args=process.argv.slice(2)){
  const o=options(args),inputs=await loadInputs();assert(await absent(o.output));await mkdir(o.output,{mode:0o700});
  const report={schema:1,scope:'account109-android-current-data-login-cancellation',case:o.scenario,source:PIN.source,apkSha256:PIN.apkSha256,serial:SERIAL,package:PACKAGE,
    upgradeReceiptSha256:CURRENT.receiptSha256,currentPrivateSnapshotSha256:CURRENT.snapshotSha256,status:'running',startedAt:new Date().toISOString(),checks:[],observations:[],
    historicalBaselineAccepted:false,attachmentOriginExplained:false,credentialsEntered:false,loginOrSyncAccepted:false,installed:false,observedAuthorizationSurfaces:[]};
  const peers=[],save=()=>writeFile(join(o.output,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  const open=async launch=>{
    const p=await connectAndroid({launch});peers.push(p);assert.equal((await p.artifactIdentity()).apkSha256,PIN.apkSha256);
    const status=p.accountStatus;p.accountStatus=async()=>{const s=await status();report.lastSafeStatus={...safeStatus(s),...(['embedded','browser'].includes(s.authorizationSurface)?{authorizationSurface:s.authorizationSurface}:{})};
      if(s.state==='authorizing'&&['embedded','browser'].includes(s.authorizationSurface)&&!report.observedAuthorizationSurfaces.includes(s.authorizationSurface))report.observedAuthorizationSurfaces.push(s.authorizationSurface);
      await save();return s;};
    cleanSignedOut(await p.accountStatus());return p;
  };
  try{
    await save();const peer=await open(false);
    await exerciseCurrent({peer,...inputs,scenario:o.scenario,reopen:()=>open(true),record:async(kind,proof)=>{report.checks.push(kind);report.observations.push({kind,...proof});await save();}});
  }catch(e){report.failure={code:e?.code==='DATA_CHANGED'?'DATA_CHANGED':failureCode(e)};}
  finally{
    const results=await Promise.allSettled(peers.map(async p=>{await p.close();assert.equal(ownedForwardPresent(p.owned),false);}));
    const [leaseCheck]=await Promise.allSettled([absent(join(os.tmpdir(),`cybernote-account109-${SERIAL}.lock`))]);
    const leaseAbsent=leaseCheck.status==='fulfilled'&&leaseCheck.value===true;
    report.cleanup={exactForwardsAbsent:results.every(r=>r.status==='fulfilled'),leaseReleased:leaseAbsent};
    if(!report.cleanup.exactForwardsAbsent||!leaseAbsent)report.cleanupFailure={code:'CLEANUP_FAILED'};
    report.status=!report.failure&&!report.cleanupFailure&&report.checks.includes('restarted-preserved')?'pass-current-data-cancellation-only':'fail';report.finishedAt=new Date().toISOString();await save();
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run().then(r=>{
  console.log(JSON.stringify({status:r.status}));if(r.status!=='pass-current-data-cancellation-only')process.exitCode=1;
}).catch(()=>{console.error(JSON.stringify({status:'fail',code:'FIXED_INPUT_REJECTED'}));process.exitCode=1;});
