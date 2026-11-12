// Independent regression for selected-axis chrome, beyond the unselected grips.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state } from '../debug/runtime.mjs';
const out = resolve(process.argv[2] || 'artifacts/design100-independent-chosen-table');
await mkdir(out, { recursive: true });
const observations = [], checks = [];
let failure;
for (const mobile of [false, true]) {
  const r = await openRuntime({ mobile }); const { page } = r;
  try {
    await page.setViewportSize(mobile ? { width: 320, height: 640 } : { width: 760, height: 500 });
    await api(page, 'note.create'); await api(page, 'editor.table', { action: 'insert' });
    const before = (await state(page)).editorJSON;
    for (const font of ['tiny', 'huge']) for (const hit of [100, mobile ? 120 : 130]) {
      await api(page, 'settings.update', { settings: { interfaceFontSize: font, interfaceDetails: { version: 1, iconScale: 120, desktopHitScale: mobile ? 100 : hit, mobileHitScale: mobile ? hit : 100, menuSpacing: 'comfortable', radiusScale: 150 } } });
      for (const axis of ['row', 'column']) {
        await page.locator('.tiptap td').first().click(); await idle(page);
        await page.getByRole('button', { name: axis === 'row' ? '选择行' : '选择列', exact: true }).click();
        await page.keyboard.press('Escape');
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        const geometry = await page.evaluate(axis => {
          const handle = document.querySelector(`.table-axis-handle.${axis}.chosen`), cell = document.querySelector('.tiptap td');
          const rect = element => element.getBoundingClientRect().toJSON();
          const box = cell.getBoundingClientRect(), hit = document.elementFromPoint(box.left + 8, box.top + box.height / 2);
          return { handle: rect(handle), buttons: [...handle.querySelectorAll('button')].map(rect), cell: rect(cell), textHit: !!hit?.closest('td,th') };
        }, axis);
        observations.push({ mobile, font, hit, axis, geometry });
        try {
          for (const button of geometry.buttons) {
            assert.ok(button.x >= -.1 && button.right <= page.viewportSize().width + .1, 'Selected axis controls stay within the viewport');
            assert.ok(button.right <= geometry.handle.right + 2, 'Selected axis children fit the actual chrome container');
            assert.ok(axis === 'row' ? button.right <= geometry.cell.left + 2 : button.bottom <= geometry.cell.top + 2, 'Selected axis buttons remain in the gutter without covering editable cell text');
          }
          assert.equal(geometry.textHit, true, 'Selected axis does not intercept text inside the cell');
          checks.push(`${mobile ? 'mobile' : 'desktop'} ${font} hit${hit}: selected ${axis} container, glyph and text-hit bounds`);
        } catch (cause) { failure ||= cause; await page.screenshot({ path: resolve(out, `${mobile ? 'mobile' : 'desktop'}-${font}-${hit}-${axis}.png`) }); }
      }
    }
    assert.deepEqual((await state(page)).editorJSON, before, 'Axis selection geometry does not mutate the document');
    assert.deepEqual(r.errors, []);
  } finally { await r.cleanup(); }
}
await writeFile(resolve(out, 'result.json'), JSON.stringify({ checks, observations, failure: failure?.message || null }, null, 2));
if (failure) throw failure;
console.log(checks.join('\n'));
