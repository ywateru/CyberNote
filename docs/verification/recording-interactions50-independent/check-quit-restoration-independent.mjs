import assert from "node:assert/strict";
import {fixture,bridge,hashes} from "../../../scripts/check-recording-submit.mjs";
const results=[];
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const turn=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
async function test(name,fn){await fn();results.push({name,pass:true});}
for(const reason of ["suspended","operation","deleted","missing-note","replaced-instance","prior-readonly"]){
 await test(`matching cancellation preserves ${reason} authority/lifetime`,async()=>{
  const f=fixture({desktop:true}); if(reason==="prior-readonly")f.editor.setEditable(false);
  f.mountQuit();await f.quitHandler({payload:{id:"quit-restore"}});
  if(reason==="suspended")bridge.accessGate.state.suspended=["note-a"];
  if(reason==="operation")bridge.accessGate.state.operationId="new-real-barrier";
  if(reason==="deleted")f.env.wsRef.current.notes[0].deletedAt=1793743200000;
  if(reason==="missing-note")f.env.wsRef.current.notes=f.env.wsRef.current.notes.filter(n=>n.id!=="note-a");
  if(reason==="replaced-instance")f.env.editorsRef.current.set("note-a",{isDestroyed:false,isEditable:false});
  f.cancelQuit("quit-restore");
  assert.equal(f.editor.isEditable,false);
  assert.equal(f.env.quitState.current,null);assert.equal(f.env.appSurface.current.inert,false);
 });
}
await test("unfinished genuine PM draft composition rejects Quit and preserves pending body without lifecycle flush",async()=>{
 const wait=defer(),f=fixture({desktop:true,saveWait:wait});
 const writing=f.editSource("正在组字的草稿");await turn();
 const document=f.editor.getJSON();const pending=f.env.pendingDocs.current.get("note-a");
 assert(pending);f.editor.view.composing=true;let closed=0;
 f.env.ocrLifecycle.current.close=async()=>{closed++;};
 f.mountQuit();await f.quitHandler({payload:{id:"quit-ime-pending"}});
 assert.deepEqual(f.quitAcks,[{id:"quit-ime-pending",success:false}]);
 assert.equal(closed,0);assert.deepEqual(f.editor.getJSON(),document);
 assert.equal(f.env.pendingDocs.current.get("note-a"),pending);
 assert.equal(f.editor.isEditable,true);assert.equal(f.editor.view.composing,true);
 assert.equal(f.env.quitState.current,null);wait.resolve();await writing;
});
await test("cancellation while lifecycle awaits cannot allow its late completion to ACK a later generation",async()=>{
 const wait=defer(),f=fixture({desktop:true});f.mountQuit();
 f.env.ocrLifecycle.current.close=()=>wait.promise;
 const first=f.quitHandler({payload:{id:"quit-old"}});assert.equal(f.editor.isEditable,false);
 f.cancelQuit("quit-old");assert.equal(f.editor.isEditable,true);
 const second=f.quitHandler({payload:{id:"quit-new"}});assert.equal(f.editor.isEditable,false);
 f.cancelQuit("quit-old");assert.equal(f.editor.isEditable,false);
 wait.resolve();await Promise.all([first,second]);
 assert(!f.quitAcks.some(a=>a.id==="quit-old"&&a.success));
 assert(f.quitAcks.some(a=>a.id==="quit-new"&&a.success));
 assert.equal(f.env.quitState.current.id,"quit-new");assert.equal(f.editor.isEditable,false);
 f.cancelQuit("quit-new");assert.equal(f.editor.isEditable,true);
});
console.log(JSON.stringify({tests:results.length,results,sourceHashes:hashes,execution:"production App AST closures, actual SaveQueue/PM and SearchEditorGate; host refs/platform responses controlled",limitations:["No mounted DOM/real input method, native windows or device; composing flag verifies early cancellation leaves genuine PM draft/save queue unchanged."]},null,2));
