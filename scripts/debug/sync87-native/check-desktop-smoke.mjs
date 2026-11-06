#!/usr/bin/env node
/** Candidate host DOM smoke only. No Android/ADB/CDP/package operation. */
import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createHash,randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { DesktopPeer } from './desktop-peer.mjs';
import { sourceFingerprint } from '../source-identity.mjs';
const [receipt,output]=process.argv.slice(2);
assert(receipt?.startsWith('/'));
assert(/^\/private\/tmp\/notes-sync87-native-[a-z0-9-]+$/.test(output));
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(output,{mode:0o700});
const before=await sourceFingerprint(process.cwd()),started=performance.now(),checks=[];
let peer,failure=false,stage='open',report;
const check=(name,value)=>{assert(value,name);checks.push(name);};
try{
  peer=await DesktopPeer.open(receipt,output,randomBytes(5).toString('hex'));
  check('actual App DOM mounted',await peer.page.locator('.app').count()===1);
  stage='host';const address=await peer.host();check('actual host handler returned local endpoint',/^ws:\/\/10\.0\.2\.2:[0-9]+$/.test(address.endpoint));
  stage='invitation';let invitation=await peer.invitation(address.endpoint);check('actual handler generated memory-only invitation',invitation.startsWith('notes-sync-v1:'));invitation=undefined;
  check('invitation UI closed before observations',await peer.page.locator('[data-sensitive="invitation"]').count()===0);
  stage='create';const id=await peer.create('SYNC87 Desktop candidate smoke');
  stage='save';await peer.save(id,'SYNC87 actual App persisted updated text');
  const note=(await peer.workspace()).notes.find(n=>n.id===id);
  check('actual Tiptap handler persisted native Store document',note?.plainText==='SYNC87 actual App persisted updated text'&&note.revision>0);
  check('actual updated text visible',await peer.page.locator('.tiptap').innerText()==='SYNC87 actual App persisted updated text');
  stage='media';const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64');
  const file={name:'sync87-desktop-smoke.png',path:join(output,'sync87-desktop-smoke.png'),bytes:png.length,sha256:hash(png)};await writeFile(file.path,png,{flag:'wx',mode:0o600});
  const aid=await peer.addMedia(id,file),original=await peer.verifyOriginal(aid,file,'host-export');
  check('real FileChooser attachment and separate managed bytes/export match original',original.managedFileVerified&&original.sha256===file.sha256);
  await peer.page.waitForFunction(()=>[...document.querySelectorAll('.tiptap img')].some(i=>i.complete&&i.naturalWidth>0));
  check('actual App image decoded',true);
  stage='stop';await peer.sync({type:'stop'});
  check('no App page errors',peer.runtime.errors.length===0);
  stage='close';report=await peer.close();
  check('owned runtime closes naturally',report.exit.code===0&&report.exit.signal===null&&!report.forcedOrFailed&&report.pageErrorCount===0);
}catch{failure=true;}
finally{
  if(peer&&!report){try{report=await peer.close();}catch{failure=true;}}
  const after=await sourceFingerprint(process.cwd());if(after.sha256!==before.sha256)failure=true;
  const result={status:failure?'FAIL':'PASS',stage,checks,sourceBefore:before,sourceAfter:after,sourceUnchanged:before.sha256===after.sha256,wallSeconds:(performance.now()-started)/1000,scope:'candidate single actual React/Tiptap desktop DOM with reviewed Rust Session/SQLite Store; real host/invite handlers and local text/PNG persistence; browser OS/provider boundary simulated; no second peer, Android, ADB, native WebView/IME or recording acceptance',...(report?{lifecycle:report}:{}),rawErrorsSerialized:false};
  await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,stage,passed:checks.length,output,scope:result.scope}));
  if(failure)process.exitCode=1;
}
