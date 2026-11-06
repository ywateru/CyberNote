/** Host-only filesystem admission checks. Never starts a runtime, backend or device. */
import { mkdir,writeFile,readFile,rm,symlink,lstat } from 'node:fs/promises';
import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';import {join} from 'node:path';
import {reviewExistingStore} from './desktop-peer.mjs';
const output='/private/tmp/notes-sync87-native-reopen-host-'+randomBytes(4).toString('hex'),root=join(output,'desktop-peer'),runId='0123456789';
const reviewed={receipt:{sha256:'1'.repeat(64),sourceCommit:'2'.repeat(40)}};
const prior={root,kind:'actual-react-tiptap-dom-real-rust-session-store-network',binarySha256:reviewed.receipt.sha256,sourceCommit:reviewed.receipt.sourceCommit,exit:{code:0,signal:null},forcedOrFailed:false,pageErrorCount:0,binaryUnchanged:true,frontendUnchanged:true};let checks=0;
try{
 await mkdir(join(root,'.sync'),{recursive:true});await writeFile(join(output,'state.json'),JSON.stringify({runId,serial:'emulator-5584',avd:'notes-sync87-isolated'}));await writeFile(join(output,'desktop-peer-lifecycle.json'),JSON.stringify(prior));await writeFile(join(root,'notes.sqlite3'),'INERT HOST FIXTURE; NOT A DATABASE');
 const before=await lstat(join(root,'notes.sqlite3')),proof=await reviewExistingStore(output,runId,reviewed);assert.equal(proof.kind,'same-existing-owned-store');assert.equal(proof.identities.database.inode,before.ino);assert.equal(JSON.parse(await readFile(proof.previousLifecycle,'utf8')).root,root);checks++;
 await assert.rejects(reviewExistingStore(output,'ffffffff00',reviewed));checks++;
 await writeFile(join(output,'desktop-peer-lifecycle.json'),JSON.stringify({...prior,exit:{code:2,signal:null}}));await assert.rejects(reviewExistingStore(output,runId,reviewed));checks++;
 await writeFile(join(output,'desktop-peer-lifecycle.json'),JSON.stringify(prior));await rm(join(root,'notes.sqlite3'));await writeFile(join(root,'other-inert'),'INERT');await symlink(join(root,'other-inert'),join(root,'notes.sqlite3'));await assert.rejects(reviewExistingStore(output,runId,reviewed));checks++;
 console.log(JSON.stringify({ok:true,checks,scope:'host-only inert files, no executable/runtime/ADB/device'}));
}finally{await rm(output,{recursive:true,force:true});}
