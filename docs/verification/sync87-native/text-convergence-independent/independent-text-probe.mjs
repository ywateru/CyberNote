import assert from 'node:assert/strict';
import {roundtrip,captureExpectedNote,noteReplicaMatches,waitForNoteReplica} from '/private/tmp/apple-notes-sync87-native/scripts/debug/sync87-native/scenarios.mjs';
const rid='d1e2f3a4b5',mid='11111111-1111-4111-8111-111111111111',did='22222222-2222-4222-8222-222222222222';
const marker='SYNC87-'+rid+'-1',dm='SYNC87-DESKTOP-'+rid;
const mobileFiles=['png','wav'].map(ext=>({name:'sync87-'+rid+'.'+ext})),desktopFiles=[{name:'sync87-desktop-'+rid+'.png'}];
const note=(id,text,files)=>({id,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]},...files.map((f,i)=>({type:'attachment',attrs:{id:id+'-media-'+i,name:f.name,kind:f.name.endsWith('png')?'image':'audio'}}))]}});
const mobile=note(mid,marker+'\nAndroid真实输入与保存',mobileFiles),desktop=note(did,dm+' desktop real Session input',desktopFiles);
const attachment=(id,files)=>files.map((f,i)=>({id:id+'-media-'+i,noteId:id,displayName:f.name}));
const ma=attachment(mid,mobileFiles),da=attachment(did,desktopFiles),clone=x=>structuredClone(x),checks=[];
const faults={missingEntity:()=>undefined,missingPlainText:n=>{delete n.plainText;return n},missingDocument:n=>{delete n.document;return n},wrongBody:n=>{n.plainText='wrong complete body';n.document.content[0].content[0].text=n.plainText;return n},truncatedPlain:n=>{n.plainText=n.plainText.slice(0,-1);return n},truncatedDocument:n=>{n.document.content[0].content[0].text=n.document.content[0].content[0].text.slice(0,-1);return n},changedStructure:n=>{n.document.content[0].type='heading';return n},missingAttachmentNode:n=>{n.document.content.pop();return n},wrongAttachmentAttribute:n=>{n.document.content[1].attrs.kind='wrong-kind';return n},extraDocumentField:n=>{n.document.unexpectedBody='extra-body';return n}};
async function boundary(direction,label,change){
 let created=false,mediaVerified=0,nativeReads=0,receiverReads=0;
 const mReceived=direction==='m'?change(clone(mobile)):clone(mobile),dReceived=direction==='d'?change(clone(desktop)):clone(desktop);
 const client={workspace:async()=>{if(created)receiverReads++;return{notes:[clone(mobile),...(created&&dReceived?[dReceived]:[])],attachments:[...ma,...(created?da:[])]}},readAttachment:async()=>{nativeReads++;throw Error('STOP_BEFORE_NATIVE_BYTE_READ')}};
 const peer={workspace:async()=>{if(!created)receiverReads++;return{notes:[...(mReceived?[mReceived]:[]),...(created?[clone(desktop)]:[])],attachments:[...ma,...(created?da:[])]}},verifyOriginal:async()=>{mediaVerified++;return{explicitStub:true}},create:async(text)=>{assert.equal(text,desktop.plainText);created=true;return did},addMedia:async()=>da[0].id};
 let error;try{await roundtrip({client,peer,state:{runId:rid,notes:[{id:mid,marker}],files:mobileFiles,desktopFiles},output:'/private/tmp/notes-sync87-native-text-independent-01',saveState:async()=>{throw Error('UNEXPECTED_RESULT_PUBLICATION')},convergenceTimeoutMs:1})}catch(e){error=e}
 assert(error);assert(receiverReads>0);
 if(direction==='positive'){assert.equal(error.message,'STOP_BEFORE_NATIVE_BYTE_READ');assert.equal(nativeReads,1);assert.equal(mediaVerified,2);assert(created)}
 else{assert.match(error.message,new RegExp('timed out: '+(direction==='m'?'mobile to desktop':'desktop to mobile')+' complete document/plainText and media'));assert.equal(nativeReads,0);assert.equal(created,direction==='d');assert.equal(mediaVerified,direction==='m'?0:2)}
 checks.push(direction+':'+label);
}
for(const direction of ['m','d'])for(const [label,change] of Object.entries(faults))await boundary(direction,label,change);
await boundary('positive','exact complete snapshots',x=>x);
const snapshot=captureExpectedNote({notes:[mobile]},mid,mobile.plainText);const changed=clone(mobile);changed.document.content[0].content[0].text='later mutation';assert(!noteReplicaMatches({notes:[changed]},snapshot));checks.push('snapshot compares complete body');
const mutable=clone(mobile),frozen=captureExpectedNote({notes:[mutable]},mid,mobile.plainText);mutable.document.content[1].attrs.kind='mutated';assert.equal(frozen.document.content[1].attrs.kind,'image');checks.push('snapshot clones attachment attributes');
for(const bad of [undefined,{...mobile,plainText:''},{...mobile,document:undefined},{...mobile,document:{type:'doc',content:[]}}]){assert.throws(()=>captureExpectedNote({notes:bad?[bad]:[]},mid,mobile.plainText));checks.push('invalid sender rejected')}
let reads=0;await waitForNoteReplica(async()=>({notes:[++reads===1?{...desktop,plainText:dm}:clone(desktop)],attachments:da}),captureExpectedNote({notes:[desktop]},did,desktop.plainText),desktopFiles,'independent transient',1000);assert.equal(reads,2);checks.push('transient prefix waits for complete exact body');
console.log(JSON.stringify({passed:checks.length,checks,scope:'host-only actual roundtrip with explicit workspace/media stubs; stops before native original read; no DOM, Rust, socket, ADB or device execution'}));
