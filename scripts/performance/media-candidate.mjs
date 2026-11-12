// Accepted product/fixture boundary for this formal after measurement.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {sourceIdentity} from '../build-info.mjs';
import {extractMacProvider} from './extract-media-provider.mjs';
export const acceptedCandidate={revision:'1507d66a152ac2ac9838d2bcd37791449135a370',fingerprint:'4e143c3d8d459ce2f26a699c691ba58b188fc6b58a9e3838b1c8852422e8a904',inputCount:434,chrome:'156.0.8078.80',fixtureManifestSHA256:'3ee2813ccb7de3f7b99cf84e6f1eea7d8658aa14addba6674ee53a75fe516351',fixtureMapSHA256:'7e2e17411a078e0d38b9819ec2c8f2efe41968303d89ed59963100ca5f61f27c',fixtureSQLiteSHA256:'67c89bf58a7fdff7ce1e64b601a2d344cfe8f1d869b9c717b560ac3e407a62bf',samples:503,originalBytes:715371216};
const sha=b=>createHash('sha256').update(b).digest('hex');
export function validateCandidate(root){
 const source=sourceIdentity(root);
 assert.equal(source.sourceFingerprint,acceptedCandidate.fingerprint,'Unaccepted product fingerprint');
 assert.equal(source.inputCount,acceptedCandidate.inputCount,'Unaccepted product input inventory');
 execFileSync('git',['merge-base','--is-ancestor',acceptedCandidate.revision,'HEAD'],{cwd:root});
 return source;
}
export async function validateProvider(root,build){
 assert.equal(process.platform,'darwin','Formal run requires accepted Mac provider host');
 assert.equal(build.schema,3);assert.equal(build.providerNative,true);assert.equal(build.native,true);assert.equal(build.tauriPackage,false);
 const source=await readFile(resolve(root,'plugins/tauri-plugin-notes-media/src/lib.rs'),'utf8');
 const generated=extractMacProvider(source);
 assert.equal(sha(generated),build.generated?.['native-provider.rs'],'Changed generated production provider');
 assert.equal(sha(await readFile(resolve(build.harness,'native-provider.rs'))),sha(generated));
 for(const path of ['plugins/tauri-plugin-notes-media/src/lib.rs','plugins/tauri-plugin-notes-media/macos/thumbnail.m'])assert.equal(build.sources[path],sha(await readFile(resolve(root,path))),'Missing/stale provider source');
}
export async function verifyFrozenFixture(fixture){
 const [manifestBytes,mapBytes,sqlite]=await Promise.all(['manifest.json','store-map.json','store-baseline.sqlite3'].map(p=>readFile(resolve(fixture,p))));
 assert.equal(sha(manifestBytes),acceptedCandidate.fixtureManifestSHA256);assert.equal(sha(mapBytes),acceptedCandidate.fixtureMapSHA256);assert.equal(sha(sqlite),acceptedCandidate.fixtureSQLiteSHA256);
 const manifest=JSON.parse(manifestBytes),mapping=JSON.parse(mapBytes);
 assert.equal(manifest.originalBytes,acceptedCandidate.originalBytes);assert.equal(mapping.attachments.length,acceptedCandidate.samples);assert.equal(mapping.notes.length,103);
 let total=0;for(const a of mapping.attachments){const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(resolve(fixture,a.samplePath))){h.update(chunk);bytes+=chunk.length;}assert.equal(bytes,a.bytes);assert.equal(h.digest('hex'),a.sha256);total+=bytes;}
 assert.equal(total,acceptedCandidate.originalBytes);
 return {manifestSHA256:sha(manifestBytes),mapSHA256:sha(mapBytes),sqliteSHA256:sha(sqlite),samples:mapping.attachments.length,bytes:total,originalsStreamHashed:true};
}
