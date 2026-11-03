import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connect,snapshot,tap,pause,save,run,log,out} from './runtime-probe.mjs';
const c=await connect();
try{
 await tap(c,'button.back-button','备忘录','10-media-to-list');
 const paper=await tap(c,'button.note-row','QA-PAPER-INDEPENDENT-20261103C2026/11/3Alpha Beta Gamma','11-paper-reopen');
 const initial=JSON.parse(readFileSync(out+'/02-baseline-store.json')).notes.find(n=>n.id==='1a0718dd-c71c-4192-89b6-bd58cb9ba475');
 assert.deepEqual(paper.document,initial.document);assert.equal(paper.audio.length,0);assert(paper.keyed.some(k=>k.key.startsWith(initial.id)));
 const point=await c.read(`(()=>{const e=[...document.querySelectorAll('.tiptap strong')].find(e=>e.textContent==='Beta');const r=e.getBoundingClientRect();return[(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio+83]})()`);
 log({op:'native-long-press',point});run('shell','input','swipe',...point.map(Math.round).map(String),...point.map(Math.round).map(String),'650');await pause(600);
 const selected=await snapshot(c,'12-paper-selected');assert.equal(selected.domSelection,'Beta');assert.deepEqual(selected.selection,{type:'text',anchor:39,head:43});
 const formatted=await tap(c,'button[aria-label="格式"]',undefined,'13-format-open');assert.deepEqual(formatted.document,initial.document);assert.deepEqual(formatted.selection,selected.selection);
 const closed=await tap(c,'button[aria-label="关闭格式"]',undefined,'14-format-close');
 log({op:'native-back',name:'15-keyboard-close'});run('shell','input','keyevent','4');await pause(500);const back=await snapshot(c,'15-keyboard-close');assert.equal(back.imeShown,false);assert.deepEqual(back.selection,selected.selection);
 save('16-paper-prepared',{document:back.document,selection:back.selection,keyed:back.keyed,editable:back.editable});
 console.log(JSON.stringify({selection:back.selection,ime:back.imeShown,buttons:back.buttons.map(b=>({text:b.text,label:b.label}))},null,2));
}catch(error){save('paper-smoke-failure',{message:error.message,stack:error.stack});await snapshot(c,'paper-smoke-failure-state');throw error}finally{await c.close()}
