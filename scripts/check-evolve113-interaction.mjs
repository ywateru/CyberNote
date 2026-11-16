// Real App/Editor/browser events; isolated IPC/storage/Android identity and IME.
// No installed package, native keyboard, user device or Rust persistence claim.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import ts from 'typescript';
import {openRuntime, api, idle, state} from './debug/runtime.mjs';
const out=resolve('artifacts/evolve113-interaction');
await mkdir(out,{recursive:true});
const checks=[],fonts=[],geometry=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const near=(a,b)=>Math.abs(a-b)<.02;
const font=(p,s)=>p.locator(s).first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
const settings=async(p,patch)=>{await api(p,'settings.update',{settings:patch});await idle(p);};
const touch=async(p,s,type,x=100,y=180)=>p.locator(s).first().dispatchEvent(type,{touches:type==='touchend'||type==='touchcancel'?[]:[{identifier:0,clientX:x,clientY:y}],changedTouches:[{identifier:0,clientX:x,clientY:y}]});
// Deterministic regression for the historical-height false positive, plus both
// resize and visual viewport IME models. These are adapter inputs, not an OS test.
const source=await readFile('src/editor-session/controller.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {EditorSession}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const session=new EditorSession({focus(){return false;},blur(){},keyboard(){}});
session.viewportChanged(800,360);session.viewportChanged(360,800);
check('rotation resets portrait height instead of reporting a 440px keyboard',!session.keyboardVisible);
session.viewportChanged(220,800);check('same-width adjustResize IME is observed',session.keyboardVisible);
session.viewportChanged(360,800);check('IME dismissal clears current visibility',!session.keyboardVisible);
session.viewportChanged(800,360,420);check('visual viewport IME is observed',session.keyboardVisible);
session.viewportChanged(800,360,800);check('visual viewport dismissal clears visibility',!session.keyboardVisible);

const desktop=await openRuntime();
try {
 const {page:p}=desktop;
 const widths=()=>p.evaluate(()=>Object.fromEntries(['sidebar','notes-pane','editor-pane'].map(s=>[s,document.querySelector('.'+s).getBoundingClientRect().width])));
 for(const width of [1100,1000,900,700,1280]){
  await p.setViewportSize({width,height:800});await idle(p);
  const g=await widths();geometry.push({width,...g});
  check('columns fit and editor retains space at '+width,g.sidebar+g['notes-pane']<=width-199);
  for(const name of ['sidebar','list']){
   const h=p.locator('.'+name+'-resize');
   const [lo,hi,now]=await Promise.all(['aria-valuemin','aria-valuemax','aria-valuenow'].map(a=>h.getAttribute(a).then(Number)));
   check(name+' separator exposes effective range at '+width,now>=lo&&now<=hi);
  }
 }
 await p.setViewportSize({width:1100,height:800});await idle(p);
 for(const name of ['sidebar','list']){
  const h=p.locator('.'+name+'-resize');
  await h.focus();const initial=Number(await h.getAttribute('aria-valuenow'));
  await h.press('ArrowRight');await idle(p);
  check(name+' arrow moves actual geometry by 8px at 1100',Number(await h.getAttribute('aria-valuenow'))===initial+8);
  await h.press('Shift+ArrowLeft');await idle(p);
  check(name+' Shift arrow moves 24px',Number(await h.getAttribute('aria-valuenow'))===initial-16);
  await h.press('End');await idle(p);check(name+' End reaches effective max',(await h.getAttribute('aria-valuenow'))===(await h.getAttribute('aria-valuemax')));
  await h.press('Home');await idle(p);check(name+' Home reaches effective min',(await h.getAttribute('aria-valuenow'))===(await h.getAttribute('aria-valuemin')));
 }
 await settings(p,{sidebarWidth:260,listWidth:330});
 for(const name of ['sidebar','list']){
  const h=p.locator('.'+name+'-resize');const key=name==='sidebar'?'sidebarWidth':'listWidth';
  for(const terminal of ['pointercancel','lostpointercapture']){
   const box=await h.boundingBox();const x=box.x+3,y=box.y+30;
   await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+30,y);await p.waitForTimeout(50);
   check(name+' pointer drag gives real feedback before '+terminal,Number(await h.getAttribute('aria-valuenow'))===(key==='sidebarWidth'?290:360));
   await h.dispatchEvent(terminal,{pointerId:1});await p.mouse.up();await idle(p);
   check(name+' '+terminal+' restores confirmed preference',(await state(p)).settings[key]===(key==='sidebarWidth'?260:330)&&Number(await h.getAttribute('aria-valuenow'))===(key==='sidebarWidth'?260:330));
   await p.mouse.move(x+80,y);await idle(p);
   check(name+' '+terminal+' leaves no drag',Number(await h.getAttribute('aria-valuenow'))===(key==='sidebarWidth'?260:330));
  }
  const box=await h.boundingBox();await p.mouse.move(box.x+3,box.y+30);await p.mouse.down();await p.mouse.move(box.x+23,box.y+30);await p.mouse.up();await idle(p);
  check(name+' pointerup persists actual width',(await state(p)).settings[key]===(key==='sidebarWidth'?280:350));
 }
 await settings(p,{sidebarWidth:350,listWidth:470});
 await p.setViewportSize({width:900,height:800});await idle(p);const narrow=await widths();
 check('narrow window clamps effective width without writing preference',(await state(p)).settings.listWidth===470&&narrow['notes-pane']<470);
 await p.setViewportSize({width:1280,height:800});await idle(p);
 check('wide window restores preferred pixels',(await widths())['notes-pane']===470);
 await settings(p,{interfaceFontSize:'huge'});check('font size does not multiply preferred widths',(await widths()).sidebar===350&&(await widths())['notes-pane']===470);
 await settings(p,{view:'gallery'});
 const card=p.locator('.note-row[data-note-id="note-a"]');
 for(const key of ['Enter','Space']){
  await card.focus();await card.press(key);await idle(p);
  check(key+' opens gallery editor',await p.locator('.app.gallery-edit').count()===1&&await p.locator('.tiptap').first().isVisible());
  await p.getByRole('button',{name:'返回画廊',exact:true}).click();await idle(p);
  check(key+' return restores card focus',await card.evaluate(e=>e===document.activeElement));
 }
 await card.focus();await card.press('Enter');await idle(p);
 await api(p,'editor.setContent',{document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'preserved gallery body'}]}]}});
 await api(p,'editor.select',{from:1,to:10});await idle(p);
 const before=await state(p);await p.evaluate(()=>{window.e113Editor=document.querySelector('.tiptap');window.e113Editor.focus();});
 await p.evaluate(()=>window.__DEBUG_PLATFORM__.configure({fail:{settings:1},delay:{settings:500}}));
 const rejected=settings(p,{view:'list'});void rejected.catch(()=>{});
 await p.waitForTimeout(100);
 check('pending view write keeps gallery editor visible',await p.locator('.app.gallery-edit').count()===1);
 await assert.rejects(rejected,/Controlled settings failure/);
 const failed=await state(p);
 check('view failure retains gallery editor and confirmed view',await p.locator('.app.gallery-edit').count()===1&&failed.settings.view==='gallery');
 check('view failure retains exact Editor, body, selection and focus',await p.evaluate(()=>window.e113Editor===document.querySelector('.tiptap')&&document.activeElement===window.e113Editor)&&JSON.stringify(before.editorJSON)===JSON.stringify(failed.editorJSON)&&JSON.stringify(before.editorSelection)===JSON.stringify(failed.editorSelection));
 check('view failure is visible',await p.getByRole('alert').filter({hasText:'Controlled settings failure'}).count()===1);
 await api(p,'app.dismissError');await settings(p,{view:'list'});check('successful retry applies list',await p.locator('.app.gallery-edit').count()===0&&(await state(p)).settings.view==='list');
 await p.screenshot({path:resolve(out,'desktop.png')});check('desktop has no uncaught errors',desktop.errors.length===0);
} finally {await desktop.cleanup();}

