// Read-only committed-input probe. Native account input is explicitly a fixture,
// never a claim that core/account integration has been built or accepted.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {trackedTree,manifestName} from '../../../../scripts/publish/export.mjs';
import {digest,readInventory} from '../../../../scripts/publish/policy.mjs';
import {finalizeCyberbusManifest} from '../../../../scripts/publish/cyberbus-manifest.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const platform=trackedTree(root,'b74eeb637a68370d2b4faae26647be349fa31c50');
const core=trackedTree(root,'c3ea6dc7');
for (const [label,tree] of [['platform',platform],['parent',trackedTree(root,'b74eeb637^')]]) {
  const read=tree.read,cache=new Map();
  tree.read=p=>{if(!cache.has(p))cache.set(p,read(p));return cache.get(p);};
  const manifest=JSON.parse(tree.read(manifestName));
  const mismatches=Object.entries(manifest.files).filter(([p,h])=>p!==manifestName && digest(tree.read(p))!==h).map(([p])=>p);
  console.log(label,'mismatch count',mismatches.length,'first',mismatches[0]);
  // Policy only; this is deliberately NOT a source export pass.
  if(label==='platform') {
    readInventory(manifest,tree.read,{refresh:true});
    console.log(label,'in-memory hash refresh: policy/license/secret scan PASS');
    assert(!Object.keys(manifest.files).some(p=>p.startsWith('crates/notes-cyberbus/')));
    assert(!Object.keys(manifest.files).some(p=>p.startsWith('vendor/cyberbus/')));
    assert(!Object.keys(manifest.files).some(p=>/\/(?:cloudflared|libcloudflared\.so)$/.test(p)));
    assert.deepEqual(manifest.runtimeAssets,[]);
    console.log('actual platform manifest: new adapter/vendor absent; old helper binaries/runtimeAssets absent');
  }
}
const rights='scripts/publish/LICENSE.project-reserved.txt';
const cargo=core.read('crates/notes-cyberbus/Cargo.toml');
assert.match(cargo.toString(),/cyberbus = \{ path = "\.\.\/\.\.\/vendor\/cyberbus\/crates\/cyberbus" \}/);
const files=new Map([
  [rights,Buffer.from('synthetic first-party rights')],
  ['crates/notes-cyberbus/Cargo.toml',cargo],
  // Core commit does not yet have the integrated application owner/lock.
  ['src-tauri/Cargo.toml',Buffer.from('[dependencies]\nnotes-cyberbus = {path="../crates/notes-cyberbus"}')],
  ['src-tauri/Cargo.lock',core.read('crates/notes-cyberbus/Cargo.lock')],
]);
for (const p of core.entries.keys()) if(p.startsWith('vendor/cyberbus/')) files.set(p,core.read(p));
const manifest={schema:1,files:{[rights]:digest(files.get(rights)),[manifestName]:'SELF'},firstParty:[],thirdParty:[],runtimeAssets:[]};
files.set(manifestName,Buffer.from(JSON.stringify(manifest)));
const tree={entries:files,read:p=>{assert(files.has(p),p);return files.get(p);}};
assert.throws(()=>finalizeCyberbusManifest(tree),/SDK dependencies must use the reviewed exact git revision/);
console.log('F2 REPRODUCED: exact c3ea6dc7 adapter Cargo + its vendor tree rejected before native owner/lock checks');
console.log('F2 static follow-up: finalizer paths only select adapter/native/account, omit vendor tree and third-party ownership');
