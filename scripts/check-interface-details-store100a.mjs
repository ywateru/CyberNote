// Native-free test harness, copying production modules without changing them.
import { mkdir, cp, readFile, writeFile, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const out = resolve("artifacts/design100a-store"),
  harness = resolve(out, "harness");
if (!process.env.CARGO_TARGET_DIR)
  throw Error("Set the assigned shared CARGO_TARGET_DIR");
const disk = await statfs(".");
if (disk.bavail * disk.bsize < 2.5 * 1024 ** 3)
  throw Error("STOP: less than2.5GiB free");
await mkdir(resolve(harness, "src"), { recursive: true });
for (const name of [
  "store.rs",
  "store",
  "session.rs",
  "session",
  "sync.rs",
  "sync",
])
  await cp(resolve("src-tauri/src", name), resolve(harness, "src", name), {
    recursive: true,
  });
for (const name of ["Cargo.toml", "Cargo.lock"])
  await cp(resolve("scripts/debug/rust", name), resolve(harness, name));
const cargo = resolve(harness, "Cargo.toml");
await writeFile(
  cargo,
  (await readFile(cargo, "utf8")).replace(
    'path = "transport.rs"',
    'path = "src/main.rs"',
  ),
);
await writeFile(
  resolve(harness, "src/main.rs"),
  "mod store;\nmod session;\nmod sync;\nfn main() {}\n",
);
// Existing production unit tests include these tracked fixtures; sparse
// worktrees need not materialize unrelated documentation to compile them.
for (const name of [
  "qa-fix-00/schema-fixtures/inline-at-doc-root.notesbackup",
  "qa-fix-00/schema-fixtures/block-inside-paragraph.notesbackup",
  "qa-fix-00/schema-fixtures/paragraph-inside-table.notesbackup",
  "qa-001/store-probes/fixtures/valid.notesbackup",
]) {
  const path = resolve(out, "docs/verification", name);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(
    path,
    execFileSync("git", ["show", "HEAD:docs/verification/" + name]),
  );
}
await mkdir(resolve(out, "docs/fixtures"), { recursive: true });
await cp(
  "docs/fixtures/smart-projection09.json",
  resolve(out, "docs/fixtures/smart-projection09.json"),
);
const command = [
  "test",
  "--locked",
  "--offline",
  "--features",
  "rusqlite/hooks",
  "--manifest-path",
  cargo,
  "interface_details_settings_and_archive_are_strict_and_atomic",
  "--",
  "--nocapture",
];
const result = spawnSync("cargo", command, {
  env: { ...process.env, CARGO_BUILD_JOBS: "2" },
  encoding: "utf8",
  timeout: 180000,
  maxBuffer: 8 * 1024 ** 2,
});
await writeFile(
  resolve(out, "tests.log"),
  (result.stdout || "") + (result.stderr || ""),
);
const files = [
  "src-tauri/src/store.rs",
  "src-tauri/src/store/archive.rs",
  "src-tauri/src/store/archive/tests.rs",
];
await writeFile(
  resolve(out, "result.json"),
  JSON.stringify(
    {
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message,
      command: ["cargo", ...command],
      target: process.env.CARGO_TARGET_DIR,
      jobs: 2,
      source: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      sources: Object.fromEntries(
        await Promise.all(
          files.map(async (path) => [
            path,
            createHash("sha256")
              .update(await readFile(path))
              .digest("hex"),
          ]),
        ),
      ),
      scope:
        "Actual production Store/Session/archive tests in native-free conventional src tree; filtered new settings/archive test only; no native or user Store.",
    },
    null,
    2,
  ) + "\n",
);
console.log(result.stdout);
if (result.status !== 0) {
  console.error(result.stderr);
  process.exitCode = 1;
}
