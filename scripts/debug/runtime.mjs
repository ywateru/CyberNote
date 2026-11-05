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
  let browser, context, vite, server, backend; const errors = [];
  const cleanup = async ({ keep = options.keep } = {}) => { await context?.close(); await browser?.close(); await vite?.close(); await new Promise((done) => { if (!server) return done(); server.close(done); server.closeAllConnections(); }); await backend?.close(); if (!keep) await rm(directory, { recursive: true, force: true }); };
  try {
    backend = options.transport ? await rustBackend(resolve(options.transport), directory) : new FakeBackend(directory);
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
    if (!production) vite = await createViteServer({ root, configFile: false, cacheDir: resolve(directory, 'vite-cache'), plugins: [react({ exclude: /\/(?:node_modules|vite-cache)\// })], define: { 'import.meta.env.VITE_NOTES_DEBUG': JSON.stringify(options.enabled === false ? '0' : '1') }, server: { middlewareMode: true, hmr: { server } }, appType: 'custom' });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }); const origin = 'http://127.0.0.1:' + server.address().port;
    const playwrightPath = options.playwright || process.env.PLAYWRIGHT_CORE_PATH || playwrightDefault; if (!existsSync(playwrightPath)) throw Error('Set PLAYWRIGHT_CORE_PATH to an installed playwright-core; no dependencies are installed by this runner.');
    const { chromium } = await import(pathToFileURL(playwrightPath));
    browser = await chromium.launch({ executablePath: options.chrome || process.env.CHROME_PATH || chromeDefault, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling'] });
    const viewport = options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    context = await browser.newContext({ viewport, ...(options.mobile ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' } : {}) });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', (error) => errors.push(String(error)));
    await page.route('**/*', (route) => route.request().url().startsWith(origin) || /^(data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
    await page.addInitScript(installBrowserPlatform, { mobile: !!options.mobile });
    await page.goto(origin + '/?notesDebug=1');
    if (options.enabled === false || production) await page.waitForSelector('.app');
    else { await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1); await page.evaluate(() => window.__NOTES_DEBUG__.waitForIdle({ timeoutMs: 10000 })); }
    const reset = async () => { if (!backend.reset) throw Error('Scenario reset requires default isolated fixture; use separate CLI scripts with external transport.'); backend.reset(); errors.length = 0; await page.reload(); await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1); await idle(page); };
    return { root, directory, origin, page, viewport, backend, errors, cleanup, reset, metadata: { backend: backend.kind, media: 'fixed 440Hz PCM/WAV synthetic device; real AudioContext decode and production RecordingPcm accumulation', native: 'IPC/window/quit/OCR/dialog/clipboard simulated; no OS/TCC/real microphone or Rust Store proof by default', browser: await browser.version(), viewport } };
  } catch (error) { await cleanup({ keep: options.keep }); throw error; }
}
export async function api(page, command, args = {}) { return page.evaluate(async ({ command, args }) => { try { return await window.__NOTES_DEBUG__.execute(command, args); } catch (error) { throw Error((error.code || 'APP_ERROR') + ': ' + (error.message || String(error))); } }, { command, args }); }
export async function state(page) { return (await api(page, 'app.state')).result; }
export async function idle(page, timeoutMs = 10000) { return page.evaluate((timeoutMs) => window.__NOTES_DEBUG__.waitForIdle({ timeoutMs }), timeoutMs); }
export async function snapshot(page, options = {}) { return page.evaluate((options) => window.__NOTES_DEBUG__.snapshot(options), options); }
export async function saveJSON(path, value) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); }
