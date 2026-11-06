// Independent host-only admission checks. Never opens a peer or device.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out=resolve(root,'docs/verification/sync87-native/final-dependency-independent');
const {verifyDOMDependencies,DOM_DEPENDENCIES,reviewedPeer}=await import(pathToFileURL(join(root,'scripts/debug/sync87-native/desktop-peer.mjs')));
const {sourceFingerprint}=await import(pathToFileURL(join(root,'scripts/debug/source-identity.mjs')));
const expected={
 'scripts/debug/runtime.mjs':'f6d84cfc6b48a33b4d8c12c98e84e8635dd093b507ccdca87539b12c4b092618',
 'scripts/debug/rust-backend.mjs':'3df944b85e2e65e10a4a1eaaae5b23c6b107b73ecfd9ed071bd8de9b2f988d0f',
 'scripts/debug/sync-rust-dom.mjs':'b8fe79058842c73303b4019e172842cd6ab74803a09f83f365d5ad6cfed62ff7',
};
const before=await sourceFingerprint(root),checks=[];
assert.deepEqual(DOM_DEPENDENCIES,expected);checks.push('Exact three reviewed dependency entries, no additions or omissions');
assert.deepEqual(await verifyDOMDependencies(root),{sourceCommit:'b08c77289203691c30026ce673116721c5ca5a59',files:expected});
checks.push('Current candidate admitted with exact b08c7728 source label');
const temp=await mkdtemp('/private/tmp/notes-sync87-native-dependency-independent-');
try {
 await mkdir(join(temp,'scripts/debug'),{recursive:true});
 for(const name of Object.keys(expected))await writeFile(join(temp,name),await readFile(join(root,name)));
 assert.deepEqual(await verifyDOMDependencies(temp),{sourceCommit:'b08c77289203691c30026ce673116721c5ca5a59',files:expected});
 checks.push('Complete byte-identical owned snapshot admitted');
 for(const name of Object.keys(expected)){
  const path=join(temp,name),bytes=await readFile(path),changed=Buffer.from(bytes);
  changed[Math.floor(changed.length/2)]^=1;await writeFile(path,changed);
  await assert.rejects(verifyDOMDependencies(temp),{message:'Frozen DOM dependency changed'});
  checks.push('One-bit corruption rejected: '+name);await writeFile(path,bytes);
 }
} finally {await rm(temp,{recursive:true});}
const receiptPath='/private/tmp/sync87-peer-final11/receipt.json';
const reviewed=await reviewedPeer(receiptPath);
assert.deepEqual(reviewed.receipt,{
 authorizedBy:'root-sync87-peer-review',binary:'/private/tmp/sync86-transport-build11/notes-current-attachment-transport',
 sha256:'333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800',
 sourceCommit:'cd334bc88513a89c490788d2e2e27c7967575f4a',buildLabel:'build11',
});
const after=await sourceFingerprint(root);assert.deepEqual(after,before);
assert.equal(before.fileCount,153);assert.equal(before.sha256,'6b143fb87d3cbf6b5ca8b44e912c2a21a0e857d817a8569ff05bea09178105f9');
assert.equal(before.gitDirty,false);
await writeFile(join(out,'dependencies.json'),JSON.stringify({status:'PASS',checks,passed:checks.length,sourceBefore:before,sourceAfter:after,reviewedReceiptPath:receiptPath,reviewed,ownedSnapshotRemoved:true,noPeerSpawn:true,noAndroidOrAdb:true},null,2)+'\n');
console.log(JSON.stringify({status:'PASS',checks:checks.length,fingerprint:before.sha256,reviewedBinary:reviewed.receipt.buildLabel,noPeerSpawn:true}));
