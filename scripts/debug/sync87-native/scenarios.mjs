/** Actual-device scenarios. Nothing runs until explicitly called with receipts. */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { guard } from './client.mjs';
import { goHome,openNote,eventually,saveImageOriginal } from './native-ui.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function assertNativeOriginal(client,id,file) {
  const read=await client.readAttachment(id),bytes=Buffer.from(read.data,'base64');
  assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256);
  return{id,bytes:bytes.length,sha256:file.sha256,source:'actual-native-read_attachment'};
}
export const mobileInputText=marker=>marker+'\nAndroid真实输入与保存';
export const desktopInputText=marker=>marker+' desktop real Session input';
// Capture the actual sending Store after all attachment document commits. Keep
// its complete JSON, including attachment nodes/attributes, rather than guessing
// an editor serialization or accepting only a marker in a received text field.
export function captureExpectedNote(workspace,id,plainText) {
  const note=workspace.notes.find(n=>n.id===id);
  assert(note,'sending note missing');assert.equal(note.plainText,plainText,'sending note must contain complete intended text');
  assert(note.document?.type==='doc'&&Array.isArray(note.document.content)&&note.document.content.length>0,'sending document missing');
  return structuredClone({id,plainText:note.plainText,document:note.document});
}
export function noteReplicaMatches(workspace,expected) {
  const note=workspace.notes.find(n=>n.id===expected.id);
  return !!note&&note.plainText===expected.plainText&&isDeepStrictEqual(note.document,expected.document);
}
export async function waitForNoteReplica(readWorkspace,expected,files,label,timeoutMs=40000) {
  assert(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=40000,'bounded convergence timeout required');
  return eventually(async()=>{
    const workspace=await readWorkspace();
    if(!noteReplicaMatches(workspace,expected)||!files.every(f=>workspace.attachments.some(a=>a.noteId===expected.id&&a.displayName===f.name)))return false;
    return structuredClone(workspace.notes.find(n=>n.id===expected.id));
  },label+' complete document/plainText and media',timeoutMs);
}
const textProof=note=>({id:note.id,documentSha256:hash(JSON.stringify(note.document)),plainTextSha256:hash(note.plainText),completeDocumentAndPlainTextVerified:true});
export async function textRoundtrip({client,peer,state,output,saveState,convergenceTimeoutMs=40000}) {
  const mobile=state.notes.at(-1);assert(mobile);assert(!state.desktopNote,'separate text stage must not replace an existing desktop note');
  const mobileExpected=captureExpectedNote(await client.workspace(),mobile.id,mobileInputText(mobile.marker));
  const receivedMobile=await waitForNoteReplica(()=>peer.workspace(),mobileExpected,[],'mobile to desktop text',convergenceTimeoutMs);
  const marker='SYNC87-DESKTOP-'+state.runId,id=await peer.create(desktopInputText(marker));
  const desktopExpected=captureExpectedNote(await peer.workspace(),id,desktopInputText(marker));
  const receivedDesktop=await waitForNoteReplica(()=>client.workspace(),desktopExpected,[],'desktop to mobile text',convergenceTimeoutMs);
  await openNote(client,id);await client.wait('document.querySelector(".tiptap")?.innerText.includes('+JSON.stringify(desktopExpected.plainText)+')','complete desktop text visible');
  state.desktopNote={id,marker,attachmentIds:[]};await saveState(state);await client.snapshot(output,'text-roundtrip');
  const result={mobileToDesktop:textProof(receivedMobile),desktopToMobile:textProof(receivedDesktop),scope:'actual Android UI/native Store and real DesktopPeer; separate text-only stage; no media or export acceptance'};
  await writeFile(join(output,'text-roundtrip.json'),JSON.stringify(result,null,2)+'\n');return result;
}
export async function desktopMedia({client,peer,state,output,saveState,convergenceTimeoutMs=40000}) {
  assert(state.desktopNote&&state.desktopNote.attachmentIds.length===0,'text stage and no previous desktop media required');
  const {id,marker}=state.desktopNote,attachmentIds=[];
  for(const file of state.desktopFiles)attachmentIds.push(await peer.addMedia(id,file));
  const expected=captureExpectedNote(await peer.workspace(),id,desktopInputText(marker));
  await waitForNoteReplica(()=>client.workspace(),expected,state.desktopFiles,'desktop media to mobile',convergenceTimeoutMs);
  const w=await client.workspace();assert(attachmentIds.every(a=>w.attachments.some(x=>x.id===a&&x.noteId===id)));
  const originals=[];for(let i=0;i<state.desktopFiles.length;i++)originals.push(await assertNativeOriginal(client,attachmentIds[i],state.desktopFiles[i]));
  await openNote(client,id);await client.wait('[...document.querySelectorAll(".tiptap img")].some(x=>x.complete&&x.naturalWidth>0)','synced image decode');
  await client.wait('[...document.querySelectorAll(".tiptap audio")].some(x=>Number.isFinite(x.duration)&&x.duration>0)','synced synthetic audio metadata');
  state.desktopNote.attachmentIds=attachmentIds;await saveState(state);await client.snapshot(output,'desktop-media');
  const result={originals,completeDocumentAndPlainTextVerified:true,decodedImageAndAudio:true,scope:'desktop-created synthetic originals to native Android; Android picker and native export remain separate'};
  await writeFile(join(output,'desktop-media.json'),JSON.stringify(result,null,2)+'\n');return result;
}
export async function roundtrip({client,peer,state,output,saveState,convergenceTimeoutMs=40000}) {
  const mobile=state.notes.at(-1);assert(mobile,'create synthetic mobile note first');
  const mobileFiles=state.files.filter(f=>/\.(png|wav)$/.test(f.name));
  const mobileExpected=captureExpectedNote(await client.workspace(),mobile.id,mobileInputText(mobile.marker));
  const receivedMobile=await waitForNoteReplica(()=>peer.workspace(),mobileExpected,mobileFiles,'mobile to desktop',convergenceTimeoutMs);
  const fromMobile=[];
  for(const file of mobileFiles){const w=await peer.workspace(),attachment=w.attachments.find(a=>a.noteId===mobile.id&&a.displayName===file.name);fromMobile.push(await peer.verifyOriginal(attachment.id,file,'from-mobile'));}
  const marker='SYNC87-DESKTOP-'+state.runId,id=await peer.create(desktopInputText(marker));
  const attachmentIds=[];
  for(const file of state.desktopFiles)attachmentIds.push(await peer.addMedia(id,file));
  const desktopExpected=captureExpectedNote(await peer.workspace(),id,desktopInputText(marker));
  const receivedDesktop=await waitForNoteReplica(()=>client.workspace(),desktopExpected,state.desktopFiles,'desktop to mobile',convergenceTimeoutMs);
  const receivedAttachments=(await client.workspace()).attachments;assert(attachmentIds.every(id=>receivedAttachments.some(a=>a.id===id)),'desktop original attachment identity missing');
  const fromDesktop=[];
  for(let i=0;i<state.desktopFiles.length;i++)fromDesktop.push(await assertNativeOriginal(client,attachmentIds[i],state.desktopFiles[i]));
  await openNote(client,id);await client.wait('document.querySelector(".tiptap")?.innerText.includes('+JSON.stringify(desktopExpected.plainText)+')','complete desktop text visible');
  await client.wait('[...document.querySelectorAll(".tiptap img")].some(x=>x.complete&&x.naturalWidth>0)','synced image decode');
  await client.wait('[...document.querySelectorAll(".tiptap audio")].some(x=>Number.isFinite(x.duration)&&x.duration>0)','synced synthetic audio metadata');
  const originalExport=await saveImageOriginal(client,state,output,2,state.desktopFiles.find(f=>f.name.endsWith('.png')));
  state.desktopNote={id,marker,attachmentIds};await saveState(state);
  const result={mobileNoteId:mobile.id,desktopNoteId:id,fromMobile,fromDesktop,text:{mobileToDesktop:textProof(receivedMobile),desktopToMobile:textProof(receivedDesktop)},originalExport,desktopScope:'actual React/Tiptap desktop App DOM with real Rust Session/Store/network; browser OS/media boundaries simulated'};
  await writeFile(join(output,'roundtrip.json'),JSON.stringify(result,null,2)+'\n');return result;
}
export async function backgroundRoundtrip({client,closeClient,getClient,peer,state,output,receipt}) {
  assert(state.desktopNote);await goHome(client);
  const before=client.identity;await peer.sync({type:'stop'});await guard('home');await closeClient();
  const marker='SYNC87-FOREGROUND-'+state.runId;
  await peer.save(state.desktopNote.id,marker);await peer.sync({type:'resume'});
  await guard('start',{receipt});const after=await getClient();
  await eventually(async()=>{const w=await after.workspace();return w.notes.some(n=>n.id===state.desktopNote.id&&JSON.stringify(n.document).includes(marker));},'foreground automatic convergence');
  await openNote(after,state.desktopNote.id);await after.wait('document.querySelector(".tiptap")?.innerText.includes('+JSON.stringify(marker)+')','foreground update visible');
  for(let i=0;i<state.desktopFiles.length;i++)await assertNativeOriginal(after,state.desktopNote.attachmentIds[i],state.desktopFiles[i]);
  await after.snapshot(output,'foreground-reconnected');
  const result={beforeApp:before,afterApp:after.identity,desktopPausedAndResumed:true,automaticMobileConvergence:true,manualMobileSyncCommand:false,marker};
  await writeFile(join(output,'foreground.json'),JSON.stringify(result,null,2)+'\n');return result;
}
function selectedNotes(state,workspace) {
  const ids=[...state.notes.map(n=>n.id),...(state.desktopNote?[state.desktopNote.id]:[])];assert(ids.length>0);
  return ids.map(id=>{const note=workspace.notes.find(n=>n.id===id);assert(note);return{id,document:note.document,attachments:workspace.attachments.filter(a=>a.noteId===id).sort((a,b)=>a.id.localeCompare(b.id))};});
}
export function compareColdBoot(before,after) {
  assert.notEqual(after.bootId,before.bootId,'guest did not cold boot');
  assert(after.emulatorPid!==before.emulatorPid||after.emulatorStart!==before.emulatorStart,'emulator lifetime unchanged');
  for(const key of ['userdataDevice','userdataInode','userdataSize'])assert.equal(after[key],before[key],'owned userdata identity changed');
}
export async function coldBootPrepare({client,closeClient,state,output}) {
  await goHome(client);const workspace=await client.workspace(),checkpoint=await guard('checkpoint');
  const before={checkpoint,notes:selectedNotes(state,workspace),appIdentity:client.identity};
  await writeFile(join(output,'cold-boot-before.json'),JSON.stringify(before,null,2)+'\n');
  await closeClient();await guard('stop');
  return{awaitingOwnedLifecycleCycle:true,checkpoint,notes:before.notes.length,scope:'root must stop reviewed existing cycle and start reviewed same-data cold/no-snapshot cycle; no lifecycle command issued here'};
}
export async function coldBootVerify({getClient,state,output,receipt}) {
  const before=JSON.parse(await readFile(join(output,'cold-boot-before.json'),'utf8')),checkpoint=await guard('checkpoint');compareColdBoot(before.checkpoint,checkpoint);
  await guard('start',{receipt});const client=await getClient(),workspace=await client.workspace();
  assert.deepEqual(selectedNotes(state,workspace),before.notes,'native documents/attachments changed across same-data cold boot');
  for(const note of before.notes){for(const attachment of note.attachments){const file=[...state.files,...state.desktopFiles].find(f=>f.name===attachment.displayName);assert(file,'unknown non-synthetic attachment');await assertNativeOriginal(client,attachment.id,file);}}
  await client.snapshot(output,'cold-boot-restored');
  const result={checkpoint,appIdentity:client.identity,sameUserdata:true,documentsAndOriginalMediaPreserved:true,notes:before.notes.length};await writeFile(join(output,'cold-boot-after.json'),JSON.stringify(result,null,2)+'\n');return result;
}
