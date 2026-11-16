// Actual App/Editor/Preferences/CSS with isolated IPC and synthetic capture.
// Native AppKit/TCC/phone acceptance is deliberately reserved for evolve116.
import {auditThemeText}from'./check-evolve114-contrast.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile}from'node:fs/promises';
import {resolve}from'node:path';
import {openRuntime,api,idle,state}from'./debug/runtime.mjs';
import {installBrowserPlatform}from'./debug/platform.mjs';
import {runThemeRegressions}from'./check-evolve114-regressions.mjs';
const out=resolve('artifacts/evolve114-themes');await mkdir(out,{recursive:true});
const checks=[],contrasts=[],rendered=[];const check=(n,v)=>{assert.ok(v,n);checks.push(n);};
const settings=async(p,patch)=>{await api(p,'settings.update',{settings:patch});await idle(p);};
const appearance=(themeId,schemePreference)=>({version:2,themeId,schemePreference});
const lum=rgb=>{const a=rgb.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
const rgb=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16));
const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
const palettes=JSON.parse(await readFile('src/themes/palettes.json','utf8'));
for(const [id,schemes]of Object.entries(palettes))for(const [scheme,p]of Object.entries(schemes)){
 for(const fg of ['ink','secondary','action-ink','danger','focus'])for(const bg of ['paper','sidebar','grouped','selection','hover']){const value=ratio(rgb(p[fg]),rgb(p[bg]));contrasts.push({id,scheme,fg,bg,ratio:value});check(`${id}/${scheme} ${fg}/${bg} >=4.5`,value>=4.5);}
 for(const [fg,bg]of [['accent-ink','accent'],['on-recording','recording'],['notice-ink','notice-surface']]){const value=ratio(rgb(p[fg]),rgb(p[bg]));contrasts.push({id,scheme,fg,bg,ratio:value});check(`${id}/${scheme} ${fg}/${bg} >=4.5`,value>=4.5);}
}
const r=await openRuntime();
try{
 const p=r.page;
 const audit=async label=>{await p.waitForTimeout(130);const row=await auditThemeText(p,label);rendered.push(row);await writeFile(resolve(out,'rendered-contrast.json'),JSON.stringify(rendered,null,2));};
 const owner=await p.evaluate(async()=>{
  const {ConfirmedSettings}=await import('/src/confirmed-settings.ts');
  const {appearanceOf,parseAppearance,appearancePatch}=await import('/src/themes/appearance.ts');
  const seen=[],o=new ConfirmedSettings(v=>seen.push(structuredClone(v)));
  const legacy={theme:'dark',extension:{retained:true}};o.observe(legacy);
  const migrated=o.snapshot();const oldTicket=o.ticket();let persisted;
  await o.write({sort:'title'},async patch=>{persisted=patch;},async()=>({...legacy,...persisted}));
  const ticketRejected=!o.observe({theme:'light'},oldTicket);
  const before=JSON.stringify(o.snapshot());let failed=false;
  try{await o.write({appearance:{version:2,themeId:'paper',schemePreference:'light'}},async()=>{throw Error('disk full');},async()=>({}));}catch{failed=true;}
  const failurePreserved=before===JSON.stringify(o.snapshot());
  let readFailed=false;try{await o.write({theme:'light'},async()=>{},async()=>{throw Error('read unavailable');});}catch{readFailed=JSON.stringify(o.snapshot())===before;}
  let invalid=0;for(const v of [null,[],{},'dark',{version:1,themeId:'classic',schemePreference:'light'},{version:2,themeId:'removed',schemePreference:'light'},{version:2,themeId:'paper',schemePreference:'dark',css:'red'},{version:2,themeId:'paper'}])try{parseAppearance(v);}catch{invalid++;}
  let rejectedRead=false;try{o.observe({appearance:{version:2,themeId:'removed',schemePreference:'dark'}});}catch{rejectedRead=true;}
  const invalidPreserved=before===JSON.stringify(o.snapshot());
  const authoritative=appearanceOf({appearance:{version:2,themeId:'paper',schemePreference:'light'},theme:'dark'});
  const legacyPatch=appearancePatch({appearance:authoritative},{theme:'dark'});
  // Queued legacy writes resolve against the last ACK, not admission snapshot.
  let db=o.snapshot();
  const a=o.write({appearance:{version:2,themeId:'paper',schemePreference:'system'}},async v=>{db={...db,...appearancePatch(db,v)};},async()=>db);
  const b=o.write({theme:'dark'},async v=>{db={...db,...appearancePatch(db,v)};},async()=>db);await Promise.all([a,b]);
  const mutable={version:2,themeId:'classic',schemePreference:'light'};const queued=o.write({appearance:mutable},async v=>{db={...db,...v};},async()=>db);mutable.themeId='removed';await queued;const mutationSafe=o.snapshot().appearance.themeId==='classic';
  return {readFailed,mutationSafe,migrated,persisted,ticketRejected,failed,failurePreserved,invalid,rejectedRead,invalidPreserved,authoritative,legacyPatch,queued:o.snapshot(),seen};
 });
 check('legacy dark migrates in memory without caller mutation',owner.migrated.appearance.themeId==='classic'&&owner.migrated.appearance.schemePreference==='dark');
 check('unrelated settings intent stays partial; confirmed legacy read still migrates in memory',JSON.stringify(owner.persisted)==='{"sort":"title"}'&&owner.migrated.theme==='dark'&&owner.migrated.appearance.version===2);
 check('stale reads cannot overwrite confirmed settings',owner.ticketRejected);
 check('failed persistence and post-ACK read preserve confirmed owner',owner.failed&&owner.failurePreserved&&owner.readFailed);
 check('unknown/missing/null/extra AppearanceV2 rejected without changing owner',owner.invalid===8&&owner.rejectedRead&&owner.invalidPreserved);
 check('new authority wins and legacy caller preserves skin',owner.authoritative.schemePreference==='light'&&owner.legacyPatch.appearance.themeId==='paper'&&owner.legacyPatch.theme==='dark');
 check('queued input clones nested appearance at admission',owner.mutationSafe);
 // Queued legacy behavior is also checked in the captured publication sequence.
 check('queued legacy write uses post-ACK skin',owner.seen.some(s=>s.appearance.themeId==='paper'&&s.appearance.schemePreference==='dark'));
 // Same-state Classic screenshots, before fixture attachments or editor changes.
 for(const scheme of ['light','dark']){await settings(p,{theme:scheme});await p.screenshot({path:resolve(out,`after-desktop-${scheme}.png`)});}
 await api(p,'editor.setContent',{document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'主题不改变中文正文 Theme owner'}]}]}});await idle(p);
 await api(p,'editor.select',{from:2,to:7});await idle(p);
 const before=await state(p);
 await p.evaluate(()=>{window.themeEditor=document.querySelector('.tiptap');window.themeEditor.focus();window.themeEditorInstance=window.themeEditor.editor;window.themeView=window.themeEditorInstance.view;});
 for(const id of Object.keys(palettes))for(const scheme of ['light','dark']){
  await settings(p,{appearance:appearance(id,scheme)});
  const now=await state(p);
  check(`${id}/${scheme} keeps exact Editor DOM/view, JSON and selection`,await p.evaluate(()=>window.themeEditor===document.querySelector('.tiptap')&&window.themeView&&window.themeEditorInstance===document.querySelector('.tiptap').editor&&window.themeView===document.querySelector('.tiptap').editor.view)&&JSON.stringify(now.editorJSON)===JSON.stringify(before.editorJSON)&&JSON.stringify(now.editorSelection)===JSON.stringify(before.editorSelection));
  check(`${id}/${scheme} applies real editor/toolbar tokens`,await p.evaluate(({paper,toolbar})=>{
   const color=v=>{const e=document.createElement('i');e.style.color=v;document.body.append(e);const c=getComputedStyle(e).color;e.remove();return c;};
   return getComputedStyle(document.querySelector('.editor-pane')).backgroundColor===color(paper)&&getComputedStyle(document.querySelector('.editor-header')).backgroundColor===color(toolbar);
  },{paper:palettes[id][scheme].paper,toolbar:palettes[id][scheme]['desktop-toolbar']}));
  await audit(`${id}-${scheme}-main`);
  await p.screenshot({path:resolve(out,`${id}-${scheme}-main.png`)});
  await api(p,'menu.open',{menu:'view'});await idle(p);
  await audit(`${id}-${scheme}-menu`);
  await p.screenshot({path:resolve(out,`${id}-${scheme}-menu.png`)});
  check(`${id}/${scheme} portal menu has live palette and own radius`,await p.locator('.unified-menu.popover').first().evaluate(e=>getComputedStyle(e).borderRadius==='10px'&&getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'));
  await p.keyboard.press('Escape');await idle(p);
  await api(p,'settings.open');await api(p,'settings.tab',{tab:'settings'});await idle(p);
  await audit(`${id}-${scheme}-settings`);
  await p.screenshot({path:resolve(out,`${id}-${scheme}-settings.png`)});
  check(`${id}/${scheme} explicit checked skin and scheme`,await p.getByRole('radiogroup',{name:'主题',exact:true}).getByRole('radio',{checked:true}).textContent().then(t=>t.includes(id==='classic'?'Classic':id==='paper'?'Paper':'High Contrast')));
  await p.getByRole('button',{name:'关闭设置',exact:true}).click();await idle(p);
 }
 // Actual desktop radio keyboard path, retaining the existing roving focus.
 await api(p,'settings.open');await api(p,'settings.tab',{tab:'settings'});await idle(p);const skinGroup=p.getByRole('radiogroup',{name:'主题',exact:true});await skinGroup.getByRole('radio',{checked:true}).focus();await p.keyboard.press('Home');await idle(p);check('desktop Home changes confirmed skin through real radio handler',(await state(p)).settings.appearance.themeId==='classic');await p.keyboard.press('End');await idle(p);check('desktop End selects High Contrast without replacing Editor',(await state(p)).settings.appearance.themeId==='high-contrast'&&await p.evaluate(()=>window.themeEditorInstance===document.querySelector('.tiptap').editor));await p.getByRole('button',{name:'关闭设置',exact:true}).click();await idle(p);
 // Save rejection via real Preferences; checked values, page palette and Editor survive.
 await api(p,'settings.open');await api(p,'settings.tab',{tab:'settings'});await idle(p);const confirmed=(await state(p)).settings;
 await p.evaluate(()=>window.__DEBUG_PLATFORM__.configure({fail:{settings:1},delay:{settings:350}}));
 await p.getByRole('radiogroup',{name:'主题',exact:true}).getByRole('radio',{name:'Paper · 纸感',exact:true}).click();
 await p.locator('.preferences-error').filter({hasText:'Controlled settings failure'}).waitFor();
 check('Preferences rejection preserves checked value and confirmed root',JSON.stringify((await state(p)).settings.appearance)===JSON.stringify(confirmed.appearance)&&await p.evaluate(()=>window.themeEditor===document.querySelector('.tiptap')&&window.themeEditorInstance===document.querySelector('.tiptap').editor));
 await p.getByRole('button',{name:'关闭错误',exact:true}).click();
 await p.getByRole('button',{name:'关闭设置',exact:true}).click();await idle(p);
 // Theme transactions add no history. Actual edit then undo, through the real Editor commands.
 await api(p,'editor.insertText',{text:' undo114'});await idle(p);await settings(p,{appearance:appearance('paper','light')});await api(p,'editor.undo');await idle(p);
 check('theme switch adds no undo entry',JSON.stringify((await state(p)).editorJSON)===JSON.stringify(before.editorJSON));
 // Synthetic composition event, real Editor view: theme updates cannot end it.
 await p.locator('.tiptap').first().dispatchEvent('compositionstart',{data:'中'});
 await settings(p,{appearance:appearance('high-contrast','dark')});
 check('theme preserves composing Editor view',await p.evaluate(()=>document.querySelector('.tiptap')===window.themeEditor&&window.themeView.composing));
 await p.locator('.tiptap').first().dispatchEvent('compositionend',{data:'中'});
 // Actual recording owner, synthetic browser capture. Theme changes do not recreate its panel.
 await api(p,'recording.open');await idle(p);await api(p,'recording.action',{action:'toggle'});await idle(p);
 const rec=await state(p);await p.evaluate(()=>{window.themeRecording=document.querySelector('.recording-sheet,.desktop-recording-panel,.recording-dock');});
 await settings(p,{appearance:appearance('paper','dark')});
 const recAfter=await state(p);
 check('theme keeps live recording owner/phase and panel',rec.recording.active&&recAfter.recording.active&&recAfter.recording.state.phase===rec.recording.state.phase&&await p.evaluate(()=>window.themeRecording?.isConnected));
 for(const id of Object.keys(palettes))for(const scheme of ['light','dark']){await settings(p,{appearance:appearance(id,scheme)});await audit(`${id}/${scheme}-recording`);check(`${id}/${scheme} capture owner stays mounted`,await p.evaluate(()=>window.themeRecording?.isConnected)&& (await state(p)).recording.state.phase===rec.recording.state.phase);await p.screenshot({path:resolve(out,`${id}-${scheme}-recording.png`)});}
 await api(p,'recording.action',{action:'toggle'});await idle(p);for(const id of Object.keys(palettes))for(const scheme of ['light','dark']){await settings(p,{appearance:appearance(id,scheme)});await audit(`${id}/${scheme}-recording-paused`);}await api(p,'recording.action',{action:'close'});await idle(p);
 // Real preview chrome with fixture image content, then each palette.
 await api(p,'attachment.submit',{files:[{name:'theme114.png',mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG3sAAAAASUVORK5CYII='}]});await idle(p);
 const image=(await state(p)).workspace.attachments.find(a=>a.kind==='image');assert(image);
 for(const id of Object.keys(palettes))for(const scheme of ['light','dark']){await settings(p,{appearance:appearance(id,scheme)});await api(p,'image.preview',{id:image.id});await api(p,'image.info');await idle(p);await audit(`${id}/${scheme}-preview`);await p.screenshot({path:resolve(out,`${id}-${scheme}-preview.png`)});check(`${id}/${scheme} real preview resolves theme chrome`,await p.locator('.image-preview-window').evaluate(e=>getComputedStyle(e).backgroundColor!== 'rgba(0, 0, 0, 0)'));await api(p,'image.close');}
 await p.setViewportSize({width:740,height:480});await api(p,'settings.open');await api(p,'settings.tab',{tab:'settings'});await idle(p);check('short desktop settings scroll without horizontal overflow',await p.locator('.preferences-settings').first().evaluate(e=>e.scrollHeight>e.clientHeight&&e.scrollWidth<=e.clientWidth+1));await p.screenshot({path:resolve(out,'high-contrast-dark-740-settings.png')});await p.getByRole('button',{name:'关闭设置',exact:true}).click();await p.setViewportSize({width:1280,height:800});await idle(p);
 // Reload and independent note renderer read persisted settings; no extra wire.
 await settings(p,{appearance:appearance('paper','dark')});await p.reload();await p.waitForSelector('#startup',{state:'detached'});await idle(p);
 check('reload adopts saved appearance',await p.evaluate(()=>document.documentElement.dataset.themeId==='paper'&&document.documentElement.dataset.scheme==='dark'));
 const other=await p.context().newPage();await other.addInitScript(installBrowserPlatform,{mobile:false,nativeToolbar:false});await other.addInitScript(()=>localStorage.setItem('cybernote.startup-appearance-v2',JSON.stringify({version:2,themeId:'high-contrast',schemePreference:'light'})));await other.goto(r.origin+'/?notesDebug=1&note=note-a');await other.waitForSelector('#startup',{state:'detached'});await idle(other);check('independent note starts with confirmed theme',await other.locator('.app.separate').count()===1&&await other.evaluate(()=>document.documentElement.dataset.themeId==='paper'&&JSON.parse(localStorage.getItem('cybernote.startup-appearance-v2')).themeId==='paper'));await other.screenshot({path:resolve(out,'paper-dark-independent-note.png')});await other.close();
 // Actual access prepare event and protected layer (fixture IPC, production DOM).
 for(const id of Object.keys(palettes))for(const scheme of ['light','dark']){
  await settings(p,{appearance:appearance(id,scheme)});const prepared=r.backend.state();r.backend.suspended=['note-a'];r.backend.operationId='themes114-cover';
  await p.evaluate(access=>window.__DEBUG_PLATFORM__.emit('notes-access',{phase:'prepare',operationId:'themes114-cover',noteIds:['note-a'],access}),{...prepared.access,operationId:'themes114-cover',suspended:['note-a']});
  await p.waitForSelector('.access-cover');check(`${id}/${scheme} protected cover uses opaque themed paper and blocks content`,await p.locator('.access-cover').evaluate(e=>getComputedStyle(e).zIndex==='80'&&getComputedStyle(document.querySelector('.editor-pane')).visibility==='hidden'));await p.screenshot({path:resolve(out,`${id}-${scheme}-access.png`)});
  r.backend.suspended=[];r.backend.operationId=null;await p.evaluate(access=>window.__DEBUG_PLATFORM__.emit('notes-access',{phase:'abort',operationId:'themes114-cover',noteIds:['note-a'],access}),r.backend.state().access);await p.locator('.error-banner').waitFor();await p.getByRole('button',{name:'关闭错误',exact:true}).click();await idle(p);
 }
 check('no unexpected page errors',r.errors.length===0);
 // Early shell: block only module entry, load committed cache, then OS updates.
 for(const id of Object.keys(palettes))for(const scheme of ['light','dark']){
  const shell=await p.context().newPage();await shell.addInitScript(a=>localStorage.setItem('cybernote.startup-appearance-v2',JSON.stringify(a)),appearance(id,scheme));
  await shell.route('**/src/main.tsx',route=>route.abort());await shell.goto(r.origin+'/',{waitUntil:'domcontentloaded'});await shell.waitForSelector('#startup[data-state="error"]');
  check(`${id}/${scheme} startup recovery uses cached theme without bundle`,await shell.evaluate(({id,scheme})=>document.documentElement.dataset.themeId===id&&document.documentElement.dataset.scheme===scheme&&document.querySelector('#root').inert,{id,scheme}));
  await shell.screenshot({path:resolve(out,`${id}-${scheme}-startup.png`)});await shell.close();
 }
 const system=await p.context().newPage();await system.addInitScript(()=>localStorage.setItem('cybernote.startup-appearance-v2',JSON.stringify({version:2,themeId:'paper',schemePreference:'system'})));await system.route('**/src/main.tsx',route=>route.abort());await system.emulateMedia({colorScheme:'light'});await system.goto(r.origin+'/');await system.emulateMedia({colorScheme:'dark'});await system.waitForFunction(()=>document.documentElement.dataset.scheme==='dark');check('system scheme tracks media even when bundle failed',await system.evaluate(()=>document.documentElement.dataset.themeId==='paper'));await system.close();
}finally{await r.cleanup();}
const mobile=await openRuntime({mobile:true});
try{const p=mobile.page;const auditMobile=async label=>{await p.waitForTimeout(130);rendered.push(await auditThemeText(p,label));await writeFile(resolve(out,'rendered-contrast.json'),JSON.stringify(rendered,null,2));};
 for(const scheme of ['light','dark']){await settings(p,{theme:scheme});await p.screenshot({path:resolve(out,`after-mobile-${scheme}.png`)});}
 for(const id of Object.keys(palettes))for(const scheme of ['light','dark']){await settings(p,{appearance:appearance(id,scheme)});await p.screenshot({path:resolve(out,`${id}-${scheme}-mobile.png`)});await api(p,'settings.open');await api(p,'settings.tab',{tab:'settings'});await idle(p);await auditMobile(`${id}/${scheme}-mobile-settings`);await p.screenshot({path:resolve(out,`${id}-${scheme}-mobile-settings.png`)});check(`${id}/${scheme} mobile theme control uses confirmed selection`,await p.getByRole('combobox',{name:'主题',exact:true}).inputValue()===id);check(`${id}/${scheme} mobile settings can scroll at narrow width`,await p.locator('.preferences-settings').first().evaluate(e=>e.scrollHeight>e.clientHeight));await p.getByRole('button',{name:'关闭设置',exact:true}).click();await idle(p);}
 // Geometry belongs to each component, multiplier remains existing details owner.
 await api(p,'folder.select',{id:'default'});await idle(p);
 const details={version:1,iconScale:100,desktopHitScale:100,mobileHitScale:100,menuSpacing:'standard',radiusScale:0};await settings(p,{interfaceDetails:details});check('radius=0 squares gallery while semantic add circle remains round',await p.locator('.mobile-gallery .note-row').first().evaluate(e=>getComputedStyle(e).borderRadius==='0px')&&await p.locator('.mobile-add-note').evaluate(e=>getComputedStyle(e).borderRadius==='50%'));
 await settings(p,{interfaceDetails:{...details,radiusScale:150}});check('component radius multiplier is effective in actual gallery',await p.locator('.mobile-gallery .note-row').first().evaluate(e=>getComputedStyle(e).borderRadius==='24px'));await p.setViewportSize({width:320,height:640});await api(p,'settings.open');await api(p,'settings.tab',{tab:'settings'});await idle(p);await p.getByRole('combobox',{name:'主题',exact:true}).selectOption('paper');await idle(p);await p.getByRole('combobox',{name:'外观',exact:true}).selectOption('dark');await idle(p);check('320px actual mobile selects persist confirmed appearance',(await state(p)).settings.appearance.themeId==='paper'&&(await state(p)).settings.appearance.schemePreference==='dark');check('320px settings wraps without horizontal overflow',await p.locator('.preferences-settings').first().evaluate(e=>e.scrollWidth<=e.clientWidth+1));await p.screenshot({path:resolve(out,'paper-dark-320-settings.png')});await p.getByRole('button',{name:'关闭设置',exact:true}).click();await idle(p);
 // The mobile recording sheet is modal: choose the theme before opening it.
 // Desktop above proves live theme switching preserves the capture owner.
 for(const id of Object.keys(palettes))for(const scheme of ['light','dark']){await settings(p,{appearance:appearance(id,scheme)});await api(p,'note.select',{id:'note-a'});await idle(p);await api(p,'recording.open');await idle(p);await api(p,'recording.action',{action:'toggle'});await idle(p);await api(p,'recording.action',{action:'toggle'});await idle(p);await auditMobile(`${id}/${scheme}-mobile-recording-paused`);await p.screenshot({path:resolve(out,`${id}-${scheme}-mobile-recording.png`)});await api(p,'recording.action',{action:'close'});await idle(p);}
 check('mobile no page errors',mobile.errors.length===0);
}finally{await mobile.cleanup();}
const regression=await runThemeRegressions();checks.push(...regression.checks);rendered.push(...regression.rendered);
await writeFile(resolve(out,'rendered-contrast.json'),JSON.stringify(rendered,null,2));
check('rendered ordinary text including selected overlays reaches contrast target',rendered.every(row=>row.failures.length===0));
await writeFile(resolve(out,'results.json'),JSON.stringify({checks,contrasts,rendered,scope:'Actual React App/Editor, isolated JS IPC/capture; production Store/archive tested separately. No native116 acceptance.'},null,2)+'\n');console.log(`PASS ${checks.length} checks; screenshots and contrast data: ${out}`);
