import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { mkdir,writeFile,readFile,statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rust } from '../../../scripts/audio-card-rust-fixture.mjs';
const out=resolve('docs/verification/app-002-audio-card-independent-01/session-authority01');await mkdir(out);
const disk=await statfs(out);assert(disk.bavail*disk.bsize>=2*1024**3);
const binary=process.env.NOTES_AUDIO_CARD_BINARY,store=rust(binary,resolve(out,'store'));const cases=[];
try{
 const ws=await store.call('load_workspace'),globalToken={sessionId:ws.access.sessionId,epoch:ws.access.epoch,noteEpoch:null};
 const note=await store.call('workspace_action',{action:{type:'createNote'},expected:globalToken}),token={...globalToken,noteEpoch:0},date=1793721599123;
 const op=await store.call('store_attachment_operation',{operationId:randomUUID(),noteId:note.id,name:'独审授权.webm',mime:'audio/webm',data:Buffer.from('independent authority synthetic bytes').toString('base64'),recordedAt:date,expected:token});
 const id=op.attachment.id,before=await store.call('load_workspace');
 for(const bad of [{...token,sessionId:randomUUID()},{...token,noteEpoch:999},{...token,noteEpoch:null}]){
  await assert.rejects(store.call('read_attachment',{id,expected:bad}),e=>e.code==='access_changed');cases.push({name:'unauthorized read rejects before returning date or bytes',tokenVariant:bad.noteEpoch===0?'wrong session':String(bad.noteEpoch)});
  assert.deepEqual(await store.call('load_workspace'),before);
 }
 const good=await store.call('read_attachment',{id,expected:token});assert.equal(good.recordedAt,date);assert.equal(good.data,Buffer.from('independent authority synthetic bytes').toString('base64'));
 const physical=await readFile(resolve(out,'store/attachments',op.attachment.relativePath));
 for(const invalid of [true,'1793721599123',1.5,-1,253402300800000]){
  await assert.rejects(store.call('store_attachment_operation',{operationId:randomUUID(),noteId:note.id,name:'invalid.webm',mime:'audio/webm',data:good.data,recordedAt:invalid,expected:token}));
  assert.deepEqual(await store.call('load_workspace'),before);assert.deepEqual(await readFile(resolve(out,'store/attachments',op.attachment.relativePath)),physical);cases.push({name:'invalid direct date rejects atomically',value:invalid});
 }
 await writeFile(resolve(out,'result.json'),JSON.stringify({status:'pass',binarySHA256:createHash('sha256').update(await readFile(binary)).digest('hex'),cases,authorizedDate:good.recordedAt,bytesSHA256:createHash('sha256').update(physical).digest('hex'),limits:'Exact independent CLI command routing mirrors lib.rs read_attachment: actual attachment_note -> Session.sensitive -> Store.read_attachment -> Session.tagged. CLI substitutes transport only; no Tauri macro/native permission or device claim.'},null,2)+'\n');console.log('Independent authorized read/direct invalid-date probes passed '+cases.length+' cases.');
}finally{await writeFile(resolve(out,'transport.json'),JSON.stringify(store.log,null,2)+'\n');await store.close();}
