// Finalize only the migration's committed native inputs after merging its agents.
// Never import sibling worktrees, uncommitted bytes or refresh unrelated entries.
import {writeFileSync, realpathSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {trackedTree, manifestName} from './export.mjs';
import {digest, safePath, readInventory} from './policy.mjs';
export const cyberbusRevision = '359465e83bd74b571a963f3d1fdc238f50169919';
const origin = 'https://github.com/osd-pub/CyberBus.git';
const adapter = 'crates/notes-cyberbus', vendor = 'vendor/cyberbus';
// Reviewed exact bytes of the narrow descriptor-registration patch, including provenance
// and both upstream licenses. Updating this file requires reviewing the SDK patch again.
const runtimeSource = JSON.parse(readFileSync(new URL('./notices/cyberbus/runtime-source.json',import.meta.url)));
const fixed = new Set(['src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/src/lib.rs']);
const gitSource = `git+${origin}?rev=${cyberbusRevision}#${cyberbusRevision}`;
function sdkDependencies(cargo, localRuntime = false, vendoredRuntime = false) {
  const dependencies = [...cargo.matchAll(/^\s*(cyberbus(?:-auth|-protocol|-transport)?)\s*=\s*\{([^}\n]+)\}\s*(?:#.*)?$/gm)];
  for (const required of localRuntime ? ['cyberbus','cyberbus-auth'] : ['cyberbus-auth','cyberbus-protocol','cyberbus-transport']) {
    if (!dependencies.some(m=>m[1]===required)) throw Error(`Missing reviewed SDK dependency: ${required}`);
  }
  for (const [,name,body] of dependencies) {
    if (localRuntime && name==='cyberbus') {
      if (!/^\s*path\s*=\s*"\.\.\/\.\.\/vendor\/cyberbus\/crates\/cyberbus"\s*,?\s*$/.test(body)) throw Error('SDK runtime must use the reviewed in-tree vendor path');
    } else if (localRuntime && name==='cyberbus-protocol') {
      if (!/^\s*path\s*=\s*"\.\.\/\.\.\/vendor\/cyberbus\/crates\/cyberbus-protocol"\s*,?\s*$/.test(body)) throw Error('SDK protocol fixture must use the reviewed in-tree vendor path');
    } else if (vendoredRuntime && name==='cyberbus-protocol') {
      if (!/^\s*path\s*=\s*"\.\.\/cyberbus-protocol"\s*,?\s*$/.test(body)) throw Error('Vendored SDK protocol must use the reviewed sibling path');
    } else if (vendoredRuntime && name==='cyberbus-transport') {
      if (!/^\s*path\s*=\s*"\.\.\/cyberbus-transport"\s*,?\s*features\s*=\s*\["websocket"\]\s*$/.test(body)) throw Error('Vendored SDK transport must use the reviewed sibling path');
    } else if (!new RegExp(`\\bgit\\s*=\\s*"${origin.replaceAll('.','\\.')}"`).test(body) ||
               !new RegExp(`\\brev\\s*=\\s*"${cyberbusRevision}"`).test(body) || /\b(?:path|branch|tag|package)\s*=/.test(body)) {
      throw Error('SDK dependencies must use the reviewed exact git revision');
    }
  }
}
function sdkLock(lock) {
  const packages = lock.split(/^\[\[package\]\]\s*$/m).slice(1);
  for (const name of ['cyberbus','cyberbus-auth','cyberbus-protocol','cyberbus-transport']) {
    const matches = packages.filter(p=>new RegExp(`^name = "${name}"$`,'m').test(p));
    if (matches.length!==1) throw Error(`Integrated lock must contain one ${name}`);
    const source = matches[0].match(/^source = "([^"]+)"$/m)?.[1];
    const expectedSource = name==='cyberbus-auth' ? gitSource : undefined;
    if (source!==expectedSource) throw Error(`Integrated lock has wrong SDK source: ${name}`);
  }
  // Also bind EasyTier/other packages originating from this SDK repository.
  if (packages.some(p=>{const source=p.match(/^source = "([^"]+)"$/m)?.[1];return source?.includes('github.com/osd-pub/CyberBus') && source!==gitSource;})) throw Error('Integrated lock contains an unreviewed SDK git source');
  if (/^name = "cybergrid-sdk"$/m.test(lock)) throw Error('Remove legacy CyberGrid production lock dependency');
}
function reviewedVendor(tree) {
  if (runtimeSource.source!==origin || runtimeSource.revision!==cyberbusRevision) throw Error('Review runtime source provenance');
  const expected=Object.keys(runtimeSource.files).sort();
  const actual=[...tree.entries.keys()].filter(p=>p.startsWith(vendor+'/')).sort();
  if (JSON.stringify(expected)!==JSON.stringify(actual)) throw Error('Review added or missing SDK vendor inputs');
  for (const path of expected) if (digest(tree.read(path))!==runtimeSource.files[path]) throw Error(`Review changed SDK vendor input: ${path}`);
  sdkDependencies(tree.read(vendor+'/crates/cyberbus/Cargo.toml').toString(), false, true);
  return expected;
}
export function finalizeCyberbusManifest(tree) {
  const manifest = JSON.parse(tree.read(manifestName));
  const changes = [];
  const paths = [...tree.entries.keys()].filter(path => fixed.has(path) || path.startsWith('src-tauri/src/account/') || path.startsWith(adapter + '/')).sort();
  if (!paths.includes(adapter + '/Cargo.toml') || !paths.includes('src-tauri/Cargo.lock')) throw Error('Merge committed core/account migration inputs first');
  sdkDependencies(tree.read(adapter + '/Cargo.toml').toString(),true);
  const vendorPaths=reviewedVendor(tree);
  const native = tree.read('src-tauri/Cargo.toml').toString();
  if (!/^notes-cyberbus\s*=\s*\{\s*path\s*=\s*"\.\.\/crates\/notes-cyberbus"\s*,?\s*\}/m.test(native) || /\b(?:cybergrid(?:-sdk)?|account-auth)\s*=/.test(native)) throw Error('Production account must depend on in-tree notes-cyberbus without legacy CyberGrid or account-auth');
  sdkLock(tree.read('src-tauri/Cargo.lock').toString());
  sdkLock(tree.read(adapter+'/Cargo.lock').toString());
  for (const path of [...paths,...vendorPaths]) {
    safePath(path);
    // Vendor bytes are exact allowlisted inputs, including extensionless LICENSE files.
    if (!vendorPaths.includes(path) && !(fixed.has(path) || /\.(rs|toml|lock|md)$/.test(path) || path === adapter + '/.gitignore')) throw Error(`Review new migration input: ${path}`);
    const hash = digest(tree.read(path));
    if (manifest.files[path] !== hash) { manifest.files[path] = hash; changes.push(path); }
  }
  // Deleted migration modules must not leave dangling source pins.
  for (const path of Object.keys(manifest.files)) if ([adapter+'/',vendor+'/', 'src-tauri/src/account/'].some(prefix=>path.startsWith(prefix)) && !tree.entries.has(path)) {
    delete manifest.files[path]; changes.push(path);
  }
  if (!manifest.firstParty.some(item => item.root === adapter)) manifest.firstParty.push({root:adapter,provenance:'project-authored',rights:'reserved',rightsSource:'scripts/publish/LICENSE.project-reserved.txt'});
  const ownership={root:vendor,origin,revision:cyberbusRevision,licenses:[vendor+'/LICENSE-MIT',vendor+'/LICENSE-APACHE']};
  const previous=manifest.thirdParty.find(item=>item.root===vendor);
  if (previous && (previous.origin!==origin || previous.revision!==cyberbusRevision || JSON.stringify(previous.licenses)!==JSON.stringify(ownership.licenses))) throw Error('Review conflicting SDK vendor ownership');
  if (!previous) manifest.thirdParty.push(ownership);
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
