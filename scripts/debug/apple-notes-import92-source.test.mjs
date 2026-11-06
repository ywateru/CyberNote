import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src-tauri/src/apple_notes_source.js'), 'utf8');

function fixture(options = {}) {
  const calls = [];
  let changed = false;
  function appleError(code) { return Object.assign(new Error('SYNTHETIC_SECRET_ERROR'), { errorNumber: code }); }
  const account = { id: () => 'account-1', name: () => 'Synthetic account' };
  const child = { id: () => 'folder-2', name: () => 'Nested', container: () => ({ id: () => options.parentId || 'folder-1' }), folders: () => [] };
  const folder = { id: () => 'folder-1', name: () => 'Synthetic folder', container: () => account, folders: () => [child] };
  const attachments = (options.attachments || []).map((a, index) => ({
    id: () => a.id || `attachment-${index}`,
    name: () => a.name === undefined ? null : a.name,
    contentIdentifier: () => a.cid === undefined ? null : a.cid,
    syntheticAttachment: true,
  }));
  const note = {
    id: () => options.wrongId || (changed && options.change === 'id') ? 'other-note' : 'note-1',
    name: () => changed && options.change === 'title' ? 'Changed' : 'Synthetic note',
    container: () => ({ id: () => changed && options.change === 'folder' ? 'folder-1' : options.noteFolder || 'folder-2' }),
    passwordProtected: () => { calls.push('locked'); return !!options.locked; },
    body: () => { calls.push('body'); if (options.bodyError) throw appleError(options.bodyError); return '<div>Synthetic body</div>'; },
    plaintext: () => { calls.push('plaintext'); return 'Synthetic body'; },
    creationDate: () => new Date(100000),
    modificationDate: () => new Date(changed && options.change === 'date' ? 300000 : 200000),
    attachments: () => attachments,
  };
  const notes = () => { calls.push('notes'); return options.notes || [note]; };
  notes.byId = id => { calls.push('lookup'); assert.equal(id, 'note-1'); if (options.lookupError) throw appleError(options.lookupError); return note; };
  const app = {
    accounts: () => { calls.push('accounts'); if (options.accountError) throw appleError(options.accountError); return [account]; },
    folders: () => { calls.push('folders'); return [folder, child]; },
    notes,
    save: (object, parameters) => {
      assert.equal(object.syntheticAttachment, true, 'only attachment may receive save');
      calls.push(['save', parameters.in]);
      if (options.saveError) throw appleError(options.saveError);
      changed = true;
    },
  };
  const context = vm.createContext({
    Application: name => { calls.push('Application'); assert.equal(name, 'Notes'); return app; },
    Path: value => { calls.push(['Path', value]); return value; },
  });
  vm.runInContext(source, context, { timeout: 1000 });
  return {
    calls,
    execute: request => JSON.parse(context.run([typeof request === 'string' ? request : JSON.stringify(request)])),
    rawArgs: args => JSON.parse(context.run(args)),
  };
}
const scan = { version: 1, mode: 'scan', maxNotes: 5000 };
const read = { version: 1, mode: 'read', noteId: 'note-1', exportPaths: ['/private/tmp/host-owned/export-1', '/private/tmp/host-owned/export-2'] };

