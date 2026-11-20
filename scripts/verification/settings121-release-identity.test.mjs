import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import {
  projectRoot, productFiles, sourceIdentity, releaseStamp, createBuildInfo,
  resolveReleaseVersion, releaseVersionFromTag, validateBuildReleaseIdentity,
} from '../build-info.mjs';
import { validatePackageInfo, verifyEmbeddedIdentity } from '../publish/package-identity.mjs';

const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GITHUB_') && !key.startsWith('GIT_') && !key.startsWith('CYBERNOTE_')));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cybernote-release-identity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, bytes) => { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), bytes); };
  put('package.json', JSON.stringify({ version: '0.1.0' }));
  put('src-tauri/tauri.conf.json', JSON.stringify({ version: '0.1.0' }));
  put('src-tauri/Cargo.toml', '[package]\nname = "notes-clone"\nversion = "0.1.0"\n');
  put('src-tauri/Cargo.lock', 'version = 4\n\n[[package]]\nname = "notes-clone"\nversion = "0.1.0"\n');
  put('src/main.ts', 'export const value=1;');
  put('.gitignore', 'dist/\nartifacts/\ntarget/\n');
  put('scripts/build-info.mjs', readFileSync(join(projectRoot, 'scripts/build-info.mjs')));
  put('src-tauri/build.rs', readFileSync(join(projectRoot, 'src-tauri/build.rs')));
  put('scripts/publish/stage-packages.py', readFileSync(join(projectRoot, 'scripts/publish/stage-packages.py')));
  const git = args => execFileSync('git', args, { cwd: root, env: environment, encoding: 'utf8', stdio: 'pipe' }).trim();
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Identity Fixture', '-c', 'user.email=identity@example.invalid', 'commit', '-qm', 'fixture']); };
  git(['init', '-q']); commit();
  const info = (extra = {}) => createBuildInfo({ root, environment: {}, stampPath: undefined, ...extra });
  const ci = name => ({ GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: name, GITHUB_SHA: git(['rev-parse', 'HEAD']) });
  const tag = name => git(['tag', name]);
  const options = extra => ({ environment: {}, ...extra });
  return { root, put, git, commit, info, ci, tag, options };
}

test('canonical publication tag grammar: exact v/core, numeric prerelease and no build metadata', () => {
  for (const tag of ['v0.1.0', 'v0.1.0-preview.2', 'v0.1.0-rc.1', 'v0.1.0-alpha-beta.0']) assert.equal(releaseVersionFromTag(tag, '0.1.0'), tag.slice(1));
  for (const tag of ['0.1.0', 'v00.1.0', 'v0.01.0', 'v0.1.00', 'v0.1.0-', 'v0.1.0-preview.01', 'v0.1.0-1..2', 'v0.1.0+build.1', 'v0.1.0-preview.2+build', ' v0.1.0', 'v0.1.0\n', 'v0.1.0-汉字', 'refs/tags/v0.1.0']) assert.throws(() => releaseVersionFromTag(tag, '0.1.0'), /Noncanonical/, tag);
  assert.throws(() => releaseVersionFromTag('v0.2.0-preview.2', '0.1.0'), /core differs/);
});

test('clean local exact tags identify previews and stable; dev and untagged builds remain unknown', t => {
  const f = fixture(t);
  assert.equal(f.info().releaseVersion, null);
  f.tag('v0.1.0-preview.2');
  assert.equal(f.info().releaseVersion, '0.1.0-preview.2');
  assert.equal(f.info({ development: true }).releaseVersion, null);
  f.git(['tag', '-d', 'v0.1.0-preview.2']);
  f.git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'tag', '-am', 'annotated', 'v0.1.0']);
  assert.equal(f.info().releaseVersion, '0.1.0');
});

test('local numbered builds can omit an old tag; tag CI cannot bypass verification', t => {
  const f = fixture(t);
  f.tag('v0.1.0');
  f.put('src/main.ts', 'new numbered build');
  assert.equal(f.info({ environment: { CYBERNOTE_UNTAGGED_BUILD: '1' } }).releaseVersion, null);
  assert.throws(() => f.info({ environment: { ...f.ci('v0.1.0'), CYBERNOTE_UNTAGGED_BUILD: '1' } }), /clean checkout/);
});

