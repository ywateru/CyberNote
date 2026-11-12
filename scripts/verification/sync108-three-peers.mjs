#!/usr/bin/env node
// Two real native desktop processes + one owned Android sandbox. No SQL or ACK mocks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile, chmod, readdir, stat, realpath } from 'node:fs/promises';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { NativeApp, until, delay } from './sync108-native-driver.mjs';
import {
  SERIAL, PACKAGE, connectAndroid, launchAndroid, ownPid, backgroundAndroid,
  reclaimBackgroundAndroid, createOwnedReverse, removeOwnedReverse, removeOwnedForward,
} from './sync108-android.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const refs = node => [...(node?.type === 'attachment' ? [node.attrs.id] : []), ...(node?.content || []).flatMap(refs)];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
const digest = note => hash(JSON.stringify(canonical({ document: note.document, plainText: note.plainText })));
const safeFailure = (error, diagnostics) => ({
  code: /^[A-Z_]{1,80}$/.test(error.code || '') ? error.code : 'ASSERTION_OR_DRIVER_FAILURE',
  ...(typeof error.phase === 'string' ? { phase: error.phase } : diagnostics ? { phase: diagnostics.phase } : {}),
  ...((error.selector || diagnostics?.selector) ? { selector: error.selector || diagnostics.selector } : {}),
  ...(typeof error.operator === 'string' ? { assertionOperator: error.operator } : {}),
});
async function fileHash(file) {
  const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex');
}
// Same build provenance algorithm as the committed two-native runner.
async function sourceFingerprint(root) {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
    'src', 'src-tauri/src', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json',
    'src-tauri/capabilities', 'plugins', 'scripts/verification/sync108-native*', 'scripts/build-info.mjs',
    'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'index.html'], { cwd: root }).toString().split('\0').filter(Boolean);
  const manifest = {};
  for (const name of [...new Set(files)].sort()) manifest[name] = await fileHash(resolve(root, name));
  return { sha256: hash(JSON.stringify(manifest)), files: manifest };
}
async function distFingerprint(root) {
  const base = resolve(root, 'dist'), files = {};
  for (const entry of await readdir(base, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) { const file = resolve(entry.parentPath, entry.name); files[relative(base, file)] = await fileHash(file); }
  }
  assert(Object.keys(files).length, 'Static frontend must exist');
  return { sha256: hash(JSON.stringify(Object.fromEntries(Object.entries(files).sort()))), files };
}
function options(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].slice(2);
    assert(['binary', 'root', 'output', 'build-record', 'retained-forward', 'continue-from'].includes(key) && argv[i].startsWith('--'), 'Unknown option');
    assert(!opts[key] && argv[i + 1] && !argv[i + 1].startsWith('--'), 'Missing or duplicate option');
    opts[key] = argv[++i];
    assert(isAbsolute(opts[key]), 'All input paths must be absolute');
  }
  assert(opts.binary && opts.root && opts.output && opts['build-record'], 'Explicit binary, source root, fresh output and frozen build record required');
  return opts;
}
async function freePort() {
  const server = createServer();
  return new Promise((done, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', () => {
      const port = server.address().port; server.close(error => error ? reject(error) : done(port));
    });
  });
}
function syntheticPNG() {
  const crc32 = data => { let c = 0xffffffff; for (const byte of data) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, bytes) => { const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([name, bytes]))); return Buffer.concat([size, name, bytes, crc]); };
  const w = 48, h = 32, ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (1 + w * 4) + 1 + x * 4; raw[i] = x * 5; raw[i + 1] = y * 7; raw[i + 2] = 108; raw[i + 3] = 255; }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const documentFor = (title, body) => ({ type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: body }] },
  { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '完整中文、emoji 🌏 与列表结构' }] }] }] },
] });

