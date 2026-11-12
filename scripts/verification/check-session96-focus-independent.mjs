import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';
import {openRuntime,api,idle,state} from '../debug/runtime.mjs';
const out=resolve('artifacts/session96-independent');await mkdir(out,{recursive:true});const r=await openRuntime({mobile:true});const {page}=r;const checks=[];
try{
 await page.evaluate(()=>{window.keyboardCalls=[];window.NotesKeyboard={show(){window.keyboardCalls.push({kind:'show',owner:document.activeElement?.closest('[data-mobile-editor-note]')?.dataset.mobileEditorNote})},hide(){window.keyboardCalls.push({kind:'hide'})}}});
 await api(page,'note.select',{id:'note-a'});await idle(page);r.backend.configure({delay:{create:500}});
 await page.evaluate(()=>{window.__createJob=window.__NOTES_DEBUG__.execute('note.create').then(()=>({ok:true}),e=>({ok:false,message:e.message}))});
 await page.waitForFunction(async()=>((await window.__NOTES_DEBUG__.execute('app.state')).result).creation.pending);
 await api(page,'note.select',{id:'note-b'});const marker=await page.evaluate(()=>window.keyboardCalls.length);assert.equal((await page.evaluate(()=>window.__createJob)).ok,true);await idle(page);
 assert.equal((await state(page)).selection.noteId,'note-b');assert.equal((await state(page)).editorSession.pendingFocus,null);assert.equal(await page.evaluate(n=>window.keyboardCalls.slice(n).some(c=>c.kind==='show'),marker),false);
 assert.equal(r.backend.workspace.notes.length,3);checks.push('late successful create receipt persists but cannot navigate or show IME over newer note');
 await api(page,'editor.setContent',{document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'alpha beta'}]}]}});await api(page,'editor.select',{from:7,to:11});await api(page,'menu.open',{menu:'format'});
 await page.evaluate(()=>{const view=document.querySelector('.tiptap').editor.view;view.dispatch(view.state.tr.insertText('XX ',1));});await idle(page);
 await page.getByRole('dialog',{name:'格式',exact:true}).getByRole('button',{name:'粗体',exact:true}).tap();await idle(page);
 assert.equal(await page.locator('.tiptap strong').textContent(),'beta');assert.equal((await state(page)).editorSession.panel,'format');await api(page,'app.flush');
 assert.equal(r.backend.workspace.notes.find(n=>n.id==='note-b').document.content[0].content.at(-1).text,'beta');checks.push('format bookmark maps a real insert-before transaction and saves original selected word');
 assert.deepEqual(r.errors,[]);await page.screenshot({path:resolve(out,'focus-bookmark.png')});await writeFile(resolve(out,'focus-result.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks,scope:'real React App/Chrome and PM dispatch; isolated backend and NotesKeyboard spy, no OS IME'},null,2)+'\n');console.log(checks);
}catch(e){await page.screenshot({path:resolve(out,'focus-failure.png')});throw e;}finally{await r.cleanup()}
