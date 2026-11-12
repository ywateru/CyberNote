// Independent bounded review: actual App/production Editor, native browser mouse
// input, window + document listener ownership and public termination events.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {openRuntime,api,idle} from '../debug/runtime.mjs';
const out=resolve('artifacts/table-pointer95h/independent-boundaries');
await mkdir(out,{recursive:true});
const r=await openRuntime();const {page}=r;const checks=[];
try {
 await api(page,'note.select',{id:'note-a'});
 const p=text=>({type:'paragraph',content:[{type:'text',text}]});
 await api(page,'editor.setContent',{document:{type:'doc',content:[p('pointer review'),{type:'table',content:Array.from({length:3},(_,row)=>({type:'tableRow',content:Array.from({length:3},(_,col)=>({type:'tableCell',content:[p(`cell ${row}:${col} text`)]}))}))},p('after')]}});
 await idle(page);
 await page.evaluate(async()=>{
  const {undoDepth}=await import('/@id/@tiptap/pm/history');
  const editor=document.querySelector('.tiptap').editor;
  const tracked=new Map();const counts=()=>Object.fromEntries([...tracked].map(([key,set])=>[key,set.size]));
  const synthetic=[];let swallow=false;
  window.addEventListener('mouseup',e=>{if(swallow&&e.isTrusted){swallow=false;e.stopImmediatePropagation()}},true);
  document.addEventListener('mouseup',e=>{if(!e.isTrusted)synthetic.push({targetRoot:e.target===document,buttons:e.buttons})});
  for(const target of [window,document])for(const method of ['addEventListener','removeEventListener']){
   const original=target[method].bind(target);
   target[method]=(type,listener,options)=>{
    if((target===window?['mousemove','blur','pointercancel']:['mouseup','mousemove','dragstart']).includes(type)){
     const key=(target===window?'window':'document')+':'+type+':'+(typeof options==='boolean'?options:!!options?.capture);
     const set=tracked.get(key)||new Set();method==='addEventListener'?set.add(listener):set.delete(listener);tracked.set(key,set);
    }return original(type,listener,options);
   };
  }
  window.__pointerReview={editor,counts,synthetic,lose(){swallow=true},snapshot(){return{doc:editor.getJSON(),undo:undoDepth(editor.state),selection:editor.state.selection.toJSON(),counts:counts(),synthetic:[...synthetic]}}};
 });
 const snap=()=>page.evaluate(()=>window.__pointerReview.snapshot());
 const first=await snap();
 const point=async i=>{const b=await page.locator('.tiptap td').nth(i).boundingBox();return{x:b.x+b.width*.45,y:b.y+b.height*.5}};
 const move=async i=>{const q=await point(i);await page.mouse.move(q.x,q.y)};
 const assertQuiet=async name=>{const s=await snap();assert.deepEqual(s.doc,first.doc);assert.equal(s.undo,first.undo);assert(Object.values(s.counts).every(n=>n===0),JSON.stringify(s.counts));checks.push(name);return s};
 await move(0);await move(8);
 assert.equal((await snap()).synthetic.length,0);await assertQuiet('Pure movement creates neither guard listeners nor synthetic termination');
 await move(0);await page.mouse.down();await move(1);await page.mouse.up();
 const normal=await assertQuiet('Normal release removes both window guard and document drag listeners without history');
 assert.equal(normal.synthetic.length,0);
 await move(0);await page.mouse.down();await move(1);
 const held=await snap();assert.equal(held.counts['window:mousemove:true'],1);assert.equal(held.counts['window:pointercancel:true'],1);
 await page.evaluate(()=>window.__pointerReview.lose());await page.mouse.up();await move(8);
 const ended=await assertQuiet('Lost release ends all temporary listeners before released movement and leaves history intact');
 assert.deepEqual(ended.selection,held.selection);assert.deepEqual(ended.synthetic,[{targetRoot:true,buttons:0}]);
 await move(0);await move(8);assert.equal((await snap()).synthetic.length,1);checks.push('Terminated gesture emits exactly one root mouseup, idle movement emits none');
 await move(0);await page.mouse.down();await move(1);
 await page.evaluate(()=>window.__pointerReview.editor.setEditable(false));
 await page.mouse.up();await move(8);const readonly=await assertQuiet('Readonly transition releases both listener owners without history');
 assert.equal(readonly.synthetic.length,2);
 await page.evaluate(()=>window.__pointerReview.editor.setEditable(true));
 await move(0);await page.mouse.down();await move(1);
 await api(page,'note.select',{id:'note-b'});await idle(page);await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.__pointerReview.editor.isDestroyed),true);
 const finalCounts=await page.evaluate(()=>window.__pointerReview.counts());assert(Object.values(finalCounts).every(n=>n===0),JSON.stringify(finalCounts));
 checks.push('Real App navigation destroys active editor and removes both temporary listener owners');
 assert.deepEqual(r.errors,[]);
 await writeFile(resolve(out,'result.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks,normal,held,ended,readonly,finalCounts,scope:'Real App/Chrome with isolated backend; controlled one-event loss, not Mac native scene'},null,2)+'\n');
 console.log(checks);
}catch(error){await page.screenshot({path:resolve(out,'failure.png')});throw error}finally{await r.cleanup()}
