import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),output=await mkdtemp('/private/tmp/notes-viewport-entry-independent-');
const {openRuntime,api,idle,state}=await import(pathToFileURL(resolve(root,'scripts/debug/runtime.mjs')));
const {sourceFingerprint}=await import(pathToFileURL(resolve(root,'scripts/debug/source-identity.mjs')));
const {runPreferences}=await import(pathToFileURL(resolve(root,'scripts/debug/preferences.mjs')));
const {runQuickHome}=await import(pathToFileURL(resolve(root,'scripts/debug/quick-home.mjs')));
const checks=[],started=performance.now(),before=await sourceFingerprint(root);let runtime;
const save=(name,value)=>writeFile(resolve(output,name),JSON.stringify(value,null,2)+'\n');
const check=(label,value)=>{checks.push({label,pass:!!value});assert(value,label);};
await save('source-before.json',before);
try {
 runtime=await openRuntime({root,mobile:true});const {page,backend}=runtime;
 const command=async(id,args={})=>{const v=await api(page,id,args);await idle(page);return v.result;};
 const records=[];
 const stop=Symbol('independent-entry-only');
 for(const [name,run] of [['preferences',runPreferences],['quick-home',runQuickHome]]){
  await page.setViewportSize({width:1280,height:844});await runtime.reset();
  check(`${name}: global reset deliberately preserves 1280px polluted desktop layout`,page.viewportSize().width===1280&&await page.locator('.app.mobile').count()===0&&await page.locator('.mobile-home-settings').count()===0);
  let stopped=false;
  try{await run(runtime,{command,output,check:(label,value)=>{check(`${name}: actual entry first assertion: ${label}`,value);throw stop;}});}catch(error){if(error!==stop)throw error;stopped=true;}
  check(`${name}: exact entry function stopped after first business assertion`,stopped);
  const size=page.viewportSize(),s=await state(page);records.push({entry:name,viewport:size,selection:s.selection,preferences:s.preferences});
  check(`${name}: entry restores exact declared 390x844 viewport and mobile App`,size.width===runtime.viewport.width&&size.height===runtime.viewport.height&&size.width===390&&size.height===844&&await page.locator('.app.mobile').count()===1);
  if(name==='preferences'){
   check('Preferences polluted entry uses actual mobile gear and shared settings dialog',s.preferences.open&&s.preferences.tab==='settings'&&await page.getByRole('dialog').count()===1&&await page.locator('.mobile-home-settings').count()===1);
   await page.getByRole('button',{name:'关闭设置',exact:true}).click();await idle(page);
   check('Preferences close restores actual mobile home gear focus',await page.locator('.mobile-home-settings').evaluate(n=>n===document.activeElement));
  }else{
   check('Quick-home polluted entry initializes all gallery with null selection and no hidden editor',s.selection.page==='notes'&&s.selection.folderId==='all'&&s.selection.noteId===null&&await page.locator('.tiptap').count()===0);
   await page.locator('.mobile-add-note').click();await idle(page);const created=(await state(page)).selection.noteId;
   check('Quick-home actual plus creates once and focuses exact connected new editor',backend.calls.filter(c=>c.command==='workspace_action'&&c.type==='createNote').length===1&&await page.evaluate(id=>document.activeElement?.matches('.tiptap[contenteditable="true"]')&&document.activeElement?.closest('[data-mobile-editor-note]')?.getAttribute('data-mobile-editor-note')===id,created));
  }
  await writeFile(resolve(output,name+'.html.txt'),await page.locator('.app').evaluate(n=>n.outerHTML));
 }
 check('No page errors during the two exact entry prefixes',runtime.errors.length===0);
 const scope=runtime.metadata;await runtime.cleanup();runtime=null;const after=await sourceFingerprint(root);await save('source-after.json',after);check('All126 inputs remain byte-identical during polluted-entry verification',before.sha256===after.sha256);
 await save('result.json',{status:'PASS-MINIMAL-POLLUTED-MOBILE-ENTRIES',checks,records,sourceFingerprint:before.sha256,runnerSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),wallSeconds:(performance.now()-started)/1000,scope,limits:['Only actual runPreferences/runQuickHome entry prefixes; dedicated sentinel stops at first business assertion, followed by direct DOM action checks. No full group rerun.','Real App DOM/handlers with synthetic IPC/storage, no actual Android IME/provider or original pixel proof.']});console.log(JSON.stringify({output,status:'PASS',checks:checks.length,wallSeconds:(performance.now()-started)/1000}));
}catch(error){await save('failure.json',{message:error.message,stack:error.stack,checks,sourceBefore:before,sourceAfter:await sourceFingerprint(root)});await runtime?.cleanup();console.error(JSON.stringify({output,error:error.message}));process.exitCode=1;}
