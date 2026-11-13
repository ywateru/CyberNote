// Fixed Account109 prerequisites and RAM-only original-library proofs. Import is inert.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {loadInputs,CURRENT} from './account109-android-current-login-smoke.mjs';
import {PIN,capture,sameSnapshot,canonical} from './account109-android-preserving-upgrade.mjs';
import {B_HISTORY_SHA,B_SUBJECT_SHA,readBHistory} from './account109-desktop-relogin.mjs';
import {PACKAGE} from './account109-android.mjs';
import {attachmentRefs,requireHealthy,failureCode,fail} from './account109-desktop-helpers.mjs';

export const CANDIDATES=Object.freeze({
  macSource:'72513d1296df4526a08834db65a3427957d3fb50',
  macSha256:'187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459',
  androidSource:'88b2dabe4bb898b0bf225e913883b43ed2cac865',
  androidSha256:'2fee1cfbe27dd3b4c537c7051206831daa5c22bb9d08db50cf25f28d6e381870',
});
export const QA_USERNAME='cybernoteqa20261113a';
export const preflightCodes=['THREE_PEER_CANDIDATE_MISMATCH','THREE_PEER_HISTORY_MISMATCH','THREE_PEER_PAUSED_REQUIRED','THREE_PEER_ORIGINAL_UNSUPPORTED','THREE_PEER_ORIGINAL_CHANGED','THREE_PEER_OVERLAP_MISMATCH','THREE_PEER_PREPARATION_REQUIRED'];
const check=(ok,code)=>{if(!ok)throw fail(code);};
const hash=x=>createHash('sha256').update(x).digest('hex');
function equal(a,b,code){check(canonical(a)===canonical(b),code);}
export function requireMacCandidate(sha256){check(sha256===CANDIDATES.macSha256,'THREE_PEER_CANDIDATE_MISMATCH');}
export function requireAndroidCandidate(identity){check(identity?.package===PACKAGE&&identity.apkSha256===CANDIDATES.androidSha256,'THREE_PEER_CANDIDATE_MISMATCH');}

export async function preparationInputs(){
  check(PIN.source===CANDIDATES.androidSource&&PIN.apkSha256===CANDIDATES.androidSha256,'THREE_PEER_CANDIDATE_MISMATCH');
  // Only these fixed historical/current inputs; no caller-supplied file or identity pins.
  await readBHistory();
  return loadInputs();
}
export function requirePausedAccount(s){
  requireHealthy(s);
  check(s.state==='paused'&&s.enabled===false&&s.profile?.username===QA_USERNAME&&typeof s.profile.subject==='string'&&s.profile.subject.length>0&&
    s.authorizationSurface===undefined&&s.conflictCount===0&&Array.isArray(s.devices)&&!s.devices.some(d=>d.connected),'THREE_PEER_PAUSED_REQUIRED');
}
// The input is an already-computed digest, never an alternative expected identity.
export function requireHistoricalOwnerHash(digest){check(digest===B_SUBJECT_SHA,'THREE_PEER_HISTORY_MISMATCH');}
export function requireHistoricalAccount(s){
  check(s.profile?.username===QA_USERNAME&&typeof s.profile.subject==='string'&&s.profile.subject.length>0,'THREE_PEER_HISTORY_MISMATCH');
  requireHistoricalOwnerHash(hash(s.profile.subject));
}
export function requirePausedAccounts(statuses){
  check(statuses.length===3,'THREE_PEER_PAUSED_REQUIRED');
  for(const s of statuses){requirePausedAccount(s);requireHistoricalAccount(s);}
}

