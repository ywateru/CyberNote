#!/usr/bin/env node
// Independent continuation of the fixed owned live03 libraries. Import is inert.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat,realpath,readdir} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeApp} from './sync108-native-driver.mjs';
import {syncOnce,parseStatus,validatePackage,closeNativeClients,safeFailure,safeFailureReceipt,ownedFile,waitFor,observeWindow,ProtocolProbes,expectedSummary} from './account110-device-actions.mjs';
const ROOT='/Users/water/work/2026/Apple-Notes-Clone',SOURCE='29c878108b2ea421b5e4fccd71547206071fdbfa';
const OWNED='/private/tmp/account110-device-actions-staging-fix-fresh-live03';
const FIRST='33b8150f542aa3eab1dfce2151923837cb693191df8edc6ece9996eee00f49fb';
const RECEIPT=ROOT+'/artifacts/account110/mac-29c87810-debug-01/packaging-receipt.json';
const RECEIPT_HASH='8f1dc6d52f00732b9e76018ef76433404e23314573e5f59efb55b7c1832c13b0';
const HARNESS_ROOT=fileURLToPath(new URL('../..',import.meta.url));
const fail=code=>Object.assign(new Error(code),{code});
const need=(v,code='CHECK_FAILED')=>{if(!v)throw fail(code);};
const object=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const stable=v=>Array.isArray(v)?v.map(stable):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
export const semantic=n=>Object.fromEntries(Object.entries(n).filter(([k])=>k!=='revision'));
const semanticHash=n=>hash(JSON.stringify(stable(semantic(n))));
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export const richText=(d,text,marks)=>{const nodes=d?.type==='text'&&d.text===text&&marks.every(type=>d.marks?.some(m=>m.type===type));return !!nodes||(d?.content??[]).some(n=>richText(n,text,marks));};
const refs=d=>[...(d?.type==='attachment'?[d.attrs?.id]:[]),...(d?.content??[]).flatMap(refs)];
const originalLabels=['initial-a','initial-b','push-a','push-b'];
const newLabels=['pull-a','pull-b','both-a','both-b','idle-a','idle-b','offline-a'];
export function filesFor(label){
 need([...originalLabels,...newLabels].includes(label),'INVALID_ARGUMENTS');
 const seed=Buffer.from(originalLabels.includes(label)?label:'continuation-'+label),bin=Buffer.alloc(256*1024+17);
 for(let i=0;i<bin.length;i++)bin[i]=(seed[i%seed.length]+i*13)%256;
 return [['specimen.png','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64')],['specimen.bin','application/octet-stream',bin]].map(([name,mime,bytes])=>({name,mime,bytes,sha256:hash(bytes)}));
}
function specimen(note,attachments,label,origin){
 const files=filesFor(label);need(uuid(note.id)&&attachments.length===files.length,'ATTACHMENT_MISMATCH');
 for(const f of files){const found=attachments.filter(a=>a.mime===f.mime&&a.displayName===f.name&&a.size===f.bytes.length);need(found.length===1&&found[0].noteId===note.id&&refs(note.document).includes(found[0].id),'ATTACHMENT_MISMATCH');}
 return {id:note.id,label,origin,note:structuredClone(semantic(note)),attachments:structuredClone(attachments),files};
}
// Reconstruct only from the original pinned semantic/byte expectations, never
// adopt the receiver's current contents as a new expected baseline.
export function reconstructOriginal(prior,workspaces){
 need(prior.specimens?.length===4&&equal(prior.specimens.map(s=>s.label),originalLabels),'ORIGINAL_EVIDENCE_INVALID');
 const specs=[];
 for(const p of prior.specimens){
  need(p.origin===p.label.at(-1)&&digest(p.semanticSha256),'ORIGINAL_EVIDENCE_INVALID');
  const files=filesFor(p.label);need(equal(p.attachments,files.map(f=>({mime:f.mime,bytes:f.bytes.length,sha256:f.sha256}))),'ORIGINAL_EVIDENCE_INVALID');
  const w=workspaces[p.origin],notes=w.notes.filter(n=>semanticHash(n)===p.semanticSha256);need(notes.length===1,'CONTENT_MISMATCH');
  specs.push(specimen(notes[0],w.attachments.filter(a=>a.noteId===notes[0].id),p.label,p.origin));
 }
 need(new Set(specs.map(s=>s.id)).size===4,'CONTENT_MISMATCH');
 const folders={};
 for(const n of ['a','b']){const p=prior.initialBusinessBaselines?.find(b=>b.device===n);need(p?.notes===0&&p.attachments===0&&p.folders===workspaces[n].folders.length,'ORIGINAL_EVIDENCE_INVALID');
  const rebuilt={notes:[],folders:workspaces[n].folders,attachments:[]};need(hash(JSON.stringify(stable(rebuilt)))===p.semanticSha256,'CONTENT_MISMATCH');folders[n]=structuredClone(workspaces[n].folders);}
 const expected={a:new Map(specs.filter(s=>s.origin==='a').map(s=>[s.id,s])),b:new Map(specs.map(s=>[s.id,s]))};return {specs,folders,expected};
}
export function afterDirection(expected,direction){
 need(['pull','both'].includes(direction),'INVALID_ARGUMENTS');const next={a:new Map(expected.a),b:new Map(expected.b)};
 if(direction==='both')for(const [id,s] of expected.a)next.b.set(id,s);
 for(const [id,s] of expected.b)next.a.set(id,s);return next;
}
export function checkWorkspace(w,expected,folders){
 need(equal(w.folders,folders),'CONTENT_MISMATCH');need(w.notes.length===expected.size&&new Set(w.notes.map(n=>n.id)).size===expected.size,'REVERSE_CONTENT');
 for(const [id,s] of expected){const n=w.notes.find(n=>n.id===id);need(n&&equal(semantic(n),s.note),'CONTENT_MISMATCH');
  const rows=w.attachments.filter(a=>a.noteId===id);need(rows.length===s.attachments.length,'ATTACHMENT_MISMATCH');
  for(const original of s.attachments){const a=rows.find(a=>a.id===original.id);need(a&&['id','noteId','kind','mime','displayName','size','recordedAt'].every(k=>equal(a[k],original[k]))&&refs(n.document).includes(a.id),'ATTACHMENT_MISMATCH');}}
 need(w.attachments.length===[...expected.values()].reduce((sum,s)=>sum+s.attachments.length,0),'REVERSE_CONTENT');
}
// Only the fixed account staging subtree is enumerated. No grant, identity or
// other .account files are read. All components are checked without symlinks.
export async function noForbiddenStaging(root,files){
 let visited=0;const hashes=new Set(files.filter(f=>f.mime==='application/octet-stream').map(f=>f.sha256));
 const directory=async path=>{let st;try{st=await lstat(path);}catch(e){if(e.code==='ENOENT')return false;throw e;}need(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(path)===path,'OWNERSHIP_FAILED');return true;};
 need(await directory(root),'OWNERSHIP_FAILED');
 for(const parent of ['.account','.account/staging'])if(!await directory(resolve(root,parent)))return {checked:true,files:0};
 for(const entry of await readdir(resolve(root,'.account/staging'),{withFileTypes:true})){
  need(++visited<=4096&&uuid(entry.name),'OWNERSHIP_FAILED');const dir=resolve(root,'.account/staging',entry.name);need(await directory(dir),'OWNERSHIP_FAILED');
  for(const file of await readdir(dir,{withFileTypes:true})){
   need(++visited<=4096,'OWNERSHIP_FAILED');const path=resolve(dir,file.name);let st;try{st=await lstat(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}
   need(st.isFile()&&!st.isSymbolicLink()&&/^[a-f0-9]{64}-[0-9]+\.part$/.test(file.name),'OWNERSHIP_FAILED');need(!hashes.has(file.name.slice(0,64)),'REVERSE_ATTACHMENT_BYTES');
  }
 }
 return {checked:true,files:visited};
}
const footprintScript=String.raw`import sys,json,sqlite3,urllib.parse,hashlib
p=json.load(sys.stdin)
db=sqlite3.connect('file:'+urllib.parse.quote(sys.argv[1],safe='/')+'?mode=ro',uri=True)
db.execute('PRAGMA query_only=ON')
r=[]
for entity in sorted(set(p['notes'])):
 for table in ['sync_heads','sync_seen','sync_projection','sync_branches','sync_frontiers','sync_dirty']:
  rows=db.execute('SELECT * FROM '+table+' WHERE entity_id=?',(entity,)).fetchall()
  for row in rows:r.append([table,list(row)])
 for row in db.execute("SELECT * FROM sync_inbox WHERE json_extract(wire,'$.entityId')=?",(entity,)).fetchall():r.append(['sync_inbox',list(row)])
r.sort(key=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')))
b=json.dumps(r,sort_keys=True,separators=(',',':')).encode()
print(json.dumps({'sha256':hashlib.sha256(b).hexdigest(),'entities':len(set(p['notes'])),'rows':len(r)},separators=(',',':')))
`;
export function footprintProbes(){return new ProtocolProbes({spawnProcess:(_exe,args,options)=>spawn('/usr/bin/python3',['-I','-c',footprintScript,args[3]],options)});}
export function validateFootprint(r){need(object(r)&&equal(Object.keys(r).sort(),['entities','rows','sha256'])&&digest(r.sha256)&&[r.entities,r.rows].every(v=>Number.isSafeInteger(v)&&v>=0),'INVALID_DTO');return {sha256:r.sha256,entities:r.entities,rows:r.rows};}
const actionLabels=['ready','state','idle','account.status','ui.back','ui.folder','ui.create','ui.edit','ui.attach','ui.flush','ui.select','attachment.read','sync.start','sync.status','sync.poll'];
const phaseLabels=['restore','completed-push','pull','both','idle-edits','offline','restart-b','final-restart','cleanup'];
const errorPhases=['nativePageFinished','documentProbe','debugRegistration','appIdle','startupHandoff','evalEntered','evalNotObserved'];
export class FiniteActions{
 constructor(save=async()=>{},now=Date.now){this.save=save;this.now=now;this.began=now();this.sequence=0;this.rows=[];}
 async call(device,phase,action,fn){need(['a','b'].includes(device)&&phaseLabels.includes(phase)&&actionLabels.includes(action)&&this.rows.length+2<=16384,'INVALID_ARGUMENTS');const sequence=++this.sequence,at=this.now();
  this.rows.push({sequence,device,phase,action,event:'begin',elapsedMs:at-this.began});await this.save();
  try{const result=await fn();this.rows.push({sequence,device,phase,action,event:'returned',elapsedMs:this.now()-this.began,durationMs:this.now()-at});await this.save();return result;}
  catch(error){this.rows.push({sequence,device,phase,action,event:'failed',elapsedMs:this.now()-this.began,durationMs:this.now()-at,code:safeFailure(error),errorPhase:errorPhases.includes(error?.phase)?error.phase:null});await this.save();throw error;}}
}
const account="window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})";
const read=`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;const access=s.workspace.access,owner=access.notes[arg.noteId];if(!owner?.authorized)throw Error('OWNER_NOT_AUTHORIZED');return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,expected:{sessionId:access.sessionId,epoch:access.epoch,noteEpoch:owner.epoch}});})()`;
const source=root=>({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),clean:execFileSync('git',['status','--porcelain'],{cwd:root}).length===0});
export function parseOwnedArgs(argv){need(argv.length===3&&argv[0]==='--run'&&argv[1]==='--output'&&/^\/private\/tmp\/account110-device-actions-owned-continuation-[A-Za-z0-9-]+$/.test(argv[2]),'INVALID_ARGUMENTS');return argv[2];}
export async function main(argv){
 const output=parseOwnedArgs(argv),productBefore=source(ROOT),harnessBefore=source(HARNESS_ROOT);need(productBefore.head===SOURCE&&productBefore.clean&&harnessBefore.clean,'SOURCE_CHANGED');
 need(hash(await readFile(RECEIPT))===RECEIPT_HASH,'BINARY_CHANGED');const candidate=await validatePackage(RECEIPT,SOURCE);
 const bytes=await readFile(OWNED+'/result.json');need(hash(bytes)===FIRST,'FIRST_RESULT_CHANGED');const prior=JSON.parse(bytes);need(prior.status==='fail'&&prior.failure?.phase==='push'&&prior.failure.code==='NATIVE_TIMEOUT'&&prior.nativeCleanup?.allClosed,'ORIGINAL_EVIDENCE_INVALID');
 for(const [name,sum] of [['account110-device-actions.mjs',prior.runnerSha256],['sync108-native-driver.mjs',prior.driverSha256]])need(hash(await readFile(new URL('./'+name,import.meta.url)))===sum&&hash(await readFile(ROOT+'/scripts/verification/'+name))===sum,'SOURCE_CHANGED');
 for(const dir of ['/private/tmp',OWNED,...['a','b'].map(n=>OWNED+'/desktop-'+n)])need((await lstat(dir)).isDirectory()&&!(await lstat(dir)).isSymbolicLink()&&await realpath(dir)===dir,'OWNERSHIP_FAILED');
 await mkdir(output,{mode:0o700});
 const report={schema:1,kind:'same-owned-independent-direction-continuation',status:'running',productSource:SOURCE,harnessSource:harnessBefore.head,harnessSourceClean:true,harnessSha256:hash(await readFile(fileURLToPath(import.meta.url))),candidate,originalResultSha256:FIRST,originalFailure:{phase:'push',code:'NATIVE_TIMEOUT'},checks:[],actions:[],verifications:[],boundaries:['Original fresh-live03 remains FAIL; this is separately evaluated owned continuation, not a relabelled fresh-run PASS.','No new login, grant/Noise copies, default library, new package or product change.','Original document/format expectations rebuilt from pinned semantic hashes and deterministic files; IDs/content remain only in RAM.','Production UI/debug save and attachment reads, raw file hashes, protocol/blob/account-staging reverse checks, finite idle and real normal restart.','Only finite labels/codes/boolean/count/hash/timing receipts; no raw message, argument, expression, IDs, URL or DB body.']};
 let trace;const save=()=>{if(trace)report.actions=trace.rows;return writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});};trace=new FiniteActions(save);await save();
 const apps={},children=[],labels=new Map(),registry={},names={},probes=new ProtocolProbes(),footprints=footprintProbes();let phase='restore',owner,specs=[],folders,expected;
 const action=(n,label,fn)=>trace.call(n,phase,label,fn);
 const ui=async(n,command,args={})=>{const label={'app.back':'ui.back','folder.select':'ui.folder','note.create':'ui.create','editor.setContent':'ui.edit','attachment.submit':'ui.attach','app.flush':'ui.flush','note.select':'ui.select'}[command];need(label,'INVALID_ARGUMENTS');await action(n,label,()=>apps[n].execute(command,args));await action(n,'idle',()=>apps[n].idle());};
 const state=n=>action(n,'state',()=>apps[n].state());const workspace=async n=>(await state(n)).workspace;
 const leave=async n=>{for(let i=0;i<4&&(await state(n)).preferences.open;i++)await ui(n,'app.back');need(!(await state(n)).preferences.open,'UI_NOT_READY');};
 const status=async n=>{const s=parseStatus(await action(n,'account.status',()=>apps[n].evaluate(account,{type:'status'})));need(s.state!=='authorizing','RESTORE_FAILED');if(s.profile){if(owner)need(s.profile.subject===owner,'ACCOUNT_OWNER_CHANGED');else owner=s.profile.subject;}return s;};
 const current=s=>{const rows=s.devices.filter(d=>d.current);need(rows.length===1,'CURRENT_DEVICE_MISSING');return rows[0];};
 const open=async n=>{apps[n]=new NativeApp(candidate.binary,OWNED+'/desktop-'+n,{name:n,env:{NOTES_SYNC_E2E_SLOT:n==='a'?'left':'right'}});children.push(apps[n]);await action(n,'ready',()=>apps[n].ready(60000));};
 const close=async n=>{const r=await closeNativeClients([apps[n]]);need(!r.failed&&r.allClosed,'CLEANUP_FAILED');};
 const ready=async()=>waitFor(async()=>[await status('a'),await status('b')],ss=>ss.every((s,i)=>s.profile&&s.enabled&&s.state==='ready'&&s.devices.filter(d=>d.current).length===1&&s.devices.some(d=>!d.current&&(!registry[i===0?'b':'a']||d.id===registry[i===0?'b':'a'])&&d.online&&d.syncAvailable)),{timeoutMs:90000,code:'RESTORE_TIMEOUT'});
 const check=async(name,details={})=>{report.checks.push({name,status:'pass',...details});await save();console.log('PASS '+name);};
 const footprint=async(n,ids,signal)=>validateFootprint(await footprints.run(await ownedFile(apps[n].directory,'notes.sqlite3'),{notes:ids,requireSync:true},{signal}));
 const negative=async(n,signal)=>{
  const forbidden=specs.filter(s=>!expected[n].has(s.id));if(!forbidden.length)return;
  const r=await probes.run(await ownedFile(apps[n].directory,'notes.sqlite3'),{notes:forbidden.map(s=>s.id),requireSync:true},{signal});
  need(object(r)&&equal(Object.keys(r).sort(),['attachments','branches','descriptors','frontiers','heads','inbox','projection','seen'])&&Object.values(r).every(v=>v===0),'REVERSE_PROTOCOL_DATA');
  for(const s of forbidden)for(const f of s.files.filter(f=>f.mime==='application/octet-stream'))for(const p of [`.sync/blobs/${f.sha256}.blob`,`.sync/network-staging/${f.sha256}-${f.bytes.length}.part`])need(await ownedFile(apps[n].directory,p,{optional:true})===null,'REVERSE_ATTACHMENT_BYTES');
  await noForbiddenStaging(apps[n].directory,forbidden.flatMap(s=>s.files));
 };
 const verifyAll=async()=>{
  for(const n of ['a','b']){await status(n);const w=await workspace(n);checkWorkspace(w,expected[n],folders[n]);
   for(const s of expected[n].values()){
    await leave(n);await ui(n,'note.select',{id:s.id});
    for(const original of s.attachments){const a=w.attachments.find(a=>a.id===original.id),f=s.files.find(f=>f.name===original.displayName);need(a&&f,'ATTACHMENT_MISMATCH');need(hash(await readFile(await ownedFile(apps[n].directory,'attachments/'+a.relativePath)))===f.sha256,'ATTACHMENT_BYTES_MISMATCH');
     const got=await action(n,'attachment.read',()=>apps[n].evaluate(read,{id:a.id,noteId:s.id}));need(got&&got.mime===a.mime&&got.name===a.displayName&&got.recordedAt===(a.recordedAt??null)&&typeof got.data==='string','ATTACHMENT_READ_MISMATCH');const data=Buffer.from(got.data,'base64');need(data.toString('base64')===got.data&&data.length===f.bytes.length&&hash(data)===f.sha256,'ATTACHMENT_READ_MISMATCH');}
    report.verifications.push({phase,device:n,specimen:s.label,semanticSha256:hash(JSON.stringify(stable(s.note))),attachmentCount:s.attachments.length,storedFilesMatch:true,productionReadsMatch:true});
   }
   await negative(n);await save();
  }
 };
 const summary=async()=>waitFor(async()=>{const ws=[await workspace('a'),await workspace('b')],ss=[await status('a'),await status('b')];return {ws,ss};},({ws,ss})=>['a','b'].every((n,i)=>ss.every(s=>{const row=s.devices.find(d=>d.id===registry[n]),e=expectedSummary(ws[i]);return row?.online&&row.summary&&row.summary.noteCount===e.noteCount&&row.summary.lastNoteUpdatedAt===e.lastNoteUpdatedAt;})),{timeoutMs:90000,code:'SUMMARY_TIMEOUT'});
 const idle=async(name,versionFences=[])=>{const samples=await observeWindow(async signal=>{for(const n of ['a','b']){const s=await status(n);need(s.profile&&s.enabled,'ACCOUNT_NOT_ENABLED');checkWorkspace(await workspace(n),expected[n],folders[n]);await negative(n,signal);}for(const fence of versionFences)need(equal(await footprint(fence.receiver,fence.ids,signal),fence.before),'UNREQUESTED_TRANSFER');},()=>{});await check(name,samples);};
 const capture=async(n,label)=>{
  await leave(n);await ui(n,'folder.select',{id:'default'});await ui(n,'note.create');
  const document={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Continuation '+label,marks:[{type:'bold'}]}]},{type:'paragraph',content:[{type:'text',text:'完整正文 / UTF-8 😀 / '+label,marks:[{type:'italic'}]}]}]};
  await ui(n,'editor.setContent',{document});const files=filesFor(label);await ui(n,'attachment.submit',{files:files.map(f=>({name:f.name,mime:f.mime,base64:f.bytes.toString('base64')}))});await ui(n,'app.flush');
  const s=await state(n),note=s.workspace.notes.find(note=>note.id===s.selection.noteId);need(note,'CONTENT_MISSING');need(richText(note.document,'Continuation '+label,['bold'])&&richText(note.document,'完整正文 / UTF-8 😀 / '+label,['italic']),'CONTENT_MISMATCH');const created=specimen(note,s.workspace.attachments.filter(a=>a.noteId===note.id),label,n);need(!specs.some(s=>s.id===created.id),'CONTENT_MISMATCH');specs.push(created);expected[n].set(created.id,created);return created;
 };
 try{
  for(const n of ['a','b'])await open(n);const ss=await ready();for(const [i,n] of ['a','b'].entries()){const row=current(ss[i]);registry[n]=row.id;names[n]=row.name;labels.set(row.id,n);}need(registry.a!==registry.b,'DEVICE_ID_COLLISION');
  const rebuilt=reconstructOriginal(prior,{a:await workspace('a'),b:await workspace('b')});({specs,folders,expected}=rebuilt);phase='completed-push';await verifyAll();await summary();await idle('completed-push complete original documents/bytes and reverse exclusion remain stable');await check('completed-push independently verified from pinned original semantic and byte expectations');
  for(const direction of ['pull','both']){phase=direction;for(const n of ['a','b'])await capture(n,direction+'-'+n);await verifyAll();await ready();
   const facade={evaluate:(expression,arg)=>action('a',arg?.command?'sync.start':arg?.type==='status'?'sync.status':'sync.poll',()=>apps.a.evaluate(expression,arg))};
   const result=await syncOnce(facade,registry.b,direction);expected=afterDirection(expected,direction);
   await waitFor(async()=>{for(const n of ['a','b'])await status(n);return [await workspace('a'),await workspace('b')];},ws=>['a','b'].every((n,i)=>[...expected[n]].every(([id,s])=>ws[i].notes.some(note=>note.id===id&&equal(semantic(note),s.note)))),{timeoutMs:60000,code:'FOREGROUND_APPLY_TIMEOUT'});
   await verifyAll();await summary();await idle(direction+' complete content/attachments and forbidden direction remain stable');await check(direction+' explicit durable receipt plus complete allowed and forbidden checks',{runningObserved:result.runningObserved});
  }
  phase='idle-edits';const fences=[];
  for(const n of ['a','b']){const s=specs.find(s=>s.label==='both-'+n),receiver=n==='a'?'b':'a';fences.push({receiver,ids:[s.id],before:await footprint(receiver,[s.id])});await leave(n);await ui(n,'note.select',{id:s.id});const document=structuredClone(expected[n].get(s.id).note.document);document.content.push({type:'paragraph',content:[{type:'text',text:'Local idle edit '+n,marks:[{type:'bold'},{type:'italic'}]}]});await ui(n,'editor.setContent',{document});await ui(n,'app.flush');const w=await workspace(n),note=w.notes.find(row=>row.id===s.id);need(note&&!equal(semantic(note),s.note)&&richText(note.document,'Local idle edit '+n,['bold','italic'])&&equal(refs(note.document),refs(s.note.document)),'CONTENT_MISMATCH');expected[n].set(s.id,{...s,note:structuredClone(semantic(note))});await capture(n,'idle-'+n);}
  await idle('local edits and new notes remain local including remote protocol version fingerprints',fences);await verifyAll();await summary();
  phase='offline';await close('b');await waitFor(()=>status('a'),s=>{const row=s.devices.find(d=>d.id===registry.b);return row&&!row.online&&!row.syncAvailable&&row.summary===undefined;},{timeoutMs:90000,code:'DIRECTORY_TIMEOUT'});await check('normal B close expires online lease but retains same directory row and hides current summary');await capture('a','offline-a');
  phase='restart-b';await open('b');await ready();const restored=current(await status('b'));need(restored.id===registry.b&&restored.name===names.b,'RESTORE_FAILED');await idle('B normal restart retains identity without hidden transfer',fences);await verifyAll();await summary();
  phase='final-restart';for(const n of ['a','b'])await close(n);for(const n of ['a','b'])await open(n);await ready();for(const n of ['a','b']){const row=current(await status(n));need(row.id===registry[n]&&row.name===names[n],'RESTORE_FAILED');}await idle('both final normal restarts preserve local divergence and never exchange unsolicited data',fences);await verifyAll();await summary();await check('final both-client normal restart preserves every complete document format and original attachment byte');
  report.status='continuation-pass-original-fresh-run-still-failed';
 }catch(error){report.status='fail';report.failure={phase,...safeFailureReceipt(error)};await save();console.log('FAIL '+phase+' '+report.failure.code);}
 finally{
  phase='cleanup';report.probes={absence:await probes.closeAll(),footprints:await footprints.closeAll()};if(Object.values(report.probes).some(p=>!p.allClosed||p.hadFailures))report.status='fail';
  const closed=await closeNativeClients(children);report.lifecycle=closed.lifecycle;report.nativeCleanup={allClosed:closed.allClosed,failed:closed.failed};if(closed.failed||!closed.allClosed)report.status='fail';
  report.productAfter=source(ROOT);report.harnessAfter=source(HARNESS_ROOT);report.originalResultUnchanged=hash(await readFile(OWNED+'/result.json'))===FIRST;
  if(report.productAfter.head!==SOURCE||!report.productAfter.clean||report.harnessAfter.head!==harnessBefore.head||!report.harnessAfter.clean||!report.originalResultUnchanged)report.status='fail';await save();
 }
 console.log('RESULT '+report.status);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(r=>{if(r.status==='fail')process.exitCode=1;}).catch(e=>{console.error(JSON.stringify({code:safeFailure(e)}));process.exitCode=1;});
