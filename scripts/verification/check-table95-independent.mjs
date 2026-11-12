import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { history, undo, redo } from '@tiptap/pm/history';
await import('../check-editor-schema.mjs');
const output=resolve('artifacts/table95-independent');
await mkdir(output,{recursive:true});
const actionPath=resolve('artifacts/editor-schema/table95-independent-actions.mjs');
await writeFile(actionPath,ts.transpileModule(await readFile('src/editor-actions.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {createEditorExtensions}=await import(pathToFileURL(resolve('artifacts/editor-schema/editor-schema.mjs')));
const {convertTextToTable,canConvertTextToTable,convertTableToText}=await import(pathToFileURL(actionPath));
const schema=getSchema(createEditorExtensions());
const p=text=>({type:'paragraph',...(text?{content:[{type:'text',text}]}:{})});
const count=doc=>{let n=1;doc.descendants(()=>{n++});return n};
const port=(content,from,to)=>{let state=EditorState.create({schema,doc:schema.nodeFromJSON({type:'doc',content}),plugins:[history()]});state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,from,to)));return {isEditable:true,get state(){return state},view:{get state(){return state},dispatch(tr){state=state.apply(tr)}}}};
const results=[];
// Partial conversion around hardBreak must preserve the unselected sides.
const hard=port([{type:'paragraph',content:[{type:'text',text:'left A\tB'},{type:'hardBreak'},{type:'text',text:'C\tD right'}]}],6,13);
const original=hard.state.doc;
assert.equal(convertTextToTable(hard),true);
hard.state.doc.check();
assert.equal(hard.state.doc.firstChild.textContent,'left ');
assert.equal(hard.state.doc.lastChild.textContent,' right');
assert.equal(hard.state.doc.child(1).childCount,2);
assert.equal(undo(hard.state,tr=>hard.view.dispatch(tr)),true);
assert.ok(hard.state.doc.eq(original));
results.push({name:'hardBreak partial selection and exact Undo',pass:true});
// A text selection inside an existing table is deliberately unavailable.
const inTable=port([{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[p('a\tb')]}]}]}],4,7);
assert.equal(canConvertTextToTable(inTable),false);
assert.equal(convertTextToTable(inTable),false);
results.push({name:'text inside table rejected',pass:true});
// Outside edits invalidate the exact-origin snapshot and use selected current text.
const source=port([p('before'),{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',attrs:{colspan:2},content:[p('A'),p('B')]}]}]},p('after')],12,12);
assert.equal(convertTableToText(source),true);
const range={from:source.state.selection.from,to:source.state.selection.to};
source.view.dispatch(source.state.tr.insertText('X',2));
source.view.dispatch(source.state.tr.setSelection(TextSelection.create(source.state.doc,range.from+1,range.to+1)));
assert.equal(convertTextToTable(source),true);
assert.equal(source.state.doc.firstChild.textContent,'bXefore');
assert.equal(source.state.doc.child(1).childCount,2);
results.push({name:'outside document edit invalidates exact structure reuse',pass:true});
// Reproduce a save-invalid result under Rust document.rs MAX_NODES=100000.
const cells=35000, text=Array(cells).fill('x').join('\t');
const large=port([p(text)],1,text.length+1);
const offered=canConvertTextToTable(large), beforeCount=count(large.state.doc);
const largeBefore=large.state.doc, selectionBefore=large.state.selection.toJSON();
const converted=convertTextToTable(large), afterCount=count(large.state.doc);
large.state.doc.check();
results.push({name:'document node budget reproduction',offered,converted,cells,beforeCount,afterCount,rustNodeLimit:100000,rejectedByRustNodeBudget:afterCount>100000});
if(process.argv.includes('--expect-fixed')) {
 assert.equal(offered,false);assert.equal(converted,false);assert.ok(large.state.doc.eq(largeBefore));assert.deepEqual(large.state.selection.toJSON(),selectionBefore);
 assert.equal(undo(large.state,tr=>large.view.dispatch(tr)),false);
}else{assert.equal(offered,true);assert.equal(converted,true);assert.ok(afterCount>100000);}
await writeFile(resolve(output,process.argv.includes('--expect-fixed')?'recheck-result.json':'result.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
