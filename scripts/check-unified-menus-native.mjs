import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const run = promisify(execFile),
  output = resolve(process.argv[2] || "artifacts/unified-menus/native");
await mkdir(output, { recursive: true });
const binary = resolve(output, "unified-menu-check");
const compiled = await run("xcrun", [
  "clang",
  "-fobjc-arc",
  "-fblocks",
  "scripts/check-unified-menus-native.m",
  "-framework",
  "AppKit",
  "-o",
  binary,
]);
await writeFile(
  resolve(output, "compile.log"),
  compiled.stdout + compiled.stderr,
);
const result = await run(binary, [], { timeout: 30000 });
await writeFile(resolve(output, "result.log"), result.stdout + result.stderr);
console.log(result.stdout);
