#!/usr/bin/env node
/** NDJSON native session; invitations accepted in stdin memory only. */
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { readRequests, actionFailure, guardFailureSummary } from './protocol.mjs';
import assert from 'node:assert/strict';
import { DesktopPeer } from './desktop-peer.mjs';
import { pairViaUI,observePairingUI,saveImageOriginal,openNote,goHome } from './native-ui.mjs';
import { textRoundtrip,desktopMedia,roundtrip,backgroundRoundtrip,coldBootPrepare,coldBootVerify,assertNativeOriginal } from './scenarios.mjs';
import { connect, guard, pause, parseNodes, nativeNode, assertHomeVisible, readNativeUI, nativeObservationEvents, SERIAL, AVD } from './client.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,x,i,a)=>{if(i%2===0)pairs.push([x,a[i+1]]);return pairs;},[]));
assert(Object.keys(options).every(x=>['--output','--receipt','--peer-receipt','--mode'].includes(x)),'unknown option');
assert(['prepare','serve'].includes(options['--mode']),'explicit --mode prepare|serve required');
const output=resolve(options['--output']||'');
assert(/^\/private\/tmp\/notes-sync87-native-[a-z0-9-]+$/.test(output),'new isolated /private/tmp/notes-sync87-native-* output required');
let context,peer;
const closeClient=async()=>{const owned=context;context=undefined;if(nativeObservationEvents.length)await appendFile(resolve(output,'native-client-events.jsonl'),JSON.stringify({events:nativeObservationEvents.splice(0)})+'\n');if(owned?.errors.length)await appendFile(resolve(output,'native-client-events.jsonl'),JSON.stringify({identity:owned.identity,events:owned.errors})+'\n');await owned?.close();};
async function prepare(){
  assert(!existsSync(output),'never replace a native evidence directory');await mkdir(output,{mode:0o700});
  const id=randomBytes(5).toString('hex'),remote='/sdcard/Download/notes-sync87-'+id;
  // A fixed valid PNG and deterministic PCM WAV: no microphone or user files.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4v4fhPwAHNAK7T5D0/QAAAABJRU5ErkJggg==','base64');
  const count=16000,pcm=Buffer.alloc(count*2);for(let i=0;i<count;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/16000)*8000),i*2);
  const wav=Buffer.alloc(44+pcm.length);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
  const files=[];
  for(const [ext,bytes] of [['png',png],['txt',Buffer.from('SYNC87 synthetic text attachment\n')],['wav',wav]]){
    const name=`sync87-${id}.${ext}`;await writeFile(resolve(output,name),bytes);files.push({name,path:resolve(output,name),remote:remote+'/'+name,sha256:hash(bytes),bytes:bytes.length});
  }
  const desktopFiles=[];
  for(const f of files.filter(f=>/\.(png|wav)$/.test(f.name))){
    const name='sync87-desktop-'+id+f.name.slice(f.name.lastIndexOf('.')),path=resolve(output,name);
    await writeFile(path,await readFile(f.path));desktopFiles.push({...f,name,path,remote:remote+'/'+name});
  }
  const state={version:1,serial:SERIAL,avd:AVD,runId:id,remote,files,desktopFiles,notes:[]};
  await writeFile(resolve(output,'state.json'),JSON.stringify(state,null,2)+'\n');return state;
}
async function state(){const s=JSON.parse(await readFile(resolve(output,'state.json'),'utf8'));assert.equal(s.serial,SERIAL);assert.equal(s.avd,AVD);assert.equal(s.version,1);return s;}
async function save(s){await writeFile(resolve(output,'state.json'),JSON.stringify(s,null,2)+'\n');}
async function app(){if(!context)context=await connect({receipt:options['--receipt']});return context;}
const chooserPackage=n=>['com.google.android.documentsui','com.android.documentsui'].includes(n.package);
const nativeText=(text,extra=()=>true)=>nativeNode(n=>chooserPackage(n)&&n.text===text&&extra(n));
async function chooserFiles(s,names,{multi=false}={}){
  let xml=await guard('uia');await writeFile(resolve(output,'chooser-'+Date.now()+'.xml'),xml);let nodes=parseNodes(xml);
  assert(nodes.some(chooserPackage),'actual Android DocumentsUI must be open');
  const folder=basename(s.remote);
  if(!nodes.some(n=>n.text===folder)){
    const root=nodes.find(n=>chooserPackage(n)&&/^(Show roots|显示根目录|显示侧栏|打开导航抽屉)$/.test(n['content-desc']||''));
    const downloadVisible=nodes.some(n=>chooserPackage(n)&&/^(Downloads|下载内容|下载)$/.test(n.text||'')&&n['resource-id']?.endsWith('/title'));
    if(root&&!downloadVisible)await nativeNode(n=>chooserPackage(n)&&n['content-desc']===root['content-desc']);
    xml=await guard('uia');await writeFile(resolve(output,'chooser-roots-'+Date.now()+'.xml'),xml);
    await nativeNode(n=>chooserPackage(n)&&/^(Downloads|下载内容|下载)$/.test(n.text||'')&&n['resource-id']?.endsWith('/title'));
  }
  await nativeText(folder);await pause(200);
  if(multi){
    await nativeNode(n=>chooserPackage(n)&&n.text===names[0],{hold:true});
    for(const name of names.slice(1))await nativeText(name);
    await nativeNode(n=>chooserPackage(n)&&(/^(Open|OPEN|打开|选择)$/.test(n.text||'')||/^(Open|打开)$/.test(n['content-desc']||'')));
  }else{assert.equal(names.length,1);await nativeText(names[0]);}
}
async function openFilePicker(c){
  if(!await c.read('!!document.querySelector(".menu-media[role=menu]")'))await c.tap('button[aria-label="添加附件"]');
  await c.wait('!!document.querySelector("[role=menu]")','attachment menu');
  await c.tap('[role="menu"] button','附加文件');
}
async function nativeStep(label,operation){
  assert(/^[a-z0-9-]+$/.test(label));const start=performance.now();
  await appendFile(resolve(output,'native-steps.jsonl'),JSON.stringify({step:label,phase:'start',time:new Date().toISOString()})+'\n');
  try{const value=await operation();await appendFile(resolve(output,'native-steps.jsonl'),JSON.stringify({step:label,phase:'pass',wallSeconds:(performance.now()-start)/1000})+'\n');return value;}
  catch(error){const safe=['read-only page evaluation failed','app WebView rectangle absent','different WebView hosts','different WebView rectangles','foreign WebView host','invalid WebView rectangle','unbalanced native XML'];const reason=safe.includes(error.message)?error.message:(error.stdout?'guard-command-failed':'unclassified-fixed-step-failure');if(label.startsWith('attachments-')&&typeof error.stdout==='string')await appendFile(resolve(output,'attachment-guard-failures.jsonl'),JSON.stringify({step:label,...guardFailureSummary(error.stdout)})+'\n');await appendFile(resolve(output,'native-steps.jsonl'),JSON.stringify({step:label,phase:'fail',reason,wallSeconds:(performance.now()-start)/1000})+'\n');throw error;}
}
async function persistedNote(c,id,expected=0){
  const end=Date.now()+15000;
  while(Date.now()<end){const w=await c.workspace();const n=w.notes.find(n=>n.id===id);const attachments=w.attachments.filter(a=>a.noteId===id);if(n&&attachments.length>=expected&&n.revision>0)return{note:n,attachments};await pause(150);}
  throw Error('native Store did not confirm expected note and attachments');
}
async function execute(request){
  assert(request&&typeof request==='object'&&typeof request.action==='string');
  assert(Object.keys(request).every(k=>['action','requestId',...(request.action==='pair'?['invitation']:[])].includes(k)),'unknown action field');
  assert(request.requestId===undefined || typeof request.requestId==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(request.requestId),'bounded nonsensitive requestId required');
  const s=await state();
  switch(request.action){
    case 'install':assert(Object.keys(request).every(k=>['action','requestId'].includes(k)));return guard('install',{receipt:options['--receipt']});
    case 'start':assert(Object.keys(request).every(k=>['action','requestId'].includes(k)));return guard('start',{receipt:options['--receipt']});
    case 'pushFixtures':for(const f of s.files){assert.equal(hash(await readFile(f.path)),f.sha256);await guard('push',{'run-state':resolve(output,'state.json'),path:f.path,remote:f.remote});}return s.files.map(({name,sha256,bytes})=>({name,sha256,bytes}));
    case 'home':{
      const c=await app();await goHome(c);await c.wait('!!document.querySelector(".mobile.page-notes .mobile-gallery")','direct gallery');
      const view=assertHomeVisible(await c.read(`(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};const g=document.querySelector('.mobile-gallery'),a=document.querySelector('.mobile-add-note');return{app:document.querySelector('.app').className,viewport:{width:innerWidth,height:innerHeight},gallery:rect(g),galleryDisplay:getComputedStyle(g).display,galleryVisibility:getComputedStyle(g).visibility,editor:rect(document.querySelector('.tiptap')),add:rect(a),addColor:getComputedStyle(a).backgroundColor,columns:getComputedStyle(g).gridTemplateColumns}})()`));
      await c.snapshot(output,'home-visible-final');return view;
    }
    case 'createNote':{
      const c=await app();await goHome(c);const marker=`SYNC87-${s.runId}-${s.notes.length+1}`;
      await c.nativeTap('button.mobile-add-note[aria-label="新建备忘录"]');
      await c.wait('document.activeElement===document.querySelector(".tiptap[contenteditable=true]")','automatic editor focus');
      assert(/mInputShown=true/.test(await guard('ime')),'actual Android keyboard did not open');
      await c.insert(marker+'\nAndroid真实输入与保存');
      await pause(400);const w=await c.workspace();const note=w.notes.find(n=>n.title===marker);assert(note,'actual input must reach native Store');assert(note.revision>0);s.notes.push({id:note.id,marker});await save(s);
      await c.snapshot(output,'editor-'+s.notes.length);return {id:note.id,marker,revision:note.revision};
    }
    case 'attachments':{
      const c=await app();const owner=s.notes.at(-1);assert(owner,'create test note first');
      const current=await c.read('({editor:!!document.querySelector(".mobile.page-editor"),title:document.querySelector(".tiptap h1")?.textContent})');
      if(!current.editor||current.title!==owner.marker)await nativeStep('attachments-open-note',()=>openNote(c,owner.id));
      if(/mInputShown=true/.test(await guard('ime'))){await guard('back');await pause(200);} // close actual IME only
      const before=await persistedNote(c,owner.id);await nativeStep('attachments-open-cancel',()=>openFilePicker(c));await nativeStep('attachments-cancel',()=>guard('back'));await pause(300);
      assert.equal((await persistedNote(c,owner.id)).attachments.length,before.attachments.length,'cancel must add no attachment');
      await nativeStep('attachments-open-multiple',()=>openFilePicker(c));await nativeStep('attachments-choose-multiple',()=>chooserFiles(s,[s.files[0].name,s.files[1].name],{multi:true}));
      const two=await persistedNote(c,owner.id,before.attachments.length+2);
      await c.wait('!![...document.querySelectorAll(".tiptap img")].find(x=>x.complete&&x.naturalWidth>0)','decoded native image');
      await nativeStep('attachments-open-continuous',()=>openFilePicker(c));await nativeStep('attachments-choose-continuous',()=>chooserFiles(s,[s.files[2].name]));const three=await persistedNote(c,owner.id,before.attachments.length+3);
      for(const file of s.files)assert(three.attachments.some(a=>a.displayName===file.name),'selected original filename must persist');
      await c.snapshot(output,'attachments');return {cancelPreserved:true,multipleCount:two.attachments.length,continuousCount:three.attachments.length,names:three.attachments.map(x=>x.displayName)};
    }
    case 'attachmentsRecentMultiple': {
      const owner=s.notes.at(-1);assert(owner);await nativeStep('attachments-recent-multiple',async()=>{
        let nodes=parseNodes(await readNativeUI());assert(nodes.some(chooserPackage));
        if(!nodes.some(n=>chooserPackage(n)&&n.text==='Recent'&&n['resource-id']?.endsWith('/title')))await nativeNode(n=>chooserPackage(n)&&n['content-desc']==='Show roots');
        await nativeNode(n=>chooserPackage(n)&&n.text==='Recent'&&n['resource-id']?.endsWith('/title'));
        await nativeNode(n=>chooserPackage(n)&&n.text===s.files[0].name,{hold:true});await nativeText(s.files[1].name);
        await nativeNode(n=>chooserPackage(n)&&(/^(Open|OPEN|打开|选择)$/.test(n.text||'')||/^(Open|打开)$/.test(n['content-desc']||'')));
      });const c=await app(),actual=await persistedNote(c,owner.id,2);assert.equal(actual.attachments.length,2);for(const f of s.files.slice(0,2))assert(actual.attachments.some(a=>a.displayName===f.name));return{count:2,names:actual.attachments.map(a=>a.displayName)};
    }
    case 'attachmentsChooseMultiple': {
      const owner=s.notes.at(-1);assert(owner);await nativeStep('attachments-existing-chooser-multiple',()=>chooserFiles(s,s.files.slice(0,2).map(f=>f.name),{multi:true}));
      const c=await app(),actual=await persistedNote(c,owner.id,2);assert.equal(actual.attachments.length,2);for(const f of s.files.slice(0,2))assert(actual.attachments.some(a=>a.displayName===f.name));return{count:2,names:actual.attachments.map(a=>a.displayName)};
    }
    case 'attachmentsOpen': {
      const c=await app(),owner=s.notes.at(-1);assert(owner);const current=await c.read('({editor:!!document.querySelector(".mobile.page-editor"),title:document.querySelector(".tiptap h1")?.textContent})');
      if(!current.editor||current.title!==owner.marker)await openNote(c,owner.id);if(/mInputShown=true/.test(await guard('ime'))){await guard('back');await pause(200);}
      const before=await persistedNote(c,owner.id);await nativeStep('attachments-open-only',()=>openFilePicker(c));return{opened:true,beforeCount:before.attachments.length};
    }
    case 'attachmentsMultiple':
    case 'attachmentsAudio': {
      const c=await app(),owner=s.notes.at(-1);assert(owner);const current=await c.read('({editor:!!document.querySelector(".mobile.page-editor"),title:document.querySelector(".tiptap h1")?.textContent})');
      if(!current.editor||current.title!==owner.marker)await nativeStep('attachments-resume-note',()=>openNote(c,owner.id));
      if(/mInputShown=true/.test(await guard('ime'))){await guard('back');await pause(200);}
      const files=request.action==='attachmentsMultiple'?s.files.slice(0,2):[s.files[2]];
      const before=await persistedNote(c,owner.id);assert(files.every(f=>!before.attachments.some(a=>a.displayName===f.name)),'never select an already persisted fixture');
      await nativeStep('attachments-resume-open',()=>openFilePicker(c));
      await nativeStep('attachments-resume-choose',()=>chooserFiles(s,files.map(f=>f.name),{multi:files.length>1}));
      const after=await persistedNote(c,owner.id,before.attachments.length+files.length);for(const f of files)assert(after.attachments.some(a=>a.displayName===f.name));
      return{names:files.map(f=>f.name),count:after.attachments.length};
    }
    case 'attachmentsVerify': {
      const c=await app(),owner=s.notes.at(-1);assert(owner);await openNote(c,owner.id);const actual=await persistedNote(c,owner.id,3);assert.equal(actual.attachments.length,3);
      for(const file of s.files){const a=actual.attachments.find(a=>a.displayName===file.name);assert(a);await assertNativeOriginal(c,a.id,file);}
      await c.wait('!![...document.querySelectorAll(".tiptap img")].find(x=>x.complete&&x.naturalWidth>0)','actual native image decoded');await c.snapshot(output,'attachments-complete');return{count:3,originalsVerified:true};
    }
    case 'exportImage':assert(s.notes.length);await openNote(await app(),s.notes.at(-1).id);return saveImageOriginal(await app(),s,output,1,s.files.find(f=>f.name.endsWith('.png')));
    case 'pair':await pairViaUI(await app(),request.invitation,{step:nativeStep});await(await app()).snapshot(output,'paired');return{paired:true};
    case 'connectDesktop':{
      assert(!peer,'desktop peer already running');assert(typeof options['--peer-receipt']==='string','root peer receipt required');
      peer=await DesktopPeer.open(options['--peer-receipt'],output,s.runId);const address=await peer.host();
      let invitation=await peer.invitation(address.endpoint);
      try{await pairViaUI(await app(),invitation,{step:nativeStep});}catch(error){try{await writeFile(resolve(output,'pair-ui-failure-'+Date.now()+'.json'),JSON.stringify(await observePairingUI(await app()),null,2)+'\n');}catch{}throw error;}finally{invitation=undefined;}
      await(await app()).snapshot(output,'paired-desktop');return{paired:true,endpoint:address.endpoint,desktopPid:peer.backend.pid};
    }
    case 'textRoundtrip':assert(peer);return textRoundtrip({client:await app(),peer,state:s,output,saveState:save});
    case 'desktopMedia':assert(peer);return desktopMedia({client:await app(),peer,state:s,output,saveState:save});
    case 'roundtrip':assert(peer);return roundtrip({client:await app(),peer,state:s,output,saveState:save});
    case 'backgroundRoundtrip':assert(peer);return backgroundRoundtrip({client:await app(),closeClient,getClient:app,peer,state:s,output,receipt:options['--receipt']});
    case 'coldBootPrepare':return coldBootPrepare({client:await app(),closeClient,state:s,output});
    case 'coldBootVerify':return coldBootVerify({getClient:app,state:s,output,receipt:options['--receipt']});
    case 'observe':{const c=await app();const w=await c.workspace();return{notes:w.notes,attachments:w.attachments,identity:c.identity};}
    case 'background':{await guard('home');return{backgrounded:true};}
    case 'foreground':{await guard('start',{receipt:options['--receipt']});return{foregrounded:true};}
    case 'reopen':{
      const c=await app();await goHome(c);const before=await c.workspace(),oldIdentity=c.identity;await closeClient();await guard('stop');await guard('start',{receipt:options['--receipt']});await pause(500);const after=await(await app()).workspace();assert(context.identity.pid!==oldIdentity.pid||context.identity.startTicks!==oldIdentity.startTicks,'new native app lifetime required');
      for(const own of [...s.notes,...(s.desktopNote?[s.desktopNote]:[])]){
        assert.deepEqual(after.notes.find(n=>n.id===own.id)?.document,before.notes.find(n=>n.id===own.id)?.document);
        assert.deepEqual(after.attachments.filter(a=>a.noteId===own.id),before.attachments.filter(a=>a.noteId===own.id));
        for(const attachment of after.attachments.filter(a=>a.noteId===own.id)){const file=[...s.files,...s.desktopFiles].find(f=>f.name===attachment.displayName);assert(file);await assertNativeOriginal(context,attachment.id,file);}
      }
      await(await app()).snapshot(output,'reopened');return{sameNativeData:true,notes:s.notes.length,identity:context.identity};
    }
    case 'close':await closeClient();if(peer){await peer.close();peer=undefined;}return{closed:true};
    default:throw Error('unsupported native acceptance action');
  }
}
if(options['--mode']==='prepare')console.log(JSON.stringify({ok:true,prepared:await prepare()}));
else{
  assert(typeof options['--receipt']==='string'&&options['--receipt'].startsWith('/'),'root receipt required');await state();
  try {
    for await (const parsed of readRequests(process.stdin)) {
      const start=performance.now();
      if (!parsed.ok) { console.log(JSON.stringify({...parsed,wallSeconds:(performance.now()-start)/1000}));process.exitCode=2;break; }
      const request=parsed.request;
      try {
        const result=await execute(request);
        console.log(JSON.stringify({requestId:request.requestId,ok:true,action:request.action,wallSeconds:(performance.now()-start)/1000,result}));
      } catch {
        console.log(JSON.stringify({...actionFailure(request),wallSeconds:(performance.now()-start)/1000}));process.exitCode=2;break;
      }
    }
  } catch {
    console.log(JSON.stringify({ok:false,error:'INPUT_READ_FAILED',message:'Native input stream failed; no input or exception recorded'}));process.exitCode=2;
  } finally {
    try { await closeClient(); }
    catch { console.log(JSON.stringify({ok:false,error:'CLEANUP_FAILED',message:'Native cleanup failed; no input or exception recorded'}));process.exitCode=2; }
    try { await peer?.close(); }
    catch { console.log(JSON.stringify({ok:false,error:'PEER_CLEANUP_FAILED',message:'Peer cleanup failed; no input or exception recorded'}));process.exitCode=2; }
  }
}
