#!/usr/bin/env node
// Fixed one-time in-place Account109 upgrade. Importing performs no device IO.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {connectAndroid,ownedForwardPresent,ownPid,assertInteractive,installedApkPath,SERIAL,PACKAGE} from './account109-android.mjs';
import {acquireDriverLease} from './sync108-android-lifecycle.mjs';
import {safeStatus} from './account109-desktop-helpers.mjs';

export const PIN=Object.freeze({
  source:'88b2dabe4bb898b0bf225e913883b43ed2cac865',
  apk:'/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/android-88b2dabe-debug-01/CyberNote-account109-debug.apk',
  apkSha256:'2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870',apkBytes:77335388,
  oldApkSha256:'da74379984dfc0af86bff1ae89aeac43c83fdab4e7884b9b032961519c404ce9',oldPid:28911,
  certificateSha256:'e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79',
  historySha256:'d78456fb352f26bebfe1177a07dfdb5e8a39e9d79481321d28346a0b89232626',
  noteId:'321e9d6c-d590-437d-8edb-d6ed2feae3fa',
  attachmentIdSha256:'dd1ffcd89c62a90945fcfae1a89d52e406894c4a2752adf9a04c45a9fc21b87e',
  attachmentNodeSha256:'d8dcd99aa38434d7927f917a30d8c15501289dcf1f6c0f339db2e744f5b49d18',
  attachmentSha256:'c95b15e981fe59edf68449ac3a73bc01f609e5e5e74696bb0ef7302927e40cab',attachmentBytes:114608,
});
export const hash=x=>createHash('sha256').update(x).digest('hex');
const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
export const canonical=x=>JSON.stringify(sort(x));
const fail=code=>{throw Object.assign(Error(code),{code});};
const check=(condition,code)=>{if(!condition)fail(code);};
const refs=node=>[...(node?.type==='attachment'?[node.attrs?.id]:[]),...(node?.content||[]).flatMap(refs)];
const leasePath=join(os.tmpdir(),`cybernote-account109-${SERIAL}.lock`);

// Pure structural checks. Fixed evidence digests are additionally required below.
export function historicalPrefix(w,history){
  assert.equal(history.notes.length,4);assert.equal(w.notes.length,4);assert.equal(w.attachments.length,1);
  assert.deepEqual(w.notes.map(n=>n.id).sort(),history.notes.map(n=>n.id).sort());
  assert.equal(new Set(w.notes.map(n=>n.id)).size,4);
  for(const old of history.notes){
    const note=w.notes.find(n=>n.id===old.id);assert.equal(note.plainText,old.plainText);
    if(note.id!==PIN.noteId)assert.deepEqual(note.document,old.document);
    else{
      assert.equal(old.document.content.length,3);assert.equal(note.document.content.length,5);
      assert.deepEqual({...note.document,content:note.document.content.slice(0,3)},old.document);
      assert.deepEqual(note.document.content[4],{type:'paragraph'});
    }
  }
  const a=w.attachments[0],n=w.notes.find(n=>n.id===PIN.noteId),node=n.document.content[3];
  assert.equal(a.noteId,PIN.noteId);assert.equal(node.type,'attachment');
  assert.deepEqual(Object.keys(node).sort(),['attrs','type']);assert.deepEqual(refs(n.document),[a.id]);
  assert(w.notes.filter(n=>n.id!==PIN.noteId).every(n=>refs(n.document).length===0));
  assert.equal(node.attrs.name,a.displayName);assert.equal(node.attrs.kind,a.kind);
  assert.deepEqual(Object.keys(a).sort(),['displayName','id','kind','mime','noteId','recordedAt','relativePath','size']);
  assert.equal(w.access?.notes?.[PIN.noteId]?.authorized,true);
  return {attachment:a,node};
}
export function fixedEvidence(e){
  check(e.idSha256===PIN.attachmentIdSha256&&e.nodeSha256===PIN.attachmentNodeSha256&&
    e.byteLength===PIN.attachmentBytes&&e.sha256===PIN.attachmentSha256,'CURRENT_EVIDENCE_CHANGED');
}
export function initialAccount(s){
  check(s.state==='error'&&s.enabled===false&&!s.profile&&s.error?.code==='account_network'&&s.error.stage==='coordinator','INITIAL_ACCOUNT_CHANGED');
  check(Array.isArray(s.devices)&&!s.devices.some(d=>d.connected),'INITIAL_ACCOUNT_CHANGED');
}
function noAuthorization(s){check(s.state!=='authorizing','AUTOMATIC_AUTHORIZATION_PENDING');}
export async function capture(peer,history){
  const before=await peer.readWorkspace(),{attachment:a,node}=historicalPrefix(before,history);
  // Reject changed references before reading any file; never adopt a new digest.
  check(hash(a.id)===PIN.attachmentIdSha256&&hash(JSON.stringify(node))===PIN.attachmentNodeSha256&&a.size===PIN.attachmentBytes,'CURRENT_EVIDENCE_CHANGED');
  const value=await peer.readAttachment(a.id),bytes=Buffer.from(value.data,'base64');
  fixedEvidence({idSha256:hash(a.id),nodeSha256:hash(JSON.stringify(node)),byteLength:bytes.length,sha256:hash(bytes)});
  assert.equal(value.byteLength,bytes.length);assert.equal(value.sha256,hash(bytes));assert.equal(a.size,bytes.length);
  const after=await peer.readWorkspace();
  assert.deepEqual({notes:after.notes,attachments:after.attachments},{notes:before.notes,attachments:before.attachments});
  // Persist only product note/descriptor data and byte digests, never access or metadata session values.
  return {notes:before.notes.toSorted((a,b)=>a.id.localeCompare(b.id)),attachments:before.attachments,
    attachmentBytes:[{id:a.id,noteId:a.noteId,byteLength:bytes.length,sha256:hash(bytes)}]};
}
export function sameSnapshot(before,after){check(canonical(before)===canonical(after),'DATA_CHANGED');}
export async function writePrivateSnapshot(output,snapshot){
  const path=join(output,'before.private.json');
  await writeFile(path,canonical(snapshot)+'\n',{mode:0o600,flag:'wx'});
  check(((await lstat(path)).mode&0o777)===0o600,'PRIVATE_MODE_INVALID');
  check(hash(await readFile(path))===hash(canonical(snapshot)+'\n'),'PRIVATE_SNAPSHOT_CHANGED');
}
export function signatureVerified(output){
  check(/Verified using v2 scheme \(APK Signature Scheme v2\): true/.test(output)&&
    /^Number of signers: 1\s*$/m.test(output)&&/^Signer #1 certificate DN: .*CN=Android Debug.*$/m.test(output)&&
    output.match(/^Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})\s*$/m)?.[1]===PIN.certificateSha256,'APK_SIGNATURE_MISMATCH');
}

