import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs';
const output = fileURLToPath(new URL('.', import.meta.url));
const baseline = execFileSync('git', ['show', '87e538c4577483c8756aa49445f47b24badd98ff:src/style.css'], { encoding: 'utf8' });
const candidate = await readFile('src/style.css', 'utf8');
const app = await readFile('src/App.tsx', 'utf8');
const section = app.match(/<div className="search-zero-section">备忘录<\/div>/g);
assert.equal(section?.length, 1);
const zeroMarkup = section[0].replace('className=', 'class=');
const hash = value => createHash('sha256').update(value).digest('hex');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
const report = { browser: browser.version(), platform: process.platform, dpr: 2, viewport: { width: 1088, height: 660 }, baselineCommit: '87e538c4577483c8756aa49445f47b24badd98ff', baselineCssSha256: hash(baseline), candidateCssSha256: hash(candidate), boundaries: [], weights: [], limitations: ['Production CSS and exact zero-section JSX text rendered in a three-column fixture; not a mounted App.', 'Headless Chrome typography differs from native AppKit and WKWebView; no original font or pixel acceptance.', 'Excluded classes are deliberately given a zero-section fixture to exercise stylesheet scope, not claim that App renders those combinations.'] };
const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: report.dpr });
async function render(css, classes, kind = 'zero', extra = '') {
  const markup = kind === 'zero' ? zeroMarkup : '<div class="date-section">今天</div>';
  await page.setContent(`<style>${css}</style><style>${extra}</style><div class="app ${classes}" style="--sidebar-width:228px;--list-width:280px;--native-top:52px"><aside class="sidebar"></aside><section class="notes-pane"><div class="notes-scroll">${markup}</div></section><section class="editor-pane"></section></div>`);
  await page.evaluate(() => document.fonts.ready);
  return page.locator(kind === 'zero' ? '.search-zero-section' : '.date-section').evaluate(el => {
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { style: Object.fromEntries([...style].map(key => [key, style.getPropertyValue(key)])), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, visible: !!el.getClientRects().length };
  });
}
try {
  for (const [name, classes, kind, target] of [
    ['native-visible-list-zero', 'desktop native-toolbar', 'zero', true],
    ['native-hidden-sidebar-zero', 'desktop native-toolbar sidebar-hidden', 'zero', false],
    ['desktop-fallback-zero', 'desktop', 'zero', false],
    ['mobile-zero-fixture', 'mobile', 'zero', false],
    ['gallery-browse-zero-fixture', 'desktop native-toolbar gallery-browse', 'zero', false],
    ['gallery-edit-zero-fixture', 'desktop native-toolbar gallery-edit', 'zero', false],
    ['independent-zero-fixture', 'desktop native-toolbar separate', 'zero', false],
    ['ordinary-list-date-section', 'desktop native-toolbar', 'date', false],
  ]) {
    const before = await render(baseline, classes, kind);
    const after = await render(candidate, classes, kind);
    const differences = Object.keys(after.style).filter(key => before.style[key] !== after.style[key]).map(key => ({ property: key, before: before.style[key], after: after.style[key] }));
    assert.deepEqual(after.rect, before.rect, name + ': element geometry changed');
    assert.equal(after.visible, before.visible, name + ': visibility changed');
    if (!target) assert.deepEqual(differences, [], name + ': excluded state style changed');
    else assert(differences.every(({property}) => ['font-weight', 'padding-top', 'padding-block-start'].includes(property)), JSON.stringify(differences));
    report.boundaries.push({ name, pass: true, beforeRect: before.rect, afterRect: after.rect, visible: after.visible, differences });
  }
  await render(baseline, 'desktop native-toolbar');
  await page.locator('.search-zero-section').screenshot({ path: output + 'baseline-600.png' });
  for (const weight of [600, 650, 700]) {
    const result = await render(candidate, 'desktop native-toolbar', 'zero', `.search-zero-section { font-weight:${weight} !important; }`);
    const path = `candidate-${weight}.png`;
    await page.locator('.search-zero-section').screenshot({ path: output + path });
    report.weights.push({ weight, path, computedFontFamily: result.style['font-family'], computedWeight: result.style['font-weight'], paddingTop: result.style['padding-top'], lineHeight: result.style['line-height'], rect: result.rect });
  }
  await writeFile(output + 'diagnostic.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ boundaryTests: report.boundaries.length, allPass: true, weights: report.weights, browser: report.browser, limitations: report.limitations }, null, 2));
} finally { await browser.close(); }
