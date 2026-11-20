// Command-only regression: production TS, real ProseMirror state/history,
// startup in a VM, palette contrast and native/CSS contracts. Never opens UI.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { EditorState } from '@tiptap/pm/state';
import { history, undo, redo } from '@tiptap/pm/history';
import { getSchema } from '@tiptap/core';

const out = resolve('artifacts/appearance117');
await mkdir(out, { recursive: true });
const checks = [], contrasts = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const read = path => readFile(path, 'utf8');
const palettes = JSON.parse(await read('src/themes/palettes.json'));
const ids = ['classic', 'paper', 'high-contrast', 'ocean', 'forest', 'rose', 'lavender', 'graphite'];
assert.deepEqual(Object.keys(palettes), ids);
// Transpile only the production modules needed here. No alternate model.
const modules = ['themes/appearance', 'themes/registry', 'confirmed-settings', 'interface-details', 'presentation/model', 'native-toolbar-state', 'font-size', 'smart-folders', 'note-tags'];
for (const name of modules) {
  let source = await read(`src/${name}.ts`);
  source = source.replace(/import (\w+) from "(\.\.?\/[^"\n]+\.json)";/g, (_, local, path) => {
    const filename = resolve('src', dirname(name), path);
    return `const ${local} = ${JSON.stringify(filename)};`; // replaced below with the actual source JSON
  });
  for (const [local, path] of [...source.matchAll(/const (\w+) = "([^"]+\.json)";/g)].map(m => [m[1], m[2]])) {
    source = source.replace(`const ${local} = ${JSON.stringify(path)};`, `const ${local} = ${await read(path)};`);
  }
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/from (["'])(\.\.?\/[^"']+)\1/g, (_, q, path) => `from ${q}${path}.mjs${q}`);
  const path = resolve(out, 'modules', `${name}.mjs`);
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, code);
}
const load = name => import(pathToFileURL(resolve(out, 'modules', `${name}.mjs`)));
const { parseAppearance, appearanceOf, appearancePatch, applyAppearance, themeOptions } = await load('themes/appearance');
const { ConfirmedSettings } = await load('confirmed-settings');
const { toolbarState } = await load('native-toolbar-state');
assert.deepEqual(themeOptions.map(o => o.value), ids);
const appearance = (themeId, schemePreference) => ({ version: 2, themeId, schemePreference });
for (const id of ids) for (const scheme of ['system', 'light', 'dark']) {
  const a = appearance(id, scheme);
  assert.deepEqual(parseAppearance(a), a);
  assert.deepEqual(appearanceOf({ appearance: a, theme: 'dark' }), a);
  assert.equal(appearancePatch({ appearance: a }, { theme: 'light' }).appearance.themeId, id);
  const projection = toolbarState({ layout: 'threeColumn', sidebar: true, settings: { appearance: a }, folderTitle: '主题', folderCount: 3, query: '', searchAck: 0, available: true, editable: false, editor: null });
  assert.equal(projection.themeId, id); assert.equal(projection.appearance, scheme);
}
for (const value of [null, [], {}, appearance('unknown', 'dark'), { ...appearance('ocean', 'light'), css: 'red' }, { ...appearance('rose', 'light'), version: 3 }]) assert.throws(() => parseAppearance(value));
check('all eight IDs × three policies migrate/validate; unknown and extra fields reject', true);
const lum = hex => {
  const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
};
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
for (const id of ids) for (const scheme of ['light', 'dark']) {
  const p = palettes[id][scheme];
  assert.deepEqual(Object.keys(p).sort(), Object.keys(palettes.classic.light).sort());
  const pairs = ['paper', 'sidebar', 'grouped', 'desktop-list', 'desktop-toolbar', 'menu', 'selection', 'hover'].flatMap(bg => ['ink', 'secondary', 'action-ink', 'focus', 'danger'].map(fg => [fg, bg]));
  pairs.push(['accent-ink', 'accent'], ['notice-ink', 'notice-surface'], ['on-recording', 'recording'], ['selection-secondary', 'selection'], ['selection-action', 'selection']);
  for (const [fg, bg] of pairs) {
    const ratio = contrast(p[fg], p[bg]); contrasts.push({ id, scheme, fg, bg, ratio });
    check(`${id}/${scheme}: ${fg}/${bg} >= 4.5`, ratio >= 4.5);
  }
}
for (const scheme of ['light', 'dark']) {
  for (const surface of ['paper', 'sidebar', 'desktop-list', 'desktop-toolbar', 'selection', 'menu']) {
    check(`${scheme}: five new themes have distinct ${surface} colors`, new Set(ids.slice(3).map(id => palettes[id][scheme][surface])).size === 5);
  }
  check(`paper/${scheme}: toolbar and editor share warm paper`, palettes.paper[scheme].paper === palettes.paper[scheme]['desktop-toolbar']);
}
// Verify the actual generated AppKit lookup payload matches the palette.
const nativeRoles = ['desktop-toolbar', 'paper', 'line', 'ink', 'secondary', 'action-ink', 'selection', 'focus', 'desktop-list'];
const header = await read('plugins/tauri-plugin-notes-ui/macos/theme-palettes.h');
const rows = [...header.matchAll(/\{"([^"]+)", (YES|NO), \{([^}]+)\}\}/g)];
assert.equal(rows.length, 16);
for (const [, id, dark, values] of rows) assert.deepEqual(values.split(', ').map(v => v.toLowerCase()), nativeRoles.map(role => palettes[id][dark === 'YES' ? 'dark' : 'light'][role].replace('#', '0x').toLowerCase()));
const rust = await read('plugins/tauri-plugin-notes-ui/src/model.rs');
const variants = rust.match(/pub enum ThemeId \{([^}]+)\}/)[1].replace(/#\[default\]/g, '').split(',').map(v => v.trim()).filter(Boolean).map(v => v.replace(/[A-Z]/g, (v, i) => `${i ? '-' : ''}${v.toLowerCase()}`));
assert.deepEqual(variants, ids);
const archive = await read('src-tauri/src/store/archive.rs');
const guest = await read('plugins/tauri-plugin-notes-ui/guest-js/index.ts');
assert.deepEqual([...guest.match(/themeId\?: ([^;]+);/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]), ids);
const accepted = JSON.parse(archive.match(/a\.get\("themeId"\)[\s\S]*?(\[[\s\S]*?\])\s*\.contains/)[1].replace(/,\s*\]/g, "]"));
assert.deepEqual(accepted, ids);
check('AppKit payload, Rust enum, archive whitelist and registry agree on every theme', true);

