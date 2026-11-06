import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='/private/tmp/apple-notes-android-quick-home83';
const {openRuntime,api,idle,state,waitForState,snapshot}=await import(pathToFileURL(resolve(root,'scripts/debug/runtime.mjs')));
const {sourceFingerprint}=await import(pathToFileURL(resolve(root,'scripts/debug/source-identity.mjs')));
const output=await mkdtemp('/private/tmp/notes-quick-home83-independent-');
const checks=[],started=performance.now();let runtime;
const save=(name,value)=>writeFile(resolve(output,name),JSON.stringify(value,null,2)+'\n');
const check=(label,value,detail)=>{checks.push({label,pass:!!value,...(detail===undefined?{}:{detail})});assert(value,label);};
const before=await sourceFingerprint(root);await save('source-before.json',before);assert.equal(before.sha256,'c4fcc377e3ac0b1bac640e4a29fdc3039cf3e558dff3491ef43f1981611cdfd1');
try {
 runtime=await openRuntime({root,mobile:true});const {page,backend}=runtime;
 const original=backend.call.bind(backend);
 const command=async(id,args={})=>{const v=await api(page,id,args);await idle(page);return v;};
 const reload=async()=>{await page.reload();await page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1);await idle(page);};
 const reset=async()=>{backend.call=original;await runtime.reset();};
 const creates=()=>backend.calls.filter(c=>c.command==='workspace_action'&&c.type==='createNote').length;
 const reads=()=>backend.calls.filter(c=>c.command==='read_attachment').length;
 const focused=id=>page.evaluate(id=>document.activeElement?.closest('[data-mobile-editor-note]')?.getAttribute('data-mobile-editor-note')===id&&document.activeElement?.matches('.tiptap[contenteditable="true"]'),id);
 const plus=()=>page.locator('.mobile-add-note');
 const capture=async name=>{await page.screenshot({path:resolve(output,name+'.png'),animations:'disabled'});await writeFile(resolve(output,name+'.html.txt'),await page.locator('.app').evaluate(n=>n.outerHTML));await save(name+'.snapshot.json',await snapshot(page,{selector:'.app',maxChars:30000}));};
 // A selected, valid image node exists in storage before initialization. The
 // gallery must not mount its hidden editor or load even its synthetic bytes.
 backend.workspace.settings.view='list';backend.workspace.settings.groupDates=true;
 backend.workspace.attachments=[{id:'independent83-image',noteId:'note-a',kind:'image',displayName:'合成冷启图片.png',mime:'image/png',size:68,relativePath:'synthetic/no-payload'}];
 backend.workspace.notes[0].document.content.push({type:'attachment',attrs:{id:'independent83-image',name:'合成冷启图片.png',kind:'image'}});
 await reload();let s=await state(page);
 check('Seeded selected media cold start has all gallery, null selection and zero editor/payload reads',s.selection.page==='notes'&&s.selection.folderId==='all'&&s.selection.noteId===null&&await page.locator('.tiptap').count()===0&&reads()===0);
 check('Cold initialization preserves desktop presentation and persisted selected note',backend.workspace.settings.selectedNote==='note-a'&&backend.workspace.settings.view==='list'&&backend.workspace.settings.groupDates===true);
 await page.locator('.mobile-home-settings').click();await idle(page);
 check('Real home gear exposes explicit desktop presentation labels',await page.getByRole('combobox',{name:'桌面显示方式',exact:true}).count()===1&&await page.getByRole('checkbox',{name:'桌面按日期分组',exact:true}).count()===1);
 await page.getByRole('combobox',{name:'桌面显示方式',exact:true}).selectOption('gallery');await idle(page);
 await page.getByRole('checkbox',{name:'桌面按日期分组',exact:true}).uncheck();await idle(page);
 await command('modal.cancel');
 check('Shared setting handlers persist while mobile remains two-column derived gallery',backend.workspace.settings.view==='gallery'&&backend.workspace.settings.groupDates===false&&await page.locator('.mobile-gallery').count()===1);
 await reset();
 // Hold creation at the backend boundary, join the actual DOM request through
 // the public API, then navigate root Back before the entity exists.
 let releaseCreate,signalCreate;const beganCreate=new Promise(r=>signalCreate=r);
 backend.call=async(c,a)=>{if(c==='workspace_action'&&a.action?.type==='createNote'){signalCreate();await new Promise(r=>releaseCreate=r);}return original(c,a);};
 await plus().click();await beganCreate;
 const joined=api(page,'note.create');await waitForState(page,v=>v.creation.pending);
 check('Held creation admits one flight and disables the actual accessible plus',await plus().isDisabled()&&await plus().getAttribute('aria-busy')==='true');
 await api(page,'app.back');
 check('Root Back during pre-receipt creation cannot acknowledge successful quit',!(await page.evaluate(()=>window.__DEBUG_PLATFORM__.quitAcknowledgements.some(x=>x.success))));
 releaseCreate();await joined;await idle(page);backend.call=original;s=await state(page);
 check('Joined creation commits once after Back without resurrecting editor or focus',creates()===1&&backend.workspace.notes.length===3&&s.selection.page==='notes'&&s.selection.noteId===null&&await page.locator('.tiptap').count()===0);
 await reset();backend.configure({fail:{load:100}});await plus().click();await idle(page).catch(()=>{});s=await state(page);const retained=s.creation.receipt;
 check('Metadata outage retains a real persisted receipt and recoverable gallery error',retained&&backend.workspace.notes.some(n=>n.id===retained)&&s.creation.error&&s.selection.page==='notes');
 backend.configure({fail:{load:0}});await command('app.dismissError');await plus().click();await idle(page);
 check('Same-source retry opens retained exact editor with no duplicate backend create',creates()===1&&(await state(page)).selection.noteId===retained&&await focused(retained));
 await page.keyboard.insertText('独立验证83\n真实正文已提交');await page.locator('.editor-header [aria-label="完成编辑"]').click();await idle(page);
 check('Actual Done button flushes typed body and releases editor focus',backend.workspace.notes.find(n=>n.id===retained).plainText.includes('真实正文已提交')&&!await focused(retained));
 await page.locator('.editor-header [aria-label="返回笔记"]').click();await idle(page);
 check('Actual editor Back returns to all source and saved card once', (await state(page)).selection.folderId==='all'&&(await state(page)).selection.page==='notes'&&(await page.locator(`[data-note-id="${retained}"] strong`).count())===1);
 // Same-source recovery must not accidentally consume a receipt after the
 // user explicitly changes to a physical source.
 await reset();backend.workspace.folders.push({id:'independent83-folder',name:'独立来源目录',kind:'normal',parentId:null,sortOrder:5,createdAt:1});await reload();
 backend.configure({fail:{load:100}});await plus().click();await idle(page).catch(()=>{});const oldReceipt=(await state(page)).creation.receipt;
 backend.configure({fail:{load:0}});await command('app.dismissError');await command('folder.select',{id:'independent83-folder'});await plus().click();await idle(page);s=await state(page);
 check('Explicit different source creates a new physical-owner entity while preserving old all receipt',creates()===2&&s.selection.noteId!==oldReceipt&&s.selection.folderId==='independent83-folder'&&backend.workspace.notes.find(n=>n.id===s.selection.noteId).folderId==='independent83-folder'&&backend.workspace.notes.find(n=>n.id===oldReceipt).folderId==='default');
 await reset();let signalLoad,releaseLoad,hold=false;const beganLoad=new Promise(r=>signalLoad=r);
 backend.call=async(c,a)=>{const v=await original(c,a);if(c==='workspace_action'&&a.action?.type==='createNote')hold=true;if(c==='load_workspace'&&hold){hold=false;signalLoad();await new Promise(r=>releaseLoad=r);}return v;};
 await plus().click();await beganLoad;await api(page,'settings.open');await page.getByRole('combobox',{name:'外观',exact:true}).focus();releaseLoad();await idle(page);backend.call=original;
 check('Late creation metadata leaves settings open and current settings focus intact',(await state(page)).preferences.open&&(await state(page)).selection.page==='notes'&&await page.getByRole('combobox',{name:'外观',exact:true}).evaluate(n=>n===document.activeElement)&&backend.workspace.notes.length===3);
 await command('modal.cancel');check('Closing settings after late create never fires a stale editor focus',(await state(page)).selection.page==='notes'&&await page.locator('.tiptap').count()===0);
 await reset();await command('folder.open');await command('folder.updateDraft',{draft:{name:'独立空置顶智能',smart:true,combine:'all',rules:[{key:0,type:'pinned',mode:'allSelected',names:[],pinned:true}]}});await command('folder.submit');const smart=backend.workspace.folders.find(f=>f.name==='独立空置顶智能').id;
 await command('folder.select',{id:smart});await plus().click();await idle(page);s=await state(page);const smartId=s.selection.noteId;
 check('Zero-result smart source retains its created exact editor and default physical owner',s.selection.folderId===smart&&s.selection.listed.length===0&&backend.workspace.notes.find(n=>n.id===smartId).folderId==='default'&&await focused(smartId));
 await page.locator('.editor-tools:visible [aria-label="格式"]').click();await idle(page);check('Unmatched smart editor still invokes real format tool',(await state(page)).selection.menu==='format');await command('app.back');
 await page.locator('.editor-tools:visible [aria-label="添加附件"]').click();await page.getByRole('button',{name:'录音',exact:true}).click();await idle(page);await command('recording.action',{action:'toggle'});await page.evaluate(()=>window.__DEBUG_PLATFORM__.advance(1450));await command('recording.action',{action:'close'});
 check('Smart-created recorder persists synthetic audio to the exact receipt owner',backend.workspace.attachments.some(a=>a.kind==='audio'&&a.noteId===smartId)&&!(await state(page)).recording.active&&(await state(page)).selection.listed.length===0);
 await reset();const prototype=backend.workspace.notes[0];backend.workspace.notes=Array.from({length:8},(_,i)=>({...structuredClone(prototype),id:'independent83-card-'+i,title:'合成标题'+i,plainText:'合成标题'+i+'\n合成正文用于两列阅读顺序。',locked:i===2,updatedAt:1793923200000-i*1000}));backend.workspace.settings.sort='updated';await reload();
 await page.setViewportSize({width:320,height:360});await command('settings.update',{settings:{theme:'dark'}});await page.locator('.notes-pane').evaluate(n=>n.getAnimations().forEach(a=>a.finish()));
 const metrics=await page.evaluate(()=>{const cards=[...document.querySelectorAll('.mobile-note-card')],plus=document.querySelector('.mobile-add-note'),search=document.querySelector('.mobile-list-search');return {overflow:document.querySelector('.app').scrollWidth>innerWidth,ids:cards.map(n=>n.closest('[data-note-id]').dataset.noteId),cards:cards.map(n=>({titles:n.querySelectorAll('strong').length,dates:n.querySelectorAll('time').length,top:n.getBoundingClientRect().top,left:n.getBoundingClientRect().left,summary:n.querySelector('p')?.textContent})),actions:[...document.querySelectorAll('.swipe-actions')].map(n=>getComputedStyle(n).visibility),plus:{width:plus.getBoundingClientRect().width,background:getComputedStyle(plus).backgroundColor,color:getComputedStyle(plus).color},searchHeight:search.getBoundingClientRect().height};});await save('layout-metrics.json',metrics);
 check('Short dark gallery has unique title/date, row-major reading order and hidden swipe backplates',!metrics.overflow&&metrics.cards.every(n=>n.titles===1&&n.dates===1)&&metrics.cards.every((n,i)=>i===0||n.top>metrics.cards[i-1].top||n.top===metrics.cards[i-1].top&&n.left>metrics.cards[i-1].left)&&metrics.actions.every(v=>v==='hidden'),metrics);
 check('Home primary action and search match exact local size/color contract',metrics.plus.width===56&&metrics.plus.background==='rgb(255, 188, 0)'&&metrics.plus.color==='rgb(255, 255, 255)'&&metrics.searchHeight===44);
 check('Locked home card exposes neither stored body nor synthetic attachment payload',!(await page.locator('[data-note-id="independent83-card-2"]').textContent()).includes('合成正文')&&reads()===0);
 await page.locator('.mobile-gallery').evaluate(n=>n.scrollTop=n.scrollHeight);await capture('mobile-short-dark');
 await page.setViewportSize({width:800,height:844});await idle(page);
 check('800px leaves mobile layout without silently changing shared desktop view',await page.locator('.app.mobile').count()===0&&!backend.workspace.settings.view);
 check('Independent targeted page errors remain empty',runtime.errors.length===0,runtime.errors);
 const metadata=runtime.metadata;await runtime.cleanup();runtime=null;const after=await sourceFingerprint(root);await save('source-after.json',after);assert.equal(after.sha256,before.sha256);
 await save('result.json',{status:'PASS-FOCUSED-QUICK-HOME83',checks,sourceUnchanged:true,sourceFingerprint:before.sha256,runnerSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),wallSeconds:(performance.now()-started)/1000,scope:metadata,limits:['Real App handlers, DOM, Tiptap and save/recording controllers with synthetic browser IPC/storage/media; no Rust Store, Android IME/provider, real microphone or original pixel acceptance.','No Cargo/AppKit rerun because native/controller inputs are unchanged; exact SHA mapping is retained separately.']});console.log(JSON.stringify({output,status:'PASS',checks:checks.length,wallSeconds:(performance.now()-started)/1000}));
}catch(error){await save('failure.json',{message:error.message,stack:error.stack,checks,sourceBefore:before,sourceAfter:await sourceFingerprint(root),wallSeconds:(performance.now()-started)/1000});if(runtime){await runtime.page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});await writeFile(resolve(output,'failure.html.txt'),await runtime.page.locator('.app').evaluate(n=>n.outerHTML)).catch(()=>{});await save('failure-state.json',await state(runtime.page).catch(e=>({error:String(e)})));await runtime.cleanup();}console.error(JSON.stringify({output,error:error.message,checks:checks.length}));process.exitCode=1;}
