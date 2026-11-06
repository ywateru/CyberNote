#!/usr/bin/env node
// Real, independently persisted Rust processes and production sockets. No network fake.
import {pathToFileURL,fileURLToPath} from 'node:url';
const {rustBackend}=await import(pathToFileURL(resolve(process.cwd(),'scripts/debug/rust-backend.mjs')).href);
import {mkdir,readFile,writeFile,stat,readdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readdirSync,readFileSync} from 'node:fs';
const [binary,output]=process.argv.slice(2);if(!binary||!output)throw Error('binary output required');
await mkdir(output,{recursive:false});
const began=performance.now(),processes=[],checks=[],events=[],commandRetries=[];
const fingerprint=()=>{
 const hash=createHash('sha256'),files=[];
 for(const dir of ['src-tauri/src','scripts/debug/rust'])for(const file of readdirSync(dir,{recursive:true,withFileTypes:true}))if(file.isFile())files.push(resolve(file.parentPath,file.name));
 files.push(resolve('scripts/debug/build-rust-attachments.mjs'),resolve('src-tauri/Cargo.toml'),resolve('src-tauri/Cargo.lock'));
 for(const file of files.sort()){hash.update(file);hash.update('\0');hash.update(readFileSync(file));hash.update('\0')}return hash.digest('hex');
};
const sourceBefore=fingerprint();
const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
function check(name,truth){if(!truth)throw Error(name);checks.push(name);console.log('PASS '+name)}
async function eventually(name,predicate,ms=18000){const until=performance.now()+ms;while(performance.now()<until){if(await predicate()){check(name,true);return}await delay(130)}throw Error('Timed out: '+name)}
class Device {
 async open(name,root){this.name=name;this.root=root;this.backend=await rustBackend(binary,root,{timeoutMs:35000,closeTimeoutMs:10000});this.protected=[];this.blocked=false;this.queue=[];this.errors=[];this.closed=false;this.pumping=false;processes.push(this);await this.workspace();this.timer=setInterval(()=>this.pump(),80);return this;}
 async call(command,args={}){const row=await this.backend.call(command,args);this.queue.push(...row.events);if(!row.ok)throw Object.assign(Error(row.error.message),{code:row.error.code});return row.value;}
 expected(note){return{sessionId:this.access.sessionId,epoch:this.access.epoch,...(note?{noteEpoch:this.access.notes[note]?.epoch}:{} )}}
 async workspace(){const w=await this.call('load_workspace');this.access=w.access;return w;}
 async sync(command){for(let attempt=0;attempt<3;attempt++){await this.workspace();try{return await this.call('sync_command',{command,expected:this.expected()})}catch(error){if(error.code!=='access_changed'||attempt===2)throw error;commandRetries.push({device:this.name,command:command.type,code:error.code,attempt:attempt+1});await delay(20)}}}
 async pump(){if(this.closed||this.pumping)return;this.pumping=true;try{await this.call('poll_events');while(this.queue.length){const e=this.queue.shift();events.push({device:this.name,name:e.name,payload:e.payload});if(e.name==='notes-access'){const access=e.payload.access;if(access.sessionId!==this.access.sessionId)throw Error('Foreign access session');if(access.epoch>=this.access.epoch)this.access=access;if(e.payload.phase==='prepare')await this.call('acknowledge_access',{operationId:e.payload.operationId,success:true});continue}if(e.name!=='notes-sync')continue;const p=e.payload;if(p.sessionId!==this.access.sessionId)throw Error('Foreign session event');if(p.phase==='probe')await this.call('sync_window_reply',{expected:this.expected(),reply:{phase:'probe',operationId:p.operationId,protectedNoteIds:this.protected,blocked:this.blocked}});if(p.phase==='prepare')await this.call('sync_window_reply',{expected:this.expected(),reply:{phase:'prepare',operationId:p.operationId,ready:!p.noteIds.some(id=>this.protected.includes(id))&&!this.blocked}});}}catch(e){this.errors.push(e.code||e.message)}finally{this.pumping=false}}
 async action(action){const result=await this.call('workspace_action',{action,expected:this.expected()});await this.workspace();return result;}
 async barrier(action){await this.workspace();const result=await this.call('workspace_action',{action,expected:this.expected()});await this.workspace();return result;}
 async create(text,folderId){const note=await this.action({type:'createNote',...(folderId?{folderId}:{})});await this.save(note.id,text);return note.id;}
 async save(id,text,extra=[]){const w=await this.workspace(),n=w.notes.find(n=>n.id===id);const intent=randomUUID();await this.call('register_save_intent',{noteId:id,intent,expected:this.expected(id)});const document={type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]},...extra]};await this.call('workspace_action',{action:{type:'saveNote',id,revision:n.revision,document,saveIntent:intent},expected:this.expected(id)});await this.workspace();}
 async note(id){return (await this.workspace()).notes.find(n=>n.id===id)}
 async kill(){this.closed=true;clearInterval(this.timer);while(this.pumping)await delay(10);process.kill(this.backend.pid,'SIGKILL');await eventually(this.name+' SIGKILL observed',()=>this.backend.lifecycle.exit?.signal==='SIGKILL',5000);}
 async close(){if(this.closed)return;this.closed=true;clearInterval(this.timer);while(this.pumping)await delay(10);await this.backend.close();check(this.name+' owned Rust process exited naturally',this.backend.lifecycle.exit?.code===0&&!this.backend.lifecycle.exit?.signal)}
}
let failure=null;
try{
 const a=await new Device().open('A',resolve(output,'A'));const b=await new Device().open('B',resolve(output,'B'));
 const initial=await a.sync({type:'status'});check('status is disabled and omits optional nulls',initial.status.state==='disabled'&&!('workspaceId'in initial.status)&&!('invitation'in initial));
 let noIdentity=false;try{await stat(resolve(a.root,'.sync/identity-v1.json'))}catch(e){noIdentity=e.code==='ENOENT'}check('status does not generate Noise identity',noIdentity);
 const host=await a.sync({type:'startHost',deviceName:'Synthetic A',port:0});const endpoint=host.status.listenAddress.replace('0.0.0.0','127.0.0.1');const invitation=(await a.sync({type:'createInvite',endpoint})).invitation;
 await b.sync({type:'pair',invitation,deviceName:'Synthetic B'});
 check('two independent SQLite stores adopt authenticated workspace',(await b.sync({type:'status'})).status.workspaceId===host.status.workspaceId&&a.backend.pid!==b.backend.pid);
 const folder=await a.action({type:'createFolder',name:'Network folder'});const smart=await a.action({type:'createSmartFolder',input:{name:'Network pinned',query:{version:1,combine:'all',rules:[{type:'pinned',value:true}]}}});
 const nid=await a.create('A initial',folder.id);
 await eventually('A note, ordinary and smart folders arrive over real socket',async()=>{const w=await b.workspace();return w.notes.some(n=>n.id===nid&&n.plainText==='A initial')&&w.folders.some(f=>f.id===folder.id)&&w.folders.some(f=>f.id===smart.id)});
 await b.save(nid,'B edited');await eventually('B edit converges back to A',async()=>(await a.note(nid))?.plainText==='B edited');
 const bytes=Buffer.alloc(163840);for(let i=0;i<bytes.length;i++)bytes[i]=(i*31)%251;
 const media=await a.call('store_attachment_operation',{operationId:randomUUID(),noteId:nid,name:'synthetic.png',mime:'image/png',data:bytes.toString('base64'),expected:a.expected(nid)});
 const attachment=media.attachment;check('production media journal returns attachment metadata',!!attachment?.id);
 await a.save(nid,'A image',[{type:'attachment',attrs:{id:attachment.id,kind:'image',name:'synthetic.png'}}]);
 await eventually('multi-frame media metadata is projected remotely',async()=>(await b.workspace()).attachments.some(x=>x.id===attachment.id));
 const read=await b.call('read_attachment',{id:attachment.id,expected:b.expected(nid)});check('remote immutable blob bytes match exact source',Buffer.from(read.data,'base64').equals(bytes));
 // A protected recording/picker owner is reported through the real quiet API.
 a.protected=[nid];await b.save(nid,'Remote held update');
 await eventually('protected target remains durably pending',async()=>{const status=(await a.sync({type:'status'})).status;return status.pendingCount>0&&(await a.note(nid)).plainText==='A image'});
 const other=await b.create('Independent B');await eventually('unrelated note applies while owner remains protected',async()=>(await a.note(other))?.plainText==='Independent B');
 a.protected=[];await eventually('owner update applies after normal protection release',async()=>(await a.note(nid))?.plainText==='Remote held update');
 await b.barrier({type:'lockNote',id:other,password:'synthetic-password'});await eventually('remote lock revokes note authorization',async()=>{const n=await a.note(other);return n?.locked&&a.access.notes[other]?.authorized===false});
 await a.action({type:'unlockNote',id:other,password:'synthetic-password'});check('remote ciphertext unlocks with original password',(await a.note(other)).plainText==='Independent B');
 await b.barrier({type:'deleteNote',id:nid});await eventually('remote delete is projected and access revoked',async()=>!!(await a.note(nid))?.deletedAt&&!a.access.notes[nid]?.authorized);
 await a.action({type:'restoreNote',id:nid});await eventually('restore causally supersedes old deletion',async()=>!(await b.note(nid))?.deletedAt);
 await a.sync({type:'stop'});await b.sync({type:'stop'});await delay(350);
 check('stop persists paused and closes listener',(await a.sync({type:'status'})).status.state==='paused');
 await a.save(nid,'Offline A');await b.save(nid,'Offline B');
 // Restart both at the same independent persisted roots. Stop remains paused.
 const ar=a.root,br=b.root;await a.close();await b.close();const a2=await new Device().open('A-restart',ar),b2=await new Device().open('B-restart',br);
 check('cold restart preserves paused identity',(await a2.sync({type:'status'})).status.state==='paused'&&(await b2.sync({type:'status'})).status.state==='paused');
 await a2.sync({type:'resume'});await b2.sync({type:'resume'});
 await eventually('offline same-entity edits retain concurrent conflict heads',async()=>(await a2.sync({type:'conflicts'})).conflicts.some(c=>c.entityId===nid)&&(await b2.sync({type:'conflicts'})).conflicts.some(c=>c.entityId===nid));
 const variants=(await a2.sync({type:'conflicts'})).conflicts.find(c=>c.entityId===nid).variants;
 await a2.sync({type:'resolve',kind:'note',entityId:nid,digest:variants[0].digest,keepAll:true});
 await eventually('explicit keep-all resolution converges and retains a copy',async()=>{const ca=(await a2.sync({type:'conflicts'})).conflicts;const cb=(await b2.sync({type:'conflicts'})).conflicts;const w=await b2.workspace();return !ca.some(c=>c.entityId===nid)&&!cb.some(c=>c.entityId===nid)&&w.notes.filter(n=>/^Offline [AB]$/.test(n.plainText)).length>=2});
 // Repeated inventories and wakeups must not generate new revisions.
 const rev=(await a2.note(nid)).revision;for(let i=0;i<100;i++)await b2.sync({type:'syncNow'});await delay(2400);check('100 repeat wakeups preserve note revision',(await a2.note(nid)).revision===rev);
 // A third independent Store proves forwarding uses persisted heads, not a
 // direct two-process-only exchange.
 const forwarded=await new Device().open('C-forward',resolve(output,'C'));
 await forwarded.sync({type:'pair',deviceName:'Synthetic C',invitation:(await a2.sync({type:'createInvite',endpoint})).invitation});
 await eventually('third device receives transitive heads and blobs',async()=>(await forwarded.note(nid))?.plainText===(await b2.note(nid))?.plainText&&(await forwarded.workspace()).notes.length===(await b2.workspace()).notes.length);
 const fromC=await forwarded.create('C forwarded');await eventually('C edit forwards through host to B',async()=>(await b2.note(fromC))?.plainText==='C forwarded');
 // A protected durable inbox survives a real process SIGKILL and new Session.
 a2.protected=[nid];await b2.save(nid,'Durable before SIGKILL');
 await eventually('pre-crash pending inbox is durable while target is protected',async()=>(await a2.sync({type:'status'})).status.pendingCount>0&&(await a2.note(nid))?.plainText!=='Durable before SIGKILL');
 await a2.kill();const a3=await new Device().open('A-SIGKILL-restart',ar);await b2.sync({type:'syncNow'});
 await eventually('same-directory SIGKILL restart safely applies durable inbox',async()=>(await a3.note(nid))?.plainText==='Durable before SIGKILL');
 // The terminal purge must remain terminal against an old offline device.
 await forwarded.sync({type:'stop'});await b2.barrier({type:'deleteNote',id:fromC});await b2.barrier({type:'purgeNote',id:fromC});
 await eventually('purge projects to connected peer without resurrecting rows',async()=>!(await a3.note(fromC)));
 await forwarded.sync({type:'resume'});await eventually('old offline device consumes purge tombstone',async()=>!(await forwarded.note(fromC)));
 const mediaNote=await a3.create('Concurrent media base');await eventually('media base arrives before independent offline edits',async()=>!!(await b2.note(mediaNote)));
 // Plain media and locked text versions each retain independent concurrent heads.
 await a3.action({type:'unlockNote',id:other,password:'synthetic-password'});await b2.action({type:'unlockNote',id:other,password:'synthetic-password'});
 await a3.sync({type:'stop'});await b2.sync({type:'stop'});await forwarded.sync({type:'stop'});
 const wav=Buffer.alloc(16044);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 const audio=await a3.call('store_attachment_operation',{operationId:randomUUID(),noteId:mediaNote,name:'synthetic.wav',mime:'audio/wav',data:wav.toString('base64'),recordedAt:Date.now(),expected:a3.expected(mediaNote)});
 const image=await b2.call('store_attachment_operation',{operationId:randomUUID(),noteId:mediaNote,name:'branch.png',mime:'image/png',data:bytes.toString('base64'),expected:b2.expected(mediaNote)});
 await a3.save(mediaNote,'Audio branch',[{type:'attachment',attrs:{id:audio.attachment.id,kind:'audio',name:'synthetic.wav'}}]);
 await b2.save(mediaNote,'Image branch',[{type:'attachment',attrs:{id:image.attachment.id,kind:'image',name:'branch.png'}}]);
 await a3.save(other,'Locked A branch');await b2.save(other,'Locked B branch');
 await a3.sync({type:'resume'});await b2.sync({type:'resume'});
 await eventually('plain image and audio branches are retained as concurrent heads',async()=>{const c=(await a3.sync({type:'conflicts'})).conflicts.find(c=>c.entityId===mediaNote);return c?.variants.length===2&&c.variants.every(v=>!v.locked&&v.attachmentCount===1)});
 const mediaVersions=(await a3.sync({type:'conflicts'})).conflicts.find(c=>c.entityId===mediaNote).variants;
 await a3.sync({type:'resolve',kind:'note',entityId:mediaNote,digest:mediaVersions[0].digest,keepAll:true});
 await eventually('plain audio and image copies retain separate attachment owners',async()=>{const w=await b2.workspace();return w.notes.filter(n=>['Audio branch','Image branch'].includes(n.plainText)).length===2&&w.attachments.some(a=>a.kind==='audio'&&a.recordedAt)});
 await eventually('locked text concurrent heads survive transport',async()=>(await a3.sync({type:'conflicts'})).conflicts.find(c=>c.entityId===other)?.variants.length===2);
 const lockedVersions=(await a3.sync({type:'conflicts'})).conflicts.find(c=>c.entityId===other).variants;
 await a3.sync({type:'resolve',kind:'note',entityId:other,digest:lockedVersions[0].digest,keepAll:true});
 await eventually('locked keep-all copies reach remote Store',async()=>(await b2.workspace()).notes.filter(n=>n.locked).length>=2);
 const encryptedCopies=(await b2.workspace()).notes.filter(n=>n.locked);
 for(const copy of encryptedCopies)await b2.action({type:'unlockNote',id:copy.id,password:'synthetic-password'});
 check('every locked text keep-all copy decrypts without losing branches',encryptedCopies.every(copy=>b2.access.notes[copy.id]?.authorized));
 const c=await new Device().open('Bad-auth',resolve(output,'bad-auth'));
 const token=(await a3.sync({type:'createInvite',endpoint})).invitation;const decoded=JSON.parse(Buffer.from(token.slice('notes-sync-v1:'.length),'base64url').toString());decoded.psk=Buffer.alloc(32,6).toString('base64url');let bad=false;try{await c.sync({type:'pair',deviceName:'Bad',invitation:'notes-sync-v1:'+Buffer.from(JSON.stringify(decoded)).toString('base64url')})}catch{bad=true}check('wrong Noise key is rejected without enabling business Store',bad&&!(await c.sync({type:'status'})).status.workspaceId);
 // Prepared identity survives authenticated adoption failure and cold restart.
 const pending=await new Device().open('Prepared-adoption',resolve(output,'prepared'));
 const pn=await pending.create('Local before pairing');
 const pm=await pending.call('store_attachment_operation',{operationId:randomUUID(),noteId:pn,name:'local.png',mime:'image/png',data:bytes.toString('base64'),expected:pending.expected(pn)});
 await pending.save(pn,'Local before pairing',[{type:'attachment',attrs:{id:pm.attachment.id,kind:'image',name:'local.png'}}]);
 const localPath=resolve(pending.root,'attachments',pm.attachment.relativePath);const localBytes=await readFile(localPath);await unlink(localPath);
 let adoptionFailed=false;try{await pending.sync({type:'pair',deviceName:'Prepared',invitation:(await a3.sync({type:'createInvite',endpoint})).invitation})}catch{adoptionFailed=true}
 check('authenticated Prepared failure does not bootstrap business Store',adoptionFailed&&!(await pending.sync({type:'status'})).status.workspaceId);
 await writeFile(localPath,localBytes);const preparedRoot=pending.root;await pending.close();
 const recovered=await new Device().open('Prepared-recovered',preparedRoot);
 await eventually('cold restart recovers Prepared credentials and adopts idempotently',async()=>(await recovered.sync({type:'status'})).status.workspaceId===(await a3.sync({type:'status'})).status.workspaceId);
 await eventually('adopted preexisting local note and media sync without loss',async()=>(await a3.note(pn))?.plainText==='Local before pairing'&&(await a3.workspace()).attachments.some(a=>a.id===pm.attachment.id));
 // Explicitly enabled other workspace must never be silently mixed.
 const isolated=await new Device().open('Other-workspace',resolve(output,'other-workspace'));
 const isolatedStatus=(await isolated.sync({type:'startHost',deviceName:'Other',port:0})).status;
 let mismatch=false;try{await isolated.sync({type:'pair',deviceName:'Other',invitation:(await a3.sync({type:'createInvite',endpoint})).invitation})}catch(e){mismatch=e.code==='sync_workspace_mismatch'}
 check('already enabled other workspace rejects pair without adopting',mismatch&&(await isolated.sync({type:'status'})).status.workspaceId===isolatedStatus.workspaceId);
 check('real quiet events contain probe, prepare and commit receipts',events.some(e=>e.payload.phase==='probe')&&events.some(e=>e.payload.phase==='prepare')&&events.some(e=>e.payload.phase==='release'&&e.payload.outcome==='commit'));
 check('no async transport errors',processes.every(p=>p.errors.length===0));
}catch(e){failure={message:e.message,stack:e.stack};console.error(e.stack)}
finally{for(const p of processes)if(!p.closed){try{await p.close()}catch(e){failure||={message:e.message,stack:e.stack}}}
 await writeFile(resolve(output,'events.json'),JSON.stringify(events,null,2));
 await writeFile(resolve(output,'status.json'),JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceBefore,sourceAfter:fingerprint(),binary:{path:resolve(binary),sha256:createHash('sha256').update(await readFile(binary)).digest('hex')},driver:{path:fileURLToPath(import.meta.url),sha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),variant:'original check-sync.mjs assertions; only access_changed sync commands refetch Token, max3 attempts'},commandRetries,checks,events:events.length,processes:processes.map(p=>({name:p.name,root:p.root,...p.backend.lifecycle,errors:p.errors})),wallMs:Math.round(performance.now()-began),failure},null,2));
}
if(failure)process.exitCode=1;
