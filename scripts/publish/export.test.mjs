import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { exportSnapshot, digest, manifestName, safePath, scanBytes } from './export.mjs';
import { publicScripts } from './package-transform.mjs';

function fixture(t) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'publish-boundary-'))), root = join(parent, 'source');
  mkdirSync(root); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const files = {
    'package.json': JSON.stringify({ private: true, packageManager: 'pnpm@10.15.0', engines: { node: '22.x' }, scripts: { ...publicScripts, 'old:device': 'node scripts/private-device.mjs' } }),
    'scripts/android.mjs': '', 'scripts/versions.mjs': '', 'scripts/publish/check.test.mjs': '',
    'scripts/publish/README.public.md': '# Safe source\n', 'scripts/publish/gitignore.public': '.env\nignored/\n',
    'scripts/publish/LICENSE.project-reserved.txt': 'Project rights reserved.', 'scripts/publish/THIRD_PARTY_NOTICES.md': 'Third-party rights retained.',
    'src-tauri/fonts/OFL.txt': 'Fixture license', 'src-tauri/fonts/NotoSansCJKsc-Regular.otf': 'Fixture font',
    'services/coordinator/LICENSE': 'Fixture license', 'pnpm-workspace.yaml': '', 'patches/prosemirror-view@1.42.9.patch': '',
  };
  const manifest = { schema: 1, files: Object.fromEntries(Object.entries(files).map(([n, text]) => [n, digest(Buffer.from(text))])), thirdParty: [] };
  manifest.files[manifestName] = 'SELF'; files[manifestName] = JSON.stringify(manifest);
  files['docs/private.md'] = 'PRIVATE DOCUMENT MUST NOT BE EXPORTED';
  files['README.md'] = 'PRIVATE DELIVERY README MUST NOT BE READ';
  files['.gitignore'] = '.env\nignored/\n';
  for (const [name, data] of Object.entries(files)) { mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), data); }
  const git = args => execFileSync('git', args, { cwd: root });
  git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'private history']);
  writeFileSync(join(root, '.env'), 'must-never-be-read');
  // A dirty tracked file is also not an export source.
  writeFileSync(join(root, 'services/coordinator/LICENSE'), 'DIRTY LOCAL FILE');
  return { root, parent, git };
}
test('default dry-run reads only pinned tracked blobs; apply requires exact absent destination and creates new history', t => {
  const { root, parent } = fixture(t), target = join(parent, 'clean');
  const dry = exportSnapshot({ root, target }); assert(dry.dryRun); assert(!existsSync(target));
  assert.throws(() => exportSnapshot({ root, target, apply: true }), /identical/);
  const result = exportSnapshot({ root, target, expectedTarget: target, apply: true, initialize: true });
  assert(result.initializedNewHistory); assert(!existsSync(join(target, '.env'))); assert(!existsSync(join(target, 'docs')));
  assert.equal(readFileSync(join(target, 'README.md'), 'utf8'), '# Safe source\n');
  assert.equal(readFileSync(join(target, 'services/coordinator/LICENSE'), 'utf8'), 'Fixture license');
  assert(!JSON.parse(readFileSync(join(target, 'package.json'))).scripts['old:device']);
  assert.equal(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: target }).toString().trim(), '1');
  assert.equal(execFileSync('git', ['remote'], { cwd: target }).length, 0);
  assert.throws(() => exportSnapshot({ root, target, expectedTarget: target, apply: true }), /must not exist/);
  assert.doesNotThrow(() => exportSnapshot({ root: target }));
});
test('hash tampering, process paths, credentials and symlink tree entries fail closed', t => {
  const { root, git } = fixture(t);
  const path = join(root, manifestName), manifest = JSON.parse(readFileSync(path));
  manifest.files['services/coordinator/LICENSE'] = '0'.repeat(64); writeFileSync(path, JSON.stringify(manifest));
  git(['add', manifestName]); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'tampered inventory']);
  assert.throws(() => exportSnapshot({ root }), /hash mismatch/);
  for (const name of ['docs/private.md', 'vendor/sdk/target/release/tool', 'src/.env', '../outside', 'src/link.pem']) assert.throws(() => safePath(name));
  assert.throws(() => scanBytes('src/config.ts', Buffer.from(['ghp', 'a'.repeat(36)].join('_'))), /Credential pattern/);
  const syntheticURL = ['https:', '', 'u:p@fixture.invalid'].join('/');
  assert.doesNotThrow(() => scanBytes('service/test/url.test.ts', Buffer.from(syntheticURL)));
  assert.throws(() => scanBytes('src/config.ts', Buffer.from(syntheticURL)), /Credential URL/);
  assert.throws(() => scanBytes('service/test/url.test.ts', Buffer.from(syntheticURL.replace('fixture.invalid', 'real.example.com'))), /Credential URL/);
  assert.throws(() => scanBytes('vendor/tool', Buffer.from([1, 0, 2])), /Unreviewed binary/);
  manifest.files['services/coordinator/LICENSE'] = digest(Buffer.from('Fixture license'));
  manifest.files['src/link.ts'] = digest(Buffer.from('../.env'));
  mkdirSync(join(root, 'src')); symlinkSync('../.env', join(root, 'src/link.ts'));
  writeFileSync(path, JSON.stringify(manifest)); git(['add', manifestName, 'src/link.ts']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'symlink inventory']);
  assert.throws(() => exportSnapshot({ root }), /Not a regular tracked file/);
});
