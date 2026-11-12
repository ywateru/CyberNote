#!/usr/bin/env node
// Evidence migration only: reads the existing binary/dist, never invokes a build.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productFiles, sourceIdentity } from "../build-info.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputTools = [
  "scripts/build-info.mjs",
  "scripts/verification/sync108-canonical-build-record.mjs",
  "scripts/verification/sync108-native-driver.mjs",
  "scripts/verification/sync108-native.mjs",
  "src-tauri/src/sync_e2e.rs",
];

export async function productFingerprint(root) {
  const identity = sourceIdentity(root), files = {};
  // Keep sourceIdentity's framing/hash algorithm; do not hash a Git file list or
  // substitute JSON(file hashes) for the canonical product fingerprint.
  for (const path of productFiles(root)) files[path] = hash(await readFile(resolve(root, path)));
  assert.equal(Object.keys(files).length, identity.inputCount);
  assert.equal(sourceIdentity(root).sourceFingerprint, identity.sourceFingerprint, "Product inputs changed during enumeration");
  return { identity, files };
}

async function staticFrontend(root) {
  const base = resolve(root, "dist"), files = {};
  for (const entry of await readdir(base, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = resolve(entry.parentPath, entry.name);
      files[relative(base, path)] = hash(await readFile(path));
    }
  }
  const sorted = Object.fromEntries(Object.entries(files).sort());
  return {
    sha256: hash(JSON.stringify(sorted)), files: sorted,
    buildInfo: JSON.parse(await readFile(resolve(base, "build-info.json"), "utf8")),
  };
}

async function matchProductToCommit(root, commit, paths) {
  assert.equal(execFileSync("git", ["rev-parse", "--show-object-format"], { cwd: root, encoding: "utf8" }).trim(), "sha1");
  const entries = execFileSync("git", ["ls-tree", "-r", "-z", commit, "--", ...paths], { cwd: root }).toString().split("\0").filter(Boolean);
  const blobs = new Map(entries.map((entry) => {
    const tab = entry.indexOf("\t");
    return [entry.slice(tab + 1), entry.slice(0, tab).split(" ")[2]];
  }));
  for (const path of paths) {
    const bytes = await readFile(resolve(root, path));
    const oid = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(oid, blobs.get(path), `Product file differs from recorded binary source commit: ${path}`);
  }
  return { commit, allCurrentProductFilesMatch: true, inputCount: paths.length };
}

