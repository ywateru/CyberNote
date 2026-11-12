import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { trackedTree, manifestName } from './export.mjs';
import { digest, safePath, readInventory } from './policy.mjs';

// Every addition is explicit and must match the requested committed blob. Runtime
// pins are never auto-refreshed when a binary changes; they require fresh review.
export function refreshManifest(tree, extension) {
  const manifest = JSON.parse(tree.read(manifestName)), changes = [];
  const before = { ...manifest.files };
  if (extension) {
    if (typeof extension !== 'object' || Array.isArray(extension) || Object.keys(extension).some(k => !['files', 'thirdParty', 'firstParty', 'runtimeAssets'].includes(k))) throw Error('Unknown manifest extension field');
    for (const key of ['thirdParty', 'firstParty', 'runtimeAssets']) {
      if (extension[key] !== undefined && !Array.isArray(extension[key])) throw Error('Invalid manifest extension list');
      manifest[key] = [...(manifest[key] ?? []), ...(extension[key] ?? [])];
    }
    if (extension.files !== undefined && (!extension.files || typeof extension.files !== 'object' || Array.isArray(extension.files))) throw Error('Invalid extension file inventory');
    const assets = new Set((manifest.runtimeAssets ?? []).map(a => a?.path));
    for (const [path, expected] of Object.entries(extension.files ?? {})) {
      safePath(path, assets.has(path));
      if (path === manifestName || Object.hasOwn(manifest.files, path) || !/^[a-f0-9]{64}$/.test(expected) || digest(tree.read(path)) !== expected) throw Error(`Unverified extension input: ${path}`);
      manifest.files[path] = expected;
    }
  }
  readInventory(manifest, tree.read, { refresh: true });
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (!Object.hasOwn(before, path)) changes.push({ path, added: true });
    else if (before[path] !== hash) changes.push({ path, changed: true });
  }
  manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b, 'en')));
  return { manifest, changes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  let ref = 'HEAD', extension, write = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--write') write = true;
    else if (args[i] === '--ref' && args[i + 1]) ref = args[++i];
    else if (args[i] === '--extension' && args[i + 1]) extension = args[++i];
    else throw Error('Usage: manifest.mjs [--ref COMMIT] [--extension REVIEWED_JSON] [--write]');
  }
  const tree = trackedTree(root, ref);
  const result = refreshManifest(tree, extension ? JSON.parse(readFileSync(extension)) : undefined);
  if (write) writeFileSync(resolve(root, manifestName), JSON.stringify(result.manifest, null, 2) + '\n');
  console.log(JSON.stringify({ dryRun: !write, sourceCommit: tree.commit, changes: result.changes }, null, 2));
}
