import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { trackedTree, digest, safePath, scanBytes, manifestName } from './export.mjs';

// Refresh only the existing exact inventory. A reviewed extension is an explicit
// JSON {files:{path:sha256}, thirdParty:[{root,origin,revision,licenses:[path]}]}.
// Every added hash must already match the requested committed Git snapshot.
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
const manifest = JSON.parse(tree.read(manifestName));
const changes = [];
if (extension) {
  const add = JSON.parse(readFileSync(extension));
  for (const [name, expected] of Object.entries(add.files ?? {})) {
    safePath(name); const bytes = tree.read(name); scanBytes(name, bytes);
    if (!/^[a-f0-9]{64}$/.test(expected) || digest(bytes) !== expected || name === manifestName) throw Error(`Unverified extension input: ${name}`);
    if (manifest.files[name]) throw Error(`Extension must add a new path: ${name}`);
    manifest.files[name] = expected; changes.push({ path: name, added: true });
  }
  manifest.thirdParty.push(...(add.thirdParty ?? []));
}
for (const name of Object.keys(manifest.files)) {
  safePath(name); const bytes = tree.read(name); scanBytes(name, bytes);
  const actual = name === manifestName ? 'SELF' : digest(bytes);
  if (manifest.files[name] !== actual) changes.push({ path: name, changed: true });
  manifest.files[name] = actual;
}
manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b, 'en')));
if (write) writeFileSync(resolve(root, manifestName), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ dryRun: !write, sourceCommit: tree.commit, changes }, null, 2));
