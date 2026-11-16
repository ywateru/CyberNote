/** Owned, already running emulator only. Node 22; no boot/install/build/IME API.
 * CDP input is data preparation, not native IME evidence. See the companion doc.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, lstat, realpath, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { acquireDriverLease } from './sync108-android-lifecycle.mjs';

const exec = promisify(execFile), q = JSON.stringify;
const fail = code => Object.assign(Error(code), { code });
const requireThat = (value, code) => { if (!value) throw fail(code); };
const port = n => Number.isInteger(n) && n >= 1024 && n <= 65535;
const digest = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const component = s => typeof s === 'string' && /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+$/.test(s);

export function prepareOwnedAndroid(input) {
  const keys = ['adb', 'adbServerPort', 'serial', 'avd', 'package', 'activity', 'expectedAPKsha', 'evidence'];
  requireThat(input && Object.keys(input).length === keys.length && keys.every(k => Object.hasOwn(input, k)), 'CONFIG_FIELDS');
  const c = { ...input };
  requireThat(typeof c.adb === 'string' && path.isAbsolute(c.adb), 'ADB_PATH');
  requireThat(port(c.adbServerPort), 'ADB_SERVER_PORT');
  requireThat(typeof c.serial === 'string' && /^emulator-\d+$/.test(c.serial), 'EMULATOR_SERIAL_REQUIRED');
  const consolePort = Number(c.serial.slice(9));
  requireThat(consolePort >= 5554 && consolePort <= 5584 && consolePort % 2 === 0, 'EMULATOR_PORT');
  requireThat(typeof c.avd === 'string' && /^[\w-]{1,100}$/.test(c.avd), 'AVD_NAME');
  requireThat(component(c.package), 'PACKAGE');
  requireThat(typeof c.activity === 'string' && c.activity.startsWith(c.package + '/'), 'ACTIVITY');
  let activityClass = c.activity.slice(c.package.length + 1);
  if (activityClass.startsWith('.')) activityClass = c.package + activityClass;
  requireThat(component(activityClass), 'ACTIVITY');
  c.activity = c.package + '/' + activityClass;
  requireThat(digest(c.expectedAPKsha), 'APK_SHA256');
  requireThat(typeof c.evidence === 'string' && path.isAbsolute(c.evidence) && c.evidence === path.resolve(c.evidence), 'EVIDENCE_PATH');
  return Object.freeze(c);
}

async function privateDirectory(directory) {
  await mkdir(directory, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw fail('PRIVATE_DIRECTORY'); });
  const s = await lstat(directory);
  requireThat(s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 0o777) === 0o700 && await realpath(directory) === directory, 'PRIVATE_DIRECTORY');
}

async function existingServer(serverPort, protocolVersion) {
  // Read the existing daemon's protocol before invoking adb: an incompatible
  // adb client can otherwise kill/restart it. Never send a server-start command.
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: serverPort });
    let data = '';
    socket.setTimeout(1000);
    socket.once('connect', () => socket.write('000chost:version'));
    const stop = () => { socket.destroy(); reject(fail('ADB_SERVER_UNAVAILABLE')); };
    socket.once('timeout', stop); socket.once('error', stop);
    socket.on('data', chunk => {
      data += chunk.toString('ascii');
      if (data.length < 12) return;
      socket.destroy();
      if (/^OKAY0004[0-9a-fA-F]{4}$/.test(data) && parseInt(data.slice(8), 16) === protocolVersion) resolve();
      else reject(fail('ADB_SERVER_VERSION'));
    });
    socket.once('end', () => { if (data.length < 12) stop(); });
  });
}

async function nativeTransport(c) {
  const home = path.join(c.evidence, 'android-user');
  await privateDirectory(home);
  const env = { ...process.env, ANDROID_USER_HOME: home, ANDROID_EMULATOR_HOME: home,
    ANDROID_AVD_HOME: home, ADB_VENDOR_KEYS: home, ADB_SERVER_SOCKET: `tcp:127.0.0.1:${c.adbServerPort}` };
  for (const key of ['ANDROID_SERIAL', 'ANDROID_SDK_HOME', 'ANDROID_PREFS_ROOT', 'ADB_TRACE', 'ADB_SERVER_PORT', 'ANDROID_ADB_SERVER_PORT']) delete env[key];
  let version;
  try { version = (await exec(c.adb, ['version'], { env, cwd: c.evidence, timeout: 5000, maxBuffer: 4096 })).stdout; }
  catch { throw fail('ADB_LOCAL_VERSION'); }
  const protocol = /Android Debug Bridge version 1\.0\.(\d+)/.exec(version);
  requireThat(protocol, 'ADB_LOCAL_VERSION');
  return {
    async adb(args) {
      await existingServer(c.adbServerPort, Number(protocol[1]));
      try {
        const result = await exec(c.adb, ['-H', '127.0.0.1', '-P', String(c.adbServerPort), '-s', c.serial, ...args],
          { env, cwd: c.evidence, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
        return result.stdout;
      } catch { throw fail('ADB_COMMAND_FAILED'); } // Never propagate argv/output (may be sensitive).
    },
    async pages(p) {
      const response = await fetch(`http://127.0.0.1:${p}/json/list`, { signal: AbortSignal.timeout(3000) });
      requireThat(response.ok, 'CDP_DISCOVERY');
      const reader = response.body.getReader(), chunks = []; let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          requireThat(bytes <= 256 * 1024, 'CDP_DISCOVERY_SIZE'); chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    },
    connect: connectCDP,
  };
}

async function connectCDP(url) {
  const ws = new WebSocket(url), pending = new Map();
  let sequence = 0, dead = false;
  const stop = () => {
    dead = true;
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(fail('CDP_CLOSED')); }
    pending.clear();
  };
  ws.addEventListener('close', stop); ws.addEventListener('error', stop);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(fail('CDP_CONNECT_TIMEOUT')); }, 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(fail('CDP_CONNECT_FAILED')); }, { once: true });
  });
  ws.addEventListener('message', event => {
    try {
      requireThat(typeof event.data === 'string' && event.data.length <= 8 * 1024 * 1024, 'CDP_FRAME_SIZE');
      const message = JSON.parse(event.data), job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id); clearTimeout(job.timer);
      if (message.error) job.reject(fail('CDP_REJECTED')); else job.resolve(message.result);
    } catch { stop(); ws.close(); }
  });
  return {
    send(method, params) {
      requireThat(!dead, 'CDP_CLOSED');
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(fail('CDP_TIMEOUT')); }, 10000);
        pending.set(id, { resolve, reject, timer });
        try { ws.send(q({ id, method, params })); } catch { stop(); }
      });
    },
    close() { stop(); ws.close(); },
  };
}

const workspace = `window.__TAURI_INTERNALS__.invoke('load_workspace')`;
const status = `(async()=>{const w=await ${workspace};return window.__TAURI_INTERNALS__.invoke('sync_command',{command:{type:'status'},expected:{sessionId:w.access.sessionId,epoch:w.access.epoch,noteEpoch:null}})})()`;
function endpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('SYNC_ENDPOINT'); }
  requireThat(['ws:', 'wss:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'SYNC_ENDPOINT');
  return url;
}

/** transport is an explicit test seam; fake transport results are not device acceptance. */
export async function connectOwnedAndroid(input, { transport } = {}) {
  const c = prepareOwnedAndroid(input);
  await privateDirectory(c.evidence);
  // One local daemon+emulator has one lease, even across different evidence dirs.
  const leasePath = path.join(await realpath('/tmp'), `evolve116-driver-${process.getuid()}-${c.adbServerPort}-${c.serial}.lock`);
  const lease = await acquireDriverLease(leasePath);
  let t, cdp, ownedForward, bootId, pid, page, poisoned = false, busy = false;
  let drained = Promise.resolve(), finishOperation;
  const reverses = [];
  const adb = args => t.adb(args);
  const avdIdentity = async () => {
    // Guest properties avoid adb emu's host console-auth token lookup entirely.
    requireThat((await adb(['shell', 'getprop', 'ro.kernel.qemu'])).trim() === '1', 'EMULATOR_IDENTITY');
    requireThat((await adb(['shell', 'getprop', 'ro.boot.qemu.avd_name'])).trim() === c.avd, 'AVD_IDENTITY');
    const boot = (await adb(['shell', 'cat', '/proc/sys/kernel/random/boot_id'])).trim();
    requireThat(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(boot) && (!bootId || boot === bootId), 'BOOT_IDENTITY');
    return boot;
  };
  const identity = async () => {
    lease.assertOpen();
    const boot = await avdIdentity();
    const paths = (await adb(['shell', 'pm', 'path', c.package])).trim().split(/\r?\n/);
    requireThat(paths.length === 1 && /^package:\/data\/app\/[A-Za-z0-9_+./=~-]+\/base\.apk$/.test(paths[0]) && !paths[0].includes('/../'), 'APK_PATH');
    const hashLine = (await adb(['shell', 'toybox', 'sha256sum', paths[0].slice(8)])).trim();
    requireThat(hashLine.split(/\s+/)[0] === c.expectedAPKsha, 'APK_IDENTITY');
    const currentPid = (await adb(['shell', 'pidof', c.package])).trim();
    requireThat(/^[1-9]\d*$/.test(currentPid) && (!pid || currentPid === pid), 'PID_IDENTITY');
    requireThat((await adb(['shell', 'cat', `/proc/${currentPid}/cmdline`])).replace(/\0+$/, '') === c.package, 'PROCESS_IDENTITY');
    const activities = await adb(['shell', 'dumpsys', 'activity', 'activities']);
    const resumed = activities.split('\n').filter(line => /\bmResumedActivity:/.test(line));
    requireThat(resumed.length === 1, 'FOREGROUND_IDENTITY');
    const components = resumed[0].match(/[A-Za-z_][\w.]*(?:\/)[.A-Za-z_][\w.]*/g) || [];
    const expected = c.activity.split('/')[1];
    requireThat(components.some(value => {
      const [pkg, cls] = value.split('/');
      return pkg === c.package && (cls.startsWith('.') ? pkg + cls : cls) === expected;
    }), 'FOREGROUND_IDENTITY');
    return { boot, pid: currentPid };
  };
  const target = async () => {
    const pages = await t.pages(ownedForward.port);
    requireThat(Array.isArray(pages), 'WEBVIEW_IDENTITY');
    const candidates = pages.filter(p => p.type === 'page');
    requireThat(candidates.length === 1, 'WEBVIEW_IDENTITY');
    const p = candidates[0]; let url, socket;
    try { url = new URL(p.url); socket = new URL(p.webSocketDebuggerUrl); } catch { throw fail('WEBVIEW_IDENTITY'); }
    requireThat(['http:', 'https:'].includes(url.protocol) && url.hostname === 'tauri.localhost' && !url.username && !url.password,
      'WEBVIEW_IDENTITY');
    requireThat(socket.protocol === 'ws:' && ['127.0.0.1', 'localhost'].includes(socket.hostname) && Number(socket.port) === ownedForward.port &&
      !socket.username && !socket.password && !socket.search && !socket.hash && typeof p.id === 'string' && p.id.length > 0, 'CDP_AUTHORITY');
    requireThat(!page || (p.id === page.id && p.url === page.url && p.webSocketDebuggerUrl === page.webSocketDebuggerUrl), 'WEBVIEW_CHANGED');
    return p;
  };
  const close = () => lease.close(async () => {
    await drained;
    cdp?.close();
    if (!t || (!ownedForward && !reverses.length)) return;
    await avdIdentity(); // Never clean mappings on another AVD or boot generation.
    for (const mapping of reverses) {
      const rows = (await adb(['reverse', '--list'])).trim().split(/\r?\n/).map(line => line.trim().split(/\s+/));
      if (rows.some(row => row.length === 3 && row[1] === mapping.device && row[2] === mapping.host))
        await adb(['reverse', '--remove', mapping.device]);
    }
    if (ownedForward) {
      const exact = `${c.serial} tcp:${ownedForward.port} ${ownedForward.remote}`;
      if ((await adb(['forward', '--list'])).trim().split(/\r?\n/).includes(exact))
        await adb(['forward', '--remove', `tcp:${ownedForward.port}`]);
    }
  });
  const evaluate = async expression => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    requireThat(!r.exceptionDetails, 'PAGE_EVALUATION');
    return r.result?.value;
  };
  const guard = async () => { await identity(); await target(); };
  const operation = fn => async (...args) => {
    lease.assertOpen(); requireThat(!poisoned, 'SESSION_STOPPED'); requireThat(!busy, 'OPERATION_BUSY');
    busy = true;
    drained = new Promise(resolve => { finishOperation = resolve; });
    try { await guard(); return await fn(...args); }
    catch (error) { poisoned = true; throw fail(error.code || 'OPERATION_FAILED'); }
    finally { busy = false; finishOperation(); }
  };
  const click = async selector => {
    requireThat(typeof selector === 'string' && selector.length > 0 && selector.length <= 1024, 'SELECTOR');
    const point = await evaluate(`(()=>{const es=[...document.querySelectorAll(${q(selector)})].filter(e=>e.getClientRects().length&&!e.closest('[hidden],[inert]')&&!e.matches(':disabled,[aria-disabled="true"]')&&getComputedStyle(e).visibility==='visible');if(es.length!==1)throw Error('target');const e=es[0],r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(x<0||y<0||x>=innerWidth||y>=innerHeight||!e.contains(document.elementFromPoint(x,y)))throw Error('hit');return{x,y}})()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await guard();
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  try {
    await chmod(leasePath, 0o700);
    await lstat(path.join(c.evidence, 'identity.json')).then(() => { throw fail('EVIDENCE_ALREADY_USED'); }, error => {
      if (error.code !== 'ENOENT') throw error;
    });
    t = transport || await nativeTransport(c);
    const initial = await identity(); bootId = initial.boot; pid = initial.pid;
    const remote = `localabstract:webview_devtools_remote_${pid}`;
    const allocated = Number((await adb(['forward', '--no-rebind', 'tcp:0', remote])).trim());
    requireThat(port(allocated), 'FORWARD_PORT');
    ownedForward = { port: allocated, remote };
    page = await target(); cdp = await t.connect(page.webSocketDebuggerUrl);
    await guard();
    const native = await evaluate(`!!window.__TAURI_INTERNALS__ && !!document.querySelector('.app') && localStorage.getItem('notes-browser-preview')===null`);
    requireThat(native === true, 'NATIVE_APP_REQUIRED');
    const identityReceipt = { ...c, pid, bootId, leasePath, pageId: page.id, forward: { ...ownedForward }, acceptance: false };
    await writeFile(path.join(c.evidence, 'identity.json'), q(identityReceipt) + '\n', { flag: 'wx', mode: 0o600 });
    return Object.freeze({
      identity: Object.freeze(identityReceipt), close,
      readWorkspace: operation(() => evaluate(workspace)),
      readNote: operation(async id => {
        requireThat(typeof id === 'string' && id.length > 0 && id.length <= 256, 'NOTE_ID');
        const w = await evaluate(workspace), note = w.notes.find(n => n.id === id);
        requireThat(note, 'NOTE_MISSING');
        return { note, attachments: w.attachments.filter(a => a.noteId === id) };
      }),
      readSettings: operation(() => evaluate(`(async()=>{const w=await ${workspace};return w.settings})()`)),
      readSync: operation(() => evaluate(status)),
      readUI: operation(async () => {
        const { editorCount, ...ui } = await evaluate(`(()=>{
          const editors=[...document.querySelectorAll('.tiptap')].filter(e=>{
            if(!e.isConnected||e.closest('[hidden],[inert]')||getComputedStyle(e).visibility!=='visible')return false;
            for(let host=e;host;host=host.parentElement){
              const style=getComputedStyle(host);
              if(style.display==='none'||Number(style.opacity)===0)return false;
            }
            return [...e.getClientRects()].some(r=>r.width>0&&r.height>0);
          });
          if(editors.length>1)return{editorCount:editors.length};
          const e=editors[0];
          return{editorCount:editors.length,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,clientWidth:document.documentElement.clientWidth,visualWidth:visualViewport?.width,scale:visualViewport?.scale},editor:e?{noteId:e.dataset.noteId,document:e.editor.getJSON(),selection:e.editor.state.selection.toJSON(),focused:e.editor.isFocused}:null,format:!!document.querySelector('.mobile-format-panel'),app:document.querySelector('.app')?.className};
        })()`);
        requireThat(editorCount <= 1, 'UI_EDITOR_AMBIGUOUS');
        return ui;
      }),
      click: operation(click),
      // Values (including invitations) travel in memory over CDP, never adb argv/logs.
      fill: operation(async (selector, value) => {
        requireThat(typeof value === 'string' && value.length <= 16384, 'TEXT_SIZE');
        await click(selector);
        for (const type of ['keyDown', 'keyUp']) {
          await guard(); await cdp.send('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
        }
        await guard(); await cdp.send('Input.insertText', { text: value });
      }),
      insertText: operation(async value => {
        requireThat(typeof value === 'string' && value.length <= 16384, 'TEXT_SIZE');
        await cdp.send('Input.insertText', { text: value });
      }),
      tap: operation(async (x, y) => {
        requireThat([x, y].every(n => Number.isInteger(n) && n >= 0 && n <= 16384), 'COORDINATES');
        await adb(['shell', 'input', 'tap', String(x), String(y)]);
      }),
      longPress: operation(async (x, y, milliseconds) => {
        requireThat([x, y].every(n => Number.isInteger(n) && n >= 0 && n <= 16384) && Number.isInteger(milliseconds) && milliseconds >= 500 && milliseconds <= 2000, 'LONG_PRESS');
        await adb(['shell', 'input', 'swipe', String(x), String(y), String(x), String(y), String(milliseconds)]);
      }),
      back: operation(() => adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK'])),
      readNativeState: operation(async () => {
        const results = {};
        for (const [name, args] of Object.entries({ size: ['wm', 'size'], density: ['wm', 'density'], rotation: ['wm', 'user-rotation'], ime: ['dumpsys', 'input_method'] })) {
          await guard(); results[name] = await adb(['shell', ...args]);
        }
        return results;
      }),
      rotate: operation(async rotation => {
        requireThat(Number.isInteger(rotation) && rotation >= 0 && rotation <= 3, 'ROTATION');
        await adb(['shell', 'wm', 'user-rotation', 'lock', String(rotation)]);
      }),
      createReverse: operation(async ({ hostEndpoint, guestEndpoint }) => {
        const host = endpoint(hostEndpoint), guest = endpoint(guestEndpoint);
        requireThat(host.hostname === '127.0.0.1' && guest.hostname === '127.0.0.1' && port(Number(host.port)) && port(Number(guest.port)) && host.protocol === guest.protocol && host.pathname === guest.pathname, 'REVERSE_ENDPOINT');
        const mapping = { device: `tcp:${guest.port}`, host: `tcp:${host.port}`, hostEndpoint, guestEndpoint };
        await adb(['reverse', '--no-rebind', mapping.device, mapping.host]);
        reverses.push(mapping); return { ...mapping, serial: c.serial, package: c.package };
      }),
      assertSyncIdentity: operation(async expected => {
        requireThat(expected && ['workspaceId', 'deviceId', 'peerId', 'endpoint'].every(k => typeof expected[k] === 'string' && expected[k].length > 0), 'SYNC_EXPECTATION');
        endpoint(expected.endpoint);
        const result = await evaluate(status), s = result.status;
        requireThat(s.workspaceId === expected.workspaceId && s.deviceId === expected.deviceId && s.deviceId !== expected.peerId &&
          s.peers.some(p => p.id === expected.peerId && p.endpoint === expected.endpoint), 'SYNC_IDENTITY');
        return result;
      }),
    });
  } catch (error) {
    try { await close(); } catch { throw fail('CONNECT_FAILED_CLEANUP_INCOMPLETE'); }
    throw fail(error.code || 'CONNECT_FAILED');
  }
}

// Deliberately only a device-free prepare CLI. Runtime orchestration imports the API.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    requireThat(process.argv.length === 4 && process.argv[2] === 'prepare', 'USAGE_PREPARE_CONFIG_JSON');
    const config = prepareOwnedAndroid(JSON.parse(await readFile(process.argv[3], 'utf8')));
    console.log(q({ config, deviceCommandsExecuted: false, acceptance: false }));
  } catch (error) { console.error(error.code || 'INVALID_CONFIG'); process.exitCode = 1; }
}
