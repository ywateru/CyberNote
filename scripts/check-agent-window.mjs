// Deterministic production parser/state-machine tests; transport is synthetic.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile("src/agent-window.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const {
  parseAgentWindowEvent: event,
  parseAgentWindowReply: reply,
  parseAgentReplyReceipt: receipt,
  AgentWindowCoordinator,
} = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
let checks = 0;
const check = (value) => {
  assert.ok(value);
  checks++;
};
const rejects = (fn) => {
  assert.throws(fn);
  checks++;
};
for (const phase of ["probe", "prepare", "release"]) {
  const e = {
    phase,
    operationId: "o",
    sessionId: "s",
    noteIds: [],
    ...(phase === "release" ? { outcome: "commit" } : {}),
  };
  check(event(e) === e);
  for (const invalid of [
    { ...e, extra: 1 },
    { ...e, noteIds: ["a", "a"] },
    { ...e, noteIds: [2] },
    { ...e, sessionId: "" },
    { ...e, operationId: "x".repeat(513) },
    Object.fromEntries(Object.entries(e).filter(([k]) => k !== "noteIds")),
  ])
    rejects(() => event(invalid));
}
rejects(() =>
  event({
    phase: "adoptionMedia",
    operationId: "o",
    sessionId: "s",
    noteIds: [],
  }),
);
rejects(() =>
  event({
    phase: "release",
    operationId: "o",
    sessionId: "s",
    noteIds: [],
    outcome: "pending",
  }),
);
for (const r of [
  {
    phase: "probe",
    operationId: "o",
    protectedNoteIds: ["a"],
    unsavedNoteIds: ["b"],
    blocked: false,
  },
  { phase: "prepare", operationId: "o", ready: true },
  { phase: "release", operationId: "o", refreshed: true },
]) {
  check(reply(r) === r);
  rejects(() => reply({ ...r, unknown: 1 }));
}
rejects(() =>
  reply({
    phase: "probe",
    operationId: "o",
    protectedNoteIds: [],
    blocked: false,
  }),
);
for (const outcome of ["pending", "abort", "commit"])
  check(receipt({ operationId: "o", outcome }, "o").outcome === outcome);
rejects(() => receipt({ operationId: "other", outcome: "abort" }, "o"));
rejects(() => receipt({ operationId: "o", outcome: "aborted" }, "o"));
const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
let snapshot = {
    sessionId: "s",
    blocked: false,
    protectedNoteIds: [],
    unsavedNoteIds: [],
  },
  replies = [],
  freezes = 0,
  thaws = 0,
  refreshes = 0,
  current = true,
  terminal = "pending",
  refreshFailure = false,
  held;
const errors = [];
const coordinator = new AgentWindowCoordinator({
  snapshot: () => snapshot,
  freeze: () => {
    freezes++;
    return { current: () => current, release: () => thaws++ };
  },
  reply: async (r) => {
    replies.push(r);
    if (r.ready === true && held) await held.promise;
    return {
      operationId: r.operationId,
      outcome: r.ready === false ? "abort" : terminal,
    };
  },
  committed: async () => {
    refreshes++;
    if (refreshFailure) throw Error("refresh fixture failure");
  },
  error: (e) => errors.push(e),
});
const receive = (phase, id, extra = {}) =>
  coordinator.receive({
    phase,
    operationId: id,
    sessionId: snapshot.sessionId,
    noteIds: ["a"],
    ...extra,
  });
snapshot.blocked = true;
await receive("prepare", "blocked");
check(!coordinator.frozen() && replies.at(-1).ready === false);
await receive("prepare", "create", { noteIds: [] });
check(!coordinator.frozen() && replies.at(-1).ready === false);
snapshot.blocked = false;
for (const key of ["protectedNoteIds", "unsavedNoteIds"]) {
  snapshot[key] = ["a"];
  await receive("prepare", key);
  check(!coordinator.frozen());
  snapshot[key] = [];
}
await receive("prepare", "a");
check(coordinator.frozen("a") && !coordinator.frozen("b"));
await receive("release", "a", { outcome: "abort" });
check(
  !coordinator.frozen() &&
    refreshes === 0 &&
    replies.at(-1).refreshed === false,
);
held = deferred();
const late = receive("prepare", "late");
await tick();
check(coordinator.frozen());
await receive("release", "late", { outcome: "abort" });
held.resolve();
await late;
held = undefined;
await receive("prepare", "new");
await receive("release", "late", { outcome: "abort" });
check(coordinator.frozen());
await assert.rejects(
  receive("release", "new", { noteIds: ["b"], outcome: "commit" }),
);
checks++;
refreshFailure = true;
await assert.rejects(receive("release", "new", { outcome: "commit" }));
checks++;
check(coordinator.frozen() && replies.at(-1).refreshed === false);
refreshFailure = false;
await coordinator.cancel();
check(!coordinator.frozen() && replies.at(-1).refreshed === true);
await receive("prepare", "navigation");
current = false;
coordinator.check();
await tick();
check(!coordinator.frozen());
current = true;
await receive("prepare", "session");
snapshot.sessionId = "replacement";
coordinator.check();
check(!coordinator.frozen());
await receive("prepare", "disposed");
coordinator.dispose();
check(!coordinator.frozen());
check(freezes === thaws);
// Real renderer watchdog semantics with a captured timer callback; expiry is
// not a terminal. Transport errors and late terminal receipts stay authoritative.
let watchdog,
  drop = true,
  cancellation,
  refreshed = 0,
  released = 0;
const timeoutHost = {
  snapshot: () => ({
    sessionId: "clock",
    blocked: false,
    protectedNoteIds: [],
    unsavedNoteIds: [],
  }),
  freeze: () => ({ current: () => true, release: () => released++ }),
  reply: async (r) => {
    if (r.ready === false) {
      if (drop) {
        drop = false;
        throw Error("lost cancellation response");
      }
      return cancellation.promise;
    }
    return { operationId: r.operationId, outcome: "pending" };
  },
  committed: async () => {
    refreshed++;
  },
  error: () => {},
};
const timed = new AgentWindowCoordinator(timeoutHost);
const realTimer = globalThis.setTimeout;
globalThis.setTimeout = (callback, ms, ...args) => {
  if (ms === 5500) {
    watchdog = callback;
    return realTimer(() => {}, 100000);
  }
  return realTimer(callback, ms, ...args);
};
try {
  await timed.receive({
    phase: "prepare",
    operationId: "deadline",
    sessionId: "clock",
    noteIds: ["a"],
  });
} finally {
  globalThis.setTimeout = realTimer;
}
cancellation = deferred();
watchdog();
await tick();
check(timed.frozen() && released === 0);
await new Promise((r) => setTimeout(r, 140));
check(timed.frozen() && released === 0);
cancellation.resolve({ operationId: "deadline", outcome: "commit" });
await timed.cancel();
check(!timed.frozen() && refreshed === 1 && released === 1);
timed.dispose();
console.log(`agent-window parser/coordinator: ${checks} checks passed`);