test('source parses and scan preserves complete nested ancestry without bodies or saves', () => {
  const f = fixture(); const result = f.execute(scan);
  assert.equal(result.status, 'ok'); assert.equal(result.folders.length, 2);
  assert.equal(result.folders[1].parentId, 'folder-1'); assert.equal(result.notes[0].status, 'ok');
  assert.equal(f.calls.includes('body'), false); assert.equal(f.calls.includes('plaintext'), false);
  assert.equal(f.calls.some(x => Array.isArray(x) && x[0] === 'save'), false);
});
test('scan cap reports truncation rather than silently losing notes', () => {
  const note = { id: () => 'n', name: () => '', container: () => ({ id: () => 'folder-1' }), passwordProtected: () => false };
  const f = fixture({ notes: [note, note] }); const result = f.execute({ ...scan, maxNotes: 1 });
  assert.equal(result.notes.length, 1); assert.equal(result.truncated, true);
});
test('identical stable-ID metadata duplicates in real response shape coalesce', () => {
  const note = { id: () => 'n', name: () => 'Synthetic note', container: () => ({ id: () => 'folder-1' }), passwordProtected: () => false };
  const other = { ...note, id: () => 'other' };
  const f = fixture({ notes: [note, note, other, other, other] });
  const result = f.execute(scan);
  assert.equal(result.status, 'ok'); assert.equal(result.notes.length, 2); assert.equal(result.truncated, false);
  assert.deepEqual(result.notes.map(x => x.id), ['n', 'other']);
});
for (const field of ['name', 'container', 'passwordProtected']) test(`same-ID conflicting ${field} refuses entire scan`, () => {
  const note = { id: () => 'n', name: () => 'Synthetic note', container: () => ({ id: () => 'folder-1' }), passwordProtected: () => false };
  const changed = { ...note, [field]: field === 'name' ? () => 'Changed' : field === 'container' ? () => ({ id: () => 'folder-2' }) : () => true };
  const result = fixture({ notes: [note, changed] }).execute(scan);
  assert.equal(result.status, 'unreadable'); assert.equal(result.reason, 'source_changed'); assert.deepEqual(result.notes, []);
});
test('same-ID property error conflicts with a readable row rather than disappearing', () => {
  const note = { id: () => 'n', name: () => 'Synthetic note', container: () => ({ id: () => 'folder-1' }), passwordProtected: () => false };
  const broken = { ...note, passwordProtected: () => { throw Object.assign(new Error('SYNTHETIC_SECRET'), { errorNumber: -1728 }); } };
  const result = fixture({ notes: [note, broken] }).execute(scan);
  assert.equal(result.status, 'unreadable'); assert.equal(result.reason, 'source_changed');
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'), false);
});
test('missing ancestor affects notes without inventing root', () => {
  const f = fixture({ parentId: 'missing-folder' }); const result = f.execute(scan);
  assert.equal(result.notes[0].status, 'unreadable'); assert.equal(result.notes[0].reason, 'hierarchy_unreadable');
});
test('ancestry cycle is unreadable without recursion or activation', () => {
  const f = fixture({ parentId: 'folder-2' }); const result = f.execute(scan);
  assert.equal(result.notes[0].reason, 'hierarchy_unreadable');
});
test('locked read never gets body or exports', () => {
  const f = fixture({ locked: true, attachments: [{}] }); const result = f.execute(read);
  assert.equal(result.status, 'locked'); assert.equal(result.note, null); assert.equal(f.calls.includes('body'), false);
  assert.equal(f.calls.some(x => Array.isArray(x) && x[0] === 'save'), false);
});
test('read keeps required body/dates and nullable CID/name in original attachment order', () => {
  const f = fixture({ attachments: [{}, { name: '../../SYNTHETIC_SECRET.png', cid: 'cid:synthetic-2' }] }); const result = f.execute(read);
  assert.equal(result.status, 'ok'); assert.equal(result.note.stable, true);
  assert.equal(result.note.createdAtMs, 100000); assert.equal(result.note.updatedAtMs, 200000);
  assert.equal(result.note.attachments[0].name, null); assert.equal(result.note.attachments[0].cid, null);
  assert.equal(result.note.attachments[1].name, '../../SYNTHETIC_SECRET.png');
  assert.deepEqual(result.note.attachments.map(a => a.exportIndex), [0, 1]);
  assert.deepEqual(f.calls.filter(x => Array.isArray(x) && x[0] === 'save').map(x => x[1]), read.exportPaths);
});
test('native export -10000 retained as failed item and never retried', () => {
  const f = fixture({ attachments: [{}], saveError: -10000 }); const result = f.execute(read);
  assert.equal(result.note.attachments[0].status, 'export_failed'); assert.equal(result.note.attachments[0].code, -10000);
  assert.equal(f.calls.filter(x => Array.isArray(x) && x[0] === 'save').length, 1);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET_ERROR'), false);
});
test('insufficient paths preserves unsupported items without out-of-bounds save', () => {
  const f = fixture({ attachments: [{}, {}] }); const result = f.execute({ ...read, exportPaths: [read.exportPaths[0]] });
  assert.equal(result.note.attachments.length, 2); assert.equal(result.note.attachments[1].status, 'unsupported_object');
  assert.equal(result.note.attachments[1].reason, 'source_limit');
  assert.equal(f.calls.filter(x => Array.isArray(x) && x[0] === 'save').length, 1);
});
test('over 1000 attachments refuses whole note before any export', () => {
  const f = fixture({ attachments: Array.from({ length: 1001 }, () => ({})) }); const result = f.execute(read);
  assert.equal(result.status, 'unreadable'); assert.equal(result.reason, 'source_limit'); assert.equal(result.note, null);
  assert.equal(f.calls.some(x => Array.isArray(x) && x[0] === 'save'), false);
});
for (const change of ['id', 'title', 'folder', 'date']) test(`source ${change} changed during export is not stable`, () => {
  const f = fixture({ attachments: [{}], change }); const result = f.execute(read);
  assert.equal(result.status, 'changed'); assert.equal(result.note.stable, false); assert.equal(result.reason, 'source_changed');
});
test('wrong source ID cannot be imported', () => {
  const f = fixture({ wrongId: true }); const result = f.execute(read);
  assert.equal(result.status, 'unreadable'); assert.equal(result.note, null); assert.equal(f.calls.includes('body'), false);
});
for (const [code, status, reason] of [[-1743, 'automation_denied', 'automation_denied'], [-1712, 'timeout', 'event_timeout'], [-1728, 'unreadable', 'property_unreadable']]) {
  test(`source failure ${code} produces finite private-safe output`, () => {
    const f = fixture({ lookupError: code }); const result = f.execute(read);
    assert.equal(result.status, status); assert.equal(result.reason, reason); assert.equal(result.code, code);
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET_ERROR'), false);
  });
}
test('failed body is not imported as an empty note', () => {
  const f = fixture({ bodyError: -1728 }); const result = f.execute(read);
  assert.equal(result.status, 'unreadable'); assert.equal(result.note, null);
});
for (const [label, request] of [
  ['extra source code', { ...scan, sourceCode: 'SYNTHETIC_SECRET' }],
  ['zero cap', { ...scan, maxNotes: 0 }], ['large cap', { ...scan, maxNotes: 5001 }],
  ['unknown mode', { ...scan, mode: 'delete' }],
  ['relative path', { ...read, exportPaths: ['attachment.bin'] }],
  ['traversal', { ...read, exportPaths: ['/private/tmp/owned/../source'] }],
  ['duplicate', { ...read, exportPaths: [read.exportPaths[0], read.exportPaths[0]] }],
  ['different parents', { ...read, exportPaths: [read.exportPaths[0], '/private/tmp/another/export-2'] }],
  ['null ID', { ...read, noteId: null }], ['malformed JSON', '{SYNTHETIC_SECRET'],
]) test(`invalid ${label} has no source calls`, () => {
  const f = fixture(); const result = f.execute(request);
  assert.equal(result.status, 'invalid_request'); assert.equal(f.calls.length, 0);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'), false);
});
test('wrong argv count has no source calls', () => {
  const f = fixture(); assert.equal(f.rawArgs([]).status, 'invalid_request'); assert.equal(f.calls.length, 0);
});
