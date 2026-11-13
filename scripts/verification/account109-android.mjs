/** Fixed Account109 Samsung driver derived from the committed Sync108 helper.
 * Note writes use visible product controls and CDP Input. Two fixed account
 * sync controls also use production IPC, explicitly bypassing UI confirmation.
 * Fixed synthetic attachments use the existing debug File[] submission path,
 * only for a note successfully created by this driver. No system picker claim.
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
const loginFailure = code => Object.assign(Error(code), {code,phase:'login-surfaces'});
const resumedLine = output => output.split('\n').find(line => line.includes('mResumedActivity:')) || '';
export function loginForeground(output) {
  const line=resumedLine(output),component=line.match(/\s([\w.]+)\/[\w.$]+/),pkg=component?.[1];
  return {owned:pkg===PACKAGE,browser:['com.android.chrome','com.sec.android.app.sbrowser','org.mozilla.firefox'].includes(pkg)};
}
function assertUnlocked() {
  const policy=run('shell','dumpsys','window','policy');
  if(!/\bshowing=false\b/.test(policy)||!/\binputRestricted=false\b/.test(policy))throw loginFailure('ANDROID_DEVICE_AUTH_REQUIRED');
}

// Pure policies; callbacks below are fixtures in tests, fixed private effects live.
export function loginRadioPolicy(radios,surface,explicit) {
  if(!['embedded','browser'].includes(surface)||typeof explicit!=='boolean')throw loginFailure('ANDROID_LOGIN_SURFACE_INVALID');
  if(!Array.isArray(radios))throw loginFailure('ANDROID_LOGIN_RADIOS_INVALID');
  if(!radios.length){if(surface!=='browser'||explicit)throw loginFailure('ANDROID_LOGIN_RADIOS_REQUIRED');return false;}
  if(radios.length!==2||radios.some((r,i)=>r.value!==['embedded','browser'][i]||r.label!==['应用内登录','系统浏览器'][i]||r.disabled!==false||r.visible!==true))throw loginFailure('ANDROID_LOGIN_RADIOS_INVALID');
  return true;
}
export function loginControls({open,radios,select,clickLogin,status,wait}) {
  return {async signIn(...args){
    if(args.length>1||(args.length&&!['embedded','browser'].includes(args[0])))throw loginFailure('ANDROID_LOGIN_SURFACE_INVALID');
    const surface=args[0]??'browser';await open();
    if(loginRadioPolicy(await radios(),surface,args.length===1))await select(surface);
    await clickLogin();
    return wait(async()=>{const s=await status();return ['authorizing','error'].includes(s.state)?s:false;},'native authorization started');
  }};
}

function nativeAuthTree(xml) {
  if(typeof xml!=='string'||xml.length>2_000_000||!/\<hierarchy\b/.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw loginFailure('ANDROID_NATIVE_XML_INVALID');
  const decode=s=>s.replace(/&(?:quot|apos|lt|gt|amp);/g,v=>({'&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&amp;':'&'}[v]));
  const stack=[],nodes=[];
  for(const token of xml.matchAll(/<node\b([^>]*?)(\/?)>|<\/node>/g)){
    if(token[0]==='</node>'){if(!stack.length)throw loginFailure('ANDROID_NATIVE_XML_INVALID');stack.pop();continue;}
    const attrs=Object.fromEntries([...token[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])]));
    const bounds=attrs.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)?.slice(1).map(Number);
    const shown=attrs['visible-to-user']!=='false'&&bounds?.[2]>bounds?.[0]&&bounds?.[3]>bounds?.[1]&&stack.every(n=>n.shown);
    const webOwner=stack.findLast(n=>n.attrs.class==='android.webkit.WebView');
    const n={attrs,bounds,shown,inWeb:!!webOwner,webOwner};nodes.push(n);if(!token[2])stack.push(n);
  }
  if(stack.length||!nodes.length)throw loginFailure('ANDROID_NATIVE_XML_INVALID');
  const nativeButton=label=>nodes.filter(n=>!n.inWeb&&n.shown&&n.attrs.package===PACKAGE&&n.attrs.class==='android.widget.Button'&&n.attrs.text===label&&n.attrs.enabled==='true'&&n.attrs.clickable==='true');
  const continuing=nativeButton('在浏览器中继续'),cancel=nativeButton('取消登录');
  const web=nodes.filter(n=>!n.inWeb&&n.shown&&n.attrs.class==='android.webkit.WebView'&&n.attrs.package===PACKAGE);
  const ownFormNode=n=>web.length===1&&n.webOwner===web[0]&&n.attrs.package===PACKAGE&&n.shown;
  const editable=nodes.some(n=>ownFormNode(n)&&n.attrs.class==='android.widget.EditText');
  const formAction=nodes.some(n=>ownFormNode(n)&&['Sign in','Continue','Next','登录','继续','下一步'].includes(n.attrs.text)&&n.attrs.enabled==='true'&&n.attrs.clickable==='true');
  const safe={dialog:continuing.length===1&&cancel.length===1,webView:web.length===1,hostedForm:editable&&formAction};
  return {safe,continuing};
}
export function nativeLoginProjection(xml){return nativeAuthTree(xml).safe;}
export function nativeLoginControls({capture,guard,back,tap}) {
  async function checked(){await guard();const tree=nativeAuthTree(await capture());await guard();if(!Object.values(tree.safe).every(v=>v===true))throw loginFailure('ANDROID_NATIVE_LOGIN_FORM_REQUIRED');return tree;}
  return {
    async nativeLoginPresentation(){await guard();const result=nativeAuthTree(await capture()).safe;await guard();return result;},
    async closeNativeLogin(){await checked();await guard();await back();return {action:'native-back',ownedDialog:true};},
    async continueNativeLogin(){const t=await checked(),[x1,y1,x2,y2]=t.continuing[0].bounds;await guard();await tap(Math.floor((x1+x2)/2),Math.floor((y1+y2)/2));return {action:'native-toolbar-continue',ownedDialog:true};}
  };
}

export function assertInteractive() {
  const policy = run('shell', 'dumpsys', 'window', 'policy');
  if (!/\bshowing=false\b/.test(policy) || !/\binputRestricted=false\b/.test(policy)) throw Object.assign(Error('ANDROID_DEVICE_AUTH_REQUIRED'), {code:'ANDROID_DEVICE_AUTH_REQUIRED'});
  const resumed = run('shell', 'dumpsys', 'activity', 'activities').split('\n').find(line => line.includes('mResumedActivity:')) || '';
  if (!resumed.includes(`${PACKAGE}/`)) throw Object.assign(Error('ANDROID_OWNED_APP_NOT_FOREGROUND'), {code:'ANDROID_OWNED_APP_NOT_FOREGROUND'});
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
  if (ownedForwardPresent(owned)) {
    run('forward', '--remove', owned.local);
    return true;
  }
  return false;
}

export function ownedForwardPresent(owned) {
  if (owned.serial !== SERIAL || owned.package !== PACKAGE ||
      !Number.isInteger(owned.pid) || !/^tcp:\d+$/.test(owned.local) ||
      owned.remote !== `localabstract:webview_devtools_remote_${owned.pid}`) {
    throw Error('Invalid owned mapping');
  }
  const exact = `${SERIAL} ${owned.local} ${owned.remote}`;
  return run('forward', '--list').trim().split('\n').includes(exact);
}

// No caller-supplied command types or account payloads escape this boundary.
export function accountSyncControls(invoke) {
  return {
    async setEnabled(...args) {
      if (args.length !== 1 || typeof args[0] !== 'boolean') throw Error('ANDROID_INVALID_ACCOUNT_ARGUMENTS');
      return invoke({ type: 'setEnabled', enabled: args[0] });
    },
    async syncNow(...args) {
      if (args.length) throw Error('ANDROID_INVALID_ACCOUNT_ARGUMENTS');
      return invoke({ type: 'syncNow' });
    },
  };
}

export function installedApkPath(output) {
  const lines=output.trim().split('\n');
  if(lines.length!==1||!/^package:\/data\/app\/[A-Za-z0-9_.+=/-]+\/base\.apk$/.test(lines[0])||lines[0].split('/').includes('..'))throw Object.assign(Error('ANDROID_APK_PATH_INVALID'),{code:'ANDROID_APK_PATH_INVALID'});
  return lines[0].slice('package:'.length);
}

// Immutable, credential-free, bounded fixtures. Callers cannot supply file bytes,
// names, paths, command IDs or expressions to the live driver method.
export const PHONE_FILES = Object.freeze([
  Object.freeze({name:'account109-phone.png',mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII='}),
  Object.freeze({name:'account109-phone.bin',mime:'application/octet-stream',base64:Buffer.from(Array.from({length:4096},(_,i)=>(i*17+3)%256)).toString('base64')}),
]);
const noteId = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const fileFailure = code => Object.assign(Error(code), {code,phase:'phone-origin-files'});

// Fixed browser program, also exercised in a device-free VM fixture. Capability
// and live selected/authorized editor owner are checked before any mutation.
export function phoneFileSubmission(id) {
  if (!noteId(id)) throw fileFailure('ANDROID_FILE_NOTE_INVALID');
  return `(async()=>{
    const debug=window.__NOTES_DEBUG__,id=${quote(id)};
    if(debug?.version!==1||typeof debug.execute!=='function'||typeof debug.list!=='function'||typeof debug.waitForIdle!=='function')return {code:'ANDROID_FILE_CAPABILITY_REQUIRED'};
    try {
      const commands=debug.list();
      if(!['app.state','attachment.submit','app.flush'].every(id=>commands.some(c=>c.id===id&&c.available===true)))return {code:'ANDROID_FILE_CAPABILITY_REQUIRED'};
      const state=(await debug.execute('app.state')).result;
      const editor=document.querySelector('.tiptap[data-note-id="'+id+'"][contenteditable="true"]');
      if(state.selection?.noteId!==id||!state.workspace?.access?.notes?.[id]?.authorized||!editor||!editor.getClientRects().length)return {code:'ANDROID_FILE_OWNER_REQUIRED'};
      await debug.execute('attachment.submit',${quote({files:PHONE_FILES})});
      await debug.execute('app.flush');await debug.waitForIdle({timeoutMs:10000});
      return {submitted:true};
    } catch {return {code:'ANDROID_FILE_SUBMIT_REJECTED'};}
  })()`;
}

// Private new-note receipts are recorded only after createNote's real UI/save
// succeeds. Test callbacks stand in for effects; they are not live driver APIs.
export function phoneFileControls({readWorkspace,openNote,submit}) {
  const created = new Map();
  return {
    created(note) {
      if (!noteId(note?.id) || created.has(note.id)) throw fileFailure('ANDROID_FILE_NOTE_INVALID');
      created.set(note.id, JSON.stringify({document:note.document,plainText:note.plainText}));
    },
    async submitNoteFiles(...args) {
      const [id]=args;
      if(args.length!==1||!noteId(id)||!created.has(id))throw fileFailure('ANDROID_FILE_NEW_NOTE_REQUIRED');
      const before=created.get(id);created.delete(id); // One attempt, including failure.
      const check=async()=>{
        const ws=await readWorkspace(),notes=ws.notes.filter(n=>n.id===id&&!n.deletedAt);
        if(notes.length!==1||JSON.stringify({document:notes[0].document,plainText:notes[0].plainText})!==before||ws.attachments.some(a=>a.noteId===id)||!ws.access?.notes?.[id]?.authorized)throw fileFailure('ANDROID_FILE_OWNER_REQUIRED');
      };
      await check();await openNote(id);await check();
      const result=await submit(id);
      if(result?.submitted!==true)throw fileFailure(['ANDROID_FILE_CAPABILITY_REQUIRED','ANDROID_FILE_OWNER_REQUIRED','ANDROID_FILE_SUBMIT_REJECTED'].includes(result?.code)?result.code:'ANDROID_FILE_SUBMIT_REJECTED');
      const ws=await readWorkspace(),note=ws.notes.find(n=>n.id===id&&!n.deletedAt);
      if(!note)throw fileFailure('ANDROID_FILE_OWNER_REQUIRED');
      return note;
    },
  };
}

export async function connectAndroid({ WebSocketImpl = globalThis.WebSocket, launch = false } = {}) {
  if (typeof launch !== 'boolean') throw Error('ANDROID_INVALID_LAUNCH_ARGUMENT');
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
    // Launch only after taking the same lease used for CDP. Never race another
    // operator's phone session, and never force-stop/restart the package here.
    if (launch) { launchAndroid(); assertInteractive(); }
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
    const phoneFiles=phoneFileControls({readWorkspace,openNote:async id=>{
      await api.openNote(id);
      const selector=`.tiptap[data-note-id=${quote(id)}][contenteditable="true"]`;
      await wait(()=>has(selector),'phone file exact editor owner');
      await click(selector);await key('End','End',35,2);
    },submit:async id=>{
      assertInteractive();diagnostics.phase='phone-origin-files';diagnostics.selector=null;
      return evaluate(phoneFileSubmission(id));
    }});
    const login=loginControls({open:openAccount,status:accountStatus,wait,
      radios:()=>evaluate(`Array.from(document.querySelectorAll('.account-settings input[name="account-login-surface"]')).map(r=>({value:r.value,label:r.closest('label')?.textContent.trim(),disabled:r.matches(':disabled'),visible:r.getClientRects().length>0}))`),
      select:async surface=>{await click(`.account-settings input[name="account-login-surface"][value="${surface}"]`);if(!await evaluate(`document.querySelector('.account-settings input[name="account-login-surface"][value="${surface}"]')?.checked===true`))throw loginFailure('ANDROID_LOGIN_RADIO_NOT_SELECTED');},
      clickLogin:()=>click('.account-settings .account-primary','登录')});
    const nativeLogin=nativeLoginControls({guard:()=>{assertPid();assertInteractive();},capture:()=>run('shell','-tt','uiautomator','dump','/dev/tty'),back:()=>run('shell','input','keyevent','KEYCODE_BACK'),tap:(x,y)=>run('shell','input','tap',String(x),String(y))});
    const api = {
      owned, diagnostics, close, readWorkspace, readNote, accountStatus, openAccount, closeSettings,
      ...login,...nativeLogin,
      async externalLoginActivity(){assertPid();assertUnlocked();return loginForeground(run('shell','dumpsys','activity','activities'));},
      async returnFromLoginBrowser(){assertPid();assertUnlocked();if(!loginForeground(run('shell','dumpsys','activity','activities')).browser)throw loginFailure('ANDROID_LOGIN_BROWSER_REQUIRED');const s=await accountStatus();if(s.state!=='authorizing'||s.authorizationSurface!=='browser'||s.error)throw loginFailure('ANDROID_LOGIN_BROWSER_REQUIRED');assertPid();launchAndroid();assertInteractive();},
      async reclaimSignedOut(){assertPid();assertInteractive();const s=await accountStatus();if(s.state!=='signedOut'||s.enabled!==false||s.profile||s.error||s.authorizationSurface!==undefined||s.conflictCount!==0||!Array.isArray(s.devices)||s.devices.some(d=>d.connected))throw loginFailure('ANDROID_CLEAN_SIGNED_OUT_REQUIRED');assertPid();const background=backgroundAndroid();assertPid();const reclaimed=await reclaimBackgroundAndroid();if(background.pid!==owned.pid||reclaimed.oldPid!==owned.pid)throw loginFailure('ANDROID_PID_CHANGED');return {oldPid:owned.pid,action:'am kill background package',forceStop:false};},
      submitNoteFiles:phoneFiles.submitNoteFiles,
      ...accountSyncControls(async command => {
        assertInteractive();
        diagnostics.phase = `account.${command.type}`; diagnostics.selector = null;
        return evaluate(`window.__TAURI_INTERNALS__.invoke('account_command',${quote({ command })})`);
      }),
      async artifactIdentity() {
        assertPid();
        const apkPath=installedApkPath(run('shell', 'pm', 'path', PACKAGE));
        const apkSha256 = run('shell', 'sha256sum', apkPath).trim().split(/\s+/)[0];
        if (!/^[a-f0-9]{64}$/.test(apkSha256)) throw failure('ANDROID_APK_HASH_INVALID');
        return { package: PACKAGE, apkSha256, sourceRevision: 'unverified' };
      },
      async inspect() {
        return { ...owned, account: await accountStatus(), ui: await evaluate(`({ready:!!document.querySelector('.app'),state:document.querySelector('.account-settings')?.dataset.accountState||null,login:!!document.querySelector('.account-primary'),cancel:Array.from(document.querySelectorAll('.account-actions button')).some(e=>e.textContent.trim()==='取消登录')})`) };
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
        const saved=await wait(async () => {
          const w = await readWorkspace();
          const note = w.notes.find(n => n.id === created.id && n.title === title && body.split('\n').every(line => (n.plainText || '').includes(line)));
          return note || false;
        }, 'persisted complete note');
        phoneFiles.created(saved);
        return saved;
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
        if (!w.access?.notes?.[attachment.noteId]?.authorized) throw fileFailure('ANDROID_FILE_OWNER_REQUIRED');
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
