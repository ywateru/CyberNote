import assert from 'node:assert/strict';

/** One synthetic browser participant, real Session begin/ACK/finish. The only
 * ACK comes from the production App's acknowledge_access invocation after its
 * save drain. No helper inserts a successful ACK. No OS/multiwindow claim. */
export function installRealImportBarrier(runtime, { timeoutMs = 10000, beforeBegin } = {}) {
  assert(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000);
  const backend = runtime.backend, raw = backend.call.bind(backend), records = [];
  let pending;
  const finish = async (operation, timeout) => {
    if (pending !== operation || operation.finishing) return;
    operation.finishing = true;
    clearTimeout(operation.timer);
    try {
      const row = await raw('debug_independent_finish_event', { operationId: operation.id, timeout });
      assert(row.ok, JSON.stringify(row.error));
      const { reply, event } = row.value;
      assert(typeof reply?.ok === 'boolean' && ['commit', 'abort'].includes(event?.phase));
      records.push({ kind: 'finish', operationId: operation.id, timeout, phase: event.phase, ok: reply.ok, code: reply.error?.code });
      operation.resolve({ ...row, ...reply, events: [...(row.events || []), { name: 'notes-access', payload: event }] });
    } catch (error) {
      operation.reject(error);
    } finally {
      if (pending === operation) pending = undefined;
    }
  };
  const wrapped = async (command, args = {}) => {
    if (command === 'import_archive') {
      assert(!pending, 'independent wrapper allows one pending import');
      if (beforeBegin) await beforeBegin();
      const begun = await raw('debug_access_begin', { action: { type: 'importArchive', path: args.path }, expected: args.expected });
      if (!begun.ok) return begun;
      const event = begun.value;
      assert(event.phase === 'prepare' && typeof event.operationId === 'string');
      let resolve, reject;
      const result = new Promise((yes, no) => { resolve = yes; reject = no; });
      const operation = pending = { id: event.operationId, resolve, reject, finishing: false };
      records.push({ kind: 'begin', operationId: operation.id, phase: event.phase, participants: event.participantWindows });
      operation.timer = setTimeout(() => { void finish(operation, true); }, timeoutMs);
      try {
        await runtime.page.evaluate(event => window.__DEBUG_PLATFORM__.emit('notes-access', event), event);
      } catch (error) {
        records.push({ kind: 'event-error', message: String(error) });
        await finish(operation, true);
      }
      return result;
    }
    if (command === 'acknowledge_access' && pending) {
      const operation = pending;
      assert.equal(args.operationId, operation.id, 'App ACK operation identity');
      assert.equal(typeof args.success, 'boolean', 'App ACK must carry actual boolean');
      records.push({ kind: 'app-ack', operationId: operation.id, success: args.success });
      const row = await raw('debug_access_ack', args);
      if (row.ok) await finish(operation, false);
      else await finish(operation, true);
      return row;
    }
    return raw(command, args);
  };
  backend.call = wrapped;
  return {
    records,
    raw,
    get pending() { return pending?.id || null; },
    restore() { assert(!pending, 'cannot remove adapter during pending Session import'); backend.call = raw; },
  };
}
