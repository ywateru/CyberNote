// RID1: real temporary Git indexes. No user checkout flags are changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  projectRoot, sourceIdentity, releaseStamp, validateStamp,
  createBuildInfo, resolveReleaseVersion,
} from '../build-info.mjs';

const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.startsWith('GIT_') && !key.startsWith('GITHUB_') && !key.startsWith('CYBERNOTE_') && !key.startsWith('CARGO_')));
const flags = ['assume-unchanged', 'skip-worktree'];
function fixture(t, { cargo = false } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'identity-hidden-index-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'checkout'); mkdirSync(root);
  const put = (name, data) => {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), data);
  };
  const gitAt = (cwd, args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe', timeout: 15000 }).trim();
  const git = args => gitAt(root, args);
  put('package.json', '{"version":"0.1.0"}');
  put('src-tauri/tauri.conf.json', '{"version":"0.1.0"}');
  put('src-tauri/Cargo.toml', '[package]\nname="notes-clone"\nversion="0.1.0"\nedition="2021"\n');
  put('src-tauri/Cargo.lock', 'version = 4\n\n[[package]]\nname = "notes-clone"\nversion = "0.1.0"\n');
  put('src/main.ts', 'export const identityFixture = 1;\n');
  put('README.md', 'non-product tracked bytes\n');
  put('.gitignore', 'dist/\nartifacts/\ntarget/\n');
  for (const file of ['scripts/build-info.mjs', 'src-tauri/build.rs', 'scripts/publish/stage-packages.py']) put(file, readFileSync(join(projectRoot, file)));
  if (cargo) {
    const stub = join(temp, 'tauri-build'); mkdirSync(join(stub, 'src'), { recursive: true });
    writeFileSync(join(stub, 'Cargo.toml'), '[package]\nname="tauri-build"\nversion="0.0.0"\nedition="2021"\n');
    writeFileSync(join(stub, 'src/lib.rs'), 'pub fn build() {}');
    put('src-tauri/Cargo.toml', `[package]\nname="notes-clone"\nversion="0.1.0"\nedition="2021"\n[build-dependencies]\ntauri-build={path=${JSON.stringify(stub)}}\n`);
    put('src-tauri/src/main.rs', 'fn main(){println!("{}",option_env!("CYBERNOTE_RELEASE_VERSION").filter(|v| !v.is_empty()).unwrap_or(env!("CARGO_PKG_VERSION")));}');
    execFileSync('cargo', ['generate-lockfile', '--offline', '--manifest-path', join(root, 'src-tauri/Cargo.toml')], { env, stdio: 'pipe', timeout: 30000 });
  }
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Isolated RID1 Fixture', '-c', 'user.email=rid1@example.invalid', 'commit', '-qm', 'tracked source']);
  git(['tag', 'v0.1.0-preview.2']);
  const info = () => createBuildInfo({ root, environment: {}, stampPath: undefined });
  const ci = { GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.0-preview.2', GITHUB_SHA: git(['rev-parse', 'HEAD']) };
  const cli = () => spawnSync(process.execPath, [join(root, 'scripts/build-info.mjs'), '--validate-release-build-info', join(root, 'dist/build-info.json')], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
  const stage = () => spawnSync('python3', ['-c', `import importlib.util,json,sys\nfrom pathlib import Path\nsys.dont_write_bytecode=True\ns=importlib.util.spec_from_file_location('stage',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr=Path(sys.argv[2]);print(m.release_identity(r,json.loads((r/'dist/build-info.json').read_text())))`, join(root, 'scripts/publish/stage-packages.py'), root], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
  return { temp, root, put, git, gitAt, info, ci, cli, stage };
}

for (const flag of flags) {
  test(`RID1 ${flag}: sourceDirty/stamp/local+CI resolver reject hidden state without altering index`, t => {
    const f = fixture(t), before = sourceIdentity(f.root, { metadataPath: null });
    const stamp = releaseStamp(f.root);
    assert.equal(before.sourceDirty, false);
    assert.equal(f.info().releaseVersion, '0.1.0-preview.2');
    f.put('artifacts/source-stamp.json', JSON.stringify(stamp));
    f.git(['update-index', `--${flag}`, 'src/main.ts']);
    const unchangedIndex = readFileSync(join(f.root, '.git/index'));
    assert.equal(f.git(['status', '--porcelain']), '', 'control: ordinary status hides the index hint');
    assert.equal(sourceIdentity(f.root, { metadataPath: null }).sourceFingerprint, before.sourceFingerprint);
    assert.equal(sourceIdentity(f.root, { metadataPath: null }).sourceDirty, true, 'even unmodified hidden entries are conservatively dirty');
    assert.throws(() => validateStamp(stamp, f.root), /stamp is stale/);
    assert.throws(() => createBuildInfo({ root: f.root, environment: {}, stampPath: 'artifacts/source-stamp.json' }), /stamp is stale/);
    f.put('src/main.ts', 'export const identityFixture = 2; // hidden bytes\n');
    assert.equal(f.git(['status', '--porcelain']), '', 'the regression really uses a status-invisible edit');
    const dirty = sourceIdentity(f.root, { metadataPath: null });
    assert.notEqual(dirty.sourceFingerprint, before.sourceFingerprint);
    assert.equal(dirty.sourceDirty, true);
    assert.equal(releaseStamp(f.root).sourceDirty, true, 'a freshly prepared stamp cannot call these bytes clean');
    for (const environment of [{}, f.ci]) {
      assert.throws(() => resolveReleaseVersion(f.root, { environment }), /clean checkout/);
      assert.throws(() => createBuildInfo({ root: f.root, environment, stampPath: undefined }), /clean checkout/);
    }
    const dev = createBuildInfo({ root: f.root, environment: {}, development: true, stampPath: undefined });
    assert.equal(dev.releaseVersion, null); assert.equal(dev.sourceDirty, true);
    const branch = createBuildInfo({ root: f.root, stampPath: undefined, environment: { GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' } });
    assert.equal(branch.releaseVersion, null); assert.equal(branch.sourceDirty, true);
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), unchangedIndex, 'validation never clears/rebuilds user index flags');
  });

  test(`RID1 ${flag}: actual build.rs Cargo build and staging CLI reject forged matching hidden bytes`, t => {
    const f = fixture(t, { cargo: true });
    const clean = f.info(); f.put('dist/build-info.json', JSON.stringify(clean));
    assert.equal(f.cli().status, 0); assert.equal(f.stage().status, 0);
    const cargo = () => spawnSync('cargo', ['build', '--offline', '--locked', '--release', '--manifest-path', join(f.root, 'src-tauri/Cargo.toml')], { env: { ...env, CARGO_TARGET_DIR: join(f.temp, 'target') }, encoding: 'utf8', timeout: 60000 });
    const first = cargo(); assert.equal(first.status, 0, first.stderr);
    assert.equal(execFileSync(join(f.temp, 'target/release/notes-clone'), { env, encoding: 'utf8' }).trim(), '0.1.0-preview.2');
    f.git(['update-index', `--${flag}`, 'src/main.ts']);
    const index = readFileSync(join(f.root, '.git/index'));
    f.put('src/main.ts', `export const identityFixture = 3; // ${flag}\n`);
    assert.equal(f.git(['status', '--porcelain']), '');
    // Recreate the former exploit: metadata has the actual new fingerprint but
    // falsely claims a clean tag. Do not let API rejection hide downstream bugs.
    const changed = sourceIdentity(f.root, { metadataPath: null });
    f.put('dist/build-info.json', JSON.stringify({ ...clean, ...changed, sourceDirty: false, releaseVersion: '0.1.0-preview.2' }));
    const native = cargo();
    assert.notEqual(native.status, 0, 'actual build.rs must reject, including after a successful cached release build');
    assert.match(native.stderr, /clean checkout.*assume-unchanged.*skip-worktree/s);
    const cli = f.cli(); assert.notEqual(cli.status, 0); assert.match(cli.stderr, /clean checkout/);
    const staging = f.stage(); assert.notEqual(staging.status, 0); assert.match(staging.stderr, /clean checkout/);
    assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  });
}

test('RID1 conservative policy includes non-product flags; ordinary checkout and real linked worktree remain eligible', t => {
  const f = fixture(t);
  f.git(['update-index', '--assume-unchanged', 'README.md']);
  f.git(['update-index', '--skip-worktree', 'src/main.ts']);
  assert.equal(sourceIdentity(f.root, { metadataPath: null }).sourceDirty, true);
  assert.throws(() => f.info(), /clean checkout/);
  const linked = join(f.temp, 'linked'); f.git(['worktree', 'add', '--detach', linked, 'HEAD']);
  assert.equal(sourceIdentity(linked, { metadataPath: null }).sourceDirty, false);
  assert.equal(createBuildInfo({ root: linked, environment: {}, stampPath: undefined }).releaseVersion, '0.1.0-preview.2');
  f.gitAt(linked, ['update-index', '--skip-worktree', 'src/main.ts']);
  writeFileSync(join(linked, 'src/main.ts'), 'hidden linked worktree bytes');
  assert.equal(f.gitAt(linked, ['status', '--porcelain']), '');
  assert.equal(sourceIdentity(linked, { metadataPath: null }).sourceDirty, true);
  assert.throws(() => createBuildInfo({ root: linked, environment: {}, stampPath: undefined }), /clean checkout/);
});

test('RID3: a real checkout index exceeding 1 MiB validates completely and detects a hidden entry at its end', t => {
  const f = fixture(t);
  let last;
  for (let i = 0; i < 12000; i++) {
    last = `vendor/retained-library-fixture/src/portable-platform-paths/${String(i).padStart(6, '0')}-${'source-path-'.repeat(5)}.txt`;
    f.put(last, '');
  }
  f.git(['add', '.']);
  f.git(['-c', 'user.name=Large Index Fixture', '-c', 'user.email=large-index@example.invalid', 'commit', '-qm', 'real shaped source paths']);
  f.git(['tag', '-f', 'v0.1.0-preview.2']);
  const raw = execFileSync('git', ['ls-files', '-v', '-z'], { cwd: f.root, env, maxBuffer: 32 * 1024 * 1024 });
  assert(raw.length > 1024 * 1024, `fixture must exceed default maxBuffer: ${raw.length}`);
  const index = readFileSync(join(f.root, '.git/index'));
  assert.equal(sourceIdentity(f.root, { metadataPath: null }).sourceDirty, false);
  assert.equal(f.info().releaseVersion, '0.1.0-preview.2');
  assert.equal(createBuildInfo({ root: f.root, development: true, environment: {}, stampPath: undefined }).sourceDirty, false);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), index);
  f.git(['update-index', '--skip-worktree', last]);
  f.put(last, 'hidden change beyond the default output buffer');
  const flagged = readFileSync(join(f.root, '.git/index'));
  assert.equal(sourceIdentity(f.root, { metadataPath: null }).sourceDirty, true);
  assert.throws(() => f.info(), /clean checkout/);
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), flagged);
});
