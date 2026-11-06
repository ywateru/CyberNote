import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state, snapshot, saveJSON } from '../../../../scripts/debug/runtime.mjs';
import { sourceFingerprint } from '../../../../scripts/debug/source-identity.mjs';
const output = resolve('/private/tmp/sync86-independent-probes-20261106');
const checks = [], started = performance.now(), inputsBefore = await sourceFingerprint(process.cwd());
let runtime, failed;
const check = (label, condition) => { assert(condition, label); checks.push(label); };
try {
  runtime = await openRuntime();
  const { page, backend } = runtime;
  const cmd = async (id, args={}) => { const r=await api(page,id,args); await idle(page); return r; };
  const observed=[]; const original=backend.call.bind(backend);
  backend.call=async (id,args) => { if(id==='sync_command') observed.push(structuredClone(args));return original(id,args); };
  await cmd('data.open');
  check('Opening data does not create sync identity or mutate workspace', backend.sync.state==='disabled'&&!backend.sync.deviceId&&observed.every(x=>x.command.type==='status'));
  const schemas = await page.evaluate(async () => {
    const {validateSyncResult,syncEndpoint}=await import('/src/sync-client.ts');
    const base={status:{state:'disabled',deviceName:'',peers:[],pendingCount:0,conflictCount:0}};
    const peer={id:'p',name:'n',connected:false};
    const variant={digest:'a'.repeat(64),title:'n',deleted:false,purged:false,locked:false,attachmentCount:0};
    const tests=[]; const bad=(name,value)=>{let rejected=false;try{validateSyncResult(value)}catch{rejected=true}tests.push({name,rejected});};
    for(const key of ['workspaceId','deviceId','listenAddress','lastSyncAt','error'])bad('null status.'+key,{status:{...base.status,[key]:null}});
    for(const key of ['invitation','conflicts'])bad('null result.'+key,{...base,[key]:null});
    for(const key of ['endpoint','lastSyncAt'])bad('null peer.'+key,{status:{...base.status,peers:[{...peer,[key]:null}]}});
    bad('null variant.updatedAt',{...base,conflicts:[{kind:'note',entityId:'n',variants:[{...variant,updatedAt:null}]}]});
    for(const key of ['state','deviceName','peers','pendingCount','conflictCount']){const v=structuredClone(base);delete v.status[key];bad('missing status.'+key,v)}
    for(const key of ['id','name','connected']){const p={...peer};delete p[key];bad('missing peer.'+key,{status:{...base.status,peers:[p]}})}
    bad('unknown outer',{...base,secret:'x'});bad('unknown peer',{status:{...base.status,peers:[{...peer,x:1}]}});
    bad('unknown conflict',{...base,conflicts:[{kind:'note',entityId:'n',variants:[variant],x:1}]});
    bad('unknown variant',{...base,conflicts:[{kind:'note',entityId:'n',variants:[{...variant,x:1}]}]});
    for(const value of [-1,1.1,Number.MAX_SAFE_INTEGER+1,'1',true])bad('invalid pending '+String(value),{status:{...base.status,pendingCount:value}});
    bad('invalid peers limit',{status:{...base.status,peers:Array(65).fill(peer)}});
    bad('invalid variants limit',{...base,conflicts:[{kind:'note',entityId:'n',variants:Array(33).fill(variant)}]});
    bad('invalid uppercase digest',{...base,conflicts:[{kind:'note',entityId:'n',variants:[{...variant,digest:'A'.repeat(64)}]}]});
    for(const endpoint of ['https://host','ws://u:p@host','ws://host#x','ws://host?q=x','garbage']){let rejected=false;try{syncEndpoint(endpoint)}catch{rejected=true}tests.push({name:'endpoint '+endpoint,rejected})}
    const valid=[base,{status:{...base.status,peers:[peer]},conflicts:[{kind:'folder',entityId:'f',variants:[variant]}]}].map(value=>{try{validateSyncResult(value);return true}catch{return false}});
    return {tests,valid};
  });
  for(const row of schemas.tests) check('Strict schema rejects '+row.name,row.rejected);
  check('Omitted optionals validate for disabled status, peer and folder conflict',schemas.valid.every(Boolean));
  await saveJSON(resolve(output,'strict-schema.json'),schemas);
  // Hold an actual old status response after taking its disabled snapshot.
  let release,entered; const hold=new Promise(r=>release=r),seen=new Promise(r=>entered=r); let holdStatus=true;
  backend.call=async (id,args) => { if(id==='sync_command'&&args.command.type==='status'&&holdStatus){holdStatus=false;const result=await original(id,args);entered();await hold;return result;}if(id==='sync_command')observed.push(structuredClone(args));return original(id,args); };
  const pendingStatus=api(page,'sync.status');await seen;
  await api(page,'sync.host.start',{deviceName:'Independent Mac',port:50123});
  release();await pendingStatus;await idle(page);
  check('Late pre-host status cannot replace the newer listening state',(await page.locator('.sync-settings').getAttribute('data-sync-state'))==='listening');
  backend.call=async(id,args)=>{if(id==='sync_command')observed.push(structuredClone(args));return original(id,args)};
  check('Every observed IPC request has command and expected session/epoch',observed.every(x=>Object.keys(x).sort().join(',')==='command,expected'&&x.expected.sessionId===backend.sessionId&&x.expected.epoch===backend.accessEpoch));
  check('startHost payload uses only type/deviceName/port',observed.some(x=>x.command.type==='startHost'&&Object.keys(x.command).sort().join(',')==='deviceName,port,type'));
  // Pairing errors containing native input must not enter HTML/status/error output.
  await runtime.reset();await cmd('data.open');
  await page.getByRole('button',{name:'加入同步',exact:true}).click();
  const secret='INDEPENDENT-SECRET-DO-NOT-PUBLISH';
  await page.getByRole('textbox',{name:'同步设备名称',exact:true}).fill('Independent join');
  await page.locator('[aria-label="粘贴完整配对串"]').fill(secret);
  const originalPair=backend.call.bind(backend);
  backend.call=async(id,args)=>id==='sync_command'&&args.command.type==='pair'?{ok:false,error:{code:'native',message:secret},events:[]}:originalPair(id,args);
  await page.getByRole('button',{name:'连接并加入',exact:true}).click();
  await page.locator('.sync-error').waitFor();
  const snap=await snapshot(page,{selector:'.preferences',maxChars:100000,maxNodes:1000});
  check('Failed native pair displays an actionable sanitized error',(await page.locator('.sync-error').innerText()).includes('检查服务地址'));
  check('Failed pair never serializes secret in actual debug snapshot or app state',!JSON.stringify(snap).includes(secret)&&!JSON.stringify(await state(page)).includes(secret));
  check('Pairing failure leaves original secret available only in password input for retry',(await page.locator('[aria-label="粘贴完整配对串"]').inputValue())===secret);
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();await cmd('data.open');
  check('Closing and reopening clears the failed unsent secret',(await page.locator('[data-sensitive]').count())===0);
  backend.call=original;
  await cmd('sync.host.start',{deviceName:'Independent Mac',port:50123});
  await cmd('sync.invite',{endpoint:'ws://127.0.0.1:50123'});
  check('Generated secret appears as DOM property only',(await page.locator('[data-sensitive="invitation"]').inputValue()).length>0&&!(await page.locator('[data-sensitive="invitation"]').getAttribute('value')));
  await cmd('data.navigate',{view:'all'});await cmd('data.navigate',{view:'overview'});
  check('Category round-trip cannot resurrect invitation',(await page.locator('[data-sensitive="invitation"]').count())===0);
  // Test the pending label against every success-looking transport state.
  for(const status of ['listening','connecting','syncing','idle','paused']){
    backend.sync.state=status;backend.sync.pendingCount=4;await cmd('sync.status');
    check('Pending is not success in '+status,(await page.locator('.sync-state').innerText())==='等待应用'&&(await page.locator('.sync-live').innerText()).includes('等待安全应用'));
  }
  backend.sync.pendingCount=0;backend.sync.state='listening';await cmd('sync.status');
  // 320x360 real form input, overflow and confirmation scrolling.
  await page.setViewportSize({width:320,height:360});
  const endpoint=page.getByRole('textbox',{name:'同步服务地址',exact:true});await endpoint.fill('wss://'+('a'.repeat(80))+'.example:50123/path');await endpoint.focus();await cmd('sync.status');
  check('320px input survives actual status refresh with focus and text',await endpoint.evaluate(n=>n===document.activeElement&&n.value.length>80));
  backend.sync.peers=[{id:'independent-peer',name:'很长的设备名称'.repeat(18),connected:false}];await cmd('sync.status');
  await page.getByRole('button',{name:/撤销设备/}).click();
  const confirmation=page.locator('.sync-confirmation');
  const layout=await confirmation.evaluate(n=>{const r=n.getBoundingClientRect(),s=n.closest('.data-management-scroll');return {top:r.top,bottom:r.bottom,viewport:innerHeight,focusInside:n.contains(document.activeElement),scrollWidth:s.scrollWidth,clientWidth:s.clientWidth,buttons:[...n.querySelectorAll('button')].map(x=>({height:x.getBoundingClientRect().height,width:x.getBoundingClientRect().width}))}});
  check('Short-screen confirmation is scrolled to actual visible focus',layout.focusInside&&layout.bottom>0&&layout.top<layout.viewport);
  check('320px long peer names do not overflow and confirmation buttons meet 44px height',layout.scrollWidth<=layout.clientWidth&&layout.buttons.every(x=>x.height>=44));
  check('Requesting revoke has not sent mutation IPC',!backend.calls.some(x=>x.command==='sync_command'&&x.type==='revoke'));
  await page.getByRole('button',{name:'取消',exact:true}).click();await idle(page);
  check('Cancel preserves paired device and never sends revoke',backend.sync.peers.length===1&&!backend.calls.some(x=>x.command==='sync_command'&&x.type==='revoke'));
  await saveJSON(resolve(output,'short-screen-layout.json'),layout);
  await saveJSON(resolve(output,'snapshot.json'),await snapshot(page,{selector:'.preferences',maxChars:40000,maxNodes:250}));
  await writeFile(resolve(output,'preferences.html'),await page.locator('.preferences').evaluate(n=>n.outerHTML));
  await page.screenshot({path:resolve(output,'short-screen.png')});
  check('No uncaught page errors',runtime.errors.length===0);
} catch(error) {failed=error; console.error(error);process.exitCode=1;}
finally {
  await runtime?.cleanup();
  const inputsAfter=await sourceFingerprint(process.cwd());
  await saveJSON(resolve(output,'result.json'),{pass:!failed,checks,error:failed?.message,inputsBefore,inputsAfter,sourceInputsChanged:inputsBefore.sha256!==inputsAfter.sha256,elapsedIncludingCleanupMs:Math.round(performance.now()-started),boundaries:'Actual React/App, strict product wrapper, DOM/HTML; explicit isolated JS IPC. No Rust/network/Android/devices/microphone.'});
  console.log(JSON.stringify({pass:!failed,checks:checks.length,elapsedIncludingCleanupMs:Math.round(performance.now()-started)}));
}