const noteKeys=['id','folderId','document','title','plainText','createdAt','updatedAt','pinned','deletedAt','originalFolderId','locked','paperStyle','revision','sealed'];
const attachmentKeys=['id','noteId','kind','relativePath','mime','displayName','size','recordedAt','internal'];
const unique=rows=>new Set(rows.map(r=>r.id)).size===rows.length;
const text=x=>typeof x==='string'&&x.length>0;
function validateWorkspace(ws){
  const code='THREE_PEER_ORIGINAL_UNSUPPORTED';
  check(Array.isArray(ws?.notes)&&Array.isArray(ws.attachments)&&unique(ws.notes)&&unique(ws.attachments),code);
  for(const n of ws.notes){
    check(Object.keys(n).every(k=>noteKeys.includes(k))&&noteKeys.filter(k=>k!=='sealed').every(k=>Object.hasOwn(n,k)),code);
    check(text(n.id)&&text(n.folderId)&&typeof n.title==='string'&&typeof n.plainText==='string'&&n.document?.type==='doc'&&
      Number.isFinite(n.createdAt)&&Number.isFinite(n.updatedAt)&&typeof n.pinned==='boolean'&&typeof n.paperStyle==='string'&&
      (n.originalFolderId===null||typeof n.originalFolderId==='string')&&Number.isSafeInteger(n.revision)&&n.revision>=0,code);
    // Deleted/locked/sealed/unauthorized entries are unsupported, never silently skipped.
    check(n.deletedAt===null&&n.locked===false&&n.sealed==null&&ws.access?.notes?.[n.id]?.authorized===true&&!ws.access?.suspended?.includes(n.id),code);
    const owned=ws.attachments.filter(a=>a.noteId===n.id),refs=attachmentRefs(n.document);
    // Repeated document references are legal. Store also deliberately retains
    // unreferenced local descriptors (projection.rs:195); preserve those at source.
    check(refs.every(id=>owned.some(a=>a.id===id)),code);
  }
  for(const a of ws.attachments){
    check(Object.keys(a).every(k=>attachmentKeys.includes(k))&&['id','noteId','kind','relativePath','mime','displayName','size'].every(k=>Object.hasOwn(a,k)),code);
    check(text(a.id)&&text(a.noteId)&&text(a.relativePath)&&text(a.kind)&&text(a.mime)&&typeof a.displayName==='string'&&
      Number.isSafeInteger(a.size)&&a.size>=0&&(a.recordedAt==null||Number.isFinite(a.recordedAt))&&
      (a.internal===undefined||a.internal===false)&&ws.notes.some(n=>n.id===a.noteId),code);
  }
}
const exactRows=ws=>({notes:structuredClone(ws.notes).sort((a,b)=>a.id.localeCompare(b.id)),attachments:structuredClone(ws.attachments).sort((a,b)=>a.id.localeCompare(b.id))});
const semanticNote=n=>{const {revision,...rest}=n;return rest;};
const semanticAttachment=a=>{const {relativePath,...rest}=a;return rest;};
async function rawBytes(peer,a){
  const value=await peer.readAttachment(a.id,a.noteId),bytes=Buffer.from(value.data,'base64'),sha256=hash(bytes);
  check(bytes.length===a.size&&(value.byteLength===undefined||value.byteLength===bytes.length)&&(value.sha256===undefined||value.sha256===sha256),'THREE_PEER_ORIGINAL_CHANGED');
  if(peer.directory){
    const root=resolve(peer.directory,'attachments'),path=resolve(root,a.relativePath);
    check(path.startsWith(root+sep)&&await realpath(path)===path&&(await lstat(path)).isFile(),'THREE_PEER_ORIGINAL_UNSUPPORTED');
    check(hash(await readFile(path))===sha256,'THREE_PEER_ORIGINAL_CHANGED');
  }
  return {id:a.id,noteId:a.noteId,byteLength:bytes.length,sha256};
}
export async function captureOriginalLibrary(peer){
  const ws=await peer.workspace();validateWorkspace(ws);const rows=exactRows(ws),attachmentBytes=[];
  for(const a of rows.attachments)attachmentBytes.push(await rawBytes(peer,a));
  const after=await peer.workspace();validateWorkspace(after);
  equal(rows,exactRows(after),'THREE_PEER_ORIGINAL_CHANGED');
  return {...rows,attachmentBytes};
}
export async function captureCurrentPhone(peer,inputs,{read=capture}={}){
  validateWorkspace(await peer.workspace());
  const observed=await read({readWorkspace:()=>peer.workspace(),readAttachment:id=>peer.readAttachment(id)},inputs.history);
  sameSnapshot(inputs.expected,observed);
  const baseline=await captureOriginalLibrary(peer);
  sameSnapshot(inputs.expected,baseline);
  return baseline;
}
export function unionOriginalLibraries(baselines){
  check(baselines.length===3,'THREE_PEER_PREPARATION_REQUIRED');
  const notes=new Map(),attachments=new Map(),attachmentBytes=new Map();
  for(const baseline of baselines){
    check(baseline.attachments.length===baseline.attachmentBytes.length&&baseline.attachments.every(a=>baseline.attachmentBytes.some(b=>
      b.id===a.id&&b.noteId===a.noteId&&b.byteLength===a.size&&/^[a-f0-9]{64}$/.test(b.sha256))),'THREE_PEER_ORIGINAL_UNSUPPORTED');
    for(const [key,map,normalize] of [['notes',notes,semanticNote],['attachments',attachments,semanticAttachment],['attachmentBytes',attachmentBytes,x=>x]]){
      check(Array.isArray(baseline[key])&&unique(baseline[key]),'THREE_PEER_ORIGINAL_UNSUPPORTED');
      for(const row of baseline[key]){
        if(map.has(row.id))equal(normalize(map.get(row.id)),normalize(row),'THREE_PEER_OVERLAP_MISMATCH');
        else map.set(row.id,structuredClone(row));
      }
    }
  }
  return {notes:[...notes.values()].sort((a,b)=>a.id.localeCompare(b.id)),attachments:[...attachments.values()].sort((a,b)=>a.id.localeCompare(b.id)),attachmentBytes:[...attachmentBytes.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}
export function originalsPresent(ws,baseline){
  return baseline.notes.every(n=>ws.notes.some(row=>row.id===n.id))&&baseline.attachments.every(a=>ws.attachments.some(row=>row.id===a.id&&row.noteId===a.noteId));
}
export function crossPeerOriginals(union){
  const refs=new Set(union.notes.flatMap(n=>attachmentRefs(n.document)));
  return {notes:structuredClone(union.notes),attachments:structuredClone(union.attachments.filter(a=>refs.has(a.id))),attachmentBytes:structuredClone(union.attachmentBytes.filter(a=>refs.has(a.id)))};
}
export function assertOriginalLibrary(actual,baseline){
  for(const [key,normalize] of [['notes',semanticNote],['attachments',semanticAttachment],['attachmentBytes',x=>x]]){
    check(Array.isArray(actual[key])&&unique(actual[key]),'THREE_PEER_ORIGINAL_CHANGED');
    for(const row of baseline[key]){
      const found=actual[key].find(a=>a.id===row.id);check(!!found,'THREE_PEER_ORIGINAL_CHANGED');
      equal(normalize(found),normalize(row),'THREE_PEER_ORIGINAL_CHANGED');
    }
  }
}
export async function verifyOriginalLibrary(peer,baseline){assertOriginalLibrary(await captureOriginalLibrary(peer),baseline);}
export async function verifyOriginalUnion(peers,baseline){for(const peer of peers)await verifyOriginalLibrary(peer,baseline);}
export async function verifyOriginalSources(sources){for(const {peer,baseline} of sources)await verifyOriginalLibrary(peer,baseline);}
export function originalSummary(baseline){
  return {notes:baseline.notes.length,attachments:baseline.attachments.length,semanticSnapshotSha256:hash(canonical({notes:baseline.notes.map(semanticNote),attachments:baseline.attachments.map(semanticAttachment),attachmentBytes:baseline.attachmentBytes})),
    exactIdsAndReferences:true,allSemanticFields:true,authorizedBytes:true,ignoredFields:['note.revision','attachment.relativePath']};
}
export function preparationSummary(){return {status:'pass',allThreeHealthyPaused:true,historicalSubjectSha256:B_SUBJECT_SHA,historySha256:B_HISTORY_SHA,currentSnapshotSha256:CURRENT.snapshotSha256,phoneAttachmentOriginExplained:false};}
export function requirePreparation(report){
  equal(report.preparation,preparationSummary(),'THREE_PEER_PREPARATION_REQUIRED');
  check(report.originalBaseline?.capturedBeforeEnable===true,'THREE_PEER_PREPARATION_REQUIRED');
}
export async function preserveBeforeCleanup(report,sources,union){
  if(!sources.length)return;
  try{
    // Even a partial preflight/failing transfer must check every captured source.
    await verifyOriginalSources(sources);
    const unionOnAllPeers=!!union&&report.preservation?.afterMerge===true;
    if(unionOnAllPeers)await verifyOriginalUnion(sources.map(s=>s.peer),union);
    (report.preservation??={}).beforeCleanup=sources.length===3;
    report.cleanupPreservation={sourceDevices:sources.map(s=>s.peer.name),allSourceDescriptorsAndBytes:true,unionOnAllPeers,crossPeerAttachmentScope:'document-referenced-only'};
  }catch(error){
    const code=preflightCodes.includes(error.code)?error.code:failureCode(error);
    report.originalPreservationFailure={phase:'beforeCleanup',code};
    report.failure??={phase:'beforeCleanup',code};report.status='fail';
  }
}
