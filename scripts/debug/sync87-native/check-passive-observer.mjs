/** Host-only semantics: no CDP, ADB, networking, Store, devices or processes. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installExpression, snapshotExpression, cleanupExpression, observerKey } from './passive-observer.mjs';
let checks = 0;
const check = (name, value) => { assert(value, name); checks++; };
function host(options = {}) {
  const callbacks = new Map(), listeners = new Map([[1, 100]]), calls = [];
  let next = 100, eventId = 1, appEvents = 0;
  callbacks.set(100, () => { appEvents++; });
  const internals = {
    metadata: { currentWindow: { label: 'main' } },
    transformCallback(fn) { const id = ++next; callbacks.set(id, fn); return id; },
    unregisterCallback(id) { callbacks.delete(id); },
  };
  function original(...args) {
    assert.equal(this, internals); calls.push(args);
    if (args[0] === 'plugin:event|listen') {
      if (options.listenReject) return Promise.reject(options.listenReject);
      assert.equal(args[1].event, 'notes-sync'); assert.deepEqual(JSON.parse(JSON.stringify(args[1].target)), { kind: 'Any' });
      const id = ++eventId; listeners.set(id, args[1].handler); return Promise.resolve(id);
    }
    if (args[0] === 'plugin:event|unlisten') {
      if (options.unlistenReject) return Promise.reject(options.unlistenReject);
      assert.equal(args[1].event, 'notes-sync'); listeners.delete(args[1].eventId); return Promise.resolve();
    }
    if (args[0] === 'plugin:window|get_all_windows') {
      if (options.labelsReject) return Promise.reject(options.labelsReject);
      return Promise.resolve(options.labels || ['main']);
    }
    if (args[0] === 'sync_window_reply') return options.originalResult;
    throw Error('unexpected original IPC');
  }
  Object.defineProperty(internals, 'invoke', { value: original }); // exact Tauri immutable shape
  const win = {
    __TAURI_INTERNALS__: internals,
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener(event, id) { assert.equal(event, 'notes-sync'); const callback = listeners.get(id); if (callback !== undefined) callbacks.delete(callback); } },
  };
  const context = vm.createContext({ window: win, location: { origin: options.origin || 'http://tauri.localhost' }, localStorage: { getItem: () => null } });
  const evaluate = expression => vm.runInContext(expression, context);
  const emitEnvelope = envelope => { for (const id of listeners.values()) callbacks.get(id)?.(envelope); };
  const emit = phase => emitEnvelope({ payload: { phase, operationId: 'DO_NOT_RETAIN_OPERATION', sessionId: 'DO_NOT_RETAIN_SESSION', document: 'DO_NOT_RETAIN_DOCUMENT' } });
  return { win, internals, original, calls, callbacks, listeners, evaluate, emit, emitEnvelope, get appEvents() { return appEvents; } };
}
{
  const h = host(); const descriptor = Object.getOwnPropertyDescriptor(h.internals, 'invoke');
  const installed = await h.evaluate(installExpression);
  check('actual immutable invoke interface admitted without replacement', h.internals.invoke === h.original && Object.getOwnPropertyDescriptor(h.internals, 'invoke').writable === false && installed.replyObservation.reason === 'native-invoke-immutable');
  check('only own passive listener added alongside existing application listener', h.listeners.size === 2 && h.listeners.get(1) === 100 && h.callbacks.size === 2);
  for (const phase of ['probe', 'prepare', 'release', 'foreign']) h.emit(phase);
  const snapshot = await h.evaluate(snapshotExpression);
  check('passive real event phases counted without suppressing original listener', snapshot.eventCounts.probe === 1 && snapshot.eventCounts.prepare === 1 && snapshot.eventCounts.release === 1 && snapshot.eventCounts.other === 1 && h.appEvents === 4);
  check('actual readonly labels returned; no guessed label list', snapshot.labels.state === 'read' && snapshot.labels.current === 'main' && snapshot.labels.windows.join() === 'main' && h.calls.at(-1)[0] === 'plugin:window|get_all_windows');
  const safe = JSON.stringify(snapshot);
  check('event/token/document identities not serialized or retained in snapshot', !safe.includes('DO_NOT_RETAIN') && !safe.includes('operationId') && !safe.includes('sessionId'));
  const before = h.calls.length;
  await assert.rejects(h.evaluate(installExpression), /observer already present/);
  check('duplicate installation refuses before native call', h.calls.length === before);
  const controller = h.win[observerKey], first = controller.cleanup(), second = controller.cleanup();
  check('cleanup is idempotent same promise', first === second);
  const closed = await first;
  check('cleanup removes own listener/callback/global only', h.listeners.size === 1 && h.listeners.get(1) === 100 && h.callbacks.size === 1 && h.win[observerKey] === undefined && closed.cleanup.nativeUnregistered && closed.cleanup.localUnregistered);
  h.emit('probe');
  check('original app subscription survives cleanup; observer stops counting', h.appEvents === 5 && closed.eventCounts.probe === 1);
  assert.deepEqual(Object.getOwnPropertyDescriptor(h.internals, 'invoke'), descriptor); checks++;
  check('module never invokes sync replies, emits, workspace or participant mutation', h.calls.every(args => ['plugin:event|listen', 'plugin:event|unlisten', 'plugin:window|get_all_windows'].includes(args[0])));
}
{
  const sentinel = {}, result = Promise.resolve(sentinel), h = host({ originalResult: result });
  await h.evaluate(installExpression);
  const args = { reply: { phase: 'prepare' }, expected: { sessionId: 'SECRET_TOKEN' } }, options = {};
  const returned = h.internals.invoke('sync_window_reply', args, options);
  check('original invoke/promise/argument references/receiver unchanged', returned === result && h.calls.at(-1)[1] === args && h.calls.at(-1)[2] === options && await returned === sentinel);
  await h.evaluate(cleanupExpression);
}
{
  const h = host({ labels: ['main', 'note-11111111-1111-4111-8111-111111111111', 'SECRET_FOREIGN_LABEL'] });
  await h.evaluate(installExpression); const snapshot = await h.evaluate(snapshotExpression);
  check('nonmain labels have bounded categories without note/unknown identity leak', snapshot.labels.windows.join() === 'main,note-window,other-window' && !JSON.stringify(snapshot).includes('SECRET') && !JSON.stringify(snapshot).includes('11111111'));
  const own = h.win[observerKey], replacement = {}; Object.defineProperty(h.win, observerKey, { configurable: true, value: replacement });
  await own.cleanup(); check('cleanup preserves newer global owner', h.win[observerKey] === replacement);
}
{
  const h = host({ listenReject: { code: 'SECRET_NATIVE_ERROR' } });
  await assert.rejects(h.evaluate(installExpression), error => error.message === 'observer installation failed');
  check('listen failure releases only own callback without leaking raw error', h.callbacks.size === 1 && h.listeners.size === 1 && h.win[observerKey] === undefined);
}
{
  const h = host({ labelsReject: Error('SECRET'), unlistenReject: Error('SECRET') });
  await h.evaluate(installExpression); const snap = await h.evaluate(snapshotExpression); const closed = await h.evaluate(cleanupExpression);
  check('read failure fixed shape and cleanup error explicit, not raw', snap.labels.state === 'unavailable' && closed.cleanup.nativeUnregistered === false && closed.cleanup.localUnregistered === true && !JSON.stringify(closed).includes('SECRET'));
  check('failed native cleanup cannot continue counting callbacks', h.callbacks.size === 1 && closed.active === false);
}
{
  const h = host({ origin: 'https://example.invalid' });
  await assert.rejects(h.evaluate(installExpression), /actual production native page/);
  check('foreign origin refuses without any native call', h.calls.length === 0);
}
{
  const h = host(); await h.evaluate(installExpression);
  for (const outcome of ['commit', 'abort', 'SECRET_UNKNOWN_OUTCOME', undefined]) h.emitEnvelope({ payload: { phase: 'release', outcome } });
  h.emitEnvelope({ payload: { phase: 'prepare', outcome: 'commit' } });
  const snap = await h.evaluate(snapshotExpression);
  check('release outcome counts use fixed commit abort unknown categories only', snap.releaseOutcomes.commit === 1 && snap.releaseOutcomes.abort === 1 && snap.releaseOutcomes.unknown === 2 && snap.eventCounts.release === 4 && !JSON.stringify(snap).includes('SECRET'));
  await h.evaluate(cleanupExpression);
}
{
  const h = host(); await h.evaluate(installExpression); let getterCalls = 0;
  const payload = { phase: 'release' }; Object.defineProperty(payload, 'outcome', { get() { getterCalls++; throw Error('must not execute outcome getter'); } });
  h.emitEnvelope({ payload });
  const snap = await h.evaluate(snapshotExpression);
  check('outcome accessor never executes and is counted as unknown', getterCalls === 0 && snap.releaseOutcomes.unknown === 1 && snap.eventCounts.release === 1 && h.appEvents === 1);
  await h.evaluate(cleanupExpression);
}
console.log(JSON.stringify({ passed: checks, scope: 'host-only passive listener semantics and exact immutable Tauri invoke shape; no actual native callback delivery, device, network, database or product change' }));
