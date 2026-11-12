/** Isolated Samsung sync108 driver. Node >=22; adb and the installed debug APK required.
 * Writes use CDP Input + visible product controls. IPC is restricted to reads.
 * No SQL, production package controls, invitation creation or arbitrary JS API.
 * Import connectAndroid() for orchestration. CLI JSON input is read from stdin,
 * especially for pair: never put invitations in argv, files or diagnostics.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, symlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

export const SERIAL = '98895a3147304c3132';
export const PACKAGE = 'com.local.notesclone.sync108';
export const ACTIVITY = `${PACKAGE}/com.local.notesclone.MainActivity`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const adb = path.join(process.env.ANDROID_HOME || `${os.homedir()}/Library/Android/sdk`, 'platform-tools/adb');
const run = (...args) => execFileSync(adb, ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 20000 });
const pause = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms));
const hash = data => createHash('sha256').update(data).digest('hex');
const quote = JSON.stringify;
const lockPath = path.join(os.tmpdir(), `cybernote-sync108-${SERIAL}.lock`);
const visible = `e=>!!(e.getClientRects().length&&!e.closest('[hidden],[inert]')&&getComputedStyle(e).visibility!=='hidden')`;

export function ownPid() {
  const pid = run('shell', 'pidof', PACKAGE).trim();
  if (!/^\d+$/.test(pid)) throw Error('Expected exactly one isolated package PID');
  const cmdline = run('shell', 'cat', `/proc/${pid}/cmdline`).split('\0')[0];
  if (cmdline !== PACKAGE) throw Error('PID does not belong to the isolated package');
  return Number(pid);
}

export function launchAndroid({ restart = false } = {}) {
  if (!run('shell', 'pm', 'path', PACKAGE).startsWith('package:')) throw Error('Isolated APK missing');
  if (restart) run('shell', 'am', 'force-stop', PACKAGE);
  return run('shell', 'am', 'start', '-W', '-n', ACTIVITY);
}

export function backgroundAndroid() {
  const pid = ownPid();
  const resumed = run('shell', 'dumpsys', 'activity', 'activities').split('\n').find(line => line.includes('mResumedActivity:')) || '';
  if (!resumed.includes(`${PACKAGE}/`)) throw Error('Isolated app must own foreground before Home');
  run('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  return { pid, action: 'Home', package: PACKAGE };
}

export async function reclaimBackgroundAndroid() {
  // Standard Android background-process reclaim; no force-stop or data clear.
  const pid = ownPid();
  const resumed = run('shell', 'dumpsys', 'activity', 'activities').split('\n').find(line => line.includes('mResumedActivity:')) || '';
  if (resumed.includes(`${PACKAGE}/`)) throw Error('Background isolated app before reclaim');
  run('shell', 'am', 'kill', PACKAGE);
  for (let i = 0; i < 30; i++) {
    try { if (!run('shell', 'pidof', PACKAGE).trim()) return { oldPid: pid, action: 'am kill background package' }; }
    catch (error) { if (error.status === 1) return { oldPid: pid, action: 'am kill background package' }; throw error; }
    await pause(100);
  }
  throw Error('Android did not reclaim isolated background process');
}

export function createOwnedReverse(hostPort) {
  if (!Number.isInteger(hostPort) || hostPort < 1024 || hostPort > 65535) throw Error('Invalid owned host port');
  const host = `tcp:${hostPort}`;
  const port = Number(run('reverse', '--no-rebind', 'tcp:0', host).trim());
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid allocated reverse port');
  return { serial: SERIAL, package: PACKAGE, device: `tcp:${port}`, host };
}

export function removeOwnedReverse(owned) {
  if (owned.serial !== SERIAL || owned.package !== PACKAGE ||
      !/^tcp:\d+$/.test(owned.device) || !/^tcp:\d+$/.test(owned.host)) throw Error('Invalid owned reverse');
  const matches = run('reverse', '--list').trim().split('\n').some(line => {
    const fields = line.trim().split(/\s+/); return fields.at(-2) === owned.device && fields.at(-1) === owned.host;
  });
  if (matches) run('reverse', '--remove', owned.device);
  return matches;
}

export async function removeOwnedForward(owned) {
  if (owned.serial !== SERIAL || owned.package !== PACKAGE ||
      !Number.isInteger(owned.pid) || !/^tcp:\d+$/.test(owned.local) ||
      owned.remote !== `localabstract:webview_devtools_remote_${owned.pid}`) {
    throw Error('Invalid owned mapping');
  }
  const exact = `${SERIAL} ${owned.local} ${owned.remote}`;
  if (run('forward', '--list').trim().split('\n').includes(exact)) {
    run('forward', '--remove', owned.local);
    return true;
  }
  return false;
}

export async function connectAndroid() {
  // Exclusive live driver; stale locks are intentionally not deleted automatically.
  await mkdir(lockPath).catch(() => { throw Error(`Driver busy or stale lock: ${lockPath}`); });
  let ws, owned;
  let id = 0;
  const pending = new Map();
  const assertPid = () => { if (ownPid() !== owned.pid) throw Error('App PID changed; reconnect'); };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const call = ++id;
    const timer = setTimeout(() => { pending.delete(call); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(call, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: call, method, params }));
  });
  const evaluate = async expression => {
    assertPid();
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error('CDP page evaluation failed');
    return r.result?.value;
  };
  const close = async ({ keepForward = false } = {}) => {
    ws?.close();
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('CDP closed')); }
    pending.clear();
    try { if (owned && !keepForward) await removeOwnedForward(owned); }
    finally { await rm(lockPath, { recursive: true }); }
  };
  try {
    const pid = ownPid();
    const remote = `localabstract:webview_devtools_remote_${pid}`;
    const port = Number(run('forward', '--no-rebind', 'tcp:0', remote).trim());
    if (!Number.isInteger(port) || port < 1024) throw Error('Invalid allocated forward');
    owned = { serial: SERIAL, package: PACKAGE, pid, local: `tcp:${port}`, remote };
    let targets;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
        if (targets.some(t => /^https?:\/\/tauri\.localhost(?:\/|$)/.test(t.url))) break;
      } catch { /* WebView may still be starting. */ }
      await pause();
    }
    const pages = (targets || []).filter(t => t.type === 'page' && /^https?:\/\/tauri\.localhost(?:\/|$)/.test(t.url));
    if (pages.length !== 1) throw Error('Expected exactly one isolated Tauri page');
    const target = pages[0];
    const socketURL = new URL(target.webSocketDebuggerUrl);
    if (!['127.0.0.1', 'localhost'].includes(socketURL.hostname) || Number(socketURL.port) !== port) {
      throw Error('Unexpected CDP socket authority');
    }
    owned.pageId = target.id;
    owned.pageURL = target.url;
    ws = new WebSocket(socketURL);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('CDP connect timeout')), 10000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(Error('CDP connect failed')); };
    });
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id); clearTimeout(call.timer);
      if (message.error) call.reject(Error('CDP command rejected'));
      else call.resolve(message.result);
    };
    const wait = async (check, label, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) { const result = await check(); if (result) return result; await pause(); }
      throw Error(`Timed out: ${label}`);
    };
    const find = (selector, text) => `Array.from(document.querySelectorAll(${quote(selector)})).filter(${visible}).find(e=>${text === undefined ? 'true' : `e.textContent.trim()===${quote(text)}`})`;
    const has = (selector, text) => evaluate(`!!(${find(selector, text)})`);
    const click = async (selector, text) => {
      await wait(() => has(selector, text), 'visible control');
      const point = await evaluate(`(()=>{const e=${find(selector, text)};if(e.disabled)throw Error('disabled');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      await pause();
    };
    const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
      assertPid();
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers,
        ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
    };
    const type = async text => { assertPid(); await send('Input.insertText', { text }); };
    const fill = async (selector, text) => {
      await click(selector); await key('a', 'KeyA', 65, 2); await type(text); await pause();
    };
    const readWorkspace = () => evaluate(`window.__TAURI_INTERNALS__.invoke('load_workspace')`);
    const readNote = async id => {
      const workspace = await readWorkspace();
      const note = workspace.notes.find(n => n.id === id);
      if (!note) throw Error('Note missing from isolated workspace');
      return { note, attachments: workspace.attachments.filter(a => a.noteId === id), metadata: workspace.metadata };
    };
    const syncStatus = () => evaluate(`(async()=>{const w=await window.__TAURI_INTERNALS__.invoke('load_workspace');return window.__TAURI_INTERNALS__.invoke('sync_command',{command:{type:'status'},expected:{sessionId:w.access.sessionId,epoch:w.access.epoch,noteEpoch:null}})})()`);
    const closeSettings = async () => { if (await has('[aria-label="关闭设置"]')) await click('[aria-label="关闭设置"]'); };
    const openSync = async () => {
      if (await has('.sync-settings')) return;
      if (!await has('.preferences')) {
        if (await has('[aria-label="返回笔记"]')) await click('[aria-label="返回笔记"]');
        await click('[aria-label="设置"]');
      }
      if (!await has('[data-preferences-page="sync"]') && await has('[aria-label="返回设置"]')) await click('[aria-label="返回设置"]');
      await click('[data-preferences-page="sync"]');
      await wait(() => has('.sync-settings'), 'sync settings');
    };
    const preparePairing = async ({ deviceName = 'Sync108 Samsung Android9' } = {}) => {
      await openSync();
      const enabled = (await syncStatus()).status.state !== 'disabled';
      if (!enabled) await fill('[aria-label="同步设备名称"]', deviceName);
      if (!await has('[aria-label="粘贴完整配对串"]')) await click('.sync-actions button', enabled ? '更新连接' : '加入同步');
      await wait(() => has('[aria-label="粘贴完整配对串"]'), 'pairing input');
      return { enabled, deviceName: await evaluate(`document.querySelector('[aria-label="同步设备名称"]').value`) };
    };
    const api = {
      owned, close, readWorkspace, readNote, syncStatus, openSync, closeSettings, preparePairing,
      readEditor: () => evaluate(`(()=>{const e=document.querySelector('.tiptap');return e?{text:e.innerText,document:e.editor.getJSON()}:null})()`),
      async screenshot() {
        if (await evaluate(`Array.from(document.querySelectorAll('[data-sensitive]')).some(e=>e.value)`)) throw Error('Close sensitive pairing fields before screenshot');
        assertPid();
        const image = await send('Page.captureScreenshot', { format: 'png' });
        return Buffer.from(image.data, 'base64');
      },
      async inspect() {
        const w = await readWorkspace();
        return { ...owned, noteCount: w.notes.length, attachmentCount: w.attachments.length,
          sync: await syncStatus(), ui: await evaluate(`({ready:!!document.querySelector('.app'),editor:!!document.querySelector('.tiptap'),preferences:document.querySelector('.preferences')?.getAttribute('data-preferences-tab')||null,buttons:Array.from(document.querySelectorAll('button')).filter(${visible}).map(e=>({label:e.matches('.note-row')?'[note-row]':e.getAttribute('aria-label')||e.textContent.trim(),disabled:e.disabled})).filter(e=>!e.label.includes('生成配对串'))})`) };
      },
      async createNote({ title, body }) {
        if (typeof title !== 'string' || !title.trim() || title.includes('\n') || typeof body !== 'string' || !body) throw Error('title and body required');
        const before = new Set((await readWorkspace()).notes.map(n => n.id));
        await closeSettings();
        await click('[aria-label="新建备忘录"]');
        await wait(() => has('.tiptap[contenteditable="true"]'), 'editor');
        await click('.tiptap h1');
        await type(title);
        for (const line of body.split('\n')) { await key('Enter', 'Enter', 13); if (line) await type(line); }
        // Blur through the real navigation handler to flush the editor's save path.
        await pause(900);
        await click('[aria-label="返回笔记"]');
        return wait(async () => {
          const w = await readWorkspace();
          const note = w.notes.find(n => !before.has(n.id) && n.title === title && body.split('\n').every(line => (n.plainText || '').includes(line)));
          return note || false;
        }, 'persisted complete note');
      },
      async openNote(id) {
        await closeSettings();
        if (await has('[aria-label="返回笔记"]')) await click('[aria-label="返回笔记"]');
        await readNote(id);
        await click(`button.note-row[data-note-id=${quote(id)}]`);
      },
      async pair({ invitation, deviceName = 'Sync108 Samsung Android9' }) {
        if (typeof invitation !== 'string' || !invitation.trim()) throw Error('Invitation required on stdin/in memory');
        try {
          await preparePairing({ deviceName });
          await fill('[aria-label="粘贴完整配对串"]', invitation);
          await click('.sync-pair button', '连接并加入');
          await wait(async () => {
            const state = await syncStatus();
            return state.status.peers.length > 0 && state.status.state !== 'error' && !await has('[aria-label="粘贴完整配对串"]');
          }, 'pairing completion', 30000);
          return await syncStatus();
        } catch { throw Error('UI pairing failed; inspect the isolated sync screen (invitation omitted)'); }
      },
      async syncNow() { await openSync(); await click('.sync-actions button', '立即同步'); return syncStatus(); },
      async readAttachment(id) {
        const w = await readWorkspace();
        const attachment = w.attachments.find(a => a.id === id);
        if (!attachment) throw Error('Attachment missing');
        const expected = { sessionId: w.access.sessionId, epoch: w.access.epoch, noteEpoch: w.access.notes[attachment.noteId].epoch };
        const result = await evaluate(`window.__TAURI_INTERNALS__.invoke('read_attachment',${quote({ id, expected })})`);
        const bytes = Buffer.from(result.data, 'base64');
        return { ...result, sha256: hash(bytes), byteLength: bytes.length };
      },
    };
    await wait(() => evaluate(`!!(window.__TAURI_INTERNALS__&&document.querySelector('.app'))`), 'native app ready');
    return api;
  } catch (error) { await close(); throw error; }
}

export async function buildAndroid() {
  const home = path.join(root, 'artifacts/sync108-android/gradle-home');
  await mkdir(path.join(home, 'init.d'), { recursive: true });
  for (const entry of ['caches', 'wrapper']) {
    if (!existsSync(path.join(home, entry))) await symlink(path.join(os.homedir(), '.gradle', entry), path.join(home, entry));
  }
  await copyFile(path.join(root, 'scripts/verification/sync108-android.init.gradle'), path.join(home, 'init.d/sync108.gradle'));
  const result = spawnSync(process.execPath, ['scripts/android.mjs', 'build', '--debug', '--target', 'aarch64', '--apk'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, GRADLE_USER_HOME: home, CARGO_TARGET_DIR: path.join(root, 'src-tauri/target') },
  });
  if (result.status !== 0) throw Error('Isolated Android build failed');
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  if (command === 'build') return buildAndroid();
  if (command === 'launch' || command === 'restart') return console.log(launchAndroid({ restart: command === 'restart' }));
  if (command === 'detach') return console.log(await removeOwnedForward(JSON.parse(await readFile(argument, 'utf8'))));
  const allowed = ['inspect', 'attach', 'open-sync', 'create-note', 'pair', 'read-note', 'read-workspace', 'read-attachment', 'sync-now'];
  if (!allowed.includes(command)) {
    console.log(`Usage: node scripts/verification/sync108-android.mjs ${['build', 'launch', 'restart', 'detach <owned.json>', ...allowed].join('|')}\ncreate-note / pair take JSON on stdin. read-note / read-attachment take IDs. attach takes an owned.json output path. No invitation creation.`);
    return;
  }
  const client = await connectAndroid();
  let keepForward = false;
  try {
    let result;
    if (command === 'attach') {
      if (!argument) throw Error('owned.json output path required');
      await writeFile(argument, JSON.stringify(client.owned, null, 2), { mode: 0o600, flag: 'wx' });
      keepForward = true; result = client.owned;
    } else if (command === 'inspect') result = await client.inspect();
    else if (command === 'read-workspace') result = await client.readWorkspace();
    else if (command === 'read-note') result = await client.readNote(argument);
    else if (command === 'read-attachment') result = await client.readAttachment(argument);
    else if (command === 'open-sync') { await client.openSync(); result = await client.syncStatus(); }
    else if (command === 'sync-now') result = await client.syncNow();
    else {
      let input = ''; for await (const chunk of process.stdin) input += chunk;
      const value = JSON.parse(input);
      if (command === 'pair') result = await client.pair(value);
      else { const note = await client.createNote(value); result = { id: note.id, revision: note.revision, documentSHA256: hash(JSON.stringify(note.document)) }; }
    }
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.close({ keepForward }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(process.argv[2] === 'pair' ? 'UI pairing failed (invitation omitted)' : error.message); process.exitCode = 1; });
}
