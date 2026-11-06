// Original stage fixtures, adapted only for the new async DOM observation contract.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {textRoundtrip,desktopMedia,mobileInputText,desktopInputText,visibleSyntheticEditorExpression} from '../../../../scripts/debug/sync87-native/scenarios.mjs';
const out=resolve('docs/verification/sync87-native/text-media-visible-independent-recheck'),results=[];
const old=await readFile('docs/verification/sync87-native/text-media-stage-independent/check.mjs','utf8');
const originalFixture=old.slice(old.indexOf('async function fixture('),old.indexOf('\nawait test('));
const sha=x=>createHash('sha256').update(x).digest('hex'),mid='11111111-1111-4111-8111-111111111111',did='22222222-2222-4222-8222-222222222222',aids=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const note=(id,text)=>({id,plainText:text,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}});
const makeOriginal=new Function('assert','mkdir','resolve','sha','mid','did','aids','note','mobileInputText','desktopInputText','textRoundtrip','desktopMedia','out',originalFixture+'return fixture;')(assert,mkdir,resolve,sha,mid,did,aids,note,mobileInputText,desktopInputText,textRoundtrip,desktopMedia,out);
async function test(name,op){try{await op();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
function dom(editorElement,files,options={}){
 const box=(w=320,h=400)=>({x:10,y:10,width:w,height:h,right:10+w,bottom:10+h});
 const node=(parent=null)=>({parentElement:parent,style:{display:'block',visibility:'visible',opacity:'1'},getBoundingClientRect:()=>box()});
 const app=node(),owner=node(app),editor=node(owner);owner.dataset={mobileEditorNote:options.wrongOwner?mid:did};editor.closest=()=>owner;editor.getBoundingClientRect=()=>{const r=editorElement.getBoundingClientRect();return{...r,right:r.x+r.width,bottom:r.y+r.height};};
 const text=node(editor);text.innerText=editorElement.innerText;text.matches=()=>false;editor.children=[text];
 const cards=files.map((f,i)=>{const card=node(editor);card.dataset={attachmentId:options.wrongAttachment?'other-id':f.id};card.matches=()=>true;
  const control=node(card);if(options.hiddenControl)control.style.display='none';
  const element=node(card);element.complete=!options.badDecode;element.naturalWidth=options.badDecode?0:1;element.duration=options.badDecode?NaN:1;element.alt=options.wrongTitle?'wrong.png':f.name;
  const mime=i===0?'image/png':'audio/wav',bytes=options.swapSecondRead?Buffer.from('X'.repeat(f.bytes)):f.testBytes;
  element.src=element.currentSrc=options.blob?(options.foreignBlob?'blob:http://foreign/':'blob:http://tauri.localhost/')+i:'data:'+mime+';base64,'+bytes.toString('base64');
  card.querySelectorAll=kind=>kind===(i===0?'img':'audio')?[element]:[];
  card.querySelector=selector=>selector==='.image-open'||selector==='.audio-card'?control:selector==='.audio-title-toggle strong'?{textContent:options.wrongTitle?'wrong':f.name.replace(/\.[^.]+$/,'')}:null;
  return card;});
 editor.children.push(...cards);editor.querySelectorAll=selector=>selector==='.attachment-node[data-attachment-id]'?cards:[];
 app.querySelectorAll=selector=>selector==='[data-mobile-editor-note] .tiptap'?[editor]:[];
 const document={querySelectorAll:selector=>selector==='.app.mobile.page-editor'?[app]:[]};
 const evaluate=expression=>new Function('document','getComputedStyle','innerWidth','innerHeight','location','fetch','btoa','return '+expression)(document,e=>e.style,360,568,{origin:'http://tauri.localhost'},async src=>({arrayBuffer:async()=>{const i=Number(src.at(-1)),bytes=options.wrongBlobBytes?Buffer.from('wrong'):files[i].testBytes;return Uint8Array.from(bytes).buffer;}}),text=>Buffer.from(text,'binary').toString('base64'));
 return{evaluate,editor,owner,app,cards};
}
async function setup(label,options={}){
 const x=await makeOriginal(label,options),d=dom(x.editorElement,x.state.desktopFiles,options),oldWait=x.client.wait,originalRead=x.client.readAttachment,reads=new Map();
 x.client.wait=async(expression,label)=>{if(!expression.startsWith('(async()=>'))return oldWait(expression,label);x.calls.push({gate:label});if(!await d.evaluate(expression))throw Error('HOST_VISIBLE_GATE_REFUSED');};
 x.client.readAttachment=async id=>{const r=await originalRead(id),file=x.state.desktopFiles.find(f=>f.id===id),n=(reads.get(id)||0)+1;reads.set(id,n);return{...r,mime:file.name.endsWith('.png')?'image/png':'audio/wav',...(options.swapSecondRead&&n===2?{data:Buffer.from('X'.repeat(file.bytes)).toString('base64')}: {})};};return{x,d};
}
await test('Original hidden-text input rejected before save',async()=>{const{x}=await setup('original-text-hidden',{hidden:true});await assert.rejects(x.run(),/HOST_VISIBLE_GATE_REFUSED/);assert(!x.saved());});
await test('Original hidden-media input rejected before save',async()=>{const{x}=await setup('original-media-hidden',{media:true,hidden:true});await assert.rejects(x.run(),/HOST_VISIBLE_GATE_REFUSED/);assert(!x.saved());});
await test('Visible exact-owner full-text stage remains positive',async()=>{const{x}=await setup('text-positive');await x.run();assert(x.saved());});
await test('Visible exact-owner original-media stage remains positive',async()=>{const{x}=await setup('media-positive',{media:true});const r=await x.run();assert(r.decodedImageAndAudio);assert.equal(r.originals.length,2);assert(x.saved());});
await test('Owner attachment title control decode and blob bytes are bound to expected editor',async()=>{
 const{x}=await setup('expression-only',{media:true}),files=x.state.desktopFiles,expected={id:did,plainText:x.editorElement.innerText},media=files.map((f,i)=>({id:f.id,name:f.name,mime:i===0?'image/png':'audio/wav',data:f.testBytes.toString('base64')})),expression=visibleSyntheticEditorExpression(expected,media);
 assert.equal(await dom(x.editorElement,files,{blob:true}).evaluate(expression),true);
 for(const key of ['wrongOwner','wrongAttachment','wrongTitle','hiddenControl','badDecode','foreignBlob','wrongBlobBytes'])assert.equal(await dom(x.editorElement,files,{[key]:true,...(['foreignBlob','wrongBlobBytes'].includes(key)?{blob:true}:{})}).evaluate(expression),false,key);
});
await test('Different bytes in second native read must not become accepted DOM baseline',async()=>{const{x}=await setup('second-read-bytes',{media:true,swapSecondRead:true});await assert.rejects(x.run());assert(!x.saved());});
const result={status:results.every(r=>r.pass)?'PASS':'P2_FINDINGS',frozenAuthor:'a264945f',originalFixtureSha256:sha(originalFixture),originalHiddenInputsPreserved:true,results,hostOnly:true,adbCalls:0,deviceActions:0,syntheticOutputsOnly:true};await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:results.length,failed:results.filter(r=>!r.pass),adbCalls:0}));if(results.some(r=>!r.pass))process.exitCode=1;
