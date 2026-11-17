// Command-only component/unit checks. Executes production JSX callbacks using
// a small hook harness; no DOM, browser, app, user library or subprocess launch.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as react from "react";
const require = createRequire(import.meta.url), root = resolve(import.meta.dirname, "..");
let clock = Date.now(), cursor = 0, slots = [], effects = [], checks = 0;
class Clock extends Date { static now() { return clock; } }
const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const hookReact = { ...react,
  useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }]; },
  useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  useId() { cursor++; return "agent-unit"; },
  useCallback(callback, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { value: callback, deps }; return slots[i].value; },
  useEffect(callback, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = callback(); }); } },
  useLayoutEffect() { cursor++; },
};
function Tester() {} function Setup() {}
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name.endsWith(".css")) return {};
    if (name === "react") return hookReact;
    if (name === "./AgentMcpTester") return { default: Tester, __esModule: true };
    if (name === "./AgentTestSetup") return { default: Setup, __esModule: true };
    if (name === "./bridge") return { native: false, accessGate: {} };
    if (name.startsWith(".")) return load(resolve(dirname(file), name + (name === "./agent-setup" || name === "./agent-client" ? ".ts" : ".tsx")));
    return require(name);
  };
  vm.runInNewContext(code, { require: localRequire, module, exports: module.exports, Date: Clock, TextEncoder, queueMicrotask, window: { setInterval: () => 1, clearInterval() {} }, navigator: { clipboard: { writeText: async text => copied.push(text) } } }, { filename: file });
  return module.exports;
}
const { agentSetup } = load(resolve(root, "src/agent-setup.ts"));
const { default: AgentSettings } = load(resolve(root, "src/AgentSettings.tsx"));
const grant = (id, extra = {}) => ({ grantId: id, clientId: id, workspaceId: "workspace", incarnation: "incarnation", scopes: ["notes:read"], folderIds: ["folder"], expiresAt: clock + 60_000, revocation: 0, revoked: false, credentialRef: `ref-${id}`, ...extra });
let state = { enabled: false, workspaceId: "workspace", incarnation: "incarnation", hostSessionId: "host", runtimeDir: "/runtime", grants: [], recentOperations: [] };
const calls = [], copied = [];
let loadingGate = null, adapterFailure = false;
const adapter = async () => { if (adapterFailure) throw Error("missing"); return "/Applications/CyberNote.app/Contents/MacOS/cybernote-mcp"; };
const client = {
  async settings() { calls.push("settings"); if (loadingGate) await loadingGate; return structuredClone(state); },
  async setEnabled(enabled) { calls.push("enable"); state.enabled = enabled; return structuredClone(state); },
  async createGrant() { throw Error("Not used by these tests"); },
  async revokeGrant(id) { calls.push("revoke"); state.grants = state.grants.map(g => g.grantId === id ? { ...g, revoked: true } : g); return structuredClone(state); },
};
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let tree;
function render(props = {}) { cursor = 0; tree = AgentSettings({ folders: [], client, adapter, ...props }); return tree; }
async function settle() { for (let i = 0; i < 4; i++) { for (const run of effects.splice(0)) run(); await tick(); render(); } }
function nodes(node) { if (arguments.length === 0) node = tree; if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
function text(node) { if (typeof node === "string" || typeof node === "number") return String(node); if (Array.isArray(node)) return node.map(text).join(""); return node?.props ? text(node.props.children) : ""; }
function button(label) { const found = nodes().filter(node => node.type === "button" && text(node) === label); assert.equal(found.length, 1, label); return found[0]; }
function surface(type) { return nodes().find(node => node.type === type); }
const pathInput = () => nodes().find(node => node.type === "input" && node.props.placeholder?.includes("cybernote-mcp"));

// Boundary combinations use the actual shared prerequisite resolver.
assert.equal(agentSetup(null, null, "", clock).ready, false); checks++;
for (const enabled of [false, true]) for (const grants of [[], [grant("a")], [grant("a", { revoked: true })], [grant("a", { expiresAt: clock })]]) for (const binary of ["", "relative/path", "/adapter", "/bad\npath", "/" + "x".repeat(4097)]) {
  const setup = agentSetup({ ...state, enabled, grants }, null, binary, clock);
  assert.equal(setup.ready, enabled && grants.length === 1 && !grants[0].revoked && grants[0].expiresAt > clock && binary === "/adapter"); checks++;
}
const two = { ...state, enabled: true, grants: [grant("expired", { expiresAt: clock }), grant("a"), grant("b")] };
assert.equal(agentSetup(two, null, "/adapter", clock).grant.grantId, "a");
assert.equal(agentSetup(two, "b", "/adapter", clock).grant.grantId, "b");
assert.equal(agentSetup(two, "expired", "/adapter", clock).grant, null);
assert.equal(agentSetup(two, "removed", "/adapter", clock).grant, null); checks += 4;

// Regression: launch exists during loading and while disabled, before viewing a grant.
let release;
loadingGate = new Promise(resolve => { release = resolve; });
render(); assert.equal(button("启动 MCP 测试程序").props.disabled, false); checks++;
await settle(); button("启动 MCP 测试程序").props.onClick(); render();
assert.ok(surface(Setup)); assert.equal(surface(Tester), undefined);
assert.ok(surface(Setup).props.setup.missing.length); assert.deepEqual(calls, ["settings"]); checks++;
surface(Setup).props.onClose(); render(); release(); loadingGate = null; await settle();
button("启动 MCP 测试程序").props.onClick(); render();
assert.ok(surface(Setup).props.setup.missing.some(message => message.includes("开启")));
assert.equal(surface(Tester), undefined); checks++;
surface(Setup).props.onClose(); render();

// Enable is explicit. Loaded grants immediately expose configuration; no hidden prerequisite.
state.grants = [grant("a"), grant("b")];
await nodes().find(node => node.props?.role === "switch").props.onClick(); await settle();
assert.equal(pathInput(), undefined); assert.equal(nodes().filter(node => node.type === "select")[0].props.value, "a"); checks++;
nodes().find(node => node.type === "select").props.onChange({ target: { value: "b" } }); render();
button("启动 MCP 测试程序").props.onClick(); render();
assert.equal(surface(Setup), undefined);
assert.equal(surface(Tester).props.grant.grantId, "b");
assert.equal(surface(Tester).props.binary, "/Applications/CyberNote.app/Contents/MacOS/cybernote-mcp"); checks += 2;
assert.equal(calls.filter(c => c !== "settings" && c !== "enable").length, 0); checks++;
surface(Tester).props.onClose(); render();
await button("复制 stdio JSON").props.onClick(); await tick();
assert.equal(JSON.parse(copied[0]).args[3], "ref-b"); checks++;
await button("刷新").props.onClick(); await settle();
assert.equal(nodes().find(node => node.type === "select").props.value, "b");
button("启动 MCP 测试程序").props.onClick(); render(); assert.ok(surface(Tester)); checks++;

// A revoked authorization shuts down the active tester; no silent grant substitution.
await nodes().find(node => node.type === "button" && node.props["aria-label"] === "撤销 b").props.onClick(); await settle();
assert.equal(surface(Tester), undefined); assert.equal(surface(Setup), undefined);
assert.equal(nodes().find(node => node.type === "select").props.value, ""); checks++;
button("启动 MCP 测试程序").props.onClick(); render(); assert.ok(surface(Setup)); checks++;
surface(Setup).props.onGrant("a"); render(); surface(Setup).props.onStart(); render(); assert.ok(surface(Tester));
surface(Tester).props.onClose(); render(); clock += 120_000;
button("启动 MCP 测试程序").props.onClick(); render();
assert.equal(surface(Tester), undefined); assert.equal(surface(Setup).props.setup.ready, false); checks++;
surface(Setup).props.onSetup(); render(); assert.equal(surface(Setup), undefined); checks++;

for (const reason of ["disabled", "new-session"]) {
  state.enabled = true; state.grants = [grant("a")];
  await button("刷新").props.onClick(); await settle();
  button("启动 MCP 测试程序").props.onClick(); render(); assert.ok(surface(Tester));
  if (reason === "disabled") state.enabled = false; else state.hostSessionId = "new-session";
  await button("刷新").props.onClick(); await settle();
  assert.equal(surface(Tester), undefined); assert.equal(surface(Setup), undefined); checks++;
}

// An incomplete bundle cannot produce external config or open a runnable tester.
state.enabled = true; state.grants = [grant("a")];
adapterFailure = true;
await button("刷新").props.onClick(); await settle();
assert.equal(button("复制 stdio JSON").props.disabled, true);
button("启动 MCP 测试程序").props.onClick(); render();
assert.ok(surface(Setup)); assert.equal(surface(Tester), undefined);
assert.ok(surface(Setup).props.setup.missing.some(message => message.includes("内置"))); checks++;
surface(Setup).props.onClose(); render(); adapterFailure = false;
await button("重新检查内置 MCP").props.onClick(); await settle();
assert.equal(button("复制 stdio JSON").props.disabled, false);
button("启动 MCP 测试程序").props.onClick(); render(); assert.ok(surface(Tester)); checks++;
surface(Tester).props.onClose(); render();
render({ mobile: true }); assert.equal(nodes().some(node => node.type === "button" && text(node) === "启动 MCP 测试程序"), false); checks++;
for (const slot of slots) slot?.cleanup?.();
console.log(`Agent settings: ${checks} prerequisite / production callback / entry visibility checks passed (no UI automation).`);
