// Do not run against an in-progress tree. Exact clean-revision guard precedes imports.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NativeFixture } from './native-fixture.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, x, i, all) => {
  if (i % 2 === 0) pairs.push([x, all[i + 1]]);
  return pairs;
}, []));
if (!args['--root'] || !/^[0-9a-f]{40}$/.test(args['--revision'] || ''))
  throw Error('Provide --root and exact 40-character --revision after integration freeze');
const root = resolve(args['--root']);
const revision = args['--revision'];
const out = resolve(args['--out'] || '/tmp/cybernote-settings121-app-independent');
if (out === root || out.startsWith(root + '/')) throw Error('Artifact output must be outside source');
const git = (...xs) => execFileSync('git', ['-C', root, ...xs], { encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), revision, 'Refusing non-frozen HEAD');
const productDirty = () => git('status', '--porcelain').split('\n').filter(x => x && !x.endsWith('scripts/verification/settings121-app-independent/')).join('\n');
assert.equal(productDirty(), '', 'Refusing a floating/dirty product tree');
await mkdir(out, { recursive: true });
const { openRuntime, api } = await import(pathToFileURL(resolve(root, 'scripts/debug/runtime.mjs')));
const { FakeBackend } = await import(pathToFileURL(resolve(root, 'scripts/debug/platform.mjs')));
const originalCall = FakeBackend.prototype.call;
const checks = [];
const errors = [];
const receipts = [];
let currentFixture;
FakeBackend.prototype.call = async function(command, input = {}) {
  currentFixture.seed(this);
  const response = await currentFixture.call(command, input);
  return response ?? originalCall.call(this, command, input);
};
const bounded = (promise, label, ms = 10000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('Timed out: ' + label)), ms);
  })]).finally(() => clearTimeout(timer));
};
try {
  for (const mobile of [false, true]) {
    if (args['--platform'] && args['--platform'] !== (mobile ? 'mobile' : 'desktop')) continue;
    let runtime;
    const fixture = currentFixture = new NativeFixture(mobile);
    const platform = mobile ? 'mobile' : 'desktop';
    try {
      runtime = await openRuntime({ root, mobile, nativeToolbar: args['--mac'] === '1' && !mobile, 'account-ui': true });
      const { page, backend } = runtime;
      page.setDefaultTimeout(7000);
      const b = name => page.getByRole('button', { name, exact: true });
      const flushFrames = () => page.evaluate(() => new Promise(done =>
        requestAnimationFrame(() => requestAnimationFrame(done))));
      const scenario = async (name, action) => {
        if (args['--only'] && !new RegExp(args['--only']).test(name)) return;
        const start = fixture.calls.length;
        try {
          backend.suspended=[];backend.operationId=null;
          await page.reload({waitUntil:'domcontentloaded'});
          await page.waitForSelector('#startup',{state:'detached'});
          await page.locator('.app').waitFor();
          // Every Playwright operation/gate is bounded individually. Do not race
          // an entire scenario then let its late actions overlap the next one.
          const evidence = await action();
          checks.push({ platform, name, pass: true, evidence, calls: fixture.calls.slice(start) });
          console.log('PASS', platform, name);
        } catch (error) {
          checks.push({ platform, name, pass: false, error: String(error), calls: fixture.calls.slice(start) });
          await page.screenshot({ path: resolve(out, `${platform}-failure-${checks.length}.png`), fullPage: true }).catch(() => {});
          console.log('FAIL', platform, name, String(error));
        } finally { fixture.releaseAll(); }
      };
      const open = async () => {
        if (await page.locator('.preferences').count()) await b('关闭设置').click();
        await page.locator(mobile ? '.mobile-home-settings' : '.desktop-settings').click();
        await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
      };
      const category = async id => {
        const target = page.locator(`[data-preferences-page="${id}"]`);
        for (let n = 0; n < 5 && !await target.isVisible(); n++) {
          if (!await page.locator('.preferences').count()) { await open(); continue; }
          await page.locator('.preferences-back').click();
        }
        await target.click();
        await page.locator(`.preferences[data-preferences-tab="${id}"]`).waitFor();
      };
      const backupIdle = () => page.waitForFunction(() => {
        const el = document.querySelector('.local-backup-settings');
        return el && !el.querySelector('[aria-busy="true"]');
      });
      await scenario('actual-entry-six-categories-and-read-only-mount', async () => {
        await open();
        assert.deepEqual(await page.locator('[data-preferences-page]').evaluateAll(nodes =>
          nodes.map(n => n.dataset.preferencesPage)), ['account', 'settings', 'notes', 'agent', 'data', 'backup']);
        for (const id of ['settings', 'notes', 'agent', 'data', 'backup', 'account']) await category(id);
        await page.locator('.cloud-sync-settings').waitFor();
        assert(fixture.count('cloud_sync_command.status') > 0);
        assert(fixture.count('local_backup_status') > 0);
        assert.equal(fixture.count('cloud_sync_command.sync'), 0);
        assert.equal(fixture.count('local_backup_now'), 0);
        assert.equal(fixture.count('software_update_install'), 0);
        return { categories: 6, source: 'main.tsx/App, synthetic invoke only' };
      });
      await scenario('actual-account-conflict-callback-query-resolve-cancel-and-back', async () => {
        await open(); await category('account');
        const queries = fixture.count('sync_command.conflicts');
        await b('查看冲突（1）').click();
        await page.getByText('Independent branch A', { exact: true }).waitFor();
        assert(fixture.count('sync_command.conflicts') > queries, 'Account callback must query, not merely expand');
        assert.equal(await page.locator('.preferences').getAttribute('data-preferences-tab'), 'account');
        assert.equal(await page.getByText('加入同步', { exact: true }).count(), 0);
        const resolves = fixture.count('sync_command.resolve');
        await b('保留此版本').first().click();
        await page.getByRole('group', { name: '确认同步操作' }).waitFor();
        assert.equal(fixture.count('sync_command.resolve'), resolves);
        await api(page, 'app.back');
        assert.equal(await page.getByRole('group', { name: '确认同步操作' }).count(), 0);
        assert.equal(await page.locator('.preferences-conflicts[open]').count(), 1);
        assert.equal(fixture.count('sync_command.resolve'), resolves);
        await b('保留此版本').first().click();
        await b('确认保留此版本').click();
        await page.getByText('没有需要处理的冲突版本。', { exact: true }).waitFor();
        assert.equal(fixture.count('sync_command.resolve'), resolves + 1);
        const row = fixture.calls.filter(x => x.key === 'sync_command.resolve').at(-1);
        assert.equal(row.entityId, 'note-a'); assert.equal(row.digest, 'a'.repeat(64));
        // One back dismisses the inner conflict result; next closes disclosure.
        await api(page, 'app.back'); await api(page, 'app.back');
        assert.equal(await page.locator('.preferences-conflicts[open]').count(), 0);
        assert.equal(await page.locator('.preferences').count(), 1);
        return row;
      });
      await scenario('legacy-sync-alias-and-conflict-only-capability', async () => {
        await open();
        await api(page, 'settings.tab', { tab: 'sync' });
        await page.locator('.preferences-conflicts[open] .sync-settings').waitFor();
        assert.equal(await page.locator('.preferences').getAttribute('data-preferences-tab'), 'account');
        const before = fixture.calls.length;
        let rejected = false;
        try { await api(page, 'sync.host.start', { deviceName: 'forbidden', port: 49632 }); }
        catch { rejected = true; }
        assert(rejected, 'conflict-only handle must reject former pairing commands');
        assert.equal(fixture.calls.slice(before).filter(x => x.type === 'startHost').length, 0);
        return { rejected, noPairingPage: await page.getByText('加入同步', { exact: true }).count() === 0 };
      });
      await scenario('backup-real-handlers-settings-and-preview-cancel', async () => {
        await open(); await category('backup'); await backupIdle();
        const writes = fixture.count('local_backup_configure');
        await page.getByRole('radio', { name: '6 小时', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[aria-label="自动备份间隔"] [aria-checked="true"]')?.textContent === '6 小时');
        assert.equal(fixture.count('local_backup_configure'), writes + 1);
        assert.deepEqual(fixture.calls.filter(x => x.key === 'local_backup_configure').at(-1).patch, { hours: 6 });
        const now = fixture.count('local_backup_now'); await b('立即备份').click();
        await page.getByText('本地备份已创建', { exact: true }).waitFor();
        assert.equal(fixture.count('local_backup_now'), now + 1);
        await b('版本').click(); await b('恢复…').click();
        await page.getByRole('group', { name: '确认恢复备份' }).waitFor();
        assert.equal(fixture.count('local_backup_restore'), 0);
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('group', { name: '确认恢复备份' }).count(), 0);
        assert.equal(await page.locator('.preferences').count(), 1);
        assert.equal(await b('导入…').count(), 1, 'No duplicated old DataManagement import row');
        assert.equal(await b('导出…').count(), 1);
        if (mobile) assert.equal(await b('更改…').count(), 0);
        return { operationsUseNativeHandlers: true, importRows: 1 };
      });
      await scenario('backup-late-result-after-tab-change-does-not-publish', async () => {
        await open(); await category('backup'); await backupIdle();
        const gate = fixture.hold('local_backup_now');
        await b('立即备份').click(); await bounded(gate.ready, 'backup invoke accepted');
        await category('notes'); gate.release(); await flushFrames();
        assert.equal(await page.getByText('本地备份已创建', { exact: true }).count(), 0);
        assert.equal(await page.locator('.preferences').getAttribute('data-preferences-tab'), 'notes');
        return { staleSuccessAbsent: true };
      });
      await scenario('backup-committed-refresh-failure-is-not-replayed', async () => {
        await open(); await category('backup'); await backupIdle();
        await b('版本').click(); await b('恢复…').click();
        await page.getByRole('group', { name: '确认恢复备份' }).waitFor();
        fixture.failRefreshAfterRestore = true;
        const before = fixture.count('local_backup_restore');
        await b('确认恢复').click();
        await page.waitForFunction(()=>document.querySelector('.local-backup-settings')?.textContent.includes('导入已提交，但后续维护或界面刷新未完成'));
        const covered=await page.locator('.access-cover:visible').count();
        assert.equal(fixture.count('local_backup_restore'), before + 1);
        assert.equal(await page.getByRole('group', { name: '确认恢复备份' }).count(), 0);
        await flushFrames();
        assert.equal(fixture.count('local_backup_restore'), before + 1);
        await api(page, 'app.dismissError'); await api(page, 'app.refresh');
        return { nativeCommits: 1, confirmationConsumed: true, covered }; 
      });
      await scenario('archive-handler-error-has-one-visible-surface', async () => {
        await open(); await category('backup'); await backupIdle();
        const text = '独立故障：归档导出失败';
        fixture.failNext('settings_archive.export', { code: 'independent_archive', message: text });
        await page.evaluate(() => window.__DEBUG_PLATFORM__.configure({
          dialog: { save: ['/synthetic-private/independent.notesbackup'] },
        }));
        await b('导出…').click();
        await page.getByText(text, { exact: false }).first().waitFor();
        const visible = await page.getByText(text, { exact: false }).evaluateAll(nodes =>
          nodes.filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden').length);
        assert.equal(visible, 1, 'App and module must not duplicate the same export error');
        await api(page, 'app.dismissError');
        return { visibleErrorSurfaces: visible };
      });
      await scenario('access-prepare-revokes-held-backup-result', async () => {
        await open(); await category('backup'); await backupIdle();
        const gate = fixture.hold('local_backup_now');
        await b('立即备份').click(); await bounded(gate.ready, 'backup accepted before revoke');
        const operationId = 'independent-access-operation';
        backend.suspended = ['note-a']; backend.operationId = operationId;
        await page.evaluate(value => { void window.__DEBUG_PLATFORM__.emit('notes-access', value); }, {
          phase: 'prepare', operationId, noteIds: ['note-a'], access: backend.state().access,
        });
        await page.waitForFunction(() => document.querySelector('.access-cover') ||
          document.querySelector('.local-backup-settings')?.textContent.includes('请先完成录音或当前数据操作'));
        gate.release(); await flushFrames();
        assert.equal(await page.getByText('本地备份已创建', { exact: true }).count(), 0);
        backend.suspended = []; backend.operationId = null; backend.accessEpoch++;
        backend.noteEpochs['note-a'] = (backend.noteEpochs['note-a'] || 0) + 1;
        await page.evaluate(value => { void window.__DEBUG_PLATFORM__.emit('notes-access', value); }, {
          phase: 'commit', operationId, noteIds: ['note-a'], access: backend.state().access,
        });
        await api(page, 'app.refresh');
        return { noLateSuccessAfterRevoke: true, epoch: backend.accessEpoch };
      });
      await scenario('cloud-native-confirm-cancel-and-pending-is-not-applied', async () => {
        await open(); await category('account');
        await b('预览').click(); await page.getByRole('region', { name: '同步预览' }).waitFor();
        fixture.confirmations.push(false);
        const before = fixture.count('cloud_sync_command.sync');
        await b('确认同步…').click();
        const confirmationDeadline = performance.now() + 7000;
        while (fixture.confirmations.length) {
          if (performance.now() > confirmationDeadline) throw Error('Native confirmation was not invoked');
          await new Promise(r => setTimeout(r, 10));
        }
        assert.equal(fixture.count('cloud_sync_command.sync'), before);
        fixture.confirmations.push(true); await b('确认同步…').click();
        await page.getByText('远端版本已接收，仍在等待本机安全保存与应用', { exact: true }).waitFor();
        assert.equal(fixture.count('cloud_sync_command.sync'), before + 1);
        assert.equal(await page.getByText(/上次完成：/).count(), 0);
        assert.match(await page.locator('.preferences').innerText(), /32 MiB.*48 MiB.*16 MiB/);
        return { nativeConfirm: true, report: fixture.cloudReport };
      });
      await scenario('cloud-late-preview-after-navigation-and-single-error', async () => {
        await open(); await category('account');
        const gate = fixture.hold('cloud_sync_command.preview');
        await b('预览').click(); await bounded(gate.ready, 'preview reached native boundary');
        await category('notes'); gate.release(); await flushFrames();
        assert.equal(await page.getByRole('region', { name: '同步预览' }).count(), 0);
        await category('account');
        fixture.failNext('cloud_sync_command.test', { code: 'network', message: '独立故障：云服务不可用' });
        await b('测试连接').click();
        await page.getByRole('alert').filter({ hasText: '独立故障：云服务不可用' }).waitFor();
        assert.equal(await page.getByRole('alert').filter({ hasText: '独立故障：云服务不可用' }).count(), 1);
        return { stalePreviewAbsent: true, errorSurfaces: 1 };
      });
      await scenario('encrypted-import-committed-maintenance-error-is-preserved', async () => {
        await open(); await category('backup'); await backupIdle();
        fixture.archiveMaintenanceError = {code:'independent_maintenance',message:'独立维护失败，提交已完成'};
        await b('加密导入…').click();
        await page.getByLabel('备份密码',{exact:true}).fill('independent-synthetic-passphrase');
        await b('选择文件并预览…').click();
        await b('确认导入').waitFor();
        const before=fixture.count('settings_archive.confirm');
        await b('确认导入').click();
        await page.waitForFunction(()=>!document.querySelector('.local-backup-confirm'));
        await backupIdle();
        const text=await page.locator('.local-backup-settings').innerText();
        await page.screenshot({path:resolve(out,`${platform}-encrypted-committed-maintenance.png`)});
        assert.equal(fixture.count('settings_archive.confirm'),before+1);
        assert.match(text,/独立维护失败|导入已提交，但后续维护/,'Committed maintenance error must reach module warning');
        fixture.archiveMaintenanceError=null;
        return {oneCommit:true,text};
      });
      await scenario('cloud-accepted-preview-after-access-prepare-cannot-reappear', async () => {
        await open();await category('account');
        const gate=fixture.hold('cloud_sync_command.preview');
        await b('预览').click();await bounded(gate.ready,'cloud preview response held');
        const operationId='independent-cloud-revoke';
        backend.suspended=['note-a'];backend.operationId=operationId;
        await page.evaluate(value=>{void window.__DEBUG_PLATFORM__.emit('notes-access',value)},
          {phase:'prepare',operationId,noteIds:['note-a'],access:backend.state().access});
        await page.waitForFunction(()=>document.querySelector('.access-cover'));
        gate.release();await flushFrames();
        const present=await page.getByRole('region',{name:'同步预览',includeHidden:true}).count();
        backend.suspended=[];backend.operationId=null;backend.accessEpoch++;
        await page.evaluate(value=>{void window.__DEBUG_PLATFORM__.emit('notes-access',value)},
          {phase:'commit',operationId,noteIds:['note-a'],access:backend.state().access});
        await api(page,'app.refresh');
        await page.screenshot({path:resolve(out,`${platform}-cloud-after-access-restore.png`)});
        assert.equal(present,0,'Revocation must invalidate the visible lifetime/preview, not only cover it');
        return {previewCountAfterPrepare:present};
      });
      await scenario('updater-outdated-status-does-not-override-check-and-error-once', async () => {
        await open();await category('settings');
        const gate=fixture.hold('software_update_status');
        await bounded(gate.ready,'root updater poll');
        await page.locator('.preferences-update-action').click();
        await b('检查更新').click();
        await page.getByText('此频道没有比当前版本更新的发布',{exact:true}).waitFor();
        gate.release({...fixture.update,phase:'checking'});await flushFrames();
        assert.equal(await page.getByText('正在检查更新…',{exact:true}).count(),0);
        fixture.failNext('software_update_check','network_independent');
        await b('检查更新').click();
        await page.getByRole('alert').filter({hasText:'暂时无法连接更新服务'}).waitFor();
        assert.equal(await page.getByRole('alert').filter({hasText:'暂时无法连接更新服务'}).count(),1);
        assert.equal(fixture.count('software_update_install'),0);
        return {oldPollRejected:true,errorSurfaces:1};
      });
      await scenario('actual-update-desktop-selectors-use-menu-adapter', async () => {
        await open();await category('settings');await page.locator('.preferences-update-action').click();
        const control=page.getByLabel('更新频道',{exact:true});
        const tag=await control.evaluate(el=>el.tagName);
        if(!mobile){
          await control.click();
          await page.screenshot({path:resolve(out,'desktop-updater-channel-control.png')});
          assert.equal(tag,'BUTTON','Final desktop updater must use settings menu adapter, not native SELECT');
          await page.getByRole('menu').waitFor();await page.keyboard.press('Escape');
        }else assert.equal(tag,'SELECT');
        return {tag};
      });
      await scenario('encrypted-precommit-rejection-and-plain-confirm-cancel', async()=>{
        await open();await category('backup');await backupIdle();
        fixture.failNext('settings_archive.preview',{code:'backup_password',message:'密码错误或加密归档已损坏；未导入任何数据'});
        const commits=fixture.count('settings_archive.confirm');
        await b('加密导入…').click();await page.getByLabel('备份密码',{exact:true}).fill('wrong-independent-synthetic');
        await b('选择文件并预览…').click();await page.getByRole('alert').filter({hasText:'密码错误或加密归档已损坏'}).waitFor();
        assert.equal(fixture.count('settings_archive.confirm'),commits);
        assert.equal(await page.getByLabel('备份密码',{exact:true}).inputValue(),'');
        await b('取消').click();
        fixture.confirmations.push(false);const discards=fixture.count('settings_archive.discard');
        await b('导入…').click();
        const deadline=performance.now()+7000;
        while(fixture.count('settings_archive.discard')===discards){if(performance.now()>deadline)throw Error('Plain import cancel did not discard preview');await page.waitForTimeout(20)}
        assert.equal(fixture.count('settings_archive.confirm'),commits);
        return {rejectedBeforeConfirm:true,cancelDiscarded:true};
      });
      await scenario('cloud-secret-draft-cleared-across-access-generation',async()=>{
        await open();await category('account');
        await page.locator('.cloud-sync-settings').getByRole('button',{name:'设置…',exact:true}).click();
        await page.getByLabel('加密密码',{exact:true}).fill('independent-ephemeral-draft');
        const operationId='independent-draft-revoke';backend.suspended=['note-a'];backend.operationId=operationId;
        await page.evaluate(value=>{void window.__DEBUG_PLATFORM__.emit('notes-access',value)},
          {phase:'prepare',operationId,noteIds:['note-a'],access:backend.state().access});
        await page.waitForFunction(()=>document.querySelector('.access-cover'));
        backend.suspended=[];backend.operationId=null;backend.accessEpoch++;
        await page.evaluate(value=>{void window.__DEBUG_PLATFORM__.emit('notes-access',value)},
          {phase:'commit',operationId,noteIds:['note-a'],access:backend.state().access});
        await api(page,'app.refresh');
        const fields=page.getByLabel('加密密码',{exact:true});
        const length=await fields.count()?await fields.inputValue().then(v=>v.length):0;
        assert.equal(length,0,'Cloud secret draft must not survive access-generation replacement');
        return {remainingSecretLength:length};
      });
      await scenario('composed-sidebar-and-action-tokens',async()=>{
        await open();await category('settings');
        const rows=[];
        for(const scheme of ['light','dark']){
          if(mobile)await page.getByLabel('外观',{exact:true}).selectOption(scheme);
          else await page.getByRole('radio',{name:scheme==='light'?'浅色':'深色',exact:true}).click();
          await page.waitForFunction(s=>document.documentElement.classList.contains('dark')===(s==='dark'),scheme);
          const sidebar=await page.locator('.preferences-navigation').evaluate(el=>({width:el.getBoundingClientRect().width,gap:getComputedStyle(el).gap,background:getComputedStyle(el).backgroundColor})).catch(()=>null);
          await category('backup');await backupIdle();
          const backup=await b('立即备份').evaluate(el=>({color:getComputedStyle(el).color,font:getComputedStyle(el).fontSize,padding:getComputedStyle(el).padding,height:el.getBoundingClientRect().height}));
          await category('account');await b('刷新设备').waitFor();
          const cloud=await b('测试连接').evaluate(el=>({color:getComputedStyle(el).color,font:getComputedStyle(el).fontSize,padding:getComputedStyle(el).padding,height:el.getBoundingClientRect().height}));
          await category('settings');await page.locator('.preferences-update-action').click();await b('检查更新').waitFor();
          const update=await b('检查更新').evaluate(el=>({color:getComputedStyle(el).color,font:getComputedStyle(el).fontSize,padding:getComputedStyle(el).padding,height:el.getBoundingClientRect().height}));
          const pill=await page.locator('.preferences-update-pill').evaluate(el=>({height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius,arrow:el.querySelector('svg')?.getAttribute('class')}));
          rows.push({scheme,sidebar,backup,cloud,update,pill});
          const gray=scheme==='light'?'rgb(99, 99, 107)':'rgb(161, 161, 170)';
          for(const action of [backup,cloud,update]){assert.equal(action.color,gray);assert.equal(action.font,'12px');assert.equal(action.padding,'3px 7px');if(mobile)assert(action.height>=44)}
          assert.equal(pill.height,22);assert.equal(pill.radius,'999px');assert.match(pill.arrow,/arrow-up/);
          if(!mobile){assert.equal(sidebar.width,196);assert.equal(sidebar.gap,'8px')}
          await page.keyboard.press('Escape');
        }
        return rows;
      });
      await scenario('actual-search-import-backup-target-follows-new-owner',async()=>{
        await open();await category('settings');
        await page.getByRole('searchbox',{name:'查找设置'}).fill('导入与备份');
        await page.getByRole('region',{name:'设置查找结果'}).waitFor();
        await page.getByRole('region',{name:'设置查找结果'}).getByRole('button').first().click();
        await page.locator('.local-backup-settings').waitFor();await backupIdle();
        await page.waitForTimeout(5200);
        const message=await page.locator('.preferences-search-notice').innerText().catch(()=>'');
        const target=await page.locator('.local-backup-settings').evaluate(el=>el.contains(document.activeElement)||el===document.activeElement);
        await page.screenshot({path:resolve(out,`${platform}-search-backup-destination.png`)});
        assert(!message.includes('尚未加载完成'),'Search points to retired DataManagement backup owner despite ready actual module');
        assert(target,'Actual backup module or its import control must receive focus');
        return {message,target};
      });
      await scenario('updater-shared-root-poll-chain-and-manual-check', async () => {
        await open(); await category('settings');
        // Install only here. Other tests use real time and manually released IPC.
        // Use real bounded time: App debug commands depend on live animation frames.
        await page.waitForTimeout(2100);
        const first = fixture.count('software_update_status');
        for (let i = 0; i < 3; i++) {
          await page.locator('.preferences-update-action').click();
          await b('检查更新').waitFor();
          await page.keyboard.press('Escape');
          await b('关闭设置').click(); await open(); await category('settings');
        }
        await page.waitForTimeout(6100); await flushFrames();
        const delta = fixture.count('software_update_status') - first;
        assert(delta >= 1 && delta <= 4, 'Opening settings must not accumulate root updater poll chains: ' + delta);
        await page.locator('.preferences-update-action').click();
        const checksBefore = fixture.count('software_update_check');
        await b('检查更新').click();
        await page.getByText('此频道没有比当前版本更新的发布', { exact: true }).waitFor();
        assert.equal(fixture.count('software_update_check'), checksBefore + 1);
        assert.equal(fixture.count('software_update_install'), 0);
        return { statusDeltaAcross6100ms: delta, opens: 3, checks: 1 };
      });
      await scenario('actual-update-layering-and-platform-menu', async () => {
        await open(); await category('settings');
        await page.locator('.preferences-update-action').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.preferences-update-pane:visible').count(), 0);
        assert.equal(await page.locator('.preferences').count(), 1);
        assert(await page.locator('.preferences-update-action').evaluate(el => el === document.activeElement));
        if (!mobile) {
          await b('主题').click(); await page.getByRole('menu').waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('menu').count(), 0);
          assert.equal(await page.locator('.preferences').count(), 1);
        } else assert.equal(await page.getByRole('combobox', { name: '主题', exact: true }).count(), 1);
        return { settingsRetained: true };
      });
      await scenario('actual-module-viewport-light-dark-screenshots', async () => {
        const sizes = mobile ? [320, 390] : [800, 1280];
        const failures = [];
        for (const width of sizes) for (const appearance of ['light', 'dark']) {
          await page.setViewportSize({ width, height: mobile ? 844 : 800 });
          await open(); await category('settings');
          if (mobile) await page.getByLabel('外观', { exact: true }).selectOption(appearance);
          else await page.getByRole('radio', { name: appearance === 'light' ? '浅色' : '深色', exact: true }).click();
          for (const id of ['account', 'backup', 'settings']) {
            await category(id);
            if (id === 'settings') await page.locator('.preferences-update-action').click();
            const shape = await page.locator('.preferences-workspace').evaluate(el => ({
              client: el.clientWidth, scroll: el.scrollWidth,
              short: [...el.querySelectorAll('button,select,summary')].filter(n =>
                n.getClientRects().length && !n.closest('[hidden],[inert]') && n.getBoundingClientRect().height < 44)
                .map(n => ({ text: n.textContent.slice(0, 45), height: n.getBoundingClientRect().height })),
            }));
            if (shape.scroll > shape.client + 1 || mobile && shape.short.length) failures.push({ width, appearance, id, ...shape });
            await page.screenshot({ path: resolve(out, `${platform}-${width}-${appearance}-${id}.png`) });
            if (id === 'settings') await page.keyboard.press('Escape');
          }
        }
        assert.deepEqual(failures, []);
        return { widths: sizes, appearances: ['light', 'dark'], pages: ['account', 'backup', 'update'] };
      });
      receipts.push({ platform, metadata: runtime.metadata, nativeCalls: fixture.calls, browserErrors: runtime.errors });
      errors.push(...runtime.errors);
    } catch (error) {
      checks.push({ platform, name: 'runtime-setup-or-unhandled', pass: false, error: String(error) });
    } finally {
      fixture.releaseAll();
      await runtime?.cleanup();
    }
  }
} finally {
  FakeBackend.prototype.call = originalCall;
  const finalRevision = git('rev-parse', 'HEAD');
  const finalDirty = productDirty();
  const pass = checks.length > 0 && checks.every(c => c.pass) && !errors.length && finalRevision === revision && !finalDirty;
  await writeFile(resolve(out, 'result.json'), JSON.stringify({
    revision, finalRevision, finalDirty, pass, checks, errors,
    scope: 'Production main.tsx/App and modules to synthetic native IPC; no Rust Store/barrier/native install acceptance',
  }, null, 2) + '\n');
  await writeFile(resolve(out, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
  if (!pass) process.exitCode = 1;
}
