// Owned source candidate only. No default-store enumeration, preference reads,
// browser automation, credential access or user-library paths.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NativeApp, until } from "./sync108-native-driver.mjs";

const binary = resolve(process.argv[2] || "");
assert(process.argv[2], "Usage: node evolve112-profile.mjs ABS_CANDIDATE_BINARY");
const plist = resolve(binary, "../../Info.plist");
const bundleId = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist], {encoding:"utf8"}).trim();
assert.match(bundleId, /^com\.local\.cybernote\.evolve112\./);
const root = await realpath(await mkdtemp("/private/tmp/e112-profile-"));
await chmod(root, 0o700);
const apps = [], result = {root, bundleId, diagnostics:[], checks:[], lifecycles:[]};
const check = name => result.checks.push(name);
async function open(name, data) {
  const app = new NativeApp(binary, data, {name, commandArgs:["--data-dir",data,"--agent-runtime-dir",join(root,"run")]});
  apps.push(app); await app.ready();
  const diagnostic = await app.request({op:"webviewStorageDiagnostic"});
  assert.equal(diagnostic.bundleIdentifier, bundleId);
  assert(diagnostic.stores.length > 0);
  assert.equal(app.metadata.pid,app.child.pid);
  assert.equal(app.metadata.window,"main");
  result.diagnostics.push({name,pid:app.child.pid,window:app.metadata.window,...diagnostic});
  return app;
}
try {
  let a = await open("profile-A",join(root,"a"));
  const first = result.diagnostics.at(-1).configuredIdentifier;
  const key = "evolve112.owned-profile-sentinel";
  assert.equal(await a.evaluate("localStorage.getItem(arg)",key),null);
  await a.evaluate("(() => {localStorage.setItem(arg,'profile-A'); return true;})()",key);
  const b = await open("profile-B",join(root,"b"));
  assert.notEqual(first,result.diagnostics.at(-1).configuredIdentifier);
  assert.equal(await b.evaluate("localStorage.getItem(arg)",key),null);
  await b.evaluate("(() => {localStorage.setItem(arg,'profile-B'); return true;})()",key);
  assert.equal(await a.evaluate("localStorage.getItem(arg)",key),"profile-A");
  check("two owned libraries have distinct actual WK stores and isolated localStorage");
  await a.execute("note.create");
  const state = await a.state();
  const noteId = state.selection.noteId;
  assert.equal(typeof noteId,"string");
  const label = await a.evaluate("window.__TAURI_INTERNALS__.invoke('open_note_window',{noteId:arg,title:'E112 profile child'})",noteId);
  await until("owned document window created",async () => {
    const d = await a.request({op:"webviewStorageDiagnostic"});
    if (d.stores.some(s=>s.label===label)) {result.diagnostics.push({name:"profile-A-child",...d});return true;}
    return false;
  });
  check("main and native-created document windows use the same observed WK store");
  // Native driver shutdown seals and closes every owned document window.
  result.lifecycles.push(await a.close());
  a = await open("profile-A-restart",join(root,"a"));
  assert.equal(result.diagnostics.at(-1).configuredIdentifier,first);
  assert.equal(await a.evaluate("localStorage.getItem(arg)",key),"profile-A");
  assert.equal(await b.evaluate("localStorage.getItem(arg)",key),"profile-B");
  check("restart retains only the selected private profile sentinel");
  result.passed = true;
} catch (e) {result.passed=false;result.failure={message:e.message,stack:e.stack};}
finally {
  for (const app of apps) if (!app.lifecycle.close) {
    try {result.lifecycles.push(await app.close());} catch(e) {result.cleanupError ||= e.message;}
  }
  result.lifecycles = apps.map(app => app.lifecycle);
  await writeFile(join(root,"result.json"),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify(result,null,2));
}
if (!result.passed || result.cleanupError) process.exitCode=1;
