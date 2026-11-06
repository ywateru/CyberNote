import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ownedImageControl} from '/private/tmp/apple-notes-sync87-native/scripts/debug/sync87-native/provider-touch.mjs';
const title='SYNC87-74da049123-1',id='0f515289-764d-460e-90ca-95637ebc3676';
function client({preview=true,titleText=title,disabled=false,occluded=false,fail=0}={}){
 const calls=[];const element={disabled,getBoundingClientRect:()=>({x:10,y:20,width:30,height:40}),contains:()=>false};
 return {calls,read:async expression=>vm.runInNewContext(expression,{document:{querySelector:q=>q==='.mobile.page-editor'?{}:q==='.tiptap h1'?{textContent:titleText}:null,querySelectorAll:q=>q===`.image-preview[data-preview-id="${id}"]`?(preview?[{}]:[]):[element],elementFromPoint:()=>occluded?{}:element},innerWidth:360,innerHeight:568,getComputedStyle:()=>({visibility:'visible',display:'block'})}),send:async(method,args)=>{calls.push([method,args]);if(calls.length===fail)throw Error('SECRET_NATIVE');}};
}
for(const action of ['open','info','save','close']){const c=client();await ownedImageControl(c,action);assert.deepEqual(c.calls.map(x=>x[1].type),['mousePressed','mouseReleased']);assert(c.calls.every(x=>x[0]==='Input.dispatchMouseEvent'));}
for(const args of [{preview:false},{titleText:'OTHER'},{disabled:true},{occluded:true}]){const c=client(args);await assert.rejects(ownedImageControl(c,'save'),e=>e.message==='owned image control refused'&&e.stage==='image-save-read'&&!e.cause);assert.equal(c.calls.length,0);}
const f=client({fail:1});await assert.rejects(ownedImageControl(f,'open'),e=>e.stage==='image-open-start'&&!String(e).includes('SECRET_NATIVE'));assert.equal(f.calls.length,1);
const invalid=client();await assert.rejects(ownedImageControl(invalid,'SECRET_ACTION'),e=>e.stage==='image-control'&&!String(e).includes('SECRET_ACTION'));assert.equal(invalid.calls.length,0);
console.log(JSON.stringify({ok:true,checks:10,scope:'source/host VM only; no runtime/device'}));
