#!/usr/bin/env node
// Interactive owner for one native CyberBus QA window. Requests are line-delimited
// JSON using the same finite actions as sync108-native-driver.mjs.
import assert from "node:assert/strict";
import { createInterface } from "node:readline";
import { resolve, isAbsolute } from "node:path";
import { NativeApp, encodeRequest } from "./sync108-native-driver.mjs";

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    assert(["--binary", "--data-dir", "--slot", "--interval-ms"].includes(name), "Unknown option");
    const key = name.slice(2);
    assert(!result[key] && argv[index + 1], "Missing or duplicate option");
    result[key] = argv[++index];
  }
  assert(result.binary && result["data-dir"], "Usage: node cyberbus-ui-live.mjs --binary ABS --data-dir ABS [--slot NAME] [--interval-ms MS]");
  assert(isAbsolute(result.binary) && isAbsolute(result["data-dir"]), "Paths must be absolute");
  const intervalMs = Number(result["interval-ms"] ?? "0");
  assert(Number.isSafeInteger(intervalMs) && intervalMs >= 0 && intervalMs <= 300_000, "Interval must be an integer from 0 to 300000");
  result.intervalMs = intervalMs;
  return result;
}

function emit(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
}

const opts = options(process.argv.slice(2));
const app = new NativeApp(resolve(opts.binary), resolve(opts["data-dir"]), {
  name: opts.slot || "live",
  env: {
    ...(opts.slot ? { NOTES_SYNC_E2E_SLOT: opts.slot } : {}),
    CYBERNOTE_ACCOUNT_SDK_DIAGNOSTICS: "1",
    CYBERNOTE_SYNC_DIAGNOSTICS: "1",
  },
});

let ready;
try {
  ready = await app.ready(60_000);
} catch (error) {
  emit({
    type: "qa-failed",
    code: error.code || "ERROR",
    phase: error.phase || null,
    diagnostic: app.lifecycle.nativeDiagnostic || null,
  });
  await app.close();
  process.exitCode = 1;
  process.exit();
}
emit({ type: "qa-ready", pid: app.child.pid, ...ready });

async function diagnostic() {
  const value = await app.request({ op: "accountSdkDiagnostic" }, 10_000);
  emit({ type: "cyberbus-diagnostic", value });
}

try {
  await diagnostic();
} catch (error) {
  emit({ type: "diagnostic-error", code: error.code || "ERROR" });
}
const timer =
  opts.intervalMs > 0
    ? setInterval(() => {
        diagnostic().catch((error) => emit({ type: "diagnostic-error", code: error.code || "ERROR" }));
      }, opts.intervalMs)
    : null;

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  try {
    const request = JSON.parse(line);
    assert(request && typeof request === "object" && !Array.isArray(request), "Request must be an object");
    const action = request.action;
    assert(action && typeof action === "object" && !Array.isArray(action), "Action must be an object");
    encodeRequest(1, action, request.timeoutMs ?? 30_000);
    const value = await app.request(action, request.timeoutMs ?? 30_000);
    emit({ type: "response", value });
  } catch (error) {
    emit({ type: "request-error", code: error.code || "INVALID_REQUEST" });
  }
}

if (timer) clearInterval(timer);
await app.close();