// Finite orchestration, independently tested with device-free effects. No arbitrary live command API.
export async function executeUpgrade(io,report){
  const peers=[];let installLease;
  const step=async phase=>{report.phase=phase;await io.save(report);};
  try{
    await step('candidate');await io.verifyCandidate();report.candidateVerified=true;
    await step('before-connect');const before=await io.connect(false);peers.push(before);
    check(before.owned.pid===PIN.oldPid,'INITIAL_PID_CHANGED');
    check((await before.artifactIdentity()).apkSha256===PIN.oldApkSha256,'OLD_APK_MISMATCH');
    const account=await before.accountStatus();initialAccount(account);report.accountBefore=safeStatus(account);
    await step('before-snapshot');const snapshot=await io.capture(before);sameSnapshot(snapshot,await io.capture(before));
    initialAccount(await before.accountStatus());await io.privateSnapshot(snapshot);
    report.privateSnapshotSha256=hash(canonical(snapshot)+'\n');report.currentDataCaptured=true;
    await step('release-before-install');await io.release(before);await io.assertReleased();report.preInstallLeaseAndForwardReleased=true;
    await step('install-fence');installLease=await io.acquireInstallLease();
    await io.installFence();await io.verifyCandidate();
    await step('install');report.installAttempted=true;await io.install();report.installCompleted=true;
    await step('installed-identity');await io.installedIdentity();report.installedReviewedSourceVerified=true;
    await installLease.close(()=>{});installLease=undefined;
    await step('normal-launch');const after=await io.connect(true);peers.push(after);
    check(after.owned.pid!==PIN.oldPid,'OLD_PROCESS_STILL_RUNNING');
    check((await after.artifactIdentity()).apkSha256===PIN.apkSha256,'INSTALLED_APK_MISMATCH');
    await step('after-compare');
    for(let sample=0;sample<2;sample++){
      const s=await after.accountStatus();report.accountAfter=safeStatus(s);noAuthorization(s);
      sameSnapshot(snapshot,await io.capture(after));
      if(sample===0)await io.pause();
    }
    report.allCurrentDataPreserved=true;report.postReadSamples=2;
    const final=await after.accountStatus();report.accountAfter=safeStatus(final);noAuthorization(final);
    check(!(final.error?.code?.startsWith('account_auth')||final.error?.code==='account_cleanup_required'),'ACCOUNT_RECOVERY_REQUIRED');
    report.comparisonCompleted=true;
  }catch(e){
    const codes=['CURRENT_EVIDENCE_CHANGED','INITIAL_ACCOUNT_CHANGED','INITIAL_PID_CHANGED','OLD_APK_MISMATCH','DATA_CHANGED','APK_SIGNATURE_MISMATCH','AUTOMATIC_AUTHORIZATION_PENDING','ACCOUNT_RECOVERY_REQUIRED','OLD_PROCESS_STILL_RUNNING','INSTALLED_APK_MISMATCH','CANDIDATE_MISMATCH','DEVICE_IDENTITY_MISMATCH','INSTALL_REJECTED','LEASE_NOT_RELEASED','ANDROID_DRIVER_LOCK_BUSY'];
    report.failure={phase:report.phase,code:codes.includes(e?.code)?e.code:'CHECK_FAILED'};
  }finally{
    const cleanups=await Promise.allSettled([
      ...peers.map(p=>io.release(p)),...(installLease?[installLease.close(()=>{})]:[]),
    ]);
    cleanups.push(...await Promise.allSettled([io.assertReleased()]));
    report.cleanupComplete=cleanups.every(r=>r.status==='fulfilled');
    if(!report.cleanupComplete)report.cleanupFailure={code:'CLEANUP_FAILED'};
    report.status=!report.failure&&report.cleanupComplete&&report.comparisonCompleted?'pass-data-preservation-only':'fail';
    report.finishedAt=new Date().toISOString();await io.save(report);
  }
  return report;
}

