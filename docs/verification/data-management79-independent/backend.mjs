import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, stat, lstat, symlink, unlink, utimes, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [rootArg, binaryArg, outputArg] = process.argv.slice(2);
assert(rootArg && binaryArg && outputArg);
const root = resolve(rootArg), binary = resolve(binaryArg), output = resolve(outputArg);
await mkdir(output);
const { rustBackend } = await import(pathToFileURL(join(root, 'scripts/debug/rust-backend.mjs')));
const began = performance.now(), checks = [], processes = [], details = {};
const hash = b => createHash('sha256').update(b).digest('hex');
let active, authority;
const check = (name, action) => { action(); checks.push({ name, pass: true }); };
async function open(name) { active = await rustBackend(binary, join(output, name)); processes.push(active); await value('load_workspace'); }
async function row(command, args = {}) { return active.call(command, args); }
async function value(command, args = {}) {
  const result = await row(command, args);
  assert(result.ok, command + ': ' + JSON.stringify(result.error));
  if (result.value?.access) authority = result.value.access;
  return result.value;
}
const expected = id => ({ sessionId: authority.sessionId, epoch: authority.epoch, ...(id ? { noteEpoch: authority.notes[id]?.epoch } : {}) });
async function denied(name, command, args) { const result = await row(command, args); check(name, () => { assert.equal(result.ok, false); assert(result.error?.code); }); return result.error; }
async function disk(base, relative = '') {
  const rows = [];
  for (const name of (await readdir(join(base, relative))).sort()) {
    const key = relative ? relative + '/' + name : name, meta = await lstat(join(base, key));
    rows.push({ relativePath: key, size: meta.isFile() ? meta.size : null, modifiedAt: Math.floor(meta.mtimeMs), status: meta.isSymbolicLink() ? 'symlink' : meta.isDirectory() ? 'directory' : meta.isFile() ? 'file' : 'other' });
    if (meta.isDirectory()) rows.push(...await disk(base, key));
  }
  return rows;
}
async function finish(id, timeout = false) {
  const result = await value('debug_independent_finish_event', { operationId: id, timeout });
  if (result.event?.access) authority = result.event.access;
  return result;
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+FsAAAAASUVORK5CYII=', 'base64');
const audio = Buffer.alloc(44 + 2400);
audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
for (let i = 44; i < audio.length; i += 2) audio.writeInt16LE(Math.round(Math.sin(i / 13) * 6000), i);
const media = [
  { name: '独审原图 图.png', mime: 'image/png', bytes: png },
  { name: '独审累计录音.wav', mime: 'audio/wav', bytes: audio, recordedAt: 1793912345678 },
  { name: '独审附件.bin', mime: 'application/octet-stream', bytes: Buffer.from(Array.from({ length: 1027 }, (_, i) => (i * 73) % 256)) },
];
const source = join(output, 'source'), archive = join(output, 'complete.notesbackup');
try {
  await open('source');
  const created = await value('workspace_action', { action: { type: 'createNote' }, expected: expected() });
  const noteId = created.id;
  for (const item of media) item.attachment = (await value('store_attachment_operation', { operationId: randomUUID(), noteId, name: item.name, mime: item.mime, recordedAt: item.recordedAt ?? null, data: item.bytes.toString('base64'), expected: expected(noteId) })).attachment;
  const document = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'INDEPENDENT 79 SYNTHETIC' }] }, ...media.map(m => ({ type: 'attachment', attrs: { id: m.attachment.id, kind: m.attachment.kind, name: m.name } }))] };
  const intent = randomUUID();
  await value('register_save_intent', { noteId, intent, expected: expected(noteId) });
  await value('workspace_action', { action: { type: 'saveNote', id: noteId, revision: 0, saveIntent: intent, document } });
  const ws = await value('load_workspace');
  const beforeToken = expected();
  await mkdir(join(source, '空目录'));
  await mkdir(join(source, 'nested-other'));
  await writeFile(join(source, 'nested-other/long 路径.txt'), 'UNTRACKED-ORACLE');
  await writeFile(join(source, 'attachments/orphan-retained.blob'), 'MUST-RETAIN-OLD-RECORDING-OR-JOURNAL');
  const old = new Date('2020-02-03T04:05:06.000Z');
  for (const m of media) await utimes(join(source, 'attachments', m.attachment.relativePath), old, old);
  await mkdir(join(output, 'outside'));
  await writeFile(join(output, 'outside/never-traverse.txt'), 'OUTSIDE-SENTINEL');
  await symlink(join(output, 'outside'), join(source, 'external-link'));
  const snapshot = await value('get_data_management', { expected: expected() });
  const oracle = await disk(source);
  details.initial = snapshot;
  check('tagged real snapshot preserves no title/document payload', () => { assert.equal(snapshot.version, 1); assert.equal(snapshot.rootPath, source); assert(snapshot.access.sessionId); assert(snapshot.metadata.sessionId); assert(!JSON.stringify(snapshot.files).includes('INDEPENDENT 79 SYNTHETIC')); });
  check('all actual paths including empty directory and unowned files retained', () => { assert.equal(new Set(snapshot.files.map(f => f.relativePath)).size, snapshot.files.length); for (const entry of oracle) assert(snapshot.files.some(f => f.relativePath === entry.relativePath), entry.relativePath); });
  check('symlink is reported without outside traversal or bytes', () => { const entry = snapshot.files.find(f => f.relativePath === 'external-link'); assert.equal(entry.status, 'symlink'); assert.equal(entry.size, null); assert(!snapshot.files.some(f => f.relativePath.includes('never-traverse'))); });
  check('independent filesystem stat and historical mtime equal every ordinary file', () => { for (const entry of oracle.filter(f => f.status === 'file' && !f.relativePath.startsWith('notes.sqlite3'))) { const actual = snapshot.files.find(f => f.relativePath === entry.relativePath); assert.equal(actual.size, entry.size); assert.equal(actual.modifiedAt, entry.modifiedAt); } for (const m of media) assert.equal(snapshot.files.find(f => f.attachment?.id === m.attachment.id).modifiedAt, old.getTime()); });
  check('physical totals equal separate filesystem oracle without directory duplication', () => { const files = oracle.filter(f => f.status === 'file'); assert.equal(snapshot.counts.physicalFiles, files.length); assert.equal(snapshot.totals.totalBytes, files.reduce((n, f) => n + f.size, 0)); assert.equal(snapshot.totals.attachmentBytes, files.filter(f => f.relativePath.startsWith('attachments/')).reduce((n, f) => n + f.size, 0)); assert.equal(snapshot.totals.declaredAttachmentBytes, media.reduce((n, m) => n + m.bytes.length, 0)); });
  for (const m of media) {
    check('actual original file outside SQLite: ' + m.mime, () => { const row = snapshot.files.find(f => f.attachment?.id === m.attachment.id); assert.equal(row.attachment.referenced, true); assert.equal(row.attachment.exportable, true); assert.equal(row.attachment.displayName, m.name); });
    assert.deepEqual(await readFile(join(source, 'attachments', m.attachment.relativePath)), m.bytes);
    const destination = join(output, 'export-' + m.name);
    const info = await value('export_attachment', { id: m.attachment.id, path: destination, expected: expected(noteId) });
    const bytes = await readFile(destination);
    check('ID export preserves complete bytes and receipt: ' + m.mime, () => { assert.deepEqual(bytes, m.bytes); assert.deepEqual(info, { name: m.name, bytes: m.bytes.length, mime: m.mime }); });
  }
  const db = JSON.parse(execFileSync('python3', ['-c', 'import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1]);print(json.dumps({"schema":list(c.execute("pragma table_info(attachments)")),"rows":list(c.execute("select typeof(body),body from attachments"))}))', join(source, 'notes.sqlite3')], { encoding: 'utf8' }));
  check('independent SQLite inspection has metadata TEXT and no original media Base64', () => { assert(db.schema.every(r => !r[2].toLowerCase().includes('blob'))); assert.equal(db.rows.length, media.length); for (const [type, body] of db.rows) { assert.equal(type, 'text'); for (const m of media) assert(!body.includes(m.bytes.toString('base64'))); } });
  const original = media[0], originalPath = join(source, 'attachments', original.attachment.relativePath), preserved = join(output, 'preserve-target.png');
  await writeFile(preserved, 'TARGET-RETAINS-ORIGINAL');
  for (const path of [join(source, 'notes.sqlite3'), join(source, 'notes.sqlite3-wal'), join(source, 'notes.sqlite3-shm'), join(source, 'nested-other/protected'), join(source, 'attachments/protected')]) await denied('managed target protection: ' + path.split('/').slice(-2).join('/'), 'export_attachment', { id: original.attachment.id, path, expected: expected(noteId) });
  await symlink(source, join(output, 'alias'));
  await denied('canonical alias cannot reenter private root', 'export_attachment', { id: original.attachment.id, path: join(output, 'alias/notes.sqlite3'), expected: expected(noteId) });
  await symlink(preserved, join(output, 'destination-symlink'));
  await denied('symlink destination cannot replace existing file', 'export_attachment', { id: original.attachment.id, path: join(output, 'destination-symlink'), expected: expected(noteId) });
  await writeFile(originalPath, Buffer.concat([png, Buffer.from('size-mismatch')]));
  let broken = await value('get_data_management', { expected: expected() });
  check('metadata size mismatch is visible, actual, warned and nonexportable', () => { const f = broken.files.find(f => f.attachment?.id === original.attachment.id); assert.equal(f.size, png.length + 13); assert.equal(f.attachment.exportable, false); assert(broken.warnings.some(w => w.includes('大小不符'))); });
  await denied('mismatch export fails without touching existing output', 'export_attachment', { id: original.attachment.id, path: preserved, expected: expected(noteId) });
  await unlink(originalPath);
  broken = await value('get_data_management', { expected: expected() });
  check('missing metadata attachment retained with null size and exact missing count', () => { const f = broken.files.find(f => f.attachment?.id === original.attachment.id); assert.equal(f.status, 'missing'); assert.equal(f.exists, false); assert.equal(f.size, null); assert.equal(broken.counts.missingAttachments, 1); });
  await denied('missing original export fails', 'export_attachment', { id: original.attachment.id, path: preserved, expected: expected(noteId) });
  await symlink(preserved, originalPath);
  await denied('managed source symlink cannot export outside bytes', 'export_attachment', { id: original.attachment.id, path: join(output, 'bad-source-export'), expected: expected(noteId) });
  await unlink(originalPath); await writeFile(originalPath, png); await utimes(originalPath, old, old);
  check('all failed exports retained preexisting target', () => {}); assert.equal(await readFile(preserved, 'utf8'), 'TARGET-RETAINS-ORIGINAL');
  await chmod(originalPath, 0);
  try { broken = await value('get_data_management', { expected: expected() }); check('real OS unreadable original is reported and nonexportable', () => { const f = broken.files.find(f => f.attachment?.id === original.attachment.id); assert.equal(f.status, 'unreadable'); assert.equal(f.attachment.exportable, false); }); await denied('unreadable original cannot export', 'export_attachment', { id: original.attachment.id, path: preserved, expected: expected(noteId) }); }
  finally { await chmod(originalPath, 0o600); }
  await value('export_archive', { path: archive, expected: expected() });
  const archived = JSON.parse(await readFile(archive));
  check('archive contains all registered original media and correct recordedAt version', () => { assert.equal(archived.version, 2); assert.equal(archived.attachments.length, media.length); for (const m of media) assert.deepEqual(Buffer.from(archived.blobs[m.attachment.id], 'base64'), m.bytes); });
  const prepare = await value('debug_access_begin', { action: { type: 'importArchive', path: archive }, expected: expected() });
  await denied('pending access blocks inventory', 'get_data_management', { expected: beforeToken });
  await denied('pending access blocks single attachment export', 'export_attachment', { id: original.attachment.id, path: preserved, expected: expected(noteId) });
  const abort = await finish(prepare.operationId, true);
  check('real Session timeout abort has no imported copy', () => { assert.equal(abort.event.phase, 'abort'); assert.equal(abort.reply.ok, false); });
  assert.equal((await value('load_workspace')).notes.length, 1);
  const sourcePid = active.pid; await active.close();
  await open('source');
  check('new PID and new session after clean close', () => { assert.notEqual(active.pid, sourcePid); assert.notEqual(authority.sessionId, beforeToken.sessionId); });
  await denied('old process token cannot read new process inventory', 'get_data_management', { expected: beforeToken });
  const recovered = await value('load_workspace');
  check('new PID retains confirmed original document and all metadata', () => { assert.deepEqual(recovered.notes[0].document, document); assert.equal(recovered.attachments.length, media.length); });
  for (const m of media) { const payload = await value('read_attachment', { id: m.attachment.id, expected: expected(noteId) }); check('new PID original payload: ' + m.mime, () => assert.deepEqual(Buffer.from(payload.data, 'base64'), m.bytes)); }
  check('unowned recovery-like file was never cleaned by inventory/restart', () => {}); assert.equal(await readFile(join(source, 'attachments/orphan-retained.blob'), 'utf8'), 'MUST-RETAIN-OLD-RECORDING-OR-JOURNAL');
  await active.close(); await open('restored');
  await value('import_archive', { path: archive, expected: expected() });
  let restored = await value('load_workspace');
  for (const m of media) { const found = restored.attachments.find(a => a.displayName === m.name); const payload = await value('read_attachment', { id: found.id, expected: expected(found.noteId) }); check('fresh Session archive roundtrip exact bytes: ' + m.mime, () => assert.deepEqual(Buffer.from(payload.data, 'base64'), m.bytes)); }
  await value('import_archive', { path: archive, expected: expected() });
  restored = await value('load_workspace');
  check('second import merges copies without overwriting first records', () => { assert.equal(restored.notes.length, 2); assert.equal(restored.attachments.length, media.length * 2); assert.equal(new Set(restored.attachments.map(a => a.relativePath)).size, media.length * 2); });
  const restoredPid = active.pid; await active.close(); await open('restored');
  const reopened = await value('load_workspace');
  check('second new PID retains both imported copies', () => { assert.notEqual(active.pid, restoredPid); assert.equal(reopened.notes.length, 2); assert.equal(reopened.attachments.length, media.length * 2); });
  for (const a of reopened.attachments) { const m = media.find(m => m.name === a.displayName); const data = await value('read_attachment', { id: a.id, expected: expected(a.noteId) }); assert.deepEqual(Buffer.from(data.data, 'base64'), m.bytes); }
  details.final = await value('get_data_management', { expected: expected() });
} catch (error) {
  details.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  for (const backend of processes) { try { await backend.close(); } catch (error) { details.cleanupFailure = String(error); process.exitCode = 1; } }
  const result = { status: process.exitCode ? 'FAIL' : 'PASS', binary, binarySha256: hash(await readFile(binary)), checks, processes: processes.map(p => p.lifecycle), completeWallMs: performance.now() - began, details, limits: ['Real Rust Session/Store in fresh synthetic directories, no native GUI/provider/microphone or user data access.', 'Direct import_archive cases use the transport single synthetic participant; production App ACK is tested separately through the independent barrier adapter.'] };
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, checks: checks.length, processes: result.processes, completeWallMs: result.completeWallMs, failure: details.failure }));
}
