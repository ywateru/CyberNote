import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {openRuntime,api,idle,state} from '../debug/runtime.mjs';
const out=resolve('artifacts/session96-independent');await mkdir(out,{recursive:true});
const r=await openRuntime({mobile:true});const {page}=r;const findings=[];
try{
 await page.evaluate(()=>{window.__session96Keyboard=[];window.NotesKeyboard={show(){window.__session96Keyboard.push('show')},hide(){window.__session96Keyboard.push('hide')}}});
 await api(page,'note.select',{id:'note-a'});
 await api(page,'editor.setContent',{document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'before'}]},{type:'drawing',attrs:{strokes:[{points:[[0,0],[40,40]],tool:'pen',color:'#222222',width:3}]}},{type:'paragraph',content:[{type:'text',text:'after'}]}]}});
 await api(page,'app.flush');await idle(page);
 await api(page,'menu.open',{menu:'format'});await page.getByRole('dialog',{name:'格式',exact:true}).waitFor();
 await page.locator('.drawing-node > svg').evaluate(el=>{const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}));});
 await page.getByRole('menu',{name:'速绘操作',exact:true}).waitFor();
 const before=await state(page);
 const keyboardMarker=await page.evaluate(()=>window.__session96Keyboard.length);
 await api(page,'app.back');await idle(page);
 const after=await state(page);
 findings.push({name:'Android Back with drawing context menu above persistent format',before:{panel:before.editorSession.panel,menu:before.editorSession.menu,page:before.selection.page},after:{panel:after.editorSession.panel,menu:after.editorSession.menu,page:after.selection.page},drawingMenuVisible:await page.getByRole('menu',{name:'速绘操作',exact:true}).isVisible(),formatPanelVisible:await page.getByRole('dialog',{name:'格式',exact:true}).count()});
 if(process.argv.includes('--expect-fixed')) {assert.equal(findings[0].drawingMenuVisible,false);assert.equal(findings[0].formatPanelVisible,1)}else{assert.equal(findings[0].drawingMenuVisible,true);assert.equal(findings[0].formatPanelVisible,0)}
 await page.screenshot({path:resolve(out,process.argv.includes('--expect-fixed')?'drawing-context-back-fixed.png':'drawing-context-back.png')});
 if(process.argv.includes('--expect-fixed')) {
  await api(page,'app.back');await idle(page);
  const closed=await state(page);
  assert.equal(closed.editorSession.panel,'none');assert.equal(closed.editorSession.lastClose,'back');
  assert.equal(closed.selection.page,'editor');assert.equal(closed.selection.noteId,'note-a');
  const keyboard=await page.evaluate(n=>window.__session96Keyboard.slice(n),keyboardMarker);
  assert.equal(keyboard.includes('show'),false);
  findings.push({name:'Back without ordinary menu closes format through session without requesting IME or navigating',panel:closed.editorSession.panel,lastClose:closed.editorSession.lastClose,page:closed.selection.page,keyboard});
 }
 await writeFile(resolve(out,process.argv.includes('--expect-fixed')?'recheck-result.json':'result.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),findings,scope:'actual React App/Chrome, debug app.back Android handler, isolated backend; not OS IME or ADB'},null,2)+'\n');
 assert.deepEqual(r.errors,[]);console.log(findings);
}catch(e){await page.screenshot({path:resolve(out,'failure.png')});await writeFile(resolve(out,'failure.json'),JSON.stringify({error:e.message,state:await state(page),menus:await page.locator('[role=menu]').evaluateAll(els=>els.map(e=>({label:e.getAttribute('aria-label'),html:e.outerHTML.slice(0,500)}))),drawing:await page.locator('.drawing-node').evaluateAll(els=>els.map(e=>({html:e.outerHTML,rect:e.getBoundingClientRect().toJSON(),owner:e.closest('.tiptap')?.outerHTML.slice(0,600)})))},null,2));throw e;}finally{await r.cleanup()}
