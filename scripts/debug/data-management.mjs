import { resolve } from 'node:path';
import { api, idle, state, snapshot, saveJSON } from './runtime.mjs';
import { chooseFiles, tinyPNG } from './mobile-attachments.mjs';

export async function startSurfaceTrace(page) {
  await page.evaluate(() => {
    const host = document.querySelector('.editor-scroll:not([hidden])');
    const trace = window.__data79Trace = { frames: [], mutations: [], host, editor: host?.querySelector('.tiptap'), media: host?.querySelector('.image-open img'), run: true };
    const sample = (kind) => {
      const host = document.querySelector('.editor-scroll:not([hidden])');
      const row = { time: performance.now(), cover: !!document.querySelector('.access-cover'), visibility: trace.editor ? getComputedStyle(trace.editor).visibility : null, sameHost: trace.host === host, sameEditor: trace.editor === host?.querySelector('.tiptap'), sameMedia: !trace.media || trace.media === host?.querySelector('.image-open img'), sidebarVisibility: getComputedStyle(document.querySelector('.sidebar')).visibility, notesVisibility: getComputedStyle(document.querySelector('.notes-pane')).visibility };
      trace[kind].push(row);
    };
    trace.observer = new MutationObserver(() => sample('mutations'));
    trace.observer.observe(document.querySelector('.app'), { attributes: true, childList: true, subtree: true });
    const tick = () => { sample('frames'); if (trace.run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  });
}
export async function stopSurfaceTrace(page) {
  return page.evaluate(() => { const t=window.__data79Trace; t.run=false; t.observer.disconnect(); return { frames:t.frames, mutations:t.mutations, coverFrames:t.frames.filter(x=>x.cover).length, hiddenFrames:t.frames.filter(x=>x.visibility==='hidden').length, changedFrames:t.frames.filter(x=>!x.sameHost||!x.sameEditor||!x.sameMedia).length }; });
}
export async function runDataManagement(runtime, { command, check, output }) {
  const {page,backend}=runtime, metrics=[];
  const originalCall=backend.call.bind(backend);
  const reset=async()=>{backend.call=originalCall;await runtime.reset();if(runtime.mobile)await command('note.select',{id:'note-a'});};
  const capture=async name=>{await saveJSON(resolve(output,name+'.snapshot.json'),await snapshot(page,{selector:'.app',maxChars:35000,maxNodes:180}));await page.screenshot({path:resolve(output,name+'.png')});};
  const add=async name=>{await chooseFiles(page,[{name,mimeType:'image/png',buffer:tinyPNG}]);await idle(page);await page.waitForFunction(()=>[...document.querySelectorAll('.image-open img')].every(x=>x.naturalWidth>0));};
  const configure=value=>page.evaluate(value=>window.__DEBUG_PLATFORM__.configure(value),value);
  const open=async()=>{await command('data.open');await page.waitForSelector('.storage-summary');await page.locator('.data-storage-details summary').click();};
  const close=async()=>{await page.getByRole('button',{name:'关闭设置',exact:true}).click();await idle(page);};
  const emit=async(name,payload)=>page.evaluate(({name,payload})=>window.__DEBUG_PLATFORM__.emit(name,payload),{name,payload});
  const prepare=async()=>{backend.suspended=['note-a'];backend.operationId='data79-prepare';const value=backend.state();await emit('notes-access',{phase:'prepare',operationId:backend.operationId,noteIds:['note-a'],access:value.access});};
  const commit=async()=>{backend.suspended=[];backend.operationId=null;backend.accessEpoch++;backend.noteEpochs['note-a']=(backend.noteEpochs['note-a']||0)+1;const value=backend.state();await emit('notes-access',{phase:'commit',operationId:'data79-prepare',noteIds:['note-a'],access:value.access});};

  if(runtime.mobile)await command('note.select',{id:'note-a'});
  await add('existing79.png');
  backend.configure({delay:{load:300,store:80}});
  await startSurfaceTrace(page);
  await add('new79.png');
  const quiet=await stopSurfaceTrace(page);await saveJSON(resolve(output,'data79-quiet-timeline.json'),quiet);
  check('Normal attachment trusted validations never cover or hide the window and retain Host/editor/existing media identities throughout rAF and MutationObserver',quiet.frames.length>20&&quiet.coverFrames===0&&quiet.hiddenFrames===0&&quiet.changedFrames===0&&!quiet.mutations.some(x=>x.cover||x.visibility==='hidden'||!x.sameEditor||!x.sameMedia));
  check('Quiet presentation retains storage/body ACK and two original-owner cards',backend.workspace.attachments.length===2&&backend.workspace.attachments.every(x=>x.noteId==='note-a')&&(await state(page)).save.pending===0);
  backend.configure({delay:{load:0,store:0}});
  await capture('data79-normal-attachments');
  const attachment=backend.workspace.attachments[0], image=page.locator('.image-preview'), before=JSON.stringify((await state(page)).editorJSON);
  await command('image.preview',{id:attachment.id});
  await configure({dialog:{save:[null]}});await image.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(page);
  check('Actual preview save cancellation performs no export and no success notice',backend.exports.length===0&&!(await image.innerText()).includes('图片已保存'));
  await configure({dialog:{save:['content://synthetic/image79.png']}});await command('image.save',{id:attachment.id});
  check('Actual preview save sends original ID and untouched bytes to selected URI',backend.exports.length===1&&backend.exports[0].id===attachment.id&&backend.exports[0].path==='content://synthetic/image79.png'&&Buffer.from(backend.exports[0].data,'base64').equals(tinyPNG));
  await page.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(page);
  check('Image preview exports identical original bytes without document changes',backend.exports.length===2&&backend.exports[1].data===backend.exports[0].data&&JSON.stringify((await state(page)).editorJSON)===before);
  await capture('data79-image-preview');
  backend.configure({fail:{export:1}});await image.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(page);
  check('Image write failure stays visible and does not report success',backend.exports.length===2&&(await image.getByRole('alert').innerText()).includes('Controlled export'));
  await image.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(page);
  check('Actual preview save retry succeeds once',backend.exports.length===3);
  const originalBytes=backend.files.get(attachment.id);backend.files.delete(attachment.id);
  await image.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(page);
  check('Actual preview missing-file export fails visibly without success or an output write',backend.exports.length===3&&(await image.getByRole('alert').innerText()).includes('Attachment file missing')&&!(await image.innerText()).includes('图片已保存'));
  backend.files.set(attachment.id,originalBytes);
  await page.evaluate(()=>{window.__DEBUG_PLATFORM__.dialogDelay=180;});
  await image.getByRole('button',{name:'导出原图…',exact:true}).evaluate(node=>{node.click();node.click();});await idle(page);
  await page.evaluate(()=>{window.__DEBUG_PLATFORM__.dialogDelay=0;});
  check('Repeated image clicks during processing open and write only one export',backend.exports.length===4);
  await command('image.close');
  await command('editor.insertText',{text:' IMAGE-UNDO79'});await command('editor.undo');
  check('Image export adds no document or Undo entry',!JSON.stringify((await state(page)).editorJSON).includes('IMAGE-UNDO79')&&JSON.stringify((await state(page)).editorJSON)===before);

  if(runtime.mobile){await command('menu.open',{menu:'view'});await page.getByRole('menuitem',{name:'数据管理',exact:true}).click();}else{await page.locator('.desktop-settings').click();await page.getByRole('tab',{name:'存储空间',exact:true}).click();}await idle(page);
  check('Actual unified settings data entry opens data management with real bridge DTO',await page.locator('.data-root').count()===1&&(await page.locator('.data-management').innerText()).includes('32.0 KB'));
  await command('data.navigate',{view:'all'});
  check('DB/WAL/SHM statuses and actual filesystem timestamp are rendered without payload reads',(await page.locator('.data-management').innerText()).includes('notes.sqlite3-shm')&&(await page.locator('.data-management').innerText()).includes('不存在')===false&&await page.locator('[data-file-path="notes.sqlite3-shm"]').getByText('缺失',{exact:false}).count()>0);
  const reads=backend.calls.filter(c=>c.command==='read_attachment').length;
  await page.getByRole('button',{name:`导出 ${attachment.displayName}`,exact:true}).click();await idle(page);
  check('Data row shares original-byte export without reading media into management DOM',backend.exports.length===5&&Buffer.from(backend.exports.at(-1).data,'base64').equals(tinyPNG)&&backend.calls.filter(c=>c.command==='read_attachment').length===reads);
  backend.dataExtras=Array.from({length:45},(_,i)=>({relativePath:`other/${i}-`+'超长路径'.repeat(8)+'.bin',category:'other',size:i,modifiedAt:1760000000000,exists:true,status:'file'}));
  backend.dataExtras.push({relativePath:'empty-directory',category:'other',size:null,modifiedAt:1760000000000,exists:true,status:'directory'},{relativePath:'blocked-link',category:'other',size:null,modifiedAt:1760000000000,exists:true,status:'symlink'});
  await command('data.refresh');
  check('All files are counted and paginated without silent truncation',(await page.locator('.data-count').innerText()).includes('52 / 全部 52')&&await page.locator('.data-file-list .data-file').count()===20);
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  check('Actual pagination reveals next files', (await page.locator('.data-pagination').innerText()).includes('第 2 / 3 页'));
  await command('data.filter',{kind:'image'});check('Command filter uses actual file view',await page.locator('.data-file-list .data-file').count()===2);
  await page.getByRole('textbox',{name:'搜索本地文件'}).fill('absent79');check('Filename search has explicit empty state',await page.getByText('没有匹配的文件',{exact:true}).count()===1);
  await command('data.filter',{query:'',kind:'all'});
  for (const [width,theme] of [[320,'light'],[390,'dark']]) {
    await close();await page.setViewportSize({width,height:844});await command('settings.update',{settings:{theme}});await open();await command('data.navigate',{view:'all'});
    const geometry=await page.locator('.preferences').evaluate(node=>{const r=node.getBoundingClientRect();const close=node.querySelector('[aria-label="关闭设置"]').getBoundingClientRect();return {width:r.width,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,close:{left:close.left,right:close.right,top:close.top,bottom:close.bottom},viewport:innerWidth};});metrics.push({width,theme,geometry});
    check(`${width}px ${theme} data management retains reachable close and no horizontal overflow`,geometry.scrollWidth<=geometry.clientWidth&&geometry.close.left>=0&&geometry.close.right<=width&&geometry.close.top>=0);
    await capture(`data79-${width}-${theme}`);
  }
  backend.configure({fail:{inventory:1}});await page.getByRole('button',{name:'刷新数据管理',exact:true}).click();await page.getByRole('button',{name:'重试读取',exact:true}).waitFor();
  check('Inventory failure retains prior data and explicit retry',await page.locator('.data-file-list .data-file').count()===20&&await page.getByRole('button',{name:'重试读取',exact:true}).count()===1);
  await page.getByRole('button',{name:'重试读取',exact:true}).click();await idle(page);
  check('Actual inventory retry restores current snapshot',await page.getByRole('button',{name:'重试读取',exact:true}).count()===0);
  backend.files.delete(backend.workspace.attachments[1].id);await command('data.refresh');await command('data.filter',{kind:'image'});
  check('Missing registered file is retained as missing and export disabled',await page.locator('.data-file-list .data-file').count()===2&&await page.locator('.data-file-list .data-export:disabled').count()===1);
  await close();await page.setViewportSize(runtime.viewport);await command('settings.update',{settings:{theme:'light'}});

  await open();let inventoryCalls=0;
  backend.call=async(c,a)=>{const result=await originalCall(c,a);if(c==='get_data_management'&&result.ok){const index=++inventoryCalls;result.value.rootPath=index===1?'/synthetic/old-late':'/synthetic/new-latest';if(index===1)await new Promise(done=>setTimeout(done,220));}return result;};
  const first=api(page,'data.refresh');await page.waitForTimeout(35);const second=api(page,'data.refresh');await Promise.all([first,second]);await idle(page);
  check('Late older refresh cannot overwrite newer snapshot',(await page.locator('.data-root').innerText()).includes('/synthetic/new-latest'));
  const pending=api(page,'data.refresh');await page.getByRole('button',{name:'关闭设置',exact:true}).click();await pending;await idle(page);
  check('Closed management page is not revived by late refresh',await page.locator('.data-management').count()===0);
  backend.call=originalCall;

  await reset();await add('backup79.png');await open();await command('settings.tab',{tab:'backup'});
  await page.getByRole('button',{name:'导出完整备份…',exact:true}).click();await idle(page);
  check('Actual management backup export shows completion after bridge finishes',(await page.locator('.data-management').innerText()).includes('完整备份已导出'));
  await close();await command('editor.insertText',{text:' AFTER-BACKUP79'});await command('app.flush');await open();await command('settings.tab',{tab:'backup'});
  // Explicit protocol events reproduce the real import prepare/commit UI lifecycle.
  backend.call=async(c,a)=>{if(c==='import_archive'){await prepare();await page.waitForSelector('.access-cover');const result=await originalCall(c,a);await commit();return {...result,value:backend.state()};}return originalCall(c,a);};
  await page.getByRole('button',{name:'导入备份…',exact:true}).click();await idle(page);await command('settings.tab',{tab:'data'});await page.waitForSelector('.storage-summary');
  check('Import prepare/commit keeps the open management page and refreshes statistics after sensitive state clears',await page.locator('.data-management').count()===1&&!(backend.workspace.notes.find(n=>n.id==='note-a').plainText).includes('AFTER-BACKUP79'));
  backend.call=originalCall;await close();await command('recording.open');await command('recording.action',{action:'toggle'});await open();await command('settings.tab',{tab:'backup'});
  check('Active recording disables both backups with explicit unsaved-audio explanation',await page.getByRole('button',{name:'导入备份…',exact:true}).isDisabled()&&await page.getByRole('button',{name:'导出完整备份…',exact:true}).isDisabled()&&(await page.locator('.data-management').innerText()).includes('内存中的录音尚未备份'));
  await close();await command('recording.action',{action:'close'});

  await reset();await add('revoked-export79.png');
  const revokedId=backend.workspace.attachments[0].id;
  const dialogsBefore=await page.evaluate(()=>window.__DEBUG_PLATFORM__.calls.filter(x=>x.command==='plugin:dialog|save').length);
  await page.evaluate(()=>{window.__DEBUG_PLATFORM__.dialogDelay=300;});
  await command('image.preview',{id:revokedId});
  await page.getByRole('button',{name:'导出原图…',exact:true}).click();
  await page.waitForFunction(count=>window.__DEBUG_PLATFORM__.calls.filter(x=>x.command==='plugin:dialog|save').length>count,dialogsBefore);
  await prepare();backend.workspace.notes.find(n=>n.id==='note-a').locked=true;
  await commit();await idle(page);
  await saveJSON(resolve(output,'data79-revoked-export.json'),{exports:backend.exports.length,statuses:await page.locator('.image-export-status').allTextContents(),images:await page.locator('.image-open').evaluateAll(nodes=>nodes.map(n=>({html:n.outerHTML,visible:!!n.offsetParent}))),workspace:backend.state(),state:await state(page)});
  check('Revocation while the original-image picker waits leaves no exported bytes and no stale success notice',backend.exports.length===0&&await page.locator('.image-export-status[role="status"]').count()===0&&await page.locator('.image-open').count()===0);

  await reset();backend.configure({delay:{load:250,store:80}});await startSurfaceTrace(page);
  const choosing=chooseFiles(page,[{name:'concurrent79.png',mimeType:'image/png',buffer:tinyPNG}]);
  await page.waitForFunction(()=>document.querySelector('.tiptap')?.getAttribute('contenteditable')==='false');
  const currentMetadata=backend.state().metadata;await emit('notes-metadata',{metadata:{...currentMetadata,sessionId:'foreign-notification79'},changes:[]});await choosing;await idle(page);
  const concurrent=await stopSurfaceTrace(page);await saveJSON(resolve(output,'data79-strong-concurrent-timeline.json'),concurrent);
  check('Strong synchronization arriving during quiet validation upgrades and retains security cover',concurrent.coverFrames>0&&concurrent.hiddenFrames>0);
  await reset();backend.configure({delay:{load:160}});await startSurfaceTrace(page);
  let newSession=false;
  backend.call=async(c,a)=>{if(c==='load_workspace'&&!newSession){newSession=true;backend.sessionId='unknown-trusted-response79';}return originalCall(c,a);};
  await chooseFiles(page,[{name:'unknown-session79.png',mimeType:'image/png',buffer:tinyPNG}]);
  await page.waitForFunction(()=>document.body.textContent.includes('原附件目标、正文或授权状态已改变'));
  await command('app.dismissError');
  const unknown=await stopSurfaceTrace(page);await saveJSON(resolve(output,'data79-unknown-session-timeline.json'),unknown);
  check('Unknown trusted response session upgrades quiet presentation to a committed security cover',newSession&&unknown.coverFrames>0&&unknown.hiddenFrames>0&&backend.workspace.attachments.length===0);
  await reset();await startSurfaceTrace(page);await prepare();await page.waitForSelector('.access-cover');await page.screenshot({path:resolve(output,'data79-prepare-cover.png')});await commit();await idle(page);
  const protectedTrace=await stopSurfaceTrace(page);await saveJSON(resolve(output,'data79-prepare-timeline.json'),protectedTrace);
  check('Actual access prepare immediately covers protected content until trusted completion',protectedTrace.coverFrames>0&&protectedTrace.hiddenFrames>0);
  await reset();backend.configure({fail:{load:1}});await chooseFiles(page,[{name:'failed-sync79.png',mimeType:'image/png',buffer:tinyPNG}]);await page.waitForSelector('.access-cover button');
  check('Quiet trusted-load failure immediately leaves security cover and no inserted media',await page.locator('.app.access-sync').count()===1&&backend.workspace.attachments.length===0&&await page.locator('.access-cover').count()===1);
  await capture('data79-sync-failure');
  await reset();
  await saveJSON(resolve(output,'data79-metrics.json'),{metrics,pageErrors:runtime.errors,scope:runtime.metadata,limitations:['Synthetic file stat and output URI fixture; real Rust files/platform IO verified separately.','Import access events injected at protocol boundary, real App clearSensitive/trusted/Host lifecycle retained.']});
}