class Desktop {
  constructor(app) { this.app = app; }
  async command(command, args = {}) { const value = await this.app.execute(command, args); await this.app.idle(); return value; }
  async workspace() { return (await this.app.state()).workspace; }
  async note(id) { return (await this.workspace()).notes.find(n => n.id === id); }
  async enterSync() { if (!(await this.app.state()).preferences.open) await this.command('settings.open'); await this.command('settings.tab', { tab: 'sync' }); }
  async leaveSync() { await this.command('settings.tab', { tab: 'settings' }); await this.command('app.back'); }
  async sync(command, args = {}) {
    await this.enterSync();
    try { await this.command(command, args); const s = (await this.app.state()).synchronization; assert(!s.error, 'Sync UI reports no failure'); return s.status; }
    finally { await this.leaveSync(); }
  }
  async invite(endpoint) {
    await this.enterSync();
    try {
      await this.command('sync.invite', { endpoint });
      const invitation = await this.app.evaluate(`document.querySelector('[data-sensitive="invitation"]')?.value`);
      assert(typeof invitation === 'string' && invitation.startsWith('notes-sync-v1:'), 'Invitation created in actual UI');
      return invitation;
    } finally { await this.leaveSync(); }
  }
  async create(document) {
    await this.command('folder.select', { id: 'default' }); await this.command('note.create');
    const id = (await this.app.state()).selection.noteId; assert(id, 'Real new-note handler selects note');
    await this.command('editor.setContent', { document }); await this.command('app.flush'); return id;
  }
  async attach(id, fixtures) {
    await this.command('note.select', { id });
    // Only suppress the OS chooser open, then supply a genuine DataTransfer FileList.
    // attachment.choose still captures the real editor target; onChange still runs
    // production FileReader / AttachmentSubmission / original-file storage / body ACK.
    await this.app.evaluate(`(async()=>{
      const input=document.querySelector('input[type="file"]:not([capture])'); if(!input)throw Error();
      const descriptor=Object.getOwnPropertyDescriptor(input,'click');
      Object.defineProperty(input,'click',{configurable:true,value:()=>{}});
      try{await window.__NOTES_DEBUG__.execute('attachment.choose',{kind:'file'});}
      finally{if(descriptor)Object.defineProperty(input,'click',descriptor);else delete input.click;}
      const transfer=new DataTransfer();
      for(const f of arg.files)transfer.items.add(new File([Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))],f.name,{type:f.mime,lastModified:1700000000000}));
      input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      await window.__NOTES_DEBUG__.waitForIdle({timeoutMs:30000});return{count:transfer.files.length};
    })()`, { files: fixtures.map(f => ({ name: f.name, mime: f.mime, base64: f.bytes.toString('base64') })) });
    await this.app.idle(); await this.command('app.flush');
  }
  readOriginal(id, noteId) {
    return this.app.evaluate(`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;
      const a=s.workspace.access,n=a.notes[arg.noteId];if(!n?.authorized)throw Error();
      return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,expected:{sessionId:a.sessionId,epoch:a.epoch,noteEpoch:n.epoch}});})()`, { id, noteId });
  }
}

