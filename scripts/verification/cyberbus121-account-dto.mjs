// CLI-only contract: actual native SafeError serialization -> actual TS validators.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {build} from "vite";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = execFileSync("cargo", ["test", "--offline", "--locked", "--manifest-path", "src-tauri/Cargo.toml",
  "--features", "sync-e2e", "--lib", "account::types::cyberbus_tests::frontend_contract_fixtures", "--", "--exact", "--nocapture"],
  {cwd:root, encoding:"utf8", maxBuffer:4 * 1024 * 1024, stdio:["ignore", "pipe", "pipe"]});
const fixtures = JSON.parse(output.match(/@@CYBERBUS_ACCOUNT_DTO@@(\[.*\])/)[1]);
const built = await build({root, configFile:false, logLevel:"silent",
  define:{"import.meta.env":'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'},
  build:{write:false,minify:false,lib:{entry:resolve(root,"src/account-client.ts"),formats:["es"]}}});
const compiled = (Array.isArray(built) ? built[0] : built).output[0].code;
const api = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const status = error => ({state:"error",enabled:false,devices:[],pendingCount:0,conflictCount:0,error});
for (const error of fixtures) {
  assert.deepEqual(api.validateAccountStatus(status(error)).error,error);
  const ipc = api.accountIPCError(error);
  assert.equal(ipc.code,error.code);
  assert.equal(ipc.cyberbusCode,error.cyberbusCode);
}
assert.equal(api.accountConnectionRetry({...status(fixtures[3]), profile:{subject:"fixture",displayName:"CyberBus 账户"}}).type,"signIn");
assert.equal(api.accountConnectionRetry({...status(fixtures[4]), profile:{subject:"fixture",displayName:"CyberBus 账户"}}).type,"syncNow");
let rejected = 0;
for (const error of [
  ...[undefined, 0, 27, 1.5, "26", null].map(cyberbusCode => ({code:"account_sdk_failed",message:"fixture",cyberbusCode})),
  {code:"account_sdk_failed",message:"fixture",cyberbusCode:26,stage:"identityRefresh"},
  {code:"account_network",message:"fixture",cyberbusCode:26},
  {code:"account_unknown_outcome",message:"fixture",cyberbusCode:26},
  {code:"account_deadline_exceeded",message:"fixture",stage:"identityRefresh"},
  {code:"account_sdk_failed",message:"fixture",cyberbusCode:26,token:"forbidden"},
]) { assert.throws(() => api.validateAccountError(error)); rejected++; }
console.log(JSON.stringify({scope:"Rust SafeError to TS DTO; CLI only; no UI, credentials or network",nativeFixtures:fixtures.length,rejectedInvalidCombinations:rejected,pass:true}));
