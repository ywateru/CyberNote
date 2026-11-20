// Real App/Editor/Preferences plus controlled IPC/capture boundaries. Captured
// actual settings patches are replayed separately by production SQLite tests.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state } from './debug/runtime.mjs';
import { auditThemeText } from './check-evolve114-contrast.mjs';
import { installBrowserPlatform } from './debug/platform.mjs';
const out = resolve('artifacts/evolve115');
await mkdir(out, { recursive: true });
const checks = [], replays = [], contrasts = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const update = async (p, settings) => { await api(p, 'settings.update', { settings }); await idle(p); };
const closeError = async p => { const b = p.getByRole('button', { name: '关闭错误', exact: true }); if (await b.count()) await b.click(); };
const r = await openRuntime({ ownedBrowser: true });
try {
  const p = r.page;
  const contract = await p.evaluate(async () => {
    const m = await import('/src/presentation/model.ts');
    const { resolvePresentation, platformIdentity } = await import('/src/presentation/resolver.ts');
    const { ConfirmedSettings } = await import('/src/confirmed-settings.ts');
    const legacy = { view: 'gallery', macSidebarVisible: false, theme: 'dark' };
    const migrated = m.presentationOf(legacy);
    const p0 = m.withNavigation(migrated, 'focus');
    const invalid = [null, [], {}, { ...p0, version: 2 }, { ...p0, css: '' },
      { ...p0, desktop: { ...p0.desktop, navigation: 'unknown' } },
      { ...p0, desktop: { ...p0.desktop, lastNonFocusNavigation: 'focus' } },
      { ...p0, desktop: { ...p0.desktop, collectionView: 'table' } },
      { ...p0, desktop: { ...p0.desktop, density: null } },
      { ...p0, mobile: { ...p0.mobile, density: 'compact' } },
      { ...p0, mobile: { ...p0.mobile, extra: true } },
      { ...p0, mobile: { density: 'standard' } }, { ...p0, desktop: null }];
    let rejected = 0;
    for (const v of invalid) try { m.parsePresentation(v); } catch { rejected++; }
    const seen = [], o = new ConfirmedSettings(v => seen.push(v)); o.observe(legacy);
    const before = JSON.stringify(o.snapshot());
    try { o.observe({ presentation: invalid[4] }); } catch {}
    const invalidReadPreserved = JSON.stringify(o.snapshot()) === before;
    const rows = [];
    for (const following of [{ sort: 'title' }, { view: 'list' }, { macSidebarVisible: true }, { view: 'list', macSidebarVisible: false }]) {
      let db = { presentation: p0, appearance: { version: 2, themeId: 'paper', schemePreference: 'dark' } };
      const owner = new ConfirmedSettings(() => {}); owner.observe(legacy);
      const patches = []; let reads = 0;
      const persist = async patch => { patches.push(structuredClone(patch)); db = { ...db, ...m.presentationPatch(db, patch) }; };
      await owner.write({ presentation: p0 }, persist, async () => { throw Error('post-ACK'); }).catch(() => {});
      await owner.write(following, persist, async () => { throw Error('recovery failed'); }).catch(() => {});
      const blocked = patches.length === 1 && owner.snapshot().presentation.desktop.navigation === 'two-pane';
      let release, entered;
      const gate = new Promise(r => release = r), ready = new Promise(r => entered = r);
      const work = owner.write(following, persist, async () => {
        const captured = structuredClone(db); if (++reads === 1) { entered(); await gate; } return captured;
      });
      await ready;
      db = { ...db, ...m.presentationPatch(db, { presentation: { ...p0, mobile: { collectionView: 'list', density: 'comfortable' } } }) };
      owner.observe(db); release(); await work;
      rows.push({ following, blocked, reads, patches, final: owner.snapshot() });
    }
    let release, entered;
    const ready = new Promise(r => entered = r), gate = new Promise(r => release = r);
    const queue = new ConfirmedSettings(() => {}); queue.observe({}); let db = {}, writes = [];
    const persist = async patch => { writes.push(structuredClone(patch)); if (writes.length === 1) { entered(); await gate; } db = { ...db, ...m.presentationPatch(db, patch) }; };
    const a = queue.write({ sort: 'title' }, persist, async () => db); await ready;
    const ticket = queue.ticket(), mutable = structuredClone(p0);
    const b = queue.write({ presentation: mutable }, persist, async () => db); mutable.mobile.collectionView = 'bad';
    const c = queue.write({ view: 'list' }, persist, async () => db);
    release(); await Promise.all([a, b, c]);
    const widths = [320, 390, 430, 699, 700, 1100, 1600];
    const resolver = widths.flatMap(width => [false, true].map(android => {
      const x = resolvePresentation({ platform: platformIdentity(android, 'Android', false), width, height: 800, settings: { presentation: p0 }, imeHeight: 200 });
      return { width, android, mode: x.interactionMode, columns: x.effectiveColumns, availableHeight: x.availableHeight };
    }));
    const threePane = m.withNavigation(migrated, 'three-pane');
    const budgets = [820, 819, 600, 599].map(contentWidth => {
      const x = resolvePresentation({ platform: platformIdentity(false, 'Macintosh', false), width: 1280, height: 800, contentWidth, settings: { presentation: threePane } });
      return { contentWidth, navigation: x.effectiveNavigation, editorMin: x.effectiveWidths.editorMin };
    });
    return { migrated, legacy, rejected, invalidCount: invalid.length, invalidReadPreserved, rows, writes, mutationSafe: queue.snapshot().presentation.mobile.collectionView !== 'bad', lateRejected: !queue.observe({}, ticket), resolver, budgets };
  });
  check('strict exact PresentationV1 rejects every invalid object', contract.rejected === contract.invalidCount);
  check('invalid read keeps confirmed settings', contract.invalidReadPreserved);
  check('legacy migration is desktop-only and never focus', contract.migrated.desktop.navigation === 'two-pane' && contract.migrated.mobile.collectionView === 'gallery');
  check('FIFO copies nested input and invalidates ACK-era reads', contract.mutationSafe && contract.lateRejected && contract.writes.map(p => Object.keys(p)[0]).join() === 'sort,presentation,view');
  for (const row of contract.rows) {
    check('recovery blocks write and rejects late adopt: ' + JSON.stringify(row.following), row.blocked && row.reads === 3);
    check('queued legacy/unrelated intent stays partial: ' + JSON.stringify(row.following), JSON.stringify(row.patches.at(-1)) === JSON.stringify(row.following));
    check('legacy keeps authoritative mobile/appearance: ' + JSON.stringify(row.following), row.final.presentation.mobile.collectionView === 'list' && row.final.appearance.themeId === 'paper');
  }
  check('all Android widths stay mobile; Web 699/700 remains compatible', contract.resolver.every(x => x.mode === (x.android || x.width < 700 ? 'mobile' : 'desktop') && x.availableHeight === 600));
  check('three-pane auto-downgrade rechecks the two-pane content budget',
    contract.budgets[0].navigation === 'three-pane' &&
    contract.budgets[1].navigation === 'two-pane' &&
    contract.budgets[2].navigation === 'two-pane' &&
    contract.budgets[3].navigation === 'focus' &&
    contract.budgets.every(row => row.editorMin === 320));
  await writeFile(resolve(out, 'contract.json'), JSON.stringify(contract, null, 2));

  await api(p, 'note.select', { id: 'note-a' }); await idle(p);
  await api(p, 'editor.setContent', { document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '布局保留中文 Selection Undo owner' }] }] } });
  await api(p, 'editor.select', { from: 2, to: 7 }); await idle(p);
  await p.evaluate(() => { window.layoutDOM = document.querySelector('.tiptap'); window.layoutEditor = window.layoutDOM.editor; window.layoutView = window.layoutEditor.view; });
  const before = await state(p);
  const sameOwner = () => p.evaluate(() => window.layoutDOM === document.querySelector('.tiptap') && window.layoutEditor === window.layoutDOM.editor && window.layoutView === window.layoutEditor.view);
  const prefs = async changes => {
    const current = (await state(p)).settings.presentation;
    await update(p, { presentation: { ...current, desktop: { ...current.desktop, ...changes } } });
  };
  for (const navigation of ['two-pane', 'focus', 'three-pane']) {
    await prefs({ navigation, lastNonFocusNavigation: navigation === 'focus' ? 'two-pane' : navigation });
    check(navigation + ' uses actual shell and same Editor/JSON/selection', await sameOwner() && await p.locator('.app').getAttribute('data-presentation') === navigation && JSON.stringify((await state(p)).editorJSON) === JSON.stringify(before.editorJSON) && JSON.stringify((await state(p)).editorSelection) === JSON.stringify(before.editorSelection));
    await p.screenshot({ path: resolve(out, 'desktop-' + navigation + '.png') });
  }
  await prefs({ navigation: 'two-pane' });
  const densityHeights = {};
  for (const density of ['compact', 'standard', 'comfortable']) {
    await prefs({ density });
    densityHeights[density] = await p.locator('.note-row[data-note-id="note-a"]').evaluate(e => e.getBoundingClientRect().height);
  }
  check('actual density increases collection row geometry monotonically', densityHeights.compact < densityHeights.standard && densityHeights.standard < densityHeights.comfortable);
  await prefs({ collectionView: 'gallery' });
  const galleryDensity = {};
  for (const density of ['compact', 'standard', 'comfortable']) {
    await prefs({ density });
    galleryDensity[density] = await p.locator('.notes-scroll.gallery').evaluate(e => {
      const card = e.querySelector('.note-row-wrap'), s = getComputedStyle(card);
      return { gap: parseFloat(getComputedStyle(e).rowGap) || 0, margin: parseFloat(s.marginBottom), width: card.getBoundingClientRect().width };
    });
  }
  check('desktop gallery density scales cards and vertical spacing monotonically', galleryDensity.compact.width < galleryDensity.standard.width && galleryDensity.standard.width < galleryDensity.comfortable.width && galleryDensity.compact.margin < galleryDensity.standard.margin && galleryDensity.standard.margin < galleryDensity.comfortable.margin && Object.values(galleryDensity).every(v => v.gap === 0));
  await writeFile(resolve(out, 'gallery-density.json'), JSON.stringify(galleryDensity, null, 2));
  const gallerySelection = await p.evaluate(() => {
    const row = document.querySelector('.gallery-entry .note-row.selected');
    const preview = row?.querySelector('.gallery-preview');
    const body = preview?.querySelector('p');
    const title = preview?.querySelector('strong');
    return {
      bodyFont: body ? parseFloat(getComputedStyle(body).fontSize) : 0,
      titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
      shadow: row ? getComputedStyle(row).boxShadow : null,
    };
  });
  check('desktop gallery preview keeps readable text and selection on the preview card', gallerySelection.bodyFont >= 10 && gallerySelection.titleFont >= 11 && gallerySelection.shadow === 'none');
  for (const width of [700, 1100, 1280]) {
    await p.setViewportSize({ width, height: 800 }); await idle(p);
    check('desktop gallery consumes resolver columns at ' + width, await p.locator('.notes-scroll.gallery').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length === Number(getComputedStyle(document.querySelector('.app')).getPropertyValue('--presentation-columns'))));
  }
  await p.setViewportSize({ width: 1280, height: 800 }); await idle(p);
  await p.locator('.note-row[data-note-id="note-a"]').press('Enter'); await idle(p);
  await prefs({ density: 'compact' });
  check('density alone does not leave gallery editor', await p.locator('.app.gallery-edit').count() === 1 && await p.locator('.editor-pane').isVisible() && await sameOwner());
  await prefs({ navigation: 'focus' });
  check('focus overrides gallery browse geometry without changing owner', await p.locator('.editor-pane').isVisible() && await sameOwner());
  await prefs({ navigation: 'two-pane', collectionView: 'list' });
  const drawer = p.getByRole('button', { name: '打开文件夹抽屉', exact: true });
  await drawer.click(); await idle(p);
  check('two-pane opens real drawer and moves focus inside', await p.locator('.sidebar').isVisible() && await p.evaluate(() => document.querySelector('.sidebar').contains(document.activeElement)));
  await p.keyboard.press('Shift+Tab');
  check('drawer traps Tab', await p.evaluate(() => document.querySelector('.sidebar').contains(document.activeElement)));
  await p.keyboard.press('Escape'); await idle(p);
  check('drawer Escape closes and returns trigger focus', !await p.locator('.sidebar').isVisible() && await drawer.evaluate(e => document.activeElement === e));
  const persisted = structuredClone((await state(p)).settings.presentation);
  await p.getByRole('button', { name: '临时专注', exact: true }).click(); await idle(p);
  check('temporary focus does not persist default', await p.locator('.app').getAttribute('data-presentation') === 'focus' && JSON.stringify((await state(p)).settings.presentation) === JSON.stringify(persisted));
  await p.keyboard.press('Escape'); await idle(p);
  await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '打开文件夹抽屉');
  check('Escape restores temporary layout and original focus', await p.locator('.app').getAttribute('data-presentation') === 'two-pane' && await sameOwner() && await drawer.evaluate(e => document.activeElement === e));
  await api(p, 'editor.insertText', { text: ' layoutUndo' }); await idle(p);
  await prefs({ density: 'comfortable', navigation: 'focus' });
  await api(p, 'editor.undo'); await idle(p);
  check('Undo history survives density/layout changes', JSON.stringify((await state(p)).editorJSON) === JSON.stringify(before.editorJSON));
  await p.locator('.tiptap').dispatchEvent('compositionstart', { data: '中' });
  await prefs({ density: 'compact', navigation: 'two-pane' });
  check('synthetic IME composition survives same view', await sameOwner() && await p.evaluate(() => window.layoutView.composing));
  await p.locator('.tiptap').dispatchEvent('compositionend', { data: '中' });

  await api(p, 'settings.open'); await idle(p); await api(p, 'settings.tab', { tab: 'notes' }); await idle(p);
  const layoutGroup = p.getByRole('radiogroup', { name: '桌面导航布局', exact: true });
  const focusChoice = layoutGroup.getByRole('radio', { name: '专注', exact: true });
  const twoPaneChoice = layoutGroup.getByRole('radio', { name: '两栏', exact: true });
  await focusChoice.focus();
  await p.evaluate(() => window.__DEBUG_PLATFORM__.configure({ fail: { settings: 1 } }));
  await focusChoice.click(); await idle(p).catch(error => assert.match(error.message, /Controlled settings failure/));
  check('actual Preferences save failure retains confirmed layout/value/focus', await twoPaneChoice.isChecked() && await focusChoice.evaluate(e => document.activeElement === e) && (await state(p)).settings.presentation.desktop.navigation === 'two-pane' && await p.getByRole('alert').count() > 0);
  await api(p, 'app.back'); await closeError(p); await idle(p);
  await api(p, 'settings.open'); await idle(p); await api(p, 'settings.tab', { tab: 'notes' }); await idle(p);
  await p.evaluate(() => window.__DEBUG_PLATFORM__.configure({ delay: { settings: 300 } }));
  await focusChoice.click();
  check('actual Preferences save is visibly busy and controls disabled', await focusChoice.getAttribute('aria-disabled') === 'true' && await twoPaneChoice.getAttribute('aria-disabled') === 'true');
  await idle(p); await p.evaluate(() => window.__DEBUG_PLATFORM__.configure({ delay: { settings: 0 } }));
  check('Preferences publishes only acknowledged layout', (await state(p)).settings.presentation.desktop.navigation === 'focus' && await sameOwner());
  await api(p, 'app.back'); await idle(p); await closeError(p);

  // Actual App -> bridge -> IPC captures, including stale UI and failed confirms.
  for (const scenario of ['sort', 'view', 'sidebar-true', 'sidebar-false', 'both', 'explicit-priority']) {
    await prefs({ navigation: 'three-pane', collectionView: 'list' });
    const base = (await state(p)).settings.presentation;
    const authoritative = { ...base, desktop: { ...base.desktop, navigation: 'focus', lastNonFocusNavigation: 'two-pane', collectionView: 'gallery' }, mobile: { collectionView: 'list', density: 'comfortable' } };
    const initial = { ...r.backend.workspace.settings, presentation: authoritative, view: 'gallery', macSidebarVisible: false };
    Object.assign(r.backend.workspace.settings, structuredClone(initial));
    const patches = [], call = r.backend.call.bind(r.backend);
    r.backend.call = async (command, args = {}) => { if (command === 'workspace_action' && args.action?.type === 'settings') patches.push(structuredClone(args.action.settings)); return call(command, args); };
    const patch = scenario === 'sort' ? { sort: 'title' } : scenario === 'view' ? { view: 'list' } : scenario === 'both' ? { view: 'list', macSidebarVisible: true } : scenario === 'explicit-priority' ? { presentation: authoritative, view: 'list', macSidebarVisible: true } : { macSidebarVisible: scenario === 'sidebar-true' };
    try {
      await update(p, patch);
      const final = (await state(p)).settings;
      check('App authoritative merge preserves independent mobile: ' + scenario, final.presentation.mobile.collectionView === 'list' && final.presentation.mobile.density === 'comfortable');
      check('App sends exact partial intent: ' + scenario, scenario === 'explicit-priority' ? patches[0].view === 'gallery' && patches[0].macSidebarVisible === false : JSON.stringify(patches[0]) === JSON.stringify(patch));
      replays.push({ scenario, initial, patches, expected: { presentation: final.presentation, view: final.view, macSidebarVisible: final.macSidebarVisible, appearance: final.appearance } });
    } finally { r.backend.call = call; }
  }
  for (const following of [{ sort: 'updated' }, { view: 'list' }, { macSidebarVisible: true }]) {
    await prefs({ navigation: 'three-pane', collectionView: 'list' });
    const initial = structuredClone(r.backend.workspace.settings), intended = { ...initial.presentation, desktop: { ...initial.presentation.desktop, navigation: 'focus', collectionView: 'gallery' }, mobile: { collectionView: 'list', density: 'comfortable' } };
    const patches = [], call = r.backend.call.bind(r.backend);
    r.backend.call = async (command, args = {}) => { if (command === 'workspace_action' && args.action?.type === 'settings') patches.push(structuredClone(args.action.settings)); return call(command, args); };
    try {
      await p.evaluate(() => window.__DEBUG_PLATFORM__.configure({ fail: { load: 2 } }));
      await api(p, 'settings.update', { settings: { presentation: intended } }).catch(() => {});
      check('ACK/read failure keeps old layout ' + JSON.stringify(following), (await state(p)).settings.presentation.desktop.navigation === 'three-pane' && r.backend.workspace.settings.presentation.desktop.navigation === 'focus');
      await api(p, 'settings.update', { settings: following }).catch(() => {});
      check('recovery failure prevents second IPC ' + JSON.stringify(following), patches.length === 1);
      await closeError(p); await update(p, following);
      const final = (await state(p)).settings;
      check('recovered App keeps committed mobile and partial write ' + JSON.stringify(following), patches.length === 2 && JSON.stringify(patches[1]) === JSON.stringify(following) && final.presentation.mobile.collectionView === 'list');
      replays.push({ scenario: 'recovery-' + Object.keys(following)[0], initial, patches, expected: { presentation: final.presentation, view: final.view, macSidebarVisible: final.macSidebarVisible, appearance: final.appearance } });
    } finally { r.backend.call = call; }
  }
  await writeFile(resolve(out, 'app-settings-replays.json'), JSON.stringify(replays, null, 2) + '\n');

  await prefs({ navigation: 'three-pane', collectionView: 'list', density: 'standard' });
  for (const width of [700, 900, 1100, 1600, 699, 700]) {
    await p.setViewportSize({ width, height: 600 }); await idle(p);
    check('Web boundary retains Editor at ' + width, await sameOwner());
    check('Web identity at ' + width, await p.locator('.app').evaluate((e, w) => e.classList.contains(w < 700 ? 'mobile' : 'desktop'), width));
  }
  await p.setViewportSize({ width: 1100, height: 600 }); await idle(p);
  await api(p, 'recording.open'); await idle(p); await api(p, 'recording.action', { action: 'toggle' }); await idle(p);
  const recording = await state(p);
  await prefs({ navigation: 'three-pane', density: 'standard' });
  for (const width of [880, 820, 700]) {
    await p.setViewportSize({ width, height: 600 }); await idle(p);
    const g = await p.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
      const editor = rect('.editor-pane'), body = rect('.tiptap');
      return { presentation: document.querySelector('.app')?.dataset.presentation, editor: editor?.width, body: body?.width, scrollWidth: document.documentElement.scrollWidth };
    });
    check('recording content budget at ' + width + ' never squeezes the editor',
      g.scrollWidth === width && g.editor >= 320 && g.body >= 270 &&
      (width === 880 ? g.presentation === 'two-pane' : g.presentation === 'focus') && await sameOwner());
  }
  await p.setViewportSize({ width: 1100, height: 600 }); await idle(p);
  await p.evaluate(() => { window.layoutRecording = document.querySelector('.recording-dock'); });
  await p.getByRole('button', { name: '收起录音面板', exact: true }).click(); await idle(p);
  await prefs({ navigation: 'focus', density: 'comfortable' });
  check('collapsed recording retains owner/phase and mounted dock', recording.recording.active && (await state(p)).recording.state.phase === recording.recording.state.phase && await p.evaluate(() => window.layoutRecording.isConnected));
  await p.getByRole('button', { name: '恢复录音面板', exact: true }).click(); await idle(p);
  await p.setViewportSize({ width: 700, height: 480 }); await idle(p);
  check('narrow restored recording and Editor remain mounted', await sameOwner() && await p.locator('.recording-dock').isVisible());
  await p.screenshot({ path: resolve(out, 'narrow-recording.png') });
  await p.setViewportSize({ width: 699, height: 480 }); await idle(p);
  check('Web breakpoint does not unmount desktop recording owner', await p.evaluate(() => window.layoutRecording.isConnected) && (await state(p)).recording.state.phase === recording.recording.state.phase);
  await p.setViewportSize({ width: 1100, height: 600 }); await idle(p);
  await api(p, 'recording.action', { action: 'toggle' }); await idle(p); await api(p, 'recording.action', { action: 'close' }); await idle(p);
  await p.setViewportSize({ width: 1280, height: 800 }); await prefs({ navigation: 'three-pane' });
  for (const themeId of Object.keys(JSON.parse(await readFile('src/themes/palettes.json', 'utf8')))) for (const schemePreference of ['light', 'dark']) {
    await update(p, { appearance: { version: 2, themeId, schemePreference } });
    await p.waitForTimeout(180); // Audit settled theme transitions, not interpolated colors.
    const audit = await auditThemeText(p, `${themeId}/${schemePreference}`, '.presentation-toolbar'); contrasts.push(audit);
    await writeFile(resolve(out, 'shell-contrasts.json'), JSON.stringify(contrasts, null, 2));
    check('new shell contrast ' + themeId + '/' + schemePreference, audit.pairs.length > 0 && audit.failures.length === 0);
  }
  const scrollBefore = await p.locator('.notes-scroll').evaluate(e => { e.style.maxHeight = '80px'; e.scrollTop = 32; return e.scrollTop; });
  const sourceBefore = (await state(p)).selection;
  await p.getByRole('button', { name: '临时专注', exact: true }).click(); await idle(p);
  await p.getByRole('button', { name: '退出专注', exact: true }).click(); await idle(p);
  check('temporary focus preserves source and real collection scroll', scrollBefore > 0 && await p.locator('.notes-scroll').evaluate(e => e.scrollTop) === scrollBefore && JSON.stringify((await state(p)).selection) === JSON.stringify(sourceBefore));
  await api(p, 'search.set', { query: '布局' }); await idle(p);
  const searchBefore = (await state(p)).selection;
  await p.getByRole('button', { name: '临时专注', exact: true }).click(); await idle(p);
  await p.keyboard.press('Escape'); await idle(p);
  check('focus Escape preserves search source/query/results', JSON.stringify((await state(p)).selection) === JSON.stringify(searchBefore));
  await api(p, 'search.set', { query: '' }); await idle(p);
  await api(p, 'note.select', { id: 'note-a' }); await idle(p);
  await api(p, 'attachment.submit', { files: [{ name: 'layout-owner.txt', mime: 'text/plain', text: 'attachment owner remains' }] }); await idle(p);
  const attached = (await state(p)).editorJSON;
  await prefs({ navigation: 'focus', density: 'comfortable' });
  check('layout and density keep actual inserted attachment document', JSON.stringify((await state(p)).editorJSON) === JSON.stringify(attached) && r.backend.workspace.attachments.some(a => a.displayName === 'layout-owner.txt'));
  await p.evaluate(() => window.__DEBUG_PLATFORM__.configure({ fail: { save: 1 } }));
  await api(p, 'editor.insertText', { text: ' retained unsaved' }).catch(() => {});
  await idle(p).catch(error => assert.match(error.message, /Save has failed|Controlled save/));
  const failedSave = await state(p);
  await api(p, 'settings.update', { settings: { presentation: { ...failedSave.settings.presentation, desktop: { ...failedSave.settings.presentation.desktop, navigation: 'two-pane', density: 'compact' } } } });
  check('layout keeps failed-save content and queue', failedSave.save.failed > 0 && JSON.stringify((await state(p)).editorJSON) === JSON.stringify(failedSave.editorJSON) && (await state(p)).save.failed > 0);
  await api(p, 'editor.insertText', { text: ' retry' }); await closeError(p); await idle(p);
  check('failed save can retry after layout change', (await state(p)).save.failed === 0);
  const prepared = r.backend.state(); r.backend.suspended = ['note-a']; r.backend.operationId = 'presentation115';
  await p.evaluate(access => window.__DEBUG_PLATFORM__.emit('notes-access', { phase: 'prepare', operationId: 'presentation115', noteIds: ['note-a'], access }), { ...prepared.access, operationId: 'presentation115', suspended: ['note-a'] });
  await p.waitForSelector('.access-cover'); await p.setViewportSize({ width: 699, height: 600 });
  check('access barrier stays above layout changes and hides content', await p.locator('.access-cover').isVisible() && await p.locator('.editor-pane').evaluate(e => getComputedStyle(e).visibility === 'hidden'));
  r.backend.suspended = []; r.backend.operationId = null;
  await p.evaluate(access => window.__DEBUG_PLATFORM__.emit('notes-access', { phase: 'abort', operationId: 'presentation115', noteIds: ['note-a'], access }), r.backend.state().access);
  await p.locator('.error-banner').waitFor(); await closeError(p); await p.setViewportSize({ width: 1280, height: 800 }); await idle(p);
  await prefs({ navigation: 'focus', lastNonFocusNavigation: 'two-pane' });
  await p.reload(); await p.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1); await idle(p); await p.waitForSelector('#startup', { state: 'detached' });
  check('cold focus uses confirmed preference', await p.locator('.app').getAttribute('data-presentation') === 'focus');
  await p.getByRole('button', { name: '退出专注', exact: true }).click(); await idle(p);
  check('cold focus exit restores persisted last nonfocus layout', (await state(p)).settings.presentation.desktop.navigation === 'two-pane');
  const separate = await p.context().newPage();
  try {
    await separate.addInitScript(installBrowserPlatform, { mobile: false, nativeToolbar: false });
    await separate.setViewportSize({ width: 320, height: 480 });
    await separate.goto(r.origin + '/?notesDebug=1&note=note-a'); await separate.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1); await idle(separate); await separate.waitForSelector('#startup', { state: 'detached' });
    check('separate note keeps desktop focus identity at 320', await separate.locator('.app.desktop.separate[data-presentation="focus"]').count() === 1 && await separate.locator('.editor-pane').isVisible());
  } finally { await separate.close(); }
  check('no App runtime errors', r.errors.length === 0);
} catch (error) { console.error('desktop phase failed:', error); throw error; } finally { await r.cleanup(); }

