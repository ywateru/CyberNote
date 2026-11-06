import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]||'/private/tmp/apple-notes-ui8081-candidate');
const out='/private/tmp/apple-notes-ui8081-independent/dom-focused';
const {openRuntime,api,idle,state,snapshot}=await import(pathToFileURL(resolve(root,'scripts/debug/runtime.mjs')));
const {chooseFiles,tinyPNG}=await import(pathToFileURL(resolve(root,'scripts/debug/mobile-attachments.mjs')));
const {sourceFingerprint}=await import(pathToFileURL(resolve(root,'scripts/debug/source-identity.mjs')));
await mkdir(out,{recursive:true});
const before=await sourceFingerprint(root);assert.equal(before.sha256,'ffa7cdaff8e2694db35f4199063284307d15fbf6f803d13c442a173931118ad4');
await writeFile(resolve(out,'source-before.json'),JSON.stringify(before,null,2)+'\n');
const checks=[],started=performance.now();let runtime,failure;
const check=(label,value)=>{assert(value,label);checks.push(label);};
try{
 runtime=await openRuntime({root});const {page,backend}=runtime;
 const cmd=async(command,args={})=>{const r=await api(page,command,args);await idle(page);return r;};
 const capture=async(name,selector)=>{await page.screenshot({path:resolve(out,name+'.png')});await writeFile(resolve(out,name+'.html.txt'),await page.locator(selector).evaluate(n=>n.outerHTML));await writeFile(resolve(out,name+'.snapshot.json'),JSON.stringify(await snapshot(page,{selector,maxChars:60000,maxNodes:180}),null,2)+'\n');};
 const official=await readFile(resolve(root,'scripts/debug/fixtures/tauri-drag-2.12.5.js'),'utf8');
 await page.addScriptTag({content:official.replace('__TEMPLATE_os_name__','"macos"')});
 const count=()=>page.evaluate(()=>window.__DEBUG_PLATFORM__.calls.filter(x=>x.command==='plugin:window|internal_toggle_maximize').length);
 const event=async(selector,type,extra={})=>page.locator(selector).first().dispatchEvent(type,{button:0,detail:2,clientX:7,clientY:7,...extra});
 for(const selector of ['.sidebar-toolbar','.notes-header','.editor-header']){
  const n=await count();await event(selector,'mousedown');check(selector+' macOS double-down does not toggle',await count()===n);
  await event(selector,'mouseup');check(selector+' macOS stationary double-up toggles once',await count()===n+1);
  await event(selector,'dblclick');check(selector+' React dblclick adds no second toggle',await count()===n+1);
 }
 const n=await count();await event('.notes-header','mousedown');await event('.notes-header','mouseup',{clientX:8});await event('.notes-header','dblclick',{clientX:8});check('Official macOS moved double click cancels window toggle',await count()===n);
 for(const selector of ['.sidebar-toolbar button','.notes-header button','.editor-header button','.desktop-search input','.tiptap']){
  const n=await count();await event(selector,'mousedown');await event(selector,'mouseup');await event(selector,'dblclick');check(selector+' interactive double click has no window toggle',await count()===n);
 }
 await runtime.reset();
 const name='独立长名称图片'.repeat(15)+'.png';await chooseFiles(page,[{name,mimeType:'image/png',buffer:tinyPNG}]);await idle(page);
 const attachment=backend.workspace.attachments[0];await page.waitForFunction(()=>document.querySelector('.image-open img')?.naturalWidth>0);
 const documentBefore=JSON.stringify((await state(page)).editorJSON);
 await page.locator('.image-open').first().click();await page.waitForSelector('.image-preview');
 check('Preview opens via actual image button as protected direct App child',await page.locator('.image-preview').evaluate(n=>n.parentElement.classList.contains('app')&&!n.closest('.attachment-node,.editor-scroll,.tiptap')));
 check('No save control remains on body image',await page.locator('.image-attachment .save-image').count()===0);
 await page.getByRole('button',{name:'图片信息',exact:true}).click();const info=await page.locator('.image-preview-info').innerText();
 check('Preview information uses actual authorized bytes/MIME/natural dimensions',info.includes(name)&&info.includes('image/png')&&info.includes(tinyPNG.length+' 字节')&&info.includes('1 × 1 像素'));
 await page.setViewportSize({width:800,height:700});await page.locator('.app').evaluate(n=>n.style.setProperty('--native-top','52px'));
 check('Preview header geometry respects simulated 52px native chrome',await page.locator('.image-preview').evaluate(n=>{const b=[...n.querySelectorAll('header button')].map(x=>x.getBoundingClientRect());return n.getBoundingClientRect().top>=52&&n.scrollWidth<=n.clientWidth&&b.every((x,i)=>x.top>=52&&x.right<=800&&(!i||x.left>=b[i-1].right));}));
 await capture('preview-protected-global-layer','.image-preview');
 await page.evaluate(()=>window.__DEBUG_PLATFORM__.configure({dialog:{save:[null]}}));await page.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(page);check('Preview save cancel writes nothing and shows no success',backend.exports.length===0&&!(await page.locator('.image-preview').innerText()).includes('图片已保存'));
 await page.getByRole('button',{name:'导出原图…',exact:true}).click();await idle(page);check('Preview exports original attachment bytes once',backend.exports.length===1&&backend.exports[0].id===attachment.id&&Buffer.from(backend.exports[0].data,'base64').equals(tinyPNG));
 const focusBeforeEscape=await page.evaluate(()=>({active:document.activeElement?.outerHTML.slice(0,1800),inside:!!document.activeElement?.closest('.image-preview')}));
 await page.keyboard.press('Escape');await idle(page);
 const escapeProbe={focusBeforeEscape,previewCount:await page.locator('.image-preview').count(),documentUnchanged:JSON.stringify((await state(page)).editorJSON)===documentBefore,activeAfter:await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,1800))};
 await writeFile(resolve(out,'escape-after-export.json'),JSON.stringify(escapeProbe,null,2)+'\n');
 if(escapeProbe.previewCount!==0||!escapeProbe.documentUnchanged)await capture('escape-after-export-failure','.app');
 check('Escape removes global preview without document mutation',escapeProbe.previewCount===0&&escapeProbe.documentUnchanged);
 await page.locator('.app').evaluate(n=>n.style.setProperty('--native-top','0px'));
 backend.configure({fail:{inventory:100}});await cmd('data.open');await page.getByRole('button',{name:'重试读取',exact:true}).waitFor();
 check('Inventory failure without snapshot preserves two enabled recovery controls',await page.locator('.data-backup-actions button').evaluateAll(nodes=>nodes.length===2&&nodes.every(n=>!n.disabled))&&await page.locator('[data-storage-total]').count()===0);
 await capture('inventory-failure-recovery','.data-management');
 await page.evaluate(()=>window.__DEBUG_PLATFORM__.configure({dialog:{save:[null]}}));await page.getByRole('button',{name:'导出完整备份…',exact:true}).click();await idle(page);check('No-snapshot archive cancel retains recovery and no success',await page.locator('.data-backup-actions button').count()===2&&await page.getByText('完整备份已导出',{exact:true}).count()===0);
 backend.configure({fail:{inventory:0}});await page.getByRole('button',{name:'重试读取',exact:true}).click();await idle(page);await page.waitForSelector('.storage-summary');
 const inventories=backend.calls.filter(x=>x.command==='get_data_management').length;
 for(const view of ['database','logs','image','other','all','overview']){await cmd('data.navigate',{view});check('Combined registered navigation reaches '+view,await page.locator('.data-management').getAttribute('data-storage-view')===view);}
 check('Category navigation reuses current real snapshot',backend.calls.filter(x=>x.command==='get_data_management').length===inventories);
 await page.locator('[data-storage-category="all"]').click();await page.getByRole('textbox',{name:'搜索本地文件'}).fill('notes.sqlite3');check('All-files detail can search actual database record',await page.locator('[data-file-path="notes.sqlite3"]').count()===1);
 await page.getByRole('button',{name:'返回数据管理总览',exact:true}).click();await capture('storage-overview-combined','.data-management');
 check('No page errors in independent targeted flow',runtime.errors.length===0);
}catch(error){failure={message:error.message,stack:error.stack};throw error;}
finally{
 if(runtime)await runtime.cleanup();
 const after=await sourceFingerprint(root);await writeFile(resolve(out,'source-after.json'),JSON.stringify(after,null,2)+'\n');
 const result={status:failure?'FAIL':'PASS-FOCUSED-DOM-AND-MAC-DRAG',sourceBefore:before.sha256,sourceAfter:after.sha256,sourceUnchanged:before.sha256===after.sha256,runnerSha256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),wallSeconds:(performance.now()-started)/1000,checks,failure,scope:runtime?.metadata,limits:['Official macos JS mousedown/mouseup/dblclick handlers and production React DOM in isolated Chrome; IPC/window actions and inventory filesystem are synthetic.','52px preview chrome is CSS geometry simulation; real AppKit proof is separately preserved in native/.','No device, installed application, user data or real microphone access.']};await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:checks.length,sourceUnchanged:result.sourceUnchanged,wallSeconds:result.wallSeconds}));
 if(before.sha256!==after.sha256)throw Error('Source changed during independent validation');
}
