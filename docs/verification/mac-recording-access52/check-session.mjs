import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Actual production Session. Only external media promises and timers are fake.
const source = await readFile('src/recording-session.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { RecordingSession } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
let timers = new Map(), sequence = 0;
globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 45000); const id = ++sequence; timers.set(id, fn); return id; };
globalThis.clearTimeout = (id) => timers.delete(id);
const deferred = () => { let resolve, reject; const promise = new Promise((y, n) => { resolve = y; reject = n; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const results = [];
function fixture() {
  const counts = { stream: 0, recorder: 0, started: 0, error: 0, stopped: 0 };
  const errors = [];
  const tracks = [{ stop() { counts.stopped++; }, addEventListener() {}, removeEventListener() {} }, { stop() { counts.stopped++; }, addEventListener() {}, removeEventListener() {} }];
  const stream = { getTracks: () => tracks };
  const recorder = { state: 'inactive', start() { this.state = 'recording'; }, stop() { this.state = 'inactive'; } };
  const environment = {
    getStream: async () => { counts.stream++; return stream; },
    createRecorder: () => { counts.recorder++; return recorder; },
    createContext: () => ({ createAnalyser: () => ({ frequencyBinCount: 1, disconnect() {} }), createMediaStreamSource: () => ({ connect() {}, disconnect() {} }), close: async () => {} }),
    setInterval: () => 1, clearInterval() {},
  };
  const session = new RecordingSession({ onRecording: () => counts.started++, onStopped() {}, onLevel() {}, onError: (error) => { counts.error++; errors.push(error); } }, environment);
  return { counts, errors, stream, environment, session };
}
async function test(name, fn) { await fn(); assert.equal(timers.size, 0, `${name}: timer leak`); results.push(name); }
try {
  await test('optional preflight omitted keeps existing capture behavior', async () => {
    const f = fixture(); await f.session.start(); assert.equal(f.counts.started, 1); f.session.dispose(); assert.equal(f.counts.stopped, 2);
  });
  await test('denied preflight never creates stream or recorder', async () => {
    const f = fixture(); f.environment.authorize = async () => { throw Error('denied'); }; await f.session.start();
    assert.deepEqual([f.counts.error, f.counts.stream, f.counts.recorder], [1, 0, 0]);
  });
  await test('undefined rejection is an explicit error, never success', async () => {
    const f = fixture(); f.environment.authorize = () => Promise.reject(undefined); await f.session.start(); assert.equal(f.counts.error, 1); assert.ok(f.errors[0] instanceof Error); assert.equal(f.counts.stream, 0);
  });
  await test('cancelling unresolved preflight settles Start and ignores late allow', async () => {
    const f = fixture(), permission = deferred(); f.environment.authorize = () => permission.promise;
    const start = f.session.start(); f.session.dispose(); await start; permission.resolve(); await tick();
    assert.deepEqual([f.counts.error, f.counts.stream, f.counts.recorder], [0, 0, 0]);
  });
  await test('preflight timeout closes attempt; late allow cannot capture', async () => {
    const f = fixture(), permission = deferred(); f.environment.authorize = () => permission.promise;
    const start = f.session.start(); [...timers.values()][0](); await start; permission.resolve(); await tick();
    assert.equal(f.counts.error, 1); assert.match(f.errors[0].message, /授权等待超时/); assert.equal(f.counts.stream, 0);
  });
  await test('one Start cannot request preflight or stream twice', async () => {
    const f = fixture(), permission = deferred(); let calls = 0; f.environment.authorize = () => { calls++; return permission.promise; };
    const start = f.session.start(); await f.session.start(); assert.equal(calls, 1); permission.resolve(); await start;
    assert.equal(f.counts.stream, 1); assert.equal(f.counts.started, 1); f.session.dispose();
  });
  await test('getUserMedia deadline reports failure and releases all late tracks', async () => {
    const f = fixture(), media = deferred(); f.environment.getStream = () => media.promise;
    const start = f.session.start(); [...timers.values()][0](); await start; media.resolve(f.stream); await tick();
    assert.equal(f.counts.error, 1); assert.match(f.errors[0].message, /麦克风准备超时/); assert.equal(f.counts.stopped, 2); assert.equal(f.counts.recorder, 0);
  });
  await test('cancel during media wait releases late tracks with no callback', async () => {
    const f = fixture(), media = deferred(); f.environment.getStream = () => media.promise;
    const start = f.session.start(); f.session.dispose(); await start; media.resolve(f.stream); await tick();
    assert.equal(f.counts.stopped, 2); assert.equal(f.counts.error, 0); assert.equal(f.counts.recorder, 0);
  });
  await test('late rejection after media timeout cannot emit another error', async () => {
    const f = fixture(), media = deferred(); f.environment.getStream = () => media.promise;
    const start = f.session.start(); [...timers.values()][0](); await start; media.reject(Error('late')); await tick(); assert.equal(f.counts.error, 1);
  });
  await test('cleanup attempts every late track even when first stop throws', async () => {
    const f = fixture(), media = deferred(); let second = 0;
    f.environment.getStream = () => media.promise; const start = f.session.start(); f.session.dispose(); await start;
    const realError = console.error; let failures = 0; console.error = () => failures++;
    try { media.resolve({ getTracks: () => [{ stop() { throw Error('first'); } }, { stop() { second++; } }] }); await tick(); }
    finally { console.error = realError; }
    assert.equal(second, 1); assert.equal(failures, 1); assert.equal(f.counts.recorder, 0);
  });
  await test('stage two has its own deadline after successful preflight', async () => {
    const f = fixture(), permission = deferred(), media = deferred();
    f.environment.authorize = () => permission.promise; f.environment.getStream = () => media.promise;
    const start = f.session.start(); const firstTimer = [...timers.keys()][0]; permission.resolve(); await tick();
    assert.equal(timers.size, 1); assert.notEqual([...timers.keys()][0], firstTimer); [...timers.values()][0](); await start;
    media.resolve(f.stream); await tick(); assert.equal(f.counts.stopped, 2); assert.equal(f.counts.error, 1);
  });
  for (const cut of [0, 1]) for (const throwing of [false, true]) {
    await test(`resolved media handoff cut ${cut} releases every track once${throwing ? ' when first stop throws' : ''}`, async () => {
      const f = fixture(), media = deferred(), stopped = [0, 0, 0], removed = [0, 0, 0];
      f.environment.getStream = () => media.promise;
      const tracks = stopped.map((_, index) => ({
        addEventListener() {},
        removeEventListener() { removed[index]++; },
        stop() { stopped[index]++; if (throwing && index === 0) throw Error('first stop failed'); },
      }));
      const realError = console.error; let failures = 0; console.error = () => failures++;
      try {
        const start = f.session.start();
        media.resolve({ getTracks: () => tracks });
        queueMicrotask(() => cut ? queueMicrotask(() => f.session.dispose()) : f.session.dispose());
        await start; await tick(); f.session.dispose();
        assert.deepEqual(stopped, [1, 1, 1]); assert.deepEqual(removed, [1, 1, 1]);
        assert.deepEqual([f.counts.started, f.counts.recorder, f.counts.error], [0, 0, 0]);
        assert.equal(failures, throwing ? 1 : 0);
      } finally { console.error = realError; }
    });
  }
  console.log(JSON.stringify({ status: 'PASS', checks: results.length, results, limits: 'Controlled promises/tracks/timers only, no OS permission or real audio' }, null, 2));
} finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