export async function run(argv = process.argv.slice(2)) {
  const opts = options(argv), root = resolve(opts.root), output = resolve(opts.output);
  assert(output !== root && !output.startsWith(root + sep), 'Evidence must be outside frozen source');
  const record = JSON.parse(await readFile(opts['build-record'], 'utf8'));
  const before = await sourceFingerprint(root), distBefore = await distFingerprint(root), inputSHA = await fileHash(opts.binary);
  assert.equal(record.binary?.sha256, inputSHA, 'Frozen binary SHA must match');
  assert.equal(record.sourceSha256, before.sha256, 'Frozen source SHA must match');
  assert.equal(record.staticFrontendSha256, distBefore.sha256, 'Frozen static frontend SHA must match');
  await mkdir(output); // Never reuse a previous test directory.
  const binary = resolve(output, 'three-peer-native-app'); await copyFile(opts.binary, binary); await chmod(binary, 0o700);
  assert.equal(await fileHash(binary), inputSHA, 'Owned binary snapshot matches frozen input');
  const report = {
    schema: 1, kind: 'two-native-desktop-plus-physical-android', status: 'running', startedAt: new Date().toISOString(),
    binary: { path: binary, sha256: inputSHA }, sourceBefore: before, staticFrontendBefore: distBefore,
    buildRecordSHA256: await fileHash(opts['build-record']), sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    driverCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(fileURLToPath(new URL('../..', import.meta.url))), encoding: 'utf8' }).trim(),
    android: { serial: SERIAL, package: PACKAGE }, topology: {}, cases: [], observations: [], processes: [], cleanup: [],
    boundaries: ['Desktop static debug frontend and gated sync-e2e NativeApp stdio transport; actual App/Session/SQLite/network.',
      'Desktop FileList is synthetic; OS chooser opening suppressed. No fake storage/transport/save ACK.',
      'Android production frontend in isolated debug APK; all writes through visible CDP Input controls.',
      'Invitations remain in memory; no raw stdio, snapshot, plaintext or invitation transcripts. No SQL reads/writes.'],
  };
  const png = { name: 'sync108-three-original.png', mime: 'image/png', bytes: syntheticPNG() };
  const file = { name: 'sync108-three-original.bin', mime: 'application/octet-stream', bytes: Buffer.concat([Buffer.from('Sync108 original file UTF-8 中文\r\nNUL:\0\n'), Buffer.from(Array.from({ length: 256 }, (_, i) => i))]) };
  for (const f of [png, file]) await writeFile(resolve(output, f.name), f.bytes, { mode: 0o600 });
  const apps = [], originals = new Map(), noteIds = new Set(); let a, b, c, reverse, retained;
  const saveReport = () => writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  const runCase = async (id, name, work) => {
    const row = { id, name, status: 'running', startedAt: new Date().toISOString() }; report.cases.push(row); await saveReport();
    try { await work(); row.status = 'pass'; console.log(`PASS ${id}: ${name}`); }
    catch (error) { row.status = 'fail'; row.failure = safeFailure(error, c?.diagnostics); throw error; }
    finally { row.finishedAt = new Date().toISOString(); await saveReport(); }
  };
  const cWorkspace = () => c.readWorkspace();
  const cNote = async id => (await cWorkspace()).notes.find(n => n.id === id);
  const same = async (source, targets, id, label) => {
    const expected = await source(id); assert(expected, 'Source full note exists');
    await until(label, async () => {
      for (const target of targets) { const actual = await target.read(id); if (!actual || digest(actual) !== digest(expected)) return false; }
      return true;
    }, 60000);
    for (const target of targets) { const actual = await target.read(id); assert.deepEqual(actual.document, expected.document); assert.equal(actual.plainText, expected.plainText); }
    report.observations.push({ name: label, noteId: id, targets: targets.map(t => t.name), fullDocumentAndPlainTextSHA256: digest(expected), plainTextChars: expected.plainText.length });
    return expected;
  };
  const verifyAttachments = async (name, workspace, read, owner, fixtures) => {
    const ws = await workspace(), note = ws.notes.find(n => n.id === owner); assert(note, 'Attachment owner exists');
    for (const fixture of fixtures) {
      const row = ws.attachments.find(x => x.noteId === owner && x.displayName === fixture.name);
      assert(row && refs(note.document).includes(row.id), 'Full document references actual attachment');
      const value = await read(row.id, owner), bytes = Buffer.from(value.data, 'base64');
      assert.equal(bytes.length, fixture.bytes.length); assert.equal(hash(bytes), hash(fixture.bytes));
      report.observations.push({ name: `${name}:read-original`, noteId: owner, attachmentId: row.id, bytes: bytes.length, sha256: hash(bytes) });
    }
  };
  try {
    let previous;
    if (opts['continue-from']) {
      const previousFile = resolve(opts['continue-from'], 'result.json');
      previous = JSON.parse(await readFile(previousFile, 'utf8'));
      assert.equal(previous.kind, report.kind); assert.equal(previous.binary.sha256, inputSHA);
      assert.equal(previous.android.serial, SERIAL); assert.equal(previous.android.package, PACKAGE);
      assert(previous.identities?.A && previous.identities?.B && previous.identities?.C);
      for (const name of ['A', 'B']) assert(previous.cleanup.some(row => row.name === `${name}:natural-close` && row.status === 'pass' && row.lifecycle.naturalExit));
      report.continuation = { previousOutput: opts['continue-from'], previousResultSHA256: await fileHash(previousFile), originalIdentities: previous.identities, originalTopology: previous.topology, originalFreshStores: true };
    }
    if (opts['retained-forward']) {
      retained = JSON.parse(await readFile(opts['retained-forward'], 'utf8'));
      assert.equal(retained.serial, SERIAL); assert.equal(retained.package, PACKAGE);
      assert.equal(retained.pid, ownPid(), 'Retained CDP mapping must still belong to original isolated PID');
    }
    for (const name of ['A', 'B']) {
      const directory = previous ? previous.processes.find(row => row.name === name).directory : resolve(output, `store-${name}`);
      if (!previous) await mkdir(directory);
      const app = new NativeApp(binary, directory, { name }); apps.push(app);
      const ready = await app.ready(); assert(['tauri://localhost', 'http://tauri.localhost'].includes(ready.location));
      report.processes.push({ name, pid: app.child.pid, directory, ready });
      if (name === 'A') a = new Desktop(app); else b = new Desktop(app);
    }
    assert.notEqual(apps[0].child.pid, apps[1].child.pid);
    report.phase = 'fresh-desktop-isolation';
    const [initialA, initialB] = await Promise.all([a.sync('sync.status'), b.sync('sync.status')]);
    if (!previous) { assert.equal(initialA.state, 'disabled'); assert.equal(initialB.state, 'disabled'); }
    const [workspaceA, workspaceB] = await Promise.all([a.workspace(), b.workspace()]);
    assert.notEqual(workspaceA.access.sessionId, workspaceB.access.sessionId, 'Fresh native sessions are independent');
    const roots = [];
    for (const app of apps) { const database = resolve(app.directory, 'notes.sqlite3'), info = await stat(database); roots.push({ name: app.name, root: await realpath(app.directory), database, inode: info.ino, device: info.dev }); }
    assert.notEqual(roots[0].root, roots[1].root); assert.notEqual(`${roots[0].device}:${roots[0].inode}`, `${roots[1].device}:${roots[1].inode}`);
    report.isolation = { roots, initialNoteCounts: { A: workspaceA.notes.length, B: workspaceB.notes.length }, sessionIdsDistinct: true, fixedNoteCountRequired: false };
    // Device/workspace identities deliberately do not exist before opt-in.
    report.phase = 'desktop-pairing';
    if (!previous) await a.sync('sync.host.start', { deviceName: 'Sync108 Three A', port: await freePort() });
    const status = await a.sync('sync.status'); const endpoint = status.listenAddress?.replace('0.0.0.0', '127.0.0.1');
    assert(endpoint && new URL(endpoint).hostname === '127.0.0.1', 'A is the owned loopback rendezvous');
    let invitation;
    if (!previous) { invitation = await a.invite(endpoint); try { await b.sync('sync.pair', { invitation, deviceName: 'Sync108 Three B' }); } finally { invitation = undefined; } }
    const [identityA, identityB] = await Promise.all([a.sync('sync.status'), b.sync('sync.status')]);
    assert(identityA.deviceId && identityB.deviceId && identityA.workspaceId && identityB.workspaceId);
    assert.notEqual(identityA.deviceId, identityB.deviceId); assert.equal(identityA.workspaceId, identityB.workspaceId);
    if (previous) {
      for (const [name, identity] of [['A', identityA], ['B', identityB]]) { assert.equal(identity.deviceId, previous.identities[name].deviceId); assert.equal(identity.workspaceId, previous.identities[name].workspaceId); }
      assert.equal(endpoint, previous.topology.A);
    }
    report.identities = { A: { deviceId: identityA.deviceId, workspaceId: identityA.workspaceId }, B: { deviceId: identityB.deviceId, workspaceId: identityB.workspaceId } };
    report.phase = 'android-pairing';
    reverse = createOwnedReverse(Number(new URL(endpoint).port), previous ? { devicePort: Number(new URL(previous.topology.C).port) } : {});
    report.topology = { A: endpoint, B: 'desktop loopback to A', C: `ws://127.0.0.1:${reverse.device.slice(4)}`, reverse };
    launchAndroid(); c = await connectAndroid(); report.android.initialPid = c.owned.pid;
    const androidBefore = await c.syncStatus();
    report.android.preexistingSyntheticNoteCount = (await cWorkspace()).notes.length;
    if (!previous) { invitation = await a.invite(report.topology.C); try { await c.pair({ invitation, deviceName: 'Sync108 Three Android9' }); } finally { invitation = undefined; } }
    await c.closeSettings();
    const identityC = (await c.syncStatus()).status;
    assert(identityC.deviceId && identityC.deviceId !== identityA.deviceId && identityC.deviceId !== identityB.deviceId);
    assert.equal(identityC.workspaceId, identityA.workspaceId);
    if (previous) { assert.equal(identityC.deviceId, previous.identities.C.deviceId); assert.equal(identityC.workspaceId, previous.identities.C.workspaceId); report.continuation.identitiesPreserved = true; }
    report.identities.C = { deviceId: identityC.deviceId, workspaceId: identityC.workspaceId, initialState: androidBefore.status.state };
    report.phase = 'three-peer-cases';

    await runCase('3P-01', 'A to B and C: formatted full document plus PNG original', async () => {
      const id = await a.create(documentFor('SYNC108 三端 A PNG', '甲端原生 App 创建：粗体中文与原字节 PNG。'));
      noteIds.add(id);
      await a.attach(id, [png]); originals.set(id, [png]);
      const saved = await same(id => a.note(id), [{ name: 'B', read: id => b.note(id) }, { name: 'C', read: cNote }], id, 'A to B/C full PNG document');
      assert(JSON.stringify(saved.document).includes('"bold"') && JSON.stringify(saved.document).includes('"bulletList"'));
      await verifyAttachments('A', () => a.workspace(), (id, owner) => a.readOriginal(id, owner), id, [png]);
      await verifyAttachments('B', () => b.workspace(), (id, owner) => b.readOriginal(id, owner), id, [png]);
      await verifyAttachments('C', cWorkspace, id => c.readAttachment(id), id, [png]);
      await c.openNote(id); assert.deepEqual((await c.readEditor()).document, saved.document);
    });
    await runCase('3P-02', 'C real UI create to A then B: complete document and plaintext', async () => {
      const note = await c.createNote({ title: 'SYNC108 三端 Android 反向', body: '三星 Android9 真实 CDP Input 创建。\nC → A → B 完整正文，含中文与 emoji 🌏。' });
      noteIds.add(note.id);
      await c.closeSettings();
      await same(cNote, [{ name: 'A', read: id => a.note(id) }, { name: 'B', read: id => b.note(id) }], note.id, 'C to A/B full UI document');
    });
    await runCase('3P-03', 'B through A to C: text and generic original file', async () => {
      const id = await b.create(documentFor('SYNC108 三端 B 普通文件', '乙端经甲端转发到手机：UTF-8 文本和二进制普通文件。'));
      noteIds.add(id);
      await b.attach(id, [file]); originals.set(id, [file]);
      await same(id => b.note(id), [{ name: 'A', read: id => a.note(id) }, { name: 'C', read: cNote }], id, 'B through A to C full generic-file document');
      for (const [name, device] of [['A', a], ['B', b]]) await verifyAttachments(name, () => device.workspace(), (id, owner) => device.readOriginal(id, owner), id, [file]);
      await verifyAttachments('C', cWorkspace, id => c.readAttachment(id), id, [file]);
    });
    await runCase('3P-04', 'C background process reclaim and relaunch automatically catches up', async () => {
      launchAndroid(); await c.closeSettings();
      const oldPid = c.owned.pid; await c.close(); c = undefined;
      report.android.background = backgroundAndroid();
      report.android.reclaim = await reclaimBackgroundAndroid();
      const id = await a.create(documentFor('SYNC108 手机离线补齐 PNG', '手机进程退出期间由桌面 A 创建，重启后自动补齐。'));
      noteIds.add(id);
      await a.attach(id, [png]); originals.set(id, [png]);
      await same(id => a.note(id), [{ name: 'B', read: id => b.note(id) }], id, 'A to B while C process absent');
      launchAndroid(); c = await connectAndroid(); assert.notEqual(c.owned.pid, oldPid);
      report.android.restartedPid = c.owned.pid;
      // No syncNow/resume/pair command: persisted identity and scheduler must recover.
      await same(id => a.note(id), [{ name: 'C', read: cNote }], id, 'C automatic reconnect full document');
      await verifyAttachments('C', cWorkspace, id => c.readAttachment(id), id, [png]);
      for (const owner of noteIds) await same(id => a.note(id), [{ name: 'B', read: id => b.note(id) }, { name: 'C', read: cNote }], owner, 'all test IDs preserve complete body after C restart');
      for (const [owner, fixtures] of originals) {
        await same(id => a.note(id), [{ name: 'C', read: cNote }], owner, 'C preserves previous complete note after restart');
        await verifyAttachments('C', cWorkspace, id => c.readAttachment(id), owner, fixtures);
      }
      const after = (await c.syncStatus()).status; assert.equal(after.deviceId, identityC.deviceId);
      report.android.identityPersisted = true;
    });
    const sourceAfter = await sourceFingerprint(root), distAfter = await distFingerprint(root);
    assert.equal(sourceAfter.sha256, before.sha256, 'Frozen source unchanged during run');
    assert.equal(distAfter.sha256, distBefore.sha256, 'Static frontend unchanged during run');
    assert.equal(await fileHash(binary), inputSHA);
    report.sourceAfterSHA256 = sourceAfter.sha256; report.staticFrontendAfterSHA256 = distAfter.sha256;
    report.status = 'pass';
  } catch (error) {
    report.status = 'fail'; report.failure = safeFailure(error, c?.diagnostics);
    // No raw error messages, stacks, App state or invitation-bearing values.
  } finally {
    if (c) {
      const owned = { ...c.owned };
      try { await c.close(); report.cleanup.push({ name: 'active-CDP', owned, status: 'pass' }); }
      catch { report.cleanup.push({ name: 'active-CDP', status: 'fail' }); report.status = 'fail'; }
    }
    for (const app of apps.reverse()) {
      try { await app.close(); report.cleanup.push({ name: `${app.name}:natural-close`, status: 'pass', lifecycle: app.lifecycle }); }
      catch { report.cleanup.push({ name: `${app.name}:natural-close`, status: 'fail', lifecycle: app.lifecycle }); report.status = 'fail'; }
    }
    if (reverse) {
      try { const removed = removeOwnedReverse(reverse); assert(removed); report.cleanup.push({ name: 'owned-reverse', status: 'pass', owned: reverse }); }
      catch { report.cleanup.push({ name: 'owned-reverse', status: 'fail' }); report.status = 'fail'; }
    }
    if (retained) {
      try { const removed = await removeOwnedForward(retained); assert(removed); report.cleanup.push({ name: 'retained-preparation-CDP', status: 'pass', owned: retained }); }
      catch { report.cleanup.push({ name: 'retained-preparation-CDP', status: 'fail' }); report.status = 'fail'; }
    }
    report.finishedAt = new Date().toISOString(); await saveReport();
  }
  console.log(JSON.stringify({ status: report.status, cases: report.cases.map(({ id, status }) => ({ id, status })), output }));
  if (report.status !== 'pass') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('Usage: sync108-three-peers.mjs --binary ABS_BINARY --root FROZEN_SOURCE_ROOT --output FRESH_ABS_DIR --build-record ABS_JSON [--retained-forward ABS_OWNED_JSON] [--continue-from OWNED_PRIOR_OUTPUT]\nContinuation preserves original paired stores, identities and endpoints. Never pass invitations in argv.');
  else run().catch(() => { console.error('THREE_PEER_PRECONDITION_FAILED'); process.exitCode = 1; });
}
