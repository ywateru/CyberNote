import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getSchema} from '@tiptap/core';
import {EditorState,TextSelection} from '@tiptap/pm/state';
import {history,undoDepth,redoDepth,undo,redo} from '@tiptap/pm/history';
import ts from 'typescript';
await import('../check-editor-schema.mjs');
const out=resolve('artifacts/table95-independent');await mkdir(out,{recursive:true});
const actionPath=resolve('artifacts/editor-schema/table95-budget-independent.mjs');
await writeFile(actionPath,ts.transpileModule(await readFile('src/editor-actions.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {canConvertTextToTable,convertTextToTable,convertTableToText}=await import(pathToFileURL(actionPath));
const {createEditorExtensions}=await import(pathToFileURL(resolve('artifacts/editor-schema/editor-schema.mjs')));const schema=getSchema(createEditorExtensions());
const p=t=>({type:'paragraph',...(t?{content:[{type:'text',text:t}]}:{})});
const port=(content,from,to)=>{let state=EditorState.create({schema,doc:schema.nodeFromJSON({type:'doc',content}),plugins:[history()]});state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,from,to)));return {isEditable:true,get state(){return state},view:{get state(){return state},dispatch(tr){state=state.apply(tr)}}}};
const rejected=(e,name)=>{const before=e.state,u=undoDepth(before),r=redoDepth(before);assert.equal(canConvertTextToTable(e),false,name);assert.equal(convertTextToTable(e),false,name);assert.equal(e.state,before);assert.equal(undoDepth(e.state),u);assert.equal(redoDepth(e.state),r)};
const metrics=doc=>{let nodes=1,depth=0;const walk=(n,d)=>{depth=Math.max(depth,d);n.forEach(c=>{nodes++;walk(c,d+1)})};walk(doc,0);return{nodes,depth}};
const checks=[];
// Cache must invalidate when a new document keeps the same from/to offsets.
const cache=port([p('a\tb')],1,4);assert.equal(canConvertTextToTable(cache),true);
const big=schema.nodeFromJSON({type:'doc',content:[p('a\tb'),...Array.from({length:99995},()=>p(''))]});
{const tr=cache.state.tr.replaceWith(0,cache.state.doc.content.size,big.content);cache.view.dispatch(tr.setSelection(TextSelection.create(tr.doc,1,4)));}
rejected(cache,'same offsets with changed document revalidate surrounding nodes');
checks.push('cached capability invalidates on doc replacement at same selection offsets');
// A previously rejected plan must recover when its document becomes smaller.
const small=schema.nodeFromJSON({type:'doc',content:[p('a\tb')]});
{const tr=cache.state.tr.replaceWith(0,cache.state.doc.content.size,small.content);cache.view.dispatch(tr.setSelection(TextSelection.create(tr.doc,1,4)));}
assert.equal(canConvertTextToTable(cache),true);assert.equal(convertTextToTable(cache),true);checks.push('rejected cached plan recovers on smaller document');
// A fitted table inside a list item retains unselected siblings and budget depth.
const list={type:'bulletList',content:[{type:'listItem',content:[p('left a\tb right'),p('untouched')]},{type:'listItem',content:[p('sibling')]}]};
const nested=port([list],8,11);const before=nested.state.doc;
assert.equal(canConvertTextToTable(nested),true);assert.equal(convertTextToTable(nested),true);nested.state.doc.check();
assert.ok(nested.state.doc.textContent.includes('left '));assert.ok(nested.state.doc.textContent.includes(' rightuntouchedsibling'));
assert.equal(undo(nested.state,tr=>nested.view.dispatch(tr)),true);assert.ok(nested.state.doc.eq(before));assert.equal(redo(nested.state,tr=>nested.view.dispatch(tr)),true);
checks.push('real ProseMirror list fitting preserves outside content and one-step history');
// Root-based depth exactly64 is valid,65 is rejected before dispatch.
for(const quotes of [59,60]){let n=p('a\tb');for(let i=0;i<quotes;i++)n={type:'blockquote',content:[n]};const e=port([n],quotes+1,quotes+4);if(quotes===59){assert.equal(canConvertTextToTable(e),true);assert.equal(convertTextToTable(e),true);assert.equal(metrics(e.state.doc).depth,64)}else rejected(e,'root depth65');}
checks.push('exact depth64 allowed, depth65 rejected with unchanged EditorState');
// Readonly changes cannot reuse a cached allowed conversion.
const readonly=port([p('a\tb')],1,4);assert.equal(canConvertTextToTable(readonly),true);readonly.isEditable=false;rejected(readonly,'readonly cached plan');readonly.isEditable=true;assert.equal(canConvertTextToTable(readonly),true);checks.push('readonly guards run before cached capability reuse');
await writeFile(resolve(out,'budget-recheck-result.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks},null,2)+'\n');console.log(checks);
