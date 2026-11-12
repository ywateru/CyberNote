import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {openRuntime, api, idle, saveJSON} from './debug/runtime.mjs';

const output = resolve('artifacts/startup');
await mkdir(output, {recursive:true});
const checks = [];
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
  await page.reload({waitUntil:'commit'});
  await page.locator('.startup-logo').waitFor();
  await page.waitForFunction(() => !!window.__CYBERNOTE_STARTUP__);
  await page.evaluate(() => document.fonts.ready);
  check('Logo loader paints while the application bundle is pending', await page.locator('#startup').isVisible() && await page.locator('.app').count() === 0);
  check('Underlying UI is inert and loading status is announced', await page.locator('#root').evaluate(n => n.inert) && await page.locator('#startup').getAttribute('aria-busy') === 'true');
  const dash1 = await page.locator('.startup-trace').evaluate(n => getComputedStyle(n).strokeDashoffset);
  await page.waitForTimeout(120);
  const dash2 = await page.locator('.startup-trace').evaluate(n => getComputedStyle(n).strokeDashoffset);
  check('SVG perimeter actually animates', dash1 !== dash2);
  await page.screenshot({path:resolve(output,'loading-desktop.png')});
  if (process.argv.includes('--capture-animation')) {
    await mkdir(resolve(output,'frames'),{recursive:true});
    for (let i=0; i<20; i++) {
      await page.evaluate(time => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime=time; } }, i*140);
      await page.screenshot({path:resolve(output,'frames',`${String(i).padStart(2,'0')}.png`)});
    }
  }
  await page.emulateMedia({colorScheme:'dark'});
  await page.evaluate(() => window.__CYBERNOTE_STARTUP__.theme('system'));
  await page.screenshot({path:resolve(output,'loading-dark.png')});
  check('System appearance follows dark mode', await page.locator('#startup').evaluate(n=>getComputedStyle(n).backgroundColor)==='rgb(28, 28, 30)');
  await page.evaluate(() => window.__CYBERNOTE_STARTUP__.theme('light'));
  check('Explicit light appearance overrides dark system appearance', await page.locator('#startup').evaluate(n=>getComputedStyle(n).backgroundColor)==='rgb(247, 247, 249)');
  await page.emulateMedia({reducedMotion:'reduce'});
  check('Reduced motion disables both SVG animations', await page.locator('.startup-trace').evaluate(n=>getComputedStyle(n).animationName)==='none' && await page.locator('.startup-eyes').evaluate(n=>getComputedStyle(n).animationName)==='none');
  await page.emulateMedia({reducedMotion:'no-preference',colorScheme:'light'});
  release(); await page.unroute('**/app.js',hold); await ready();

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
  await page.screenshot({path:resolve(output,'ready-desktop.png')});

  backend.configure({fail:{load:100}});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#startup[data-state="error"]');
  check('Workspace failure stops the animation and exposes recovery', await page.getByRole('button',{name:'重新加载',exact:true}).isVisible() && await page.locator('#startup').getAttribute('aria-busy')==='false');
  await page.screenshot({path:resolve(output,'loading-error.png')});
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
  await saveJSON(resolve(output,'desktop-result.json'),{passed:true,checks,scope:runtime.metadata});
  console.log(JSON.stringify({passed:true,checks:checks.length,output},null,2));
} catch (error) {
  await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
  await saveJSON(resolve(output,'desktop-result.json'),{passed:false,error:error.message,checks,pageErrors:runtime.errors});
  throw error;
} finally { await runtime.cleanup(); }

const mobile = await openRuntime({bundleDebug:true,mobile:true});
try {
  mobile.backend.configure({delay:{load:1000}});
  await mobile.page.emulateMedia({reducedMotion:'reduce'});
  await mobile.page.reload({waitUntil:'domcontentloaded'});
  await mobile.page.locator('#startup').waitFor();
  await mobile.page.screenshot({path:resolve(output,'loading-mobile.png')});
  assert.ok(await mobile.page.locator('.startup-logo').evaluate(n=>n.getBoundingClientRect().width===88));
  await mobile.page.waitForSelector('#startup',{state:'detached'});
  assert.ok(await mobile.page.locator('#root').evaluate(n=>!n.inert));
  assert.equal(mobile.errors.length,0);
  await saveJSON(resolve(output,'mobile-result.json'),{passed:true,checks:['Mobile SVG sizing','Reduced-motion handoff','Interactive root','No uncaught browser errors'],scope:mobile.metadata});
  console.log('Mobile startup: 4 checks passed');
} finally { await mobile.cleanup(); }
