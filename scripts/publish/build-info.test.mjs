import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceIdentity } from '../build-info.mjs';

test('archive build requires explicit matching trusted metadata; changed bytes cannot reuse it', t => {
  const root = mkdtempSync(join(tmpdir(), 'publish-identity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/main.ts'), 'export const v = 1;');
  execFileSync('git', ['init', '-q'], { cwd: root }); execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const actual = sourceIdentity(root, { metadataPath: null });
  const file = join(root, 'deploy.json');
  writeFileSync(file, JSON.stringify({ schema: 1, provenance: 'trusted-checkout', ...actual }));
  rmSync(join(root, '.git'), { recursive: true });
  assert.throws(() => sourceIdentity(root, { metadataPath: null }), /No .git/);
  assert.deepEqual(sourceIdentity(root, { metadataPath: file }), actual);
  writeFileSync(join(root, 'src/main.ts'), 'export const v = 2;');
  assert.throws(() => sourceIdentity(root, { metadataPath: file }), /actual product bytes/);
  writeFileSync(join(root, 'src/main.ts'), 'export const v = 1;');
  writeFileSync(file, JSON.stringify({ schema: 1, provenance: 'unverified', ...actual }));
  assert.throws(() => sourceIdentity(root, { metadataPath: file }), /actual product bytes/);
});

test('pnpm patch and SDK crate bytes participate in product identity', t => {
  const root = mkdtempSync(join(tmpdir(), 'publish-inputs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'patches')); mkdirSync(join(root, 'crates'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'patchedDependencies: {}');
  writeFileSync(join(root, 'patches/view.patch'), 'first');
  writeFileSync(join(root, 'crates/Cargo.toml'), '[package]\nname="fixture"');
  execFileSync('git', ['init', '-q'], { cwd: root }); execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const a = sourceIdentity(root, { metadataPath: null });
  writeFileSync(join(root, 'patches/view.patch'), 'second');
  const b = sourceIdentity(root, { metadataPath: null }); assert.notEqual(a.sourceFingerprint, b.sourceFingerprint);
  writeFileSync(join(root, 'crates/Cargo.toml'), '[package]\nname="changed"');
  assert.notEqual(sourceIdentity(root, { metadataPath: null }).sourceFingerprint, b.sourceFingerprint);
});

test('only the reserved Android Kotlin cache is excluded while handwritten platform source remains an input', t => {
  const root = mkdtempSync(join(tmpdir(), 'publish-kotlin-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const android = join(root, 'src-tauri/gen/android');
  const main = join(android, 'app/src/main/java/com/local/notesclone');
  mkdirSync(main, { recursive: true });
  writeFileSync(join(main, 'MainActivity.kt'), 'class MainActivity');
  writeFileSync(join(root, '.gitignore'), 'src-tauri/gen/android/.kotlin/\n');
  execFileSync('git', ['init', '-q'], { cwd: root }); execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Source Test', '-c', 'user.email=source@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const before = sourceIdentity(root, { metadataPath: null });
  const cache = join(android, '.kotlin/sessions');
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, 'compiler.salive'), 'generated process cache');
  assert.deepEqual(sourceIdentity(root, { metadataPath: null }), before);
  writeFileSync(join(main, 'MainActivity.kt'), 'class ChangedActivity');
  const changed = sourceIdentity(root, { metadataPath: null });
  assert.notEqual(changed.sourceFingerprint, before.sourceFingerprint);
  assert.equal(changed.sourceDirty, true);
  const handwritten = join(root, 'src-tauri/handwritten/.kotlin');
  mkdirSync(handwritten, { recursive: true });
  writeFileSync(join(handwritten, 'policy.kt'), 'handwritten source');
  assert.notEqual(sourceIdentity(root, { metadataPath: null }).sourceFingerprint, changed.sourceFingerprint);
});
