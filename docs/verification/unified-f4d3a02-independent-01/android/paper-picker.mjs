import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connect,snapshot,tap,pause,save,run,log,out,store} from './runtime-probe.mjs';
const c=await connect();
try{
 const base=JSON.parse(readFileSync(out+'/16-paper-prepared.json'));
 const held=await c.call('Runtime.evaluate',{expression:`(()=>{const dom=document.querySelector('.tiptap'),editor=dom.editor;return{dom,editor,view:editor.view}})()`,objectGroup:'independent-media-paper',returnByValue:false});
 const checks=[];
 const check=async(s,panel)=>{assert.deepEqual(s.document,base.document);assert.deepEqual(s.selection,base.selection);assert.deepEqual(s.keyed,base.keyed);assert.equal(s.editable,!panel);assert.equal(s.imeShown,false);assert.equal(!!s.sheet,panel);const r=await c.call('Runtime.callFunctionOn',{objectId:held.result.objectId,returnByValue:true,functionDeclaration:`function(){const d=document.querySelector('.tiptap');return{dom:this.dom===d,editor:this.editor===d?.editor,view:this.view===d?.editor?.view}}`});assert.deepEqual(r.result.value,{dom:true,editor:true,view:true});checks.push({at:s.capturedAt,panel,identity:r.result.value,selection:s.selection,keyed:s.keyed,editable:s.editable,imeShown:s.imeShown});if(panel)assert.equal(s.paper.find(p=>p.selected)?.style,'grid-large')};
 await tap(c,'button[aria-label="更多"]',undefined,'17-more');const opened=await tap(c,'button.menu-row','横线与网格','18-paper-picker');await check(opened,true);
 const cancelled=await tap(c,'.modal-paper .sheet-top button','取消','19-paper-cancel');await check(cancelled,false);
 await tap(c,'button[aria-label="更多"]',undefined,'20-more-reopen');const reopened=await tap(c,'button.menu-row','横线与网格','21-paper-reopened');await check(reopened,true);
 log({op:'native-back',name:'22-paper-picker-back'});run('shell','input','keyevent','4');await pause(500);await check(await snapshot(c,'22-paper-picker-back'),false);
 save('23-paper-picker-result',{checks,allPassed:true,paperNotChanged:true});
 await store(c,'24-after-paper-store');console.log(JSON.stringify(checks,null,2));
}catch(error){save('paper-picker-failure',{message:error.message,stack:error.stack});await snapshot(c,'paper-picker-failure-state');throw error}finally{await c.close()}
