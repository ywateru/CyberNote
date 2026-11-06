/** Host-only negative checks of separate text stage; stops before UI or output writes. */
import assert from 'node:assert/strict';
import {textRoundtrip,mobileInputText,desktopInputText} from './scenarios.mjs';
const id='11111111-1111-4111-8111-111111111111',did='22222222-2222-4222-8222-222222222222',runId='a1b2c3d4e5',marker='SYNC87-'+runId+'-1';
const note=(id,text)=>({id,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}});
const mobile=note(id,mobileInputText(marker)),desktop=note(did,desktopInputText('SYNC87-DESKTOP-'+runId));let passed=0;
for(const direction of ['exact','mobile-text','mobile-document','desktop-text','desktop-document']){
 let created=false;const receivingMobile=structuredClone(mobile),receivingDesktop=structuredClone(desktop);
 const change=n=>{if(direction.endsWith('text'))n.plainText=n.plainText.slice(0,-1);else n.document.content[0].type='heading';};
 if(direction.startsWith('mobile-'))change(receivingMobile);if(direction.startsWith('desktop-'))change(receivingDesktop);
 const client={workspace:async()=>({notes:created?[mobile,receivingDesktop]:[mobile],attachments:[]}),read:async()=>{throw Error('HOST_STOP_BEFORE_UI');}};
 const peer={workspace:async()=>({notes:created?[receivingMobile,desktop]:[receivingMobile],attachments:[]}),create:async text=>{assert.equal(text,desktop.plainText);created=true;return did;}};
 const state={runId,notes:[{id,marker}]};let failure;try{await textRoundtrip({client,peer,state,output:'/private/tmp/never-sync87-text-stage-host',saveState:async()=>{throw Error('HOST_MUST_NOT_WRITE');},convergenceTimeoutMs:1});}catch(e){failure=e;}
 assert(failure);assert.equal(failure.message,direction==='exact'?'HOST_STOP_BEFORE_UI':'timed out: '+(direction.startsWith('mobile-')?'mobile to desktop text':'desktop to mobile text')+' complete document/plainText and media');assert.equal(created,!direction.startsWith('mobile-'));assert.equal(state.desktopNote,undefined);passed++;
}
console.log(JSON.stringify({passed,scope:'host-only separate text stage full document/plainText negative gates; no UI, ADB, transport, process or result writes'}));
