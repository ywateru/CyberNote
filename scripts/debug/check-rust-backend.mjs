#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { rustBackend } from "./rust-backend.mjs";
const directory = await mkdtemp(resolve(tmpdir(), "notes-transport75-")),
  checks = [];
const check = (label, value) => {
  assert(value, label);
  checks.push(label);
};
const fixture = async (name, body) => {
  const path = resolve(directory, name);
  await writeFile(path, "#!/usr/bin/env node\n" + body, { mode: 0o755 });
  return path;
};
try {
  for (const [name, body, pattern] of [
    [
      "malformed",
      `process.stdin.once('data',()=>process.stdout.write('not-json\\n'));`,
      /malformed/,
    ],
    [
      "unknown",
      `process.stdin.once('data',()=>process.stdout.write(JSON.stringify({requestId:999,ok:true,value:null,events:[]})+'\\n'));`,
      /unknown/,
    ],
    [
      "shape",
      `process.stdin.once('data',()=>process.stdout.write(JSON.stringify({requestId:1,ok:'yes'})+'\\n'));`,
      /invalid response/,
    ],
    [
      "oversized",
      `process.stdin.once('data',()=>process.stdout.write('x'.repeat(3000)));`,
      /oversized/,
    ],
    ["timeout", `process.stdin.resume();`, /timeout/],
    ["eof", `process.stdin.once('data',()=>process.stdout.end());`, /EOF/],
    ["exit", `process.stdin.once('data',()=>process.exit(7));`, /exited|EOF/],
  ]) {
    const backend = await rustBackend(await fixture(name, body), directory, {
      timeoutMs: 2000,
      maxLineBytes: 2000,
    });
    const pending = [
      backend.call("one").catch((e) => e),
      backend.call("two").catch((e) => e),
    ];
    const errors = await Promise.all(pending);
    let closeError;
    try {
      await backend.close();
    } catch (e) {
      closeError = e;
    }
    check(
      name +
        " rejects every pending request with explicit protocol/process failure",
      errors.every((e) => pattern.test(e.message)) ||
        (() => {
          throw Error(name + ": " + errors.map((e) => e.message).join("; "));
        })(),
    );
    check(
      name + " close waits until actual owned child exit",
      !!backend.lifecycle.exit && backend.lifecycle.pending === 0,
    );
  }
  // A file exists but exec cannot start: exercise child error rather than access().
  const bad = resolve(directory, "bad-exec");
  await writeFile(bad, "#!/nonexistent/interpreter\n", { mode: 0o755 });
  try {
    await rustBackend(bad, directory);
    check("unreachable", false);
  } catch (e) {
    check(
      "Spawn error rejects without hanging or Fake fallback",
      e.code === "ENOENT",
    );
  }
  const slow = await rustBackend(
    await fixture(
      "slow-close",
      `process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>process.exit(0),150));`,
    ),
    directory,
  );
  const began = performance.now();
  await slow.close();
  check(
    "Graceful close waits for EOF-triggered delayed natural exit",
    slow.lifecycle.exit?.code === 0 && performance.now() - began >= 140,
  );
  const hung = await rustBackend(
    await fixture(
      "hung-close",
      `process.stdin.resume();process.stdin.on('end',()=>setInterval(()=>{},1000));`,
    ),
    directory,
    { closeTimeoutMs: 50 },
  );
  let forced;
  try {
    await hung.close();
  } catch (e) {
    forced = e;
  }
  check(
    "Hung close terminates owned child and reports forced shutdown after actual exit",
    !!forced && !!hung.lifecycle.exit,
  );
  const duplicate = await rustBackend(
    await fixture(
      "duplicate",
      `process.stdin.once('data',()=>{const row=JSON.stringify({requestId:1,ok:true,value:null,events:[]})+'\\n';process.stdout.write(row+row);});`,
    ),
    directory,
  );
  await duplicate.call("first");
  let dup;
  try {
    await duplicate.call("second");
  } catch (e) {
    dup = e;
  }
  try {
    await duplicate.close();
  } catch {}
  check(
    "Duplicate response poisons transport and cannot settle later request",
    /duplicate/.test(dup?.message),
  );
  console.log(
    JSON.stringify(
      { status: "PASS", checks: checks.length, labels: checks },
      null,
      2,
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
