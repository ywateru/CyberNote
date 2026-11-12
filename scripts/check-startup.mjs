import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {openRuntime, api, idle, saveJSON} from './debug/runtime.mjs';

let outputArgument, captureAnimation = false;
for (let i=2; i<process.argv.length; i++) {
  const argument = process.argv[i];
  if (argument === '--capture-animation' && !captureAnimation) captureAnimation = true;
  else if (argument === '--output' && !outputArgument && process.argv[i+1] && !process.argv[i+1].startsWith('--')) outputArgument = process.argv[++i];
  else throw Error('Usage: node scripts/check-startup.mjs [--output FRESH_DIRECTORY] [--capture-animation]');
}
const output = resolve(outputArgument || `artifacts/startup-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await mkdir(dirname(output), {recursive:true});
await mkdir(output); // Never overwrite earlier successful or failed evidence.
const deadline = async (promise, ms, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label} timed out after ${ms}ms`)),ms);})]); }
  finally { clearTimeout(timer); }
};
// Chrome DevTools Protocol Page.captureScreenshot captures the actual viewport
// without Playwright screenshot's document.fonts.ready wait. In Chrome 157 that
// promise depends on the deliberately held module/document load, even when
// FontFaceSet.status is already 'loaded'. CDP protocol documentation:
// https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot
const screenshot = async (page, path) => {
  const session = await deadline(page.context().newCDPSession(page), 5000, 'CDP attachment');
  try {
    const {data} = await deadline(session.send('Page.captureScreenshot', {format:'png',fromSurface:true,captureBeyondViewport:false}),10000,'CDP screenshot');
    await writeFile(path,Buffer.from(data,'base64'));
  } finally { await deadline(session.detach(),2000,'CDP detach'); }
};
const checks = [];
const observations = {screenshotCapture:'CDP Page.captureScreenshot', fontWait:'FontFaceSet.status with bounded rAF polling; no document.fonts.ready'};
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
const runtime = await openRuntime({bundleDebug:true, nativeToolbar:true});
const {page, backend} = runtime;
const ready = async () => {
  await page.waitForSelector('#startup', {state:'detached'});
  await page.waitForFunction(() => !!window.__NOTES_DEBUG__);
  await idle(page);
};
try {
  check('Normal startup releases the accessible, interactive root', await page.locator('#root').evaluate(n => !n.inert && !n.hasAttribute('aria-hidden') && !n.hasAttribute('aria-busy')));
  // Gate the application module: this proves the loader paints before React.
  let release;
  const gate = new Promise(done => { release = done; });
  const hold = async route => { await gate; await route.continue(); };
  await page.route('**/app.js', hold);
  try {
  await page.reload({waitUntil:'commit'});
  await page.locator('.startup-logo').waitFor();
  await page.waitForFunction(() => !!window.__CYBERNOTE_STARTUP__);
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, {timeout:5000,polling:'raf'});
  // Require two further painted frames while the module remains gated. The
  // explicit deadline also bounds rAF if the page stops rendering.
  await deadline(page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))),5000,'Gated paint frames');
  observations.gated = await page.evaluate(() => ({readyState:document.readyState,fontStatus:document.fonts.status,applicationMounted:!!document.querySelector('.app')}));
  check('Fonts reach loaded status before the gated application completes document load', observations.gated.fontStatus==='loaded' && observations.gated.readyState!=='complete' && !observations.gated.applicationMounted);
  check('Logo loader paints while the application bundle is pending', await page.locator('#startup').isVisible() && await page.locator('.app').count() === 0);
  check('Underlying UI is inert and loading status is announced', await page.locator('#root').evaluate(n => n.inert) && await page.locator('#startup').getAttribute('aria-busy') === 'true');
  const dash1 = await page.locator('.startup-trace').evaluate(n => getComputedStyle(n).strokeDashoffset);
  await page.waitForTimeout(120);
  const dash2 = await page.locator('.startup-trace').evaluate(n => getComputedStyle(n).strokeDashoffset);
  check('SVG perimeter actually animates', dash1 !== dash2);
  await screenshot(page,resolve(output,'loading-desktop.png'));
  if (captureAnimation) {
    await mkdir(resolve(output,'frames'),{recursive:true});
    for (let i=0; i<20; i++) {
      await page.evaluate(time => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime=time; } }, i*140);
      await screenshot(page,resolve(output,'frames',`${String(i).padStart(2,'0')}.png`));
    }
  }
  await page.emulateMedia({colorScheme:'dark'});
  await page.evaluate(() => window.__CYBERNOTE_STARTUP__.theme('system'));
  await screenshot(page,resolve(output,'loading-dark.png'));
  check('System appearance follows dark mode', await page.locator('#startup').evaluate(n=>getComputedStyle(n).backgroundColor)==='rgb(28, 28, 30)');
  await page.evaluate(() => window.__CYBERNOTE_STARTUP__.theme('light'));
  check('Explicit light appearance overrides dark system appearance', await page.locator('#startup').evaluate(n=>getComputedStyle(n).backgroundColor)==='rgb(247, 247, 249)');
  await page.emulateMedia({reducedMotion:'reduce'});
  check('Reduced motion disables both SVG animations', await page.locator('.startup-trace').evaluate(n=>getComputedStyle(n).animationName)==='none' && await page.locator('.startup-eyes').evaluate(n=>getComputedStyle(n).animationName)==='none');
  await page.emulateMedia({reducedMotion:'no-preference',colorScheme:'light'});
  } finally {
    // Even failed assertions/capture must release this route before cleanup.
    release();
    await deadline(page.unroute('**/app.js',hold),5000,'Application route release');
  }
  await ready();

  backend.configure({delay:{load:1600}});
  await page.reload({waitUntil:'domcontentloaded'});
  check('Workspace loading keeps splash visible', await page.locator('#startup').isVisible());
  check('Native toolbar does not bind an empty initial workspace', await page.evaluate(()=>window.__DEBUG_PLATFORM__.toolbarStates.length===0));
  await ready();
  check('Handoff includes restored editor and native toolbar', await page.locator('.app.native-toolbar').count()===1 && await page.locator('.ProseMirror').count()>0);
  backend.configure({delay:{load:0}});
  await api(page,'note.select',{id:'note-b'}); await idle(page);
  await api(page,'settings.open'); await idle(page);
  await api(page,'modal.cancel'); await idle(page);
  check('Switching notes and opening settings never restarts the splash', await page.locator('#startup').count()===0);
  await screenshot(page,resolve(output,'ready-desktop.png'));

  backend.configure({fail:{load:100}});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#startup[data-state="error"]');
  check('Workspace failure stops the animation and exposes recovery', await page.getByRole('button',{name:'重新加载',exact:true}).isVisible() && await page.locator('#startup').getAttribute('aria-busy')==='false');
  await screenshot(page,resolve(output,'loading-error.png'));
  backend.configure({fail:{load:0}});
  await page.getByRole('button',{name:'重新加载',exact:true}).click(); await ready();
  check('Recovery reload initializes the real workspace successfully', await page.locator('.ProseMirror').count()>0);

  const abort = route => route.abort();
  await page.route('**/app.js',abort);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#startup[data-state="error"]');
  check('A missing application bundle has an independent retry UI', await page.getByRole('button',{name:'重新加载',exact:true}).isVisible());
  await page.unroute('**/app.js',abort);
  await page.getByRole('button',{name:'重新加载',exact:true}).click(); await ready();

  // Empty and locked workspaces must not wait forever for an editor.
  backend.workspace.notes=[]; backend.workspace.settings.selectedNote='';
  await page.reload({waitUntil:'domcontentloaded'}); await ready();
  check('An empty workspace completes startup without an editor', await page.locator('.editor-empty').isVisible());
  check('No uncaught browser errors', runtime.errors.length===0);
  await saveJSON(resolve(output,'desktop-result.json'),{passed:true,checks,scope:runtime.metadata,observations});
  console.log(JSON.stringify({passed:true,checks:checks.length,output},null,2));
} catch (error) {
  await screenshot(page,resolve(output,'failure.png')).catch(()=>{});
  await saveJSON(resolve(output,'desktop-result.json'),{passed:false,error:error.message,checks,pageErrors:runtime.errors,observations});
  throw error;
} finally { await runtime.cleanup(); }

const mobile = await openRuntime({bundleDebug:true,mobile:true});
try {
  mobile.backend.configure({delay:{load:1000}});
  await mobile.page.emulateMedia({reducedMotion:'reduce'});
  await mobile.page.reload({waitUntil:'domcontentloaded'});
  await mobile.page.locator('#startup').waitFor();
  await screenshot(mobile.page,resolve(output,'loading-mobile.png'));
  assert.ok(await mobile.page.locator('.startup-logo').evaluate(n=>n.getBoundingClientRect().width===88));
  await mobile.page.waitForSelector('#startup',{state:'detached'});
  assert.ok(await mobile.page.locator('#root').evaluate(n=>!n.inert));
  assert.equal(mobile.errors.length,0);
  await saveJSON(resolve(output,'mobile-result.json'),{passed:true,checks:['Mobile SVG sizing','Reduced-motion handoff','Interactive root','No uncaught browser errors'],scope:mobile.metadata});
  console.log('Mobile startup: 4 checks passed');
} finally { await mobile.cleanup(); }
