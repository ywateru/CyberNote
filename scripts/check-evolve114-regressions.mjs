// Formal regressions for independent review F1–F5. Actual App/Tiptap/CSS,
// isolated IPC; captured production App patches are replayed by the Store test.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openRuntime, api, idle, state } from './debug/runtime.mjs';
import { auditThemeText } from './check-evolve114-contrast.mjs';

export async function runThemeRegressions() {
  const out = resolve('artifacts/evolve114-regressions');
  await mkdir(out, { recursive: true });
  const checks = [], rendered = [], replays = [];
  const check = (name, pass) => { assert.ok(pass, name); checks.push(name); };
  const r = await openRuntime();
  const p = r.page;
  const update = async patch => { await api(p, 'settings.update', { settings: patch }); await idle(p); };
  const appearance = (themeId, schemePreference) => ({ version: 2, themeId, schemePreference });
  const audit = async (label, selector) => {
    await p.waitForTimeout(140);
    const row = await auditThemeText(p, label, selector);
    rendered.push(row);
    await writeFile(resolve(out, 'contrast.json'), JSON.stringify(rendered, null, 2) + '\n');
    check(label + ' ordinary text >=4.5', row.pairs.length > 0 && row.failures.length === 0);
  };
  const opaque = locator => locator.evaluate(e => {
    const s = getComputedStyle(e), canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = s.backgroundColor; ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data[3] === 255;
  });
  try {
    for (const following of [{ sort: 'updated' }, { theme: 'system' }]) {
      const label = 'F1 queued ' + Object.keys(following)[0];
      const result = await p.evaluate(async following => {
        const { ConfirmedSettings } = await import('/src/confirmed-settings.ts');
        const { appearancePatch } = await import('/src/themes/appearance.ts');
        const seen = [], owner = new ConfirmedSettings(v => seen.push(structuredClone(v)));
        owner.observe({ theme: 'light' });
        let db = { theme: 'light' }, calls = 0, enter, release;
        const patches = [], ready = new Promise(r => enter = r), gate = new Promise(r => release = r);
        const persist = async patch => { patches.push(structuredClone(patch)); db = { ...db, ...appearancePatch(db, patch) }; };
        const read = async () => {
          calls++;
          if (calls === 1) throw Error('post-ACK read unavailable');
          if (calls === 2) { enter(); await gate; }
          return structuredClone(db);
        };
        const ticket = owner.ticket();
        const first = owner.write({ appearance: { version: 2, themeId: 'paper', schemePreference: 'dark' } }, persist, read).catch(e => e.message);
        const second = owner.write(following, persist, read);
        await ready;
        const held = { snapshot: owner.snapshot(), db: structuredClone(db), patches: patches.length };
        const lateRejected = !owner.observe({ theme: 'light' }, ticket);
        release(); const error = await first; await second;
        return { error, held, lateRejected, calls, patches, db, snapshot: owner.snapshot(), seen };
      }, following);
      check(label + ' ACK failure retains old UI and gates second persistence', result.error.includes('unavailable') && result.held.snapshot.appearance.themeId === 'classic' && result.held.db.appearance.themeId === 'paper' && result.held.patches === 1);
      check(label + ' recovers before FIFO write, retains partial intent and rejects late ticket', result.calls === 3 && result.lateRejected && result.patches.length === 2 && JSON.stringify(result.patches[1]) === JSON.stringify(following));
      check(label + ' retains committed skin and atomic projection', result.db.appearance.themeId === 'paper' && result.snapshot.appearance.themeId === 'paper' && result.db.theme === result.db.appearance.schemePreference && result.db.theme === (following.theme || 'dark'));
    }
    const blocked = await p.evaluate(async () => {
      const { ConfirmedSettings } = await import('/src/confirmed-settings.ts');
      const { appearancePatch } = await import('/src/themes/appearance.ts');
      const o = new ConfirmedSettings(() => {}); o.observe({ theme: 'light' });
      let db = { theme: 'light' }, writes = 0;
      const persist = async patch => { writes++; db = { ...db, ...appearancePatch(db, patch) }; };
      const unavailable = async () => { throw Error('read unavailable'); };
      await o.write({ appearance: { version: 2, themeId: 'paper', schemePreference: 'dark' } }, persist, unavailable).catch(() => {});
      await o.write({ sort: 'title' }, persist, unavailable).catch(() => {});
      const held = { writes, snapshot: o.snapshot() };
      await o.write({ theme: 'system' }, persist, async () => db);
      return { held, writes, snapshot: o.snapshot() };
    });
    check('F1 repeated recovery failure prevents persistence and retains old UI', blocked.held.writes === 1 && blocked.held.snapshot.appearance.themeId === 'classic');
    check('F1 later recovery resumes queue with committed skin', blocked.writes === 2 && blocked.snapshot.appearance.themeId === 'paper' && blocked.snapshot.theme === 'system');
    for (const following of [{ sort: 'title' }, { theme: 'light' }]) {
      const race = await p.evaluate(async following => {
        const { ConfirmedSettings } = await import('/src/confirmed-settings.ts');
        const { appearancePatch } = await import('/src/themes/appearance.ts');
        const o = new ConfirmedSettings(() => {}); o.observe({ theme: 'light' });
        let db = { theme: 'light' }, enter, release, reads = 0;
        const gate = new Promise(r => release = r), ready = new Promise(r => enter = r);
        const persist = async patch => { db = { ...db, ...appearancePatch(db, patch) }; };
        await o.write({ appearance: { version: 2, themeId: 'paper', schemePreference: 'dark' } }, persist, async () => { throw Error('read unavailable'); }).catch(() => {});
        const work = o.write(following, persist, async () => {
          const captured = structuredClone(db);
          if (++reads === 1) { enter(); await gate; }
          return captured;
        });
        await ready;
        db = { ...db, ...appearancePatch(db, { theme: 'system' }) };
        o.observe(db); release(); await work;
        return { reads, snapshot: o.snapshot() };
      }, following);
      check('F1 late external adoption invalidates recovery read before partial ' + Object.keys(following)[0], race.reads === 3 && race.snapshot.appearance.themeId === 'paper' && race.snapshot.theme === (following.theme || 'system'));
    }
    const ackTicket = await p.evaluate(async () => {
      const { ConfirmedSettings } = await import('/src/confirmed-settings.ts');
      const o = new ConfirmedSettings(() => {}); o.observe({ theme: 'light' });
      let release, enter;
      const ready = new Promise(r => enter = r), gate = new Promise(r => release = r);
      const work = o.write({ appearance: { version: 2, themeId: 'paper', schemePreference: 'dark' } }, async () => { enter(); await gate; }, async () => { throw Error('read unavailable'); }).catch(() => {});
      await ready; const ticket = o.ticket(); release(); await work;
      return { rejected: !o.observe({ theme: 'light' }, ticket), snapshot: o.snapshot() };
    });
    check('F1 snapshot requested during persistence cannot clear post-ACK recovery', ackTicket.rejected && ackTicket.snapshot.appearance.themeId === 'classic');

    // Capture actual App -> bridge -> IPC patches, including the failed read.
    for (const following of [{ sort: 'updated' }, { theme: 'system' }]) {
      await update({ appearance: appearance('classic', 'light') });
      const patches = [], call = r.backend.call.bind(r.backend);
      r.backend.call = async (command, args = {}) => {
        if (command === 'workspace_action' && args.action?.type === 'settings') patches.push(structuredClone(args.action.settings));
        return call(command, args);
      };
      try {
        await p.evaluate(() => window.__DEBUG_PLATFORM__.configure({ fail: { load: 1 } }));
        let rejected = false;
        try { await api(p, 'settings.update', { settings: { appearance: appearance('paper', 'dark') } }); } catch { rejected = true; }
        const held = await state(p);
        check('F1 App ' + Object.keys(following)[0] + ' ACK/read failure keeps confirmed UI', rejected && r.backend.workspace.settings.appearance.themeId === 'paper' && held.settings.appearance.themeId === 'classic' && await p.evaluate(() => document.documentElement.dataset.themeId === 'classic'));
        await p.getByRole('button', { name: '关闭错误', exact: true }).click();
        await update(following);
        const final = (await state(p)).settings;
        check('F1 App ' + Object.keys(following)[0] + ' recovers committed Paper', final.appearance.themeId === 'paper' && r.backend.workspace.settings.appearance.themeId === 'paper' && final.theme === (following.theme || 'dark'));
        check('F1 App ' + Object.keys(following)[0] + ' explicit appearance is atomic, following intent partial', patches.length === 2 && patches[0].appearance.themeId === 'paper' && patches[0].theme === 'dark' && JSON.stringify(patches[1]) === JSON.stringify(following));
        replays.push({ following, initial: { theme: 'light' }, patches, expected: { appearance: final.appearance, theme: final.theme } });
      } finally { r.backend.call = call; }
    }
    // Simulate another window committing between this window's reads. There
    // is no added wire: partial Store intents must preserve persisted skin.
    for (const following of [{ sort: 'title' }, { theme: 'system' }]) {
      await update({ appearance: appearance('classic', 'light') });
      const initial = { appearance: appearance('paper', 'dark'), theme: 'dark' };
      Object.assign(r.backend.workspace.settings, structuredClone(initial));
      const patches = [], call = r.backend.call.bind(r.backend);
      r.backend.call = async (command, args = {}) => {
        if (command === 'workspace_action' && args.action?.type === 'settings') patches.push(structuredClone(args.action.settings));
        return call(command, args);
      };
      try {
        await update(following);
        const final = (await state(p)).settings;
        check('F1 App external commit + ' + Object.keys(following)[0] + ' keeps persisted skin with partial intent', final.appearance.themeId === 'paper' && patches.length === 1 && JSON.stringify(patches[0]) === JSON.stringify(following));
        replays.push({ following, initial, patches, expected: { appearance: final.appearance, theme: final.theme } });
      } finally { r.backend.call = call; }
    }
    await writeFile(resolve(out, 'app-settings-replays.json'), JSON.stringify(replays, null, 2) + '\n');
    assert.deepEqual(replays, JSON.parse(await readFile('src-tauri/tests/evolve114-settings-recovery.json', 'utf8')));
    check('F1 committed Store replay fixture matches this run actual App patches', true);

    const table = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '表格可读性' }] }, { type: 'table', content: [{ type: 'tableRow', content: ['必须仍可看见的内容', 'SECOND CELL'].map(text => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })) }] }] };
    for (const themeId of Object.keys(JSON.parse(await readFile('src/themes/palettes.json', 'utf8')))) for (const scheme of ['light', 'dark']) {
      const label = themeId + '-' + scheme;
      await update({ appearance: appearance(themeId, scheme) });
      await api(p, 'folder.open');
      check(label + ' F2 ordinary form is opaque', await opaque(p.locator('.smart-form')));
      check(label + ' F2 unchecked ordinary checkbox visible', await p.getByRole('checkbox', { name: '制作智能文件夹', exact: true }).evaluate(e => {
        const s = getComputedStyle(e); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(s.borderWidth) >= 1 && s.borderColor !== s.backgroundColor;
      }));
      await audit(label + '-ordinary-form', '.smart-form');
      await p.locator('.smart-name input').fill('主题可读性');
      await p.getByRole('checkbox', { name: '制作智能文件夹', exact: true }).check();
      check(label + ' F2 smart form is opaque', await opaque(p.locator('.smart-form')));
      await p.getByRole('combobox', { name: '标签模式', exact: true }).selectOption('allSelected');
      await p.getByRole('textbox', { name: '标签', exact: true }).fill('theme114');
      await p.locator('.smart-tag-options').waitFor();
      check(label + ' F2 tag popover is opaque', await opaque(p.locator('.smart-tag-options')));
      await audit(label + '-tag-options', '.smart-form');
      await p.screenshot({ path: resolve(out, label + '-smart-tag.png') });
      await p.getByRole('textbox', { name: '标签', exact: true }).fill('');
      await p.locator('.smart-form footer .smart-primary').click();
      await p.locator('.smart-warning').waitFor();
      check(label + ' F2 warning is opaque', await opaque(p.locator('.smart-warning')));
      await audit(label + '-smart-warning', '.smart-warning');
      await p.screenshot({ path: resolve(out, label + '-warning.png') });
      await p.locator('.smart-warning button').click();
      await p.getByRole('button', { name: '取消', exact: true }).click();
      await idle(p);

      await api(p, 'editor.setContent', { document: table }); await idle(p);
      const rect = await p.evaluate(() => {
        const editor = document.querySelector('.tiptap').editor, cells = [];
        editor.state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell') cells.push(pos); });
        return editor.commands.setCellSelection({ anchorCell: cells[0], headCell: cells[1] });
      });
      await p.locator('.selectedCell').first().waitFor();
      check(label + ' F3 non-axis rectangle has translucent overlay', rect && await p.locator('.selectedCell').first().evaluate(e => {
        const color = getComputedStyle(e, '::after').backgroundColor, canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        const alpha = ctx.getImageData(0, 0, 1, 1).data[3] / 255;
        return alpha > 0 && alpha <= .2 && !document.querySelector('.table-selection-outline');
      }));
      await audit(label + '-rectangular-selection', '.tiptap');
      await p.screenshot({ path: resolve(out, label + '-rectangle.png') });
      await p.locator('.tiptap td').first().click();
      await p.getByRole('button', { name: '选择列', exact: true }).click(); await p.keyboard.press('Escape');
      check(label + ' F3 axis selection retains outline and clear text layer', await p.locator('.table-selection-outline').count() > 0 && await p.locator('.selectedCell').first().evaluate(e => getComputedStyle(e, '::after').backgroundColor === 'rgba(0, 0, 0, 0)'));
      await audit(label + '-axis-selection', '.tiptap');
      await p.screenshot({ path: resolve(out, label + '-axis.png') });

      await api(p, 'menu.open', { menu: 'view' });
      await p.getByRole('menuitem', { name: '查看附件', exact: true }).click(); await idle(p);
      const selected = p.locator('.attachment-gallery-categories button[aria-selected="true"]');
      for (const mode of ['selected', 'hover', 'focus']) {
        if (mode === 'hover') await selected.hover();
        if (mode === 'focus') { await p.mouse.move(1, 1); await selected.focus(); }
        await audit(label + '-attachment-category-' + mode, '.attachment-gallery-categories');
      }
      await p.screenshot({ path: resolve(out, label + '-attachments.png') });
      await api(p, 'menu.open', { menu: 'view' });
      await p.getByRole('menuitem', { name: '列表', exact: true }).click(); await idle(p);
      await p.locator('.note-date').first().click();
      await p.locator('.toast').waitFor();
      check(label + ' F5 toast has opaque semantic surface', await opaque(p.locator('.toast')));
      await audit(label + '-date-toast', '.toast');
      await p.screenshot({ path: resolve(out, label + '-toast.png') });
    }
    check('F1-F5 no unexpected page errors', r.errors.length === 0);
    await writeFile(resolve(out, 'results.json'), JSON.stringify({ checks, rendered, replays, scope: 'Actual React App/Tiptap; isolated IPC. Production App patches replayed separately by real Store.' }, null, 2) + '\n');
    return { checks, rendered };
  } finally { await r.cleanup(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runThemeRegressions(); console.log(`PASS ${result.checks.length} review regression checks`);
}
