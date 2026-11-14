import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {filesFor,hash,stable,semantic,reconstructOriginal,afterDirection,checkWorkspace,noForbiddenStaging,footprintProbes,validateFootprint,FiniteActions,parseOwnedArgs,richText} from './account110-owned-continuation.mjs';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sentinel='private-sentinel https://invalid.test credential';
function fixture(){
 const folders=[{id:'default',name:'default',createdAt:1},{id:'quick',name:'quick',createdAt:2},{id:'trash',name:'trash',createdAt:3}];
 const workspaces={a:{notes:[],folders:structuredClone(folders),attachments:[]},b:{notes:[],folders:structuredClone(folders),attachments:[]}};
 const prior={specimens:[],initialBusinessBaselines:['a','b'].map(device=>({device,notes:0,folders:3,attachments:0,semanticSha256:hash(JSON.stringify(stable({notes:[],folders,attachments:[]})))}))};
 for(const [i,label] of ['initial-a','initial-b','push-a','push-b'].entries()){
  const origin=label.at(-1),files=filesFor(label),id=uuid(i+1);const attachments=files.map((f,j)=>({id:uuid(10+i*2+j),noteId:id,kind:j?'file':'image',mime:f.mime,displayName:f.name,size:f.bytes.length,recordedAt:null,relativePath:uuid(10+i*2+j)}));
  const document={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:sentinel,marks:[{type:'bold'}]}]},...attachments.map(a=>({type:'attachment',attrs:{id:a.id}}))]};
  const note={id,document,title:sentinel,plainText:sentinel,folderId:'default',updatedAt:i+1,deletedAt:null,revision:1};
  prior.specimens.push({label,origin,semanticSha256:hash(JSON.stringify(stable(semantic(note)))),attachments:files.map(f=>({mime:f.mime,bytes:f.bytes.length,sha256:f.sha256}))});
  workspaces[origin].notes.push(note);workspaces[origin].attachments.push(...attachments);
 }
 for(const n of workspaces.a.notes){workspaces.b.notes.push(structuredClone(n));workspaces.b.attachments.push(...structuredClone(workspaces.a.attachments.filter(a=>a.noteId===n.id)));}
 return {prior,workspaces};
}
test('deterministic original bytes match all four exact pinned binary hashes',()=>{
 const hashes=['b9ce5a7ad5a7b9e3d623cef55d20d84e03519197c361e3e6d19f7f0e935c0dbb','e76a4a1f1e503974a097ff766af5ad95e7534232ac1725a0a6af4d41c54ba2ba','95e83e304adc8994d9f48856e0ef8550381b51d0e7ba11fda7f9589ce1ef6ce9','a7dc917f09ccee623f76bd23b2265fd57f8f0f9e22ebc4c62c5c337a05a2a4c0'];
 for(const [i,label] of ['initial-a','initial-b','push-a','push-b'].entries()){const f=filesFor(label);assert.equal(f[1].sha256,hashes[i]);assert.equal(f[0].sha256,'11f8a69f10d1f9296a6aa25c92b0b9b35d0b1fbc039211d59d2ffa55747a753f');}
 const news=['pull-a','pull-b','both-a','both-b','idle-a','idle-b','offline-a'].map(x=>filesFor(x)[1].sha256);assert.equal(new Set([...hashes,...news]).size,11);assert.throws(()=>filesFor(sentinel),{code:'INVALID_ARGUMENTS'});
});
test('original post-push expectation is reconstructed from source semantic pin, not receiver state',()=>{
 const {prior,workspaces}=fixture(),r=reconstructOriginal(prior,workspaces);assert.equal(r.expected.a.size,2);assert.equal(r.expected.b.size,4);checkWorkspace(workspaces.a,r.expected.a,r.folders.a);checkWorkspace(workspaces.b,r.expected.b,r.folders.b);
 const changed=structuredClone(workspaces);changed.b.notes.find(n=>n.id===uuid(1)).title='receiver corruption';assert.throws(()=>checkWorkspace(changed.b,r.expected.b,r.folders.b),{code:'CONTENT_MISMATCH'});
});
test('source corruption, missing/duplicate sources, wrong bytes and original folder drift fail reconstruction',()=>{
 for(const mutate of [x=>{x.workspaces.a.notes[0].document.content[0].content[0].marks=[];},x=>x.workspaces.a.notes.pop(),x=>x.workspaces.a.notes.push(structuredClone(x.workspaces.a.notes[0])),x=>{x.prior.specimens[0].attachments[1].sha256='0'.repeat(64);},x=>{x.workspaces.b.folders[0].createdAt++;}]){const f=fixture();mutate(f);assert.throws(()=>reconstructOriginal(f.prior,f.workspaces));}
});
test('exact whole workspace and wire metadata reject excess notes, attachments, timestamps and document marks',()=>{
 const {prior,workspaces}=fixture(),r=reconstructOriginal(prior,workspaces);
 for(const mutate of [w=>w.notes.push({...w.notes[0],id:uuid(999)}),w=>w.attachments.push({...w.attachments[0],id:uuid(998)}),w=>{w.attachments[0].recordedAt=3;},w=>{w.notes[0].document.content[0].content[0].marks=[];}]){const w=structuredClone(workspaces.a);mutate(w);assert.throws(()=>checkWorkspace(w,r.expected.a,r.folders.a));}
 const relocation=structuredClone(workspaces.a);relocation.notes[0].revision++;relocation.attachments[0].relativePath='other-local-placement';checkWorkspace(relocation,r.expected.a,r.folders.a);
});
test('pull retains remote exclusions, both unites snapshots, edits keep peer expectations separate',()=>{
 const a={id:'a'},b={id:'b'},expected={a:new Map([['a',a]]),b:new Map([['b',b]])};const pull=afterDirection(expected,'pull');assert.deepEqual([...pull.a.keys()].sort(),['a','b']);assert.deepEqual([...pull.b.keys()],['b']);assert.equal(expected.a.size,1);
 const both=afterDirection(expected,'both');assert.deepEqual([...both.a.keys()].sort(),['a','b']);assert.deepEqual([...both.b.keys()].sort(),['a','b']);both.a.set('a',{id:'edited'});assert.equal(both.b.get('a'),a);assert.throws(()=>afterDirection(expected,'push'),{code:'INVALID_ARGUMENTS'});
});
test('format validation requires exact UTF-8 text and actual bold/italic marks',()=>{
 const d={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'完整 😀',marks:[{type:'bold'},{type:'italic'}]}]}]};assert(richText(d,'完整 😀',['bold','italic']));assert(!richText(d,'完整',['bold']));d.content[0].content[0].marks.pop();assert(!richText(d,'完整 😀',['bold','italic']));
});
test('account staging exclusion checks only owned subtree and rejects forbidden blob, symlink and unexpected namespace',async()=>{
 const root=await mkdtemp('/private/tmp/account110-staging-fixture-');const f=filesFor('pull-a')[1],dir=resolve(root,'.account/staging',uuid(1));
 try{await mkdir(dir,{recursive:true});await writeFile(resolve(root,'.account','grant-unread'),sentinel,{mode:0});assert.equal((await noForbiddenStaging(root,[f])).checked,true);
  const file=resolve(dir,`${f.sha256}-${f.bytes.length}.part`);await writeFile(file,'synthetic');await assert.rejects(noForbiddenStaging(root,[f]),{code:'REVERSE_ATTACHMENT_BYTES'});await rm(file);
  await symlink('/private/tmp',resolve(dir,'outside'));await assert.rejects(noForbiddenStaging(root,[f]),{code:'OWNERSHIP_FAILED'});await rm(resolve(dir,'outside'));
  await mkdir(resolve(root,'.account/staging','unexpected'));await assert.rejects(noForbiddenStaging(root,[f]),{code:'OWNERSHIP_FAILED'});
 }finally{await rm(root,{recursive:true,force:true});}
});
test('footprint readonly probe detects un-applied inbox and changed version but ignores unrelated entities, never outputs payload',async()=>{
 const root=await mkdtemp('/private/tmp/account110-footprint-fixture-'),db=resolve(root,'notes.sqlite3'),probes=footprintProbes();
 const py=script=>execFileSync('/usr/bin/python3',['-I','-c',script,db],{stdio:['ignore','ignore','ignore']});
 try{
  py("import sqlite3,sys,json\nd=sqlite3.connect(sys.argv[1])\nfor t in ['sync_heads','sync_seen','sync_projection','sync_branches','sync_frontiers','sync_dirty']:d.execute('CREATE TABLE '+t+'(entity_id TEXT,payload TEXT)')\nd.execute('CREATE TABLE sync_inbox(wire TEXT)')\nd.execute('INSERT INTO sync_heads VALUES(?,?)',('entity','private-sentinel'))\nd.commit()\n");
  const run=async()=>validateFootprint(await probes.run(db,{notes:['entity'],requireSync:true}));const first=await run();assert.equal(first.rows,1);assert(!JSON.stringify(first).includes(sentinel));
  py("import sqlite3,sys\nd=sqlite3.connect(sys.argv[1]);d.execute('INSERT INTO sync_heads VALUES(?,?)',('other','private-sentinel'));d.commit()\n");assert.deepEqual(await run(),first);
  py("import sqlite3,sys,json\nd=sqlite3.connect(sys.argv[1]);d.execute('INSERT INTO sync_inbox VALUES(?)',(json.dumps({'entityId':'entity','payload':'private-sentinel'}),));d.commit()\n");const inbox=await run();assert.notEqual(inbox.sha256,first.sha256);assert.equal(inbox.rows,2);
  py("import sqlite3,sys\nd=sqlite3.connect(sys.argv[1]);d.execute('UPDATE sync_heads SET payload=? WHERE entity_id=?',('changed','entity'));d.commit()\n");assert.notEqual((await run()).sha256,inbox.sha256);
  const close=await probes.closeAll();assert(close.allClosed&&!close.hadFailures);assert(close.receipts.every(r=>r.closed&&r.exitCode===0));
 }finally{await probes.closeAll();await rm(root,{recursive:true,force:true});}
});
test('footprint projection rejects unknown fields and unbounded counts',()=>{const r={sha256:'a'.repeat(64),entities:1,rows:2};assert.deepEqual(validateFootprint(r),r);for(const bad of [{...r,message:sentinel},{...r,rows:-1},{...r,sha256:sentinel}])assert.throws(()=>validateFootprint(bad),{code:'INVALID_DTO'});});
test('finite action receipt stores no values/messages/expressions and saves begin before native action',async()=>{
 const events=[];let now=0;const t=new FiniteActions(async()=>events.push(t.rows.at(-1).event),()=>now);
 assert.deepEqual(await t.call('a','pull','sync.start',async()=>{assert.deepEqual(events,['begin']);now=7;return {raw:sentinel};}),{raw:sentinel});assert.equal(t.rows[1].durationMs,7);
 await assert.rejects(t.call('b','both','attachment.read',()=>Promise.reject(Object.assign(Error(sentinel),{code:'NATIVE_TIMEOUT',phase:'evalNotObserved',diagnostic:sentinel}))));assert.equal(t.rows.at(-1).errorPhase,'evalNotObserved');assert(!JSON.stringify(t.rows).includes(sentinel));
 let calls=0;await assert.rejects(new FiniteActions(async()=>{throw Error(sentinel);}).call('a','pull','sync.start',()=>calls++));assert.equal(calls,0);await assert.rejects(t.call('a',sentinel,'sync.start',()=>calls++),{code:'INVALID_ARGUMENTS'});assert.equal(calls,0);
});
test('CLI is only explicit --run with a fresh fixed-prefix output, no auth inputs',()=>{assert.equal(parseOwnedArgs(['--run','--output','/private/tmp/account110-device-actions-owned-continuation-01']),'/private/tmp/account110-device-actions-owned-continuation-01');for(const args of [[],['--run','--output','/tmp/out'],['--run','--output','/private/tmp/account110-device-actions-owned-continuation-01','--token',sentinel]])assert.throws(()=>parseOwnedArgs(args),{code:'INVALID_ARGUMENTS'});});