const mobile = await openRuntime({ mobile: true, ownedBrowser: true });
try {
  const p = mobile.page;
  check('mobile defaults gallery independently', (await state(p)).settings.presentation.mobile.collectionView === 'gallery');
  await p.getByRole('button', { name: '显示选项', exact: true }).click();
  await p.getByRole('menuitem', { name: '列表', exact: true }).click(); await idle(p);
  check('mobile quick choice persists only mobile view', (await state(p)).settings.presentation.mobile.collectionView === 'list' && (await state(p)).settings.view === 'list');
  for (const width of [320, 390, 430, 700, 1100]) {
    await p.setViewportSize({ width, height: width > 700 ? 390 : 844 }); await idle(p);
    check('Android list stays mobile at ' + width, await p.locator('.app.mobile[data-collection="list"]').count() === 1);
    check('list is one actual column at ' + width, await p.locator('.notes-scroll').evaluate(e => getComputedStyle(e).display === 'block'));
  }
  await p.setViewportSize({ width: 320, height: 568 });
  await api(p, 'note.select', { id: 'note-a' }); await idle(p);
  const transition = await p.evaluate(() => ({
    app: getComputedStyle(document.querySelector('.app')).backgroundColor,
    pane: getComputedStyle(document.querySelector('.editor-pane')).backgroundColor,
  }));
  check('mobile page transition exposes the editor paper underlay', transition.app === transition.pane);
  await p.evaluate(() => { window.mobileLayoutDOM = document.querySelector('.tiptap'); window.mobileLayoutEditor = window.mobileLayoutDOM.editor; });
  const selected = await state(p);
  await update(p, { interfaceFontSize: 'huge', presentation: { ...selected.settings.presentation, mobile: { collectionView: 'list', density: 'comfortable' } } });
  for (const [width, height] of [[1100, 390], [390, 320], [390, 844]]) {
    await p.setViewportSize({ width, height }); await idle(p);
    check('Android rotation/IME keeps same Editor ' + width + '/' + height, await p.evaluate(() => window.mobileLayoutDOM === document.querySelector('.tiptap') && window.mobileLayoutEditor === document.querySelector('.tiptap').editor));
  }
  for (const theme of ['light', 'dark']) {
    await update(p, { theme }); await idle(p);
    await p.locator('.editor-tools:visible [aria-label="格式"]').click(); await idle(p); await p.waitForTimeout(150);
    const surface = await p.locator('.mobile-format-panel').evaluate(e => {
      const color = selector => getComputedStyle(e.querySelector(selector)).backgroundColor;
      return { panel: getComputedStyle(e).backgroundColor, group: color('.format-control-group'), close: color('.format-panel-header button'), quote: color('.format-list-row > .icon-button') };
    });
    check(`mobile format controls share one themed surface in ${theme}`, surface.group !== surface.panel && surface.close === surface.group && surface.quote === surface.group);
    await p.keyboard.press('Escape'); await idle(p);
  }
  await p.setViewportSize({ width: 320, height: 568 }); await idle(p);
  await p.locator('.editor-tools:visible [aria-label="格式"]').click(); await idle(p); await p.waitForTimeout(150);
  const typeRow = await p.locator('.type-styles').evaluate(e => {
    const panel = e.closest('.mobile-format-panel');
    return {
      scrollWidth: e.scrollWidth,
      clientWidth: e.clientWidth,
      panelScrollHeight: panel.scrollHeight,
      panelClientHeight: panel.clientHeight,
      children: [...e.children].map(child => ({ scrollWidth: child.scrollWidth, clientWidth: child.clientWidth })),
    };
  });
  check('320 huge format style labels wrap without clipping',
    typeRow.scrollWidth <= typeRow.clientWidth &&
    typeRow.children.every(child => child.scrollWidth <= child.clientWidth + 1) &&
    typeRow.panelScrollHeight - typeRow.panelClientHeight <= 48);
  await p.screenshot({ path: resolve(out, 'mobile-format-320-huge.png') });
  await p.keyboard.press('Escape'); await idle(p);
  await api(p, 'app.back'); await idle(p); await p.setViewportSize({ width: 320, height: 568 });
  await p.waitForTimeout(300); // Finish page-in before geometry/screenshot evidence.
  const bounds = await p.evaluate(() => {
    const width = innerWidth;
    const elements = [...document.querySelectorAll('.notes-scroll, .note-entry, .mobile-home-actions button')].filter(e => e.getClientRects().length);
    return { width, scrollWidth: document.documentElement.scrollWidth, elements: elements.map(e => { const r = e.getBoundingClientRect(); return { class: e.className, x: r.x, right: r.right, width: r.width, height: r.height }; }) };
  });
  check('320 huge comfortable list and actions fit viewport', bounds.scrollWidth === 320 && bounds.elements.every(e => e.x >= 0 && e.right <= 320));
  check('mobile actions retain 44px hits', bounds.elements.filter(e => e.class.includes('button') || e.class.includes('choice')).every(e => e.width >= 44 && e.height >= 44));
  await writeFile(resolve(out, 'mobile-bounds.json'), JSON.stringify(bounds, null, 2));
  await p.screenshot({ path: resolve(out, 'mobile-list-huge.png') });
  await api(p, 'settings.open'); await idle(p); await api(p, 'settings.tab', { tab: 'notes' }); await idle(p);
  await p.getByRole('radiogroup', { name: '手机显示方式', exact: true }).getByRole('radio', { name: '画廊', exact: true }).click(); await idle(p);
  check('real Preferences changes mobile independently', (await state(p)).settings.presentation.mobile.collectionView === 'gallery' && (await state(p)).settings.presentation.desktop.collectionView === 'list');
  await p.screenshot({ path: resolve(out, 'mobile-preferences.png') });
  check('no mobile runtime errors', mobile.errors.length === 0);
} catch (error) { console.error('mobile phase failed:', error); throw error; } finally { await mobile.cleanup(); }
await writeFile(resolve(out, 'results.json'), JSON.stringify({ checks, count: checks.length, replays: replays.length, contrasts }, null, 2) + '\n');
console.log(`evolve115: ${checks.length} checks; ${replays.length} actual App settings replay paths`);
