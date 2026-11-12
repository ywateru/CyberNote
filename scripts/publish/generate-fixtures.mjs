// Entirely synthetic archive corpus. No user Store, old evidence or network reads.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function archiveFixtures() {
  const folder = (id, kind, name, sortOrder) => ({ id, kind, name, parentId: null, sortOrder, createdAt: 1700000000000 });
  const text = text => ({ type: 'text', text });
  const heading = { type: 'heading', attrs: { level: 1 }, content: [text('Synthetic archive')] };
  const base = {
    version: 1,
    folders: [folder('default', 'default', 'Notes', 0), folder('quick', 'quick', 'Quick', 1), folder('trash', 'trash', 'Trash', 2)],
    notes: [{ id: 'archive-fixture-note', folderId: 'default', title: 'Synthetic archive', plainText: 'Synthetic archive\nSynthetic body',
      document: { type: 'doc', content: [heading, { type: 'paragraph', content: [text('Synthetic body')] },
        { type: 'attachment', attrs: { id: 'archive-fixture-attachment', kind: 'file', name: 'fixture.txt' } }] },
      createdAt: 1700000000000, updatedAt: 1700000000000, pinned: false, deletedAt: null, originalFolderId: null,
      locked: false, paperStyle: 'plain', revision: 0, sealed: null }],
    attachments: [{ id: 'archive-fixture-attachment', noteId: 'archive-fixture-note', kind: 'file', relativePath: 'fixture.txt',
      mime: 'text/plain', displayName: 'fixture.txt', size: 8 }],
    blobs: { 'archive-fixture-attachment': Buffer.from('fixture\n').toString('base64') },
    settings: { theme: 'light', view: 'list', selectedFolder: 'default' },
  };
  const mutate = content => { const a = structuredClone(base); a.notes[0].document.content = [heading, ...content]; return a; };
  return {
    'legacy-valid.notesbackup': base,
    'inline-at-doc-root.notesbackup': mutate([text('Invalid inline root')]),
    'block-inside-paragraph.notesbackup': mutate([{ type: 'paragraph', content: [{ type: 'heading', attrs: { level: 2 }, content: [text('Invalid block')] }] }]),
    'paragraph-inside-table.notesbackup': mutate([{ type: 'table', content: [{ type: 'paragraph', content: [text('Invalid table child')] }] }]),
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL('../../src-tauri/tests/fixtures/archive/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries(archiveFixtures())) writeFileSync(resolve(dir, name), JSON.stringify(data, null, 2) + '\n');
}
