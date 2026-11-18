// Targeted input compatibility only. Real committed core files, synthetic native
// Cargo/account/lock. No baseline refresh, source export, merge or product writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {trackedTree,manifestName} from '../../../../scripts/publish/export.mjs';
import {digest} from '../../../../scripts/publish/policy.mjs';
import {finalizeCyberbusManifest,cyberbusRevision} from '../../../../scripts/publish/cyberbus-manifest.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const fixed=trackedTree(root,'a4c85d3242a4a792b6374696a507e678b4672047');
// Ensure imported implementation/policy are the exact reviewed bytes.
for(const path of ['scripts/publish/cyberbus-manifest.mjs','scripts/publish/policy.mjs','scripts/publish/export.mjs','scripts/publish/notices/cyberbus/runtime-source.json'])
  assert.deepEqual(readFileSync(new URL('../../../../'+path,import.meta.url)),fixed.read(path));
const core=trackedTree(root,'2b24104a294223382b9bff1aae793dd6e4b7aa61');
const real=new Map();
for(const path of core.entries.keys()) if(/^(crates\/notes-cyberbus|vendor\/cyberbus)\//.test(path)) real.set(path,core.read(path));
const metadata=JSON.parse(fixed.read('scripts/publish/notices/cyberbus/runtime-source.json'));
const vendor=[...real.keys()].filter(p=>p.startsWith('vendor/')).sort();
assert.deepEqual(vendor,Object.keys(metadata.files).sort());
assert.equal(vendor.length,30);
for(const path of vendor) assert.equal(digest(real.get(path)),metadata.files[path],path);
const rights='scripts/publish/LICENSE.project-reserved.txt', unrelated='src/account-client.ts';
function fixture() {
  const files=new Map(real);
  files.set(rights,Buffer.from('Synthetic project rights source'));
  files.set(unrelated,Buffer.from('// synthetic unrelated pin'));
  files.set('src-tauri/Cargo.toml',Buffer.from('[dependencies]\nnotes-cyberbus = {path="../crates/notes-cyberbus"}\naccount-auth = {path="../crates/account-auth"}\n'));
  // Deliberately NOT the final integrated application lock or actual auth owner.
  files.set('src-tauri/Cargo.lock',real.get('crates/notes-cyberbus/Cargo.lock'));
  files.set('src-tauri/src/account/mod.rs',Buffer.from('// synthetic passive type import; no runtime owner proof\nuse account_auth::Identity;\n'));
  const manifest={schema:1,files:{[rights]:digest(files.get(rights)),[unrelated]:digest(files.get(unrelated)),[manifestName]:'SELF'},firstParty:[],thirdParty:[],runtimeAssets:[]};
  files.set(manifestName,Buffer.from(JSON.stringify(manifest)));
  return {files,entries:files,read:p=>{assert(files.has(p),'missing fixture path: '+p);return files.get(p);}};
}
const positive=fixture(), result=finalizeCyberbusManifest(positive);
for(const [path,bytes] of real) assert.equal(result.manifest.files[path],digest(bytes),path);
assert.equal(result.manifest.files[unrelated],digest(positive.read(unrelated)));
assert(!result.changes.includes(unrelated));
assert.deepEqual(result.manifest.firstParty,[{root:'crates/notes-cyberbus',provenance:'project-authored',rights:'reserved',rightsSource:rights}]);
const owner={root:'vendor/cyberbus',origin:metadata.source,revision:cyberbusRevision,licenses:['vendor/cyberbus/LICENSE-MIT','vendor/cyberbus/LICENSE-APACHE']};
assert.deepEqual(result.manifest.thirdParty,[owner]);
// Stale deleted migration pins are removed; an existing correct owner is stable.
result.manifest.files['crates/notes-cyberbus/src/deleted.rs']='0'.repeat(64);
positive.files.set(manifestName,Buffer.from(JSON.stringify(result.manifest)));
const repeat=finalizeCyberbusManifest(positive);
assert(!('crates/notes-cyberbus/src/deleted.rs' in repeat.manifest.files));
assert.deepEqual(repeat.manifest.thirdParty,[owner]);
const put=(t,p,s)=>t.files.set(p,Buffer.from(s));
const replace=(t,p,a,b)=>{const s=t.read(p).toString();assert(s.includes(a));put(t,p,s.replaceAll(a,b));};
const cases=[
  ['missing license',t=>t.files.delete('vendor/cyberbus/LICENSE-MIT'),/added or missing SDK vendor/],
  ['changed runtime',t=>put(t,'vendor/cyberbus/crates/cyberbus/src/runtime.rs','// unreviewed'),/changed SDK vendor/],
  ['extra runtime file',t=>put(t,'vendor/cyberbus/extra.rs','// unreviewed'),/added or missing SDK vendor/],
  ['changed provenance',t=>put(t,metadata.patchRecord,'// unreviewed'),/changed SDK vendor/],
  ['sibling runtime',t=>replace(t,'crates/notes-cyberbus/Cargo.toml','../../vendor/cyberbus/crates/cyberbus','../../../sibling/crates/cyberbus'),/reviewed in-tree vendor path/],
  ['auth Cargo pin',t=>replace(t,'crates/notes-cyberbus/Cargo.toml',cyberbusRevision,'0'.repeat(40)),/reviewed exact git revision/],
  ['native SDK lock pin',t=>replace(t,'src-tauri/Cargo.lock','#'+cyberbusRevision,'#'+'0'.repeat(40)),/wrong SDK source/],
  ['adapter SDK lock pin',t=>replace(t,'crates/notes-cyberbus/Cargo.lock','#'+cyberbusRevision,'#'+'0'.repeat(40)),/wrong SDK source/],
  ['missing auth lock',t=>replace(t,'src-tauri/Cargo.lock','name = "cyberbus-auth"','name = "other-auth"'),/contain one cyberbus-auth/],
  ['duplicate local runtime',t=>put(t,'src-tauri/Cargo.lock',t.read('src-tauri/Cargo.lock')+'\n[[package]]\nname = "cyberbus"\nversion = "0.0.0"\n'),/contain one cyberbus/],
  ['conflicting vendor owner',t=>{const m=JSON.parse(t.read(manifestName));m.thirdParty.push({...owner,revision:'0'.repeat(40)});put(t,manifestName,JSON.stringify(m));},/conflicting SDK vendor ownership/],
  ['legacy production dependency',t=>put(t,'src-tauri/Cargo.toml',t.read('src-tauri/Cargo.toml')+'cybergrid-sdk = {path="../vendor/cybergrid-sdk"}\n'),/without legacy CyberGrid/],
  ['unapproved adapter input',t=>put(t,'crates/notes-cyberbus/key.pem','synthetic'),/Review new migration input|Excluded export path/],
  ['unrelated stale pin',t=>put(t,unrelated,'// changed unrelated'),/Export hash mismatch: src\/account-client.ts/],
];
for(const [label,mutate,error] of cases) {const t=fixture();mutate(t);assert.throws(()=>finalizeCyberbusManifest(t),error,label);}
console.log(`PASS F2: exact core 2b24104a (all ${real.size-vendor.length} adapter + ${vendor.length} vendor files), both licenses/provenance, first/third-party ownership, passive account-auth accepted, deleted pins removed; ${cases.length} negative controls rejected`);
console.log('Scope-only fixture: no real native account owner/lock, Cargo build, baseline refresh or complete source export asserted');