export async function generate({ root, binary, historicalRecord, buildRecord, out }) {
  root = resolve(root);
  assert(isAbsolute(binary) && isAbsolute(out), "Binary and output paths must be absolute");
  assert.notEqual(resolve(historicalRecord), resolve(out), "Preserve the historical manifest");
  const historicalBytes = await readFile(historicalRecord);
  const historical = JSON.parse(historicalBytes);
  const buildBytes = buildRecord ? await readFile(buildRecord) : historicalBytes;
  const previous = JSON.parse(buildBytes);
  if (buildRecord) assert.notEqual(resolve(buildRecord), resolve(out), "Preserve the build evidence");
  const binaryBytes = await readFile(binary), binaryHash = hash(binaryBytes);
  assert.equal(binaryHash, previous.binary.sha256, "Binary differs from the selected build evidence");
  const product = await productFingerprint(root);
  const frontend = await staticFrontend(root);
  assert.equal(frontend.sha256, previous.staticFrontendSha256, "Existing static frontend differs from the recorded embedded dist");
  assert.equal(frontend.sha256, historical.staticFrontendSha256, "Static frontend changed since the preserved baseline");
  const buildCommitCheck = await matchProductToCommit(root, previous.sourceCommit, Object.keys(product.files));
  const tools = {};
  for (const path of [...inputTools].sort()) tools[path] = hash(await readFile(resolve(root, path)));
  const marker = Buffer.from("@@SYNC108_NATIVE@@"), thread = Buffer.from("sync108-stdin");
  const ordinaryApp = resolve(binary, "../bundle/macos/CyberNote.app/Contents/MacOS/notes-clone");
  const ordinaryBytes = await readFile(ordinaryApp);
  const record = {
    schema: 2, kind: "canonical-native-build-identity", generatedAt: new Date().toISOString(),
    binary: { path: binary, sha256: binaryHash, unchangedFromHistoricalRecord: binaryHash === historical.binary.sha256, matchesBuildRecord: true },
    sourceSha256: product.identity.sourceFingerprint,
    sourceEnumeration: {
      module: "scripts/build-info.mjs", paths: "productFiles(root)", identity: "sourceIdentity(root)",
      algorithm: "SHA256(file path + NUL + byte length + NUL + raw bytes), canonical sorted productFiles order",
      gitTrackedGeneratedFilesAreNotInputs: true,
    },
    product: { ...product, buildCommitCheck },
    nativeTools: { sha256: hash(JSON.stringify(tools)), algorithm: "SHA256(JSON(sorted path-to-SHA256 map))", files: tools },
    staticFrontendSha256: frontend.sha256,
    staticFrontend: {
      ...frontend, unchangedFromHistoricalRecord: true, reusedWithoutRebuild: true,
      provenance: "Existing dist identity retained from the recorded static-debug frontend build and native embedded-origin handshake. Its build-info source identity predates the Rust-only Ready fix; it is not the current product fingerprint.",
    },
    build: {
      sourceCommit: previous.sourceCommit, frontendCommand: previous.frontendCommand,
      nativeCommand: previous.nativeCommand, compileGates: previous.compileGates, runtimeGate: previous.runtimeGate,
      noBuildPerformedForThisManifest: true,
    },
    ...(buildRecord ? { buildRecord: { path: relative(root, buildRecord), sha256: hash(buildBytes), retainedUnmodified: true } } : {}),
    readOnlyBinaryEvidence: {
      featureBinary: { stdioPrefixPresent: binaryBytes.includes(marker), stdinThreadPresent: binaryBytes.includes(thread) },
      ordinaryDebugApp: { path: ordinaryApp, sha256: hash(ordinaryBytes), stdioPrefixPresent: ordinaryBytes.includes(marker), stdinThreadPresent: ordinaryBytes.includes(thread) },
      limitation: "Marker checks describe these two existing artifacts. They do not establish a separately executed release-build exclusion test; release exclusion is recorded from the compile cfg.",
    },
    historicalRecord: {
      path: relative(root, historicalRecord), sha256: hash(historicalBytes), retainedUnmodified: true,
      status: "historical-enumeration-defect",
      reason: "Git-tracked snapshot outputs included plugin Android build/.tauri caches and the old list omitted some canonical product inputs. Keep prior records and failures; do not use their sourceFiles as the canonical build input set.",
    },
    handshake: previous.handshake,
    runnerCompatibility: {
      legacyGitFingerprintRunnerAcceptsThisRecord: false,
      reason: "The legacy runner --build-record comparison uses git ls-files plus JSON hashes. A canonical verifier must compare sourceSha256 with sourceIdentity(root).sourceFingerprint and check nativeTools separately. This migration does not modify the suite/driver.",
    },
  };
  assert(record.readOnlyBinaryEvidence.featureBinary.stdioPrefixPresent);
  assert(!record.readOnlyBinaryEvidence.ordinaryDebugApp.stdioPrefixPresent);
  assert.equal(hash(await readFile(binary)), binaryHash);
  assert.equal(hash(await readFile(historicalRecord)), record.historicalRecord.sha256);
  if (buildRecord) assert.equal(hash(await readFile(buildRecord)), record.buildRecord.sha256);
  await writeFile(out, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  return record;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(["--root", "--binary", "--historical-record", "--build-record", "--out"].includes(args[i]) && args[i + 1] && !options[args[i]], "Unknown, duplicate or incomplete option");
    options[args[i]] = args[i + 1];
  }
  assert(options["--root"] && options["--binary"] && options["--historical-record"] && options["--out"], "Supply --root --binary --historical-record --out");
  const record = await generate({ root: options["--root"], binary: options["--binary"], historicalRecord: resolve(options["--historical-record"]), buildRecord: options["--build-record"] ? resolve(options["--build-record"]) : undefined, out: options["--out"] });
  console.log(JSON.stringify({ binarySha256: record.binary.sha256, productFingerprint: record.sourceSha256, inputCount: record.product.identity.inputCount, staticFrontendSha256: record.staticFrontendSha256, out: options["--out"] }));
}
