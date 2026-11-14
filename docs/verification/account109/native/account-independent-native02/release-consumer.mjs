import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const ts = createRequire('/Users/water/work/2026/Apple-Notes-Clone/package.json')('typescript');
const source = await readFile('src/network-sync.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { NetworkSyncCoordinator } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
function window() {
  const state = { commits: 0, releases: 0, body: 'saved original' };
  let resolve;
  const wait = new Promise(done => { resolve = done; });
  const coordinator = new NetworkSyncCoordinator({
    snapshot: () => ({ sessionId: 'same-local-session', blocked: false, protectedNoteIds: [] }),
    freeze: () => ({ flush: async () => {}, current: () => true, release: () => { state.releases++; } }),
    reply: async reply => ({ operationId: reply.operationId, outcome: 'pending' }),
    committed: async () => { state.commits++; await wait; state.body = 'trusted saved read'; },
    error: error => { throw error; },
  });
  return { coordinator, state, resolve };
}
const main = window(), second = window();
const prepare = { phase: 'prepare', operationId: 'original-adoption-operation', sessionId: 'same-local-session', noteIds: ['note-fixture'] };
const release = { phase: 'release', operationId: prepare.operationId, sessionId: prepare.sessionId, outcome: 'commit' };
for (const w of [main, second]) { await w.coordinator.receive(prepare); assert.ok(w.coordinator.frozen()); }
const first = main.coordinator.receive(release);
const duplicateInFlight = main.coordinator.receive(release);
assert.equal(main.state.commits, 1);
assert.equal(main.state.releases, 0);
main.resolve();
await Promise.all([first, duplicateInFlight]);
assert.equal(main.state.releases, 1);
assert.ok(second.coordinator.frozen());
main.state.body = 'new local draft after partial delivery';
const replay = second.coordinator.receive(release);
second.resolve();
await Promise.all([main.coordinator.receive(release), replay]);
for (const w of [main, second]) { await w.coordinator.receive(release); assert.equal(w.state.commits, 1); assert.equal(w.state.releases, 1); assert.ok(!w.coordinator.frozen()); }
assert.equal(main.state.body, 'new local draft after partial delivery');
console.log(JSON.stringify({ source: 'src/network-sync.ts', sha256: createHash('sha256').update(source).digest('hex'), result: 'PASS', cases: ['in-flight duplicate uses one committed read', 'missed second window release recovers', 'replay keeps post-release draft and releases each lease once'] }, null, 2));
