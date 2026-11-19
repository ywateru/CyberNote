// Actual production App/modules; explicit synthetic native invoke boundary.
// Store/barrier semantics are separately tested by the real-source Rust harness.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {openRuntime,api} from '../../debug/runtime.mjs';
import {FakeBackend} from '../../debug/platform.mjs';
const initialCall=FakeBackend.prototype.call;
FakeBackend.prototype.call=async function(command,args){if(command==='settings_host_ready')return{ok:true,value:null};return initialCall.call(this,command,args);};
const out=resolve(process.argv[2]||'/private/tmp/settings121-integration-app');
await mkdir(out,{recursive:true});
for(const mobile of [false,true]){
 const runtime=await openRuntime({mobile,'account-ui':true,enabled:true});
 try{
  const {page}=runtime;
  await page.addInitScript(({mobile})=>{
   const original=window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
   const calls=window.__SETTINGS121_CALLS__=[];
   const backup={config:{version:1,hours:0,keep:7,directory:''},directory:'/synthetic-private/backups',dataDirectory:'/synthetic-private',libraryId:'synthetic-library',versions:[],issues:[],automaticSuspended:false,lastError:null,nextDueAtMs:null,directoryMode:mobile?'privateOnly':'selectableFilesystem'};
   const status={currentVersion:'0.1.0',preferences:{checkOnStartup:false,automaticChecks:false,intervalMinutes:60,channel:'stable',showBadge:true,quietUntil:0},phase:'idle',release:null,downloaded:0,total:0,lastChecked:null,error:null,retry:null,installMode:mobile?'download_only':'replace_restart',installReason:mobile?'发布包未签名，无法安装':'ad-hoc 签名，未公证',installReport:null};
   const cloud={revision:0,enabled:true,selected:'webdav',minutes:0,providers:{webdav:{fields:{},credentialsSet:{}},s3:{fields:{},credentialsSet:{}},github:{fields:{},credentialsSet:{}}},passphraseSet:false,lastSuccess:null,lastError:null,recoveries:[]};
   window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
    if(command.startsWith('software_update_')||command.startsWith('local_backup_')||command.startsWith('settings_')||command==='cloud_sync_command'){
     calls.push({command,args:JSON.parse(JSON.stringify(args))});
     if(command.startsWith('software_update_')){if(command.endsWith('_check'))status.phase='up_to_date';return structuredClone(status);}
     if(command==='settings_host_ready')return;
     if(command==='settings_quit_ack'){
      if(args.sealed && args.success) queueMicrotask(()=>void window.__DEBUG_PLATFORM__.emit('notes-settings-quit-ready',{id:args.id}));
      return;
     }
     if(command==='settings_host_context')return{window:'main',session:'synthetic-session',token:{sessionId:'synthetic-session',epoch:1},storeInstance:'synthetic-store'};
     if(command==='cloud_sync_command'){
      if(args.command.type==='preview'){if(window.__CLOUD_HOLD__){window.__CLOUD_HOLD_STARTED__=true;await new Promise(resolve=>{window.__CLOUD_RELEASE__=resolve;});}return{status:cloud,preview:{id:'synthetic-cloud-preview',source:'remote',remoteExists:true,workspaceId:'22222222-2222-4222-8222-222222222222',localNotes:2,versions:2,attachments:0,bytes:2048,conflicts:0}};}
      if(args.command.type==='sync')return{status:cloud,result:{applied:true,pending:0,conflicts:0},message:'合成原生提交：仅便携 owner 投影更新'};
      return{status:cloud};
     }
     if(command==='local_backup_status'||command==='local_backup_configure')return backup;
     if(command==='local_backup_now')return{name:'fixture.cyberbackup',manifest:{createdAtMs:Date.now()}};
     if(command==='settings_archive'){
      if(args.request.operation==='preview')return{confirmation:'synthetic-preview',archive:{notes:2,folders:3,attachments:0,summary:'合并导入，保留当前内容并应用归档设置'},expiresAtMs:Date.now()+300000,targetStore:{instance:'synthetic-store',generation:'0'.repeat(64),settingsSha256:'0'.repeat(64)},payloadSha256:'0'.repeat(64)};
      if(args.request.operation==='confirm')return{outcome:'committed',delivery:null,maintenanceError:window.__ARCHIVE_MAINTENANCE__||null,refreshError:window.__ARCHIVE_REFRESH__||undefined};
      return{status:'success'};
     }
     return;
    }
    if(command.startsWith('plugin:dialog|') && !command.endsWith('|open') && !command.endsWith('|save')){if(window.__DIALOG_HOLD__){window.__DIALOG_HOLD_STARTED__=true;await new Promise(resolve=>{window.__DIALOG_RELEASE__=resolve;});}return 'Ok';}
    return original(command,args);
   };
  },{mobile});
  const originalState=runtime.backend.state.bind(runtime.backend);
  let storeInstance='synthetic-store-original';
  runtime.backend.state=()=>{const snapshot=originalState();snapshot.access.storeInstance=storeInstance;return snapshot;};
  Object.assign(runtime.backend.workspace.settings,{
    appearance:{version:2,themeId:'forest',schemePreference:'light'},
    presentation:{version:1,desktop:{navigation:'two-pane',lastNonFocusNavigation:'two-pane',collectionView:'list',density:'compact'},mobile:{collectionView:'gallery',density:'comfortable'}},
    theme:'light',view:'list',sort:'title',groupDates:true,
  });
  runtime.backend.account={state:'signedOut',enabled:false,devices:[],pendingCount:0,conflictCount:0};
  runtime.backend.sync={state:'paused',deviceName:'fixture',peers:[],pendingCount:0,conflictCount:1};
  runtime.backend.syncConflicts=[{kind:'note',entityId:'note-a',variants:[{digest:'a'.repeat(64),title:'本机版本',updatedAt:1,deleted:false,purged:false,locked:false,attachmentCount:0},{digest:'b'.repeat(64),title:'远端版本',updatedAt:2,deleted:false,purged:false,locked:false,attachmentCount:0}]}];
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('.app');
  await page.locator(mobile ? '.mobile-home-settings' : '.desktop-settings').click();
  const tab=async name=>{
    const target=page.locator(`[data-preferences-page="${name}"]`);
    for(let level=0;level<4 && !await target.isVisible();level++) await page.locator('.preferences-back').click();
    await target.click();
  };
  await tab('account');
  await page.waitForSelector('.cloud-sync-settings');
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='cloud_sync_command'));
  await page.getByRole('button',{name:'立即同步…',exact:true}).click();
  await page.waitForSelector('.cloud-sync-preview');
  // This is the native-commit boundary fixture; the real SettingsPort owner
  // projection and transaction are proved by the production Store harness.
  runtime.backend.workspace.settings.appearance.schemePreference='dark';
  runtime.backend.workspace.settings.presentation.desktop.collectionView='gallery';
  Object.assign(runtime.backend.workspace.settings,{theme:'dark',view:'gallery',sort:'updated',groupDates:false});
  await page.getByRole('button',{name:'确认同步…',exact:true}).click();
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='cloud_sync_command' && c.args.command.type==='sync'));
  await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
  const effective=(await api(page,'app.state')).result.settings;
  assert.equal(effective.appearance.schemePreference,'dark');
  assert.equal(effective.appearance.themeId,'forest');
  assert.equal(effective.presentation.desktop.collectionView,'gallery');
  assert.equal(effective.presentation.desktop.navigation,'two-pane');
  assert.equal(effective.presentation.desktop.density,'compact');
  assert.deepEqual(effective.presentation.mobile,{collectionView:'gallery',density:'comfortable'});
  assert.equal(effective.groupDates,false);
  const accessPrepare=async(operationId)=>{
    runtime.backend.suspended=['note-a'];runtime.backend.operationId=operationId;
    await page.evaluate(value=>{void window.__DEBUG_PLATFORM__.emit('notes-access',value);},{phase:'prepare',operationId,noteIds:['note-a'],access:runtime.backend.state().access});
    await page.waitForSelector('.access-cover');
  };
  const accessRestore=async(operationId)=>{
    runtime.backend.suspended=[];runtime.backend.operationId=null;runtime.backend.accessEpoch++;
    await page.evaluate(value=>{void window.__DEBUG_PLATFORM__.emit('notes-access',value);},{phase:'commit',operationId,noteIds:['note-a'],access:runtime.backend.state().access});
    await api(page,'app.refresh');await page.waitForSelector('.access-cover',{state:'detached'});
    await page.waitForFunction(()=>document.querySelector('.cloud-sync-settings button') && !document.querySelector('.cloud-sync-settings button').disabled);
  };
  await page.evaluate(()=>{window.__CLOUD_HOLD__=true;});
  await page.getByRole('button',{name:'预览',exact:true}).click();
  await page.waitForFunction(()=>window.__CLOUD_HOLD_STARTED__);
  await accessPrepare('cloud-preview-revoked');
  await page.evaluate(()=>{window.__CLOUD_HOLD__=false;window.__CLOUD_RELEASE__();});
  assert.equal(await page.locator('.cloud-sync-preview').count(),0);
  await accessRestore('cloud-preview-revoked');
  assert.equal(await page.locator('.cloud-sync-preview').count(),0);
  await page.locator('.cloud-sync-settings').getByRole('button',{name:'设置…',exact:true}).click();
  await page.getByLabel('加密密码',{exact:true}).fill('ephemeral-fixture-only');
  await accessPrepare('cloud-draft-revoked');await accessRestore('cloud-draft-revoked');
  assert.equal(await page.getByLabel('加密密码',{exact:true}).count(),0);
  await page.locator('.cloud-sync-settings').getByRole('button',{name:'设置…',exact:true}).click();
  assert.equal(await page.getByLabel('加密密码',{exact:true}).inputValue(),'');
  // Same session+epoch, but a different actual Store incarnation still clears drafts.
  await page.getByLabel('加密密码',{exact:true}).fill('ephemeral-store-fixture');
  storeInstance='synthetic-store-replaced';await api(page,'app.refresh');
  assert.equal(await page.getByLabel('加密密码',{exact:true}).count(),0);
  await page.getByRole('button',{name:'预览',exact:true}).click();await page.waitForSelector('.cloud-sync-preview');
  const syncBefore=await page.evaluate(()=>window.__SETTINGS121_CALLS__.filter(c=>c.command==='cloud_sync_command' && c.args.command.type==='sync').length);
  await page.evaluate(()=>{window.__DIALOG_HOLD__=true;});
  await page.getByRole('button',{name:'确认同步…',exact:true}).click();await page.waitForFunction(()=>window.__DIALOG_HOLD_STARTED__);
  await accessPrepare('cloud-confirm-revoked');await accessRestore('cloud-confirm-revoked');
  await page.evaluate(()=>{window.__DIALOG_HOLD__=false;window.__DIALOG_RELEASE__();});
  assert.equal(await page.evaluate(()=>window.__SETTINGS121_CALLS__.filter(c=>c.command==='cloud_sync_command' && c.args.command.type==='sync').length),syncBefore);


  runtime.backend.account={state:'ready',enabled:true,profile:{subject:'synthetic-account',displayName:'合成账户'},devices:[{id:'11111111-1111-4111-8111-111111111111',name:'此设备',current:true,online:true,connected:false,syncAvailable:true}],pendingCount:0,conflictCount:1};
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:'查看冲突（1）',exact:true}).click();
  await page.waitForSelector('.preferences-conflicts[open]');
  assert.equal(await page.locator('[data-preferences-tab]').getAttribute('data-preferences-tab'),'account');
  assert.equal(await page.getByRole('button',{name:'开启此设备同步服务',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'加入同步',exact:true}).count(),0);
  await page.waitForSelector('.sync-conflict');
  const callsBefore=runtime.backend.calls.filter(c=>c.command==='sync_command' && c.type==='resolve').length;
  await page.getByRole('button',{name:'保留此版本',exact:true}).first().click();
  await page.getByRole('button',{name:'确认保留此版本',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.sync-conflict'));
  assert.equal(runtime.backend.calls.filter(c=>c.command==='sync_command' && c.type==='resolve').length,callsBefore+1);
  assert(!runtime.backend.calls.some(c=>c.command==='sync_command' && ['startHost','pair','createInvite','resume'].includes(c.type)));
  await tab('backup');
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='local_backup_status'));
  await page.getByRole('button',{name:'立即备份',exact:true}).click();
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='local_backup_now'));
  if(mobile)assert.equal(await page.getByRole('button',{name:'更改…',exact:true}).count(),0);
  await page.getByRole('button',{name:'导出…',exact:true}).click();
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='settings_archive' && c.args.request.operation==='export'));
  await page.getByRole('button',{name:'加密导出…',exact:true}).click();
  await page.getByLabel('备份密码',{exact:true}).fill('synthetic-archive-pass');
  await page.getByLabel('再次输入',{exact:true}).fill('synthetic-archive-pass');
  await page.getByRole('button',{name:'选择位置并导出…',exact:true}).click();
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='settings_archive' && c.args.request.operation==='export' && c.args.request.passphrase==='synthetic-archive-pass'));
  await page.getByRole('button',{name:'加密导入…',exact:true}).click();
  await page.getByLabel('备份密码',{exact:true}).fill('synthetic-archive-pass');
  await page.getByRole('button',{name:'选择文件并预览…',exact:true}).click();
  await page.getByRole('button',{name:'确认导入',exact:true}).click();
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='settings_archive' && c.args.request.operation==='confirm'));

  // F2: preserve committed native warnings; the consumed confirmation is not replayed.
  for(const warnings of ['maintenance','refresh','both']){
    await page.evaluate(mode=>{
      window.__ARCHIVE_MAINTENANCE__=mode==='refresh'?null:{code:'maintenance_fixture',message:'合成维护失败，导入已提交'};
      window.__ARCHIVE_REFRESH__=mode==='maintenance'?undefined:'合成原生刷新警告';
    },warnings);
    await page.getByRole('button',{name:'加密导入…',exact:true}).click();
    await page.getByLabel('备份密码',{exact:true}).fill('archive-fixture-pass');
    await page.getByRole('button',{name:'选择文件并预览…',exact:true}).click();
    const before=await page.evaluate(()=>window.__SETTINGS121_CALLS__.filter(c=>c.command==='settings_archive' && c.args.request.operation==='confirm').length);
    await page.getByRole('button',{name:'确认导入',exact:true}).click();
    const alert=page.locator('.local-backup-error').filter({hasText:'导入已提交'});
    await alert.waitFor();const message=await alert.innerText();
    if(warnings!=='refresh')assert.match(message,/合成维护失败/);
    if(warnings!=='maintenance')assert.match(message,/合成原生刷新警告/);
    assert.match(message,/勿重复导入/);
    assert.equal(await page.evaluate(()=>window.__SETTINGS121_CALLS__.filter(c=>c.command==='settings_archive' && c.args.request.operation==='confirm').length),before+1);
  }
  await page.screenshot({path:resolve(out,mobile?'mobile-backup.png':'desktop-backup.png')});
  await tab('settings');
  await page.getByRole('button',{name:'更新',exact:true}).click();
  await page.getByRole('button',{name:'检查更新',exact:true}).click();
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='software_update_check'));
  assert.match(await page.locator('.preferences').innerText(),/当前构建没有可验证的发行标签/);
  if(mobile)assert.equal(await page.getByRole('button',{name:/安装并重新启动/}).count(),0);
  await page.screenshot({path:resolve(out,mobile?'mobile-update.png':'desktop-update.png')});
  // The actual App listener keeps admission sealed after successful ACK; only
  // cancellation of this exact operation releases it. No process is exited.
  await page.evaluate(()=>{void window.__DEBUG_PLATFORM__.emit('notes-settings-quit',{id:'synthetic-install-1'});});
  await page.waitForFunction(()=>window.__SETTINGS121_CALLS__.some(c=>c.command==='settings_quit_ack' && !c.args.sealed && c.args.success));
  assert.equal(await page.locator('.app').getAttribute('inert'),'');
  await page.evaluate(()=>window.__DEBUG_PLATFORM__.emit('notes-settings-quit-cancelled',{id:'stale-install'}));
  assert.equal(await page.locator('.app').getAttribute('inert'),'');
  await page.evaluate(()=>window.__DEBUG_PLATFORM__.emit('notes-settings-quit-cancelled',{id:'synthetic-install-1'}));
  await page.waitForFunction(()=>!document.querySelector('.app').hasAttribute('inert'));
  const calls=await page.evaluate(()=>window.__SETTINGS121_CALLS__);
  assert(calls.some(c=>c.command==='settings_host_ready'));
  await writeFile(resolve(out,mobile?'mobile.json':'desktop.json'),JSON.stringify({scope:'Actual App and module UI to synthetic native invoke; not native host acceptance',calls,errors:runtime.errors},null,2));
  assert.deepEqual(runtime.errors,[]);
  console.log(`PASS actual App ${mobile?'390px mobile':'1280px desktop'}: cloud preview/confirm invoke + actual appearance/presentation owner refresh; AccountSettings onConflicts→account conflicts-only→resolve invoke; local backup and plain/encrypted archive picker→preview/confirm invokes; updater check invoke; production release identity notice; ready ack; F1 stale preview/draft/confirm/Store lifetime; F2 committed warning preservation`);
 }finally{await runtime.cleanup();}
}
