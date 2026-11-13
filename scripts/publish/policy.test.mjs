import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digest, safePath, readInventory } from './policy.mjs';
import { refreshManifest } from './manifest.mjs';

const control = 'scripts/publish/manifest.json';
const rights = 'scripts/publish/LICENSE.project-reserved.txt';
const root = 'vendor/cybergrid-sdk', provider = root + '/provider-assets';
const binary = provider + '/android-arm64/jniLibs/arm64-v8a/libcloudflared.so';
const sourcePath = provider + '/manifest.json';
const license = provider + '/LICENSE';
const origin = 'https://fixture.example/provider';
const pin = '1'.repeat(40);
function candidate() {
  const files = new Map();
  const manifest = { schema: 1, policy: 'Exact reviewed files only', files: {}, thirdParty: [], firstParty: [], runtimeAssets: [] };
  const add = (path, bytes) => {
    const b = Buffer.from(bytes); files.set(path, b); manifest.files[path] = digest(b);
  };
  add(rights, 'No general project license grant. Project rights reserved.');
  add(control, '{}'); manifest.files[control] = 'SELF';
  const read = path => { assert(files.has(path)); return files.get(path); };
  return { manifest, files, add, read };
}
function runtimeCandidate() {
  const c = candidate();
  const bytes = Buffer.from([127, 69, 76, 70, 0, 1, 2, 3]);
  c.add(binary, bytes); c.add(license, 'Fixture provider license');
  const meta = { schema: 1, repository: origin, commit: pin, version: '1.2.3', runtimeDownload: false,
    platforms: { 'android-arm64': { binary: 'android-arm64/jniLibs/arm64-v8a/libcloudflared.so', bytes: bytes.length, sha256: digest(bytes) } } };
  c.add(sourcePath, JSON.stringify(meta));
  c.manifest.thirdParty.push({ root, origin, revision: pin, licenses: [license] });
  c.manifest.runtimeAssets.push({ path: binary, sha256: digest(bytes), size: bytes.length,
    source: { url: origin, revision: pin, version: '1.2.3' }, licenses: [license],
    provenance: { manifest: sourcePath, platform: 'android-arm64' } });
  return { ...c, meta };
}

test('project-authored crates require exact first-party roots and reserved project rights, never vendor reclassification', () => {
  const c = candidate(); c.add('crates/account-auth/src/lib.rs', '// project code');
  const declaration = { root: 'crates/account-auth', provenance: 'project-authored', rights: 'reserved', rightsSource: rights };
  assert.throws(() => readInventory(c.manifest, c.read), /explicit ownership/);
  c.manifest.firstParty.push(declaration);
  assert.doesNotThrow(() => readInventory(c.manifest, c.read));
  for (const mutate of [
    m => { m.firstParty[0].root = 'vendor/fixture-sdk'; },
    m => { m.firstParty[0].rightsSource = 'LICENSE'; },
    m => { m.firstParty[0].origin = origin; },
    m => { m.firstParty.push({ ...m.firstParty[0] }); },
    m => { m.thirdParty.push({ root: declaration.root, origin, revision: pin, licenses: [rights] }); },
  ]) {
    const m = structuredClone(c.manifest); mutate(m);
    assert.throws(() => readInventory(m, c.read));
  }
  const vendor = candidate(); vendor.add('vendor/fixture-sdk/src/lib.rs', '// foreign code');
  vendor.manifest.firstParty.push({ ...declaration, root });
  assert.throws(() => readInventory(vendor.manifest, vendor.read), /First-party/);
});

