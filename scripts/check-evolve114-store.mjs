// The production core harness is the only runner. No copied crate or fallback.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, realpath, symlink, writeFile, statfs, lstat } from "node:fs/promises";
import { resolve, relative, dirname, basename, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
if (process.argv.includes("--check-target-guard")) {
  await checkTargetGuard();
  process.exit(0);
}
const out = resolve("artifacts/evolve114-store");
const harness = "src-tauri/src/application/harness";
const cargo = resolve(harness, "Cargo.toml");
const requestedTarget = process.env.CARGO_TARGET_DIR;
const target = resolve(requestedTarget || "artifacts/evolve114-store/target");
// Preserve caller-selected isolated caches, but never use a Tauri app target.
// realpath of a missing leaf fails even when its parent is a symlink. Resolve
// the nearest existing ancestor before reattaching any not-yet-created suffix.
async function canonicalFuturePath(path) {
  const suffix = [];
  let ancestor = path;
  for (;;) {
    try {
      return resolve(await realpath(ancestor), ...suffix);
    } catch (error) {
      if (error.code !== "ENOENT" || dirname(ancestor) === ancestor) throw error;
      suffix.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
}
const canonicalTarget = await canonicalFuturePath(target);
if ([target, canonicalTarget].some(path =>
    [resolve("target"), resolve("src-tauri/target")].some(root => path === root || path.startsWith(root + sep))
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

// Runner boundary regressions only. Cargo spy deliberately fails: reaching it
// proves a safe new cache was admitted, never that any Rust test passed.
async function checkTargetGuard() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const script = resolve(repository, "scripts/check-evolve114-store.mjs");
  const base = await mkdtemp(resolve(tmpdir(), "evolve114-target-guard-"));
  const gitDirectory = execFileSync("git", ["-C", repository, "rev-parse", "--absolute-git-dir"], { encoding: "utf8" }).trim();
  const rows = [];
  const exists = async path => lstat(path).then(() => true, error => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  for (const [name, destination, suffix, forbidden] of [
    ["tauri-direct", "tauri", "", true],
    ["tauri-existing-alias", "tauri-alias", "", true],
    ["tauri-alias-new-child", "tauri-alias", "new-child", true],
    ["tauri-alias-new-multiple", "tauri-alias", "new-parent/new-child/cache", true],
    ["main-alias-new-child", "main-alias", "new-child", true],
    ["main-alias-new-multiple", "main-alias", "new-parent/new-child/cache", true],
    ["local-target-new-multiple", "local", "new-parent/new-child", true],
    ["safe-new-child", "safe", "new-child", false],
    ["safe-new-multiple", "safe", "new-parent/new-child/cache", false],
    ["safe-alias-new-multiple", "safe-alias", "new-parent/new-child/cache", false],
  ]) {
    const root = resolve(base, name);
    await mkdir(resolve(root, "src-tauri/target"), { recursive: true });
    await mkdir(resolve(root, "main/Apple-Notes-Clone/target"), { recursive: true });
    await mkdir(resolve(root, "safe-cache"));
    await symlink(resolve(root, "src-tauri/target"), resolve(root, "tauri-alias"));
    await symlink(resolve(root, "main/Apple-Notes-Clone/target"), resolve(root, "main-alias"));
    await symlink(resolve(root, "safe-cache"), resolve(root, "safe-alias"));
    const destinations = {
      tauri: resolve(root, "src-tauri/target"), "tauri-alias": resolve(root, "tauri-alias"),
      "main-alias": resolve(root, "main-alias"), local: resolve(root, "target"),
      safe: resolve(root, "safe-cache"), "safe-alias": resolve(root, "safe-alias"),
    };
    const requested = resolve(destinations[destination], suffix);
    const firstMissing = suffix ? resolve(destinations[destination], suffix.split("/")[0]) : null;
    // Read-only production inputs for safe cases; no copied Store or fake replay.
    await symlink(resolve(repository, "src-tauri/src"), resolve(root, "src-tauri/src"));
    await symlink(resolve(repository, "src-tauri/tests"), resolve(root, "src-tauri/tests"));
    await mkdir(resolve(root, "scripts"));
    await symlink(script, resolve(root, "scripts/check-evolve114-store.mjs"));
    await mkdir(resolve(root, "artifacts"));
    await symlink(resolve(repository, "artifacts/evolve114-regressions"), resolve(root, "artifacts/evolve114-regressions"));
    await mkdir(resolve(root, "bin"));
    const marker = resolve(root, "cargo-called");
    await writeFile(resolve(root, "bin/cargo"), '#!/bin/sh\nprintf reached > "$RUNNER_PROBE_MARKER"\nexit 79\n', { mode: 0o755 });
    const run = spawnSync(process.execPath, [script], {
      cwd: root,
      env: { ...process.env, PATH: resolve(root, "bin") + ":" + process.env.PATH,
        CARGO_TARGET_DIR: requested, RUNNER_PROBE_MARKER: marker, GIT_DIR: gitDirectory },
      encoding: "utf8", timeout: 20000,
    });
    assert.ifError(run.error);
    const row = { name, requestedTarget: requested, forbidden, exitCode: run.status,
      forbiddenGuard: run.stderr.includes("main/Tauri target is forbidden"),
      cargoCalled: await exists(marker), targetExists: await exists(requested),
      firstMissingCreated: firstMissing ? await exists(firstMissing) : null,
      outputDirectoryCreated: await exists(resolve(root, "artifacts/evolve114-store")) };
    await writeFile(resolve(root, "stdout.log"), run.stdout);
    await writeFile(resolve(root, "stderr.log"), run.stderr);
    assert.equal(run.status, 1, name);
    assert.equal(row.forbiddenGuard, forbidden, name);
    assert.equal(row.cargoCalled, !forbidden, name);
    assert.equal(row.outputDirectoryCreated, !forbidden, name);
    if (firstMissing) assert.equal(row.firstMissingCreated, !forbidden, name);
    if (!forbidden) {
      assert.equal(row.targetExists, true, name);
      const receipt = JSON.parse(await readFile(resolve(root, "artifacts/evolve114-store/result.json"), "utf8"));
      assert.equal(receipt.exitCode, 79, name);
      assert.equal(receipt.passed, false, name);
      assert.equal(receipt.sourcesUnchanged, true, name);
    }
    rows.push(row);
  }
  const evidence = resolve(base, "results.json");
  await writeFile(evidence, JSON.stringify({ script, scriptSha256: createHash("sha256").update(await readFile(script)).digest("hex"), rows }, null, 2) + "\n");
  console.log(`Target guard: ${rows.length} boundary cases passed; Cargo spy is not a Rust test. Evidence: ${evidence}`);
}
