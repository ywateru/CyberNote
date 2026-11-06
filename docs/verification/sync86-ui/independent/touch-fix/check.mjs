import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {openRuntime,api,idle,saveJSON,snapshot} from '../../../../../scripts/debug/runtime.mjs';
import {sourceFingerprint} from '../../../../../scripts/debug/source-identity.mjs';
const output=process.argv[2];if(!output)throw Error('A fresh external output directory is required');
const before=await sourceFingerprint(process.cwd()),started=performance.now(),checks=[],measurements=[];
let runtime,failed;
const check=(name,condition)=>{assert(condition,name);checks.push(name)};
try{
 runtime=await openRuntime({mobile:true});const {page,backend}=runtime;
 const cmd=async(id,args={})=>{await api(page,id,args);await idle(page)};
 await page.setViewportSize({width:320,height:360});await cmd('data.open');
 const refresh=page.getByRole('button',{name:'刷新同步状态',exact:true});await refresh.scrollIntoViewIfNeeded();
 const metric=await refresh.evaluate(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight},before:getComputedStyle(n,'::before').content,after:getComputedStyle(n,'::after').content}});
 measurements.push({state:'disabled',refresh:metric});
 check('Actual mobile profile uses 320x360 viewport',metric.viewport.width===320&&metric.viewport.height===360);
 check('Refresh now has a real 44x44 DOM target',metric.width>=44&&metric.height>=44);
 check('Initial state stays disabled without generating device identity',backend.sync.state==='disabled'&&!backend.sync.deviceId);
 const name=page.getByRole('textbox',{name:'同步设备名称',exact:true});await name.fill('独立复验手机');
 await page.getByRole('button',{name:'开启此设备同步服务',exact:true}).click();await idle(page);
 check('Actual start button still reaches listening state',(await page.locator('.sync-settings').getAttribute('data-sync-state'))==='listening');
 const endpoint=page.getByRole('textbox',{name:'同步服务地址',exact:true});await endpoint.fill('ws://127.0.0.1:49632');await endpoint.focus();await cmd('sync.status');
 check('Width fix preserves real input focus and value after status refresh',await endpoint.evaluate(n=>document.activeElement===n&&n.value==='ws://127.0.0.1:49632'));
 backend.sync.pendingCount=2;await cmd('sync.now');
 check('Sync request still displays pending application accurately',(await page.locator('.sync-state').innerText())==='等待应用'&&(await page.locator('.sync-live').innerText()).includes('等待安全应用'));
 backend.sync.pendingCount=0;backend.sync.peers=[{id:'recheck-peer',name:'很长的设备名称'.repeat(17),connected:false}];await cmd('sync.status');
 await page.getByRole('button',{name:/撤销设备/}).click();
 const confirmation=page.locator('.sync-confirmation');
 const panel=await confirmation.evaluate(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewport:innerHeight,focusInside:n.contains(document.activeElement),buttons:[...n.querySelectorAll('button')].map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}))}});
 measurements.push({confirmation:panel});
 check('320x360 confirmation remains visible and owns keyboard focus',panel.top<panel.viewport&&panel.bottom>0&&panel.focusInside);
 check('Both confirmation buttons meet 44px on both axes',panel.buttons.every(x=>x.width>=44&&x.height>=44));
 check('Opening confirmation still does not mutate paired devices',backend.sync.peers.length===1&&!backend.calls.some(x=>x.command==='sync_command'&&x.type==='revoke'));
 await page.getByRole('button',{name:'取消',exact:true}).click();await idle(page);
 for(const theme of ['light','dark']){
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();await cmd('settings.update',{settings:{theme}});await cmd('data.open');
  const sync=page.locator('.sync-settings');await sync.scrollIntoViewIfNeeded();
  const geometry=await sync.evaluate(n=>{const s=n.closest('.data-management-scroll');return {scrollWidth:s.scrollWidth,clientWidth:s.clientWidth,scrollHeight:s.scrollHeight,clientHeight:s.clientHeight,overflowY:getComputedStyle(s).overflowY,buttons:[...n.querySelectorAll('button')].filter(x=>x.getClientRects().length).map(x=>({name:x.getAttribute('aria-label')||x.textContent,width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}))}});
  measurements.push({theme,geometry});
  check('All rendered sync buttons meet 44px width and height in '+theme,geometry.buttons.every(x=>x.width>=44&&x.height>=44));
  check('320px short-screen shared scrolling stays reachable without horizontal overflow in '+theme,geometry.scrollWidth<=geometry.clientWidth&&geometry.scrollHeight>geometry.clientHeight&&geometry.overflowY==='auto');
  await writeFile(resolve(output,theme+'.html'),await page.locator('.preferences').evaluate(n=>n.outerHTML));
  await page.screenshot({path:resolve(output,theme+'.png')});
 }
 check('Cancel leaves peer unchanged and sends no revoke',backend.sync.peers.length===1&&!backend.calls.some(x=>x.command==='sync_command'&&x.type==='revoke'));
 check('No uncaught page errors',runtime.errors.length===0);
 await saveJSON(resolve(output,'snapshot.json'),await snapshot(page,{selector:'.sync-settings',maxChars:20000,maxNodes:160}));
}catch(error){failed=error;process.exitCode=1;console.error(error)}
finally{
 await runtime?.cleanup();const after=await sourceFingerprint(process.cwd());
 await saveJSON(resolve(output,'result.json'),{pass:!failed,checks,measurements,error:failed?.message,sourceInputsAtStart:before,sourceInputs:after,sourceInputsChanged:before.sha256!==after.sha256,elapsedIncludingCleanupMs:Math.round(performance.now()-started),productFreeze:'9ed9a078',boundaries:'Actual mobile-browser React/DOM/HTML with explicit isolated JS IPC fixture. No Rust/network/Android-native/device evidence.'});
 console.log(JSON.stringify({pass:!failed,checks:checks.length,elapsedIncludingCleanupMs:Math.round(performance.now()-started)}));
}
