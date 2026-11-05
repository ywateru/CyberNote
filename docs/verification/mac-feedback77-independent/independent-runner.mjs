import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {openRuntime,api,idle,state,snapshot,saveJSON} from '../../../scripts/debug/runtime.mjs';
import {sourceFingerprint} from '../../../scripts/debug/source-identity.mjs';
const out=resolve(process.argv[2]); await mkdir(out,{recursive:true});
const started=performance.now(), checks=[], observations=[]; let runtime, failure;
const input=await sourceFingerprint(process.cwd()), head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
function check(name,condition,detail){checks.push({name,pass:!!condition,detail});assert.ok(condition,name);}
try{
 runtime=await openRuntime({tmp:out});const p=runtime.page;
 const command=async(c,a={})=>{const v=await api(p,c,a);await idle(p);return v;};
 const capture=async(name,selector='.app')=>{await saveJSON(resolve(out,name+'.snapshot.json'),await snapshot(p,{selector,maxChars:80000,maxNodes:400}));await p.screenshot({path:resolve(out,name+'.png')});};
 const close=async()=>{if(await p.locator('.menu-scrim').count()){await p.mouse.click(3,3);await idle(p);}};
 const rows=()=>p.locator('.note-row');const row=id=>p.locator(`.note-row[data-note-id="${id}"]`);
 const setDoc=async(id,title,body)=>{await command('note.select',{id});await command('editor.setContent',{document:{type:'doc',content:[title,body].map(text=>({type:'paragraph',content:[{type:'text',text}]}))}});await command('app.flush');};
 const menuObs=async(label,point)=>{const b=await p.locator('.menu-note').boundingBox(),v=p.viewportSize();const o={label,point,rect:b,viewport:v};observations.push(o);check(label+' inside viewport',b.x>=8&&b.y>=8&&b.x+b.width<=v.width-7.5&&b.y+b.height<=v.height-7.5,o);if(point){check(label+' opens at event location or needed edge shift',Math.abs(b.x-Math.max(8,Math.min(point.x,v.width-b.width-8)))<1&&Math.abs(b.y-Math.max(8,Math.min(point.y,v.height-b.height-8)))<1,o);}return b;};
 const clickRow=async(id,label,edge=false)=>{await row(id).scrollIntoViewIfNeeded();const b=await row(id).boundingBox();const point={x:b.x+(edge?b.width-3:21),y:b.y+(edge?b.height-3:17)};await p.mouse.click(point.x,point.y,{button:'right'});await idle(p);return menuObs(label,point);};
 check('desktop footer new-folder removed',await p.locator('.folder-footer [aria-label="新建文件夹"]').count()===0);
 const f=await p.locator('.folder-footer').boundingBox(),more=await p.locator('.folder-footer [aria-label="更多设置"]').boundingBox();check('bottom more remains right aligned',Math.abs(f.x+f.width-more.x-more.width)<=9);
 await p.locator('.sidebar-toolbar [aria-label="添加文件夹"]').click();await idle(p);check('top new folder opens actual form',await p.locator('.smart-form[role="dialog"]').count()===1);await command('folder.cancel');
 await setDoc('note-a','Alpha alpha 搜索 [x] <img src=x onerror=alert(1)>','lower ALPHA alpha 搜索搜索 [x] a+b .* <img src=x onerror=alert(1)> codex');
 const original=JSON.stringify(runtime.backend.workspace.notes.find(n=>n.id==='note-a').document);
 for(const test of [{q:'aLpHa',expect:['Alpha','alpha','ALPHA','alpha']},{q:'搜索',expect:['搜索','搜索','搜索']},{q:'[x]',expect:['[x]','[x]']},{q:'a+b',expect:['a+b']},{q:'.*',expect:['.*']},{q:'<img src=x onerror=alert(1)>',expect:['<img src=x onerror=alert(1)>','<img src=x onerror=alert(1)>']}]){
  await command('search.set',{query:test.q});const texts=await row('note-a').locator('.search-match').allTextContents();check('literal global highlight '+test.q,JSON.stringify(texts)===JSON.stringify(test.expect),texts);
  const styles=await row('note-a').locator('.search-match').evaluateAll(ns=>ns.map(n=>({color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor})));check('orange text transparent background '+test.q,styles.every(s=>s.color==='rgb(252, 184, 40)'&&s.background==='rgba(0, 0, 0, 0)'));
  check('no interpreted HTML '+test.q,await row('note-a').locator('img,script').count()===0);
 }
 await command('search.set',{query:'搜索'});await command('search.find',{query:'codex'});check('body find stays separate from global highlight',(await row('note-a').locator('.search-match').allTextContents()).every(t=>t==='搜索')&&(await p.locator('.find-bar input').inputValue())==='codex');await capture('literal-and-independent-find');
 await command('search.set',{query:''});check('clear query removes list highlights',await p.locator('.notes-scroll .search-match').count()===0);check('search rendering never mutates saved document',original===JSON.stringify(runtime.backend.workspace.notes.find(n=>n.id==='note-a').document));
 await setDoc('note-a','Far result','long-context '.repeat(85)+'needle after match');await command('search.set',{query:'needle'});const far=await row('note-a').locator('.snippet-text').textContent();const match=await row('note-a').locator('.search-match').boundingBox(),preview=await row('note-a').locator('.snippet-text').boundingBox();check('far body match appears in visible snippet with ellipsis',far.startsWith('…')&&match.x+match.width<=preview.x+preview.width&&match.y>=preview.y,{far,match,preview});await capture('far-snippet');
 await command('search.set',{query:''});await command('modal.open',{type:'lock'});await command('dom.fill',{selector:'input[aria-label="密码"]',value:'independent-password'});await command('modal.submit');await command('search.set',{query:'needle'});check('locked body does not produce search result',(await state(p)).selection.listed.every(id=>id!=='note-a'));await command('search.set',{query:'Far'});check('locked result renders title without secret body',(await row('note-a').textContent()).includes('已锁定')&&!(await row('note-a').textContent()).includes('needle'));await capture('locked-title');
 await command('search.set',{query:''});await command('note.select',{id:'note-b'});await setDoc('note-b','B other selected','Independent note for right-click target');
 for(let i=0;i<20;i++){await command('note.create');const id=(await state(p)).selection.noteId;await setDoc(id,'Menu '+String(i).padStart(2,'0'),'scroll fixture');}
 await command('note.select',{id:'note-b'});await clickRow('note-a','right-click unselected locked A');check('right-click does not change editor selection',(await state(p)).selection.noteId==='note-b');await p.locator('.menu-note').getByText('置顶',{exact:true}).click();await idle(p);check('context action targets A not selected B',runtime.backend.workspace.notes.find(n=>n.id==='note-a').pinned===true&&runtime.backend.workspace.notes.find(n=>n.id==='note-b').pinned===false);await close();
 await clickRow('note-b','scroll to B lower row',true);await capture('scroll-right-context');await p.setViewportSize({width:720,height:360});await idle(p);await menuObs('resize keeps existing menu in bounds');await capture('resize-context');await close();
 await p.setViewportSize({width:1280,height:800});await command('sidebar.toggle');await command('settings.update',{settings:{listWidth:390,sidebarWidth:270}});await clickRow('note-b','hidden sidebar resized list');await close();
 await command('settings.update',{settings:{view:'gallery'}});await clickRow('note-b','gallery lower edge',true);await capture('gallery-context');await close();
 await command('settings.update',{settings:{view:'list'}});await row('note-b').scrollIntoViewIfNeeded();await row('note-b').evaluate(n=>n.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));await idle(p);const kb=await menuObs('coordinate-less keyboard fallback');const b=await row('note-b').boundingBox();check('keyboard fallback anchors visible target card',kb.x>=b.x&&kb.x<b.x+b.width&&kb.y>=8);await close();
 await clickRow('note-b','reopened menu uses fresh row point');await close();await command('menu.open',{menu:'more'});const toolbar=await p.locator('.menu-more').boundingBox();check('toolbar more uses own top right anchor',toolbar.y===52&&toolbar.x>700,toolbar);await capture('toolbar-anchor');
 check('no uncaught page errors',runtime.errors.length===0,runtime.errors);
}catch(e){failure={message:e.message,stack:e.stack};if(runtime){await saveJSON(resolve(out,'failure.snapshot.json'),await snapshot(runtime.page,{selector:'.app',maxChars:80000,maxNodes:400}));await runtime.page.screenshot({path:resolve(out,'failure.png')});}process.exitCode=1;}
finally{const errors=runtime?.errors??[];await runtime?.cleanup();await saveJSON(resolve(out,'result.json'),{head,input,inputAfter:await sourceFingerprint(process.cwd()),checks,observations,pageErrors:errors,failure,completeWallMs:Math.round(performance.now()-started)});console.log(JSON.stringify({pass:!failure,checks:checks.length,failure,completeWallMs:Math.round(performance.now()-started)}));}
