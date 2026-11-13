#!/usr/bin/env node
// Importing is inert. Parent installs the independently reviewed APK; no install API.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,isAbsolute,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectAndroid,ownedForwardPresent,SERIAL,PACKAGE} from './account109-android.mjs';
import {hash,canonicalBranch} from './account109-desktop-recovery.mjs';
import {requireHealthy,safeStatus,failureCode} from './account109-desktop-helpers.mjs';

export const SOURCE='72513d1296df4526a08834db65a3427957d3fb50';
export const APK_SHA='654ab2a820de70588edcceb5231818b3580e425cdf7de1db395b585066091268'; // 01f7639b receipt; independent package review 5e706346.
// Committed synthetic history: android/9263-signin01/result.json originalNotes.
export const KNOWN_BODIES=Object.freeze([
  ['321e9d6c-d590-437d-8edb-d6ed2feae3fa','713c75fe69914dfd1f971f5917aedc95210f917f181ab6743cd28d7faf712f7d','c27da2b1a84901e448334c9d01c663bcd6c5bfc016ea31c5061d142d45ae2ecb'],
  ['d6e3b2e2-d799-49e5-91ac-b76e2a7126f4','2ef3ab0c109f60929183ad8c88da07a67b29d9e202f143254e3810fe5596e926','3332298e27c631ef061f33f41c1970e4e89557ccd77440f6df27294abaebdb4f'],
  ['2113f89b-8183-458a-a97a-27d4b4be9b73','bd9ea5bbcbdd78be953502ec79b4672df2c76ef392382600d3ef98864f5f905f','9e6d2246786f9d5750fb4005bfdb71cdaad4cc95dfe8ea1e85f79814bf033d46'],
  ['3cfe6fa1-8a3e-4c4c-94d3-4f377562dc3f','e606487a9ecaf42fe1ab07b73ce2f67ae5e27ab6b2c471c2b23a22b62266dee8','4fcdfd16146f5e761502336f3333eac225e31269b76a2c67cf146a29fdc8376d'],
].map(Object.freeze));
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stable=x=>JSON.stringify(sort(x));
function sort(x){return Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;}
export function cleanSignedOut(s){
  requireHealthy(s);assert.equal(s.state,'signedOut');assert.equal(s.enabled,false);assert(!s.profile);assert.equal(s.authorizationSurface,undefined);assert.equal(s.conflictCount,0);assert(Array.isArray(s.devices)&&!s.devices.some(d=>d.connected));return true;
}
function pending(s,surface,opening=false){requireHealthy(s);assert.equal(s.enabled,false);assert(!s.profile);assert.equal(s.conflictCount,0);assert(Array.isArray(s.devices)&&!s.devices.some(d=>d.connected));assert.equal(s.state,'authorizing');assert(s.authorizationSurface===surface||(opening&&s.authorizationSurface===undefined));return s.authorizationSurface===surface;}
export async function snapshot(peer,known=KNOWN_BODIES){
  const ws=await peer.readWorkspace();assert.equal(ws.notes.length,4);assert.equal(new Set(ws.notes.map(n=>n.id)).size,4);assert.deepEqual(ws.notes.map(n=>n.id).sort(),known.map(n=>n[0]).sort());
  for(const n of ws.notes){const k=known.find(k=>k[0]===n.id);assert.equal(hash(JSON.stringify(n.document)),k[1],'Unknown synthetic document: stop before reading attachments');assert.equal(hash(n.plainText),k[2],'Unknown synthetic text: stop before reading attachments');}
  const rows=[];
  for(const a of ws.attachments){assert(ws.notes.some(n=>n.id===a.noteId));const result=await peer.readAttachment(a.id),bytes=Buffer.from(result.data,'base64');assert.equal(bytes.length,a.size);assert.equal(hash(bytes),result.sha256);rows.push({...a,sha256:hash(bytes)});}
  assert.equal(new Set(rows.map(a=>a.id)).size,rows.length);
  const notes=ws.notes.map(note=>{const old=known.find(n=>n[0]===note.id),documentSha256=hash(JSON.stringify(note.document)),plainTextSha256=hash(note.plainText);assert.equal(documentSha256,old[1],'Unknown synthetic document: stop before login');assert.equal(plainTextSha256,old[2],'Unknown synthetic text: stop before login');return {id:note.id,documentSha256,plainTextSha256,branchSha256:hash(canonicalBranch({note,attachments:rows.filter(a=>a.noteId===note.id)}))};}).sort((a,b)=>a.id.localeCompare(b.id));
  return {notes,attachments:rows.map(({id,noteId,size,sha256,relativePath,...metadata})=>({id,noteId,size,sha256,metadataSha256:hash(stable(metadata))})).sort((a,b)=>a.id.localeCompare(b.id))};
}
export function validateBaseline(b){
  assert.deepEqual(Object.keys(b).sort(),['apkSha256','data','kind','package','schema','serial']);assert.equal(b.schema,1);assert.equal(b.kind,'account109-android-login-baseline');assert.equal(b.serial,SERIAL);assert.equal(b.package,PACKAGE);assert(digest(b.apkSha256));assert.deepEqual(Object.keys(b.data).sort(),['attachments','notes']);
  assert.deepEqual(b.data.notes.map(n=>n.id).sort(),KNOWN_BODIES.map(n=>n[0]).sort());
  for(const n of b.data.notes){assert.deepEqual(Object.keys(n).sort(),['branchSha256','documentSha256','id','plainTextSha256']);const k=KNOWN_BODIES.find(k=>k[0]===n.id);assert.equal(n.documentSha256,k[1]);assert.equal(n.plainTextSha256,k[2]);assert(digest(n.branchSha256));}
  assert(Array.isArray(b.data.attachments));for(const a of b.data.attachments){assert.deepEqual(Object.keys(a).sort(),['id','metadataSha256','noteId','sha256','size']);assert(/^[a-f0-9-]{36}$/.test(a.id));assert(KNOWN_BODIES.some(k=>k[0]===a.noteId));assert(Number.isSafeInteger(a.size)&&a.size>=0);assert(digest(a.sha256)&&digest(a.metadataSha256));}return b;
}
export async function bounded(label,read,ms,{now=Date.now,sleep:wait=sleep}={}){
  const deadline=now()+ms;while(now()<deadline){const result=await read();if(now()>=deadline)break;if(result)return result;await wait(Math.min(500,deadline-now()));}throw Object.assign(Error('Bounded Android observation expired'),{code:'CONDITION_TIMEOUT:'+label});
}
export async function stableLocal(peer,baseline,{now=Date.now,sleep:wait=sleep,capture=snapshot}={}){
  const start=now(),deadline=start+30000;let samples=0;
  const withinDeadline=()=>{const time=now();if(time>=deadline)throw Object.assign(Error('Bounded Android observation expired'),{code:'CONDITION_TIMEOUT:stable local'});return time;};
  for(;;){
    withinDeadline();cleanSignedOut(await peer.accountStatus());withinDeadline();
    assert.deepEqual(await capture(peer),baseline);samples++;
    const elapsed=withinDeadline()-start;if(samples>=3&&elapsed>=3000)return {samples,durationMs:elapsed};
    if(elapsed<3000)await wait(Math.max(0,Math.min(500,3000-elapsed,deadline-now())));
  }
}
export async function exercise({peer,baseline,scenario='embedded-back',reopen,record,clock={},capture=snapshot}){
  assert(['embedded-back','embedded-browser','browser'].includes(scenario));cleanSignedOut(await peer.accountStatus());assert.deepEqual(await capture(peer),baseline);
  await record('baseline-preserved',await stableLocal(peer,baseline,{...clock,capture}));
  const surface=scenario==='browser'?'browser':'embedded';let initial=await peer.signIn(surface);pending(initial,surface,true);
  await bounded('actual surface',async()=>pending(await peer.accountStatus(),surface,true),30000,clock);
  if(surface==='embedded'){
    const form=await bounded('native hosted form',async()=>{const s=await peer.accountStatus();pending(s,'embedded');const p=await peer.nativeLoginPresentation();return p.dialog&&p.webView&&p.hostedForm?p:false;},60000,clock);assert.deepEqual(form,{dialog:true,webView:true,hostedForm:true});await record('native-form',{...form,originProof:'production-native-host-policy; not independently established by accessibility'});
    if(scenario==='embedded-back'){await peer.closeNativeLogin();await bounded('native Back signedOut',async()=>{const s=await peer.accountStatus();if(s.state==='authorizing'){pending(s,'embedded');return false;}return cleanSignedOut(s);},15000,clock);}
    else{await peer.continueNativeLogin();await bounded('native continue browser',async()=>{const s=await peer.accountStatus();pending(s,['embedded','browser'].includes(s.authorizationSurface)?s.authorizationSurface:'browser');return s.authorizationSurface==='browser';},30000,clock);}
  }
  if(scenario!=='embedded-back'){
    await bounded('external browser activity',async()=>{pending(await peer.accountStatus(),'browser');const a=await peer.externalLoginActivity();return a.browser&&!a.owned;},15000,clock);await record('external-browser',{observed:true});await peer.returnFromLoginBrowser();pending(await peer.accountStatus(),'browser');await peer.cancelLogin();
  }
  await record('cancelled-preserved',await stableLocal(peer,baseline,{...clock,capture}));
  await peer.closeSettings();const restart=await peer.reclaimSignedOut();assert.equal(restart.forceStop,false);await peer.close();await record('background-reclaimed',restart);
  const after=await reopen();await record('restarted-preserved',await stableLocal(after,baseline,{...clock,capture}));
}
export function options(args){
  const o={};for(let i=0;i<args.length;i++){const k=args[i];assert(['--output','--baseline','--case','--export-baseline'].includes(k)&&!Object.hasOwn(o,k));if(k==='--export-baseline')o[k]=true;else{assert(args[i+1]&&!args[i+1].startsWith('--'));o[k]=args[++i];}}
  const output=o['--output'];assert(isAbsolute(output||'')&&resolve(output)===output&&dirname(output)==='/private/tmp'&&/^account109-android-login-surfaces-[\w-]+$/.test(basename(output)));
  if(o['--export-baseline'])assert.equal(Object.keys(o).length,2);else{assert.equal(Object.keys(o).length,3);assert(isAbsolute(o['--baseline']||'')&&resolve(o['--baseline'])===o['--baseline']);assert(['embedded-back','embedded-browser','browser'].includes(o['--case']));}
  return {output,exportBaseline:o['--export-baseline']===true,baseline:o['--baseline'],scenario:o['--case']};
}
export async function run(args=process.argv.slice(2)){
  const o=options(args);let prior;if(!o.exportBaseline){assert(digest(APK_SHA),'Reviewed candidate APK pin pending: no device access');prior=validateBaseline(JSON.parse(await readFile(o.baseline,'utf8')));}
  try{await lstat(o.output);assert.fail('Fresh output required');}catch(e){if(e.code!=='ENOENT')throw e;}
  await mkdir(o.output,{mode:0o700});const report={schema:1,kind:'account109-android-login-surfaces',source:SOURCE,serial:SERIAL,package:PACKAGE,status:'running',mode:o.exportBaseline?'baseline':o.scenario,checks:[],observations:[],limitations:['No credentials, callback/URL injection, enable, logout, clear-data, install or network probes. Unknown data/account states stop.', 'Native XML is read in RAM only. Saved form booleans do not independently authenticate Logto origin; remote content, URLs, input values and raw errors are never saved.', 'Existing four synthetic documents/text match committed history; full branch/metadata and attachment bytes match before/after. Canonical branch ignores projection revision; physical relative paths are not portable proof.', 'Restart uses only Home and am kill of the isolated background package. Final owned app is left signedOut; only exact leased forwards are removed.']};
  const peers=[];const save=()=>writeFile(resolve(o.output,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  const open=async launch=>{const p=await connectAndroid({launch});peers.push(p);const id=await p.artifactIdentity();assert(digest(id.apkSha256));if(!o.exportBaseline)assert.equal(id.apkSha256,APK_SHA);const original=p.accountStatus;p.accountStatus=async()=>{const s=await original();report.lastSafeStatus={...safeStatus(s),...(['embedded','browser'].includes(s.authorizationSurface)?{authorizationSurface:s.authorizationSurface}:{})};await save();return s;};return p;};
  try{await save();const p=await open(false);cleanSignedOut(await p.accountStatus());const data=await snapshot(p);const id=await p.artifactIdentity();
    if(o.exportBaseline){await stableLocal(p,data);const b={schema:1,kind:'account109-android-login-baseline',serial:SERIAL,package:PACKAGE,apkSha256:id.apkSha256,data};validateBaseline(b);await writeFile(resolve(o.output,'baseline.json'),JSON.stringify(b,null,2)+'\n',{mode:0o600,flag:'wx'});report.baselineSha256=hash(await readFile(resolve(o.output,'baseline.json')));report.checks.push('read-only-baseline');}
    else{assert.deepEqual(data,prior.data,'Installed candidate must preserve the pre-install baseline');report.baselineSha256=hash(await readFile(o.baseline));report.apkSha256=id.apkSha256;await exercise({peer:p,baseline:prior.data,scenario:o.scenario,reopen:()=>open(true),record:async(name,proof)=>{report.checks.push(name);report.observations.push({kind:name,...proof});await save();}});}
  }catch(e){report.failure={code:failureCode(e)};}
  finally{const results=await Promise.allSettled(peers.map(async p=>{await p.close();assert.equal(ownedForwardPresent(p.owned),false);}));report.cleanup={drivers:peers.length,exactForwardsAbsent:results.every(r=>r.status==='fulfilled'),leaseReleased:results.every(r=>r.status==='fulfilled')};if(results.some(r=>r.status==='rejected'))report.cleanupFailure={code:'CLEANUP_FAILED'};report.status=!report.failure&&!report.cleanupFailure&&report.checks.includes(o.exportBaseline?'read-only-baseline':'restarted-preserved')?'pass':'fail';await save();}
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run().then(r=>{console.log(JSON.stringify({status:r.status}));if(r.status!=='pass')process.exitCode=1;}).catch(()=>{console.error(JSON.stringify({status:'fail',code:'PREFLIGHT_REJECTED'}));process.exitCode=1;});
