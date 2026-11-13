/** Fixed Account109 Samsung driver derived from the committed Sync108 helper.
 * Writes use visible product controls and CDP Input. IPC exposes reads only.
 * No token/grant access, arbitrary evaluation API, SQL, manual pairing or ADB shell API.
 * Node >=22. close() is idempotent and removes only its exact PID-owned forward.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { acquireDriverLease, guardDriverMethods } from './sync108-android-lifecycle.mjs';

export const SERIAL = '98895a3147304c3132';
export const PACKAGE = 'com.local.notesclone.account109';
export const ACTIVITY = `${PACKAGE}/com.local.notesclone.MainActivity`;
const sdkOverride = typeof process === 'object' ? process.env?.ANDROID_HOME : undefined;
const adb = path.join(sdkOverride || `${os.homedir()}/Library/Android/sdk`, 'platform-tools/adb');
const run = (...args) => execFileSync(adb, ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 20000 });
const pause = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms));
const hash = data => createHash('sha256').update(data).digest('hex');
const quote = JSON.stringify;
const lockPath = path.join(os.tmpdir(), `cybernote-account109-${SERIAL}.lock`);
const visible = `e=>!!(e.getClientRects().length&&!e.closest('[hidden],[inert]')&&getComputedStyle(e).visibility!=='hidden')`;

export function assertInteractive() {
  const policy = run('shell', 'dumpsys', 'window', 'policy');
  if (!/\bshowing=false\b/.test(policy) || !/\binputRestricted=false\b/.test(policy)) throw Error('ANDROID_DEVICE_AUTH_REQUIRED');
  const resumed = run('shell', 'dumpsys', 'activity', 'activities').split('\n').find(line => line.includes('mResumedActivity:')) || '';
  if (!resumed.includes(`${PACKAGE}/`)) throw Error('ANDROID_OWNED_APP_NOT_FOREGROUND');
}

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

export async function connectAndroid({ WebSocketImpl = globalThis.WebSocket } = {}) {
  if (typeof WebSocketImpl !== 'function') throw Object.assign(Error('ANDROID_WEBSOCKET_UNAVAILABLE'), { code: 'ANDROID_WEBSOCKET_UNAVAILABLE' });
  // Exclusive live driver; stale locks are intentionally not deleted automatically.
  const lease = await acquireDriverLease(lockPath);
  let ws, owned;
  let id = 0;
  const pending = new Map();
  const diagnostics = { phase: 'connect', selector: null };
  const failure = (code, phase = diagnostics.phase, selector = diagnostics.selector) => Object.assign(Error(code), { code, phase, selector });
  const assertPid = () => { lease.assertOpen(); if (ownPid() !== owned.pid) throw failure('ANDROID_PID_CHANGED'); };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    lease.assertOpen();
    const call = ++id;
    const phase = `${diagnostics.phase}:${method}`, selector = diagnostics.selector;
    const timer = setTimeout(() => { pending.delete(call); reject(failure('ANDROID_CDP_TIMEOUT', phase, selector)); }, 15000);
    pending.set(call, { resolve, reject, timer, phase, selector });
    ws.send(JSON.stringify({ id: call, method, params }));
  });
  const evaluate = async expression => {
    assertPid();
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw failure('ANDROID_PAGE_EVALUATION_FAILED');
    return r.result?.value;
  };
  const close = ({ keepForward = false } = {}) => lease.close(async () => {
    ws?.close();
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('CDP closed')); }
    pending.clear();
    if (owned && !keepForward) await removeOwnedForward(owned);
  });
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
    ws = new WebSocketImpl(socketURL);
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
      if (message.error) call.reject(failure('ANDROID_CDP_COMMAND_REJECTED', call.phase, call.selector));
      else call.resolve(message.result);
    };
    const wait = async (check, label, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) { const result = await check(); if (result) return result; await pause(); }
      throw Object.assign(Error('ANDROID_UI_TIMEOUT'), { code: 'ANDROID_UI_TIMEOUT', phase: label, selector: diagnostics.selector });
    };
    const find = (selector, text) => `Array.from(document.querySelectorAll(${quote(selector)})).filter(${visible}).find(e=>${text === undefined ? 'true' : `e.textContent.trim()===${quote(text)}`})`;
    const has = (selector, text) => evaluate(`!!(${find(selector, text)})`);
    const click = async (selector, text) => {
      assertInteractive();
      diagnostics.phase = 'visible-control'; diagnostics.selector = selector;
      await wait(() => has(selector, text), 'visible control');
      const point = await evaluate(`(()=>{const e=${find(selector, text)};if(e.disabled)throw Error('disabled');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      await pause();
    };
    const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
      assertInteractive();
      diagnostics.phase = 'Input.dispatchKeyEvent';
      assertPid();
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers,
        ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
    };
    const type = async text => { assertInteractive(); diagnostics.phase = 'Input.insertText'; assertPid(); await send('Input.insertText', { text }); };
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
    const closeSettings = async () => { if (await has('[aria-label="关闭设置"]')) await click('[aria-label="关闭设置"]'); };
    const accountStatus = async () => {
      diagnostics.phase = 'account.status';
      const result = await evaluate(`window.__TAURI_INTERNALS__.invoke('account_command',{command:{type:'status'}}).catch(e=>({nativeErrorCode:typeof e?.code==='string'?e.code:null,nativeErrorKind:typeof e==='string'?(e.includes('WebviewWindow')?'webview-window-argument':e.includes('window')?'window-argument':'string-error'):e?.message==='此窗口不可管理账户'?'window-origin':e?.message==='账户窗口无效'?'window-url':'object-error'}))`);
      if (result.nativeErrorKind) throw Object.assign(failure('ANDROID_NATIVE_ACCOUNT_STATUS_REJECTED'), result);
      return result;
    };
    const openAccount = async () => {
      if (await has('.account-settings')) return;
      if (!await has('.preferences')) {
        if (await has('[aria-label="返回笔记"]')) await click('[aria-label="返回笔记"]');
        await click('[aria-label="设置"]');
      }
      if (!await has('[data-preferences-page="account"]') && await has('[aria-label="返回设置"]')) await click('[aria-label="返回设置"]');
      await click('[data-preferences-page="account"]');
      await wait(() => has('.account-settings'), 'account settings');
      await wait(async () => (await accountStatus()).state === await evaluate(`document.querySelector('.account-settings')?.dataset.accountState`), 'native account state rendered');
    };
    const api = {
      owned, diagnostics, close, readWorkspace, readNote, accountStatus, openAccount, closeSettings,
      async inspect() {
        return { ...owned, account: await accountStatus(), ui: await evaluate(`({ready:!!document.querySelector('.app'),state:document.querySelector('.account-settings')?.dataset.accountState||null,login:!!document.querySelector('.account-primary'),cancel:Array.from(document.querySelectorAll('.account-actions button')).some(e=>e.textContent.trim()==='取消登录')})`) };
      },
      async signIn() {
        await openAccount();
        await click('.account-settings .account-primary', '登录');
        return wait(async () => {const status = await accountStatus(); return status.state === 'authorizing' || status.state === 'error' ? status : false;}, 'native authorization started');
      },
      async cancelLogin() {
        await openAccount();
        await click('.account-settings .account-actions button', '取消登录');
        return wait(async () => {const status = await accountStatus(); return status.state === 'signedOut' && !status.profile && !status.error ? status : false;}, 'native authorization cancelled');
      },
      async createNote({ title, body }) {
        if (typeof title !== 'string' || !title.trim() || title.includes('\n') || typeof body !== 'string' || !body) throw Error('title and body required');
        diagnostics.createdNoteId = null;
        const before = new Set((await readWorkspace()).notes.map(n => n.id));
        await closeSettings();
        if (await has('[aria-label="返回笔记"]')) await click('[aria-label="返回笔记"]');
        await click('.mobile-add-note[aria-label="新建备忘录"]');
        diagnostics.phase = 'create-note.new-id'; diagnostics.selector = null;
        const created = await wait(async () => {
          const added = (await readWorkspace()).notes.filter(n => !before.has(n.id));
          if (added.length > 1) throw Object.assign(Error('ANDROID_CREATE_AMBIGUOUS'), { code: 'ANDROID_CREATE_AMBIGUOUS', phase: diagnostics.phase });
          return added[0] || false;
        }, 'new saved note identity');
        diagnostics.createdNoteId = created.id;
        const ownerSelector = `.tiptap[data-note-id=${quote(created.id)}][contenteditable="true"]`;
        diagnostics.phase = 'create-note.editor-ready';
        diagnostics.selector = ownerSelector;
        await wait(() => has(ownerSelector), 'exact new editor owner');
        await click(`${ownerSelector} h1`);
        await wait(() => evaluate(`document.activeElement?.closest('[data-note-id]')?.getAttribute('data-note-id')===${quote(created.id)}`), 'exact new editor focus');
        await type(title);
        for (const line of body.split('\n')) { await key('Enter', 'Enter', 13); if (line) await type(line); }
        // Blur through the real navigation handler to flush the editor's save path.
        await pause(900);
        await click('[aria-label="返回笔记"]');
        diagnostics.phase = 'create-note.persisted-full-body'; diagnostics.selector = null;
        return wait(async () => {
          const w = await readWorkspace();
          const note = w.notes.find(n => n.id === created.id && n.title === title && body.split('\n').every(line => (n.plainText || '').includes(line)));
          return note || false;
        }, 'persisted complete note');
      },
      async openNote(id) {
        await closeSettings();
        if (await has('[aria-label="返回笔记"]')) await click('[aria-label="返回笔记"]');
        await readNote(id);
        await click(`button.note-row[data-note-id=${quote(id)}]`);
      },
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
    return guardDriverMethods(api, lease);
  } catch (error) { await close(); throw error; }
}
