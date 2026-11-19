// Prove the new behavioral assertions fail against the frozen old algorithms.
// Temporary harness only; never checks out or edits a developer's source tree.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const root = process.cwd();
const revision = "189b348e66e1d9db02c0d796e5671ea3c3d15e1c";
const output = resolve(
  process.argv[2] || "/tmp/settings121-cloud-old-regressions",
);
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), "cloud-old-behavior-"));
const results = [];
try {
  const cloud = join(directory, "cloud");
  mkdirSync(cloud);
  for (const name of readdirSync(resolve(root, "src-tauri/src/cloud_sync")))
    if (name.endsWith(".rs"))
      copyFileSync(
        resolve(root, "src-tauri/src/cloud_sync", name),
        join(cloud, name),
      );
  writeFileSync(
    join(cloud, "settings_port.rs"),
    execFileSync(
      "git",
      ["show", `${revision}:src-tauri/src/cloud_sync/settings_port.rs`],
      { cwd: root },
    ),
  );
  const harness = join(directory, "harness");
  mkdirSync(join(harness, "src"), { recursive: true });
  for (const name of ["Cargo.toml", "Cargo.lock"])
    copyFileSync(
      resolve(root, "src-tauri/src/cloud_sync/harness", name),
      join(harness, name),
    );
  const native = resolve(root, "src-tauri/src");
  writeFileSync(
    join(harness, "src/lib.rs"),
    `#![allow(dead_code,unused_imports)]\n${["agent_access", "application"].map((name) => `#[path=${JSON.stringify(join(native, name, "mod.rs"))}] mod ${name};`).join("\n")}\n#[path=${JSON.stringify(join(cloud, "mod.rs"))}] mod cloud_sync;\n#[path=${JSON.stringify(join(cloud, "tests.rs"))}] mod cloud_tests;\n#[path=${JSON.stringify(join(native, "session.rs"))}] mod session;\n#[path=${JSON.stringify(join(native, "store.rs"))}] mod store;\nmod sync { #[path=${JSON.stringify(join(native, "sync/model.rs"))}] pub(crate) mod model; }`,
  );
  for (const [id, name, expected] of [
    [
      "C2",
      "cloud_settings_actual_owners_survive_unrelated_store_save_and_preserve_local_siblings",
      /left: String\("light"\)/,
    ],
    [
      "C3",
      "cloud_settings_missing_or_disabled_control_is_unknown_at_every_entry_and_never_repaired",
      /Option::unwrap\(\).*None|unwrap\(\).*None/s,
    ],
  ]) {
    const result = spawnSync(
      "cargo",
      [
        "test",
        "--manifest-path",
        join(harness, "Cargo.toml"),
        "--lib",
        "--offline",
        "--locked",
        `cloud_tests::settings_regressions::${name}`,
        "--",
        "--exact",
        "--nocapture",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          CARGO_TARGET_DIR:
            process.env.CARGO_TARGET_DIR ||
            "/tmp/cybernote-settings121-cloud-fix-target",
        },
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    const log = result.stdout + result.stderr;
    writeFileSync(join(output, `${id}.log`), log);
    assert.equal(
      result.status,
      101,
      `${id}: old behavioral test should fail, not compile or timeout: ${log}`,
    );
    assert.match(log, /test result: FAILED/);
    assert.match(log, expected);
    results.push({
      id,
      oldBehaviorRejected: true,
      log: join(output, `${id}.log`),
    });
  }
  for (const id of ["C4", "C5"]) {
    const folder = join(output, id);
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, "scripts/verification/settings121-cloud/browser.mjs"),
        folder,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          CLOUD_COMPONENT_REVISION: revision,
          ...(id === "C5" ? { CLOUD_REGRESSION_ONLY: "c5" } : {}),
        },
        encoding: "utf8",
        timeout: 45000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    writeFileSync(join(output, `${id}.log`), result.stdout + result.stderr);
    assert.equal(
      result.status,
      1,
      `${id}: old component should fail behavioral assertion, not timeout`,
    );
    const evidence = JSON.parse(
      readFileSync(join(folder, "failure.json"), "utf8"),
    );
    if (id === "C4")
      assert(
        evidence.errors.some((error) => error.includes("native dialog failed")),
        JSON.stringify(evidence),
      );
    else
      assert.match(
        evidence.error,
        /fixture\.clientResolvers\.length===2|fixture\.clientResolvers\.length === 2|waitForFunction: Timeout/,
      );
    results.push({
      id,
      oldBehaviorRejected: true,
      evidence: join(folder, "failure.json"),
    });
  }
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        revision,
        results,
        scope:
          "Frozen settings_port/React behavior only; no product source mutation or live Store/account",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ revision, results }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
