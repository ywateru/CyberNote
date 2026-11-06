/** Host-only exact expected block and unchanged media-boundary checks; no devices. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {visibleSyntheticEditorExpression} from './scenarios.mjs';
const expected={id:'known-owner',plainText:'Exact body',document:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'Exact body'}]},{type:'attachment',attrs:{id:'image'}},{type:'paragraph'}]}};
const media=[{id:'image',name:'known.png',mime:'image/png',data:'eA=='}];let checks=0;
function fixture(){
 const rect={x:10,y:10,width:100,height:30,right:110,bottom:40},base=()=>({parentElement:null,getBoundingClientRect:()=>rect});
 const blocks=[{...base(),tagName:'H1',innerText:'Exact body',textContent:'Exact body',children:[],matches:()=>false},{...base(),tagName:'P',innerText:'\n',textContent:'',children:[{tagName:'BR'}],matches:()=>false}];
 const image={...base(),complete:true,naturalWidth:1,alt:'known.png',currentSrc:'data:image/png;base64,eA=='};
 const card={...base(),dataset:{attachmentId:'image'},querySelectorAll:()=>[image],querySelector:()=>({...base()})};
 const editor={...base(),children:blocks,closest:()=>({dataset:{mobileEditorNote:'known-owner'}}),querySelectorAll:()=>[card]};
 const app={...base(),querySelectorAll:()=>[editor]};return{blocks,image,card,editor,app};
}
async function evaluate(change=()=>{},options={}){const f=fixture();change(f);const context={document:{querySelectorAll:()=>[f.app]},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible',opacity:'1'}),innerWidth:360,innerHeight:568,location:{origin:'http://tauri.localhost'}};return vm.runInNewContext(visibleSyntheticEditorExpression(options.expected||expected,options.media||media),context);}
assert.equal(await evaluate(),true);checks++;
for(const change of [f=>f.blocks[0].innerText='wrong',f=>f.blocks.pop(),f=>f.blocks.push({...f.blocks[1]}),f=>f.blocks[0].tagName='P',f=>f.blocks[0].tagName='H2',f=>f.blocks[1].innerText='unexpected',f=>{f.blocks[1].innerText='unexpected';f.blocks[1].textContent='unexpected';},f=>f.editor.closest=()=>({dataset:{mobileEditorNote:'other'}}),f=>f.image.currentSrc='data:image/png;base64,d3Jvbmc=',f=>f.image.complete=false,f=>f.image.naturalWidth=0,f=>f.card.hidden=true,f=>f.card.dataset.attachmentId='wrong']){assert.equal(await evaluate(change),false);checks++;}
assert.throws(()=>visibleSyntheticEditorExpression({...expected,document:{content:[{type:'heading',attrs:{level:7}}]}},[]));checks++;
assert.throws(()=>visibleSyntheticEditorExpression({...expected,document:{content:[{type:'blockquote'}]}},[]));checks++;
console.log(JSON.stringify({passed:checks,scope:'host-only actual expression VM, expected trailing empty paragraph/type/headinglevel/fulltext/owner/media source/decode/visibility negatives; no device operations'}));
