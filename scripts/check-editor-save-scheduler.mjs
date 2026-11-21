import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const output = resolve("artifacts/editor-save-scheduler");
await mkdir(output, { recursive: true });
const modulePath = resolve(output, "editor-save-scheduler.mjs");
await writeFile(
  modulePath,
  ts.transpileModule(
    await readFile("src/editor-save-scheduler.ts", "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText,
);
const { EditorSaveScheduler } = await import(pathToFileURL(modulePath));

const doc = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const flushMicrotasks = async (turns = 8) => {
  for (let i = 0; i < turns; i++) await Promise.resolve();
};
const clock = () => {
  let now = 0;
  let serial = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (callback, delay) => {
      const id = ++serial;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance: async (ms) => {
      now += ms;
      for (;;) {
        const due = [...timers].find(([, timer]) => timer.at <= now);
        if (!due) return;
        timers.delete(due[0]);
        due[1].callback();
        await flushMicrotasks();
      }
    },
  };
};

const results = [];
{
  const c = clock();
  const registered = [];
  const published = [];
  const saved = [];
  const scheduler = new EditorSaveScheduler({
    quietMs: 180,
    maxWaitMs: 1000,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    register: async (id) => {
      registered.push(id);
      return `intent-${registered.length}`;
    },
    publish: (id, value) => published.push({ id, value }),
    save: async (id, value, intent) => {
      saved.push({ id, value, intent: await intent });
      return { saved: true };
    },
  });
  scheduler.schedule("a", doc("1"));
  scheduler.schedule("a", doc("2"));
  scheduler.schedule("a", doc("3"));
  assert.equal(registered.length, 1);
  assert.equal(published.length, 3);
  await c.advance(179);
  assert.equal(saved.length, 0);
  await c.advance(1);
  assert.deepEqual(saved.map((item) => item.value), [doc("3")]);
  assert.equal(saved[0].intent, "intent-1");
  assert.equal(scheduler.hasPending(), false);
  results.push({ name: "quiet-window-keeps-one-intent-and-latest-body", saved: saved.length });
}
{
  const c = clock();
  let release;
  const gate = new Promise((resolveGate) => (release = resolveGate));
  const registered = [];
  const saved = [];
  const scheduler = new EditorSaveScheduler({
    quietMs: 10,
    maxWaitMs: 100,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    register: async (id) => {
      registered.push(id);
      return `intent-${registered.length}`;
    },
    publish: () => {},
    save: async (id, value, intent) => {
      const ticket = await intent;
      saved.push({ value, ticket });
      if (saved.length === 1) await gate;
      return { saved: true };
    },
  });
  scheduler.schedule("a", doc("first"));
  await c.advance(10);
  assert.equal(saved.length, 1);
  scheduler.schedule("a", doc("latest"));
  assert.equal(registered.length, 2, "new body registers its own intent while one save is in flight");
  release();
  await flushMicrotasks();
  await c.advance(10);
  assert.deepEqual(saved.map((item) => item.value), [doc("first"), doc("latest")]);
  assert.deepEqual(saved.map((item) => item.ticket), ["intent-1", "intent-2"]);
  results.push({ name: "one-in-flight-plus-latest", saved: saved.length });
}
{
  const c = clock();
  let release;
  const gate = new Promise((resolveGate) => (release = resolveGate));
  const saved = [];
  const scheduler = new EditorSaveScheduler({
    quietMs: 180,
    maxWaitMs: 1000,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    register: async () => "intent",
    publish: () => {},
    save: async (_id, value) => {
      saved.push(value);
      if (saved.length === 1) await gate;
      return { saved: true };
    },
  });
  scheduler.schedule("a", doc("first"));
  const flushed = scheduler.flush(["a"]);
  await flushMicrotasks();
  scheduler.schedule("a", doc("during-flush"));
  release();
  await flushed;
  assert.deepEqual(saved, [doc("first"), doc("during-flush")]);
  assert.equal(scheduler.hasPending(["a"]), false);
  results.push({ name: "flush-observes-body-scheduled-during-drain", saved: saved.length });
}
{
  const c = clock();
  const saved = [];
  const scheduler = new EditorSaveScheduler({
    quietMs: 500,
    maxWaitMs: 1000,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    register: async () => "intent",
    publish: () => {},
    save: async (_id, value) => {
      saved.push(value);
      return { saved: true };
    },
  });
  scheduler.schedule("a", doc("flush"));
  await scheduler.flush(["a"]);
  assert.deepEqual(saved, [doc("flush")]);
  assert.equal(scheduler.hasPending(["a"]), false);
  results.push({ name: "explicit-flush-bypasses-quiet-window", saved: saved.length });
}
{
  const c = clock();
  const registered = [];
  const published = [];
  const scheduler = new EditorSaveScheduler({
    quietMs: 180,
    maxWaitMs: 1000,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    register: async (id) => {
      registered.push(id);
      return "intent";
    },
    publish: (id, value) => published.push({ id, value }),
    blocked: (id) => (id === "locked" ? Error("blocked") : undefined),
    save: async () => ({ saved: true }),
  });
  scheduler.schedule("locked", doc("no"));
  assert.equal(registered.length, 0);
  assert.equal(published.length, 0);
  scheduler.schedule("open", doc("yes"));
  await scheduler.flush();
  assert.deepEqual(registered, ["open"]);
  assert.deepEqual(published, [{ id: "open", value: doc("yes") }]);
  results.push({ name: "blocked-body-is-not-published-or-registered" });
}
{
  const c = clock();
  const saved = [];
  let busy = false;
  const scheduler = new EditorSaveScheduler({
    quietMs: 10,
    maxWaitMs: 100,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    register: async () => "intent",
    publish: () => {},
    save: async (_id, value) => {
      saved.push(value);
      return { saved: false, error: Error("controlled") };
    },
    onBusyChange: (_id, value) => {
      busy = value;
    },
  });
  scheduler.schedule("a", doc("failure"));
  await c.advance(10);
  assert.equal(saved.length, 1);
  assert.equal(scheduler.hasPending(), false);
  assert.equal(busy, false);
  results.push({ name: "failure-settles-without-looping" });
}
{
  const c = clock();
  const saved = [];
  const scheduler = new EditorSaveScheduler({
    quietMs: 180,
    maxWaitMs: 1000,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    register: async () => "intent",
    publish: () => {},
    save: async (_id, value) => {
      saved.push(value);
      return { saved: true };
    },
  });
  scheduler.schedule("a", doc("one"));
  for (let i = 1; i <= 9; i++) {
    await c.advance(100);
    scheduler.schedule("a", doc(`typing-${i}`));
  }
  await c.advance(99);
  assert.equal(saved.length, 0);
  await c.advance(1);
  assert.deepEqual(saved, [doc("typing-9")]);
  results.push({ name: "max-wait-caps-continuous-typing", saved: saved.length });
}

await writeFile(
  resolve(output, "result.json"),
  JSON.stringify({ results }, null, 2) + "\n",
);
console.log(
  `Editor save scheduler: ${results.length} coalescing, barrier and failure cases passed.`,
);
