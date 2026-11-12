#!/usr/bin/env node
// Formal boundary checks without product mutations or replaying measurements.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {acceptedCandidate,validateCandidate,validateProvider,verifyFrozenFixture} from './media-candidate.mjs';
const current=validateCandidate(process.cwd());assert.equal(current.sourceFingerprint,acceptedCandidate.fingerprint);
await assert.rejects(()=>validateProvider('.', {schema:3,providerNative:false}));
await assert.rejects(()=>validateProvider('.', {schema:3,providerNative:true,native:false}));
const tmp=await mkdtemp(join(tmpdir(),'media99m-candidate-check-'));
try{
 await mkdir(join(tmp,'src'),{recursive:true});await writeFile(join(tmp,'src','changed.ts'),'a different product');
 execFileSync('git',['init','-q'],{cwd:tmp});execFileSync('git',['add','.'],{cwd:tmp});execFileSync('git',['-c','user.name=Candidate Check','-c','user.email=fixture@example.invalid','commit','-qm','different product'],{cwd:tmp});
 assert.throws(()=>validateCandidate(tmp),/Unaccepted product fingerprint/);
 for(const name of ['manifest.json','store-map.json','store-baseline.sqlite3'])await writeFile(join(tmp,name),'changed frozen input');
 await assert.rejects(()=>verifyFrozenFixture(tmp));
}finally{await rm(tmp,{recursive:true,force:true});}
console.log('PASS accepted product identity, changed product denied, wrong provider denied, corrupted frozen input denied; no measurement replay');
