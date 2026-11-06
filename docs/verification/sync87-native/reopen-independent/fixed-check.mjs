import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,readdir,lstat,rm,symlink} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
const root='/private/tmp/apple-notes-sync87-native';
const protocol=execFileSync('git',['show','d0096346:scripts/debug/sync87-native/protocol.mjs'],{cwd:root,encoding:'utf8'});
const {parseRequest}=await import('data:text/javascript;base64,'+Buffer.from(protocol).toString('base64'));
const {safeSyncStatus}=await import(root+'/scripts/debug/sync87-native/status.mjs');
const {reviewExistingStore}=await import(root+'/scripts/debug/sync87-native/desktop-peer.mjs');
const checks=[];
for(const action of ['reopenDesktop','observeSync']){assert.equal(parseRequest(Buffer.from(JSON.stringify({action}))).ok,true);assert.equal(parseRequest(Buffer.from(JSON.stringify({action,invitation:'secret_sentinel'}))).ok,false);checks.push(action+' same-original-sample now reachable, extra invitation refused');}
const sentinel='secret_sentinel';const input={state:'error',pendingCount:1,conflictCount:0,error:'sync_'+sentinel,workspaceId:sentinel,deviceId:sentinel,peers:[{id:sentinel,connected:true,lastSyncAt:{raw:sentinel}}]};
const output=safeSyncStatus(input);assert.equal(output.error,'REDACTED_UNKNOWN');assert.equal(output.peers[0].lastSyncPresent,false);assert(!JSON.stringify(output).includes(sentinel));
assert.throws(()=>safeSyncStatus({...input,peers:[{...input.peers[0],connected:sentinel}]}));assert.throws(()=>safeSyncStatus({...input,peers:Array(65).fill(input.peers[0])}));assert.throws(()=>safeSyncStatus({...input,workspaceId:'x'.repeat(257)}));
assert.equal(safeSyncStatus({...input,error:'sync_timeout',peers:[{...input.peers[0],lastSyncAt:123}]}).error,'sync_timeout');checks.push('same code-shaped secret and arbitrary timestamp redacted; type/size bounds reject');
const dir='/private/tmp/notes-sync87-native-reopen-independent-'+randomBytes(4).toString('hex'),store=join(dir,'desktop-peer'),runId='0123456789';const reviewed={receipt:{sha256:'1'.repeat(64),sourceCommit:'2'.repeat(40)}};const prior={root:store,kind:'actual-react-tiptap-dom-real-rust-session-store-network',binarySha256:reviewed.receipt.sha256,sourceCommit:reviewed.receipt.sourceCommit,exit:{code:0,signal:null},forcedOrFailed:false,pageErrorCount:0,binaryUnchanged:true,frontendUnchanged:true};
try{
 await mkdir(join(store,'.sync'),{recursive:true});await writeFile(join(dir,'state.json'),JSON.stringify({runId,serial:'emulator-5584',avd:'notes-sync87-isolated'}));await writeFile(join(dir,'desktop-peer-lifecycle.json'),JSON.stringify(prior));await writeFile(join(store,'notes.sqlite3'),'INERT INDEPENDENT HOST FILE NOT SQLITE');
 const inode=(await lstat(join(store,'notes.sqlite3'))).ino;const proof=await reviewExistingStore(dir,runId,reviewed);assert.equal(proof.identities.database.inode,inode);assert.equal((await lstat(join(store,'notes.sqlite3'))).ino,inode);assert.equal(await readFile(join(store,'notes.sqlite3'),'utf8'),'INERT INDEPENDENT HOST FILE NOT SQLITE');assert.equal(JSON.parse(await readFile(proof.previousLifecycle,'utf8')).root,store);
 const before=(await readdir(dir)).length;await writeFile(join(dir,'state.json'),JSON.stringify({runId,serial:'emulator-5580',avd:'notes-sync87-isolated'}));await assert.rejects(reviewExistingStore(dir,runId,reviewed));assert.equal((await readdir(dir)).length,before);
 await writeFile(join(dir,'state.json'),JSON.stringify({runId,serial:'emulator-5584',avd:'notes-sync87-isolated'}));await rm(join(store,'.sync'),{recursive:true});await mkdir(join(dir,'other-sync'));await symlink(join(dir,'other-sync'),join(store,'.sync'));await assert.rejects(reviewExistingStore(dir,runId,reviewed));checks.push('canonical existing store accepted without DB mutation; wrong serial and .sync symlink refused');
}finally{await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify({ok:true,sourceCommit:'d0096346765cc5371d70b5f430d9253374dbd83f',scope:'source/host only, fake inert filesystem, no real runtime/backend/ADB/device',checks},null,2));
