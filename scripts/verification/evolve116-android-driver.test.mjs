/** FAKE transport only: no adb, emulator, APK, WebView or IME acceptance. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareOwnedAndroid, connectOwnedAndroid } from './evolve116-android-driver.mjs';

const HASH = 'a'.repeat(64), BOOT = '12345678-1234-1234-1234-123456789abc';
async function fixture(t) {
  const root = await mkdtemp(path.join(realpathSync(tmpdir()), 'evolve116-fake-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = { adb: '/nonexistent/explicit-sdk/adb', adbServerPort: 5037, serial: 'emulator-5580',
    avd: 'evolve116_fixture_only', package: 'com.local.notesclone.fixture',
    activity: 'com.local.notesclone.fixture/com.local.notesclone.MainActivity', expectedAPKsha: HASH, evidence: path.join(root, 'evidence') };
  const state = { qemu: '1', avd: config.avd, boot: BOOT, hash: HASH, pid: '123', cmdline: config.package + '\0', activity: config.activity,
    forwards: [], reverses: [], adb: [], cdp: [], pageId: 'owned-page', duplicate: false, badSocket: false,
    sync: { status: { workspaceId: 'workspace-fixture', deviceId: 'android-fixture', peers: [{ id: 'desktop-fixture', endpoint: 'ws://127.0.0.1:6010' }] } } };
  const workspace = { notes: [{ id: 'owned-note', document: { type: 'doc', content: [] } }], attachments: [], settings: { theme: 'fixture' } };
  const transport = {
    async adb(args) {
      state.adb.push([...args]); const command = args.join(' ');
      if (command === 'shell getprop ro.kernel.qemu') return state.qemu;
      if (command === 'shell getprop ro.boot.qemu.avd_name') return state.avd;
      if (command === 'shell cat /proc/sys/kernel/random/boot_id') return state.boot;
      if (command.startsWith('shell pm path ')) return 'package:/data/app/~~fake/app-fixture/base.apk\n';
      if (command.startsWith('shell toybox sha256sum ')) return state.hash + '  /data/app/~~fake/app-fixture/base.apk\n';
      if (command.startsWith('shell pidof ')) return state.pid;
      if (/^shell cat \/proc\/\d+\/cmdline$/.test(command)) return state.cmdline;
      if (command === 'shell dumpsys activity activities') return `mResumedActivity: ActivityRecord{fake u0 ${state.activity} t1}\n`;
      if (command.startsWith('forward --no-rebind ')) {
        state.forwards.push(`${config.serial} tcp:42001 ${args[3]}`); return '42001\n';
      }
      if (command === 'forward --list') return state.forwards.join('\n');
      if (command.startsWith('forward --remove ')) { state.forwards = state.forwards.filter(row => row.split(' ')[1] !== args[2]); return ''; }
      if (command.startsWith('reverse --no-rebind ')) {
        if (state.failReverse) throw Error('fake secret transport detail');
        state.reverses.push(`host-serial ${args[2]} ${args[3]}`); return '';
      }
      if (command === 'reverse --list') return state.reverses.join('\n');
      if (command.startsWith('reverse --remove ')) { state.reverses = state.reverses.filter(row => row.split(' ')[1] !== args[2]); return ''; }
      if (command.startsWith('shell input ') || command.startsWith('shell wm ') || command === 'shell dumpsys input_method') return 'fake native state';
      throw Error('unexpected fake adb command: ' + command);
    },
    async pages(port) {
      const p = { id: state.pageId, type: 'page', url: 'http://tauri.localhost/',
        webSocketDebuggerUrl: `ws://${state.badSocket ? 'unowned.invalid' : '127.0.0.1'}:${port}/devtools/page/${state.pageId}` };
      return state.duplicate ? [p, { ...p, id: 'other' }] : [p];
    },
    async connect() {
      return {
        async send(method, params) {
          state.cdp.push({ method, params });
          if (state.holdInput && method === 'Input.insertText') await state.holdInput;
          if (state.failInput && method === 'Input.insertText') throw Error('TOP-SECRET-INVITATION');
          if (method !== 'Runtime.evaluate') return {};
          const e = params.expression;
          let value;
          if (e.startsWith('!!window')) value = true;
          else if (e.includes('sync_command')) value = state.sync;
          else if (e.includes('return w.settings')) value = workspace.settings;
          else if (e.includes('getBoundingClientRect')) value = { x: 50, y: 80 };
          else if (e.includes('return{viewport:')) value = { viewport: { width: 320 }, editor: { noteId: 'owned-note' } };
          else if (e.includes('load_workspace')) value = workspace;
          else throw Error('unexpected fake expression');
          return { result: { value } };
        },
        close() { state.closed = (state.closed || 0) + 1; },
      };
    },
  };
  const clients = [];
  t.after(async () => { for (const c of clients) await c.close().catch(() => {}); });
  return { root, config, state, transport, connect: async () => {
    const client = await connectOwnedAndroid(config, { transport }); clients.push(client); return client;
  } };
}
const mutations = s => s.adb.filter(a => a[0] === 'forward' && a[1] !== '--list' || a[0] === 'reverse' && a[1] !== '--list' || a[0] === 'shell' && ['input', 'wm', 'am', 'settings'].includes(a[1]));

test('prepare rejects missing identity, original serial, malformed paths/components/hash without transport', async t => {
  const f = await fixture(t);
  assert.equal(prepareOwnedAndroid(f.config).serial, 'emulator-5580');
  for (const key of Object.keys(f.config)) {
    const bad = { ...f.config }; delete bad[key]; assert.throws(() => prepareOwnedAndroid(bad));
  }
  for (const patch of [{ serial: 'original-phone' }, { serial: 'emulator-5581' }, { adb: 'adb' }, { evidence: 'relative' },
    { expectedAPKsha: 'not-a-hash' }, { activity: 'other.package/.MainActivity' }, { package: 'x; reboot' }, { extra: 'TOP-SECRET-INVITATION' }])
    assert.throws(() => prepareOwnedAndroid({ ...f.config, ...patch }));
  assert.equal(f.state.adb.length, 0);
});

for (const [field, value, code] of [
  ['qemu', '0', 'EMULATOR_IDENTITY'], ['avd', 'history-user-avd', 'AVD_IDENTITY'], ['boot', 'invalid', 'BOOT_IDENTITY'],
  ['hash', 'b'.repeat(64), 'APK_IDENTITY'], ['pid', '123 456', 'PID_IDENTITY'],
  ['cmdline', 'other.package\0', 'PROCESS_IDENTITY'], ['activity', 'other.package/.MainActivity', 'FOREGROUND_IDENTITY'],
]) test(`initial ${field} mismatch makes zero device/CDP mutations`, async t => {
  const f = await fixture(t); f.state[field] = value;
  await assert.rejects(f.connect(), { code });
  assert.deepEqual(mutations(f.state), []); assert.deepEqual(f.state.cdp, []);
  assert.deepEqual(await readdir(f.config.evidence), []);
});

for (const change of ['duplicate', 'badSocket']) test(`${change} WebView rejects input and removes only its created forward`, async t => {
  const f = await fixture(t); f.state[change] = true;
  f.state.forwards.push('emulator-5554 tcp:45000 localabstract:history');
  await assert.rejects(f.connect());
  assert.deepEqual(f.state.cdp, []);
  assert.deepEqual(f.state.forwards, ['emulator-5554 tcp:45000 localabstract:history']);
  assert.deepEqual(mutations(f.state).map(a => a.slice(0, 2)), [['forward', '--no-rebind'], ['forward', '--remove']]);
});

test('fake read/UI/native/sync operations bind to explicit identity; mappings and close stay owned', async t => {
  const f = await fixture(t), client = await f.connect();
  assert.equal((await client.readNote('owned-note')).note.id, 'owned-note');
  assert.equal((await client.readSettings()).theme, 'fixture');
  assert.equal((await client.readUI()).viewport.width, 320);
  assert.equal((await client.readWorkspace()).notes.length, 1);
  await client.readSync(); await client.readNativeState();
  await client.assertSyncIdentity({ workspaceId: 'workspace-fixture', deviceId: 'android-fixture', peerId: 'desktop-fixture', endpoint: 'ws://127.0.0.1:6010' });
  await client.click('button.fixture'); await client.insertText('fixture data');
  await client.tap(50, 80); await client.longPress(50, 80, 800); await client.back(); await client.rotate(1);
  await client.createReverse({ hostEndpoint: 'ws://127.0.0.1:6011', guestEndpoint: 'ws://127.0.0.1:6010' });
  f.state.forwards.push('emulator-5554 tcp:43000 localabstract:history');
  f.state.reverses.push('host-serial tcp:6012 tcp:6013');
  const closing = client.close(); assert.equal(client.close(), closing); await closing;
  await assert.rejects(client.back(), { code: 'ANDROID_DRIVER_CLOSED' });
  assert.deepEqual(f.state.forwards, ['emulator-5554 tcp:43000 localabstract:history']);
  assert.deepEqual(f.state.reverses, ['host-serial tcp:6012 tcp:6013']);
  const receipt = JSON.parse(await readFile(path.join(f.config.evidence, 'identity.json')));
  assert.equal(receipt.expectedAPKsha, HASH); assert.equal(receipt.acceptance, false);
  assert.equal(f.state.closed, 1);
  assert(!f.state.adb.some(a => ['install', 'start-server', 'kill-server'].includes(a[0])));
});

for (const [field, value] of [['avd', 'history-user-avd'], ['boot', '22345678-1234-1234-1234-123456789abc'],
  ['hash', 'b'.repeat(64)], ['pid', '456'], ['activity', 'other.package/.MainActivity'], ['pageId', 'new-page']])
  test(`late ${field} change stops before input and never replays`, async t => {
    const f = await fixture(t), client = await f.connect(), count = mutations(f.state).length;
    f.state[field] = value;
    await assert.rejects(client.insertText('must-not-be-sent'));
    assert.equal(mutations(f.state).length, count);
    assert(!f.state.cdp.some(m => m.method.startsWith('Input.')));
    await assert.rejects(client.back(), { code: 'SESSION_STOPPED' });
    if (['avd', 'boot'].includes(field)) {
      await assert.rejects(client.close());
      assert.equal(mutations(f.state).length, count, 'no cleanup mutation on replacement device/boot');
    } else await client.close();
  });

test('cleanup preserves externally replaced mappings, repeated close cannot remove successor lease', async t => {
  const f = await fixture(t), client = await f.connect();
  await client.createReverse({ hostEndpoint: 'ws://127.0.0.1:6011', guestEndpoint: 'ws://127.0.0.1:6010' });
  f.state.forwards = [`${f.config.serial} tcp:42001 localabstract:replacement`];
  f.state.reverses = ['host-serial tcp:6010 tcp:7777'];
  await client.close();
  const lock = client.identity.leasePath; await mkdir(lock); await writeFile(path.join(lock, 'owner'), 'successor');
  t.after(() => rm(lock, { recursive: true }));
  await client.close();
  assert.equal(await readFile(path.join(lock, 'owner'), 'utf8'), 'successor');
  assert.equal(f.state.forwards.length, 1); assert.equal(f.state.reverses.length, 1);
  assert(!f.state.adb.some(a => a[1] === '--remove'));
});

test('lease conflict and symlink evidence reject before any device commands', async t => {
  const f = await fixture(t), client = await f.connect(), before = f.state.adb.length;
  await assert.rejects(f.connect(), { code: 'ANDROID_DRIVER_LOCK_BUSY' });
  await assert.rejects(connectOwnedAndroid({ ...f.config, evidence: path.join(f.root, 'other-evidence') }, { transport: f.transport }), { code: 'ANDROID_DRIVER_LOCK_BUSY' });
  assert.equal(f.state.adb.length, before); await client.close();
  const alias = path.join(f.root, 'alias'); await symlink(f.config.evidence, alias);
  const afterClose = f.state.adb.length;
  await assert.rejects(connectOwnedAndroid({ ...f.config, evidence: alias }, { transport: f.transport }), { code: 'PRIVATE_DIRECTORY' });
  assert.equal(f.state.adb.length, afterClose);
});

test('invitation only reaches in-memory CDP; transport exceptions are sanitized, never retried', async t => {
  const f = await fixture(t), client = await f.connect(); f.state.failInput = true;
  await assert.rejects(client.fill('textarea[data-sensitive]', 'TOP-SECRET-INVITATION'), e => !e.message.includes('TOP-SECRET') && !e.stack.includes('TOP-SECRET'));
  await assert.rejects(client.fill('textarea[data-sensitive]', 'TOP-SECRET-INVITATION'), { code: 'SESSION_STOPPED' });
  assert.equal(f.state.cdp.filter(m => m.method === 'Input.insertText').length, 1);
  assert(!JSON.stringify(f.state.adb).includes('TOP-SECRET'));
  assert(!(await readFile(path.join(f.config.evidence, 'identity.json'), 'utf8')).includes('TOP-SECRET'));
  await client.close();
});

test('close waits for in-flight write, rejects concurrent/new operations and then cleans once', async t => {
  const f = await fixture(t), client = await f.connect();
  let release; f.state.holdInput = new Promise(resolve => { release = resolve; });
  const input = client.insertText('one write');
  while (!f.state.cdp.some(m => m.method === 'Input.insertText')) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(client.back(), { code: 'OPERATION_BUSY' });
  const closing = client.close(); await assert.rejects(client.back(), { code: 'ANDROID_DRIVER_CLOSED' });
  assert.equal(f.state.closed, undefined); release(); await input; await closing;
  assert.equal(f.state.closed, 1); assert.equal(f.state.forwards.length, 0);
});

test('reverse failure does not adopt or remove an existing mapping', async t => {
  const f = await fixture(t), client = await f.connect();
  f.state.failReverse = true; f.state.reverses.push('host-serial tcp:6010 tcp:6011');
  await assert.rejects(client.createReverse({ hostEndpoint: 'ws://127.0.0.1:6011', guestEndpoint: 'ws://127.0.0.1:6010' }));
  await client.close();
  assert.deepEqual(f.state.reverses, ['host-serial tcp:6010 tcp:6011']);
  assert(!f.state.adb.some(a => a[0] === 'reverse' && a[1] === '--remove'));
});

test('sync identity checks workspace/device/peer AND endpoint, not merely peer count', async t => {
  const f = await fixture(t), client = await f.connect();
  await assert.rejects(client.assertSyncIdentity({ workspaceId: 'workspace-fixture', deviceId: 'android-fixture', peerId: 'desktop-fixture', endpoint: 'ws://127.0.0.1:6999' }), { code: 'SYNC_IDENTITY' });
  assert(!f.state.cdp.some(m => m.method.startsWith('Input.'))); await client.close();
});

test('used evidence refuses reconnect before adb or receipt overwrite', async t => {
  const f = await fixture(t), client = await f.connect(); await client.close();
  const before = f.state.adb.length, receipt = await readFile(path.join(f.config.evidence, 'identity.json'), 'utf8');
  await assert.rejects(f.connect(), { code: 'EVIDENCE_ALREADY_USED' });
  assert.equal(f.state.adb.length, before);
  assert.equal(await readFile(path.join(f.config.evidence, 'identity.json'), 'utf8'), receipt);
});

for (const compatible of [false, true]) test(`native adapter + fake executable/fake daemon (${compatible ? 'matching' : 'wrong'} protocol); no real adb`, async t => {
  const f = await fixture(t), calls = path.join(f.root, 'fake-calls.jsonl'), fakeAdb = path.join(f.root, 'fake-adb.mjs');
  await writeFile(fakeAdb, `#!${process.execPath}\nimport{appendFileSync}from'node:fs';
appendFileSync(${JSON.stringify(calls)},JSON.stringify({args:process.argv.slice(2),home:process.env.HOME,androidUserHome:process.env.ANDROID_USER_HOME,avdHome:process.env.ANDROID_AVD_HOME,keys:process.env.ADB_VENDOR_KEYS})+'\\n');
if(process.argv[2]==='version')console.log('Android Debug Bridge version 1.0.41');else console.log('wrong-avd\\nOK');\n`, { mode: 0o700 });
  // This is a tiny loopback protocol fixture, NOT an adb server or a device.
  const requests = [], server = net.createServer(socket => {
    socket.on('data', data => { requests.push(data.toString()); socket.end(compatible ? 'OKAY00040029' : 'OKAY00040028'); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const serverPort = server.address().port;
  await assert.rejects(connectOwnedAndroid({ ...f.config, adb: fakeAdb, adbServerPort: serverPort }), { code: compatible ? 'EMULATOR_IDENTITY' : 'ADB_SERVER_VERSION' });
  const rows = (await readFile(calls, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(requests, ['000chost:version']);
  assert.equal(rows.length, compatible ? 2 : 1);
  assert.deepEqual(rows[0].args, ['version']);
  for (const row of rows) {
    assert.equal(row.home, process.env.HOME);
    assert.equal(row.androidUserHome, path.join(f.config.evidence, 'android-user'));
    assert.equal(row.avdHome, row.androidUserHome); assert.equal(row.keys, row.androidUserHome);
  }
  if (compatible) assert.deepEqual(rows[1].args, ['-H', '127.0.0.1', '-P', String(serverPort), '-s', f.config.serial, 'shell', 'getprop', 'ro.kernel.qemu']);
});

test('prepare CLI is device-free, strict, and never echoes an invitation passed as an extra field', async t => {
  const f = await fixture(t), file = path.join(f.root, 'config.json');
  await writeFile(file, JSON.stringify(f.config));
  const run = promisify(execFile), driver = new URL('./evolve116-android-driver.mjs', import.meta.url);
  const result = await run(process.execPath, [driver.pathname, 'prepare', file]);
  assert.equal(JSON.parse(result.stdout).deviceCommandsExecuted, false);
  assert.deepEqual(await readdir(f.root), ['config.json']);
  await writeFile(file, JSON.stringify({ ...f.config, invitation: 'TOP-SECRET-INVITATION' }));
  await assert.rejects(run(process.execPath, [driver.pathname, 'prepare', file]), error => {
    assert(!error.stdout.includes('TOP-SECRET')); assert.equal(error.stderr.trim(), 'CONFIG_FIELDS'); return true;
  });
});