export function options(args){
  check(args.length===2&&args[0]==='--output','OPTIONS_INVALID');const output=args[1];
  check(typeof output==='string'&&resolve(output)===output&&dirname(output)==='/private/tmp'&&/^account109-android-preserving-upgrade-[a-zA-Z0-9-]+$/.test(basename(output)),'OUTPUT_INVALID');
  return output;
}
async function absent(path){try{await lstat(path);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}}
export async function run(args=process.argv.slice(2)){
  const output=options(args);check(await absent(output),'OUTPUT_EXISTS');await mkdir(output,{mode:0o700});
  const report={schema:1,scope:'account109-android-current-data-preserving-upgrade',serial:SERIAL,package:PACKAGE,
    source:PIN.source,apkSha256:PIN.apkSha256,oldApkSha256:PIN.oldApkSha256,certificateSha256:PIN.certificateSha256,
    status:'running',startedAt:new Date().toISOString(),installAttempted:false,historicalBaselineAccepted:false,attachmentOriginExplained:false,
    accountMutationSent:false,notesOrAttachmentsWritten:false,dbOrGrantRead:false,loginOrSyncAccepted:false};
  const save=()=>writeFile(join(output,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  const sdk='/Users/water/Library/Android/sdk',exec=promisify(execFile);
  const local=async(file,args,timeout=20000,env=process.env)=>{
    // Capture but never persist/print command output, stderr or thrown process errors.
    try{return (await exec(file,args,{encoding:'utf8',timeout,maxBuffer:2_000_000,env})).stdout;}
    catch{fail('COMMAND_FAILED');}
  };
  const adb=(...args)=>local(join(sdk,'platform-tools/adb'),['-s',SERIAL,...args]);
  const installedHash=async()=>{
    const p=installedApkPath(await adb('shell','pm','path',PACKAGE));
    return (await adb('shell','sha256sum',p)).trim().split(/\s+/)[0];
  };
  let history;
  return executeUpgrade({save,
    verifyCandidate:async()=>{
      check(!process.env.ANDROID_HOME||resolve(process.env.ANDROID_HOME)===sdk,'DEVICE_IDENTITY_MISMATCH');
      const b=await readFile(PIN.apk);check(b.length===PIN.apkBytes&&hash(b)===PIN.apkSha256,'CANDIDATE_MISMATCH');
      signatureVerified(await local(join(sdk,'build-tools/36.0.0/apksigner'),['verify','--verbose','--print-certs',PIN.apk],20000,
        {...process.env,JAVA_HOME:'/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'}));
      const h=await readFile(new URL('../../docs/verification/account109/android/9263-debug/synthetic-after-restart.json',import.meta.url));
      check(hash(h)===PIN.historySha256,'CURRENT_EVIDENCE_CHANGED');history=JSON.parse(h);
    },
    connect:launch=>connectAndroid({launch}),capture:p=>capture(p,history),
    privateSnapshot:snapshot=>writePrivateSnapshot(output,snapshot),
    release:async p=>{await p.close();check(!ownedForwardPresent(p.owned),'LEASE_NOT_RELEASED');},
    assertReleased:async()=>{check(await absent(leasePath),'LEASE_NOT_RELEASED');},
    acquireInstallLease:()=>acquireDriverLease(leasePath),
    installFence:async()=>{
      check((await adb('get-state')).trim()==='device'&&(await adb('shell','am','get-current-user')).trim()==='0','DEVICE_IDENTITY_MISMATCH');
      assertInteractive();check(ownPid()===PIN.oldPid,'INITIAL_PID_CHANGED');check(await installedHash()===PIN.oldApkSha256,'OLD_APK_MISMATCH');
    },
    install:async()=>{const out=await local(join(sdk,'platform-tools/adb'),['-s',SERIAL,'install','-r',PIN.apk],120000);check(/^Success\s*$/m.test(out),'INSTALL_REJECTED');},
    installedIdentity:async()=>{check(await installedHash()===PIN.apkSha256,'INSTALLED_APK_MISMATCH');},
    pause:()=>new Promise(r=>setTimeout(r,1000)),
  },report);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run().then(r=>{
  console.log(JSON.stringify({status:r.status}));if(r.status!=='pass-data-preservation-only')process.exitCode=1;
}).catch(()=>{console.error(JSON.stringify({status:'fail',code:'PREPARATION_REJECTED'}));process.exitCode=1;});
