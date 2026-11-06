import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {reviewCycle14ToolContinuation,verifyDOMDependencies} from '/private/tmp/apple-notes-sync87-native/scripts/debug/sync87-native/desktop-peer.mjs';
import {sourceFingerprint} from '/private/tmp/apple-notes-sync87-native/scripts/debug/source-identity.mjs';
const root='/private/tmp/apple-notes-sync87-native',path=root+'/scripts/debug/sync87-native/desktop-peer.mjs',output='/private/tmp/notes-sync87-native-final-02';
const previous=JSON.parse(await readFile(output+'/desktop-peer-lifecycle.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await readFile(path,'utf8'),frozen=execFileSync('git',['show','c23b71f7:scripts/debug/sync87-native/desktop-peer.mjs'],{cwd:root});assert.equal(hash(source),hash(frozen));
const proof=await reviewCycle14ToolContinuation(output,previous);assert.equal(proof.changedPaths.length,3);assert.equal(proof.originalAggregateFrontendUnchanged,false);
let checks=2;
for(const v of [{...previous,pid:1},{...previous,frontendBefore:{...previous.frontendBefore,sha256:'0'.repeat(64)}}]){await assert.rejects(reviewCycle14ToolContinuation(output,v));checks++}
// Exact function body; import.meta URL substituted with identical absolute module URL solely for dependency injection.
const body=source.slice(source.indexOf('export async function reviewCycle14ToolContinuation'),source.indexOf('export async function reviewExistingStore')).replace('export async function','async function').replaceAll('import.meta.url',JSON.stringify('file://'+path));
const factory=new Function('assert','resolve','fileURLToPath','execFileSync','createHash','readFile','join','hash','sourceFingerprint','verifyDOMDependencies','lstat','return ('+body+')');
for(const changedPath of ['scripts/debug/sync87-native/guard.py','src/App.tsx']){
 const injected=async(...args)=>{const bytes=await readFile(...args);return args[0]===join(root,changedPath)?Buffer.concat([Buffer.from(bytes),Buffer.from('unexpected')]):bytes};
 const f=factory(assert,resolve,fileURLToPath,execFileSync,createHash,injected,join,hash,sourceFingerprint,verifyDOMDependencies,lstat);
 await assert.rejects(f(output,previous));checks++;
}
console.log(JSON.stringify({checks,sourceCommit:'c23b71f702c215b011b456fc3f30c8044b8efd5d',selfSha256:hash(source),originalFrontendUnchanged:previous.frontendUnchanged,changedPaths:proof.changedPaths,productInputs:proof.productInputs.length,currentFileCount:proof.currentFrontend.fileCount,currentGitDirty:proof.currentFrontend.gitDirty,scope:'read-only host manifest/lstat/source only; no runtime/device/reopen or DB query'}));
