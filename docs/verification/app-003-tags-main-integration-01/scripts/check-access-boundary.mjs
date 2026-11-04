import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import ts from "typescript";

// Execute the production response gate. The test never substitutes IPC results
// in the app: these finite cases model delivery order around real Rust epochs.
const source = await readFile("src/access-client.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { AccessGate, AccessChanged } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const revisionSource = await readFile("src/save-revisions.ts", "utf8");
const { SaveRevisions } = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(revisionSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  ).toString("base64")}`
);
const state = (
  epoch = 1,
  noteEpoch = 0,
  operationId = null,
  sessionId = "process-A",
) => ({
  sessionId,
  epoch,
  notes: { note: { epoch: noteEpoch, authorized: epoch < 3 } },
  operationId,
  suspended: operationId ? ["note"] : [],
});
const results = [];
function test(name, fn) {
  fn();
  results.push({ name, status: "pass" });
}
function initialized() {
  const gate = new AccessGate();
  gate.accept(state(), gate.stamp());
  return gate;
}
test("delayed workspace from before prepare cannot reenter cache", () => {
  const gate = initialized();
  const stamp = gate.stamp();
  gate.invalidate(state(1, 0, "operation"));
  assert.throws(() => gate.accept(state(), stamp), AccessChanged);
});
test("allowed pre-prepare save may acknowledge revision without replacing prepare state", () => {
  const gate = initialized();
  const stamp = gate.stamp("note");
  const prepare = state(1, 0, "operation");
  gate.invalidate(prepare);
  gate.accept(state(1, 0, "operation"), stamp, "save");
  assert.equal(gate.state, prepare);
});
test("late save response after commit cannot acknowledge a new editor", () => {
  const gate = initialized();
  const stamp = gate.stamp("note");
  gate.invalidate(state(3, 3));
  assert.throws(() => gate.accept(state(), stamp, "save"), AccessChanged);
});
test("delayed live text response is discarded after authorization changes", () => {
  const gate = initialized();
  const stamp = gate.stamp("note");
  gate.invalidate(state(3, 3));
  assert.throws(() => gate.accept(state(), stamp), AccessChanged);
});
test("lower backend epoch cannot replace a newer snapshot even in the same generation", () => {
  const gate = initialized();
  gate.invalidate(state(4, 4));
  assert.throws(() => gate.accept(state(3, 3), gate.stamp()), AccessChanged);
});
test("response from a previous backend process is rejected", () => {
  const gate = initialized();
  assert.throws(
    () => gate.accept(state(1, 0, null, "old-process"), gate.stamp()),
    AccessChanged,
  );
});
test("own completed barrier response remains acceptable after its commit event", () => {
  const gate = initialized();
  const stamp = gate.stamp();
  gate.invalidate(state(3, 3));
  const committed = state(3, 3);
  gate.accept(committed, stamp, "transition");
  assert.equal(gate.state, committed);
});
test("old transition response cannot cross the next prepare", () => {
  const gate = initialized();
  const stamp = gate.stamp();
  gate.invalidate(state(3, 3));
  gate.invalidate(state(3, 3, "next-operation"));
  assert.throws(
    () => gate.accept(state(3, 3), stamp, "transition"),
    AccessChanged,
  );
});
test("old transition response cannot cross the next commit", () => {
  const gate = initialized();
  const stamp = gate.stamp();
  gate.invalidate(state(4, 4));
  assert.throws(
    () => gate.accept(state(3, 3), stamp, "transition"),
    AccessChanged,
  );
});
test("focus synchronization invalidates a pending read before a new snapshot arrives", () => {
  const gate = initialized();
  const stamp = gate.stamp();
  gate.invalidate();
  assert.throws(() => gate.accept(state(), stamp), AccessChanged);
  gate.accept(state(), gate.stamp());
  assert.equal(gate.state.epoch, 1);
});
test("authorization token carries process and targeted note epoch", () => {
  const gate = initialized();
  gate.invalidate(state(5, 4));
  assert.deepEqual(gate.expected("note"), {
    sessionId: "process-A",
    epoch: 5,
    noteEpoch: 4,
  });
});
test("no snapshot means no authorized action token", () => {
  assert.throws(() => new AccessGate().expected("note"), AccessChanged);
});
test("focus snapshot cannot advance an unsaved document baseline", () => {
  const revisions = new SaveRevisions();
  revisions.observe("note", 8, false);
  revisions.observe("note", 9, true);
  assert.equal(revisions.expected("note"), 8);
});
test("a confirmed own save advances the following queued save", () => {
  const revisions = new SaveRevisions();
  revisions.observe("note", 8, false);
  revisions.confirmed("note", 9);
  revisions.observe("note", 10, true);
  assert.equal(revisions.expected("note"), 9);
});
test("conflict plus another hydrate leaves later queued saves and retry on the old baseline", () => {
  const revisions = new SaveRevisions();
  revisions.observe("note", 8, false);
  // The failed save produces no confirmed revision. Subsequent queued saves
  // and an explicit ordinary retry must still conflict with backend revision9.
  for (let attempt = 0; attempt < 3; attempt++) {
    revisions.observe("note", 9, true);
    assert.equal(revisions.expected("note"), 8);
  }
});
test("a clean editor can adopt a trusted external revision", () => {
  const revisions = new SaveRevisions();
  revisions.observe("note", 8, false);
  revisions.observe("note", 9, false);
  assert.equal(revisions.expected("note"), 9);
});
await mkdir("artifacts/access-boundary", { recursive: true });
await writeFile(
  "artifacts/access-boundary/results.json",
  JSON.stringify({ source: "src/access-client.ts", results }, null, 2) + "\n",
);
console.log(
  `${results.length} production access response boundary cases passed.`,
);
