/** Tool-only passive observation. Caller supplies the existing receipt/identity-
 * guarded native client; this module never connects, dispatches, inputs or ACKs. */
export const observerKey = '__NOTES_SYNC88_PASSIVE_OBSERVER__';

// Self-contained for evaluation in the owned production WebView, never bundled.
export async function installPageObserver() {
  const key = '__NOTES_SYNC88_PASSIVE_OBSERVER__';
  if (location.origin !== 'http://tauri.localhost' || typeof window.__NOTES_DEBUG__ !== 'undefined' || localStorage.getItem('notes-browser-preview') !== null)
    throw Error('observer requires actual production native page');
  if (Object.prototype.hasOwnProperty.call(window, key)) throw Error('observer already present');
  const internals = window.__TAURI_INTERNALS__, events = window.__TAURI_EVENT_PLUGIN_INTERNALS__;
  const descriptor = internals && Object.getOwnPropertyDescriptor(internals, 'invoke');
  if (!descriptor || typeof descriptor.value !== 'function' || !events || typeof events.unregisterListener !== 'function' || typeof internals.transformCallback !== 'function' || typeof internals.unregisterCallback !== 'function')
    throw Error('observer native interface unavailable');
  const original = descriptor.value;
  // Installed Tauri2.12.5 core.js defines invoke nonwritable/nonconfigurable.
  // Do not bypass that via ipc/callback wrappers or alter promise observation.
  const invokeImmutable = !descriptor.writable && !descriptor.configurable;
  const counts = { probe: 0, prepare: 0, release: 0, other: 0 };
  const releaseOutcomes = { commit: 0, abort: 0, unknown: 0 };
  const bump = name => { if (counts[name] < 1000000) counts[name]++; };
  const ownValue = (object, name) => {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) return undefined;
    return Object.getOwnPropertyDescriptor(object, name)?.value;
  };
  let active = true, listenerId, callbackId, cleanupFlight;
  let labels = { state: 'not-read', current: 'unknown', windows: [] };
  const label = value => value === 'main' ? 'main' : typeof value === 'string' && /^note-[0-9a-f-]{36}$/.test(value) ? 'note-window' : typeof value === 'string' && /^recording-[0-9a-f-]{36}$/.test(value) ? 'recording-window' : 'other-window';
  const passive = envelope => {
    if (!active) return;
    try {
      const payload = ownValue(envelope, 'payload'), phase = ownValue(payload, 'phase');
      bump(phase === 'probe' || phase === 'prepare' || phase === 'release' ? phase : 'other');
      if (phase === 'release') {
        const outcome = ownValue(payload, 'outcome');
        const name = outcome === 'commit' || outcome === 'abort' ? outcome : 'unknown';
        if (releaseOutcomes[name] < 1000000) releaseOutcomes[name]++;
      }
    } catch { bump('other'); }
  };
  const copy = () => ({ version: 1, active, eventCounts: { ...counts }, releaseOutcomes: { ...releaseOutcomes }, labels: { state: labels.state, current: labels.current, windows: [...labels.windows], nonMainLabelsRedacted: true }, replyObservation: { available: false, reason: invokeImmutable ? 'native-invoke-immutable' : 'not-installed', invokeImmutable } });
  const controller = {
    async snapshot() {
      if (active) {
        try {
          const rows = await Reflect.apply(original, internals, ['plugin:window|get_all_windows']);
          if (!Array.isArray(rows) || rows.length > 16 || rows.some(value => typeof value !== 'string')) throw Error('invalid window labels');
          labels = { state: 'read', current: label(internals.metadata?.currentWindow?.label), windows: rows.map(label) };
        } catch { labels = { state: 'unavailable', current: 'unknown', windows: [] }; }
      }
      return copy();
    },
    cleanup() {
      if (cleanupFlight) return cleanupFlight;
      active = false;
      cleanupFlight = (async () => {
        let localUnregistered = false, nativeUnregistered = false;
        try { events.unregisterListener('notes-sync', listenerId); localUnregistered = true; } catch { /* continue native cleanup */ }
        try { await Reflect.apply(original, internals, ['plugin:event|unlisten', { event: 'notes-sync', eventId: listenerId }]); nativeUnregistered = true; } catch { /* fixed failure state only */ }
        try { internals.unregisterCallback(callbackId); } catch { localUnregistered = false; }
        if (Object.getOwnPropertyDescriptor(window, key)?.value === controller) delete window[key];
        return { ...copy(), cleanup: { localUnregistered, nativeUnregistered } };
      })();
      return cleanupFlight;
    },
  };
  try {
    callbackId = internals.transformCallback(passive);
    if (!Number.isInteger(callbackId) || callbackId < 0 || callbackId > 4294967295) throw Error('invalid callback');
    listenerId = await Reflect.apply(original, internals, ['plugin:event|listen', { event: 'notes-sync', target: { kind: 'Any' }, handler: callbackId }]);
    if (!Number.isInteger(listenerId) || listenerId < 0 || listenerId > 4294967295) throw Error('invalid listener');
    if (Object.getOwnPropertyDescriptor(internals, 'invoke')?.value !== original || Object.prototype.hasOwnProperty.call(window, key)) throw Error('observer installation raced');
    Object.defineProperty(window, key, { configurable: true, value: controller });
    return copy();
  } catch {
    active = false;
    if (Number.isInteger(listenerId) && listenerId >= 0 && listenerId <= 4294967295) {
      try { events.unregisterListener('notes-sync', listenerId); } catch { /* bounded rollback */ }
      try { await Reflect.apply(original, internals, ['plugin:event|unlisten', { event: 'notes-sync', eventId: listenerId }]); } catch { /* fixed failure below */ }
    }
    if (Number.isInteger(callbackId)) { try { internals.unregisterCallback(callbackId); } catch { /* fixed failure below */ } }
    throw Error('observer installation failed');
  }
}

export const installExpression = '(' + installPageObserver.toString() + ')()';
export const snapshotExpression = 'window.__NOTES_SYNC88_PASSIVE_OBSERVER__.snapshot()';
export const cleanupExpression = 'window.__NOTES_SYNC88_PASSIVE_OBSERVER__.cleanup()';
export const installObserver = client => client.read(installExpression);
export const snapshotObserver = client => client.read(snapshotExpression);
export const cleanupObserver = client => client.read(cleanupExpression);
