import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Schema} from '@tiptap/pm/model';
import {EditorState,TextSelection} from '@tiptap/pm/state';
const out=resolve('artifacts/android-mobile106/unit');await mkdir(out,{recursive:true});
const path=resolve(out,'layout.mjs');await writeFile(path,ts.transpileModule(await readFile('src/platform/layout.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {createMobileLayout}=await import(pathToFileURL(path));
const checks=[];
const widths=[320,699,700,740,1024];
const cases=[
 {name:'native Android',native:true,ua:'Mozilla Android 14',expected:[true,true,true,true,true]},
 {name:'native Mac',native:true,ua:'Mozilla Mac OS X',expected:[true,true,false,false,false]},
 {name:'native other desktop',native:true,ua:'Mozilla Linux',expected:[true,true,false,false,false]},
 {name:'Android ordinary Web',native:false,ua:'Mozilla Android 14',expected:[true,true,false,false,false]},
 {name:'Mac ordinary Web',native:false,ua:'Mozilla Mac OS X',expected:[true,true,false,false,false]},
 {name:'other ordinary Web',native:false,ua:'Mozilla Linux',expected:[true,true,false,false,false]},
];
for(const row of cases)for(const separate of [false,true]){
 const expected=separate?[false,false,false,false,false]:row.expected;
 const actual=widths.map(createMobileLayout(row.native,row.ua,separate));
 assert.deepEqual(actual,expected,row.name+' separate='+separate);
 for(let i=0;i<widths.length;i++)checks.push({name:row.name,separate,width:widths[i],mobile:actual[i]});
}
const android=createMobileLayout(true,'aNdRoId',false);
assert.deepEqual([360,740,360,500,1024].map(android),[true,true,true,true,true]);
// Narrow integration with the unchanged production session and real PM bookmarks.
const cp=resolve(out,'controller.mjs');await writeFile(cp,ts.transpileModule(await readFile('src/editor-session/controller.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {EditorSession}=await import(pathToFileURL(cp));
const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*'},text:{}}});
function editor(){
 let st=EditorState.create({schema,doc:schema.node('doc',null,[schema.node('paragraph',null,[schema.text('alpha beta')])])});
 st=st.apply(st.tr.setSelection(TextSelection.create(st.doc,1,6)));const listeners=new Map();
 const e={isEditable:true,isDestroyed:false,get state(){return st;},view:{dom:{isConnected:true},dispatch(tr){st=st.apply(tr);for(const fn of listeners.get('transaction')||[])fn({transaction:tr});}},on(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},off(n,f){listeners.get(n)?.delete(f);},destroy(){e.isDestroyed=true;for(const f of listeners.get('destroy')||[])f();}};
 return e;
}
const sessionChecks=[];
for(const boundary of ['same-Android-resize','note','editor','access','blocked','hidden','destroy','wrong-owner']){
 const e=editor();const calls=[];const c=new EditorSession({blur(){calls.push('hide');},keyboard(x){calls.push(x?'show':'hide');},focus(){return true;}});
 let context={noteId:'a',owner:'a',editor:e,mobile:android(360),authorized:true,blocked:false,visible:true};c.configure(context);c.reconcile();c.openFormat();
 assert.equal(c.snapshot().formatOpen,true);const generation=c.generation;
 if(boundary==='destroy')e.destroy();
 else{
  const delta={note:{noteId:'b',owner:'b'},editor:{editor:editor()},access:{authorized:false},blocked:{blocked:true},hidden:{visible:false},'wrong-owner':{owner:'other'},'same-Android-resize':{mobile:android(740)}}[boundary];
  context={...context,...delta};c.configure(context);c.reconcile();
 }
 if(boundary==='same-Android-resize'){
  assert.equal(c.snapshot().formatOpen,true);assert.equal(c.generation,generation);
  c.formatCommand(target=>assert.deepEqual(target.state.selection.toJSON(),{type:'text',anchor:1,head:6}));
  assert.equal(c.snapshot().formatOpen,true);
 }else if(boundary==='wrong-owner'){
  let ran=false;c.formatCommand(()=>ran=true);assert.equal(ran,false);
 }else {assert.equal(c.snapshot().formatOpen,false);assert.equal(c.snapshot().pendingFocus,null);assert(c.generation>generation);assert.equal(calls.at(-1),'hide');}
 c.dispose();sessionChecks.push(boundary);
}
await writeFile(resolve(out,'session-result.json'),JSON.stringify({passed:sessionChecks.length,checks:sessionChecks,scope:'production controller; real PM selection; platform focus/IME adapter only'},null,2));
await writeFile(resolve(out,'result.json'),JSON.stringify({passed:checks.length+1,cases:checks},null,2));
console.log('platform-layout106 '+(checks.length+1)+' passed');
