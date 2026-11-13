// Fixed one-shot product read. No launch, editor/account command or raw output.
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {connectAndroid,ownedForwardPresent,ownPid,PHONE_FILES,SERIAL,PACKAGE} from '../../../../../scripts/verification/account109-android.mjs';
import {safeStatus} from '../../../../../scripts/verification/account109-desktop-helpers.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const noteId='321e9d6c-d590-437d-8edb-d6ed2feae3fa';
const output=new URL('result.json',import.meta.url);
try{await lstat(output);throw Error('Receipt already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
const historicalBytes=await readFile(new URL('../9263-debug/synthetic-after-restart.json',import.meta.url));
const historical=JSON.parse(historicalBytes);
const status=s=>{const x=safeStatus(s);return {state:x.state,enabled:x.enabled,hasProfile:x.hasProfile,error:x.error??null};};
const contents=ws=>({notes:ws.notes,attachments:ws.attachments});
const refs=node=>[...(node?.type==='attachment'?[node.attrs?.id]:[]),...(node?.content||[]).flatMap(refs)];
const fixtures=[...PHONE_FILES.map(f=>({source:'scripts/verification/account109-android.mjs:PHONE_FILES',name:f.name,mime:f.mime,bytes:Buffer.from(f.base64,'base64')})),
  {source:'scripts/verification/account109-desktop.mjs:png',name:'account109.png',mime:'image/png',bytes:Buffer.from(PHONE_FILES[0].base64,'base64')},
  {source:'scripts/verification/account109-desktop.mjs:raw',name:'account109.bin',mime:'application/octet-stream',bytes:Buffer.from(Array.from({length:4096},(_,i)=>i%256))}];
const report={schema:1,scope:'fixed-read-only-original-android-attachment-audit',status:'running',startedAt:new Date().toISOString(),serial:SERIAL,package:PACKAGE,noteId,
  historicalBaselineSha256:hash(historicalBytes),helperSha256:hash(await readFile(new URL('../../../../../scripts/verification/account109-android.mjs',import.meta.url))),
  operations:[],policy:{launch:false,install:false,signIn:false,cancel:false,signOut:false,enable:false,editorCommands:false,baselineReplacement:false,dbOrGrantAccess:false,rawContentSaved:false}};
let peer,stage='connect',before;
try{
  peer=await connectAndroid({launch:false});report.owned={pid:peer.owned.pid,local:peer.owned.local,remote:peer.owned.remote};report.operations.push('connect-existing-owned-main-page');
  report.accountBefore=status(await peer.accountStatus());report.operations.push('account.status');
  assert.equal(report.accountBefore.state,'error');assert.equal(report.accountBefore.enabled,false);assert.equal(report.accountBefore.hasProfile,false);assert.equal(report.accountBefore.error?.code,'account_network');assert.equal(report.accountBefore.error?.stage,'coordinator');
  stage='workspace-reference';before=await peer.readWorkspace();report.operations.push('load_workspace');
  assert.equal(before.notes.length,4);assert.equal(before.attachments.length,1);
  assert.deepEqual(before.notes.map(n=>n.id).sort(),historical.notes.map(n=>n.id).sort());
  for(const old of historical.notes){const n=before.notes.find(n=>n.id===old.id);assert.equal(n.plainText,old.plainText);if(n.id!==noteId)assert.deepEqual(n.document,old.document);}
  const note=before.notes.find(n=>n.id===noteId),old=historical.notes.find(n=>n.id===noteId),a=before.attachments[0];
  assert.equal(old.document.content.length,3);assert.equal(note.document.content.length,5);assert.deepEqual(note.document.content.slice(0,3),old.document.content);
  assert.deepEqual({...note.document,content:old.document.content},old.document);
  assert.deepEqual(note.document.content[4],{type:'paragraph'});
  const node=note.document.content[3];assert.equal(node.type,'attachment');assert.deepEqual(Object.keys(node).sort(),['attrs','type']);
  assert.equal(a.noteId,noteId);assert(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(a.id));
  assert.deepEqual(refs(note.document),[a.id]);assert(before.notes.filter(n=>n.id!==noteId).every(n=>refs(n.document).length===0));
  assert.equal(node.attrs.name,a.displayName);assert.equal(node.attrs.kind,a.kind);
  report.structure={sameFourIds:true,allPlainTextEqual:true,threeDocumentsEqual:true,originalThreeBlocksEqual:true,soleAdditionIsOwnedAttachmentAndEmptyParagraph:true,exactSingleReference:true,nodeNameAndKindMatchDescriptor:true,attachmentIdSha256:hash(a.id),noteAuthorized:before.access?.notes?.[noteId]?.authorized===true};
  assert.equal(report.structure.noteAuthorized,true);assert(Number.isSafeInteger(a.size)&&a.size>=0&&a.size<=1_000_000);
  stage='authorized-product-bytes';const result=await peer.readAttachment(a.id);report.operations.push('read_attachment-with-current-native-access');
  const bytes=Buffer.from(result.data,'base64');assert.equal(bytes.length,a.size);assert.equal(result.byteLength,bytes.length);assert.equal(result.sha256,hash(bytes));
  report.bytes={authorizedProductRead:true,byteLength:bytes.length,sha256:hash(bytes),descriptorSizeMatches:true};
  report.fixtureComparisons=fixtures.map(f=>({source:f.source,name:f.name,byteLength:f.bytes.length,sha256:hash(f.bytes),sameBytes:bytes.equals(f.bytes),sameMime:a.mime===f.mime,sameDisplayName:a.displayName===f.name}));
  stage='post-read-invariance';const after=await peer.readWorkspace();report.operations.push('load_workspace');assert.deepEqual(contents(after),contents(before));
  report.accountAfter=status(await peer.accountStatus());report.operations.push('account.status');assert(isDeepStrictEqual(report.accountAfter,report.accountBefore));assert.equal(ownPid(),peer.owned.pid);
  report.invariance={allNoteAndAttachmentFieldsUnchanged:true,originalAccountErrorUnchanged:true,ownedPidUnchanged:true};
  report.status='verified-read-only';
}catch(e){report.status='stopped';report.failure={stage,code:['ANDROID_FILE_OWNER_REQUIRED','ANDROID_PID_CHANGED','ANDROID_DRIVER_LOCK_BUSY','ANDROID_CDP_TIMEOUT'].includes(e?.code)?e.code:'CHECK_FAILED'};}
finally{
  try{if(peer){await peer.close();assert.equal(ownedForwardPresent(peer.owned),false);report.cleanup={driverClosed:true,exactForwardAbsent:true};}else report.cleanup={connected:false};}
  catch{report.status='stopped';report.cleanup={driverClosed:false,code:'CLEANUP_FAILED'};}
  report.finishedAt=new Date().toISOString();await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
}
console.log(JSON.stringify({status:report.status,stage:report.failure?.stage,receipt:'docs/verification/account109/android/login-surfaces-attachment-read01/result.json'}));
if(report.status!=='verified-read-only')process.exitCode=1;
