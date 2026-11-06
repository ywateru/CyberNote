/** Tool-only first-class DevTools conditional logpoint, no IPC monkeypatch. */
import { createHash, randomBytes } from 'node:crypto';
export const bundleURL = 'http://tauri.localhost/assets/index-Cd_C-xBt.js';
export const bundleSHA256 = '9db1203eb6fdf37ceb7338541943c28671f40645ec3af453d94788f836c374cf';
export const replyLocation = Object.freeze({ lineNumber: 49, columnNumber: 224 });
const key = '__NOTES_SYNC88_REPLY_LOGPOINT__';
const ref = owner => `(()=>{const c=Object.getOwnPropertyDescriptor(window,${JSON.stringify(key)})?.value;return c?.owner===${JSON.stringify(owner)}?c:null})()`;
const setup = owner => `(()=>{if(location.origin!=='http://tauri.localhost'||typeof window.__NOTES_DEBUG__!=='undefined'||localStorage.getItem('notes-browser-preview')!==null)throw Error('native page required');if(Object.prototype.hasOwnProperty.call(window,${JSON.stringify(key)}))throw Error('logpoint already present');Object.defineProperty(window,${JSON.stringify(key)},{configurable:true,value:{owner:${JSON.stringify(owner)},enabled:false,counts:{probe:{blockedTrue:0,blockedFalse:0,unknown:0},prepare:{readyTrue:0,readyFalse:0,unknown:0},other:0}}});return true})()`;
const activate = owner => `(()=>{const c=${ref(owner)};if(!c)throw Error('logpoint owner changed');c.enabled=true;return true})()`;
const disable = owner => `(()=>{const c=${ref(owner)};if(!c)return false;c.enabled=false;return true})()`;
const drop = owner => `(()=>{const c=${ref(owner)};if(!c)return false;delete window[${JSON.stringify(key)}];return true})()`;
const snapshot = owner => `(()=>{const c=${ref(owner)};if(!c)throw Error('logpoint owner changed');return{enabled:c.enabled,counts:{probe:{...c.counts.probe},prepare:{...c.counts.prepare},other:c.counts.other},sourceVerified:true,replyResultsObserved:false}})()`;
export function replyCondition(owner) {
  if (typeof owner !== 'string' || !/^[a-f0-9]{32}$/.test(owner)) throw Error('invalid tool owner');
  return `(()=>{try{const c=${ref(owner)};if(c?.enabled){const phase=Object.getOwnPropertyDescriptor(t,'phase')?.value;if(phase==='probe'){const blocked=Object.getOwnPropertyDescriptor(t,'blocked')?.value;const n=blocked===true?'blockedTrue':blocked===false?'blockedFalse':'unknown';if(c.counts.probe[n]<1000000)c.counts.probe[n]++}else if(phase==='prepare'){const ready=Object.getOwnPropertyDescriptor(t,'ready')?.value;const n=ready===true?'readyTrue':ready===false?'readyFalse':'unknown';if(c.counts.prepare[n]<1000000)c.counts.prepare[n]++}else if(c.counts.other<1000000)c.counts.other++}}catch{}return false})()`;
}
export function verifyResolvedSource(locations, source) {
  if (!Array.isArray(locations) || locations.length !== 1) throw Error('logpoint source location unresolved');
  const location = locations[0];
  if (typeof location.scriptId !== 'string' || !/^[0-9]{1,12}$/.test(location.scriptId) || location.lineNumber !== 49 || !Number.isInteger(location.columnNumber) || location.columnNumber < 224 || location.columnNumber > 230)
    throw Error('logpoint source location changed');
  if (typeof source !== 'string' || createHash('sha256').update(source, 'utf8').digest('hex') !== bundleSHA256) throw Error('logpoint source hash changed');
  return true;
}

/** Only accepts the existing app-identity guarded client.send/client.read.
 * Caller cannot supply an expression, URL, source, location, reply or target. */
export async function installReplyLogpoint(client) {
  const owner = randomBytes(16).toString('hex');
  let breakpointId, stateInstalled = false, enabled = false, cleanupFlight;
  const cleanup = () => {
    if (cleanupFlight) return cleanupFlight;
    cleanupFlight = (async () => {
      let disabled = !stateInstalled, breakpointRemoved = !breakpointId, stateRemoved = !stateInstalled;
      if (stateInstalled) { try { disabled = await client.read(disable(owner)); } catch { /* fixed cleanup flags */ } }
      if (breakpointId) { try { await client.send('Debugger.removeBreakpoint', { breakpointId }); breakpointRemoved = true; } catch { /* no pause/resume or global Debugger.disable */ } }
      if (stateInstalled) { try { stateRemoved = await client.read(drop(owner)); } catch { /* preserve newer owner */ } }
      return { disabled, breakpointRemoved, stateRemoved };
    })();
    return cleanupFlight;
  };
  try {
    await client.send('Debugger.enable');
    // Even a lost evaluate response may have installed our state; own-token
    // cleanup remains safe when setup rejected before publication.
    stateInstalled = true;
    if (await client.read(setup(owner)) !== true) throw Error('logpoint setup refused');
    const installed = await client.send('Debugger.setBreakpointByUrl', { url: bundleURL, ...replyLocation, condition: replyCondition(owner) });
    if (typeof installed.breakpointId !== 'string' || installed.breakpointId.length < 1 || installed.breakpointId.length > 512) throw Error('logpoint id invalid');
    breakpointId = installed.breakpointId;
    if (!Array.isArray(installed.locations) || installed.locations.length !== 1) throw Error('logpoint source location unresolved');
    // Still disabled: mismatched scripts never produce observations or pauses.
    const location = installed.locations[0];
    if (typeof location.scriptId !== 'string' || !/^[0-9]{1,12}$/.test(location.scriptId) || location.lineNumber !== 49 || !Number.isInteger(location.columnNumber) || location.columnNumber < 224 || location.columnNumber > 230) throw Error('logpoint source location changed');
    const fetched = await client.send('Debugger.getScriptSource', { scriptId: location.scriptId });
    verifyResolvedSource(installed.locations, fetched.scriptSource);
    if (await client.read(activate(owner)) !== true) throw Error('logpoint activation refused');
    enabled = true;
    return { snapshot: () => client.read(snapshot(owner)), cleanup };
  } catch {
    const cleanupResult = await cleanup();
    const error = Error('reply logpoint installation refused');
    error.cleanup = cleanupResult; error.observationEnabled = enabled;
    throw error;
  }
}
