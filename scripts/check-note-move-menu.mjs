import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openRuntime, api, idle, state, saveJSON } from './debug/runtime.mjs';
const output = resolve('artifacts/note-move-menu');
await mkdir(output, { recursive: true });
const checks = [];
const check = (label, value) => { assert.ok(value, label); checks.push(label); };
for (const mobile of [false, true]) {
  const runtime = await openRuntime({ mobile, nativeToolbar: !mobile });
  const { page, backend } = runtime;
  try {
    backend.workspace.folders.push(
      { id: 'move-target', kind: 'normal', name: '工作项目', parentId: null, sortOrder: 50, createdAt: 1 },
      { id: 'move-smart', kind: 'smart', name: '智能集合', parentId: null, sortOrder: 51, createdAt: 1, definitionRevision: 1, query: { version: 1, combine: 'all', rules: [{ type: 'pinned', value: true }] } },
    );
    backend.sequence++;
    await api(page, 'app.refresh'); await api(page, 'folder.select', { id: 'all' }); await api(page, 'note.select', { id: 'note-a' });
    if (!mobile) {
      const more = await page.evaluate(() => window.__DEBUG_PLATFORM__.toolbarStates.at(-1).menus.find(m => m.owner === 'more'));
      const move = more.items.find(e => e.kind === 'submenu' && e.label === '移动到');
      check('Mac toolbar projects physical folders as a real submenu', move.items.some(e => e.folderId === 'move-target') && !move.items.some(e => e.folderId === 'move-smart' || e.folderId === 'trash'));
      check('Mac current folder is checked and disabled', move.items.some(e => e.folderId === 'default' && !e.enabled && e.selected));
    }
    await api(page, 'menu.open', { menu: 'more' });
    const parent = page.getByRole('menuitem', { name: '移动到', exact: true });
    check(`${mobile ? 'mobile' : 'desktop'} note menu items have leading icons`, await page.locator('.menu-more > [role="menuitem"]').evaluateAll(rows => rows.every(row => row.querySelector('.menu-icon svg') && row.querySelector('.menu-icon').getBoundingClientRect().left < row.querySelector('.menu-label').getBoundingClientRect().left)));
    if (mobile) await parent.tap(); else await parent.hover();
    const submenu = page.getByRole('menu', { name: '移动到', exact: true });
    await submenu.waitFor();
    check(`${mobile ? 'mobile' : 'desktop'} move opens submenu without dialog`, await page.locator('.modal-backdrop, .move-list').count() === 0);
    check(`${mobile ? 'mobile' : 'desktop'} submenu excludes smart and trash folders`, !await submenu.getByRole('menuitem', { name: '智能集合', exact: true }).count() && !await submenu.getByRole('menuitem', { name: '最近删除', exact: true }).count());
    check(`${mobile ? 'mobile' : 'desktop'} submenu remains inside viewport`, await submenu.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    await page.screenshot({ path: resolve(output, mobile ? 'mobile-submenu.png' : 'desktop-submenu.png') });
    if (!mobile) {
      await parent.focus(); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.submenu-surface')?.contains(document.activeElement));
      check('keyboard opens and enters submenu', await submenu.evaluate(e => e.contains(document.activeElement)));
      await page.keyboard.press('ArrowLeft');
      check('keyboard returns to parent menu', await submenu.isHidden() && await parent.evaluate(e => e === document.activeElement));
      await parent.click();
    }
    await submenu.getByRole('menuitem', { name: '工作项目', exact: true }).click();
    await idle(page);
    check(`${mobile ? 'mobile' : 'desktop'} selecting destination moves original note and closes menus`, backend.workspace.notes.find(n => n.id === 'note-a').folderId === 'move-target' && !await page.locator('.menu-more').count());
    check(`${mobile ? 'mobile' : 'desktop'} move retains note body`, (await state(page)).editorJSON.content.length > 0);
    if (!mobile) {
      // Exercise real toolbar event delivery, including exact target ID.
      await page.evaluate(async () => {
        const p = window.__DEBUG_PLATFORM__, toolbar = p.toolbarStates.at(-1);
        await p.emit('notes-ui://intent', { windowLabel: 'main', bindingId: 'synthetic-toolbar82', stateRevision: toolbar.revision, sequence: 100, intent: { kind: 'menu', owner: 'more', command: 'moveNote', folderId: 'default' } });
      });
      await idle(page);
      check('Mac native submenu event moves directly without old panel', backend.workspace.notes.find(n => n.id === 'note-a').folderId === 'default' && !await page.locator('.move-list').count());
      // Exercise recursive content-menu serialization and leaf routing.
      await page.evaluate(() => {
        const invoke = window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
        window.__TAURI_INTERNALS__.invoke = async (command, args) => {
          if (command === 'plugin:notes-ui|popup_menu') { window.menuRequest = args.request; return new Promise(resolve => window.replyMenu = resolve); }
          if (command === 'plugin:notes-ui|cancel_popup_menu') return;
          const result = await invoke(command, args);
          if (command.startsWith('plugin:notes-ui|') && result?.native) result.native.popupMenus = true;
          return result;
        };
      });
      await api(page, 'settings.update', { settings: { theme: 'dark' } }); await idle(page);
      await api(page, 'menu.open', { menu: 'more' });
      await page.waitForFunction(() => !!window.menuRequest);
      const request = await page.evaluate(() => window.menuRequest);
      const nested = request.items.find(e => e.kind === 'submenu' && e.label === '移动到');
      const leaf = nested.items.find(e => e.label === '工作项目');
      check('native content menu serializes submenu with SF Symbol and enabled leaf', nested.symbol === 'folder' && leaf.enabled && leaf.index !== nested.index);
      await page.evaluate(index => window.replyMenu(index), leaf.index); await idle(page);
      check('native content submenu leaf routes to original action', backend.workspace.notes.find(n => n.id === 'note-a').folderId === 'move-target');
    }
    check(`${mobile ? 'mobile' : 'desktop'} no page errors`, runtime.errors.length === 0);
  } catch (error) {
    await page.screenshot({ path: resolve(output, 'failure.png') });
    await saveJSON(resolve(output, 'failure.json'), { error: error.message, checks, state: await state(page), errors: runtime.errors }); throw error;
  } finally { await runtime.cleanup(); }
}
await saveJSON(resolve(output, 'result.json'), { status: 'pass', checks });
console.log(JSON.stringify({ status: 'pass', checks }, null, 2));