// Settings publishing uses the real owner and partial merge against persisted authority.
const owner = new ConfirmedSettings(() => {}); owner.observe({ theme: 'dark' });
let db = { theme: 'dark' };
const persist = async patch => { db = { ...db, ...appearancePatch(db, patch) }; };
for (const id of ids) await owner.write({ appearance: appearance(id, 'dark') }, persist, async () => db);
await owner.write({ sort: 'title' }, persist, async () => db);
await owner.write({ theme: 'light' }, persist, async () => db);
assert.equal(owner.snapshot().appearance.themeId, 'graphite');
const before = owner.snapshot();
await assert.rejects(owner.write({ appearance: appearance('rose', 'dark') }, async () => { throw Error('disk full'); }, async () => db));
assert.equal(owner.snapshot(), before);
check('confirmed owner preserves skin across partial/legacy writes and failed persistence', true);

// Production startup code runs against a tiny DOM contract, never a browser.
const startup = await read('public/startup.js');
for (const id of ids) for (const scheme of ['light', 'dark', 'system']) {
  const elements = new Map(['startup', 'root', 'startup-message', 'startup-retry'].map(id => [id, { dataset: {}, setAttribute() {}, addEventListener() {} }]));
  const root = { dataset: {}, classList: { toggle() {} } };
  const storage = new Map([['cybernote.startup-appearance-v2', JSON.stringify(appearance(id, scheme))]]);
  let mediaChange; const media = { matches: false, addEventListener(_name, fn) { mediaChange = fn; } };
  const sandbox = { document: { documentElement: root, getElementById: id => elements.get(id), querySelector: () => null }, window: { addEventListener() {} }, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }, matchMedia: () => media, getComputedStyle: () => ({ getPropertyValue: () => '' }), setTimeout: () => 1, clearTimeout() {}, location: { reload() {} } };
  vm.runInNewContext(startup, sandbox);
  assert.equal(root.dataset.themeId, id);
  assert.equal(root.dataset.scheme, scheme === 'dark' ? 'dark' : 'light');
  media.matches = true; mediaChange();
  assert.equal(root.dataset.scheme, scheme === 'light' ? 'light' : 'dark');
}
check('startup cache supports all eight themes including system scheme changes without app bundle', true);

