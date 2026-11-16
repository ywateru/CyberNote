import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state, saveJSON } from './debug/runtime.mjs';
import { installBrowserPlatform } from './debug/platform.mjs';

const output = resolve('artifacts/mobile-editor-interactions');
await mkdir(output, { recursive: true });
const runtime = await openRuntime({ mobile: true });
const { page } = runtime;
const checks = [];
const check = (name, result) => { assert.ok(result, name); checks.push(name); };
// Bounded, deterministic PCM with changing amplitude exercises real waveform decode.
const rate = 8000, seconds = 4;
const wav = Buffer.alloc(44 + rate * seconds * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < rate * seconds; i++) wav.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 880) * (2000 + 10000 * (i % 4000) / 4000)), 44 + i * 2);
const panel = page.getByRole('dialog', { name: '格式', exact: true });
const select = async text => {
  await page.locator('.tiptap').evaluate((element, text) => {
    element.focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const at = node.textContent.indexOf(text);
      if (at < 0) continue;
      const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + text.length);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange')); return;
    }
    throw Error('Missing test text: ' + text);
  }, text);
  await page.waitForFunction(text => window.getSelection()?.toString() === text, text);
  // Let ProseMirror observe the actual browser selection before clicking a control.
  await page.waitForFunction(async text => {
    const result = (await window.__NOTES_DEBUG__.execute('app.state', {})).result;
    return result.editorSelection.to - result.editorSelection.from === text.length;
  }, text);
};
try {
  await api(page, 'folder.select', { id: 'all' });
  await api(page, 'note.select', { id: 'note-a' });
  await api(page, 'editor.setContent', { document: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '移动编辑体验' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '第一段 第二段 第三段' }] },
    { type: 'paragraph' },
  ] } });
  // Settle the preceding real save before capturing attachment authorization;
  // otherwise its late workspace refresh can invalidate the operation receipt.
  await idle(page);
  await api(page, 'attachment.submit', { files: [{ name: '波形测试.wav', mime: 'audio/wav', base64: wav.toString('base64') }] });
  await page.getByRole('slider', { name: '录音波形进度' }).waitFor();
  check('idle recording shows neutral waveform without fetching original',await page.locator('.audio-card audio').evaluate(e=>!e.getAttribute('src')));
  await page.locator('.audio-play-toggle').tap();
  await page.waitForFunction(() => new Set([...document.querySelectorAll('.audio-waveform-unplayed rect')].map(e => e.getAttribute('height'))).size > 3);
  await page.locator('.audio-play-toggle').tap();
  const cardHeight = await page.locator('.audio-card').evaluate(e => e.getBoundingClientRect().height);
  await page.locator('.audio-title-toggle strong').tap();
  await page.locator('.audio-summary').dblclick();
  check('mobile recording always displays decoded waveform without expandable controls',
    await page.locator('.audio-waveform-row').isVisible() && await page.locator('.audio-detail, .audio-expand').count() === 0 &&
    await page.locator('.audio-card').evaluate(e => e.getBoundingClientRect().height) === cardHeight);
  const slider = page.getByRole('slider', { name: '录音波形进度' });
  await slider.focus(); await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('.audio-card audio').currentTime > 3.8);
  check('waveform seeks the actual media element', await page.locator('.audio-card audio').evaluate(e => e.currentTime > 3.8));
  await page.locator('.audio-play-toggle').tap();
  await page.waitForFunction(() => !document.querySelector('.audio-card audio').paused);
  await page.locator('.audio-play-toggle').tap();
  check('waveform card retains real play and pause', await page.locator('.audio-card audio').evaluate(e => e.paused));
  await page.screenshot({ path: resolve(output, 'waveform-card.png') });

  await select('第一段');
  await page.getByRole('button', { name: '格式', exact: true }).tap();
  await panel.waitFor();
  check('mobile format panel fills viewport width', await panel.evaluate(e => Math.abs(e.getBoundingClientRect().width - innerWidth) < 1));
  // This focus and pointer event previously dismissed the panel twice over.
  await page.locator('.tiptap p').first().tap();
  check('tapping editor keeps format panel open', await panel.isVisible());
  await select('第二段');
  await panel.getByRole('button', { name: '粗体', exact: true }).tap();
  await idle(page);
  check('format uses new selection instead of opening bookmark', await page.locator('.tiptap strong').allTextContents().then(text => text.includes('第二段') && !text.includes('第一段')));
  check('format panel survives formatting and saved note revision', await panel.isVisible());
  await panel.getByRole('button', { name: '选择高亮颜色' }).tap();
  await select('第三段');
  await panel.getByRole('button', { name: '斜体', exact: true }).tap();
  await idle(page);
  check('another selection can receive independent formatting', await page.locator('.tiptap em').allTextContents().then(text => text.includes('第三段') && !text.includes('第二段')));
  check('panel local controls survive save without remounting', await panel.locator('.highlight-colors').isVisible());
  await page.locator('.editor-header').click({ position: { x: 150, y: 20 } });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('outside click and window blur do not dismiss mobile format panel', await panel.isVisible());
  await page.screenshot({ path: resolve(output, 'persistent-format-panel.png') });
  await panel.getByRole('button', { name: '关闭格式', exact: true }).tap();
  check('manual close dismisses format panel', await panel.count() === 0);
  await page.getByRole('button', { name: '格式', exact: true }).tap();
  await panel.waitFor(); await page.keyboard.press('Escape');
  check('Escape is an explicit format close', await panel.count() === 0);
  await page.getByRole('button', { name: '格式', exact: true }).tap();
  await panel.waitFor(); await api(page, 'app.back');
  check('Android back explicitly closes format without leaving note', await panel.count() === 0 && (await state(page)).selection.page === 'editor');

  await page.locator('.tiptap p').first().tap();
  await page.setViewportSize({ width: 320, height: 740 });
  const toolbar = page.locator('.editor-tools');
  const bounds = await toolbar.locator('button').evaluateAll(buttons => buttons.map(b => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), left: r.left, right: r.right, width: r.width, height: r.height }; }));
  check('all editing toolbar controls fit 320px with 44px touch targets', bounds.length === 7 && bounds.every((b, i) => b.left >= 0 && b.right <= 320 && b.width >= 44 && b.height >= 44 && (!i || b.left >= bounds[i - 1].right - 0.1)));
  await toolbar.getByRole('button', { name: '录音', exact: true }).tap();
  await page.locator('.recording-mobile').waitFor();
  check('editing toolbar microphone opens real recording panel', (await state(page)).recording.active);
  await api(page, 'recording.action', { action: 'close' });
  await api(page, 'editor.done');
  await page.locator('.bottom-tools').getByRole('button', { name: '录音', exact: true }).tap();
  await page.locator('.recording-mobile').waitFor();
  check('idle bottom toolbar microphone also opens recording panel', (await state(page)).recording.active);
  await api(page, 'recording.action', { action: 'close' });
  await page.screenshot({ path: resolve(output, 'narrow-toolbar.png') });

  // Android landscape keeps mobile identity. Test desktop semantics in an
  // actual desktop-UA context, sharing only this isolated backend's saved note.
  await page.setViewportSize({ width: 1280, height: 800 });
  check('Android landscape keeps mobile audio controls', await page.locator('.audio-expand').count() === 0 && await page.locator('.app.mobile').count() === 1);
  const desktopContext = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await desktopContext.addInitScript(installBrowserPlatform, { mobile: false, nativeToolbar: false });
    const desktopPage = await desktopContext.newPage();
    desktopPage.on('pageerror', error => runtime.errors.push(String(error)));
    await desktopPage.goto(runtime.origin + '/?notesDebug=1');
    await desktopPage.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
    await desktopPage.waitForSelector('#startup', { state: 'detached' });
    await idle(desktopPage);
    await api(desktopPage, 'note.select', { id: 'note-a' });
    await desktopPage.locator('.audio-expand').click();
    check('desktop recording still supports expanded transport', await desktopPage.locator('.audio-detail').isVisible());
    await desktopPage.getByRole('button', { name: '格式', exact: true }).click();
    await desktopPage.locator('.menu-format').waitFor();
    // Use a visible point outside the menu; the first paragraph can lie under it.
    await desktopPage.locator('.sidebar').click({ position: { x: 10, y: 600 } });
    check('ordinary desktop format menu still dismisses on outside click', await desktopPage.locator('.menu-format').count() === 0);
  } finally { await desktopContext.close(); }
  check('no uncaught page errors', runtime.errors.length === 0);
  await saveJSON(resolve(output, 'result.json'), { status: 'pass', checks, toolbar: bounds, limits: runtime.metadata });
  console.log(JSON.stringify({ status: 'pass', checks }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') });
  await saveJSON(resolve(output, 'failure.json'), { message: error.message, checks, state: await state(page), errors: runtime.errors });
  throw error;
} finally { await runtime.cleanup(); }
