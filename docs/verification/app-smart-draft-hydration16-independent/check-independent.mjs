// Actual production draft adapter and React form; isolated in-memory callbacks only.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';

const out = resolve(process.argv[2]);
await mkdir(out, { recursive: false });
const hashes = {};
for (const path of ['src/smart-draft.ts', 'src/SmartFolderForm.tsx', 'src/smart-folders.css', 'docs/verification/app-smart-draft-hydration16/check-hydration.mjs'])
  hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
const baselineDraft=(await readFile('docs/verification/app-smart-draft-hydration16/baseline-smart-draft.ts','utf8')).replaceAll('\"./note-tags\"','\"/src/note-tags\"').replaceAll('\"./smart-folders\"','\"/src/smart-folders\"');
const entry = `import{folderDraft as baselineFolderDraft}from'/__baseline.ts';import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{SmartFolderForm}from'/src/SmartFolderForm.tsx';import{folderDraft,draftQuery}from'/src/smart-draft.ts';import{matchesSmart}from'/src/smart-folders.ts';import'/src/style.css';
window.adapter={folderDraft,draftQuery,matchesSmart,baselineFolderDraft};const root=createRoot(document.getElementById('root'));let key=0;
window.mountForm=(mobile,folder,behavior={})=>{window.inputFolder=folder;window.inputBefore=structuredClone(folder);window.events={cancels:0,saves:[]};document.getElementById('root').className=mobile?'app mobile':'app desktop native-toolbar';flushSync(()=>root.render(React.createElement(SmartFolderForm,{key:++key,mobile,folder,catalog:['校准','保留'],onCancel:()=>window.events.cancels++,onSave:async(draft,committedId)=>{window.events.saves.push({draft:structuredClone(draft),query:draftQuery(draft),committedId:committedId??null});if(behavior.failOnce&&window.events.saves.length===1){const error=new Error('独审模拟保存冲突，草稿应保留');error.code='smart_conflict';throw error;}return{id:folder.id,complete:true}},onRefresh:async()=>{throw Error('Backend disabled in hydration fixture')},onHandle:handle=>window.formHandle=handle})));};window.fixtureReady=true;`;
const vite = await createViteServer({ configFile: false, cacheDir: resolve(out, 'vite-cache'), plugins: [{ name: 'isolated-hydration', resolveId(id) { if(id==='/__baseline.ts')return id; if (id === '/__hydration.tsx') return id; }, load(id) { if(id==='/__baseline.ts')return baselineDraft; if (id === '/__hydration.tsx') return entry; } }, react()], server: { middlewareMode: true, hmr: false, watch: { ignored: ['**/src-tauri/target/**', '**/artifacts/**', '**/docs/verification/**'] } }, appType: 'custom' });
const server = createServer((req, res) => {
  if (req.url === '/__hydration') { res.setHeader('content-type', 'text/html'); vite.transformIndexHtml(req.url, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__hydration.tsx"></script></html>').then(html => res.end(html)); }
  else vite.middlewares(req, res);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH));
const result = { scope: 'Production adapter and actual production React form, isolated callbacks in local headless Chromium. No backend, database, App bridge, native GUI, device, or installed-package acceptance.', hashes, truth: [], forms: [], independent: [], errors: [], externalRequests: [] };
let browser;
const folder = (value, mixed, combine) => ({ id: `hydration-${value}-${mixed}-${combine}`, name: '原有智能文件夹', kind: 'smart', parentId: null, sortOrder: 3, createdAt: 17, definitionRevision: 9, query: { version: 1, combine, rules: [...(mixed ? [{ type: 'tags', mode: 'allSelected', names: ['校准', '保留'] }] : []), { type: 'pinned', value }] } });
function check(record, label, actual, expected) {
  try { assert.deepEqual(actual, expected); record.checks.push({ label, passed: true }); }
  catch (error) { record.checks.push({ label, passed: false, actual, expected, error: String(error) }); }
}
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1088, height: 844 }, deviceScaleFactor: 2 });
  await context.route('**/*', route => { if (route.request().url().startsWith(origin + '/')) return route.continue(); result.externalRequests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => result.errors.push(String(e)));
  await page.goto(origin + '/__hydration'); await page.waitForFunction(() => window.fixtureReady);
  for (const value of [false, true]) for (const mode of [null, 'allSelected', 'anySelected', 'anyTag', 'noTags']) for (const combine of ['all', 'any']) {
    const f = folder(value, !!mode, combine);
    if (mode) f.query.rules[0] = { type: 'tags', mode, ...(['allSelected', 'anySelected'].includes(mode) ? { names: ['校准', '保留'] } : {}) };
    const row = { name: `${value}-${mode ?? 'pinned-only'}-${combine}`, checks: [] };
    const state = await page.evaluate(f => {
      const { folderDraft, draftQuery, matchesSmart } = window.adapter, before = structuredClone(f), d = folderDraft(f), query = draftQuery(d), pin = d.rules.find(r => r.type === 'pinned');
      const facts = [false, true].flatMap(pinned => [null, [], ['校准'], ['校准', '保留']].flatMap(tags => [false, true].map(eligible => ({ pinned, tags, eligible }))));
      const membership = facts.map(facts => [matchesSmart(f.query, facts), matchesSmart(query, facts)]);
      const tag = d.rules.find(r => r.type === 'tags'); if (tag) tag.names.push('草稿独有');
      return { pinned: pin.pinned, query, id: d.id, revision: d.expectedDefinitionRevision, combine: d.combine, inputUnchanged: JSON.stringify(f) === JSON.stringify(before), membership };
    }, f);
    check(row, 'explicit boolean hydrated', state.pinned, value); check(row, 'query round trip', state.query, f.query);
    check(row, 'identity revision combine retained', [state.id, state.revision, state.combine], [f.id, 9, combine]);
    check(row, 'tag names cloned and input unchanged', state.inputUnchanged, true);
    check(row, 'membership retained across 16 facts', state.membership.every(([a, b]) => a === b), true);
    result.truth.push(row);
  }
  const mount = async (mobile, f) => { await page.setViewportSize({ width: mobile ? 390 : 1088, height: 844 }); await page.evaluate(({ mobile, f }) => window.mountForm(mobile, f), { mobile, f }); await page.getByRole('dialog', { name: '编辑智能文件夹', exact: true }).waitFor(); };
  const openRules = async mobile => { if (mobile) await page.getByRole('button', { name: /过滤条件/ }).click(); };
  const pinValue = () => page.getByRole('combobox', { name: '置顶模式', exact: true }).inputValue();
  const cancel = () => page.getByRole('button', { name: '取消', exact: true }).click();
  const submit = mobile => page.getByRole('button', { name: mobile ? '保存文件夹' : '好', exact: true }).click();
  for (const mobile of [false, true]) for (const value of [false, true]) for (const mixed of [false, true]) for (const combine of ['all', 'any']) {
    const f = folder(value, mixed, combine), row = { name: `${mobile ? 'mobile' : 'desktop'}-${value}-${mixed ? 'mixed' : 'pinned-only'}-${combine}`, checks: [], input: f };
    await mount(mobile, f); await openRules(mobile);
    check(row, 'reopened UI selected value', await pinValue(), String(value));
    check(row, 'reopened combination', await page.getByRole('combobox', { name: '组合过滤条件', exact: true }).inputValue(), combine);
    if (!value && mixed && combine === 'all') await page.screenshot({ path: resolve(out, `${mobile ? 'mobile' : 'desktop'}-persisted-false.png`) });
    // Rename from a fresh mount: mobile does not need to visit the filter panel to corrupt a draft.
    await mount(mobile, f); await page.getByRole('textbox', { name: '名称', exact: true }).fill('只改名称-R1'); await submit(mobile);
    await page.getByRole('dialog', { name: '同步文件夹', exact: true }).waitFor();
    const saved = await page.evaluate(() => window.events.saves[0]); row.saved = saved;
    check(row, 'rename-only submit query preserved', saved.query, f.query);
    check(row, 'rename-only submit identity retained', [saved.draft.id, saved.draft.expectedDefinitionRevision, saved.draft.name, saved.committedId], [f.id, 9, '只改名称-R1', null]);
    check(row, 'one save and no cancel', await page.evaluate(() => [window.events.saves.length, window.events.cancels]), [1, 0]);
    check(row, 'save did not mutate input definition', await page.evaluate(() => JSON.stringify(window.inputFolder) === JSON.stringify(window.inputBefore)), true);
    const persisted = { ...f, name: saved.draft.name, query: saved.query, definitionRevision: 10 };
    await mount(mobile, persisted); await openRules(mobile);
    check(row, 'reopen simulated saved definition selected value', await pinValue(), String(value));
    // Mobile panel cancel must discard a changed boolean and tags before opening it again.
    if (mobile) {
      await page.getByRole('combobox', { name: '置顶模式', exact: true }).selectOption(String(!value));
      if (mixed) await page.getByRole('button', { name: '#校准', exact: true }).click();
      await cancel(); await openRules(true);
      check(row, 'panel cancel restores persisted boolean', await pinValue(), String(value));
      if (mixed) check(row, 'panel cancel restores selected tag', await page.getByRole('button', { name: '#校准', exact: true }).getAttribute('class'), 'selected');
      await page.getByRole('button', { name: '确认过滤条件', exact: true }).click();
      await openRules(true); check(row, 'confirm unchanged panel retains boolean', await pinValue(), String(value)); await cancel();
    }
    // Outer cancel after visible edits must not call persistence.
    await mount(mobile, f); await page.getByRole('textbox', { name: '名称', exact: true }).fill('取消不保存'); await openRules(mobile);
    await page.getByRole('combobox', { name: '置顶模式', exact: true }).selectOption(String(!value));
    if (mobile) await page.getByRole('button', { name: '确认过滤条件', exact: true }).click();
    await cancel();
    check(row, 'outer cancel submits nothing', await page.evaluate(() => [window.events.saves.length, window.events.cancels]), [0, 1]);
    check(row, 'cancel does not mutate input', await page.evaluate(() => JSON.stringify(window.inputFolder) === JSON.stringify(window.inputBefore)), true);
    await mount(mobile, f); await openRules(mobile); check(row, 'reopen after outer cancel', await pinValue(), String(value));
    result.forms.push(row);
  }

  // Independent baseline counterexample, strict invalid-value gate, and save-conflict retry.
  const counter={name:'independent-baseline-false-counterexample',checks:[]};
  const contrast=await page.evaluate(f=>{const a=window.adapter,old=a.folderDraft===a.baselineFolderDraft;const d0=a.baselineFolderDraft(f),d1=a.folderDraft(f);return{sameFunction:old,old:a.draftQuery(d0),current:a.draftQuery(d1),input:f.query}},folder(false,false,'all'));
  check(counter,'baseline reproduces false becoming true',contrast.old.rules,[{type:'pinned',value:true}]);check(counter,'current preserves explicit false',contrast.current,contrast.input);check(counter,'independent baseline adapter is distinct',contrast.sameFunction,false);result.independent.push(counter);
  const strict={name:'independent-invalid-values-still-rejected',checks:[]};
  const rejects=await page.evaluate(f=>{const a=window.adapter,values=['false','true',0,1,null,{},[]],cases=[];
    for(const value of values){const bad=structuredClone(f);bad.query.rules=[{type:'pinned',value}];cases.push({label:'nonBoolean-'+JSON.stringify(value),draft:a.folderDraft(bad)})}
    for(const combine of [['all'],['any'],null,{}]){const bad=structuredClone(f);bad.query.combine=combine;cases.push({label:'invalid-combine-'+JSON.stringify(combine),draft:a.folderDraft(bad)})}
    const empty=a.folderDraft(f);empty.rules.unshift({key:2,type:'tags',mode:'allSelected',names:[],pinned:true});cases.push({label:'empty-selected-tags',draft:empty});
    const date=a.folderDraft(f);date.rules.unshift({key:3,type:'creationDate',period:'today',mode:'allSelected',names:[],pinned:true});cases.push({label:'unsupported-date',draft:date});
    const duplicate=a.folderDraft(f);duplicate.rules.push({...duplicate.rules[0],key:4});cases.push({label:'duplicate-pinned',draft:duplicate});
    return cases.map(({label,draft})=>{try{a.draftQuery(draft);return{label,rejected:false}}catch(e){return{label,rejected:true,code:e.code}}})
  },folder(false,false,'all'));
  for(const item of rejects)check(strict,item.label,[item.rejected,item.code],[true,'smart_invalid']);result.independent.push(strict);
  for(const mobile of [false,true])for(const value of [false,true]){
    const f=folder(value,true,'any'),row={name:`independent-${mobile?'mobile':'desktop'}-${value}-conflict-retry`,checks:[]};
    await page.setViewportSize({width:mobile?390:1088,height:844});await page.evaluate(({mobile,f})=>window.mountForm(mobile,f,{failOnce:true}),{mobile,f});await page.getByRole('dialog',{name:'编辑智能文件夹',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'名称',exact:true}).fill('仅改名称-冲突后重试');await submit(mobile);await page.getByRole('alert').waitFor();
    const first=await page.evaluate(()=>window.events.saves[0]);check(row,'rejected save keeps original query',first.query,f.query);check(row,'rejected save keeps id revision',[first.draft.id,first.draft.expectedDefinitionRevision],[f.id,9]);
    check(row,'error stays editable rather than sync panel',await page.getByRole('dialog',{name:'编辑智能文件夹',exact:true}).count(),1);check(row,'visible draft name retained',await page.getByRole('textbox',{name:'名称',exact:true}).inputValue(),'仅改名称-冲突后重试');
    await submit(mobile);await page.getByRole('dialog',{name:'同步文件夹',exact:true}).waitFor();const events=await page.evaluate(()=>window.events);
    check(row,'retry preserves query',events.saves[1].query,f.query);check(row,'retry identity revision retained',[events.saves[1].draft.id,events.saves[1].draft.expectedDefinitionRevision],[f.id,9]);check(row,'two attempts no cancellation',[events.saves.length,events.cancels],[2,0]);check(row,'input remains immutable',await page.evaluate(()=>JSON.stringify(window.inputFolder)===JSON.stringify(window.inputBefore)),true);result.independent.push(row);
  }
  assert.deepEqual(result.errors, []); assert.deepEqual(result.externalRequests, []);
  const failed = [...result.truth, ...result.forms, ...result.independent].flatMap(row => row.checks.filter(c => !c.passed).map(c => ({ case: row.name, ...c })));
  result.summary = { truthCases: result.truth.length, formCases: result.forms.length, independentCases: result.independent.length, assertions: [...result.truth, ...result.forms, ...result.independent].reduce((n, r) => n + r.checks.length, 0), failed: failed.length };
  result.failures = failed; result.status = failed.length ? 'fail' : 'pass';
} catch (error) { result.status = 'error'; result.failure = String(error); process.exitCode = 1; }
finally { await writeFile(resolve(out, 'result.json'), JSON.stringify(result, null, 2) + '\n'); await browser?.close(); await new Promise(done => server.close(done)); await vite.close(); }
console.log(JSON.stringify({ status: result.status, ...result.summary, failure: result.failure }));
if (result.status !== 'pass') process.exitCode = 1;
