// Finalize only the migration's committed native inputs after merging its agents.
// Never import sibling worktrees, uncommitted bytes or refresh unrelated entries.
import {writeFileSync, realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {trackedTree, manifestName} from './export.mjs';
import {digest, safePath, readInventory} from './policy.mjs';
export const cyberbusRevision = '359465e83bd74b571a963f3d1fdc238f50169919';
const adapter = 'crates/notes-cyberbus';
const fixed = new Set(['src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/src/lib.rs']);
export function finalizeCyberbusManifest(tree) {
  const manifest = JSON.parse(tree.read(manifestName));
  const changes = [];
  const paths = [...tree.entries.keys()].filter(path => fixed.has(path) || path.startsWith('src-tauri/src/account/') || path.startsWith(adapter + '/')).sort();
  if (!paths.includes(adapter + '/Cargo.toml') || !paths.includes('src-tauri/Cargo.lock')) throw Error('Merge committed core/account migration inputs first');
  const cargo = tree.read(adapter + '/Cargo.toml').toString();
  const pins = [...cargo.matchAll(/(?:cyberbus|cyberbus-auth)\s*=\s*\{([^}\n]+)\}/g)];
  if (pins.length < 2 || pins.some(m => !m[1].includes('git = "https://github.com/osd-pub/CyberBus.git"') || !m[1].includes(`rev = "${cyberbusRevision}"`))) throw Error('SDK dependencies must use the reviewed exact git revision');
  const native = tree.read('src-tauri/Cargo.toml').toString();
  if (!/notes-cyberbus\s*=/.test(native) || /cybergrid|crates\/account-auth/.test(native)) throw Error('Production account must depend on notes-cyberbus without legacy owners');
  const lock = tree.read('src-tauri/Cargo.lock').toString();
  if (!lock.includes(cyberbusRevision) || /name = "cybergrid-sdk"/.test(lock)) throw Error('Regenerate integrated Cargo lock for the fixed SDK revision');
  for (const path of paths) {
    safePath(path);
    // Target output and keys must not become allowlisted by being tracked.
    if (!(fixed.has(path) || /\.(rs|toml|lock|md)$/.test(path) || path === adapter + '/.gitignore')) throw Error(`Review new migration input: ${path}`);
    const hash = digest(tree.read(path));
    if (manifest.files[path] !== hash) { manifest.files[path] = hash; changes.push(path); }
  }
  // Deleted account modules must not leave dangling source pins.
  for (const path of Object.keys(manifest.files)) if (path.startsWith('src-tauri/src/account/') && !tree.entries.has(path)) {
    delete manifest.files[path]; changes.push(path);
  }
  if (!manifest.firstParty.some(item => item.root === adapter)) manifest.firstParty.push({root:adapter,provenance:'project-authored',rights:'reserved',rightsSource:'scripts/publish/LICENSE.project-reserved.txt'});
  readInventory(manifest, tree.read);
  return {manifest,changes};
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--write')) throw Error('Usage: cyberbus-manifest.mjs [--write] (committed HEAD only)');
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  // HEAD must already contain the reviewed platform manifest, before core/account integration.
  const result = finalizeCyberbusManifest(trackedTree(root, 'HEAD'));
  if (args.includes('--write')) writeFileSync(resolve(root, manifestName), JSON.stringify(result.manifest,null,2)+'\n');
  console.log(JSON.stringify({dryRun:!args.includes('--write'),changes:result.changes},null,2));
}
