import assert from 'node:assert/strict';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyDOMDependencies} from '/private/tmp/apple-notes-sync87-native/scripts/debug/sync87-native/desktop-peer.mjs';
import {sourceFingerprint} from '/private/tmp/apple-notes-sync87-native/scripts/debug/source-identity.mjs';
const root='/private/tmp/apple-notes-sync87-native',self='scripts/debug/sync87-native/desktop-peer.mjs',path=root+'/'+self,output='/private/tmp/notes-sync87-native-final-02',rp='/private/tmp/sync87-cycle14-continuation-review/receipt.json';
const previous=JSON.parse(await readFile(output+'/desktop-peer-lifecycle.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await readFile(path,'utf8'),commit=execFileSync('git',['rev-parse','de873fd4'],{cwd:root}).toString().trim(),frozen=execFileSync('git',['show',commit+':'+self],{cwd:root});assert.equal(hash(source),hash(frozen));
// Receipt simulated only through injected read/stat. Never writes or issues root authority receipt.
const receipt={authorizedBy:'root-sync87-cycle14-continuation-review',sha256:hash(source),sourceCommit:commit};
const body=source.slice(source.indexOf('export async function reviewCycle14ToolContinuation'),source.indexOf('export async function reviewExistingStore')).replace('export async function','async function').replaceAll('import.meta.url',JSON.stringify('file://'+path));
const factory=new Function('assert','resolve','fileURLToPath','execFileSync','createHash','readFile','join','hash','sourceFingerprint','verifyDOMDependencies','lstat','realpath','return ('+body+')');
const make=(opts={})=>factory(assert,resolve,fileURLToPath,execFileSync,createHash,async(...args)=>{if(args[0]===rp)return JSON.stringify({...receipt,...opts.receipt});const bytes=await readFile(...args);return args[0]===join(root,opts.changedPath||'__none__')?Buffer.concat([Buffer.from(bytes),Buffer.from('unexpected')]):bytes},join,hash,sourceFingerprint,verifyDOMDependencies,async p=>p===rp?{isFile:()=>true,isSymbolicLink:()=>!!opts.symlink}:lstat(p),async p=>p===rp?rp:realpath(p));
const proof=await make()(output,previous);assert.equal(proof.changedPaths.length,3);assert.equal(proof.originalAggregateFrontendUnchanged,false);let checks=1;
for(const opts of [{changedPath:'scripts/debug/sync87-native/guard.py'},{changedPath:'src/App.tsx'},{changedPath:self},{receipt:{sha256:'0'.repeat(64)}},{receipt:{authorizedBy:'author'}},{symlink:true}]){await assert.rejects(make(opts)(output,previous));checks++}
for(const v of [{...previous,pid:1},{...previous,frontendBefore:{...previous.frontendBefore,sha256:'0'.repeat(64)}}]){await assert.rejects(make()(output,v));checks++}
console.log(JSON.stringify({checks,sourceCommit:commit,selfSha256:hash(source),originalFrontendUnchanged:previous.frontendUnchanged,changedPaths:proof.changedPaths,productInputs:proof.productInputs.length,currentFileCount:proof.currentFrontend.fileCount,currentGitDirty:proof.currentFrontend.gitDirty,scope:'read-only host manifests/lstat/source, rootreceipt injected in memory; no runtime/device/reopen or DB query'}));
