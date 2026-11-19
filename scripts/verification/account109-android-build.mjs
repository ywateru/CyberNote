/** Build-only Account109 candidate. Never installs, launches, or contacts ADB.
 * node scripts/verification/account109-android-build.mjs <full-source-sha> [--prepare-only]
 * Run from a dedicated clean worktree with node_modules already available.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

export async function prepareCandidate({ root = toolRoot, expectedSource, gradleHome = '/private/tmp/cybernote-account109-gradle', targetDir = '/private/tmp/cybernote-account109-target' }) {
  if (!/^[0-9a-f]{40}$/.test(expectedSource || '')) throw Error('A full exact source SHA is required');
  if (git(root, 'rev-parse', 'HEAD') !== expectedSource) throw Error('Candidate source differs from requested SHA');
  if (git(root, 'status', '--porcelain', '--untracked-files=normal')) throw Error('Candidate worktree must be clean');
  if (!existsSync(path.join(root, 'node_modules'))) throw Error('Prepare node_modules before building');
  if (!path.isAbsolute(targetDir) || (existsSync(targetDir) && lstatSync(targetDir).isSymbolicLink())) {
    throw Error('Candidate target must be an absolute non-symlink directory');
  }
  // This home is private to Account109; reuse artifact caches, never daemon state.
  if (existsSync(gradleHome) && lstatSync(gradleHome).isSymbolicLink()) throw Error('Gradle home must not be a symlink');
  const marker = path.join(gradleHome, '.account109-build-owner');
  if (existsSync(gradleHome) && !existsSync(marker)) throw Error('Refusing an unowned existing Gradle home');
  if (existsSync(marker) && readFileSync(marker, 'utf8') !== 'account109-isolated-build-v1\n') throw Error('Unexpected Gradle owner marker');
  await mkdir(path.join(gradleHome, 'init.d'), { recursive: true });
  if (!existsSync(marker)) await writeFile(marker, 'account109-isolated-build-v1\n', { flag: 'wx', mode: 0o600 });
  const sourceCache = process.env.ACCOUNT109_GRADLE_CACHE || path.join(os.homedir(), '.gradle');
  if (realpathSync(gradleHome) === realpathSync(sourceCache)) throw Error('Gradle home and shared cache must differ');
  for (const entry of ['caches', 'wrapper']) {
    if (!existsSync(path.join(gradleHome, entry)) && existsSync(path.join(sourceCache, entry))) {
      await symlink(path.join(sourceCache, entry), path.join(gradleHome, entry));
    }
  }
  const init = path.join(toolRoot, 'scripts/verification/account109-android.init.gradle');
  await copyFile(init, path.join(gradleHome, 'init.d/account109.gradle'));
  const env = {
    ...process.env,
    NODE_ENV: 'development', VITE_NOTES_DEBUG: '1',
    GRADLE_USER_HOME: gradleHome,
    GRADLE_OPTS: '-Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false -Dorg.gradle.configuration-cache=false -Dorg.gradle.daemon=false',
    CARGO_TARGET_DIR: targetDir, CARGO_BUILD_JOBS: '2',
    CARGO_PROFILE_DEV_DEBUG: '0', CARGO_PROFILE_TEST_DEBUG: '0', CARGO_INCREMENTAL: '0',
  };
  // Test the shipped native default rather than an inherited opt-in or opt-out.
  delete env.VITE_NOTES_ACCOUNT_NATIVE;
  delete env.VITE_NOTES_ACCOUNT_UI;
  const manifest = {
    schemaVersion: 1, sourceCommit: expectedSource, sourceTree: git(root, 'rev-parse', 'HEAD^{tree}'),
    toolCommit: git(toolRoot, 'rev-parse', 'HEAD'),
    toolSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), initScriptSha256: sha256(readFileSync(init)),
    packageId: 'com.local.notesclone.account109', activity: 'com.local.notesclone.MainActivity',
    displayName: 'CyberNote Account Test', sdkSource: 'CyberBus',
    gradleHome, target: env.CARGO_TARGET_DIR,
    removedEnvironmentFlags: ['VITE_NOTES_ACCOUNT_NATIVE', 'VITE_NOTES_ACCOUNT_UI'],
    accountCapability: 'default-native',
    lockfiles: Object.fromEntries(['pnpm-lock.yaml', 'src-tauri/Cargo.lock'].map(name =>
        [name, sha256(readFileSync(path.join(root, name)))])),
    buildFlags: Object.fromEntries(['NODE_ENV', 'VITE_NOTES_DEBUG',
      'CARGO_TARGET_DIR', 'CARGO_BUILD_JOBS', 'CARGO_PROFILE_DEV_DEBUG', 'CARGO_PROFILE_TEST_DEBUG',
      'CARGO_INCREMENTAL'].map(name => [name, env[name]])),
    command: [process.execPath, 'scripts/android.mjs', 'build', '--debug', '--target', 'aarch64', '--apk', '--ci'],
  };
  await mkdir(path.join(root, 'artifacts/account109'), { recursive: true });
  await writeFile(path.join(root, 'artifacts/account109/build-request.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { root, env, manifest };
}

async function main() {
  const [expectedSource, option] = process.argv.slice(2);
  if (option && option !== '--prepare-only') throw Error('Only --prepare-only is supported');
  const candidate = await prepareCandidate({ expectedSource });
  console.log(JSON.stringify(candidate.manifest, null, 2));
  if (option === '--prepare-only') return;
  const result = spawnSync(candidate.manifest.command[0], candidate.manifest.command.slice(1), {
    cwd: candidate.root, env: candidate.env, stdio: 'inherit',
  });
  if (result.status !== 0) throw Error(`Android build failed: ${result.signal || result.status}`);
  if (git(candidate.root, 'status', '--porcelain', '--untracked-files=normal')) {
    throw Error('Build produced source changes; inspect and record derived diff before any installation');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
