/** Host-only actual openNote control flow and owner predicate; zero device ops. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {openNote} from './native-ui.mjs';
const id='256cf1ef-b7c6-4c1e-a8ab-31cb5e6be460';let checks=0;
async function scenario(owner){const actions=[];const client={read:async()=>false,tap:async s=>actions.push(s),wait:async(p,label)=>{if(label==='home navigation')return;const accepted=vm.runInNewContext(p,{document:{querySelector:s=>{assert.equal(s,'.app.mobile.page-editor [data-mobile-editor-note]');return owner?{dataset:{mobileEditorNote:owner}}:null;}}});if(!accepted)throw Error('STALE_OR_ABSENT_OWNER');}};let result=true;try{await openNote(client,id);}catch(e){assert.equal(e.message,'STALE_OR_ABSENT_OWNER');result=false;}assert.deepEqual(actions,['button.note-row[data-note-id="'+id+'"]']);checks++;return result;}
assert.equal(await scenario(id),true);checks++;assert.equal(await scenario('ec084619-e189-41a4-9c0b-b284da22ee4f'),false);checks++;assert.equal(await scenario(null),false);checks++;
await assert.rejects(()=>openNote({read:()=>{throw Error('must-not-read');}},'invalid'));checks++;
console.log(JSON.stringify({passed:checks,scope:'host-only actual openNote requires requested owner; stale desktop/absent editor rejected, normal tap count unchanged; no device/Store ops'}));
