import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeCyberbusManifest,cyberbusRevision} from './cyberbus-manifest.mjs';
import {digest} from './policy.mjs';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const source=JSON.parse(readFileSync(new URL('./notices/cyberbus/runtime-source.json',import.meta.url)));
const corePath=p=>{try {return readFileSync(new URL('../../'+p,import.meta.url));} catch {return execFileSync('git',['show',source.reviewedPatchCommit+':'+p],{cwd:root});}};
const coreFiles=new Map([...Object.keys(source.files),'crates/notes-cyberbus/Cargo.toml','crates/notes-cyberbus/Cargo.lock'].map(p=>[p,corePath(p)]));
const rights = 'scripts/publish/LICENSE.project-reserved.txt';
function fixture() {
  const files = new Map(Object.entries({
    [rights]:'Project rights reserved',
    'src/account-client.ts':'// unrelated frontend',
    'src-tauri/Cargo.toml':'[dependencies]\nnotes-cyberbus = { path = "../crates/notes-cyberbus" }',
    'src-tauri/Cargo.lock':coreFiles.get('crates/notes-cyberbus/Cargo.lock'),
    'src-tauri/src/account/mod.rs':'// integrated owner',
    'crates/notes-cyberbus/Cargo.toml':coreFiles.get('crates/notes-cyberbus/Cargo.toml'),
    'crates/notes-cyberbus/src/lib.rs':'// integrated adapter',
  }).map(([path,text])=>[path,Buffer.from(text)]));
  for (const [path,bytes] of coreFiles) files.set(path,bytes);
  const manifest = {schema:1,files:Object.fromEntries([rights,'src/account-client.ts'].map(p=>[p,digest(files.get(p))])),firstParty:[],thirdParty:[],runtimeAssets:[]};
  manifest.files['scripts/publish/manifest.json']='SELF';
  files.set('scripts/publish/manifest.json',Buffer.from(JSON.stringify(manifest)));
  return {files,entries:files,read:path=>{if(!files.has(path))throw Error('missing tracked file');return files.get(path);}};
}
test('committed integration adds new crate and ownership without refreshing unrelated hashes',()=>{
  const tree=fixture(), result=finalizeCyberbusManifest(tree);
  assert(result.changes.includes('crates/notes-cyberbus/src/lib.rs'));
  assert(result.changes.includes('src-tauri/Cargo.lock'));
  assert(!result.changes.includes('src/account-client.ts'));
  assert.equal(result.manifest.files['src/account-client.ts'],digest(tree.read('src/account-client.ts')));
  assert.equal(result.manifest.firstParty[0].root,'crates/notes-cyberbus');
  assert.deepEqual(result.manifest.thirdParty,[{root:'vendor/cyberbus',origin:source.source,revision:cyberbusRevision,licenses:['vendor/cyberbus/LICENSE-MIT','vendor/cyberbus/LICENSE-APACHE']}]);
  for (const [path,hash] of Object.entries(source.files)) assert.equal(result.manifest.files[path],hash);
  assert(result.changes.includes(source.patchRecord));
  tree.files.set('src/account-client.ts',Buffer.from('// dirty unrelated committed input'));
  assert.throws(()=>finalizeCyberbusManifest(tree),/hash mismatch/);
});
test('missing adapter, wrong SDK pin, legacy production owners and unsafe tracked inputs fail closed',()=>{
  for (const mutate of [
    t=>t.files.delete('crates/notes-cyberbus/Cargo.toml'),
    t=>t.files.set('crates/notes-cyberbus/Cargo.toml',Buffer.from('[dependencies]\ncyberbus = { path = "../local" }')),
    t=>t.files.set('src-tauri/Cargo.toml',Buffer.from('cybergrid-sdk = {path="../vendor/cybergrid-sdk"}')),
    t=>t.files.set('src-tauri/Cargo.lock',Buffer.from('name = "cybergrid-sdk"')),
    t=>t.files.set('crates/notes-cyberbus/key.pem',Buffer.from('fixture')),
    t=>t.files.set('crates/notes-cyberbus/target/output.rs',Buffer.from('// generated')),
  ]) {const tree=fixture();mutate(tree);assert.throws(()=>finalizeCyberbusManifest(tree));}
});

test('fixed SDK license texts retain exact upstream provenance hashes', async()=>{
  const {readFile} = await import('node:fs/promises');
  const base=new URL('./notices/cyberbus/',import.meta.url);
  const metadata=JSON.parse(await readFile(new URL('NOTICE.provenance.json',base)));
  assert.equal(metadata.revision,cyberbusRevision);
  assert.equal(metadata.source,'https://github.com/osd-pub/CyberBus.git');
  for (const item of metadata.files) assert.equal(digest(await readFile(new URL(item.path,base))),item.sha256);
  assert(metadata.files.some(p=>p.upstreamPath==='vendor/easytier/LICENSE'));
  assert(metadata.files.some(p=>p.path==='LGPL-3.0.txt'));
});


test('reviewed vendor, auth pins and actual SDK lock sources fail closed on changed inputs',()=>{
  for (const mutate of [
    t=>t.files.delete('vendor/cyberbus/LICENSE-MIT'),
    t=>t.files.set('vendor/cyberbus/crates/cyberbus/src/runtime/data.rs',Buffer.from('// unreviewed change')),
    t=>t.files.set('vendor/cyberbus/new.rs',Buffer.from('// unreviewed source')),
    t=>t.files.set('vendor/cyberbus/README.notes.md',Buffer.from('// missing modification record')),
    t=>t.files.set('vendor/cyberbus/crates/cyberbus/Cargo.toml',Buffer.from('cyberbus-auth = {path="../../../../sibling"}')),
    t=>t.files.set('crates/notes-cyberbus/Cargo.toml',Buffer.from(t.read('crates/notes-cyberbus/Cargo.toml').toString().replaceAll(cyberbusRevision,'0'.repeat(40)))),
    t=>t.files.set('src-tauri/Cargo.lock',Buffer.from(t.read('src-tauri/Cargo.lock').toString().replaceAll('#'+cyberbusRevision,'#'+'0'.repeat(40)))),
    t=>t.files.set('crates/notes-cyberbus/Cargo.lock',Buffer.from(t.read('crates/notes-cyberbus/Cargo.lock').toString().replace('name = "cyberbus-auth"','name = "not-cyberbus-auth"'))),
  ]) {const tree=fixture();mutate(tree);assert.throws(()=>finalizeCyberbusManifest(tree));}
});

test('account-auth type and cancellation dependency alone is compatible; no ownership inference',()=>{
  const tree=fixture();
  tree.files.set('src-tauri/Cargo.toml',Buffer.from(tree.read('src-tauri/Cargo.toml').toString()+'\naccount-auth = {path="../crates/account-auth"}'));
  tree.files.set('src-tauri/src/account/mod.rs',Buffer.from('// fixture types only\nuse account_auth::{Identity, AuthorizationCancellation};'));
  const result=finalizeCyberbusManifest(tree);
  assert(result.changes.includes('src-tauri/src/account/mod.rs'));
});
