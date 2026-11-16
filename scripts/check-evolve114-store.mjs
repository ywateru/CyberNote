// The production core harness is the only runner. No copied crate or fallback.
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, realpath, writeFile, statfs } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const out = resolve("artifacts/evolve114-store");
const harness = "src-tauri/src/application/harness";
const cargo = resolve(harness, "Cargo.toml");
const requestedTarget = process.env.CARGO_TARGET_DIR;
const target = resolve(requestedTarget || "artifacts/evolve114-store/target");
// Preserve caller-selected isolated caches, but never use a Tauri app target.
const canonicalTarget = await realpath(target).catch(error => {
  if (error.code === "ENOENT") return target;
  throw error;
});
if ([target, canonicalTarget].some(path =>
    [resolve("target"), resolve("src-tauri/target")].includes(path)
    || /\/src-tauri\/target(?:\/|$)/.test(path)
    || /\/Apple-Notes-Clone\/target(?:\/|$)/.test(path)))
  throw Error("STOP: main/Tauri target is forbidden; choose an isolated CARGO_TARGET_DIR");
const replay = resolve("artifacts/evolve114-regressions/app-settings-replays.json");
// This is the actual App capture, not a substitute generated from expectations.
// Missing/mismatched capture is an error; run the browser suite first.
const captured = JSON.parse(await readFile(replay, "utf8"));
assert.equal(captured.length, 4, "Expected four actual App replay paths");
assert.deepEqual(captured, JSON.parse(await readFile("src-tauri/tests/evolve114-settings-recovery.json", "utf8")));
await mkdir(out, { recursive: true });
await mkdir(target, { recursive: true });
const disk = await statfs(target);
if (disk.bavail * disk.bsize < 2.5 * 1024 ** 3)
  throw Error("STOP: less than2.5GiB free");
// Inventory the production module trees referenced by harness/src/lib.rs.
// Hashes identify build inputs, not execution coverage for every listed file.
async function moduleFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "harness" ? [] : moduleFiles(path);
    return /\.(rs|json)$/.test(entry.name) ? [path] : [];
  }));
  return groups.flat();
}
const files = [...new Set([
  "scripts/check-evolve114-store.mjs",
  `${harness}/Cargo.toml`, `${harness}/Cargo.lock`, `${harness}/build.rs`,
  `${harness}/src/lib.rs`, `${harness}/src/sync.rs`,
  "src-tauri/src/store.rs", "src-tauri/src/session.rs", "src-tauri/src/sync/model.rs",
  ...(await Promise.all(["store", "session", "application", "agent_access"].map(name => moduleFiles(`src-tauri/src/${name}`)))).flat(),
  "src-tauri/tests/evolve114-settings-recovery.json",
  relative(process.cwd(), replay),
])].sort();
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async path => [
  path, createHash("sha256").update(await readFile(path)).digest("hex"),
])));
const sources = await hashes();
const jobs = process.env.CARGO_BUILD_JOBS || "2";
const command = [
  "test",
  "--locked",
  "--offline",
  "--features",
  "rusqlite/hooks",
  "--manifest-path",
  cargo,
  "--lib",
  "settings_and_archive_are_strict",
  "--",
  "--nocapture",
];
const result = spawnSync("cargo", command, {
  env: { ...process.env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: jobs, EVOLVE114_SETTINGS_REPLAY: replay },
  encoding: "utf8",
  timeout: 600000,
  maxBuffer: 8 * 1024 ** 2,
});
await writeFile(
  resolve(out, "tests.log"),
  (result.stdout || "") + (result.stderr || ""),
);
const expectedTests = [
  "interface_details_settings_and_archive_are_strict_and_atomic",
  "appearance_v2_settings_and_archive_are_strict_atomic_and_roundtrip",
  "appearance_recovery_settings_and_archive_are_strict_with_real_app_patches",
];
const passedTests = expectedTests.filter(name => result.stdout?.includes(`test store::archive::tests::${name} ... ok`));
const sourcesUnchanged = JSON.stringify(sources) === JSON.stringify(await hashes());
const passed = result.status === 0 && passedTests.length === 3
  && /test result: ok\. 3 passed; 0 failed;/.test(result.stdout || "") && sourcesUnchanged;
await writeFile(
  resolve(out, "result.json"),
  JSON.stringify(
    {
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message,
      command: ["cargo", ...command],
      passed,
      expectedTests,
      passedTests,
      sourcesUnchanged,
      manifest: cargo,
      target,
      targetSource: requestedTarget ? "caller CARGO_TARGET_DIR" : "isolated evolve114 default",
      jobs,
      replay,
      replayPaths: captured.length,
      source: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      sources,
      scope:
        "Production application/core harness directly compiles Store/Session/application/agent_access/sync model in place; real SQLite with bundled/hooks; exactly three settings/archive tests and four actual App replay paths; no copied crate, no fallback, no native Tauri/user Store acceptance.",
    },
    null,
    2,
  ) + "\n",
);
console.log(result.stdout);
if (!passed) {
  console.error(result.stderr);
  console.error("Store runner failed: expected exactly three passing tests and unchanged source inputs; see artifacts/evolve114-store/result.json");
  process.exitCode = 1;
}
