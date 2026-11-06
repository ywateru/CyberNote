/** Host-only boundary checks. No real peer executable, socket or device is used. */
import assert from 'node:assert/strict';
import { createHash,randomBytes } from 'node:crypto';
import { mkdir,readFile,writeFile,chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { validatePeerReceipt,reviewedPeer,validatePeerEvent,DesktopPeer,verifyDOMDependencies } from './desktop-peer.mjs';
import { exportPlan } from './native-ui.mjs';
import { compareColdBoot,assertNativeOriginal } from './scenarios.mjs';
let checks=0;
const hash=b=>createHash('sha256').update(b).digest('hex');
const root='/private/tmp/notes-sync87-native-scenarios-'+randomBytes(6).toString('hex');await mkdir(root);
const binary=join(root,'synthetic-not-executed');await writeFile(binary,'synthetic receipt-hash test bytes; never executed');await chmod(binary,0o700);
const valid={authorizedBy:'root-sync87-peer-review',binary,sha256:hash(await readFile(binary)),sourceCommit:'a'.repeat(40),buildLabel:'build10'};
validatePeerReceipt(valid);checks++;
for(const value of [{...valid,extra:true},{...valid,authorizedBy:'other'},{...valid,buildLabel:'build09'},{...valid,sourceCommit:'short'},{...valid,sha256:'short'},{...valid,binary:'relative'}]){assert.throws(()=>validatePeerReceipt(value));checks++;}
const receipt=join(root,'receipt.json');await writeFile(receipt,JSON.stringify(valid));assert.equal((await reviewedPeer(receipt)).receipt.sha256,valid.sha256);checks++;
await writeFile(binary,'changed');await assert.rejects(()=>reviewedPeer(receipt));checks++;
const payload=Buffer.from('synthetic-original'),file={name:'sync87-abcd123456.png',sha256:hash(payload),bytes:payload.length};
const state={runId:'abcd123456',remote:'/sdcard/Download/notes-sync87-abcd123456',files:[file]};
const plan=exportPlan(state,root,3,file);assert.equal(plan.path,join(root,'exports-3',file.name));assert.equal(plan.remote,state.remote+'/exports-3/'+file.name);checks++;
for(const index of [0,21,null,1.5]){assert.throws(()=>exportPlan(state,root,index,file));checks++;}
assert.throws(()=>exportPlan(state,root,1,{...file,name:'sync87-other.png'}));checks++;
const before={bootId:'old',emulatorPid:11,emulatorStart:'old-start',userdataDevice:1,userdataInode:2,userdataSize:3};
compareColdBoot(before,{...before,bootId:'new',emulatorPid:12});checks++;
for(const after of [before,{...before,bootId:'new'},{...before,bootId:'new',emulatorPid:12,userdataInode:4}]){assert.throws(()=>compareColdBoot(before,after));checks++;}
const original=await assertNativeOriginal({readAttachment:async()=>({data:payload.toString('base64')})},'synthetic-id',file);assert.equal(original.sha256,file.sha256);checks++;
await assert.rejects(()=>assertNativeOriginal({readAttachment:async()=>({data:Buffer.from('wrong').toString('base64')})},'synthetic-id',file));checks++;
const session='same-session',peer=new DesktopPeer();
await assert.rejects(()=>peer.command('sync.status'),/actual App page required/);checks++;
await assert.rejects(()=>peer.call('load_workspace'),/actual App page required/);checks++;
for(const event of [{name:'notes-sync',payload:{phase:'probe',operationId:'op',sessionId:session}},{name:'notes-sync',payload:{phase:'prepare',operationId:'op',sessionId:session,noteIds:[]}},{name:'notes-sync',payload:{phase:'release',operationId:'op',sessionId:session,outcome:'commit'}}]){validatePeerEvent(event,session);checks++;}
const dependencies=await verifyDOMDependencies(process.cwd());assert.equal(Object.keys(dependencies.files).length,3);checks++;
for(const event of [{name:'notes-sync',payload:{phase:'release',operationId:'op',sessionId:session,outcome:'unknown'}},{name:'notes-sync',payload:{phase:'prepare',operationId:'op',sessionId:session}},{name:'notes-sync',payload:{phase:'probe',operationId:'op',sessionId:session,extra:'untrusted'}},{name:'unknown',payload:{}},{name:'notes-access',payload:{phase:'commit',access:{sessionId:'foreign',epoch:1}}},{name:'notes-metadata',payload:{metadata:{sessionId:'foreign'}}}]){assert.throws(()=>validatePeerEvent(event,session));checks++;}
console.log(JSON.stringify({passed:checks,scope:'host-only receipt/path/hash/cold-boot/event-schema/actual-page admission/dependency checks; receipt binary never executed, native read is an explicit stub; no DOM/Store/socket/device acceptance',output:root}));
