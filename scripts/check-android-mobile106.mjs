// Real App/PM/selection/layout. Native IPC, persistence and IME are fixture boundaries, not device proof.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state } from './debug/runtime.mjs';
import {installBrowserPlatform} from './debug/platform.mjs';
const before = process.argv.includes('--before');
const baselineCssPath=process.argv[process.argv.indexOf('--baseline-css')+1];
const baselineCss=process.argv.includes('--baseline-css')?await readFile(baselineCssPath,'utf8'):null;
const out = resolve('artifacts/android-mobile106', before ? 'before' : 'after');
await mkdir(out, {recursive:true});
const r = await openRuntime({mobile:true});
const {page}=r;
const panel=page.getByRole('dialog',{name:'格式',exact:true});
const checks=[];const check=(name,value)=>{assert(value,name);checks.push(name);};
const geometry=async p=>p.evaluate(()=>{
 const rect=s=>{const e=document.querySelector(s),r=e?.getBoundingClientRect();return e?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,display:getComputedStyle(e).display}:null;};
 return {width:innerWidth,height:innerHeight,sidebar:rect('.sidebar'),notes:rect('.notes-pane'),editor:rect('.editor-pane'),scroll:rect('.editor-scroll'),panel:rect('.mobile-format-panel'),tools:rect('.editor-pane .editor-tools')};
});
const checkMobileGeometry=async (p,name,open)=>{
 const g=await geometry(p);
 check(name+' only editor pane occupies viewport',g.sidebar.display==='none' && g.notes.display==='none' && g.editor.display==='flex' && g.editor.x===0 && g.editor.width===g.width && Math.abs(g.editor.height-g.height)<1);
 if(open)check(name+' format is bottom-docked and content stays above',g.panel && Math.abs(g.panel.x)<1 && Math.abs(g.panel.width-g.width)<1 && Math.abs(g.panel.bottom-g.height)<1 && g.scroll.bottom<=g.panel.y+1);
 else check(name+' editor toolbar stays at bottom',g.tools && Math.abs(g.tools.bottom-g.height)<1 && Math.abs(g.tools.width-g.width)<1 && g.scroll.bottom<=g.tools.y+1);
 return g;
};
try {
 await page.evaluate(()=>{window.mobile106Keyboard=[];window.NotesKeyboard={show(){window.mobile106Keyboard.push('show');},hide(){window.mobile106Keyboard.push('hide');}};});
 await page.setViewportSize({width:360,height:800});
 await api(page,'note.select',{id:'note-a'});await idle(page);
 await api(page,'editor.setContent',{document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'alpha beta'}]}]}});
 await api(page,'editor.select',{from:1,to:6});
 await page.getByRole('button',{name:'格式',exact:true}).tap();await panel.waitFor();
 const initial=await state(page);
 await page.evaluate(()=>{window.mobile106View=document.querySelector('.tiptap').pmViewDesc.view;window.mobile106Dom=document.querySelector('.tiptap');});
 await page.setViewportSize({width:740,height:360});
 await page.waitForFunction(()=>innerWidth===740);await idle(page);
 const changed=await state(page);
 const facts={initial:initial.editorSession,changed:changed.editorSession,selection:changed.editorSelection,classes:await page.locator('.app').getAttribute('class'),owner:changed.selection.noteId};
 await writeFile(resolve(out,'width-transition.json'),JSON.stringify(facts,null,2));
 if(before){
  check('old App crosses to desktop on Android width740',await page.locator('.app.desktop').count()===1);
  check('old App closes format as navigation on same note',changed.editorSession.panel==='none' && changed.editorSession.lastClose==='navigation' && changed.selection.noteId==='note-a');
  await page.screenshot({path:resolve(out,'width740.png')});
 }else{
  check('native Android width740 retains mobile layout and same note',await page.locator('.app.mobile').count()===1 && changed.selection.noteId==='note-a');
  check('format and nonempty PM selection survive landscape',await panel.isVisible() && changed.editorSelection.anchor===1 && changed.editorSelection.head===6);
  check('same connected Editor DOM survives width transition',await page.evaluate(()=>window.mobile106Dom===document.querySelector('.tiptap') && window.mobile106Dom.isConnected && window.mobile106View===document.querySelector('.tiptap').pmViewDesc.view));
  await panel.getByRole('button',{name:'粗体',exact:true}).tap();await idle(page);
  check('format command applies only selected alpha',await page.locator('.tiptap strong').textContent()==='alpha');
  check('registered Editor owner remains stable',JSON.stringify(initial.quietWindow.editors.map(e=>[e.id,e.owner]))===JSON.stringify((await state(page)).quietWindow.editors.map(e=>[e.id,e.owner])));
  const geometries=[await checkMobileGeometry(page,'landscape740',true)];
  await page.screenshot({path:resolve(out,'landscape-format.png')});
  const beforeResize=await state(page);const beforeCalls=await page.evaluate(()=>window.mobile106Keyboard.slice());
  const positions=[];
  for(const size of [{width:1024,height:600},{width:360,height:800},{width:740,height:580},{width:500,height:340},{width:360,height:420}]){
   await page.setViewportSize(size);await idle(page);
   const current=await state(page);
   check('panel/selection/owner/generation persist at '+size.width+'x'+size.height,await panel.isVisible() && current.selection.noteId==='note-a' && current.editorSelection.anchor===1 && current.editorSelection.head===6 && current.editorSession.generation===initial.editorSession.generation && JSON.stringify(current.quietWindow.editors.map(e=>[e.id,e.owner]))===JSON.stringify(initial.quietWindow.editors.map(e=>[e.id,e.owner])) && await page.evaluate(()=>window.mobile106Dom===document.querySelector('.tiptap') && window.mobile106View===document.querySelector('.tiptap').pmViewDesc.view));
   check('resize does not write doc or issue IME intent at '+size.width+'x'+size.height,JSON.stringify(current.editorJSON)===JSON.stringify(beforeResize.editorJSON) && JSON.stringify(await page.evaluate(()=>window.mobile106Keyboard))===JSON.stringify(beforeCalls));
   geometries.push(await checkMobileGeometry(page,size.width+'x'+size.height,true));
   positions.push({size,selection:current.editorSelection,session:current.editorSession,owners:current.quietWindow.editors.map(e=>[e.id,e.owner])});
  }
  await api(page,'editor.select',{from:7,to:11});
  await panel.getByRole('button',{name:'斜体',exact:true}).tap();await idle(page);
  check('format bookmark still follows chosen beta after all resizes',await page.locator('.tiptap em').textContent()==='beta' && await panel.isVisible());
  await writeFile(resolve(out,'resize-stations.json'),JSON.stringify(positions,null,2));
  await panel.getByRole('button',{name:'关闭格式',exact:true}).tap();
  for(const size of [{width:740,height:360},{width:1024,height:600}]){
   await page.setViewportSize(size);await idle(page);geometries.push(await checkMobileGeometry(page,'closed'+size.width,false));
   await page.screenshot({path:resolve(out,'toolbar-'+size.width+'.png')});
  }
  await writeFile(resolve(out,'geometry.json'),JSON.stringify(geometries,null,2));
  const controls=await page.locator('.editor-pane .editor-tools button').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label')||e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
  check('mobile bottom toolbar controls remain touchable',controls.length>0 && controls.every(c=>c.width>=44 && c.height>=44));
  await api(page,'menu.open',{menu:'format'});await api(page,'note.select',{id:'note-b'});await idle(page);
  check('true note navigation still invalidates format',await panel.count()===0 && (await state(page)).editorSession.pendingFocus===null);
  await api(page,'menu.open',{menu:'format'});await api(page,'modal.open',{type:'lock',value:'106-test-password'});
  check('real modal blocked boundary still clears panel',await panel.count()===0);
  await api(page,'modal.submit');await idle(page);
  check('access lock removes editable owner and old focus',await page.locator('.tiptap[contenteditable=true]').count()===0 && (await state(page)).editorSession.pendingFocus===null);
  await page.screenshot({path:resolve(out,'access-boundary.png')});
  await writeFile(resolve(out,'bottom-controls.json'),JSON.stringify(controls,null,2));
  // Seed valid persisted, unlocked selection through the fixture boundary. Cold
  // mobile navigation must ignore the desktop selection, not rely on locked b.
  r.backend.workspace.settings.selectedFolder='default';r.backend.workspace.settings.selectedNote='note-a';
  assert(!r.backend.workspace.notes.find(n=>n.id==='note-a').locked);
  // Reload the real page at landscape width: mobile initial navigation must match resize.
  await page.setViewportSize({width:740,height:360});await page.reload();await page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1);await idle(page);
  check('landscape cold initialization keeps mobile list navigation',await page.locator('.app.mobile.page-notes').count()===1 && (await state(page)).selection.noteId===null && (await state(page)).selection.folderId==='all' && (await state(page)).editorSession.pendingFocus===null && (await state(page)).settings.selectedNote==='note-a');
 }
 if(!before){
  const cases=[
   {name:'native Mac',native:true,mac:true,ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'},
   {name:'Android ordinary Web',native:false,mac:false,ua:'Mozilla/5.0 (Linux; Android 14)'},
   {name:'separate native Android',native:true,mac:false,ua:'Mozilla/5.0 (Linux; Android 14)',separate:true},
  ];
  for(const item of cases){
   const context=await page.context().browser().newContext({viewport:{width:699,height:800},userAgent:item.ua});
   try{
    await context.addInitScript(({source,options,native})=>{(0,eval)('('+source+')')(options);window.isTauri=native;},{source:installBrowserPlatform.toString(),options:{mobile:!item.mac,nativeToolbar:item.mac},native:item.native});
    const other=await context.newPage();other.on('pageerror',e=>r.errors.push(item.name+': '+e.message));
    await other.goto(r.origin+'/?notesDebug=1'+(item.separate?'&note=note-a':''));
    await other.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1);await idle(other);
    check(item.name+' cold breakpoint699',await other.locator(item.separate?'.app.desktop.separate':'.app.mobile').count()===1);
    await other.setViewportSize({width:700,height:800});await idle(other);
    check(item.name+' breakpoint700 stays original desktop rule',await other.locator('.app.desktop').count()===1);
    if(baselineCss){
     for(const width of item.separate?[699,740]:[740]){
      await other.setViewportSize({width,height:800});await idle(other);
      const style=other.locator('style[data-vite-dev-id$="/src/style.css"]');assert.equal(await style.count(),1);
      const actual=await geometry(other),current=await style.textContent();
      await style.evaluate((el,css)=>el.textContent=css,baselineCss);
      const old=await geometry(other);await style.evaluate((el,css)=>el.textContent=css,current);
      check(item.name+' desktop geometry unchanged from original CSS at '+width,JSON.stringify(actual)===JSON.stringify(old));
     }
    }
   }finally{await context.close();}
  }
 }
 check('no uncaught browser errors',r.errors.length===0);
 await writeFile(resolve(out,'result.json'),JSON.stringify({stage:before?'expected-old-failure':'fixed-App',checks,limitations:r.metadata.native},null,2));
 console.log(JSON.stringify({stage:before?'before':'after',checks}));
}finally{await r.cleanup();}
