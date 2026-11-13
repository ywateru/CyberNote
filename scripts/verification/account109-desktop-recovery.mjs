#!/usr/bin/env node
// Continue preserved synthetic heads. Importing this file never launches an app.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,lstat,realpath,appendFile} from 'node:fs/promises';
import {resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeApp,delay} from './sync108-native-driver.mjs';
import {nativeAccount,statusObserver,requireHealthy,waitForAccountStatuses,accountConnected,attachmentRefs,snapshotNotes,observeLogout,failureCode} from './account109-desktop-helpers.mjs';

export const STORES='/private/tmp/account109-desktop-real-90b8b28b-01';
const USERNAME='cybernoteqa20261113a';
export const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>JSON.stringify(sort(value));
function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;}
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function options(argv){
  const opts={};
  for(let i=0;i<argv.length;i++){const key=argv[i];assert(['--binary','--stores','--output','--prior-run'].includes(key)&&!opts[key],'Unknown/duplicate option');const value=argv[++i];assert(isAbsolute(value||''),'Absolute paths required');opts[key]=value;}
  assert(Object.keys(opts).length===4,'--binary ABS --stores ORIGINAL --output FRESH --prior-run FULL02 required');
  assert.equal(opts['--stores'],STORES,'Only original synthetic test stores allowed');
  const prior=opts['--prior-run'],output=resolve(opts['--output']);
  assert(/^\/private\/tmp\/account109-desktop-real-[A-Za-z0-9-]+full02$/.test(prior),'Expected preserved full02');
  for(const root of [STORES,prior])assert(output!==root&&!output.startsWith(root+sep),'Fresh evidence outside prior/stores required');
  return {binary:opts['--binary'],stores:STORES,output,prior};
}
export function priorEntity(report){
  assert.equal(report.kind,'real-account-two-native-desktops');assert.equal(report.status,'fail');
  assert.equal(report.failure?.phase,'concurrent-offline');assert.equal(report.failure?.code,'NATIVE_TIMEOUT');
  assert.equal(report.scenarios?.logout,'not-run');assert(report.finishedAt&&report.lifecycle?.length&&report.lifecycle.every(p=>p.close),'Prior run must be finished before archiving');
  const matches=report.observations.filter(o=>o.kind==='convergence'&&o.label==='concurrent shared base');
  assert.equal(matches.length,1);assert(uuid(matches[0].noteId));
  for(const name of ['a','b'])assert(report.statusTransitions.some(s=>s.device===name&&s.phase==='concurrent-offline'&&s.conflictCount===1&&s.devices.some(d=>!d.current&&d.connected)),'Prior conflict/connection evidence required on both sides');
  return matches[0].noteId;
}

