import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer, build as buildVite } from 'vite';
import react from '@vitejs/plugin-react';
import { FakeBackend, rustBackend, installBrowserPlatform } from './platform.mjs';
import { pollRustEvents } from './rust-backend.mjs';

const playwrightDefault = '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs';
const chromeDefault = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export async function openRuntime(options = {}) {
  const root = resolve(options.root || process.cwd());
  const directory = await mkdtemp(resolve(options.tmp || tmpdir(), 'notes-debug70-'));
  let browser,
    browserServer,
    browserServerClosed = false,
    browserProcessExit,
    context,
    vite,
    server,
    backend,
    pump,
    eventPage,
    eventTask = Promise.resolve();
  let contextClosed = false;
  let eventReady = false,
    participantsRegistered = false;
  const errors = [],
    sockets = new Set(),
    eventQueue = [],
    eventHistory = [];
  const dispatchEvents = () => {
    if (!eventReady) return;
    eventTask = eventTask.then(async () => {
      while (eventQueue.length) {
        const event = eventQueue.shift();
        await options.beforeRustEvent?.(event);
        // No invitation or request argument is included in event history.
        eventHistory.push(structuredClone(event));
        await eventPage.evaluate(async (event) => {
          window.__DEBUG_PLATFORM__.events.push(event.name);
          await window.__DEBUG_PLATFORM__.emit(event.name, event.payload);
        }, event);
      }
    });
    eventTask.catch((error) =>
      errors.push("Rust event delivery: " + error.message),
    );
  };
  const receiveEvents = (events) => {
    for (const event of events) if (!event || typeof event.name !== "string" || !("payload" in event)) throw Error("Invalid Rust event envelope");
    eventQueue.push(...events);
    dispatchEvents();
  };
  const settleEvents = async () => {
    for (;;) { const current = eventTask; await current; if (current === eventTask && !eventQueue.length) return; }
  };
  const resourceClosures = [];
  const closeResource = async (resource, event, close, complete) => {
    if (!resource || complete()) return;
    let terminal, timer;
    const observed = new Promise(done => { terminal = done; resource.once(event, terminal); });
    try {
      // Playwright can publish the resource terminal event while its close IPC
      // response is still pending. The actual terminal event is authoritative.
      await Promise.race([close(), observed, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(event + " resource close timed out")), 10000); })]);
      if (!complete()) throw Error(event + " resource did not reach terminal state");
      resourceClosures.push({ event, terminal: true });
    } finally { clearTimeout(timer); resource.off(event, terminal); }
  };
  const cleanup = async ({ keep = options.keep } = {}) => {
    // Teardown always owns all resources, even after a failed poll/event/IPC.
    // Preserve the first failure while awaiting every independent cleanup.
    const cleanupStarted = performance.now();
    let failure;
    const attempt = async fn => { try { await fn(); } catch (error) { failure ||= error; } };
    if (participantsRegistered) await attempt(async () => {
      const response = await backend.call("set_document_participants", { windows: [] });
      if (!response.ok) throw Error(response.error.message);
      participantsRegistered = false;
    });
    await attempt(() => pump?.stop());
    await attempt(settleEvents);
    eventReady = false;
    await attempt(() => options.rustEvents
      ? closeResource(context, 'close', () => context.close(), () => contextClosed)
      : context?.close());
    await attempt(async () => {
      if (!browserServer) {
        await browser?.close();
        return;
      }
      let timer;
      try {
        await Promise.race([
          browserServer.close(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Owned browser server close timed out")), 10000); }),
        ]);
      } finally { clearTimeout(timer); }
      if (!browserServerClosed || browser?.isConnected() ||
          browserProcessExit?.code !== 0 || browserProcessExit?.signal !== null)
        throw Error("Owned browser process did not close naturally");
    });
    for (const socket of sockets) socket.destroy();
    const closeServer = new Promise(done => {
      if (!server) return done();
      server.close(done); server.closeAllConnections();
    });
    let closeTimer;
    await attempt(() => Promise.race([
      Promise.all([vite?.close(), closeServer]),
      new Promise((_, reject) => { closeTimer = setTimeout(() => reject(Error("Vite/HTTP cleanup timed out")), 10000); }),
    ]).finally(() => clearTimeout(closeTimer)));
    await attempt(() => backend?.close());
    if (!keep) await attempt(() => rm(directory, { recursive: true, force: true }));
    if (options.rustEvents) resourceClosures.push({ event: "cleanup", terminal: !failure, wallMs: performance.now() - cleanupStarted });
    if (failure) throw failure;
  };
  try {
    backend = options.transport ? await rustBackend(resolve(options.transport), options.storeDirectory ? resolve(options.storeDirectory) : directory, { ...options.transportOptions, ...(options.rustEvents ? { timeoutMs: Math.max(35000, options.transportOptions?.timeoutMs || 0), onEvents: receiveEvents } : {}) }) : new FakeBackend(directory);
    if (options.rustEvents && !options.transport) throw Error("Rust events require an explicit real transport");
    let production = options.production && resolve(root, options.production);
    if (options.bundleDebug) {
      if (options.production || options.enabled === false) throw Error("Bundled debug runtime cannot be a production-exclusion check");
      production = resolve(directory, 'debug-bundle');
      const debugEntry = resolve(directory, 'debug-entry.mjs');
      await writeFile(debugEntry, `import ${JSON.stringify(resolve(root, 'src/main.tsx'))}; import * as sync from ${JSON.stringify(resolve(root, 'src/sync-client.ts'))}; import * as storage from ${JSON.stringify(resolve(root, 'src/storage-usage.ts'))}; import * as data from ${JSON.stringify(resolve(root, 'src/data-management.ts'))}; window.__DEBUG_SYNC_MODULE__ = sync; window.__DEBUG_STORAGE_MODULE__ = storage; window.__DEBUG_DATA_MODULE__ = data;`);
      await buildVite({ root, configFile: false, plugins: [react()], logLevel: 'error', define: { 'import.meta.env.DEV': 'true', 'import.meta.env.VITE_NOTES_ACCOUNT_UI': JSON.stringify(options['account-ui'] ? '1' : '0'), 'import.meta.env.VITE_NOTES_DEBUG': JSON.stringify('1'), 'process.env.NODE_ENV': JSON.stringify('development') }, build: { outDir: production, emptyOutDir: true, minify: false, cssCodeSplit: false, rollupOptions: { input: debugEntry, output: { entryFileNames: 'app.js', assetFileNames: '[name][extname]' } } } });
      const startupHtml = await readFile(resolve(root, 'index.html'), 'utf8');
      await writeFile(resolve(production, 'index.html'), startupHtml.replace('</head>', '<link rel="stylesheet" href="/style.css"></head>').replace('/src/main.tsx', '/app.js'));
    }
    const html = await readFile(resolve(root, 'index.html'), 'utf8');
    server = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
        if(pathname.startsWith('/media/')&&backend.serveMedia){backend.serveMedia(request,response);return;}
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
    if (!production) vite = await createViteServer({ root, configFile: false, cacheDir: resolve(directory, 'vite-cache'), optimizeDeps: { include: ['react-dom', 'react-dom/client'] }, plugins: [react({ exclude: /\/(?:node_modules|vite-cache)\// })], define: { 'import.meta.env.VITE_NOTES_ACCOUNT_UI': JSON.stringify(options['account-ui'] ? '1' : '0'), 'import.meta.env.VITE_NOTES_DEBUG': JSON.stringify(options.enabled === false ? '0' : '1') }, server: { middlewareMode: true, watch: { ignored: ["**/docs/verification/**", "**/artifacts/**", "**/output/**", "**/src-tauri/target/**", "**/plugins/**/target/**", "**/src-tauri/gen/android/**"] }, hmr: { server } }, appType: 'custom' });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }); const origin = 'http://127.0.0.1:' + server.address().port;
    if(backend.kind==='isolated-js-protocol-fixture')backend.mediaOrigin=origin;
    const playwrightPath = options.playwright || process.env.PLAYWRIGHT_CORE_PATH || playwrightDefault; if (!existsSync(playwrightPath)) throw Error('Set PLAYWRIGHT_CORE_PATH to an installed playwright-core; no dependencies are installed by this runner.');
    const { chromium } = await import(pathToFileURL(playwrightPath));
    const launchOptions = { executablePath: options.chrome || process.env.CHROME_PATH || chromeDefault, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling'] };
    if (options.rustEvents) {
      // Public process ownership lets us close this child's inherited log pipes
      // after its actual exit. Chrome updater/crashpad descendants may otherwise
      // keep stderr open, delaying Playwright's child `close` indefinitely.
      browserServer = await chromium.launchServer({ ...launchOptions, host: "127.0.0.1" });
      const ownedProcess = browserServer.process();
      ownedProcess.once("exit", (code, signal) => {
        browserProcessExit = { code, signal };
        const pipes = ownedProcess.stdio.filter(pipe => typeof pipe?.destroy === "function");
        for (const pipe of pipes) pipe.destroy();
        resourceClosures.push({ event: "browser-process-exit", terminal: true, pid: ownedProcess.pid, code, signal, stdioDestroyed: pipes.every(pipe => pipe.destroyed) });
      });
      browserServer.once("close", (code, signal) => {
        browserServerClosed = true;
        resourceClosures.push({ event: "browser-server-close", terminal: true, code, signal });
      });
      browser = await chromium.connect(browserServer.wsEndpoint());
      browser.once("disconnected", () => resourceClosures.push({ event: "disconnected", terminal: true }));
    } else {
      browser = await chromium.launch(launchOptions);
    }
    const viewport = options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    context = await browser.newContext({ viewport, ...(options.mobile ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' } : {}) });
    context.on('close', () => { contextClosed = true; });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', (error) => errors.push(String(error)));
    await page.route('**/*', (route) => route.request().url().startsWith(origin) || /^(data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
    await page.addInitScript(installBrowserPlatform, { mobile: !!options.mobile, nativeToolbar: !!options.nativeToolbar });
    await page.goto(origin + '/?notesDebug=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (options.enabled === false || options.production) await page.waitForSelector('.app');
    else { await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1); await idle(page); }
    await page.waitForSelector('#startup', {state: 'detached'});
    if (options.rustEvents) {
      eventPage = page;
      eventReady = true;
      const response = await backend.call("set_document_participants", {
        windows: ["main"],
      });
      if (!response.ok) throw Error(response.error.message);
      participantsRegistered = true;
      dispatchEvents();
      pump = pollRustEvents(backend);
    }
    const reset = async () => {
      if (!backend.reset) throw Error('Scenario reset requires default isolated fixture; use separate CLI scripts with external transport.');
      backend.reset();
      await page.reload();
      await page.waitForFunction(() => window.__NOTES_DEBUG__?.version === 1);
      await idle(page);
      // Match openRuntime's real startup handoff. Debug idle can precede the
      // splash transition; until it detaches, root is inert and aria-hidden.
      await page.waitForSelector('#startup', { state: 'detached', timeout: 10000 });
    };
    return { root, directory, origin, page, rustEvents: { history: eventHistory, resourceClosures, get pending() { return eventQueue.length; }, get polling() { return pump?.state; }, async settled() { await settleEvents(); } }, mobile: !!options.mobile, accountUI: !!options['account-ui'], viewport, backend, errors, cleanup, reset, metadata: { platform: options.mobile ? 'mobile-browser' : 'desktop-browser', accountUI: !!options['account-ui'], backend: backend.kind, media: 'fixed 440Hz PCM/WAV synthetic device; real AudioContext decode and production RecordingPcm accumulation', native: 'IPC/window/quit/OCR/dialog/clipboard simulated; no OS/TCC/real microphone or Rust Store proof by default', browser: await browser.version(), frontendTransport: options.bundleDebug ? 'isolated-static-debug-bundle' : production ? 'production-static' : 'vite-development', viewport } };
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
