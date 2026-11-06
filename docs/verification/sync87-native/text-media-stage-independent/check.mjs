// New stages and real normal-UI helpers with synthetic Store/DOM/native-read boundaries.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {textRoundtrip,desktopMedia,mobileInputText,desktopInputText} from '../../../../scripts/debug/sync87-native/scenarios.mjs';
import {parseRequest} from '../../../../scripts/debug/sync87-native/protocol.mjs';
const out=resolve('docs/verification/sync87-native/text-media-stage-independent'),results=[];
const sha=x=>createHash('sha256').update(x).digest('hex');
const mid='11111111-1111-4111-8111-111111111111',did='22222222-2222-4222-8222-222222222222',aids=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const note=(id,text)=>({id,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}});
async function test(name,operation){try{await operation();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
async function fixture(label,{media=false,hidden=false,corrupt=false,imageDecoded=true,audioDecoded=true,wrongOwner=false}={}){
 const output=resolve(out,'synthetic-'+label);await mkdir(output);const calls=[],runId='a1b2c3d4e5',marker='SYNC87-'+runId+'-1',dm='SYNC87-DESKTOP-'+runId;
 const mobile=note(mid,mobileInputText(marker));let desktop=media?note(did,desktopInputText(dm)):null,editor=false,created=!!desktop;
 const files=['png','wav'].map((ext,i)=>{const bytes=Buffer.from('SYNTHETIC-'+ext);return{name:'sync87-desktop-'+runId+'.'+ext,bytes:bytes.length,sha256:sha(bytes),testBytes:bytes,id:aids[i]};});let attachments=[];
 const workspace=()=>({notes:[mobile,...(desktop?[desktop]:[])],attachments:attachments.map(a=>({...a,noteId:wrongOwner?mid:did}))});
 const editorElement={innerText:desktopInputText(dm),getBoundingClientRect:()=>({x:0,y:0,width:hidden?0:320,height:hidden?0:400})};
 const document={querySelector:selector=>{
  if(selector==='.preferences'||selector==='.image-preview')return null;
  if(selector==='.mobile.page-editor')return editor?{}:null;
  if(selector==='.mobile.page-notes .mobile-gallery')return !editor?{}:null;
  if(selector==='.mobile.page-editor .tiptap')return editor?editorElement:null;
  if(selector==='.tiptap')return editorElement;
  throw Error('unexpected synthetic selector '+selector);
 },querySelectorAll:selector=>selector==='.tiptap img'?[{complete:imageDecoded,naturalWidth:imageDecoded?1:0}]:selector==='.tiptap audio'?[{duration:audioDecoded?1:NaN}]:[]};
 const evaluate=expression=>new Function('document','return '+expression)(document);
 const client={workspace:async()=>structuredClone(workspace()),read:async expression=>evaluate(expression),tap:async selector=>{calls.push({tap:selector});if(selector.startsWith('button.note-row')){assert.equal(selector,'button.note-row[data-note-id="'+did+'"]');editor=true;}else if(selector==='button[aria-label="返回笔记"]')editor=false;else throw Error('unexpected host tap');},wait:async(expression,label)=>{calls.push({gate:label});if(!evaluate(expression))throw Error('HOST_GATE_REFUSED: '+label);},snapshot:async()=>calls.push({snapshot:true}),readAttachment:async id=>{const file=files.find(f=>f.id===id);assert(file);calls.push({original:id});return{data:(corrupt?Buffer.from('X'.repeat(file.bytes)):file.testBytes).toString('base64')};}};
 const peer={workspace:async()=>structuredClone(workspace()),create:async text=>{assert(!created);assert.equal(text,desktopInputText(dm));created=true;desktop=note(did,text);return did;},addMedia:async(id,file)=>{assert.equal(id,did);assert(files.includes(file));attachments.push({id:file.id,noteId:id,displayName:file.name});desktop.document.content.push({type:'attachment',attrs:{id:file.id}});return file.id;}};
 const state={runId,notes:[{id:mid,marker}],desktopFiles:files,...(media?{desktopNote:{id:did,marker:dm,attachmentIds:[]}}:{})};let saved=false;
 return{output,state,calls,client,peer,editorElement,run:()=> (media?desktopMedia:textRoundtrip)({client,peer,state,output,saveState:async()=>{saved=true;},convergenceTimeoutMs:1}),saved:()=>saved};
}
await test('Both new actions reject injected state/URI/path fields',async()=>{for(const action of ['textRoundtrip','desktopMedia']){assert.equal(parseRequest(Buffer.from(JSON.stringify({action}))).ok,true);for(const key of ['path','uri','document','noteId','invitation'])assert.equal(parseRequest(Buffer.from(JSON.stringify({action,[key]:'synthetic'}))).ok,false);}});
await test('Complete text positive normal UI path reaches scoped result',async()=>{const x=await fixture('text-positive'),r=await x.run();assert(r.mobileToDesktop.completeDocumentAndPlainTextVerified);assert(r.desktopToMobile.completeDocumentAndPlainTextVerified);assert(x.saved());assert(x.calls.some(c=>c.gate==='complete desktop text visible'));});
await test('P2 hidden text editor must not be accepted as visible',async()=>{const x=await fixture('text-hidden',{hidden:true});assert.equal(x.editorElement.getBoundingClientRect().width,0);await assert.rejects(x.run(),/visible|HOST_GATE_REFUSED/);});
await test('Two media originals length/SHA and decode gates succeed on exact synthetic boundaries',async()=>{const x=await fixture('media-positive',{media:true}),r=await x.run();assert.equal(r.originals.length,2);assert(r.decodedImageAndAudio);assert(x.saved());assert.equal(x.calls.filter(c=>c.original).length,2);});
await test('Corrupt original bytes refuse before save or UI proof',async()=>{const x=await fixture('media-corrupt',{media:true,corrupt:true});await assert.rejects(x.run());assert(!x.saved());assert(!x.calls.some(c=>c.snapshot));});
await test('Image and audio decode failures each refuse before save',async()=>{for(const kind of ['image','audio']){const x=await fixture('media-'+kind+'-failure',{media:true,imageDecoded:kind!=='image',audioDecoded:kind!=='audio'});await assert.rejects(x.run(),/HOST_GATE_REFUSED/);assert(!x.saved());}});
await test('Wrong attachment owner refuses before native original access',async()=>{const x=await fixture('media-wrong-owner',{media:true,wrongOwner:true});await assert.rejects(x.run());assert(!x.saved());assert(!x.calls.some(c=>c.original));});
await test('P2 hidden decoded media editor must not be accepted as visible',async()=>{const x=await fixture('media-hidden',{media:true,hidden:true});assert.equal(x.editorElement.getBoundingClientRect().width,0);await assert.rejects(x.run(),/visible|HOST_GATE_REFUSED/);});
const result={status:results.every(r=>r.pass)?'PASS':'P2_FINDINGS',frozenAuthor:'55296767',results,hostOnly:true,adbCalls:0,deviceActions:0,syntheticOutputsOnly:true,limits:'Real scenario/helper code with synthetic Store/DOM/native-read; no actual UI, media decoding, network, ownership runtime or device acceptance.'};await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:results.length,failed:results.filter(r=>!r.pass).map(r=>r.name),adbCalls:0}));if(results.some(r=>!r.pass))process.exitCode=1;
