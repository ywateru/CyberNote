#!/usr/bin/env node
/** NDJSON native session; invitations accepted in stdin memory only. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { readRequests, actionFailure } from './protocol.mjs';
import assert from 'node:assert/strict';
import { connect, guard, pause, parseNodes, nativeNode, SERIAL, AVD } from './client.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,x,i,a)=>{if(i%2===0)pairs.push([x,a[i+1]]);return pairs;},[]));
assert(Object.keys(options).every(x=>['--output','--receipt','--mode'].includes(x)),'unknown option');
assert(['prepare','serve'].includes(options['--mode']),'explicit --mode prepare|serve required');
const output=resolve(options['--output']||'');
assert(/^\/private\/tmp\/notes-sync87-native-[a-z0-9-]+$/.test(output),'new isolated /private/tmp/notes-sync87-native-* output required');
let context;
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
  const state={version:1,serial:SERIAL,avd:AVD,runId:id,remote,files,notes:[]};
  await writeFile(resolve(output,'state.json'),JSON.stringify(state,null,2)+'\n');return state;
}
async function state(){const s=JSON.parse(await readFile(resolve(output,'state.json'),'utf8'));assert.equal(s.serial,SERIAL);assert.equal(s.avd,AVD);assert.equal(s.version,1);return s;}
async function save(s){await writeFile(resolve(output,'state.json'),JSON.stringify(s,null,2)+'\n');}
async function app(){if(!context)context=await connect({receipt:options['--receipt']});return context;}
const chooserPackage=n=>['com.google.android.documentsui','com.android.documentsui'].includes(n.package);
const nativeText=(text,extra=()=>true)=>nativeNode(n=>chooserPackage(n)&&n.text===text&&extra(n));
async function chooserFiles(s,names,{multi=false}={}){
  let nodes=parseNodes(await guard('uia'));
  assert(nodes.some(chooserPackage),'actual Android DocumentsUI must be open');
  const folder=basename(s.remote);
  if(!nodes.some(n=>n.text===folder)){
    const root=nodes.find(n=>chooserPackage(n)&&/^(Show roots|显示根目录|显示侧栏|打开导航抽屉)$/.test(n['content-desc']||''));
    if(root)await nativeNode(n=>chooserPackage(n)&&n['content-desc']===root['content-desc']);
    await nativeNode(n=>chooserPackage(n)&&/^(Downloads|下载内容|下载)$/.test(n.text||'')&&n.clickable==='true');
  }
  await nativeText(folder);await pause(200);
  if(multi){
    await nativeNode(n=>chooserPackage(n)&&n.text===names[0],{hold:true});
    for(const name of names.slice(1))await nativeText(name);
    await nativeNode(n=>chooserPackage(n)&&(/^(Open|OPEN|打开|选择)$/.test(n.text||'')||/^(Open|打开)$/.test(n['content-desc']||'')));
  }else{assert.equal(names.length,1);await nativeText(names[0]);}
}
async function openFilePicker(c){
  await c.tap('button[aria-label="添加附件"]');
  const point=await c.read(`(()=>{const a=[...document.querySelectorAll('[role="menu"] button')].filter(e=>e.textContent.trim()==='附加文件');if(a.length!==1)throw Error('file action absent');const r=a[0].getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
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
    case 'pushFixtures':for(const f of s.files){assert.equal(hash(await readFile(f.path)),f.sha256);await guard('push',{path:f.path,remote:f.remote});}return s.files.map(({name,sha256,bytes})=>({name,sha256,bytes}));
    case 'home':{
      const c=await app();await c.wait('!!document.querySelector(".mobile.page-notes .mobile-gallery")','direct gallery');
      const columns=await c.read('getComputedStyle(document.querySelector(".mobile-gallery")).gridTemplateColumns');assert.equal(columns.trim().split(/\s+/).length,2,'two real gallery columns');
      const add=await c.read('(()=>{const b=document.querySelector(".mobile-add-note");const r=b.getBoundingClientRect();return {visible:r.width>=44&&r.height>=44,color:getComputedStyle(b).backgroundColor}})()');assert(add.visible);assert.equal(add.color,'rgb(255, 188, 0)');
      await c.snapshot(output,'home');return{columns,add};
    }
    case 'createNote':{
      const c=await app();const marker=`SYNC87-${s.runId}-${s.notes.length+1}`;
      await c.nativeTap('button.mobile-add-note[aria-label="新建备忘录"]');
      await c.wait('document.activeElement===document.querySelector(".tiptap[contenteditable=true]")','automatic editor focus');
      assert(/mInputShown=true/.test(await guard('ime')),'actual Android keyboard did not open');
      await c.insert(marker+'\nAndroid真实输入与保存');
      await pause(400);const w=await c.workspace();const note=w.notes.find(n=>n.title===marker);assert(note,'actual input must reach native Store');assert(note.revision>0);s.notes.push({id:note.id,marker});await save(s);
      await c.snapshot(output,'editor-'+s.notes.length);return {id:note.id,marker,revision:note.revision};
    }
    case 'attachments':{
      const c=await app();const owner=s.notes.at(-1);assert(owner,'create test note first');
      if(/mInputShown=true/.test(await guard('ime'))){await guard('back');await pause(200);} // close actual IME only
      await openFilePicker(c);const before=await persistedNote(c,owner.id);await guard('back');await pause(300);
      assert.equal((await persistedNote(c,owner.id)).attachments.length,before.attachments.length,'cancel must add no attachment');
      await openFilePicker(c);await chooserFiles(s,[s.files[0].name,s.files[1].name],{multi:true});
      const two=await persistedNote(c,owner.id,before.attachments.length+2);
      await c.wait('!![...document.querySelectorAll(".tiptap img")].find(x=>x.complete&&x.naturalWidth>0)','decoded native image');
      await openFilePicker(c);await chooserFiles(s,[s.files[2].name]);const three=await persistedNote(c,owner.id,before.attachments.length+3);
      for(const file of s.files)assert(three.attachments.some(a=>a.displayName===file.name),'selected original filename must persist');
      await c.snapshot(output,'attachments');return {cancelPreserved:true,multipleCount:two.attachments.length,continuousCount:three.attachments.length,names:three.attachments.map(x=>x.displayName)};
    }
    case 'exportImage':{
      const c=await app();const file=s.files[0];await c.tap('button.image-open');await c.wait('!!document.querySelector(".image-preview")','image preview');await c.tap('.image-preview [aria-label="图片信息"]');await c.snapshot(output,'image-info');
      await c.tap('.image-preview .save-image');await nativeNode(n=>chooserPackage(n)&&n['resource-id']==='com.android.documentsui:id/action_menu_select'||chooserPackage(n)&&/^(SAVE|Save|保存)$/.test(n.text||''));
      await c.wait('document.querySelector(".image-preview")?.innerText.includes("图片已保存")','native export acknowledgement');
      // Resolve actual saved Downloads path through chooser before claiming byte equality.
      return{savedUI:true,expected:{name:file.name,sha256:file.sha256},originalBytesVerified:false};
    }
    case 'pair':{
      assert(typeof request.invitation==='string'&&request.invitation.length>0&&request.invitation.length<=16384);
      const c=await app();await c.tap('button[aria-label="设置"]');await c.tap('#preferences-tab-data');await c.fill('input[aria-label="同步设备名称"]','SYNC87 Android');
      const tapText=async text=>{const p=await c.read(`(()=>{const a=[...document.querySelectorAll('.sync-settings button')].filter(e=>e.textContent.trim()===${JSON.stringify(text)});if(a.length!==1)throw Error('sync button absent');const r=a[0].getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
      await tapText('加入同步');await c.fill('input[aria-label="粘贴完整配对串"]',request.invitation);await tapText('连接并加入');
      // Pair can take27s: terminal UI rather than a fixed short timeout.
      await c.wait('!!document.querySelector(".sync-peer") && !document.querySelector(".sync-pair")','native actual UI pairing',40000);
      await c.tap('button[aria-label="关闭设置"]');await c.snapshot(output,'paired');return{paired:true};
    }
    case 'observe':{const c=await app();const w=await c.workspace();return{notes:w.notes,attachments:w.attachments,identity:c.identity};}
    case 'background':{await guard('home');return{backgrounded:true};}
    case 'foreground':{await guard('start',{receipt:options['--receipt']});return{foregrounded:true};}
    case 'reopen':{
      const c=await app(),before=await c.workspace();await c.close();context=undefined;await guard('stop');await guard('start',{receipt:options['--receipt']});await pause(500);const after=await(await app()).workspace();
      for(const own of s.notes){assert.deepEqual(after.notes.find(n=>n.id===own.id)?.document,before.notes.find(n=>n.id===own.id)?.document);assert.deepEqual(after.attachments.filter(a=>a.noteId===own.id),before.attachments.filter(a=>a.noteId===own.id));}
      await(await app()).snapshot(output,'reopened');return{sameNativeData:true,notes:s.notes.length,identity:context.identity};
    }
    case 'close':await context?.close();context=undefined;return{closed:true};
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
    try { await context?.close(); }
    catch { console.log(JSON.stringify({ok:false,error:'CLEANUP_FAILED',message:'Native cleanup failed; no input or exception recorded'}));process.exitCode=2; }
  }
}
