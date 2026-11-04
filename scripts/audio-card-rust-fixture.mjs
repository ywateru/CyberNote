import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
export function rust(binary, root) {
  const child = spawn(binary, [root], { stdio: ["pipe", "pipe", "pipe"] }),
    pending = [],
    log = [];
  let stderr = "";
  child.stderr.on("data", (x) => (stderr += x));
  createInterface({ input: child.stdout }).on("line", (line) => {
    const slot = pending.shift();
    assert(slot, "unsolicited Rust output");
    const value = JSON.parse(line);
    log.push(structuredClone({ request: slot.request, response: value }));
    if (value.error)
      slot.reject(Object.assign(Error(value.error.message), value.error));
    else slot.resolve(value.ok);
  });
  child.on("exit", (code) => {
    for (const slot of pending)
      slot.reject(Error(`Rust exited ${code}: ${stderr}`));
  });
  return {
    log,
    call: (command, params = {}) =>
      new Promise((resolve, reject) => {
        const request = { command, params };
        pending.push({ request, resolve, reject });
        child.stdin.write(JSON.stringify(request) + "\n");
      }),
    close: () =>
      new Promise((done) => {
        child.once("exit", done);
        child.stdin.end();
      }),
  };
}
