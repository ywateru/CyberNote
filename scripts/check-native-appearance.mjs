// Production AppKit toolbar, isolated windows and no application database.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
if (process.platform !== "darwin")
  throw Error("Native appearance checks require macOS/AppKit.");
const run = promisify(execFile);
const output = resolve(
  process.argv[2] || "artifacts/appearance-density/native",
);
const binary = resolve(dirname(output), "native-appearance-check");
await mkdir(output, { recursive: true });
const build = await run(
  "xcrun",
  [
    "clang",
    "-fobjc-arc",
    "-fblocks",
    "-Iplugins/tauri-plugin-notes-ui/macos",
    "scripts/check-native-appearance.m",
    "plugins/tauri-plugin-notes-ui/macos/format.m",
    "-framework",
    "AppKit",
    "-framework",
    "QuartzCore",
    "-o",
    binary,
  ],
  { timeout: 120000 },
);
await writeFile(
  resolve(dirname(output), "native-compile.log"),
  build.stdout + build.stderr,
);
const check = await run(binary, [output], { timeout: 120000 });
await writeFile(
  resolve(dirname(output), "native-appearance.log"),
  check.stdout + check.stderr,
);
console.log(check.stdout.trim());
console.log(`Geometry and render evidence: ${output}`);
