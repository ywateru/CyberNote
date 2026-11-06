#!/usr/bin/env node
// Exact current Session/Store, fresh directories, no in-memory backend fallback.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, stat, lstat, readdir, chmod, symlink, unlink, utimes } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rustBackend } from './debug/rust-backend.mjs';
const binary = resolve(process.argv[2] || '');
const output = resolve(process.argv[3] || '');
if (!process.argv[2] || !process.argv[3]) throw Error('binary and fresh output directory required');
await mkdir(output);
const started = performance.now();
const results = [], processes = [];
let backend, workspace;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (name, fn) => { fn(); results.push({ name, pass:true }); };
const checkAsync = async (name, fn) => { await fn(); results.push({name,pass:true}); };
async function open(name) {
  backend = await rustBackend(binary, join(output,name));
  processes.push(backend);
  workspace = await value('load_workspace');
  return backend;
}
async function value(command,args={}) {
  const row = await backend.call(command,args);
  if (!row.ok) throw Error(`${command}: ${JSON.stringify(row.error)}`);
  if (row.value?.access) workspace = row.value;
  return row.value;
}
const token = noteId => ({ sessionId:workspace.access.sessionId, epoch:workspace.access.epoch, noteEpoch:noteId ? workspace.access.notes[noteId].epoch : null });
async function reject(command,args,name,code) {
  const row = await backend.call(command,args);
  check(name,()=>{assert.equal(row.ok,false); if (code) assert.equal(row.error.code,code);});
}
const root = join(output,'source');
const exportPath = name => join(output,name);
const images = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+FsAAAAASUVORK5CYII=','base64');
const wav = Buffer.alloc(44+1600);
wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
for(let i=44;i<wav.length;i+=2) wav.writeInt16LE(Math.round(Math.sin(i/17)*3000),i);
const media = [
 {name:'原图-79.png', mime:'image/png',bytes:images},
 {name:'录音-79.wav',mime:'audio/wav',bytes:wav,recordedAt:1793952000123},
 {name:'video79.mp4',mime:'video/mp4',bytes:Buffer.from('BINARY_LOCAL_ONLY_79\0video\xff\xfe')},
 {name:'original79.bin',mime:'application/octet-stream',bytes:Buffer.from(Array.from({length:768},(_,i)=>i%256))},
];
try {
 await open('source');
 const created=await value('workspace_action',{action:{type:'createNote'},expected:token()});
 const noteId=created.id;
 for (const item of media) {
   const attachment=await value('store_attachment_operation',{noteId,operationId:randomUUID(),name:item.name,mime:item.mime,data:item.bytes.toString('base64'),recordedAt:item.recordedAt??null,expected:token(noteId)});
   item.attachment=attachment.attachment;
 }
 const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'数据管理79合成笔记'}]},...media.map(item=>({type:'attachment',attrs:{id:item.attachment.id,kind:item.attachment.kind,name:item.name}}))]};
 const saveIntent=randomUUID();
 await value('register_save_intent',{noteId,intent:saveIntent,expected:token(noteId)});
 await value('workspace_action',{action:{type:'saveNote',id:noteId,revision:0,document:doc,saveIntent}});
 const inventory=await value('get_data_management',{expected:token()});
 await writeFile(join(output,'inventory-initial.json'),JSON.stringify(inventory,null,2)+'\n');
 check('tagged v1 Session inventory and original owner, no document/title disclosure',()=>{
   assert.equal(inventory.version,1);assert.ok(inventory.access.sessionId);assert.ok(inventory.metadata.sessionId);assert.equal(inventory.counts.attachments,4);assert.equal(inventory.counts.notes,1);
   assert.ok(!JSON.stringify(inventory.files).includes('数据管理79合成笔记'));assert.ok(!inventory.files.some(file=>'document' in file || 'title' in file));
 });
 for (const name of ['notes.sqlite3','notes.sqlite3-wal','notes.sqlite3-shm']) {
   const row=inventory.files.find(file=>file.relativePath===name), actual=await stat(join(root,name));
   check('actual filesystem size and mtime '+name,()=>{assert.equal(row.status,'file');assert.equal(row.size,actual.size);assert.equal(row.modifiedAt,Math.floor(actual.mtimeMs));});
 }
 for (const item of media) {
   const relative='attachments/'+item.attachment.relativePath;
   check('independent original file '+item.mime,()=>assert.equal(inventory.files.find(file=>file.relativePath===relative).attachment.referenced,true));
   await checkAsync('exact original bytes outside SQLite '+item.mime,async()=>assert.deepEqual(await readFile(join(root,relative)),item.bytes));
   const target=exportPath('export-'+item.name);
   const info=await value('export_attachment',{id:item.attachment.id,path:target,expected:token(noteId)});
   await checkAsync('original byte export '+item.mime,async()=>{assert.deepEqual(await readFile(target),item.bytes);assert.deepEqual(info,{name:item.name,bytes:item.bytes.length,mime:item.mime});});
 }
 const noBlob=JSON.parse(execFileSync('python3',['-c',`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); rows=list(c.execute('select typeof(body),body from attachments')); operations=list(c.execute('select typeof(attachment),attachment from attachment_operations')); print(json.dumps({'rows':rows,'operations':operations,'columns':list(c.execute('pragma table_info(attachments)'))}))`,join(root,'notes.sqlite3')],{encoding:'utf8'}));
 check('SQLite contains text metadata only and no media payload/BLOB column',()=>{
   assert.equal(noBlob.rows.length,4);for(const [kind,body] of [...noBlob.rows,...noBlob.operations]){assert.equal(kind,'text');const record=JSON.parse(body);assert.ok(!('data'in record));assert.ok(!('bytes'in record));assert.ok(!('blob'in record));for(const item of media)assert.ok(!body.includes(item.bytes.toString('base64')));}
   assert.ok(noBlob.columns.every(row=>!String(row[2]).toLowerCase().includes('blob')));
 });
 const a=media[0].attachment;
 for(const target of [join(root,'notes.sqlite3'),join(root,'notes.sqlite3-wal'),join(root,'notes.sqlite3-shm'),join(root,'attachments','new.png'),join(root,'.imports','new.png'),join(root,'other79.json')]) {
   await reject('export_attachment',{id:a.id,path:target,expected:token(noteId)},'reject managed output '+target.split('/').slice(-2).join('/'));
 }
 const alias=join(output,'source-alias');await symlink(root,alias);
 await reject('export_attachment',{id:a.id,path:join(alias,'notes.sqlite3'),expected:token(noteId)},'reject canonical alias into live data root');
 const outside=join(output,'do-not-change.png');await writeFile(outside,'keep original');const link=join(output,'target-link.png');await symlink(outside,link);
 await reject('export_attachment',{id:a.id,path:link,expected:token(noteId)},'reject symlink destination');
 check('symlink target untouched',()=>{});assert.equal(await readFile(outside,'utf8'),'keep original');
 await reject('export_attachment',{id:'missing79',path:exportPath('unknown.png'),expected:token(noteId)},'unknown ID refuses export','not_found');
 await reject('export_attachment',{id:a.id,path:join(output,'no-parent','x'),expected:token(noteId)},'missing parent write failure');
 await reject('export_attachment',{id:a.id,path:output,expected:token(noteId)},'directory output refused');
 const readOnly=join(output,'read-only');await mkdir(readOnly);await chmod(readOnly,0o500);
 try { await reject('export_attachment',{id:a.id,path:join(readOnly,'x.png'),expected:token(noteId)},'OS write permission failure'); } finally {await chmod(readOnly,0o700);}
 const kept=join(output,'kept-output.png');await writeFile(kept,'existing bytes must survive');
 const source=join(root,'attachments',a.relativePath);const originalMtime=(await stat(source)).mtimeMs;
 await writeFile(source,Buffer.concat([images,Buffer.from('corrupt')]));
 const mismatch=await value('get_data_management',{expected:token()});
 check('size mismatch is actual size, warning and nonexportable',()=>{const row=mismatch.files.find(file=>file.attachment?.id===a.id);assert.equal(row.size,images.length+7);assert.equal(row.attachment.exportable,false);assert.ok(mismatch.warnings.some(w=>w.includes('大小不符')));});
 await reject('export_attachment',{id:a.id,path:kept,expected:token(noteId)},'size mismatch refuses successful export');
 check('failed export preserves preexisting destination',()=>{});assert.equal(await readFile(kept,'utf8'),'existing bytes must survive');
 await unlink(source);
 const missing=await value('get_data_management',{expected:token()});
 check('missing registered attachment remains listed with count',()=>{const row=missing.files.find(file=>file.attachment?.id===a.id);assert.equal(row.status,'missing');assert.equal(row.exists,false);assert.equal(row.size,null);assert.equal(missing.counts.missingAttachments,1);});
 await reject('export_attachment',{id:a.id,path:kept,expected:token(noteId)},'missing original refuses export');
 await symlink(outside,source);
 const symlinked=await value('get_data_management',{expected:token()});
 check('managed symlink reported and never followed or counted',()=>{const row=symlinked.files.find(file=>file.attachment?.id===a.id);assert.equal(row.status,'symlink');assert.equal(row.size,null);assert.equal(row.attachment.exportable,false);});
 await reject('export_attachment',{id:a.id,path:kept,expected:token(noteId)},'managed source symlink refuses export');
 await reject('export_archive',{path:exportPath('symlink.notesbackup'),expected:token()},'archive also refuses source symlink');
 await unlink(source);await writeFile(source,images);const knownMtime=new Date('2021-03-04T05:06:07.000Z');await utimes(source,knownMtime,knownMtime);
 await mkdir(join(root,'runtime','empty'),{recursive:true});await writeFile(join(root,'runtime','cache79.bin'),Buffer.alloc(321,3));await writeFile(join(root,'attachments','unregistered79.bin'),Buffer.alloc(123,4));await mkdir(join(root,'.imports'),{recursive:true});await writeFile(join(root,'.imports','foreign79'),Buffer.alloc(19,7));
 const external=join(output,'external-dir');await mkdir(external);await writeFile(join(external,'private.txt'),'do not inspect');await symlink(external,join(root,'runtime','external-link'));
 const full=await value('get_data_management',{expected:token()});await writeFile(join(output,'inventory-full.json'),JSON.stringify(full,null,2)+'\n');
 check('actual old filesystem mtime, not now',()=>assert.equal(full.files.find(file=>file.attachment?.id===a.id).modifiedAt,knownMtime.getTime()));
 check('untracked media and empty runtime directory are visible',()=>{assert.equal(full.files.find(file=>file.relativePath==='attachments/unregistered79.bin').attachment,undefined);assert.equal(full.files.find(file=>file.relativePath==='runtime/empty').status,'directory');assert.equal(full.files.find(file=>file.relativePath==='runtime/cache79.bin').size,321);assert.equal(full.files.find(file=>file.relativePath==='.imports/foreign79').category,'import');});
 check('external symlink not descended',()=>{assert.equal(full.files.find(file=>file.relativePath==='runtime/external-link').status,'symlink');assert.ok(!full.files.some(file=>file.relativePath.includes('private.txt')));});
 const actualRows=full.files.filter(file=>file.size!==null);
 check('all file totals equal per-path actual stat lengths, dirs and symlinks excluded',()=>{assert.equal(full.totals.totalBytes,actualRows.reduce((n,file)=>n+file.size,0));assert.equal(full.counts.physicalFiles,actualRows.length);assert.equal(full.totals.attachmentBytes,media.reduce((n,item)=>n+item.bytes.length,0)+123);assert.equal(full.totals.declaredAttachmentBytes,media.reduce((n,item)=>n+item.bytes.length,0));assert.equal(full.totals.otherBytes,321+19);});
 await reject('get_data_management',{expected:{...token(),epoch:999999}},'global stale token refuses inventory','access_changed');
 const beforeStageRows=await readdir(root);
 for(const kind of ['attachment','archive','import']) {
   const stage=await value('debug_stage_document',{kind,id:a.id,expected:kind==='attachment'?token(noteId):token()});
   await checkAsync('host staging scoped cleanup '+kind,async()=>{await assert.rejects(stat(stage.path));await assert.rejects(stat(dirname(stage.path)));});
 }
 await checkAsync("inventory leaves foreign import entry untouched",async()=>assert.equal((await readFile(join(root,".imports","foreign79"))).length,19));
 // Only remove this runner-owned invalid recovery fixture before reopening.
 await unlink(join(root,".imports","foreign79"));
 const stale=token(noteId), oldPid=backend.pid, oldSession=workspace.access.sessionId;
 await backend.close();
 await open('source');
 check('new PID and Session identity after real reopen',()=>{assert.notEqual(backend.pid,oldPid);assert.notEqual(workspace.access.sessionId,oldSession);assert.equal(workspace.notes[0].document.content.length,5);});
 await reject('export_attachment',{id:a.id,path:kept,expected:stale},'previous PID token cannot export','access_changed');
 const reopened=await value('get_data_management',{expected:token()});
 check('new PID recovers media inventory and old mtime',()=>{assert.equal(reopened.counts.attachments,4);assert.equal(reopened.files.find(file=>file.attachment?.id===a.id).modifiedAt,knownMtime.getTime());});
 const archive=exportPath('all-media.notesbackup');await value('export_archive',{path:archive,expected:token()});
 const archiveBytes=await readFile(archive);const parsed=JSON.parse(archiveBytes);
 check('complete archive contains four media originals and recordedAt',()=>{assert.equal(parsed.attachments.length,4);for(const item of media)assert.deepEqual(Buffer.from(parsed.blobs[item.attachment.id],'base64'),item.bytes);assert.equal(parsed.attachments.find(item=>item.kind==='audio').recordedAt,media[1].recordedAt);});
 const prepare=await value('debug_access_begin',{action:{type:'deleteNote',id:noteId},expected:token()});
 await reject('get_data_management',{expected:token()},'pending real access barrier blocks inventory','access_changed');
 await reject('export_attachment',{id:a.id,path:kept,expected:token(noteId)},'pending owner barrier blocks export','access_changed');
 await value('debug_access_ack',{operationId:prepare.operationId,success:false});
 await reject('debug_access_finish',{operationId:prepare.operationId},'failed participant ACK preserves source note','access_changed');
 workspace=await value('load_workspace');
 check('failed barrier leaves source note live',()=>assert.equal(workspace.notes.find(note=>note.id===noteId).deletedAt,null));
 const deletion=await value('debug_access_begin',{action:{type:'deleteNote',id:noteId},expected:token()});
 await value('debug_access_ack',{operationId:deletion.operationId,success:true});await value('debug_access_finish',{operationId:deletion.operationId});workspace=await value('load_workspace');
 await reject('export_attachment',{id:a.id,path:kept,expected:token(noteId)},'deleted owner refuses original export','access_changed');
 const revoked=await value('get_data_management',{expected:token()});
 check('unauthorized owner display names redacted and exports disabled',()=>{for(const row of revoked.files.filter(file=>file.attachment)){assert.equal(row.attachment.displayName,null);assert.equal(row.attachment.exportable,false);assert.equal(row.attachment.referenced,null);}});
 await backend.close();
 await open('target');
 const targetId=(await value('workspace_action',{action:{type:'createNote'},expected:token()})).id;
 const beforeBad=await value('load_workspace');
 const bad=exportPath('bad.notesbackup');await writeFile(bad,'{invalid');
 await reject('import_archive',{path:bad,expected:token()},'invalid archive preflight leaves target unchanged');
 const afterBad=await value('load_workspace');check('invalid import preserved existing note and access epoch',()=>{assert.deepEqual(afterBad.notes,beforeBad.notes);assert.equal(afterBad.access.epoch,beforeBad.access.epoch);});
 const imported=await value('import_archive',{path:archive,expected:token()});
 check('real Session preflight prepare ACK finish merged complete archive',()=>{assert.equal(imported.notes.length,2);assert.ok(imported.notes.some(note=>note.id===targetId));assert.equal(imported.attachments.length,4);});
 for(const item of media) {
   const copy=imported.attachments.find(file=>file.displayName===item.name);
   await checkAsync('fresh directory imported original '+item.mime,async()=>{assert.deepEqual(await readFile(join(output,'target','attachments',copy.relativePath)),item.bytes);assert.equal(copy.noteId,noteId);});
 }
 const reimported=await value('import_archive',{path:archive,expected:token()});
 check('second import resolves ID collisions with separate copies and preserves local note',()=>{assert.equal(reimported.notes.length,3);assert.equal(reimported.attachments.length,8);assert.ok(reimported.notes.some(note=>note.id===targetId));assert.equal(new Set(reimported.attachments.map(file=>file.id)).size,8);});
 for(const item of media) { const copies=reimported.attachments.filter(file=>file.displayName===item.name); await checkAsync('collision copies preserve original '+item.mime,async()=>{assert.equal(copies.length,2);for(const copy of copies)assert.deepEqual(await readFile(join(output,'target','attachments',copy.relativePath)),item.bytes);}); }
 await backend.close(); const previousPid=backend.pid;await open('target');
 check('new target process recovers imported metadata and settings',()=>{assert.notEqual(backend.pid,previousPid);assert.equal(workspace.attachments.length,8);assert.equal(workspace.notes.length,3);});
 for(const item of media) { const copy=workspace.attachments.find(file=>file.displayName===item.name);const path=exportPath('roundtrip-'+item.name);await value('export_attachment',{id:copy.id,path,expected:token(copy.noteId)});await checkAsync('new PID roundtrip re-export exact '+item.mime,async()=>assert.deepEqual(await readFile(path),item.bytes)); }
 await backend.close();
} catch(error) {
 results.push({name:'failure',pass:false,error:error.stack});process.exitCode=1;
} finally {
 for(const child of processes) {if(!child.lifecycle.closing)try{await child.close();}catch(error){results.push({name:'natural process exit',pass:false,error:error.stack});process.exitCode=1;}}
 const report={sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),binary,sha256:digest(await readFile(binary)),output,wallMs:Math.round(performance.now()-started),results,processes:processes.map(child=>({lifecycle:child.lifecycle,calls:child.calls}))};
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({pass:results.filter(row=>row.pass).length,fail:results.filter(row=>!row.pass).length,wallMs:report.wallMs,pids:processes.map(child=>child.pid),report:join(output,'report.json')}));
 if(process.exitCode)console.error(results.find(row=>!row.pass)?.error);
}