const sqliteScript=String.raw`import sqlite3,json,sys
from pathlib import Path
p=Path(sys.argv[1])/'notes.sqlite3'
c=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True)
c.execute('pragma query_only=on')
assert c.execute('pragma query_only').fetchone()[0]==1
entity=sys.argv[2]
heads=[{'digest':r[0],'payload':json.loads(r[1])} for r in c.execute("select digest,payload from sync_heads where kind='note' and entity_id=? and tombstone=0 and redacted=0 order by digest",(entity,))]
notes=[json.loads(r[0]) for r in c.execute('select body from notes where id=?',(entity,))]
attachments=[json.loads(r[0]) for r in c.execute("select body from attachments where json_extract(body,'$.noteId')=?",(entity,))]
c.close()
print(json.dumps({'heads':heads,'notes':notes,'attachments':attachments,'mode':'ro','queryOnly':True}))`;
// Only a copied DB/WAL/SHM is opened by SQLite. No identity/account/grant query.
// The caller confines directory to original test roots before invoking this.
export async function readBaseline(directory,snapshotDirectory,entityId){
  assert(uuid(entityId));await mkdir(snapshotDirectory);
  const names=['notes.sqlite3','notes.sqlite3-wal','notes.sqlite3-shm'];
  async function hashes(){const result={};for(const name of names){try{const path=resolve(directory,name);assert((await lstat(path)).isFile(),'Regular SQLite evidence only');result[name]=hash(await readFile(path));}catch(e){if(e.code!=='ENOENT'||name===names[0])throw e;}}return result;}
  const before=await hashes();
  for(const name of Object.keys(before))await copyFile(resolve(directory,name),resolve(snapshotDirectory,name));
  for(const [name,sha] of Object.entries(before))assert.equal(hash(await readFile(resolve(snapshotDirectory,name))),sha,'Consistent copied SQLite evidence required');
  assert.deepEqual(await hashes(),before,'Original evidence changed during copy');
  const data=JSON.parse(execFileSync('python3',['-c',sqliteScript,snapshotDirectory,entityId],{encoding:'utf8',maxBuffer:4_000_000,stdio:['ignore','pipe','pipe']}));
  assert.deepEqual(await hashes(),before,'Original DB/WAL/SHM unchanged after read-only query');
  return {...data,originalFiles:before,originalFilesUnchanged:true,snapshotDirectory};
}
const noteFields=['folderId','document','title','plainText','createdAt','updatedAt','pinned','deletedAt','originalFolderId','locked','paperStyle','sealed'];
const metadata=a=>({kind:a.kind,mime:a.mime,displayName:a.displayName,size:a.size,...(a.recordedAt===undefined?{}:{recordedAt:a.recordedAt})});
// Compare every wire-note field and every descriptor field. Only identity IDs,
// projection revision and physical file paths are intentionally normalized.
export function canonicalBranch({note,attachments},withHashes=true){
  assert(uuid(note.id));assert(!note.locked&&!note.deletedAt,'Only existing live synthetic branches supported');
  for(const key of Object.keys(note))assert(['id','revision',...noteFields].includes(key),'Unknown note field must not be silently dropped');
  const rows=attachments.map(a=>{for(const key of Object.keys(a))assert(['id','noteId','kind','mime','displayName','size','recordedAt','sha256','relativePath'].includes(key),'Unknown descriptor field must not be silently dropped');assert.equal(a.noteId,note.id,'Attachment ownership required');assert(uuid(a.id));if(withHashes)assert(digest(a.sha256));return a;});
  assert.equal(new Set(rows.map(a=>a.id)).size,rows.length,'Unique attachment rows required');
  const refs=attachmentRefs(note.document);assert.equal(new Set(refs).size,rows.length,'Every owned attachment must be referenced');
  const descriptor=a=>({...metadata(a),...(withHashes?{sha256:a.sha256}:{})});
  const normalize=node=>{const result={...node};if(node.type==='attachment'){const matches=rows.filter(a=>a.id===node.attrs?.id);assert.equal(matches.length,1,'Every document reference must have exactly one owned row');result.attrs={...node.attrs,id:descriptor(matches[0])};}if(node.content)result.content=node.content.map(normalize);return result;};
  const body=Object.fromEntries(noteFields.map(key=>[key,key==='document'?normalize(note.document):note[key]??null]));
  return stable({note:body,attachments:rows.map(descriptor).sort((a,b)=>stable(a).localeCompare(stable(b)))});
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64');
const fixtureHashes=new Map([['account109.png',{sha256:hash(png),size:png.length,mime:'image/png'}],['account109.bin',{sha256:hash(Buffer.from(Array.from({length:4096},(_,i)=>i%256))),size:4096,mime:'application/octet-stream'}]]);
export function validateBaselines(baselines,entityId){
  assert.equal(baselines.length,2);
  for(const data of baselines){assert.equal(data.heads.length,2,'Exactly two preserved heads required');assert.equal(new Set(data.heads.map(h=>h.digest)).size,2);for(const h of data.heads){assert(digest(h.digest));assert.equal(h.payload.note.id,entityId);canonicalBranch(h.payload);assert.equal(h.payload.attachments.length,2);assert.deepEqual(h.payload.attachments.map(a=>a.displayName).sort(),[...fixtureHashes.keys()].sort());for(const a of h.payload.attachments){const expected=fixtureHashes.get(a.displayName);assert.equal(a.sha256,expected.sha256);assert.equal(a.size,expected.size);assert.equal(a.mime,expected.mime);}}}
  assert.equal(stable(baselines[0].heads),stable(baselines[1].heads),'Both original stores must agree on exact full heads');
  const heads=baselines[0].heads;
  assert.deepEqual(heads.map(h=>h.payload.note.title).sort(),['甲端并发版本：保留全部甲中文','乙端并发版本：保留全部乙中文'].sort(),'Only full02 synthetic branches allowed');
  assert.notEqual(canonicalBranch(heads[0].payload),canonicalBranch(heads[1].payload));
  return heads;
}

// Fixed command boundary; no arbitrary native command, expected token or URL input.
export async function nativeSync(app,type,args={}){
  assert(args&&Object.getPrototypeOf(args)===Object.prototype);
  let command;
  if(type==='conflicts'){assert.equal(Object.keys(args).length,0);command={type};}
  else{assert.equal(type,'resolve');assert.deepEqual(Object.keys(args).sort(),['digest','entityId','keepAll']);assert(uuid(args.entityId)&&digest(args.digest)&&args.keepAll===true);command={type,kind:'note',...args};}
  return app.evaluate(`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;const a=s.workspace.access;if(!a?.sessionId||!Number.isSafeInteger(a.epoch))throw Error('ACCESS_REQUIRED');return window.__TAURI_INTERNALS__.invoke('sync_command',{command:arg,expected:{sessionId:a.sessionId,epoch:a.epoch}});})()`,command);
}
const operations=['ready','state','idle','close','account.status','account.syncNow','account.signOut','sync.conflicts','sync.resolve','attachment.read','folder.select','note.create','note.select','editor.setContent','app.flush'];
export function checkpoint(report,save,append){
  let sequence=0;
  return async(device,operation,action)=>{
    assert(['a','b','harness'].includes(device)&&operations.includes(operation),'Fixed operation label required');
    const row={sequence:++sequence,stage:report.phase,device,operation,event:'before',at:new Date().toISOString()};
    report.lastOperation=row;await save();await append(row);
    try{const result=await action();const after={...row,event:'after',at:new Date().toISOString()};report.lastOperation=after;await append(after);return result;}
    catch(error){const failed={...row,event:'failed',code:failureCode(error),at:new Date().toISOString()};report.lastOperation=failed;await append(failed);await save();throw error;}
  };
}
export async function verifyBytes(app,workspace,read,expected){
  const rows=[];
  for(const a of workspace.attachments){
    const root=resolve(app.directory,'attachments'),path=resolve(root,a.relativePath);
    assert(path.startsWith(root+sep)&&await realpath(path)===path&&(await lstat(path)).isFile(),'Confined regular attachment file required');
    const file=await readFile(path),result=await read(a),bytes=Buffer.from(result.data,'base64');
    assert.equal(bytes.length,a.size);assert.equal(file.length,a.size);assert.equal(hash(bytes),hash(file),'Production read and stored bytes agree');
    if(expected){const e=expected.find(e=>e.id===a.id&&e.noteId===a.noteId);assert(e,'All retained attachments remain owned');assert.deepEqual(metadata(a),metadata(e));assert.equal(hash(bytes),e.sha256,'All original raw bytes retained');}
    rows.push({...a,sha256:hash(bytes)});
  }
  if(expected)assert.equal(rows.length,expected.length,'No retained attachment rows lost');
  return rows;
}
export async function boundedPoll(label,predicate,timeoutMs,{now=Date.now,sleep=delay}={}){
  const end=now()+timeoutMs;
  while(now()<end){if(await predicate())return;await sleep(Math.min(1000,Math.max(0,end-now())));}
  throw Object.assign(new Error('Bounded continuation timeout'),{code:'CONDITION_TIMEOUT:'+label});
}
export async function finishRecovery(report,children,close,save){
  const results=await Promise.allSettled(children.map(close));report.lifecycle=children.map(a=>a.lifecycle);
  if(results.some(r=>r.status==='rejected')||children.some(a=>a.lifecycle.naturalExit!==true)){report.status='fail';report.cleanupFailure={code:'CLEANUP_FAILED'};}
  if(report.status!=='fail')report.status=report.scenarios.conflict==='pass'&&report.scenarios.logout==='pass'?'pass':'fail';
  report.finishedAt=new Date().toISOString();await save();
}

export async function run(argv=process.argv.slice(2)){
  const {binary,stores,output,prior}=options(argv);
  for(const dir of [stores,prior,...['a','b'].map(n=>resolve(stores,'desktop-'+n))])assert(await realpath(dir)===dir&&(await lstat(dir)).isDirectory(),'Canonical owned roots required');
  const priorBytes=await readFile(resolve(prior,'result.json')),previous=JSON.parse(priorBytes),entityId=priorEntity(previous);
  // The verifier must finish its prior owned children; never take over live ones.
  for(const child of previous.lifecycle){try{process.kill(child.pid,0);assert.fail('Prior owned process still exists');}catch(e){if(e.code!=='ESRCH')throw e;}}
  await mkdir(output);
  assert.equal(await realpath(output),output,'Canonical fresh output required');
  const report={schema:1,kind:'account109-preserved-full02-recovery',startedAt:new Date().toISOString(),status:'running',phase:'baseline',scenarios:{conflict:'not-run',logout:'not-run'},checks:[],observations:[],limitations:[
    'Continuation only: the prior ten checks are archived, not rerun or reclassified. Original NATIVE_TIMEOUT/evalNotObserved root cause remains unproven.',
    'Fixed production sync resolve keepAll and account signOut calls bypass GUI confirmations as explicitly permitted. No account authorization or manual pairing is supplied.',
    'Logout exclusion covers repeated 3-second windows before and after restart. No performance, physical input or unbounded exclusion claim.',
    'No retry/reset: a failed or already resolved baseline requires review; this script does not create another conflict.'
  ],prior:{path:prior,resultSha256:hash(priorBytes),failure:previous.failure,checksPassed:previous.checks.filter(c=>c.status==='pass').length},binary:{path:binary,sha256:hash(await readFile(binary)),sameAsPrior:hash(await readFile(binary))===previous.binary.sha256},tools:{runnerSha256:hash(await readFile(fileURLToPath(import.meta.url))),driverSha256:hash(await readFile(new URL('./sync108-native-driver.mjs',import.meta.url))),helpersSha256:hash(await readFile(new URL('./account109-desktop-helpers.mjs',import.meta.url)))}};
  const save=()=>writeFile(resolve(output,'result.json'),JSON.stringify(report,null,2)+'\n');
  const trace=checkpoint(report,save,row=>appendFile(resolve(output,'steps.jsonl'),JSON.stringify(row)+'\n'));
  const children=[],observe=statusObserver(report,()=>report.phase);
  const check=name=>report.checks.push({name,status:'pass'});
  const workspace=app=>trace(app.name,'state',async()=>(await app.state()).workspace);
  const command=async(app,id,args={})=>{await trace(app.name,id,()=>app.execute(id,args));await trace(app.name,'idle',()=>app.idle());};
  async function account(app,type='status') {const s=await trace(app.name,'account.'+type,()=>nativeAccount(app,type));observe(app.name,s);requireHealthy(s,{pendingNetwork:true});return s;}
  async function statuses(apps){return Promise.all(apps.map(a=>account(a)));}
  const connected=apps=>waitForAccountStatuses('continuation connection',()=>statuses(apps),ss=>{if(!ss.every(s=>s.profile?.username===USERNAME))return false;assert(ss.every(s=>s.profile.subject===ss[0].profile.subject));return ss.every(accountConnected);},120000);
  async function open(name){const env=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].map(k=>[k,'']));const app=new NativeApp(binary,resolve(stores,'desktop-'+name),{name,env:{...env,NOTES_SYNC_E2E_SLOT:name==='a'?'left':'right'}});children.push(app);await trace(name,'ready',()=>app.ready(45000));return app;}
  const read=(app,a)=>trace(app.name,'attachment.read',()=>app.evaluate(`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;const a=s.workspace.access,n=a.notes[arg.noteId];if(!n?.authorized)throw Error('OWNER_NOT_AUTHORIZED');return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,expected:{sessionId:a.sessionId,epoch:a.epoch,noteEpoch:n.epoch}});})()`,{id:a.id,noteId:a.noteId}));
  async function bytes(app,ws,expected){return verifyBytes(app,ws,async a=>{await command(app,'note.select',{id:a.noteId});return read(app,a);},expected);}
  try{
    await save();await writeFile(resolve(output,'prior-full02-result.json'),priorBytes,{flag:'wx'});
    const baselines=[];for(const name of ['a','b'])baselines.push(await readBaseline(resolve(stores,'desktop-'+name),resolve(output,'sqlite-readonly-'+name),entityId));
    const heads=validateBaselines(baselines,entityId);
    await writeFile(resolve(output,'baseline.json'),JSON.stringify({entityId,baselines},null,2)+'\n',{flag:'wx'});
    report.baseline={entityId,sha256:hash(await readFile(resolve(output,'baseline.json'))),heads:heads.map(h=>({digest:h.digest,fullPayloadSha256:hash(canonicalBranch(h.payload))})),originalFiles:baselines.map(b=>b.originalFiles),readOnlyCopies:true,originalFilesUnchanged:true};check('exact full two-branch baseline sealed before app launch');await save();
    report.phase='existing-conflict';report.scenarios.conflict='running';let a=await open('a'),b=await open('b');await connected([a,b]);
    const sync=(app,type,args)=>trace(app.name,'sync.'+type,()=>nativeSync(app,type,args));
    const expectedDigests=heads.map(h=>h.digest).sort();
    for(const app of [a,b]){const result=await sync(app,'conflicts');assert.equal(result.conflicts?.length,1,'Exactly the preserved conflict required');const row=result.conflicts[0];assert.equal(row.kind,'note');assert.equal(row.entityId,entityId);assert.deepEqual(row.variants.map(v=>v.digest).sort(),expectedDigests);}
    report.resolve={entityId,chosenExistingDigest:heads[0].digest,keepAll:true,bypassesGuiConfirmation:true};await save();
    await sync(a,'resolve',{entityId,digest:heads[0].digest,keepAll:true});
    await connected([a,b]);
    const candidates=new Map();
    await boundedPoll('both full branches',async()=>{
      const ss=await statuses([a,b]);const healthy=ss.map(s=>requireHealthy(s,{pendingNetwork:true}));if(!healthy.every(Boolean)||!ss.every(accountConnected)||!ss.every(s=>s.conflictCount===0))return false;
      for(const app of [a,b]){const ws=await workspace(app),matches=heads.map(h=>ws.notes.filter(n=>!n.deletedAt&&n.title===h.payload.note.title&&canonicalBranch({note:n,attachments:ws.attachments.filter(r=>r.noteId===n.id)},false)===canonicalBranch(h.payload,false)));if(matches.some(ms=>ms.length!==1))return false;assert.notEqual(matches[0][0].id,matches[1][0].id);assert(matches.some(ms=>ms[0].id===entityId));candidates.set(app.name,{ws,notes:matches.map(ms=>ms[0])});}return true;
    },60000);
    for(const app of [a,b]){const {ws,notes}=candidates.get(app.name);for(const [i,note] of notes.entries()){const owned=ws.attachments.filter(r=>r.noteId===note.id),verified=await bytes(app,{attachments:owned});assert.equal(canonicalBranch({note,attachments:verified}),canonicalBranch(heads[i].payload),'Full branch and original raw bytes preserved after remap');report.observations.push({kind:'resolved-full-branch',device:app.name,noteId:note.id,existingHeadDigest:heads[i].digest,canonicalPayloadSha256:hash(canonicalBranch(heads[i].payload)),attachments:verified.map(r=>({id:r.id,name:r.displayName,sha256:r.sha256,size:r.size})),productionReadAndStoredFile:true});}}
    for(const app of [a,b])assert.equal((await sync(app,'conflicts')).conflicts.length,0);
    check('preserved conflict keep-all retains both full branches and original PNG/bin on both desktops');report.scenarios.conflict='pass';await save();
    report.phase='logout';report.scenarios.logout='running';
    const local=await workspace(a),snapshot=snapshotNotes(local.notes),allBytes=await bytes(a,local);
    report.preLogout={notes:snapshot.map(n=>({id:n.id,fullBodySha256:hash(n.body)})),attachments:allBytes.map(r=>({id:r.id,noteId:r.noteId,sha256:r.sha256,size:r.size}))};await save();
    await account(a,'signOut');await waitForAccountStatuses('signed out',()=>statuses([a]),ss=>ss.every(s=>s.state==='signedOut'&&!s.profile&&!s.enabled&&!s.devices.some(d=>d.connected)),15000);
    const remoteIds=[];
    async function remote(){const s=await account(b);requireHealthy(s);assert(s.profile?.username===USERNAME&&s.enabled&&s.state==='ready');await command(b,'folder.select',{id:'default'});await command(b,'note.create');await command(b,'editor.setContent',{document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'退出后远端新备忘录 '+randomUUID()}]}]}});await command(b,'app.flush');const ws=await trace('b','state',()=>b.state());const id=ws.selection.noteId;assert(uuid(id)&&!snapshot.some(n=>n.id===id)&&!remoteIds.includes(id));remoteIds.push(id);const body=ws.workspace.notes.find(n=>n.id===id);assert(body?.plainText.includes('退出后远端新备忘录'));await account(b,'syncNow');}
    async function exclude(label){const proof=await observeLogout({readStatus:()=>account(a),readNotes:async()=>{const ws=await workspace(a);const s=await account(b);requireHealthy(s);assert(s.profile?.username===USERNAME&&s.enabled&&s.state==='ready');return ws.notes;},snapshot,remoteIds,now:()=>performance.now()});const ws=await workspace(a);await bytes(a,ws,allBytes);report.observations.push({kind:'logout-exclusion',label,...proof,remoteIds:[...remoteIds],allLocalBodiesAndRawAttachmentsPreserved:true});}
    await remote();await exclude('before restart');await trace('a','close',()=>a.close());assert(a.lifecycle.naturalExit);a=await open('a');await remote();await exclude('after restart');
    check('logout rejects new remote notes for 3 seconds before/after restart and preserves every local body and raw attachment');report.scenarios.logout='pass';await save();
  }catch(error){report.status='fail';report.failure={phase:report.phase,code:failureCode(error),lastOperation:report.lastOperation};}
  finally{
    try{assert.equal(hash(await readFile(resolve(prior,'result.json'))),hash(priorBytes));}catch{report.status='fail';report.failure??={phase:'prior-evidence',code:'CHECK_FAILED'};}
    await finishRecovery(report,children,app=>trace(app.name,'close',()=>app.close()),save);
  }
  if(report.status!=='pass')process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