// Exercise real schema + history state, including a wrapped and nested task.
const { createEditorExtensions } = await import(pathToFileURL(resolve('artifacts/editor-schema/editor-schema.mjs')));
const schema = getSchema(createEditorExtensions({ attachment: () => {}, drawing: () => {} }));
const p = text => schema.nodes.paragraph.create(null, schema.text(text));
const item = (text, nested) => schema.nodes.taskItem.create({ checked: false }, [p(text), ...(nested ? [nested] : [])]);
const tasks = schema.nodes.taskList.create(null, [item('第一行与多行正文换行'), item('第二行', schema.nodes.taskList.create(null, [item('嵌套任务')])), item('第三行')]);
let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, [tasks]), plugins: [history()] });
const dispatch = tr => { state = state.apply(tr); };
dispatch(state.tr.setNodeMarkup(1, undefined, { checked: true }));
const checkedState = state;
const root = { dataset: {}, classList: { toggle() {} } }; let changes = 0;
globalThis.document = { documentElement: root, querySelector: selector => { assert.equal(selector, 'meta[name="theme-color"]'); return null; } };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() { changes++; } });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
for (const id of ids) for (const scheme of ['light', 'dark']) {
  applyAppearance(appearance(id, scheme))();
  assert.equal(state, checkedState);
  assert.equal(root.dataset.themeId, id);
}
assert.equal(changes, 16);
check('attribute-only projection leaves actual ProseMirror state/history identity intact', true);
assert.ok(undo(state, dispatch)); assert.equal(state.doc.nodeAt(1).attrs.checked, false);
assert.ok(redo(state, dispatch)); assert.equal(state.doc.nodeAt(1).attrs.checked, true);
check('checkbox transaction undo/redo keeps wrapped/nested task structure', state.doc.child(0).childCount === 3 && state.doc.child(0).child(1).child(1).type.name === 'taskList');

// Compile and parse actual CSS; inspect final declarations for the specific
// regressions. This is a source contract, not rendered geometry evidence.
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve('vite'))('postcss');
const sheets = await Promise.all(['src/style.css', 'src/desktop.css', 'src/Preferences.css', 'src/preferences-menu/PreferenceSelect.css'].map(read));
const parsed = sheets.map(css => postcss.parse(css));
const declarations = (selector, supportsLH = true) => {
  const result = {}; for (const css of parsed) css.walkRules(selector, rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (!supportsLH && parent.type === 'atrule' && parent.name === 'supports' && parent.params === '(height: 1lh)') return;
    }
    rule.walkDecls(d => { result[d.prop] = d.value; });
  }); return result;
};
assert.equal(declarations('.desktop .tiptap ul[data-type="taskList"] > li')['align-items'], 'flex-start');
assert.equal(declarations('.tiptap ul[data-type="taskList"] > li > label input')['border-radius'], '50%');
assert.equal(declarations('.mobile .tiptap ul[data-type="taskList"] > li > div > p')['min-height'], '0');
assert.equal(declarations('.mobile .tiptap ul[data-type="taskList"] > li')['min-height'], undefined);
const target = declarations('.mobile .tiptap ul[data-type="taskList"] > li > label::before');
assert.equal(target.right, '0'); assert.equal(target.height, 'min(44px, 1lh)');
assert.equal(declarations('.preferences-picker')['display'], 'inline-flex');
assert.equal(declarations('.preferences-row > .preferences-picker')['flex'], '0 1 auto');
assert.equal(declarations('.tiptap ul[data-type="taskList"] > li > label')['min-height'], '0');
check('CSS retains circles, first-line alignment, compact mobile paragraphs and bounded gutter hit target', true);

