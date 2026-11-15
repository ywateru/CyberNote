import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createBuildInfo, releaseStamp, validateStamp } from '../build-info.mjs';
import { validatePackageInfo, verifyEmbeddedIdentity } from './package-identity.mjs';

function checkout(t) {
  const root = mkdtempSync(join(tmpdir(), 'package-identity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src-tauri')); mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.1.0' }));
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '0.1.0' }));
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), '[package]\nname="notes-clone"\nversion="0.1.0"\n');
  writeFileSync(join(root, 'src/main.ts'), 'export const synthetic = true;');
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'source']);
  return { root, git };
}
test('packaging revalidates actual source identity and rejects an old clean stamp after non-product dirt', t => {
  const { root } = checkout(t);
  const info = createBuildInfo({ root }), stamp = releaseStamp(root);
  assert.equal(validatePackageInfo(info, root), info);
  assert.throws(() => validatePackageInfo({ ...info, sourceFingerprint: '0'.repeat(64) }, root), /differs/);
  writeFileSync(join(root, 'untracked-fixture.txt'), 'synthetic non-product dirt');
  assert.throws(() => validateStamp(stamp, root), /stale/);
  assert.throws(() => validatePackageInfo(info, root), /clean source/);
});
test('packaging verifies build identity in actual native bytes, not a new sidecar next to an old executable', () => {
  const current = Buffer.from(JSON.stringify({ schema: 1, sourceRevision: '1'.repeat(40), sourceFingerprint: '2'.repeat(64) }));
  const old = Buffer.from(JSON.stringify({ schema: 1, sourceRevision: '3'.repeat(40), sourceFingerprint: '4'.repeat(64) }));
  const compressed = brotliCompressSync(current), oldCompressed = brotliCompressSync(old);
  assert.equal(verifyEmbeddedIdentity(Buffer.concat([Buffer.from('native'), current]), current).encoding, 'raw');
  assert.equal(verifyEmbeddedIdentity(Buffer.concat([Buffer.from('native'), compressed]), current, [compressed]).encoding, 'brotli');
  assert.throws(() => verifyEmbeddedIdentity(Buffer.concat([Buffer.from('old native'), old]), current, [compressed]), /does not contain/);
  assert.throws(() => verifyEmbeddedIdentity(Buffer.concat([Buffer.from('old native'), oldCompressed]), current, [compressed, oldCompressed]), /does not contain/);
});


test('packaged-identity CLI finds real Cargo asset files and refuses an older native payload', t => {
  const { root, git } = checkout(t);
  mkdirSync(join(root, 'scripts/publish'), { recursive: true });
  for (const file of ['package-identity.mjs', 'policy.mjs']) copyFileSync(fileURLToPath(new URL('./' + file, import.meta.url)), join(root, 'scripts/publish', file));
  copyFileSync(fileURLToPath(new URL('../build-info.mjs', import.meta.url)), join(root, 'scripts/build-info.mjs'));
  writeFileSync(join(root, '.gitignore'), 'dist/\n');
  git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'build helpers']);
  const expected = Buffer.from(JSON.stringify(createBuildInfo({ root }), null, 2) + '\n');
  mkdirSync(join(root, 'dist')); writeFileSync(join(root, 'dist/build-info.json'), expected);
  const artifacts = mkdtempSync(join(tmpdir(), 'packaged-native-fixture-'));
  t.after(() => rmSync(artifacts, { recursive: true, force: true }));
  const generated = join(artifacts, 'build/notes-clone-fixture/out/tauri-codegen-assets');
  mkdirSync(generated, { recursive: true });
  const encoded = brotliCompressSync(expected);
  writeFileSync(join(generated, '1'.repeat(64) + '.json'), encoded);
  const native = join(artifacts, 'native-fixture');
  writeFileSync(native, Buffer.concat([Buffer.from('synthetic native fixture'), encoded]));
  const args = [join(root, 'scripts/publish/package-identity.mjs'), native, join(artifacts, 'build')];
  const proof = JSON.parse(execFileSync(process.execPath, args, { stdio: 'pipe' }));
  assert.equal(proof.embeddedIdentity.encoding, 'brotli');
  assert.equal(proof.info.sourceFingerprint, JSON.parse(expected).sourceFingerprint);
  writeFileSync(native, 'synthetic older native fixture');
  assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe' }));
});
