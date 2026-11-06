/** Actual-device scenarios. Nothing runs until explicitly called with receipts. */
import assert from 'node:assert/strict';
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
export async function roundtrip({client,peer,state,output,saveState}) {
  const mobile=state.notes.at(-1);assert(mobile,'create synthetic mobile note first');
  const mobileFiles=state.files.filter(f=>/\.(png|wav)$/.test(f.name));
  await eventually(async()=>{const w=await peer.workspace();return w.notes.some(n=>n.id===mobile.id)&&mobileFiles.every(f=>w.attachments.some(a=>a.noteId===mobile.id&&a.displayName===f.name));},'mobile note and PNG/WAV at desktop');
  const fromMobile=[];
  for(const file of mobileFiles){const w=await peer.workspace(),attachment=w.attachments.find(a=>a.noteId===mobile.id&&a.displayName===file.name);fromMobile.push(await peer.verifyOriginal(attachment.id,file,'from-mobile'));}
  const marker='SYNC87-DESKTOP-'+state.runId,id=await peer.create(marker+' desktop real Session input');
  const attachmentIds=[];
  for(const file of state.desktopFiles)attachmentIds.push(await peer.addMedia(id,file));
  await eventually(async()=>{const w=await client.workspace();return w.notes.some(n=>n.id===id)&&attachmentIds.every(a=>w.attachments.some(x=>x.id===a));},'desktop note and PNG/WAV at native Store');
  const fromDesktop=[];
  for(let i=0;i<state.desktopFiles.length;i++)fromDesktop.push(await assertNativeOriginal(client,attachmentIds[i],state.desktopFiles[i]));
  await openNote(client,id);await client.wait('document.querySelector(".tiptap")?.innerText.includes('+JSON.stringify(marker)+')','actual desktop note visible');
  await client.wait('[...document.querySelectorAll(".tiptap img")].some(x=>x.complete&&x.naturalWidth>0)','synced image decode');
  await client.wait('[...document.querySelectorAll(".tiptap audio")].some(x=>Number.isFinite(x.duration)&&x.duration>0)','synced synthetic audio metadata');
  const originalExport=await saveImageOriginal(client,state,output,2,state.desktopFiles.find(f=>f.name.endsWith('.png')));
  state.desktopNote={id,marker,attachmentIds};await saveState(state);
  const result={mobileNoteId:mobile.id,desktopNoteId:id,fromMobile,fromDesktop,originalExport,desktopScope:'actual React/Tiptap desktop App DOM with real Rust Session/Store/network; browser OS/media boundaries simulated'};
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