// Model an engine that rejects lh: skip the enhancement block, then evaluate
// the surviving production expressions against the editor's real line metrics.
const taskSelector = '.tiptap ul[data-type="taskList"] > li';
const labelSelector = `${taskSelector} > label`;
const hitSelector = `.mobile ${labelSelector}::before`;
const fallbackLabel = declarations(labelSelector, false);
const fallbackHit = declarations(hitSelector, false);
assert.ok(fallbackLabel.margin && !fallbackLabel.margin.includes('1lh'));
assert.ok(fallbackHit.height && !fallbackHit.height.includes('1lh'));
for (const css of parsed) css.walkDecls(decl => {
  if (!/\blh\b|\d+lh\b/.test(decl.value)) return;
  let guarded = false;
  for (let parent = decl.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'supports' && parent.params === '(height: 1lh)') guarded = true;
  }
  assert.ok(guarded, `lh declaration needs a feature guard: ${decl.toString()}`);
});
const length = (value, vars, font) => {
  const expression = value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, key, fallback) => `(${length(vars[key] ?? fallback, vars, font)})`)
    .replace(/([\d.]+)em\b/g, (_, n) => `(${Number(n) * font})`).replace(/px\b/g, '')
    .replace(/calc\(/g, '(').replace(/min\(/g, 'Math.min(');
  assert.match(expression, /^[\d\s.,()+*/-]+$|^Math\.min\([\d\s.,()+*/-]+\)$/);
  return vm.runInNewContext(expression, { Math });
};
const { fontSizeOptions } = await load('font-size');
for (const mode of ['base', 'mobile', 'desktop']) {
  const task = { ...declarations(taskSelector, false), ...(mode === 'base' ? {} : declarations(`.${mode} ${taskSelector}`, false)) };
  const lineSelector = mode === 'base' ? '.tiptap' : mode === 'mobile' ? '.mobile .tiptap' : '.desktop .note-document .tiptap';
  const lineHeight = Number(declarations(lineSelector, false)['line-height']);
  for (const { editor: font } of fontSizeOptions) {
    const vars = { ...task, '--editor-font-scale': String(font / 18) };
    const firstLine = lineHeight * font;
    const circle = length(task['--task-circle'], vars, font);
    const offset = length(fallbackLabel.margin.replace(/ 0 0$/, ''), vars, font);
    assert.ok(Math.abs(offset + circle / 2 - firstLine / 2) < 1e-8, `${mode}/${font}: circle centered on first line without lh`);
    if (mode === 'mobile') {
      const hit = length(fallbackHit.height, vars, font);
      const top = offset + circle / 2 - hit / 2;
      const bottom = top + hit;
      assert.ok(hit > 0 && hit <= 44 && top >= -1e-8 && bottom <= firstLine + 1e-8, `${font}: gutter target stays inside first line`);
      assert.equal(fallbackHit.right, '0'); assert.equal(length(fallbackHit.width, vars, font), 44);
      assert.ok(bottom <= Math.max(firstLine, offset + circle) + 1e-8, `${font}: next compact row cannot overlap`);
    }
  }
}
check('legacy engines retain first-line circle alignment and nonoverlapping gutter targets at all five font sizes', true);

await writeFile(resolve(out, 'result.json'), JSON.stringify({ checks, contrasts, scope: 'No UI/browser/native runtime; production TS + schema/history + startup VM + native payload/CSS contracts. Rust execution recorded separately.' }, null, 2) + '\n');
console.log(`PASS ${checks.length} checks (${contrasts.length} contrast pairs); ${relative(process.cwd(), out)}/result.json`);
