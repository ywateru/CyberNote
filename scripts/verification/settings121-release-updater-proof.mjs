// Bounded cross-module proof. Read the frozen updater comparator from Git objects,
// never edit or execute the updater worktree, installed app, or application data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRoot, releaseVersionFromTag } from '../build-info.mjs';
const updaterRevision = process.env.UPDATE_IDENTITY_PROOF_REVISION ?? 'cfde38103f71d0dd1fdf3e60a5c720a63abb2461';
const versionSource = execFileSync('git', ['show', `${updaterRevision}:src-tauri/src/software_update/version.rs`], { cwd: projectRoot });
const directory = mkdtempSync(join(tmpdir(), 'release-updater-comparison-'));
try {
  writeFileSync(join(directory, 'version.rs'), versionSource);
  writeFileSync(join(directory, 'proof.rs'), `mod version;
fn current() -> &'static str { option_env!("CYBERNOTE_RELEASE_VERSION").filter(|v| !v.is_empty()).unwrap_or(env!("CARGO_PKG_VERSION")) }
fn main() {
 let installed=version::Version::parse(current()).unwrap();
 let next=version::Version::parse("0.1.0-preview.3").unwrap();
 let stable=version::Version::parse("0.1.0").unwrap();
 assert_eq!(next>installed, current()=="0.1.0-preview.2");
 assert!(stable>=installed);
 if current()=="0.1.0-preview.2" {assert!(stable>installed);}
 println!("{} => preview.3: {}",current(),next>installed);
}`);
  for (const releaseVersion of [releaseVersionFromTag('v0.1.0-preview.2', '0.1.0'), releaseVersionFromTag('v0.1.0', '0.1.0'), '']) {
    execFileSync('rustc', ['--edition=2021', join(directory, 'proof.rs'), '-o', join(directory, 'proof')], {
      env: { ...process.env, CARGO_PKG_VERSION: '0.1.0', CYBERNOTE_RELEASE_VERSION: releaseVersion }, stdio: 'pipe',
    });
    const output = execFileSync(join(directory, 'proof'), { encoding: 'utf8' }).trim();
    assert(output.includes(releaseVersion || '0.1.0')); console.log(output);
  }
  console.log(`PASS exact frozen updater comparator ${updaterRevision}; temporary Rust consumers only`);
} finally { rmSync(directory, { recursive: true, force: true }); }
