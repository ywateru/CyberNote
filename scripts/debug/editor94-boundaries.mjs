#!/usr/bin/env node
// Independent source-review counterexamples on the actual App Editor.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openRuntime, api, idle, state, saveJSON } from './runtime.mjs';
const out = resolve(process.argv[2] || ''); if (!process.argv[2]) throw Error('FRESH_OUTPUT required'); await mkdir(out);
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const checks = [], observations = []; let runtime, failure;
const p = value => ({ type: 'paragraph', ...(value ? { content: [{ type: 'text', text: value }] } : {}) });
const doc = (...content) => ({ type: 'doc', content });
const tagText = document => JSON.stringify(document).includes('noteTag');
try {
  runtime = await openRuntime({ root: process.cwd(), keep: true, bundleDebug: true, nativeToolbar: true });
  const { page } = runtime, body = () => page.locator('.tiptap:visible');
  const current = async () => (await state(page)).editorJSON;
  const setup = async document => { await api(page, 'note.create'); await idle(page); await api(page, 'editor.setContent', { document }); await body().focus(); await api(page, 'app.flush'); return current(); };
  const check = async (name, action) => { try { await action(); checks.push({ name, status: 'passed' }); } catch (error) { failure ||= error; checks.push({ name, status: 'failed', error: error.stack }); } };
  await check('Real Tab cannot replace a selected drawing atom with literal text', async () => {
    const before = await setup(doc({ type: 'drawing', attrs: { strokes: [] } }, p('tail')));
    await body().evaluate(node => node.editor.commands.setNodeSelection(0));
    const selection = await body().evaluate(node => node.editor.state.selection.toJSON()); assert.equal(selection.type, 'node');
    await page.keyboard.press('Tab'); const after = await current(); observations.push({ kind: 'atom', selection, before, after }); assert.deepEqual(after, before);
  });
  await check('Real Select All followed by Tab cannot replace whole-document nontext selection', async () => {
    const before = await setup(doc({ type: 'drawing', attrs: { strokes: [] } }, p('tail')));
    await page.keyboard.press('Meta+a');
    const selection = await body().evaluate(node => node.editor.state.selection.toJSON()); assert.equal(selection.type, 'all');
    await page.keyboard.press('Tab'); const after = await current(); observations.push({ kind: 'all', selection, before, after }); assert.deepEqual(after, before);
  });
  await check('A later false handler selection transaction does not prevent the same real Enter from committing', async () => {
    await setup(doc(p('#ordered'))); await api(page, 'editor.select', { from: 9, to: 9 });
    await body().evaluate(node => {
      const editor = node.editor, Plugin = editor.state.plugins[0].constructor;
      window.boundary94Calls = [];
      const observer = new Plugin({ props: { handleKeyDown(view, event) {
        if (event.key !== 'Enter') return false;
        window.boundary94Calls.push({ thisBound: this === observer });
        view.dispatch(view.state.tr.setSelection(view.state.selection)); return false;
      } } });
      editor.registerPlugin(observer, (plugin, plugins) => { const i = plugins.findIndex(p => p.key.startsWith('notesCommittedTags')); if (i < 0) throw Error('NoteTag plugin missing'); return [...plugins.slice(0, i + 1), plugin, ...plugins.slice(i + 1)]; });
    });
    await page.keyboard.press('Enter'); await api(page, 'app.flush'); const after = await current();
    const calls = await page.evaluate(() => window.boundary94Calls); observations.push({ kind: 'false-handler', calls, after });
    assert.deepEqual(calls, [{ thisBound: true }]); assert.equal(after.content.length, 2); assert.equal(tagText(after.content[0]), true);
  });
  await check('Cancelable beforeinput insertParagraph commits exactly one tag and one split', async () => {
    await setup(doc(p('#beforeinput'))); await api(page, 'editor.select', { from: 13, to: 13 });
    const prevented = await body().evaluate(node => { const e = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }); node.dispatchEvent(e); return e.defaultPrevented; });
    await api(page, 'app.flush'); const after = await current(); observations.push({ kind: 'beforeinput', prevented, after });
    assert.equal(prevented, true); assert.equal(after.content.length, 2); assert.equal(tagText(after.content[0]), true); assert.equal(tagText(after.content[1]), false);
  });
  await check('Composing or noncancelable beforeinput cannot mutate or commit', async () => {
    for (const options of [{ isComposing: true, cancelable: true }, { isComposing: false, cancelable: false }]) {
      const before = await setup(doc(p('#guard'))); await api(page, 'editor.select', { from: 7, to: 7 });
      const prevented = await body().evaluate((node, options) => { const e = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, ...options }); node.dispatchEvent(e); return e.defaultPrevented; }, options);
      assert.equal(prevented, false); assert.deepEqual(await current(), before);
    }
  });
  assert.deepEqual(runtime.errors, []);
} catch (error) { failure ||= error; }
finally { if (runtime) { try { await runtime.cleanup(); } catch (error) { failure ||= error; } } await saveJSON(resolve(out, 'result.json'), { sourceHead, checks, observations, status: failure ? 'failed' : 'passed', error: failure?.stack, rendererErrors: runtime?.errors }); }
if (failure) throw failure;
