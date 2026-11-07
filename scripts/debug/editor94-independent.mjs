#!/usr/bin/env node
// Independent APP94 checks: real App/Tiptap keyboard events and normal save port.
// Only the existing isolated backend/OS fixture is synthetic; no production hook.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openRuntime, api, idle, state, saveJSON } from './runtime.mjs';
const output = resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Usage: node scripts/debug/editor94-independent.mjs FRESH_OUTPUT');
await mkdir(output);
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceHead = head(), began = performance.now(), checks = [], observations = [];
let runtime, failure;
const text = value => ({ type: 'text', text: value });
const p = value => ({ type: 'paragraph', ...(value ? { content: [text(value)] } : {}) });
const doc = (...content) => ({ type: 'doc', content });
const tags = document => {
  const rows = []; const walk = node => { if (node.marks?.some(m => m.type === 'noteTag')) rows.push(node); node.content?.forEach(walk); }; walk(document); return rows;
};
try {
  runtime = await openRuntime({ root: process.cwd(), keep: true, bundleDebug: true, nativeToolbar: true });
  const { page, backend } = runtime;
  const body = () => page.locator('.tiptap:visible');
  const current = async () => (await state(page)).editorJSON;
  const focus = async () => body().focus();
  const focused = async () => body().evaluate(node => document.activeElement === node);
  let owner;
  const setup = async (document, from, to = from) => {
    await api(page, 'note.create'); await idle(page); owner = (await state(page)).selection.noteId;
    await api(page, 'editor.setContent', { document });
    await api(page, 'editor.select', { from, to }); await focus(); await api(page, 'app.flush'); await idle(page);
    return await current();
  };
  const persisted = async () => {
    await api(page, 'app.flush'); await idle(page);
    const actual = await current(); assert.deepEqual(backend.workspace.notes.find(n => n.id === owner).document, actual);
    return actual;
  };
  const check = async (name, action) => {
    try { await action(); checks.push({ name, status: 'passed' }); }
    catch (error) {
      failure ||= error; checks.push({ name, status: 'failed', error: error.stack });
      await saveJSON(resolve(output, `${checks.length}-failure.json`), { state: await state(page), editor: await body().evaluate(node => ({ html: node.outerHTML, composing: node.editor.view.composing, selection: node.editor.state.selection.toJSON(), editable: node.editor.isEditable })) });
    }
  };
  await page.evaluate(() => { window.independent94Events = []; document.addEventListener('keydown', e => window.independent94Events.push({ key: e.key, code: e.code, isComposing: e.isComposing, keyCode: e.keyCode, trusted: e.isTrusted, target: e.target.getAttribute?.('aria-label') }), true); });
  for (const name of ['English_tag-94', '中文标签']) await check(`Real Enter commits ${name}, keeps newline/save and does not carry tag to next paragraph`, async () => {
    const before = await setup(doc(p(`#${name}`)), name.length + 2);
    // Isolate the user's Enter from fixture initialization in normal PM history.
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
    const after = await persisted();
    assert.equal(after.content.length, 2); assert.equal(after.content[0].content[0].text, `#${name}`);
    assert.deepEqual(tags(after).map(n => n.marks.find(m => m.type === 'noteTag').attrs.name), [name]);
    assert.equal(tags(after.content[1]).length, 0); assert.equal(await focused(), true);
    await page.keyboard.press('Meta+z'); assert.deepEqual(await persisted(), before);
    await page.keyboard.press('Meta+Shift+z'); assert.deepEqual(await persisted(), after);
    await page.keyboard.type('next'); assert.equal(tags((await persisted()).content[1]).length, 0);
    observations.push({ name, before, after });
  });
  await check('Space still commits the same legal tag through real input', async () => {
    await setup(doc(p('#spaceTag')), 10); await page.keyboard.type(' ');
    const after = await persisted(); assert.equal(tags(after)[0].text, '#spaceTag'); assert.equal(after.content[0].content.at(-1).text, ' ');
  });
  await check('Illegal/embedded/overlong names stay unmarked after real Enter', async () => {
    for (const value of ['#123', '#bad!', 'word#tag', '#' + 'a'.repeat(65), '##tag']) {
      await setup(doc(p(value)), value.length + 1); await page.keyboard.press('Enter');
      const after = await persisted(); assert.equal(tags(after).length, 0, value); assert.equal(after.content.length, 2);
    }
  });
  await check('Code block, inline code and link stay unmarked; Enter retains their existing behavior', async () => {
    const fixtures = [doc({ type: 'codeBlock', content: [text('#code')] }), doc({ type: 'paragraph', content: [{ ...text('#code'), marks: [{ type: 'code' }] }] }), doc({ type: 'paragraph', content: [{ ...text('#link'), marks: [{ type: 'link', attrs: { href: 'https://example.invalid' } }] }] })];
    for (const fixture of fixtures) { await setup(fixture, 6); await page.keyboard.press('Enter'); assert.equal(tags(await persisted()).length, 0); }
  });
  await check('Noncollapsed selection is replaced by real Enter without committing a tag', async () => {
    await setup(doc(p('#select')), 2, 8); await page.keyboard.press('Enter');
    const after = await persisted(); assert.equal(tags(after).length, 0); assert.equal(after.content[0].content[0].text, '#'); assert.equal(after.content.length, 2);
  });
  await check('Chromium actual IME Enter/Tab cannot prematurely mark or insert tab', async () => {
    await setup(doc(p('')), 1); const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.imeSetComposition', { text: '#组字', selectionStart: 3, selectionEnd: 3 });
      assert.equal(await body().evaluate(node => node.editor.view.composing), true);
      const before = await current();
      await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
      assert.equal(tags(await current()).length, 0); assert.equal(JSON.stringify(await current()).includes('\\t'), false);
      observations.push({ ime: { before, afterKeys: await current(), composing: await body().evaluate(node => node.editor.view.composing) } });
      await focus(); await cdp.send('Input.insertText', { text: '#组字' }); await idle(page);
      assert.equal(await body().evaluate(node => node.editor.view.composing), false);
      const settled = await persisted(); assert.equal(settled.content[0].content[0].text, '#组字'); assert.equal(tags(settled).length, 0);
    } finally { await cdp.detach(); }
  });
  for (const kind of ['paragraph', 'heading']) await check(`Real ${kind} Tab inserts literal tab and retains focus/save/Undo`, async () => {
    const block = { type: kind, ...(kind === 'heading' ? { attrs: { level: 2 } } : {}), content: [text('ab')] };
    const before = await setup(doc(block), 2); await page.waitForTimeout(600);
    await page.keyboard.press('Tab'); const after = await persisted();
    assert.equal(after.content[0].content[0].text, 'a\tb'); assert.equal(await focused(), true);
    await page.keyboard.press('Meta+z'); assert.deepEqual(await persisted(), before);
    await page.keyboard.press('Meta+Shift+z'); assert.deepEqual(await persisted(), after);
  });
  await check('Real Tab replaces a text selection with one literal tab', async () => {
    await setup(doc(p('abcdef')), 3, 5); await page.keyboard.press('Tab');
    assert.equal((await persisted()).content[0].content[0].text, 'ab\tef'); assert.equal(await focused(), true);
  });
  await check('List Tab/Shift+Tab keeps indentation priority over literal insertion', async () => {
    const fixture = doc({ type: 'bulletList', content: [{ type: 'listItem', content: [p('one')] }, { type: 'listItem', content: [p('two')] }] }, p(''));
    const before = await setup(fixture, 10); await page.keyboard.press('Tab'); const nested = await persisted();
    assert.equal(nested.content[0].content.length, 1); assert.equal(nested.content[0].content[0].content[1].type, 'bulletList'); assert.equal(JSON.stringify(nested).includes('\\t'), false);
    await page.keyboard.press('Shift+Tab'); assert.deepEqual(await persisted(), before);
  });
  await check('Table Tab/Shift+Tab navigates cells and last-cell Tab keeps row creation', async () => {
    const cell = value => ({ type: 'tableCell', content: [p(value)] });
    const before = await setup(doc({ type: 'table', content: [{ type: 'tableRow', content: [cell('a'), cell('b')] }] }, p('')), 4);
    await page.keyboard.press('Tab'); assert.deepEqual(await persisted(), before);
    assert.equal(await body().evaluate(node => node.editor.state.selection.$from.parent.textContent), 'b');
    await page.keyboard.press('Shift+Tab'); assert.equal(await body().evaluate(node => node.editor.state.selection.$from.parent.textContent), 'a');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); const after = await persisted(); assert.equal(after.content[0].content.length, 2); assert.equal(JSON.stringify(after).includes('\\t'), false);
  });
  await check('Shift/Control/Meta/Alt Tab do not write ordinary text', async () => {
    for (const key of ['Shift+Tab', 'Control+Tab', 'Meta+Tab', 'Alt+Tab']) {
      const before = await setup(doc(p('guard')), 3); await page.keyboard.press(key); assert.deepEqual(await persisted(), before, key);
    }
  });
  await check('Noneditable actual Editor rejects Enter and Tab mutations', async () => {
    const before = await setup(doc(p('#readonly')), 10);
    await body().evaluate(node => node.editor.setEditable(false)); await focus();
    await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); assert.deepEqual(await current(), before);
    await body().evaluate(node => node.editor.setEditable(true)); await persisted();
  });
  await check('Tab outside the body retains native focus navigation and document bytes', async () => {
    const before = await setup(doc(p('outside')), 2);
    await api(page, 'search.find', { query: '' });
    const input = page.getByPlaceholder('在备忘录中查找'); await input.focus(); await page.keyboard.press('Tab');
    assert.equal(await input.evaluate(node => node === document.activeElement), false); assert.equal(await focused(), false); assert.deepEqual(await current(), before);
  });
  await saveJSON(resolve(output, 'keyboard-events.json'), await page.evaluate(() => window.independent94Events));
  await saveJSON(resolve(output, 'observations.json'), observations);
  await writeFile(resolve(output, 'final.html'), await page.content());
  assert.deepEqual(runtime.errors, []);
} catch (error) { failure ||= error; }
finally {
  if (runtime) { try { await runtime.cleanup(); } catch (error) { failure ||= error; } }
  await saveJSON(resolve(output, 'result.json'), { sourceHead, finalHead: head(), checks, status: failure ? 'failed' : 'passed', error: failure?.stack, metadata: runtime?.metadata, rendererErrors: runtime?.errors, wallMs: Math.round(performance.now() - began) });
}
if (failure) throw failure;
