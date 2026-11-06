import assert from 'node:assert/strict';import vm from 'node:vm';
import {visibleSyntheticEditorExpression} from '/private/tmp/apple-notes-sync87-native/scripts/debug/sync87-native/scenarios.mjs';
const rect={x:0,y:0,width:20,height:20,right:20,bottom:20};
function run(blocks,document){const editor={parentElement:null,getBoundingClientRect:()=>rect,closest:()=>({dataset:{mobileEditorNote:'owner'}}),children:blocks.map(x=>({...x,matches:()=>false})),querySelectorAll:()=>[]};const app={parentElement:null,getBoundingClientRect:()=>rect,querySelectorAll:()=>[editor]};return vm.runInNewContext(visibleSyntheticEditorExpression({id:'owner',document}),{document:{querySelectorAll:()=>[app]},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),innerWidth:360,innerHeight:568});}
const doc={content:[{type:'paragraph',content:[{type:'text',text:'first'},{type:'hardBreak'},{type:'text',text:'second'}]},{type:'paragraph'}]};const body={tagName:'P',innerText:'first\nsecond',textContent:'firstsecond',children:[]},empty={tagName:'P',innerText:'\n',textContent:'',children:[{tagName:'BR'}]};
assert.equal(await run([body,empty],doc),true);
assert.equal(await run([body,{...empty,innerText:''}],doc),true);
for(const bad of [{...empty,innerText:'\n\n'},{...empty,innerText:' '},{...empty,textContent:'hidden'},{...empty,children:[{tagName:'SPAN'}]}])assert.equal(await run([body,bad],doc),false);
assert.equal(await run([{...body,innerText:'firstsecond'},empty],doc),false);
assert.equal(await run([empty,body],doc),false);
console.log(JSON.stringify({passed:8,scope:'hostVM only canonicalemptyparagraph/hardBreak/order/exacttext; no runtime/device'}));
