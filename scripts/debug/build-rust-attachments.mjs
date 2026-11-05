#!/usr/bin/env node
// Explicit opt-in compilation of current Session/Store. Never runs a stale binary.
import {
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  stat,
} from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
const root = process.cwd(),
  out = resolve(process.argv[2] || ""),
  target = process.env.CARGO_TARGET_DIR;
if (!process.argv[2] || !target)
  throw Error(
    "Usage: CARGO_TARGET_DIR=exclusively-assigned-cache node scripts/debug/build-rust-attachments.mjs FRESH_OUTPUT",
  );
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = ["src-tauri/src/store.rs", "src-tauri/src/session.rs"];
for (const dir of ["store", "session"])
  for (const ent of await readdir(resolve(root, "src-tauri/src", dir), {
    recursive: true,
    withFileTypes: true,
  }))
    if (ent.isFile())
      files.push(resolve(ent.parentPath, ent.name).slice(root.length + 1));
for (const name of ["Cargo.toml", "Cargo.lock", "transport.rs"])
  files.push("scripts/debug/rust/" + name);
files.push("scripts/debug/build-rust-attachments.mjs");
files.sort();
const sources = {};
for (const file of files)
  sources[file] = digest(await readFile(resolve(root, file)));
await mkdir(out);
const harness = resolve(out, "harness");
await mkdir(harness);
await cp(resolve(root, "scripts/debug/rust"), harness, { recursive: true });
await mkdir(resolve(harness, "current"));
for (const name of ["store.rs", "store", "session.rs", "session"])
  await cp(
    resolve(root, "src-tauri/src", name),
    resolve(harness, "current", name),
    { recursive: true },
  );
const metadata = {
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sources,
  target: resolve(target),
  harness,
  commands: [],
};
const record = () =>
  writeFile(
    resolve(out, "build.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
await record();
const args = [
  "build",
  "--locked",
  "--offline",
  "--manifest-path",
  resolve(harness, "Cargo.toml"),
];
const began = performance.now();
const build = spawnSync("cargo", args, {
  cwd: root,
  env: { ...process.env, CARGO_BUILD_JOBS: "2" },
  encoding: "utf8",
  timeout: 180000,
  maxBuffer: 8 * 1024 * 1024,
});
await writeFile(
  resolve(out, "build.log"),
  (build.stdout || "") + (build.stderr || ""),
);
metadata.commands.push({
  command: ["cargo", ...args],
  exitCode: build.status,
  signal: build.signal,
  wallMs: Math.round(performance.now() - began),
  error: build.error?.message,
});
await record();
if (build.status !== 0)
  throw Error("Current Rust build failed; inspect " + out + "/build.log");
const dependency = spawnSync(
  "cargo",
  [
    "metadata",
    "--locked",
    "--offline",
    "--format-version",
    "1",
    "--manifest-path",
    resolve(harness, "Cargo.toml"),
  ],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);
if (dependency.status !== 0) throw Error(dependency.stderr);
const graph = JSON.parse(dependency.stdout);
metadata.dependencies = [];
for (const p of graph.packages) {
  const entry = {
    id: p.id,
    name: p.name,
    version: p.version,
    source: p.source,
  };
  if (p.source) {
    const directory = dirname(p.manifest_path);
    const paths = (
      await readdir(directory, { recursive: true, withFileTypes: true })
    )
      .filter((e) => e.isFile())
      .map((e) => resolve(e.parentPath, e.name))
      .sort();
    const hash = createHash("sha256");
    for (const path of paths) {
      hash.update(relative(directory, path));
      hash.update("\0");
      hash.update(await readFile(path));
      hash.update("\0");
    }
    entry.sourceSha256 = hash.digest("hex");
    entry.sourceFiles = paths.length;
    entry.registryChecksumSha256 = digest(
      await readFile(resolve(directory, ".cargo-checksum.json")),
    );
  }
  metadata.dependencies.push(entry);
}
await writeFile(resolve(out, "dependencies.json"), dependency.stdout);
const binary = resolve(target, "debug/notes-current-attachment-transport");
metadata.binary = {
  path: binary,
  sha256: digest(await readFile(binary)),
  size: (await stat(binary)).size,
};
metadata.sourcesUnchanged = true;
for (const file of files)
  if (sources[file] !== digest(await readFile(resolve(root, file))))
    metadata.sourcesUnchanged = false;
await record();
if (!metadata.sourcesUnchanged) throw Error("Source changed during Rust build");
console.log(JSON.stringify(metadata.binary));