const mobile=await openRuntime({mobile:true});
try {
 const {page:p}=mobile;
 await p.setViewportSize({width:320,height:800});await idle(p);
 const sizes=[['tiny',12,12],['small',13,14],['medium',14,16],['large',16,18],['huge',18,20]];
 for(const [size,ui,body] of sizes){
  await api(p,'settings.open');await api(p,'settings.tab',{tab:'settings'});await idle(p);
  await p.getByLabel('界面字体大小',{exact:true}).selectOption(size);await idle(p);
  await p.getByLabel('编辑器字体大小',{exact:true}).selectOption(size);await idle(p);
  const preview=await font(p,'.preferences-interface-preview'),editorPreview=await font(p,'.preferences-editor-preview p');
  await api(p,'app.back');await api(p,'app.back');await idle(p);
  const title=await font(p,'.mobile-note-card strong'),headline=await font(p,'.notes-large-title');
  check(size+' mobile home follows confirmed UI scale',near(title,18*ui/14)&&near(headline,34*ui/14));
  check(size+' preview uses actual UI hierarchy and body mapping',near(preview,17*ui/14)&&near(editorPreview,body));
  await p.locator('.note-row[data-note-id="note-a"]').click();await idle(p);
  const realBody=await font(p,'.tiptap');
  check(size+' actual editor uses body setting',near(realBody,body));
  fonts.push({size,title,headline,preview,editorPreview,realBody});
  await api(p,'app.back');await idle(p);
 }
 await settings(p,{interfaceFontSize:'medium'});
 check('320px default collection has two columns',await p.locator('.mobile-gallery').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===2));
 check('two columns have no swipe tray',await p.locator('.swipe-actions').count()===0);
 const row='.note-row[data-note-id="note-a"]';
 await touch(p,row,'touchstart',140);await touch(p,row,'touchmove',50);await touch(p,row,'touchend',50);
 check('two-column horizontal touch never shifts a card',await p.locator(row).evaluate(e=>getComputedStyle(e).transform==='none'));
 const more=p.getByRole('button',{name:'更多操作：Fixture A',exact:true});const box=await more.boundingBox();
 check('320px more target fits card and viewport at >=44px',box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=320);
 await more.click();await idle(p);
 check('explicit more opens real menu with pin/move/delete',await p.getByRole('menuitem',{name:/置顶/}).count()>0&&await p.getByRole('menuitem',{name:/移动/}).count()>0&&await p.getByRole('menuitem',{name:/删除/}).count()>0);
 await p.screenshot({path:resolve(out,'320-menu.png')});await api(p,'app.back');await idle(p);
 for(const terminal of ['touchcancel','touchmove']){
  await touch(p,row,'touchstart');await touch(p,row,terminal);await p.waitForTimeout(580);await idle(p);
  check(terminal+' cancels long press',await p.getByRole('menu').count()===0);
 }
 await touch(p,row,'touchstart');await api(p,'note.select',{id:'note-b'});await p.waitForTimeout(580);await idle(p);
 check('navigation cancels pending card menu',await p.getByRole('menu').count()===0);await api(p,'app.back');await idle(p);
 await touch(p,row,'touchstart');await p.waitForTimeout(560);await touch(p,row,'touchend');await idle(p);
 check('long press opens existing menu',await p.getByRole('menu').count()>0);await api(p,'app.back');await idle(p);
 await settings(p,{interfaceFontSize:'huge'});
 check('huge UI uses a single reachable column at 320px',await p.locator('.mobile-gallery.single-column').count()===1);
 await touch(p,row,'touchstart',250);await touch(p,row,'touchmove',150);await touch(p,row,'touchend',150);await idle(p);
 await p.waitForFunction(()=>getComputedStyle(document.querySelector('.note-row-wrap.swiped .note-row')).transform==='matrix(1, 0, 0, 1, -174, 0)');
 check('single-column swipe remains independent',await p.locator('.note-row-wrap.swiped .swipe-actions').count()===1);
 const actions=await p.locator('.note-row-wrap.swiped .swipe-actions button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,width:r.width,height:r.height};}));
 check('single-column all three actions are >=44px and in viewport',actions.length===3&&actions.every(a=>a.width>=44&&a.height>=44&&a.x>=0&&a.x+a.width<=320));
 check('single-column actions receive hits above the shifted card',await p.locator('.note-row-wrap.swiped .swipe-actions button').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})));
 await p.screenshot({path:resolve(out,'320-single-swipe.png')});
 await settings(p,{interfaceFontSize:'medium'});check('switching columns clears swipe state',await p.locator('.note-row-wrap.swiped').count()===0&&await p.locator('.swipe-actions').count()===0);
 await api(p,'note.select',{id:'note-a'});await idle(p);
 await touch(p,'.editor-pane','touchstart',5);await touch(p,'.editor-pane','touchcancel',5);await touch(p,'.editor-pane','touchend',200);await idle(p);
 check('edge touchcancel cannot trigger stale Back',await p.locator('.app.page-editor').count()===1);
 // Real attachment node, shared platform identity at portrait/landscape/split widths.
 const pcm=Buffer.alloc(44+1600);pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(8000,24);pcm.writeUInt32LE(16000,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(1600,40);
 await api(p,'attachment.submit',{files:[{name:'identity.wav',mime:'audio/wav',base64:pcm.toString('base64')}]});await idle(p);
 await p.locator('.audio-card').waitFor();await p.evaluate(()=>window.e113Audio=document.querySelector('.audio-card'));
 for(const width of [320,740,1024,500]){
  await p.setViewportSize({width,height:width===320?800:360});await idle(p);
  check('native Android audio retains mobile controls at '+width,await p.locator('.audio-title-toggle').evaluate(e=>e.tagName==='DIV')&&await p.locator('.audio-expand').count()===0&&await p.evaluate(()=>window.e113Audio===document.querySelector('.audio-card')));
 }
 check('mobile has no uncaught errors',mobile.errors.length===0);
} finally {await mobile.cleanup();}
await writeFile(resolve(out,'result.json'),JSON.stringify({checks,fonts,geometry,limits:'Chrome real App/PM, synthetic IPC/storage/platform/IME. No APK, device, native input or FORMAT102 claim.'},null,2));
console.log(JSON.stringify({passed:true,checks,fonts,geometry},null,2));
