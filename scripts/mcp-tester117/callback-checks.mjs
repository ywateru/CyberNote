// Execute actual production callback declarations with refs/deferred transports.
// No React mounting, DOM, browser, app, or UI automation.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
export async function checkTesterCallbacks(root, dependencies) {
  const source = await readFile(`${root}/src/AgentMcpTester.tsx`, "utf8");
  const ast = ts.createSourceFile("AgentMcpTester.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["remember", "append", "disconnect", "close", "connect", "execute", "recover"]), declarations = [];
  (function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.has(node.name.text)) declarations.push(`const ${node.getText(ast)};`);
    ts.forEachChild(node, visit);
  })(ast);
  assert.equal(declarations.length, names.size);
  const code = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const make = (connected = true) => {
    const stops = [], connects = [], calls = [], state = { rows: [], error: "", busy: "", closed: 0, recoveries: [], tools: [] };
    const ref = current => ({ current });
    const client = {
      stop(id) { const gate = deferred(); stops.push({ id, ...gate }); return gate.promise; },
      connect(input) { const gate = deferred(); connects.push({ input, ...gate }); return gate.promise; },
      call(id, tool, args) { const gate = deferred(); calls.push({ id, tool, args, ...gate }); return gate.promise; },
    };
    const env = {
      ...dependencies, Promise, AbortController, structuredClone, crypto: { randomUUID },
      record: v => !!v && typeof v === "object" && !Array.isArray(v),
      bounded: JSON.stringify, active: ref(connected ? "A" : null), epoch: ref(1), mounted: ref(true), working: ref(false), abort: ref(null), stopping: ref(null), closing: ref(null), recoveryLog: ref([]),
      connected, selected: "notes_list", argumentsText: "{}", binary: "/installed/adapter", settings: { workspaceId: "workspace" }, grant: { grantId: "grant", scopes: ["notes:read", "notes:create", "notes:update"], folderIds: ["folder"] }, write: true, client,
      latest: ref({ client, onClose: () => { state.closed++; } }),
      setBusy: value => { state.busy = value; }, setError: value => { state.error = value; },
      setConnected: value => { env.connected = value; }, setRows: value => { state.rows = typeof value === "function" ? value(state.rows) : value; },
      setTools: value => { state.tools = value; }, setSelected: value => { env.selected = value; }, setRecoveries: value => { state.recoveries = value; },
    };
    const callbacks = vm.runInNewContext(code + "\n({disconnect,close,connect,execute,recover})", env);
    return { env, state, client, stops, connects, calls, ...callbacks };
  };
  let count = 0;
  const a = make(), first = a.disconnect(), second = a.disconnect();
  assert.equal(first, second); await tick(); assert.equal(a.stops.length, 1);
  await a.connect(); assert.equal(a.connects.length, 0); assert.equal(a.env.working.current, true);
  a.stops[0].resolve(); await Promise.all([first, second]);
  const connectB = a.connect(); await tick(); assert.equal(a.connects.length, 1);
  a.connects[0].resolve({ tools: [{ name: "notes_list" }] }); await connectB;
  const callB = a.execute(false); await tick(); assert.equal(a.calls.length, 1);
  assert.equal(a.env.working.current, true); assert.ok(a.state.busy);
  await a.execute(false); assert.equal(a.calls.length, 1);
  a.calls[0].resolve({ elapsedMs: 1, result: { structuredContent: {} } }); await callB; count++;
  // Even a superseded lifetime cannot release or publish errors into its successor.
  for (const reject of [false, true]) {
    const b = make(), old = b.disconnect(); await tick();
    b.env.epoch.current++; b.env.active.current = "B"; b.env.working.current = true; b.state.busy = "B calling"; b.state.error = "B error";
    if (reject) b.stops[0].reject(Error("private-old-stop")); else b.stops[0].resolve();
    await old;
    assert.equal(b.env.working.current, true); assert.equal(b.state.busy, "B calling"); assert.equal(b.state.error, "B error"); count++;
  }
  for (const stopFirst of [false, true]) {
    const c = make(), stop = stopFirst ? c.disconnect() : null;
    const close = c.close(), again = c.close(); assert.equal(close, again);
    await tick(); assert.equal(c.stops.length, 1); assert.equal(c.state.closed, 0);
    await c.connect(); assert.equal(c.connects.length, 0);
    c.stops[0].resolve(); await Promise.all([stop, close, again]); assert.equal(c.state.closed, 1); count++;
  }
  const init = make(false), connecting = init.connect(); await tick();
  const closing = init.close(), closingAgain = init.close(); await tick();
  assert.equal(init.stops[0].id, init.connects[0].input.connectionId); assert.equal(init.state.closed, 0);
  init.stops[0].resolve(); await Promise.all([closing, closingAgain]); assert.equal(init.state.closed, 1);
  init.connects[0].resolve({ tools: [{ name: "notes_list" }] }); await tick();
  if (init.stops[1]) init.stops[1].resolve(); await connecting;
  assert.equal(init.env.connected, false); assert.equal(init.state.rows.length, 0); count++;
  // A cancelled batch keeps its already-sent intent, rejects a late receipt, and
  // carries the original parameters across reconnect (which clears ordinary rows).
  const batch = make();
  const execution = batch.execute(true);
  for (const [index, tool, value] of [
    [0, "notes_get_capabilities", { apiVersion: 1, workspaceId: "workspace", scopes: batch.env.grant.scopes }],
    [1, "notes_list_folders", { items: [{ id: "folder" }] }],
    [2, "notes_list", { items: [] }], [3, "notes_search", { items: [] }],
  ]) { await tick(); assert.equal(batch.calls[index].tool, tool); batch.calls[index].resolve({ elapsedMs: 1, result: { structuredContent: value } }); }
  await tick(); assert.equal(batch.calls[4].tool, "notes_create");
  assert.equal(batch.state.recoveries.length, 1);
  const original = JSON.stringify(batch.state.recoveries[0]);
  const stop = batch.disconnect(); await tick(); batch.stops[0].resolve(); await stop;
  batch.calls[4].resolve({ elapsedMs: 1, result: { structuredContent: { committed: true, operationId: randomUUID(), private: "late-private-body" } } }); await execution;
  assert.equal(JSON.stringify(batch.state.recoveries[0]), original);
  const reconnected = batch.connect(); await tick(); batch.connects[0].resolve({ tools: [{ name: "notes_list" }] }); await reconnected;
  assert.equal(JSON.stringify(batch.state.recoveries[0]), original); assert.ok(!JSON.stringify(batch.state.rows).includes("late-private-body")); count++;
  // The production recovery action really calls notes_get_operation after a new
  // connection, without replaying any write or losing pending operation identity.
  const recovery = { ...batch.state.recoveries[0], operationId: randomUUID(), committed: true };
  const querying = batch.recover(recovery); await tick();
  assert.equal(batch.calls[5].tool, "notes_get_operation"); assert.equal(batch.calls[5].args.operationId, recovery.operationId);
  batch.calls[5].resolve({ elapsedMs: 1, result: { structuredContent: { status: "pending", operationId: recovery.operationId } } }); await querying;
  assert.equal(batch.state.recoveries[0].lookup, "pending"); assert.equal(batch.state.recoveries[0].committed, true); count++;
  return count;
}
