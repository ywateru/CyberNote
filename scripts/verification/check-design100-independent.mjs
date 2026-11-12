// Independent review probes use the production App and an exact-source Rust
// Store transport. Delays/failures affect only IPC completion in isolated data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state } from '../debug/runtime.mjs';

const out = resolve(process.argv[2] || 'artifacts/design100-independent');
const build = JSON.parse(await readFile(resolve(process.argv[3] || 'artifacts/design100-rust', 'build.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(out, { recursive: true });
for (const [file, digest] of Object.entries(build.sources)) assert.equal(sha(await readFile(file)), digest, file);
assert.equal(sha(await readFile(build.binary.path)), build.binary.sha256);
const binary = resolve(out, 'owned-transport'); await copyFile(build.binary.path, binary);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const checks = [], observations = [];
const normal = { version: 1, iconScale: 100, desktopHitScale: 100, mobileHitScale: 100, menuSpacing: 'standard', radiusScale: 100 };
for (const mobile of [false, true]) {
  const r = await openRuntime({ mobile, transport: binary });
  const { page, backend } = r;
  const original = backend.call.bind(backend);
  try {
    await api(page, 'note.create');
    await api(page, 'settings.update', { settings: { interfaceDetails: normal, interfaceFontSize: 'medium' } });
    const scale = () => page.locator('.app').evaluate(el => getComputedStyle(el).getPropertyValue('--interface-icon-scale'));

    // Capture an authoritative old workspace response, finish a newer App ACK,
    // and only then deliver the old response through App.refresh/hydrate.
    const captured = defer(), release = defer(); let capture = true;
    backend.call = async (command, args) => {
      const result = await original(command, args);
      if (command === 'load_workspace' && capture) { capture = false; captured.resolve(result); await release.promise; }
      return result;
    };
    await page.evaluate(() => { window.designReviewRefresh = window.__NOTES_DEBUG__.execute('app.refresh'); });
    const stale = await captured.promise;
    assert.equal(stale.value.settings.interfaceDetails.iconScale, 100);
    await api(page, 'settings.update', { settings: { interfaceDetails: { ...normal, iconScale: 91 } } });
    assert.equal(await scale(), '0.91');
    release.resolve(); await page.evaluate(() => window.designReviewRefresh); await idle(page);
    assert.equal(await scale(), '0.91');
    checks.push(`${mobile ? 'mobile' : 'desktop'} delayed real workspace cannot undo newer App persistence ACK`);
    backend.call = original;

    // Persistence succeeds, but its confirming read fails. Unconfirmed controls
    // retain the old authority; later real refresh recovers the stored setting.
    let failRead = true;
    backend.call = async (command, args) => {
      if (command === 'load_workspace' && failRead) { failRead = false; throw Error('independent confirmation read failure'); }
      return original(command, args);
    };
    await page.evaluate(async normal => { await window.__NOTES_DEBUG__.execute('settings.update', { settings: { interfaceDetails: { ...normal, iconScale: 104 } } }).catch(() => {}); }, normal);
    assert.equal(await scale(), '0.91');
    await api(page, 'app.dismissError'); await idle(page);
    backend.call = original;
    const stored = await original('load_workspace'); assert.equal(stored.value.settings.interfaceDetails.iconScale, 104);
    await api(page, 'app.dismissError'); await api(page, 'app.refresh');
    assert.equal(await scale(), '1.04');
    checks.push(`${mobile ? 'mobile' : 'desktop'} failed confirmation does not publish pending settings; later refresh recovers actual SQLite value`);

    // UI glyph scaling must leave actual note artwork and the sketch canvas at
    // their document dimensions. Exercise the real paper menu across its portal.
    await api(page, 'editor.setContent', { document: { type: 'doc', content: [
      { type: 'drawing', attrs: { strokes: [{ tool: 'pen', width: 4, color: '#007aff', points: [[20, 30], [200, 100], [350, 45]] }] } },
      { type: 'paragraph' },
    ] } });
    await api(page, 'editor.done');
    const artwork = page.getByRole('button', { name: '编辑手绘笔迹', exact: true });
    const box = await artwork.boundingBox();
    await api(page, 'settings.update', { settings: { interfaceDetails: { ...normal, iconScale: 80 } } });
    const small = await artwork.boundingBox();
    await api(page, 'settings.update', { settings: { interfaceDetails: { ...normal, iconScale: 120 } } });
    const large = await artwork.boundingBox();
    assert.ok(Math.abs(small.width - large.width) < .1 && Math.abs(small.height - large.height) < .1);
    await artwork.click();
    const panel = page.getByRole('dialog', { name: '速绘', exact: true }); await panel.waitFor();
    const canvas = panel.locator('svg[aria-label="绘图画布"]');
    assert.ok((await canvas.boundingBox()).width > 200);
    await panel.getByRole('button', { name: '横线与网格', exact: true }).click();
    const paper = page.getByRole('menuitem', { name: '中网格', exact: true });
    const layers = await paper.evaluate(el => {
      const menu = el.closest('[role="menu"]'), overlay = document.querySelector('.drawing-overlay');
      const rect = el.getBoundingClientRect(), top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { layer: menu.dataset.menuLayer, menu: +getComputedStyle(menu).zIndex, overlay: +getComputedStyle(overlay).zIndex, clickable: el.contains(top) };
    });
    assert.equal(layers.layer, 'modal'); assert.ok(layers.menu > layers.overlay); assert.equal(layers.clickable, true);
    await paper.click(); await panel.getByRole('button', { name: '完成', exact: true }).click(); await idle(page);
    assert.ok((await state(page)).workspace.notes.some(note => note.paperStyle === 'grid-medium'));
    // Capture document dimensions and actual menu stacking without asserting a
    // platform-specific note-selection debug field.
    observations.push({ mobile, artwork: { box, small, large }, layers });
    checks.push(`${mobile ? 'mobile' : 'desktop'} actual drawing artwork is not resized as a UI icon; paper portal is visible and interactive above sketch panel`);
    assert.deepEqual(r.errors, []);
    await page.screenshot({ path: resolve(out, `${mobile ? 'mobile' : 'desktop'}-after.png`) });
  } finally { backend.call = original; await r.cleanup(); }
}
await writeFile(resolve(out, 'result.json'), JSON.stringify({ checks, observations, transportSha256: build.binary.sha256, actualRustStore: true, nativePackage: false }, null, 2));
console.log(checks.join('\n'));
