// Device-free policy tests; SQLite fixtures and Node VM only, no native app.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import vm from 'node:vm';
import {STORES,options,hash,priorEntity,readBaseline,canonicalBranch,validateBaselines,nativeSync,checkpoint,verifyBytes,boundedPoll,finishRecovery} from './account109-desktop-recovery.mjs';

const id='272b0013-7b6a-4729-88f0-a10e2fd48e43';
const attachmentIds=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64');
const bin=Buffer.from(Array.from({length:4096},(_,i)=>i%256));
function payload(title){return {note:{id,folderId:'default',title,plainText:title+'\n完整第二段 😀',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:title,marks:[{type:'bold'}]}]},{type:'paragraph',content:[{type:'text',text:'完整第二段 😀'}]},...attachmentIds.map(id=>({type:'attachment',attrs:{id}}))]},createdAt:123,updatedAt:456,pinned:false,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',sealed:null},attachments:[png,bin].map((bytes,i)=>({id:attachmentIds[i],noteId:id,kind:i?'file':'image',displayName:i?'account109.bin':'account109.png',mime:i?'application/octet-stream':'image/png',size:bytes.length,sha256:hash(bytes)}))};}
const heads=()=>['甲端并发版本：保留全部甲中文','乙端并发版本：保留全部乙中文'].map((title,i)=>({digest:String(i+1).repeat(64),payload:payload(title)}));
function prior(){return {kind:'real-account-two-native-desktops',status:'fail',finishedAt:'fixed',failure:{phase:'concurrent-offline',code:'NATIVE_TIMEOUT'},scenarios:{logout:'not-run'},lifecycle:[{close:{code:0}}],observations:[{kind:'convergence',label:'concurrent shared base',noteId:id}],statusTransitions:['a','b'].map(device=>({device,phase:'concurrent-offline',conflictCount:1,devices:[{current:false,connected:true}]}))};}
test('CLI confines recovery to original stores and fresh external evidence, no injection options',()=>{
  const argv=['--binary','/unit/native','--stores',STORES,'--output','/private/tmp/fresh-recovery','--prior-run','/private/tmp/account109-desktop-real-fixture-full02'];
  assert.equal(options(argv).stores,STORES);
  for(const extra of [['--token','secret'],['--binary','/duplicate'],['--eval','x']])assert.throws(()=>options([...argv,...extra]));
  assert.throws(()=>options(argv.map(v=>v===STORES?'/private/tmp/other':v)));
  assert.throws(()=>options(argv.map(v=>v==='/private/tmp/fresh-recovery'?STORES+'/nested':v)));
  assert.throws(()=>options(argv.map(v=>v==='/unit/native'?'relative':v)));
});
test('prior entity must be the sole recorded shared base with both connected preserved conflicts and closed children',()=>{
  assert.equal(priorEntity(prior()),id);
  for(const change of [p=>delete p.finishedAt,p=>p.lifecycle[0].close=null,p=>p.observations.push(p.observations[0]),p=>p.statusTransitions[1].conflictCount=2,p=>p.scenarios.logout='pass',p=>p.failure.code='OTHER']){const p=prior();change(p);assert.throws(()=>priorEntity(p));}
});
test('full branch comparison normalizes only IDs/revision/paths and rejects lost formatting, bodies and metadata',()=>{
  const original=payload('甲端并发版本：保留全部甲中文'),copy=structuredClone(original),newId='33333333-3333-4333-8333-333333333333';copy.note.id=newId;copy.note.revision=999;
  copy.attachments.forEach((a,i)=>{a.id=['44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'][i];a.noteId=newId;a.relativePath='physical-'+i;copy.note.document.content[2+i].attrs.id=a.id;});
  assert.equal(canonicalBranch(copy),canonicalBranch(original));
  for(const change of [p=>p.note.document.content[0].content[0].marks=[],p=>p.note.plainText+='lost',p=>p.note.updatedAt++,p=>p.note.paperStyle='grid',p=>p.attachments[0].mime='wrong',p=>p.attachments[0].sha256='a'.repeat(64)]){const bad=structuredClone(copy);change(bad);assert.notEqual(canonicalBranch(bad),canonicalBranch(original));}
  for(const change of [p=>p.attachments.pop(),p=>p.attachments[0].noteId=id,p=>p.note.document.content.pop(),p=>p.attachments.push({...p.attachments[0]}),p=>p.note.unknown='cannot-drop']){const bad=structuredClone(copy);change(bad);assert.throws(()=>canonicalBranch(bad));}
});
test('baseline requires both exact complete heads with original fixture descriptors, never substitutes invented digests',()=>{
  assert.equal(validateBaselines([{heads:heads()},{heads:heads()}],id)[0].digest,'1'.repeat(64));
  for(const change of [b=>b[0].heads.pop(),b=>b[1].heads[0].payload.note.document.content.shift(),b=>b[0].heads[0].digest='invented',b=>b[1].heads[1].payload.attachments[0].sha256='a'.repeat(64),b=>b[1].heads[0].payload.note.id='00000000-0000-4000-8000-000000000000']){const b=[{heads:heads()},{heads:heads()}];change(b);assert.throws(()=>validateBaselines(b,id));}
});
test('copied SQLite WAL evidence uses mode=ro/query_only, queries only target rows and leaves original bytes unchanged',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'account109-recovery-unit-')),source=resolve(root,'source');await mkdir(source);
  const data=heads();await writeFile(resolve(root,'fixture.json'),JSON.stringify(data));
  // Keep the fixture writer open and idle to retain a real committed WAL/SHM.
  const writer=spawn('python3',['-u','-c',String.raw`import sqlite3,json,sys
from pathlib import Path
root=Path(sys.argv[1]);heads=json.loads((root/'fixture.json').read_text())
c=sqlite3.connect(root/'source'/'notes.sqlite3')
c.execute('pragma journal_mode=wal');c.execute('pragma wal_autocheckpoint=0')
c.executescript('create table sync_heads(digest text,kind text,entity_id text,payload text,tombstone integer,redacted integer);create table notes(id text,body text);create table attachments(id text,body text);')
for h in heads:c.execute('insert into sync_heads values(?,?,?,?,0,0)',(h['digest'],'note',h['payload']['note']['id'],json.dumps(h['payload'])))
n=heads[0]['payload']['note'];c.execute('insert into notes values(?,?)',(n['id'],json.dumps(n)))
for a in heads[0]['payload']['attachments']:c.execute('insert into attachments values(?,?)',(a['id'],json.dumps(a)))
c.execute('insert into notes values(?,?)',('unrelated','not JSON: must not query'))
c.commit();print('ready',flush=True);sys.stdin.readline();c.close()`,root],{stdio:['pipe','pipe','pipe']});
  try{
    await once(writer.stdout,'data');
    const result=await readBaseline(source,resolve(root,'snapshot'),id);
    assert.equal(result.mode,'ro');assert(result.queryOnly&&result.originalFilesUnchanged);assert(result.originalFiles['notes.sqlite3-wal']);assert(result.originalFiles['notes.sqlite3-shm']);assert.deepEqual(result.heads,data);assert.equal(result.notes.length,1);assert.equal(result.attachments.length,2);
    const attempt=execFileSync('python3',['-c',"import sqlite3,sys;from pathlib import Path;c=sqlite3.connect(Path(sys.argv[1]).as_uri()+'?mode=ro',uri=True);c.execute('pragma query_only=on');\ntry:c.execute('delete from sync_heads');raise Exception('write unexpectedly allowed')\nexcept sqlite3.OperationalError:print('write rejected')",resolve(root,'snapshot','notes.sqlite3')],{encoding:'utf8'});assert.match(attempt,/write rejected/);
  }finally{writer.stdin.end('\n');await once(writer,'close');await rm(root,{recursive:true,force:true});}
});
test('fixed native conflicts/resolve use genuine current app access, with no arbitrary token/URL/command inputs',async()=>{
  const calls=[],access={sessionId:'actual-fixture-session',epoch:17};
  const app={evaluate:(expression,arg)=>vm.runInNewContext(expression,{arg,window:{__NOTES_DEBUG__:{execute:async()=>({result:{workspace:{access}}})},__TAURI_INTERNALS__:{invoke:async(name,payload)=>{calls.push(JSON.parse(JSON.stringify({name,...payload})));return {conflicts:[]};}}}})};
  await nativeSync(app,'conflicts');access.epoch=18;await nativeSync(app,'resolve',{entityId:id,digest:'1'.repeat(64),keepAll:true});
  assert.deepEqual(calls,[{name:'sync_command',command:{type:'conflicts'},expected:{sessionId:'actual-fixture-session',epoch:17}},{name:'sync_command',command:{type:'resolve',kind:'note',entityId:id,digest:'1'.repeat(64),keepAll:true},expected:{sessionId:'actual-fixture-session',epoch:18}}]);
  for(const [type,args] of [['join',{}],['conflicts',{token:'secret'}],['resolve',{entityId:id,digest:'invented',keepAll:true}],['resolve',{entityId:id,digest:'1'.repeat(64),keepAll:false}],['resolve',{entityId:id,digest:'1'.repeat(64),keepAll:true,expected:access}]])await assert.rejects(nativeSync(app,type,args));
  assert.equal(calls.length,2);
});
test('fixed trace checkpoints precede every evaluation and preserve exact failed operation without raw input',async()=>{
  const report={phase:'existing-conflict'},events=[];const trace=checkpoint(report,async()=>events.push({save:structuredClone(report)}),async row=>events.push(row));
  await trace('a','sync.conflicts',async()=>{assert.equal(report.lastOperation.event,'before');events.push({evaluated:true});});
  await assert.rejects(trace('b','sync.resolve',async()=>{throw Object.assign(new Error('raw token must not persist'),{code:'NATIVE_TIMEOUT'});}));
  assert.equal(report.lastOperation.operation,'sync.resolve');assert.equal(report.lastOperation.event,'failed');assert.equal(report.lastOperation.code,'NATIVE_TIMEOUT');assert(!JSON.stringify(events).includes('raw token'));assert(events.findIndex(e=>e.event==='before')<events.findIndex(e=>e.evaluated));
  await assert.rejects(trace('a','arbitrary eval body',async()=>{}));
});
test('raw attachment proof checks every file and production read, preserved metadata and missing rows',async()=>{
  const root=await realpath(await mkdtemp(resolve(tmpdir(),'account109-recovery-bytes-')));await mkdir(resolve(root,'attachments'));const rows=payload('fixture').attachments.map((a,i)=>({...a,relativePath:'blob'+i}));
  try{
    for(const [i,bytes] of [png,bin].entries())await writeFile(resolve(root,'attachments','blob'+i),bytes);
    const read=async a=>({data:(a.displayName.endsWith('.png')?png:bin).toString('base64')});
    const verified=await verifyBytes({directory:root},{attachments:rows},read);assert.equal(verified.length,2);
    await verifyBytes({directory:root},{attachments:rows},read,verified);
    await assert.rejects(verifyBytes({directory:root},{attachments:rows.slice(1)},read,verified));
    await assert.rejects(verifyBytes({directory:root},{attachments:rows},async()=>({data:Buffer.from('corrupt').toString('base64')}),verified));
    const changed=structuredClone(rows);changed[0].mime='wrong';await assert.rejects(verifyBytes({directory:root},{attachments:changed},read,verified));
    await writeFile(resolve(root,'attachments','blob0'),Buffer.alloc(png.length));await assert.rejects(verifyBytes({directory:root},{attachments:rows},read,verified));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('continuation polls only once per second and timeout remains bounded without retrying resolution',async()=>{
  let clock=0,calls=0;
  await assert.rejects(boundedPoll('heads',async()=>{calls++;return false;},3000,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),{code:'CONDITION_TIMEOUT:heads'});assert.equal(calls,3);assert.equal(clock,3000);
});
test('completion cannot pass until both required cases and all exact owned children close naturally',async()=>{
  for(const mode of ['ok','prior-fail','logout-not-run','cleanup-reject','forced']){
    const report={status:mode==='prior-fail'?'fail':'running',scenarios:{conflict:'pass',logout:mode==='logout-not-run'?'not-run':'pass'}},app={lifecycle:{naturalExit:false}},saved=[];
    await finishRecovery(report,[app],async a=>{assert.equal(report.status,mode==='prior-fail'?'fail':'running');if(mode==='cleanup-reject')throw Error('fixture');a.lifecycle.naturalExit=mode!=='forced';},async()=>saved.push(report.status));
    assert.equal(report.status,mode==='ok'?'pass':'fail');assert.deepEqual(saved,[report.status]);
  }
});
