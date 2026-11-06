import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { FakeBackend, rustBackend, installBrowserPlatform } from './platform.mjs';

const playwrightDefault = '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs';
const chromeDefault = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export async function openRuntime(options = {}) {
  const root = resolve(options.root || process.cwd());
  const directory = await mkdtemp(resolve(options.tmp || tmpdir(), 'notes-debug70-'));
  let browser, context, vite, server, backend; const errors = [], sockets = new Set();
  const cleanup = async ({ keep = options.keep } = {}) => { await context?.close(); await browser?.close(); for (const socket of sockets) socket.destroy(); await vite?.close(); await new Promise((done) => { if (!server) return done(); server.close(done); server.closeAllConnections(); }); await backend?.close(); if (!keep) await rm(directory, { recursive: true, force: true }); };
  try {
    backend = options.transport ? await rustBackend(resolve(options.transport), options.storeDirectory ? resolve(options.storeDirectory) : directory) : new FakeBackend(directory);
    const production = options.production && resolve(root, options.production);
    const html = '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
    server = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
        if (pathname === '/__debug_ipc' || pathname === '/__debug_control') {
          let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 20 * 1024 * 1024) throw Error('Bounded fixture IPC payload exceeded'); }
          const input = JSON.parse(body); const value = pathname === '/__debug_control' ? await backend.configure(input) : await backend.call(input.command, input.args);
          response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); return;
        }
        if (production) {
          const path = resolve(production, '.' + (pathname === '/' ? '/index.html' : pathname)); if (path !== production && !path.startsWith(production + '/')) throw Error('Invalid static path');
          response.setHeader('content-type', { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); return;
        }
        if (pathname === '/') { response.setHeader('content-type', 'text/html'); response.end(await vite.transformIndexHtml('/', html)); return; }
        vite.middlewares(request, response);
      } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: String(error) })); }
    });
    server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    if (!production) vite = await createViteServer({ root, configFile: false, cacheDir: resolve(directory, 'vite-cache'), optimizeDeps: { include: ['react-dom', 'react-dom/client'] }, plugins: [react({ exclude: /\/(?:node_modules|vite-cache)\// })], define: { 'import.meta.env.VITE_NOTES_DEBUG': JSON.stringify(options.enabled === false ? '0' : '1') }, server: { middlewareMode: true, hmr: { server } }, appType: 'custom' });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }); const origin = 'http://127.0.0.1:' + server.address().port;
    const playwrightPath = options.playwright || process.env.PLAYWRIGHT_CORE_PATH || playwrightDefault; if (!existsSync(playwrightPath)) throw Error('Set PLAYWRIGHT_CORE_PATH to an installed playwright-core; no dependencies are installed by this runner.');
    const { chromium } = await import(pathToFileURL(playwrightPath));
    browser = await chromium.launch({ executablePath: options.chrome || process.env.CHROME_PATH || chromeDefault, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling'] });
    const viewport = options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    context = await browser.newContext({ viewport, ...(options.mobile ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' } : {}) });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', (error) => errors.push(String(error)));
    await page.route('**/*', (route) => route.request().url().startsWith(origin) || /^(data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
    await page.addInitScript(installBrowserPlatform, { mobile: !!options.mobile });
    await page.goto(origin + '/?notesDebug=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (options.enabled === false || production) await page.waitForSelector('.app');
    else { await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1); await idle(page); }
    const reset = async () => { if (!backend.reset) throw Error('Scenario reset requires default isolated fixture; use separate CLI scripts with external transport.'); backend.reset(); await page.reload(); await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1); await idle(page); };
    return { root, directory, origin, page, mobile: !!options.mobile, viewport, backend, errors, cleanup, reset, metadata: { platform: options.mobile ? 'mobile-browser' : 'desktop-browser', backend: backend.kind, media: 'fixed 440Hz PCM/WAV synthetic device; real AudioContext decode and production RecordingPcm accumulation', native: 'IPC/window/quit/OCR/dialog/clipboard simulated; no OS/TCC/real microphone or Rust Store proof by default', browser: await browser.version(), viewport } };
  } catch (error) { await cleanup({ keep: options.keep }); throw error; }
}
export async function api(page, command, args = {}) { const input = JSON.stringify({ command, args }); if (input.length > 2_100_000) throw Object.assign(Error('Bounded debug transport payload exceeded'), { code: 'INVALID_ARGUMENT' }); const response = await page.evaluate(async (input) => { const { command, args } = JSON.parse(input); try { return { ok: true, value: await window.__NOTES_DEBUG__.execute(command, args) }; } catch (error) { return { ok: false, error: { code: error.code || 'APP_ERROR', message: error.message || String(error) } }; } }, input); if (!response.ok) throw Object.assign(Error(response.error.message), { code: response.error.code }); return response.value; }
export async function state(page) { return (await api(page, 'app.state')).result; }
export async function idle(page, timeoutMs = 10000) { return waitForIdle(page, { timeoutMs }); }
export async function waitForIdle(page, options = {}) {
  // Playwright serializes Error.message/stack, not arbitrary Error.code. Keep
  // the same explicit JSON error envelope as execute() for async idle failures.
  const input = JSON.stringify(options);
  if (!input || input.length > 65536) throw Object.assign(Error('Invalid bounded idle options'), { code: 'INVALID_ARGUMENT' });
  const response = await page.evaluate(async (input) => {
    try { return { ok: true, value: await window.__NOTES_DEBUG__.waitForIdle(JSON.parse(input)) }; }
    catch (error) { return { ok: false, error: { code: error.code || 'APP_ERROR', message: error.message || String(error) } }; }
  }, input);
  if (!response.ok) throw Object.assign(Error(response.error.message), { code: response.error.code });
  return response.value;
}
export async function waitForState(page, predicate, { timeoutMs = 10000, label = 'application state' } = {}) {
  if (typeof predicate !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('Invalid bounded state wait');
  const deadlineAt = performance.now() + timeoutMs; let lastState, expired = false, timer;
  const timeout = () => Object.assign(Error(`Timed out awaiting ${label}`), { code: 'TIMEOUT', lastState });
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(timeout()); }, timeoutMs); });
  const guard = () => { if (expired || performance.now() >= deadlineAt) throw timeout(); };
  const polling = (async () => {
    while (true) {
      guard(); lastState = await state(page); guard();
      const matched = await predicate(lastState); guard();
      if (matched) return lastState;
      // state() awaits two actual rendering frames. The outer deadline also
      // covers an unsettled state read or predicate, and rejects a late true.
    }
  })();
  try { return await Promise.race([polling, deadline]); }
  finally { clearTimeout(timer); expired = true; }
}
export async function snapshot(page, options = {}) { return page.evaluate((options) => window.__NOTES_DEBUG__.snapshot(options), options); }
export async function saveJSON(path, value) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); }