test('library import from node stdin does not execute or realpath the CLI pseudo-entry', t => {
  const f = fixture(t); f.tag('v0.1.0-preview.2');
  const script = `const api=await import(${JSON.stringify(pathToFileURL(join(f.root, 'scripts/build-info.mjs')).href)});console.log(api.resolveReleaseVersion(undefined,{environment:{}}));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-'], { input: script, cwd: f.root, env: environment, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '0.1.0-preview.2');
});

test('CI explicit tag verifies checkout/root/HEAD and disambiguates exact tags; branch/PR artifacts stay unknown', t => {
  const f = fixture(t); f.tag('v0.1.0-preview.2'); f.tag('v0.1.0');
  assert.throws(() => f.info(), /Ambiguous/);
  const ci = f.ci('v0.1.0-preview.2');
  assert.equal(f.info({ environment: ci }).releaseVersion, '0.1.0-preview.2');
  assert.equal(f.info({ environment: { GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' } }).releaseVersion, null);
  assert.equal(f.info({ environment: { GITHUB_ACTIONS: 'true', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: '7/merge' } }).releaseVersion, null);
  assert.throws(() => f.info({ environment: { ...ci, GITHUB_SHA: '0'.repeat(40) } }), /SHA differs/);
  for (const env of [{ GITHUB_ACTIONS: 'true' }, { GITHUB_REF_NAME: 'v0.1.0' }, { GITHUB_REF_TYPE: 'tag' }, { GITHUB_REF_TYPE: 'invalid', GITHUB_REF_NAME: 'v0.1.0' }]) assert.throws(() => f.info({ environment: env }), /ref/);
  f.put('src/main.ts', 'next commit'); f.commit();
  assert.throws(() => f.info({ environment: f.ci('v0.1.0-preview.2') }), /does not point/);
  assert.equal(f.info().releaseVersion, null, 'ancestor tags are never inferred via git describe');
});

test('noncanonical/mismatched local and CI tags fail closed; explicit wrong tag cannot borrow HEAD identity', t => {
  const f = fixture(t);
  for (const tag of ['v0.1.0-preview.01', 'v0.1.0-preview.1+meta', 'v0.2.0', 'v0.1.0-']) {
    f.tag(tag);
    assert.throws(() => f.info(), /Noncanonical|core differs/);
    assert.throws(() => f.info({ environment: f.ci(tag) }), /Noncanonical|core differs/);
    f.git(['tag', '-d', tag]);
  }
  assert.throws(() => f.info({ environment: f.ci('v0.1.0-preview.99') }), /Command failed/);
});

test('dirty tracked/untracked production cannot claim a tag; dirty development stays explicitly unknown', t => {
  const f = fixture(t); f.tag('v0.1.0-preview.2');
  for (const [path, bytes] of [['src/main.ts', 'dirty'], ['src/untracked.ts', 'dirty']]) {
    f.put(path, bytes);
    assert.throws(() => f.info(), /clean checkout/);
    assert.throws(() => f.info({ environment: f.ci('v0.1.0-preview.2') }), /clean checkout/);
    const dev = f.info({ development: true });
    assert.equal(dev.releaseVersion, null); assert.equal(dev.builtAt, null); assert.equal(dev.sourceDirty, true);
    if (path === 'src/main.ts') f.git(['restore', path]); else rmSync(join(f.root, path));
  }
  for (const path of [
    'README.md',
    'untracked.txt',
    'dist/build-info.json',
    'src-tauri/gen/android/app/src/main/jniLibs/libnotes.so',
    'src-tauri/gen/android/buildSrc/.kotlin/sessions/kotlin-compiler-fixture.salive',
  ]) {
    f.put(path, 'build output');
    assert.equal(f.info().releaseVersion, '0.1.0-preview.2', path);
    assert.equal(f.info({ development: true }).sourceDirty, false, path);
    rmSync(join(f.root, path), { force: true });
  }
  assert.equal(f.info().releaseVersion, '0.1.0-preview.2');
});

test('release stamps/timestamps/source metadata cannot assert a publication tag or change the version source', t => {
  const f = fixture(t);
  const stamp = { ...releaseStamp(f.root), releaseVersion: '0.1.0-preview.999' };
  f.put('artifacts/source.json', JSON.stringify(stamp));
  assert.equal(f.info({ stampPath: 'artifacts/source.json' }).releaseVersion, null);
  f.tag('v0.1.0-preview.2');
  assert.equal(f.info({ stampPath: 'artifacts/source.json' }).releaseVersion, '0.1.0-preview.2');
  const metadata = { schema: 1, provenance: 'trusted-checkout', ...sourceIdentity(f.root), releaseVersion: '0.1.0-preview.999' };
  f.put('artifacts/deploy.json', JSON.stringify(metadata));
  rmSync(join(f.root, '.git'), { recursive: true });
  assert.equal(resolveReleaseVersion(f.root, { environment: {} }), null);
  assert.throws(() => resolveReleaseVersion(f.root, { environment: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.0-preview.2' } }), /verified Git checkout/);
  assert.equal(sourceIdentity(f.root, { metadataPath: 'artifacts/deploy.json' }).sourceRevision, metadata.sourceRevision);
});

test('checkout must be its real root, including worktree .git files; ambient Git redirect is ignored', t => {
  const f = fixture(t); f.tag('v0.1.0-preview.2');
  const nested = join(f.root, 'nested'); mkdirSync(nested);
  for (const name of ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml']) {
    mkdirSync(dirname(join(nested, name)), { recursive: true }); copyFileSync(join(f.root, name), join(nested, name));
  }
  symlinkSync(join(f.root, '.git'), join(nested, '.git'), 'dir');
  assert.throws(() => resolveReleaseVersion(nested, { environment: {} }), /checkout root/);
  rmSync(nested, { recursive: true });
  const elsewhere = mkdtempSync(join(tmpdir(), 'release-linked-'));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  f.git(['worktree', 'add', '--detach', elsewhere, 'HEAD']);
  assert.equal(resolveReleaseVersion(elsewhere, { environment: {} }), '0.1.0-preview.2');
  const copied = join(elsewhere, 'borrowed');
  for (const name of ['.git', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml']) {
    mkdirSync(dirname(join(copied, name)), { recursive: true }); copyFileSync(join(elsewhere, name), join(copied, name));
  }
  assert.throws(() => resolveReleaseVersion(copied, { environment: {} }), /registered Git worktree/);
  rmSync(copied, { recursive: true });
  const old = process.env.GIT_DIR;
  try {
    process.env.GIT_DIR = join(nested, 'missing');
    assert.equal(f.info().releaseVersion, '0.1.0-preview.2');
  } finally { if (old === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = old; }
});

test('version synchronization is still mandatory in dev, build and native identity resolution', t => {
  const f = fixture(t); f.tag('v0.1.0-preview.2');
  for (const path of ['src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) {
    const bytes = readFileSync(join(f.root, path), 'utf8'); f.put(path, bytes.replaceAll('0.1.0', '0.2.0'));
    assert.throws(() => f.info(), /Native version differs/);
    assert.throws(() => f.info({ development: true }), /Native version differs/);
    f.put(path, bytes);
  }
});

test('receipt release identity revalidates tag, production metadata, native embedded payload and legacy null', t => {
  const f = fixture(t);
  const old = f.info();
  assert.equal(validateBuildReleaseIdentity(old, f.root, { environment: {} }), null);
  const legacy = { ...old }; delete legacy.releaseVersion;
  assert.equal(validateBuildReleaseIdentity(legacy, f.root, { environment: {} }), null);
  f.tag('v0.1.0-preview.2');
  const info = f.info();
  assert.equal(validateBuildReleaseIdentity(info, f.root, { environment: {} }), '0.1.0-preview.2');
  assert.throws(() => validateBuildReleaseIdentity(legacy, f.root, { environment: {} }), /differs/);
  for (const change of [{ releaseVersion: '0.1.0-preview.1' }, { releaseVersion: null }, { releaseVersion: '0.1.0' }, { mode: 'development' }, { sourceDirty: true }, { version: '0.2.0' }]) assert.throws(() => validateBuildReleaseIdentity({ ...info, ...change }, f.root, { environment: {} }));
  assert.equal(validatePackageInfo(info, f.root), info);
  const bytes = Buffer.from(JSON.stringify(info)); const compressed = brotliCompressSync(bytes);
  const native = Buffer.concat([Buffer.from('fixture native boundary'), compressed]);
  assert.equal(verifyEmbeddedIdentity(native, bytes, [compressed]).encoding, 'brotli');
  const forged = Buffer.from(JSON.stringify({ ...info, releaseVersion: '0.1.0-preview.99' }));
  assert.throws(() => verifyEmbeddedIdentity(native, forged, [compressed]), /does not contain/);
  f.put('dist/build-info.json', JSON.stringify(info));
  const stage = join(projectRoot, 'scripts/publish/stage-packages.py');
  const python = `import importlib.util,json,sys\nfrom pathlib import Path\nsys.dont_write_bytecode=True\nspec=importlib.util.spec_from_file_location('stage',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nr=Path(sys.argv[2]);i=json.loads((r/'dist/build-info.json').read_text());print(json.dumps({'releaseVersion':m.release_identity(r,i)}))`;
  const receipt = JSON.parse(execFileSync('python3', ['-c', python, stage, f.root], { env: environment, encoding: 'utf8', stdio: 'pipe' }));
  assert.equal(receipt.releaseVersion, info.releaseVersion);
  f.put('dist/build-info.json', JSON.stringify({ ...info, releaseVersion: '0.1.0-preview.99' }));
  assert.throws(() => execFileSync('python3', ['-c', python, stage, f.root], { env: environment, stdio: 'pipe' }));
});

test('new build inputs change product fingerprint; generated identity is still excluded', t => {
  const f = fixture(t); const before = sourceIdentity(f.root);
  for (const file of ['scripts/build-info.mjs', 'src/build-info.ts', 'src-tauri/build.rs', 'scripts/publish/stage-packages.py']) {
    const exists = productFiles(f.root).includes(file), bytes = exists ? readFileSync(join(f.root, file)) : null;
    f.put(file, bytes ? Buffer.concat([bytes, Buffer.from('\n')]) : 'export type Fixture = string;');
    assert(productFiles(f.root).includes(file)); assert.notEqual(sourceIdentity(f.root).sourceFingerprint, before.sourceFingerprint, file);
    if (bytes) f.put(file, bytes); else rmSync(join(f.root, file));
  }
  f.put('dist/build-info.json', '{"releaseVersion":"invented"}');
  assert.equal(sourceIdentity(f.root).sourceFingerprint, before.sourceFingerprint);
});

test('actual build.rs bridge exports validated native env and rejects frontend/tag/Cargo drift without Tauri', t => {
  const f = fixture(t); f.tag('v0.1.0-preview.2');
  const native = mkdtempSync(join(tmpdir(), 'release-native-proof-'));
  t.after(() => rmSync(native, { recursive: true, force: true }));
  writeFileSync(join(native, 'stub.rs'), 'pub fn build() {}');
  execFileSync('rustc', ['--edition=2021', '--crate-name', 'tauri_build', '--crate-type', 'rlib', join(native, 'stub.rs'), '-o', join(native, 'libtauri_build.rlib')], { stdio: 'pipe' });
  execFileSync('rustc', ['--edition=2021', join(f.root, 'src-tauri/build.rs'), '--extern', `tauri_build=${join(native, 'libtauri_build.rlib')}`, '-o', join(native, 'build-script')], { stdio: 'pipe' });
  const run = (extra = {}) => spawnSync(join(native, 'build-script'), [], { cwd: native, encoding: 'utf8', env: { ...environment, PROFILE: 'release', CARGO_MANIFEST_DIR: join(f.root, 'src-tauri'), CARGO_PKG_VERSION: '0.1.0', ...extra } });
  f.put('dist/build-info.json', JSON.stringify(f.info()));
  const build = run({ CYBERNOTE_RELEASE_VERSION: '0.1.0-preview.999' });
  assert.equal(build.status, 0, build.stderr);
  assert.match(build.stdout, /cargo:rustc-env=CYBERNOTE_RELEASE_VERSION=0\.1\.0-preview\.2\n/);
  for (const input of ['scripts/build-info.mjs', 'dist/build-info.json', 'refs', 'HEAD', 'packed-refs', 'index']) assert(build.stdout.includes(input), input);
  const current = /^cargo:rustc-env=CYBERNOTE_RELEASE_VERSION=(.*)$/m.exec(build.stdout)[1];
  writeFileSync(join(native, 'consumer.rs'), `fn main() {println!("{}",option_env!("CYBERNOTE_RELEASE_VERSION").filter(|v| !v.is_empty()).unwrap_or(env!("CARGO_PKG_VERSION")));}`);
  execFileSync('rustc', ['--edition=2021', join(native, 'consumer.rs'), '-o', join(native, 'consumer')], { env: { ...environment, CYBERNOTE_RELEASE_VERSION: current, CARGO_PKG_VERSION: '0.1.0' }, stdio: 'pipe' });
  assert.equal(execFileSync(join(native, 'consumer'), { encoding: 'utf8' }).trim(), '0.1.0-preview.2');
  assert.match(run({ PROFILE: 'debug', CYBERNOTE_RELEASE_VERSION: 'forged' }).stdout, /cargo:rustc-env=CYBERNOTE_RELEASE_VERSION=\n/);
  assert.notEqual(run({ CARGO_PKG_VERSION: '0.2.0' }).status, 0);
  for (const change of [{ releaseVersion: '0.1.0-preview.1' }, { sourceFingerprint: '0'.repeat(64) }, { sourceRevision: '0'.repeat(40) }, { mode: 'development' }]) {
    f.put('dist/build-info.json', JSON.stringify({ ...f.info(), ...change }));
    assert.notEqual(run().status, 0, JSON.stringify(change));
  }
  f.put('dist/build-info.json', JSON.stringify(f.info()));
  f.git(['tag', '-d', 'v0.1.0-preview.2']); f.tag('v0.1.0-preview.3');
  assert.notEqual(run().status, 0, 'same product bytes but a new tag must reject stale frontend');
  f.put('dist/build-info.json', JSON.stringify(f.info()));
  assert.equal(run().status, 0);
  assert.match(run({ GITHUB_ACTIONS: 'true', ...f.ci('v0.1.0-preview.3') }).stdout, /CYBERNOTE_RELEASE_VERSION=0\.1\.0-preview\.3/);
  f.git(['tag', '-d', 'v0.1.0-preview.3']);
  f.put('dist/build-info.json', JSON.stringify(f.info()));
  const untagged = run({ CYBERNOTE_RELEASE_VERSION: '0.1.0-preview.999' });
  assert.equal(untagged.status, 0, untagged.stderr);
  assert.match(untagged.stdout, /cargo:rustc-env=CYBERNOTE_RELEASE_VERSION=\n/);
});

test('real isolated Cargo reruns identity validation when tags/frontend change and exports the same compiled release', t => {
  const f = fixture(t);
  const build = mkdtempSync(join(tmpdir(), 'release-cargo-proof-'));
  t.after(() => rmSync(build, { recursive: true, force: true }));
  const stub = join(build, 'tauri-build'); mkdirSync(join(stub, 'src'), { recursive: true });
  writeFileSync(join(stub, 'Cargo.toml'), '[package]\nname="tauri-build"\nversion="0.0.0"\nedition="2021"\n');
  writeFileSync(join(stub, 'src/lib.rs'), 'pub fn build() {}');
  f.put('src-tauri/Cargo.toml', `[package]\nname = "notes-clone"\nversion = "0.1.0"\nedition="2021"\n[build-dependencies]\ntauri-build={path=${JSON.stringify(stub)}}\n`);
  f.put('src-tauri/src/main.rs', 'fn main(){println!("{}",option_env!("CYBERNOTE_RELEASE_VERSION").filter(|v| !v.is_empty()).unwrap_or(env!("CARGO_PKG_VERSION")));}');
  const env = { ...environment, CARGO_TARGET_DIR: join(build, 'target') };
  const cargo = (profile = 'release') => spawnSync('cargo', ['build', '--offline', '--locked', '--manifest-path', join(f.root, 'src-tauri/Cargo.toml'), ...(profile === 'release' ? ['--release'] : [])], { env, encoding: 'utf8' });
  execFileSync('cargo', ['generate-lockfile', '--offline', '--manifest-path', join(f.root, 'src-tauri/Cargo.toml')], { env, stdio: 'pipe' });
  f.commit(); f.tag('v0.1.0-preview.2');
  f.put('dist/build-info.json', JSON.stringify(f.info()));
  const first = cargo(); assert.equal(first.status, 0, first.stderr);
  const program = join(build, 'target/release/notes-clone');
  assert.equal(execFileSync(program, { encoding: 'utf8' }).trim(), '0.1.0-preview.2');
  f.git(['tag', '-d', 'v0.1.0-preview.2']); f.tag('v0.1.0-preview.3');
  const stale = cargo(); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /releaseVersion differs/);
  f.put('dist/build-info.json', JSON.stringify(f.info()));
  const next = cargo(); assert.equal(next.status, 0, next.stderr);
  assert.equal(execFileSync(program, { encoding: 'utf8' }).trim(), '0.1.0-preview.3');
  f.put('src/main.ts', 'dirty tracked source');
  const dirty = cargo(); assert.notEqual(dirty.status, 0); assert.match(dirty.stderr, /clean checkout/);
  const dev = cargo('debug'); assert.equal(dev.status, 0, dev.stderr);
  assert.equal(execFileSync(join(build, 'target/debug/notes-clone'), { encoding: 'utf8' }).trim(), '0.1.0');
});
