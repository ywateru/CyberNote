// Compile the real IPC client with Vite. This checks build capability selection
// only: no mocked IPC, native process, authorization or external service is used.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { build } from "vite";

const saved = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
const results = [];
try {
  for (const [name, dev, native, debug, fixture, expected] of [
    ["default production", false, undefined, undefined, undefined, [false, true]],
    ["explicit native production", false, "1", "0", "0", [false, true]],
    ["native production opt-out", false, "0", "0", "0", [false, false]],
    ["production fixture flags with native default", false, undefined, "1", "1", [false, true]],
    ["production fixture flags with explicit native", false, "1", "1", "1", [false, true]],
    ["fixture flags cannot override production opt-out", false, "0", "1", "1", [false, false]],
    ["default development", true, undefined, undefined, undefined, [false, true]],
    ["development native opt-out", true, "0", undefined, undefined, [false, false]],
    ["fixture requires debug", true, "0", "0", "1", [false, false]],
    ["fixture requires explicit account flag", true, "0", "1", "0", [false, false]],
    ["debug alone with native default", true, undefined, "1", undefined, [false, true]],
    ["explicit development fixture", true, "0", "1", "1", [true, true]],
  ]) {
    const result = await build({
      configFile: false, logLevel: "silent",
      define: {
        "import.meta.env.DEV": JSON.stringify(dev),
        "import.meta.env.VITE_NOTES_ACCOUNT_NATIVE": native === undefined ? "undefined" : JSON.stringify(native),
        "import.meta.env.VITE_NOTES_DEBUG": debug === undefined ? "undefined" : JSON.stringify(debug),
        "import.meta.env.VITE_NOTES_ACCOUNT_UI": fixture === undefined ? "undefined" : JSON.stringify(fixture),
      },
      build: { write: false, minify: false,
        lib: { entry: resolve("src/account-client.ts"), formats: ["es"] } },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const code = outputs.flatMap(output => output.output).find(item => item.type === "chunk" && item.isEntry).code;
    for (const [index, tauri] of [false, true].entries()) {
      Object.defineProperty(globalThis, "isTauri", { configurable: true, value: tauri });
      const client = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64") + "#" + results.length);
      assert.equal(client.accountUIAvailable, expected[index], `${name}, Tauri=${tauri}`);
      results.push({ name, tauri, available: client.accountUIAvailable });
    }
  }
  console.log(JSON.stringify({ checks: results.length, results, boundary: "Compiled capability only; no native IPC or auth executed" }, null, 2));
} finally {
  if (saved) Object.defineProperty(globalThis, "isTauri", saved);
  else delete globalThis.isTauri;
}
