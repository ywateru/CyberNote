/** Host-only protocol/condition semantics; no Debugger/CDP/device execution. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { bundleURL, bundleSHA256, replyLocation, receiptLocation, replyCondition, receiptCondition, verifyResolvedSource, verifyReceiptResolvedSource, installReplyLogpoint } from './reply-logpoint.mjs';
const source = await readFile('/Users/water/work/2026/Apple-Notes-Clone/artifacts/sync88/android-dist/assets/index-Cd_C-xBt.js', 'utf8');
const key = '__NOTES_SYNC88_REPLY_LOGPOINT__';
const location = { scriptId: '21', lineNumber: 49, columnNumber: 227 };
const receiptResolved = { scriptId: '21', lineNumber: 48, columnNumber: 70577 };
let checks = 0;
const check = (name, value) => { assert(value, name); checks++; };
function fake(options = {}) {
  const window = {}, calls = [], breakpoints = new Map(), conditions = new Map(); let sourceReads = 0;
  const context = vm.createContext({ window, location: { origin: 'http://tauri.localhost' }, localStorage: { getItem: () => null } });
  const execute = (kind, reply) => { context.t = reply; try { return vm.runInContext(conditions.get(kind), context); } finally { delete context.t; } };
  const hit = reply => execute('reply', reply), hitReceipt = response => execute('receipt', response);
  const client = {
    read: async expression => vm.runInContext(expression, context),
    async send(method, params) {
      calls.push({ method, params });
      if (method === 'Debugger.enable') return {};
      if (method === 'Debugger.setBreakpointByUrl') {
        const receipt = params.lineNumber === receiptLocation.lineNumber, point = receipt ? receiptLocation : replyLocation, kind = receipt ? 'receipt' : 'reply';
        assert.equal(params.url, bundleURL); assert.equal(params.lineNumber, point.lineNumber); assert.equal(params.columnNumber, point.columnNumber);
        assert(!('urlRegex' in params)); conditions.set(kind, params.condition); breakpoints.set('owned-' + kind, params);
        // Original calls before BOTH exact source guards must remain uncounted.
        assert.equal(execute(kind, receipt ? { outcome: 'pending' } : { phase: 'prepare', ready: false }), false);
        return { breakpointId: 'owned-' + kind, locations: receipt ? options.receiptLocations || [receiptResolved] : options.locations || [location] };
      }
      if (method === 'Debugger.getScriptSource') { assert.equal(params.scriptId, '21'); sourceReads++; return { scriptSource: options.changedSource || options.changedSecondSource && sourceReads === 2 ? source + ' ' : source }; }
      if (method === 'Debugger.removeBreakpoint') { assert(['owned-reply', 'owned-receipt'].includes(params.breakpointId)); if (options.removeFailure || options.removeFirstOnly && params.breakpointId === 'owned-reply') throw Error('SECRET_CDP_ERROR'); breakpoints.delete(params.breakpointId); return {}; }
      throw Error('unexpected protocol method');
    },
  };
  return { window, calls, breakpoints, hit, hitReceipt, client };
}
{
  const f = fake(), observer = await installReplyLogpoint(f.client);
  check('source verified before activation; early call not counted', (await observer.snapshot()).counts.prepare.readyFalse === 0 && f.window[key].enabled === true);
  for (const reply of [{ phase: 'probe', blocked: true }, { phase: 'probe', blocked: false }, { phase: 'probe' }, { phase: 'prepare', ready: true }, { phase: 'prepare', ready: false }, { phase: 'prepare', ready: 'SECRET_READY' }, { phase: 'SECRET_PHASE' }]) {
    const before = JSON.stringify(reply); check('condition always false and original reply unchanged', f.hit(reply) === false && JSON.stringify(reply) === before);
  }
  const snapshot = await observer.snapshot();
  check('only original phase and boolean categories counted', snapshot.counts.probe.blockedTrue === 1 && snapshot.counts.probe.blockedFalse === 1 && snapshot.counts.probe.unknown === 1 && snapshot.counts.prepare.readyTrue === 1 && snapshot.counts.prepare.readyFalse === 1 && snapshot.counts.prepare.unknown === 1 && snapshot.counts.other === 1 && snapshot.receiptOutcomes.pending === 0);
  check('no raw args/phase/token/document/owner values serialized', !JSON.stringify(snapshot).includes('SECRET') && !JSON.stringify(snapshot).includes('owner') && snapshot.replyResultsObserved === false);
  const before = JSON.stringify(snapshot.counts); let getters = 0;
  const reply = { phase: 'prepare', expected: { sessionId: 'SECRET_TOKEN' }, operationId: 'SECRET_OPERATION', document: 'SECRET_DOC' };
  Object.defineProperty(reply, 'ready', { get() { getters++; throw Error('getter must not execute'); } });
  check('own descriptor does not execute ready getter', f.hit(reply) === false && getters === 0 && (await observer.snapshot()).counts.prepare.unknown === 2);
  const first = observer.cleanup(), second = observer.cleanup();
  check('cleanup idempotent with exact same promise', first === second);
  const result = await first;
  check('only own breakpoint and own state removed', result.disabled && result.breakpointRemoved && result.stateRemoved && result.breakpointsRemoved === 2 && f.breakpoints.size === 0 && !Object.prototype.hasOwnProperty.call(f.window, key));
  check('no pause/resume, emit/ACK, debugger-disable or app invoke protocol', f.calls.every(({ method }) => ['Debugger.enable', 'Debugger.setBreakpointByUrl', 'Debugger.getScriptSource', 'Debugger.removeBreakpoint'].includes(method)));
}
for (const options of [{ changedSource: true }, { locations: [] }, { locations: [location, location] }, { locations: [{ ...location, columnNumber: 231 }] }, { locations: [{ ...location, lineNumber: 50 }] }]) {
  const f = fake(options); let failure;
  try { await installReplyLogpoint(f.client); } catch (error) { failure = error; }
  check('mismatched source/location refuses disabled and cleans own instrumentation', failure?.message === 'reply logpoint installation refused' && failure.observationEnabled === false && failure.cleanup.breakpointRemoved && f.breakpoints.size === 0 && !f.window[key]);
}
{
  const f = fake({ removeFailure: true }), observer = await installReplyLogpoint(f.client);
  const result = await observer.cleanup();
  check('breakpoint removal failure explicit; condition still false with state gone', result.breakpointRemoved === false && result.disabled && result.stateRemoved && f.hit({ phase: 'prepare', ready: false }) === false);
}
{
  const f = fake(), observer = await installReplyLogpoint(f.client), replacement = { owner: 'NEWER_OWNER', enabled: false };
  Object.defineProperty(f.window, key, { value: replacement, configurable: true });
  const result = await observer.cleanup();
  check('cleanup preserves newer state owner', f.window[key] === replacement && result.disabled === false && result.stateRemoved === false && result.breakpointRemoved);
}
{
  const f = fake(), observer = await installReplyLogpoint(f.client);
  for (const outcome of ['pending', 'abort', 'commit', 'SECRET_OUTCOME', undefined]) {
    const response = { outcome, operationId: 'SECRET_OPERATION', expected: 'SECRET_TOKEN' }, before = JSON.stringify(response);
    assert.equal(f.hitReceipt(response), false); assert.equal(JSON.stringify(response), before);
  }
  let getters = 0; const response = {};
  Object.defineProperty(response, 'outcome', { get() { getters++; throw Error('must not execute outcome accessor'); } });
  assert.equal(f.hitReceipt(response), false);
  const snap = await observer.snapshot();
  check('receipt condition counts pending abort commit unknown without getters/raw retention', snap.receiptOutcomes.pending === 1 && snap.receiptOutcomes.abort === 1 && snap.receiptOutcomes.commit === 1 && snap.receiptOutcomes.unknown === 3 && getters === 0 && !JSON.stringify(snap).includes('SECRET') && snap.receiptOutcomesObserved && snap.replyExceptionsObserved === false);
  await observer.cleanup();
}
for (const options of [{ changedSecondSource: true }, { receiptLocations: [] }, { receiptLocations: [receiptResolved, receiptResolved] }, { receiptLocations: [{ ...receiptResolved, columnNumber: 70582 }] }, { receiptLocations: [{ ...receiptResolved, scriptId: '22' }] }]) {
  const f = fake(options); let failure;
  try { await installReplyLogpoint(f.client); } catch (error) { failure = error; }
  check('second-point failure never activates and cleans BOTH owned breakpoints', failure?.observationEnabled === false && failure.cleanup.breakpointsRemoved === 2 && failure.cleanup.breakpointRemoved && !f.window[key] && f.breakpoints.size === 0);
}
{
  const f = fake({ removeFirstOnly: true }), observer = await installReplyLogpoint(f.client); const result = await observer.cleanup();
  check('first cleanup error still removes second own breakpoint and disables conditions', result.breakpointsRemoved === 1 && result.breakpointRemoved === false && !f.breakpoints.has('owned-receipt') && result.disabled && result.stateRemoved && f.hitReceipt({ outcome: 'pending' }) === false);
}
check('exact receipt sourcepoint is accepted', verifyReceiptResolvedSource([receiptResolved], source) === true);
assert.throws(() => receiptCondition('arbitrary javascript'), /invalid tool owner/); checks++;
check('exact artifact source is accepted', verifyResolvedSource([location], source) === true && /^[0-9a-f]{64}$/.test(bundleSHA256));
assert.throws(() => replyCondition('arbitrary javascript'), /invalid tool owner/); checks++;
console.log(JSON.stringify({ passed: checks, scope: 'host-only fixed CDP protocol and false-condition semantics; no actual debugger/device, native original reply, transport or synchronization acceptance' }));