test('only the reviewed auth plugin accepts reserved first-party ownership, with no sibling or vendor expansion', () => {
  const c = candidate(), plugin = 'plugins/tauri-plugin-notes-auth';
  c.add(plugin + '/src/lib.rs', '// project host-only plugin');
  const declaration = { root: plugin, provenance: 'project-authored', rights: 'reserved', rightsSource: rights };
  assert.throws(() => readInventory(c.manifest, c.read), /explicit ownership/);
  c.manifest.firstParty.push(declaration);
  assert.doesNotThrow(() => readInventory(c.manifest, c.read));
  for (const root of ['plugins', plugin + '/src', plugin + '-other', 'plugins/other', 'vendor/tauri-plugin-notes-auth']) {
    const bad = candidate(); bad.add(root + '/lib.rs', '// fixture');
    bad.manifest.firstParty.push({ ...declaration, root });
    assert.throws(() => readInventory(bad.manifest, bad.read), /First-party/);
  }
  for (const patch of [{ provenance: 'external' }, { rights: 'MIT' }, { rightsSource: 'LICENSE' }]) {
    const manifest = structuredClone(c.manifest); Object.assign(manifest.firstParty[0], patch);
    assert.throws(() => readInventory(manifest, c.read), /First-party/);
  }
  const duplicate = structuredClone(c.manifest); duplicate.firstParty.push(declaration);
  assert.throws(() => readInventory(duplicate, c.read), /Overlapping/);
});

test('runtime exception binds actual bytes, path, source metadata and retained licenses, with no wildcard JNI exemption', () => {
  const good = runtimeCandidate();
  assert.doesNotThrow(() => readInventory(good.manifest, good.read));
  assert.throws(() => safePath(binary), /Excluded/);
  assert.doesNotThrow(() => safePath(binary, true));
  assert.throws(() => safePath(binary.replace('cybergrid-sdk', 'other-sdk'), true), /Excluded/);
  assert.throws(() => safePath('src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a/libcloudflared.so', true), /Excluded/);
  for (const mutate of [
    c => { c.manifest.runtimeAssets = []; },
    c => { c.manifest.runtimeAssets[0].size++; },
    c => { c.add(binary, Buffer.from([127, 69, 76, 70, 0, 9, 9, 9])); },
    c => { c.manifest.runtimeAssets[0].source.url = origin.replace('https:', 'http:'); },
    c => { c.manifest.runtimeAssets[0].source.url = ['https:', '', 'u:p@fixture.example/provider'].join('/'); },
    c => { c.manifest.runtimeAssets[0].source.revision = '2'.repeat(40); },
    c => { c.manifest.runtimeAssets[0].licenses = ['vendor/fixture-sdk/missing/LICENSE']; },
    c => { c.manifest.runtimeAssets.push(structuredClone(c.manifest.runtimeAssets[0])); },
    c => { c.meta.platforms['android-arm64'].binary = 'other/libcloudflared.so'; c.add(sourcePath, JSON.stringify(c.meta)); },
    c => { c.add(provider + '/adjacent.so', Buffer.from([1, 0, 2])); },
    c => { c.add(binary, Buffer.alloc(50 * 1024 * 1024 + 1)); },
  ]) {
    const c = runtimeCandidate(); mutate(c);
    assert.throws(() => readInventory(c.manifest, c.read));
  }
});

test('reviewed extension admits ownership and runtime declarations atomically; refresh cannot repin changed binary bytes', () => {
  const all = runtimeCandidate();
  all.add('crates/account-auth/src/lib.rs', '// owned auth');
  const base = candidate();
  const extension = { files: {}, thirdParty: all.manifest.thirdParty, runtimeAssets: all.manifest.runtimeAssets,
    firstParty: [{ root: 'crates/account-auth', provenance: 'project-authored', rights: 'reserved', rightsSource: rights }] };
  for (const [path, hash] of Object.entries(all.manifest.files)) if (!(path in base.manifest.files)) extension.files[path] = hash;
  const tree = { read: path => path === control ? Buffer.from(JSON.stringify(base.manifest)) : all.read(path) };
  const result = refreshManifest(tree, extension);
  assert.equal(result.manifest.firstParty[0].root, 'crates/account-auth');
  assert.equal(result.manifest.runtimeAssets[0].path, binary);
  assert.equal(result.changes.length, Object.keys(extension.files).length);
  assert.throws(() => refreshManifest(tree, { ...extension, permitVendorBinaries: true }), /Unknown/);
  const bad = structuredClone(extension); bad.files[binary] = '0'.repeat(64);
  assert.throws(() => refreshManifest(tree, bad), /Unverified/);
  const current = { read: path => path === control ? Buffer.from(JSON.stringify(result.manifest)) : all.read(path) };
  all.add(binary, Buffer.from([127, 69, 76, 70, 0, 4, 5, 6]));
  assert.throws(() => refreshManifest(current), /runtime asset/i);
});
