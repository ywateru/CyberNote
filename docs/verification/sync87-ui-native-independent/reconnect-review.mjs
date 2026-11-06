import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openRuntime,api,idle,snapshot} from '/private/tmp/apple-notes-sync87-ui-native-review/scripts/debug/runtime.mjs';
import {sourceFingerprint} from '/private/tmp/apple-notes-sync87-ui-native-review/scripts/debug/source-identity.mjs';
const root='/private/tmp/apple-notes-sync87-ui-native-review', output='/private/tmp/notes-sync87-independent-ui-native-01';
const before=await sourceFingerprint(root),checks=[];let runtime;
function check(label,value){assert(value,label);checks.push(label);}
try {
 for(const mobile of [false,true]){
  runtime=await openRuntime({root,mobile});const {page,backend}=runtime;
  const call=async(id,args={})=>{const x=await api(page,id,args);await idle(page);return x};
  const b=name=>page.getByRole('button',{name,exact:true}), field=()=>page.getByRole('textbox',{name:'粘贴完整配对串',exact:true});
  await call('data.open');await page.getByRole('textbox',{name:'同步设备名称',exact:true}).fill('INDEPENDENT synthetic');
  await b('加入同步').click();await field().fill('INITIAL-UI-FIXTURE');await b('连接并加入').click();await idle(page);
  const identity={deviceId:backend.sync.deviceId,workspaceId:backend.sync.workspaceId};
  let lastPair;const original=backend.call.bind(backend);backend.call=async(command,args)=>{if(command==='sync_command'&&args.command.type==='pair')lastPair=structuredClone(args.command);return original(command,args)};
  check(`${mobile}: update present after pairing`,await b('更新连接').isEnabled());
  await b('更新连接').click();check(`${mobile}: existing service new-invitation explanation`,(await page.locator('.sync-pair').innerText()).includes('原同步服务端为新地址重新生成'));
  check(`${mobile}: protected input`,await field().getAttribute('type')==='password'&&await field().getAttribute('autocomplete')==='off');
  await field().fill('FRESH-SYNTHETIC-UI');check(`${mobile}: DOM snapshot scrub`,!JSON.stringify(await snapshot(page,{selector:'.sync-settings'})).includes('FRESH-SYNTHETIC-UI'));
  await b('取消连接').click();await b('更新连接').click();check(`${mobile}: cancel clears input`,await field().inputValue()==='');
  await field().fill('CLOSE-SYNTHETIC-UI');await b('关闭设置').click();await call('data.open');await b('更新连接').click();check(`${mobile}: close reopen clears input`,await field().inputValue()==='');
  await field().fill('TAB-SYNTHETIC-UI');await call('settings.tab',{tab:'settings'});await call('settings.tab',{tab:'data'});await b('更新连接').click();check(`${mobile}: tab reopen clears input`,await field().inputValue()==='');
  await field().fill('FAIL-SYNTHETIC-UI');backend.configure({fail:{'sync-pair':1}});await b('连接并加入').click();await idle(page);
  check(`${mobile}: update failure remains retryable`,await field().count()===1&&await page.locator('.sync-error').count()===1);
  check(`${mobile}: update failure preserves identity`,backend.sync.deviceId===identity.deviceId&&backend.sync.workspaceId===identity.workspaceId);
  await field().fill('FRESH-SYNTHETIC-UI');backend.configure({delay:{'sync-pair':300}});const count=()=>backend.calls.filter(c=>c.command==='sync_command'&&c.type==='pair').length,start=count();
  await b('连接并加入').evaluate(e=>{e.click();e.click()});await idle(page);
  check(`${mobile}: exact fresh invitation sent through pair handler`,lastPair.invitation==='FRESH-SYNTHETIC-UI'&&lastPair.type==='pair');
  check(`${mobile}: repeated click singleflight`,count()===start+1);
  check(`${mobile}: success closes secret and retains identity`,await field().count()===0&&backend.sync.deviceId===identity.deviceId&&backend.sync.workspaceId===identity.workspaceId);
  backend.configure({delay:{'sync-pair':0}});await b('更新连接').click();await field().fill('STOP-SYNTHETIC-UI');await b('停止同步').click();await idle(page);
  check(`${mobile}: paused clears form and explains resume`,await field().count()===0&&await b('更新连接').isDisabled()&&(await page.locator('.sync-settings').innerText()).includes('请先继续同步，再更新连接'));
  await b('继续同步').click();await idle(page);check(`${mobile}: resume enables fresh update`,await b('更新连接').isEnabled());
  await b('更新连接').click();await field().fill('LATE-SYNTHETIC-UI');backend.configure({delay:{'sync-pair':400}});await b('连接并加入').click();await b('关闭设置').click();await new Promise(r=>setTimeout(r,500));await call('data.open');
  check(`${mobile}: closed in-flight response never reopens secret`,await field().count()===0);
  check(`${mobile}: no browser storage of secret`,!await page.evaluate(()=>JSON.stringify(localStorage).includes('SYNTHETIC-UI')));
  check(`${mobile}: page has no errors`,runtime.errors.length===0);
  await runtime.cleanup();runtime=undefined;
 }
 const after=await sourceFingerprint(root);assert.equal(before.sha256,after.sha256);await writeFile(output+'/ui-result.json',JSON.stringify({scope:'real React/App DOM with explicit FakeBackend IPC; no Rust network/native proof',checks,passed:checks.length,before,after,sourceChanged:false},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,sha256:after.sha256}));
}finally{await runtime?.cleanup();}
