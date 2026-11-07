#!/usr/bin/env node
// Independent, narrow APP93 DOM checks. Real App/Editor/SaveQueue; only the
// existing isolated backend, file picker and media/OS boundaries are synthetic.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openRuntime, api, idle, state, snapshot, saveJSON } from './runtime.mjs';
import { chooseFiles, tinyPNG, refs } from './mobile-attachments.mjs';

const root = process.cwd(), output = resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Usage: node scripts/debug/attachments93-independent.mjs FRESH_OUTPUT');
await mkdir(output);
const began = performance.now(), rows = [];
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceHead = head();
let runtime, failure;
const until = async (label, predicate, timeout = 10000) => {
  const end = performance.now() + timeout;
  while (performance.now() < end) { if (await predicate()) return; await new Promise(done => setTimeout(done, 30)); }
  throw Error(label + ' timeout');
};
try {
  runtime = await openRuntime({ root, keep: true, bundleDebug: true, nativeToolbar: true });
  const { page, backend } = runtime;
  const menu = page.getByRole('menu', { name: '附件菜单', exact: true });
  const check = async (name, action) => {
    try { await action(); rows.push({ name, status: 'passed' }); }
    catch (error) {
      failure ||= error; rows.push({ name, status: 'failed', error: error.stack || error.message });
      await saveJSON(resolve(output, `${rows.length}-failure.json`), await snapshot(page, { selector: 'body', maxChars: 25000, maxNodes: 180 }));
      await page.screenshot({ path: resolve(output, `${rows.length}-failure.png`) });
      await page.keyboard.press('Escape');
    }
  };
  await api(page, 'note.select', { id: 'note-a' });
  const wav = Buffer.alloc(16044); wav.write('RIFF'); wav.writeUInt32LE(16036, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  await chooseFiles(page, [
    { name: 'independent93.png', mimeType: 'image/png', buffer: tinyPNG },
    { name: 'independent93.wav', mimeType: 'audio/wav', buffer: wav },
    { name: 'independent93.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic video boundary') },
    { name: 'independent93.txt', mimeType: 'text/plain', buffer: Buffer.from('independent original bytes93') },
  ]);
  await idle(page);
  const attachments = structuredClone(backend.workspace.attachments);
  const file = attachments.find(a => a.kind === 'file');
  const card = id => page.locator(`.attachment-node[data-attachment-id="${id}"]:visible`);
  const open = async (id, point) => {
    const element = card(id); await element.scrollIntoViewIfNeeded();
    if (point) await element.dispatchEvent('contextmenu', { clientX: point.x, clientY: point.y, bubbles: true, cancelable: true });
    else await element.click({ button: 'right', position: { x: 12, y: 12 } });
    await menu.waitFor();
  };
  const document = { type: 'doc', content: [{ type: 'attachment', attrs: { id: file.id, kind: file.kind, name: file.displayName } }] };
  await check('All four persisted media kinds open the real menu without changing document', async () => {
    const before = JSON.stringify((await state(page)).editorJSON);
    for (const attachment of attachments) {
      await open(attachment.id);
      assert(await menu.getByRole('menuitem', { name: '保存附件…', exact: true }).isEnabled());
      assert(await menu.getByRole('menuitem', { name: '从备忘录中移除', exact: true }).isEnabled());
      if (attachment.kind === 'file') assert.equal(await menu.getByRole('menuitem', { name: /预览|打开|播放/ }).count(), 0);
      await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
    }
    assert.equal(JSON.stringify((await state(page)).editorJSON), before);
  });
  await api(page, 'editor.setContent', { document }); await api(page, 'app.flush'); await idle(page);
  await check('Last attachment removal persists and Undo/Redo keeps original bytes', async () => {
    const original = backend.files.get(file.id);
    await open(file.id); await menu.getByRole('menuitem', { name: '从备忘录中移除', exact: true }).click(); await api(page, 'app.flush'); await idle(page);
    assert.equal(refs((await state(page)).editorJSON).length, 0);
    assert.equal(refs(backend.workspace.notes.find(n => n.id === 'note-a').document).length, 0);
    assert.equal(backend.files.get(file.id), original);
    await api(page, 'editor.undo'); await api(page, 'app.flush'); await idle(page);
    assert.deepEqual(refs((await state(page)).editorJSON), [file.id]);
    await api(page, 'editor.redo'); await api(page, 'app.flush'); await idle(page);
    assert.equal(refs((await state(page)).editorJSON).length, 0);
    await api(page, 'editor.undo'); await api(page, 'app.flush'); await idle(page);
  });
  await check('Menu keys navigate, Enter shows information, Escape restores attachment focus', async () => {
    await card(file.id).focus(); await page.keyboard.press('Shift+F10'); await menu.waitFor();
    await page.keyboard.press('End');
    assert.match(await page.evaluate(() => document.activeElement.textContent), /从备忘录中移除/);
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: '附件信息', exact: true }).waitFor();
    assert.match(await page.getByRole('dialog', { name: '附件信息', exact: true }).innerText(), /independent93.txt/);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: '附件信息', exact: true }).count(), 0);
    assert.equal(await card(file.id).evaluate(element => element === document.activeElement), true);
  });
  await check('Right-click coordinates clamp at all viewport corners', async () => {
    const viewport = page.viewportSize();
    for (const point of [{ x: 1, y: 1 }, { x: viewport.width - 1, y: 1 }, { x: 1, y: viewport.height - 1 }, { x: viewport.width - 1, y: viewport.height - 1 }]) {
      await open(file.id, point); const bounds = await menu.boundingBox();
      assert(bounds.x >= 8 && bounds.y >= 8 && bounds.x + bounds.width <= viewport.width - 7 && bounds.y + bounds.height <= viewport.height - 7, JSON.stringify(bounds));
      await page.keyboard.press('Escape');
    }
  });
  await check('Switching owner closes menu and old information', async () => {
    await open(file.id); await api(page, 'note.select', { id: 'note-b' }); await idle(page);
    assert.equal(await menu.count(), 0);
    await api(page, 'note.select', { id: 'note-a' }); await idle(page);
    await open(file.id); await menu.getByRole('menuitem', { name: '显示信息', exact: true }).click();
    await page.getByRole('dialog', { name: '附件信息', exact: true }).waitFor();
    await api(page, 'note.select', { id: 'note-b' }); await idle(page);
    assert.equal(await page.getByRole('dialog', { name: '附件信息', exact: true }).count(), 0);
    await api(page, 'note.select', { id: 'note-a' }); await idle(page);
  });
  await check('Delayed save picker cannot export after owner navigation', async () => {
    const before = backend.exports.length;
    await page.evaluate(() => { window.__DEBUG_PLATFORM__.dialogDelay = 600; window.__DEBUG_PLATFORM__.dialogResults.save.push('/synthetic-fixture/independent93-stale.txt'); });
    await open(file.id); await menu.getByRole('menuitem', { name: '保存附件…', exact: true }).click();
    await until('save picker entered', () => page.evaluate(() => window.__DEBUG_PLATFORM__.calls.some(row => row.command === 'plugin:dialog|save')));
    await api(page, 'note.select', { id: 'note-b' });
    await idle(page); assert.equal(backend.exports.length, before);
  });
  await writeFile(resolve(output, 'final.html'), await page.content());
  await page.screenshot({ path: resolve(output, 'final.png') });
} catch (error) { failure ||= error; }
finally {
  if (runtime) { try { await runtime.cleanup(); } catch (error) { failure ||= error; } }
  await saveJSON(resolve(output, 'result.json'), { sourceHead, finalHead: head(), checks: rows, status: failure ? 'failed' : 'passed', error: failure?.stack, metadata: runtime?.metadata, wallMs: Math.round(performance.now() - began) });
}
if (failure) throw failure;
