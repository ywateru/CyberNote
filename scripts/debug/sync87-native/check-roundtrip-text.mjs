#!/usr/bin/env node
/** Actual roundtrip function with explicit host stubs. No file/device/transport operation. */
import assert from 'node:assert/strict';
import { roundtrip,captureExpectedNote,noteReplicaMatches,mobileInputText,desktopInputText,waitForNoteReplica } from './scenarios.mjs';
const mobileId='11111111-1111-4111-8111-111111111111',desktopId='22222222-2222-4222-8222-222222222222';
const runId='a1b2c3d4e5',mobileMarker='SYNC87-'+runId+'-1',desktopMarker='SYNC87-DESKTOP-'+runId;
const files=[{name:'sync87-'+runId+'.png'},{name:'sync87-'+runId+'.wav'}],desktopFiles=[{name:'sync87-desktop-'+runId+'.png'}];
const state={runId,notes:[{id:mobileId,marker:mobileMarker}],files,desktopFiles};
const attachment=(id,noteId,file)=>({id,noteId,displayName:file.name});
const mobileAttachments=files.map((f,i)=>attachment('mobile-media-'+i,mobileId,f));
const desktopAttachments=desktopFiles.map((f,i)=>attachment('desktop-media-'+i,desktopId,f));
const node=text=>({type:'paragraph',content:[{type:'text',text}]});
const doc=(paragraphs,attachments)=>({type:'doc',content:[...paragraphs.map(node),...attachments.map(a=>({type:'attachment',attrs:{id:a.id,kind:a.displayName.endsWith('.png')?'image':'audio',name:a.displayName}}))]});
const mobile={id:mobileId,plainText:mobileInputText(mobileMarker),document:doc([mobileMarker,'Android真实输入与保存'],mobileAttachments)};
const desktop={id:desktopId,plainText:desktopInputText(desktopMarker),document:doc([desktopInputText(desktopMarker)],desktopAttachments)};
const malformed={
  missingPlain:n=>{delete n.plainText;},
  missingDocument:n=>{delete n.document;},
  empty:n=>{n.plainText='';n.document={type:'doc',content:[]};},
  wrong:n=>{n.plainText='unrelated wrong body';n.document=doc(['unrelated wrong body'],[]);},
  truncated:n=>{n.plainText=n.plainText.split(/\s/)[0];n.document=doc([n.plainText],[]);},
  truncatedPlainOnly:n=>{n.plainText=n.plainText.slice(0,-1);},
  truncatedDocumentOnly:n=>{n.document.content[0].content[0].text=n.document.content[0].content[0].text.slice(0,-1);},
  changedDocumentStructure:n=>{n.document.content[0].type='heading';n.document.content[0].attrs={level:1};},
  missingAttachmentDocumentNode:n=>{n.document.content=n.document.content.filter(c=>c.type!=='attachment');},
};
const checks=[];
for(const [label,mutate] of Object.entries(malformed))for(const original of [mobile,desktop]){
  const expected=captureExpectedNote({notes:[original]},original.id,original.plainText),received=structuredClone(original);mutate(received);
  assert.equal(noteReplicaMatches({notes:[received]},expected),false);checks.push('exact receiver predicate rejects '+label+' '+original.id);
}
const expected=captureExpectedNote({notes:[mobile]},mobile.id,mobile.plainText);mobile.document.content[0].attrs={hostSnapshotMutation:true};
assert.equal(expected.document.content[0].attrs,undefined);delete mobile.document.content[0].attrs;checks.push('sending full document snapshot is immutable after capture');
for(const original of [mobile,desktop]){
  assert.throws(()=>captureExpectedNote({notes:[]},original.id,original.plainText));checks.push('missing sending entity rejected '+original.id);
  const source=structuredClone(original);source.plainText=source.plainText.slice(0,-1);assert.throws(()=>captureExpectedNote({notes:[source]},original.id,original.plainText));checks.push('sending full intended text required '+original.id);
}
async function actualBoundary(direction,mutate) {
  let created=false,readOriginal=false,verifiedMobileMedia=0,receivingReads=0;
  const receivedMobile=structuredClone(mobile),receivedDesktop=structuredClone(desktop);
  if(mutate)mutate(direction==='mobile-to-desktop'?receivedMobile:receivedDesktop);
  const client={workspace:async()=>{if(created)receivingReads++;return {notes:created?[structuredClone(mobile),receivedDesktop]:[structuredClone(mobile)],attachments:[...mobileAttachments,...(created?desktopAttachments:[])]};},readAttachment:async()=>{readOriginal=true;throw Error('HOST_STOP_AFTER_BOTH_TEXT_GATES');}};
  const peer={workspace:async()=>{if(!created)receivingReads++;return {notes:created?[receivedMobile,structuredClone(desktop)]:[receivedMobile],attachments:[...mobileAttachments,...(created?desktopAttachments:[])]};},verifyOriginal:async()=>{verifiedMobileMedia++;return{explicitHostStub:true};},create:async text=>{assert.equal(text,desktop.plainText);created=true;return desktopId;},addMedia:async()=>desktopAttachments[0].id};
  let failure;
  try{await roundtrip({client,peer,state:structuredClone(state),output:'/private/tmp/notes-sync87-native-host-text-unused',saveState:async()=>{throw Error('NO_NATIVE_RESULT_PUBLICATION_ALLOWED');},convergenceTimeoutMs:10});}
  catch(error){failure=error;}
  assert(failure);assert(receivingReads>0,'actual receiving workspace was read');
  if(!mutate){assert.equal(failure.message,'HOST_STOP_AFTER_BOTH_TEXT_GATES');assert(created&&readOriginal);assert.equal(verifiedMobileMedia,2);}
  else{
    assert.equal(failure.message,'timed out: '+(direction==='mobile-to-desktop'?'mobile to desktop':'desktop to mobile')+' complete document/plainText and media');
    assert.equal(created,direction==='desktop-to-mobile');assert.equal(readOriginal,false);
    assert.equal(verifiedMobileMedia,direction==='mobile-to-desktop'?0:2);
  }
}
await actualBoundary('both',null);checks.push('actual roundtrip accepts both exact snapshots then stops before native original read');
for(const direction of ['mobile-to-desktop','desktop-to-mobile'])for(const [name,mutate] of Object.entries(malformed)){
  await actualBoundary(direction,mutate);checks.push('actual roundtrip rejects '+direction+' '+name+' before next acceptance stage');
}
let delayedReads=0;const delayedExpected=captureExpectedNote({notes:[desktop]},desktop.id,desktop.plainText);
await waitForNoteReplica(async()=>{delayedReads++;return {notes:[delayedReads===1?{...desktop,plainText:desktopMarker}:structuredClone(desktop)],attachments:desktopAttachments};},delayedExpected,desktopFiles,'host transient body',1000);
assert.equal(delayedReads,2);checks.push('transient incomplete receiver waits for full body without accepting a marker prefix');
console.log(JSON.stringify({passed:checks.length,checks,scope:'host-only actual roundtrip function with explicit workspace/media stubs and 10ms bounded negative convergence deadline; no file, byte, process, network, browser, Android, ADB or native acceptance'}));
