#!/usr/bin/env node
// Account110 real-client acceptance. Import/prepare never starts an app or network.
// Prepare: node scripts/verification/account110-device-actions.mjs --output FRESH_PRIVATE_TMP_ROOT
// Run adds: --run --source SHA40 --package-receipt ABS --deployment-source SHA40
//           --deployment-receipt ABS --deployment-sha256 SHA64
// The parent must complete each WAIT via the actual hosted browser form.
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {NativeApp,delay} from './sync108-native-driver.mjs';

const bad=code=>Object.assign(new Error(code),{code});
const need=(v,code='CHECK_FAILED')=>{if(!v)throw bad(code);};
const object=v=>!!v&&Object.getPrototypeOf(v)===Object.prototype;
const record=(v,keys)=>{need(object(v)&&Object.keys(v).every(k=>keys.includes(k)),'INVALID_DTO');return v;};
const count=v=>{need(Number.isSafeInteger(v)&&v>=0,'INVALID_DTO');return v;};
const bool=v=>{need(typeof v==='boolean','INVALID_DTO');return v;};
const text=(v,max)=>{need(typeof v==='string'&&v.length>0&&v.length<=max,'INVALID_DTO');return v;};
const uuid=v=>{need(typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),'INVALID_DTO');return v;};
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const revision=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const directions=['push','pull','both'];
const states=['signedOut','authorizing','connecting','ready','paused','error'];
const accountExpression="window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})";
const startExpression=`(()=>{const key='__CYBERNOTE_ACCOUNT110_ACTION__';if(window[key]&&!window[key].done)throw Error('ACTION_BUSY');const s={sequence:arg.sequence,done:false,failed:false};window[key]=s;Promise.resolve().then(()=>window.__TAURI_INTERNALS__.invoke('account_command',{command:arg.command})).then(status=>{s.status=status;s.done=true;},()=>{s.failed=true;s.done=true;});return {started:true,sequence:s.sequence};})()`;
const pollExpression=`(()=>{const s=window.__CYBERNOTE_ACCOUNT110_ACTION__;if(!s||s.sequence!==arg.sequence)throw Error('ACTION_OWNER');const v={sequence:s.sequence,done:s.done,failed:s.failed,...(s.done&&!s.failed?{status:s.status}:{})};if(s.done)delete window.__CYBERNOTE_ACCOUNT110_ACTION__;return v;})()`;
const readExpression=`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;const access=s.workspace.access,owner=access.notes[arg.noteId];if(!owner?.authorized)throw Error('OWNER_NOT_AUTHORIZED');return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,expected:{sessionId:access.sessionId,epoch:access.epoch,noteEpoch:owner.epoch}});})()`;
export function parseStatus(value){
 const s=record(value,['state','authorizationSurface','enabled','profile','devices','lastSyncAt','pendingCount','conflictCount','error','transportGeneration','deviceOperation']);
 need(states.includes(s.state),'INVALID_DTO');bool(s.enabled);count(s.pendingCount);count(s.conflictCount);
 if('authorizationSurface'in s)need(s.state==='authorizing'&&['embedded','browser'].includes(s.authorizationSurface),'INVALID_DTO');
 if(s.profile!==undefined){record(s.profile,['subject','displayName','username']);text(s.profile.subject,1024);need(typeof s.profile.displayName==='string'&&s.profile.displayName.length<=512,'INVALID_DTO');if(s.profile.username!==undefined)text(s.profile.username,1024);}
 if(s.lastSyncAt!==undefined)count(s.lastSyncAt);
 if(s.error!==undefined){need(object(s.error),'INVALID_DTO');throw bad('ACCOUNT_FAILURE');}
 need(s.state!=='error','ACCOUNT_FAILURE');
 if(s.transportGeneration!==undefined)need(count(s.transportGeneration)>0&&s.state==='ready'&&s.enabled,'INVALID_DTO');
 need(Array.isArray(s.devices)&&s.devices.length<=64,'INVALID_DTO');const ids=new Set();
 for(const d of s.devices){record(d,['id','name','online','current','connected','syncAvailable','summary','transport']);uuid(d.id);need(!ids.has(d.id.toLowerCase()),'INVALID_DTO');ids.add(d.id.toLowerCase());text(d.name,512);for(const k of ['online','current','connected','syncAvailable'])bool(d[k]);
  if(d.summary!==undefined){const m=record(d.summary,['noteCount','lastNoteUpdatedAt','capturedAt']);count(m.noteCount);count(m.capturedAt);if(m.lastNoteUpdatedAt!==null)count(m.lastNoteUpdatedAt);need((m.noteCount===0)===(m.lastNoteUpdatedAt===null)&&d.online,'INVALID_DTO');}
  if(d.transport!==undefined){const t=record(d.transport,['generation','sample','ageMs','enrollment','sync']);need(t.generation===s.transportGeneration&&count(t.generation)>0&&count(t.sample)>0&&count(t.ageMs)<=3000&&d.online&&!d.current,'INVALID_DTO');for(const k of ['enrollment','sync'])need(['webrtc-direct','iroh-direct','cloudflare-tunnel','unavailable','unknown'].includes(t[k]),'INVALID_DTO');}
 }
 need(s.devices.filter(d=>d.current).length<=1,'INVALID_DTO');
 if(s.deviceOperation!==undefined){const o=record(s.deviceOperation,['deviceId','direction','phase','startedAt','finishedAt']);uuid(o.deviceId);need(directions.includes(o.direction)&&['running','succeeded','failed'].includes(o.phase),'INVALID_DTO');count(o.startedAt);if(o.finishedAt!==undefined)need(count(o.finishedAt)>=o.startedAt&&o.phase!=='running','INVALID_DTO');need(o.phase!=='failed','DEVICE_OPERATION_FAILED');}
 return s;
}
export function command(type,args={}){
 record(args,{status:[],signIn:[],setEnabled:['enabled'],syncNow:[],renameDevice:['name'],syncDevice:['deviceId','direction']}[type]??[]);
 switch(type){
 case 'status':case 'syncNow':return {type};
 case 'signIn':return {type,surface:'browser'};
 case 'setEnabled':return {type,enabled:bool(args.enabled)};
 case 'renameDevice':need(typeof args.name==='string'&&args.name===args.name.trim()&&[...args.name].length>=1&&[...args.name].length<=96&&!/[\p{Cc}]/u.test(args.name),'INVALID_COMMAND');return {type,name:args.name};
 case 'syncDevice':need(directions.includes(args.direction),'INVALID_COMMAND');return {type,deviceId:uuid(args.deviceId),direction:args.direction};
 default:throw bad('INVALID_COMMAND');
 }
}
export function safeStatus(s,deviceLabels=new Map()){
 return {state:s.state,enabled:s.enabled,hasProfile:!!s.profile,pendingCount:s.pendingCount,conflictCount:s.conflictCount,
  devices:s.devices.map(d=>({label:deviceLabels.get(d.id)||'other',current:d.current,online:d.online,connected:d.connected,syncAvailable:d.syncAvailable,...(d.summary?{summary:{...d.summary}}:{})})),
  ...(s.deviceOperation?{deviceOperation:{device:deviceLabels.get(s.deviceOperation.deviceId)||'other',direction:s.deviceOperation.direction,phase:s.deviceOperation.phase,startedAt:s.deviceOperation.startedAt,...(s.deviceOperation.finishedAt===undefined?{}:{finishedAt:s.deviceOperation.finishedAt})}}:{})};
}
export async function waitFor(read,ready,{timeoutMs,now=Date.now,sleep=delay,code='CONDITION_TIMEOUT'}={}){
 const start=now();for(;;){const value=await read();if(await ready(value))return value;const left=timeoutMs-(now()-start);need(left>0,code);await sleep(Math.min(150,left));}
}
export async function observeWindow(read,check,{durationMs=5000,now=Date.now,sleep=delay}={}){
 const started=now();let samples=0;for(;;){await check(await read());samples++;const left=durationMs-(now()-started);if(left<=0){need(samples>=2,'INSUFFICIENT_SAMPLES');return {samples,observedMs:now()-started};}await sleep(Math.min(250,left));}
}
export async function syncOnce(app,target,direction,{timeoutMs=200000,now=Date.now,sleep=delay,onStatus=()=>{}}={}){
 const request=command('syncDevice',{deviceId:target,direction});
 const sequence=(app.account110Sequence??0)+1;app.account110Sequence=sequence;
 const started=await app.evaluate(startExpression,{sequence,command:request});need(started?.started===true&&started.sequence===sequence,'ACTION_OWNER');
 let runningObserved=false;
 const end=await waitFor(async()=>{
  const status=parseStatus(await app.evaluate(accountExpression,command('status')));onStatus(status);
  const op=status.deviceOperation;if(op?.phase==='running'){need(op.deviceId===target&&op.direction===direction,'ACTION_OWNER');runningObserved=true;}
  const marker=record(await app.evaluate(pollExpression,{sequence}),['sequence','done','failed','status']);need(marker.sequence===sequence,'ACTION_OWNER');bool(marker.done);bool(marker.failed);
  need(!marker.failed,'ACCOUNT_COMMAND_FAILED');
  if(!marker.done){need(marker.status===undefined,'INVALID_DTO');return null;}
  const terminal=parseStatus(marker.status),receipt=terminal.deviceOperation;
  need(receipt?.deviceId===target&&receipt.direction===direction&&receipt.phase==='succeeded'&&receipt.finishedAt!==undefined,'ACTION_RECEIPT');onStatus(terminal);return terminal;
 },v=>v!==null,{timeoutMs,now,sleep,code:'DEVICE_OPERATION_TIMEOUT'});
 return {status:end,runningObserved};
}
export function parseArgs(args){
 const opts={mode:'prepare',authorizationTimeoutMs:120000};const seen=new Set();
 for(let i=0;i<args.length;i++){const k=args[i];need(['--run','--output','--package-receipt','--source','--deployment-receipt','--deployment-source','--deployment-sha256','--authorization-timeout-ms'].includes(k)&&!seen.has(k),'INVALID_ARGUMENTS');seen.add(k);
  if(k==='--run'){opts.mode='run';continue;}const v=args[++i];need(typeof v==='string'&&!v.startsWith('--'),'INVALID_ARGUMENTS');
  if(k==='--authorization-timeout-ms'){need(/^[0-9]+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)>=120000&&Number(v)<=600000,'INVALID_ARGUMENTS');opts.authorizationTimeoutMs=Number(v);}else opts[k.slice(2)]=v;
 }
 need(isAbsolute(opts.output||'')&&/^\/private\/tmp\/account110-device-actions-[A-Za-z0-9-]+$/.test(opts.output),'INVALID_OUTPUT');
 if(opts.source!==undefined)need(revision(opts.source),'INVALID_ARGUMENTS');
 for(const k of ['package-receipt','deployment-receipt'])if(opts[k]!==undefined)need(isAbsolute(opts[k]),'INVALID_ARGUMENTS');
 if(opts['deployment-source']!==undefined)need(revision(opts['deployment-source']),'INVALID_ARGUMENTS');
 if(opts['deployment-sha256']!==undefined)need(digest(opts['deployment-sha256']),'INVALID_ARGUMENTS');
 if(opts.mode==='run')need(opts.source&&opts['package-receipt']&&opts['deployment-source']&&opts['deployment-receipt']&&opts['deployment-sha256'],'LIVE_INPUTS_REQUIRED');
 return opts;
}
async function fileHash(path){const sha=createHash('sha256');for await(const b of createReadStream(path))sha.update(b);return sha.digest('hex');}
export async function validatePackage(path,source){
 const bytes=await readFile(path);need(bytes.length<256000,'INVALID_PACKAGE');const p=JSON.parse(bytes);
 need(p.schema===1&&p.status==='packaged-adhoc-signed-static-verified-not-launched'&&p.sourceRevision===source&&revision(source)&&digest(p.binarySha256),'INVALID_PACKAGE');
 const i=p.embeddedIdentity;need(i?.info?.sourceRevision===source&&i.info.sourceDirty===false&&i.currentSourceRevalidated===true&&i.nativeBinarySha256===p.binarySha256&&digest(i.info.sourceFingerprint),'INVALID_PACKAGE');
 need(isAbsolute(p.appPath||'')&&p.executable===resolve(p.appPath,'Contents/MacOS/notes-clone'),'INVALID_PACKAGE');
 need((await lstat(p.executable)).isFile()&&await realpath(p.executable)===p.executable,'INVALID_PACKAGE');
 need(await fileHash(p.executable)===p.binarySha256,'BINARY_CHANGED');
 return {binary:p.executable,binarySha256:p.binarySha256,sourceRevision:source,sourceFingerprint:i.info.sourceFingerprint,receiptSha256:hash(bytes)};
}
export async function ownedFile(root,path,{optional=false}={}){
 need(await realpath(root)===root&&(await lstat(root)).isDirectory(),'OWNERSHIP_FAILED');
 need(typeof path==='string'&&!isAbsolute(path)&&path.split(/[\\/]/).every(p=>p&&p!=='.'&&p!=='..'),'OWNERSHIP_FAILED');
 let cursor=root;const parts=path.split(sep);
 for(let i=0;i<parts.length;i++){cursor=resolve(cursor,parts[i]);let st;try{st=await lstat(cursor);}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}need(!st.isSymbolicLink()&&(i===parts.length-1?st.isFile():st.isDirectory()),'OWNERSHIP_FAILED');}
 need(await realpath(cursor)===cursor&&relative(root,cursor)!=='..'&&!relative(root,cursor).startsWith('..'+sep),'OWNERSHIP_FAILED');return cursor;
}
const probeScript=String.raw`import sys,json,sqlite3,urllib.parse
p=json.load(sys.stdin)
db=sqlite3.connect('file:'+urllib.parse.quote(sys.argv[1],safe='/')+'?mode=ro',uri=True)
db.execute('PRAGMA query_only=ON')
names={r[0] for r in db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name GLOB 'sync_*'")}
required={'sync_heads','sync_seen','sync_projection','sync_branches','sync_frontiers','sync_inbox','sync_attachments'}
if (names and not required.issubset(names)) or (p['requireSync'] and not names): raise ValueError('schema')
r={'heads':0,'seen':0,'projection':0,'branches':0,'frontiers':0,'inbox':0,'attachments':0,'descriptors':0}
for entity in p['notes']:
 for key,table in [('heads','sync_heads'),('seen','sync_seen'),('projection','sync_projection'),('branches','sync_branches'),('frontiers','sync_frontiers')]:
  if names: r[key]+=db.execute('SELECT count(*) FROM '+table+' WHERE entity_id=?',(entity,)).fetchone()[0]
 if names: r['inbox']+=db.execute("SELECT count(*) FROM sync_inbox WHERE json_extract(wire,'$.entityId')=?",(entity,)).fetchone()[0]
 r['attachments']+=db.execute('SELECT count(*) FROM attachments WHERE note_id=?',(entity,)).fetchone()[0]
 if names: r['descriptors']+=db.execute("SELECT count(*) FROM sync_attachments WHERE json_extract(descriptor,'$.noteId')=?",(entity,)).fetchone()[0]
print(json.dumps(r,separators=(',',':')))
`;
async function protocolAbsence(app,specimens){
 if(!specimens.length)return;
 const db=await ownedFile(app.directory,'notes.sqlite3');
 const result=await new Promise((ok,reject)=>{
  const child=spawn('/usr/bin/python3',['-I','-c',probeScript,db],{stdio:['pipe','pipe','ignore']});let bytes=Buffer.alloc(0),settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):ok(value);};
  const timer=setTimeout(()=>{child.kill('SIGTERM');finish(bad('PROBE_TIMEOUT'));},10000);
  child.on('error',()=>finish(bad('PROBE_FAILED')));child.stdout.on('data',b=>{bytes=Buffer.concat([bytes,b]);if(bytes.length>2048){child.kill('SIGTERM');finish(bad('PROBE_FAILED'));}});
  child.on('close',code=>{if(code!==0)return finish(bad('PROBE_FAILED'));try{finish(null,JSON.parse(bytes));}catch{finish(bad('PROBE_FAILED'));}});
  child.stdin.on('error',()=>finish(bad('PROBE_FAILED')));child.stdin.end(JSON.stringify({notes:specimens.map(s=>s.id),requireSync:app.account110Enabled===true}));
 });
 record(result,['heads','seen','projection','branches','frontiers','inbox','attachments','descriptors']);need(Object.keys(result).length===8&&Object.values(result).every(v=>v===0),'REVERSE_PROTOCOL_DATA');
 for(const specimen of specimens)for(const file of specimen.files.filter(f=>f.mime==='application/octet-stream')){
  for(const path of [`.sync/blobs/${file.sha256}.blob`,`.sync/network-staging/${file.sha256}-${file.bytes.length}.part`])need(await ownedFile(app.directory,path,{optional:true})===null,'REVERSE_ATTACHMENT_BYTES');
 }
}
const noteSemantic=n=>Object.fromEntries(Object.entries(n).filter(([k])=>k!=='revision'));
const refs=node=>[...(node?.type==='attachment'?[node.attrs?.id]:[]),...(node?.content||[]).flatMap(refs)];
export function expectedSummary(workspace){const notes=workspace.notes.filter(n=>n.deletedAt===null);return {noteCount:notes.length,lastNoteUpdatedAt:notes.length?Math.max(...notes.map(n=>n.updatedAt)):null};}
export function expectedAfter(current,direction){need(directions.includes(direction),'INVALID_COMMAND');const result={a:new Set(current.a),b:new Set(current.b)};if(direction!=='pull')for(const id of current.a)result.b.add(id);if(direction!=='push')for(const id of current.b)result.a.add(id);return result;}
function filesFor(label){
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64');
 const seed=Buffer.from(label),bin=Buffer.alloc(256*1024+17);for(let i=0;i<bin.length;i++)bin[i]=(seed[i%seed.length]+i*13)%256;
 return [['specimen.png','image/png',png],['specimen.bin','application/octet-stream',bin]].map(([name,mime,bytes])=>({name,mime,bytes,sha256:hash(bytes)}));
}
export async function main(argv, {App=NativeApp,print=console.log}={}){
 const opts=parseArgs(argv);need(await realpath('/private/tmp')==='/private/tmp','OWNERSHIP_FAILED');
 let candidate;
 if(opts['package-receipt'])candidate=await validatePackage(opts['package-receipt'],opts.source);
 let deployment;
 if(opts['deployment-receipt']){const bytes=await readFile(opts['deployment-receipt']);need(bytes.length<=1000000&&opts['deployment-source']&&hash(bytes)===opts['deployment-sha256'],'DEPLOYMENT_EVIDENCE_INVALID');deployment={sourceRevision:opts['deployment-source'],receiptSha256:hash(bytes),boundary:'Operator-supplied deployment receipt; runner does not attest its contents. Real native directory commands are exercised during run.'};}
 await mkdir(opts.output,{mode:0o700}); // Fresh, exclusive root; never reuse an existing library.
 const report={schema:1,kind:'account110-real-two-client-device-actions',mode:opts.mode,status:opts.mode==='prepare'?'prepared-not-run':'running',source:opts.source??null,candidate: candidate?{sourceRevision:candidate.sourceRevision,sourceFingerprint:candidate.sourceFingerprint,binarySha256:candidate.binarySha256,receiptSha256:candidate.receiptSha256}:null,deployment:deployment??null,authorizationTimeoutMs:opts.authorizationTimeoutMs,
  runnerSha256:hash(await readFile(fileURLToPath(import.meta.url))),driverSha256:hash(await readFile(new URL('./sync108-native-driver.mjs',import.meta.url))),checks:[],observations:[],boundaries:['Only two fresh owned data-dir libraries; no default library access or credential/Noise copying.','Real normal hosted SignIn with human form assistance. No credentials/callbacks/tokens/endpoints are accepted by the runner.','Synthetic content enters production UI/debug handlers; attachment checks use disk bytes and production read_attachment.','Debug/e2e, synthetic File[] submission; no physical file-picker or keyboard claim.','Absence/idle observations are finite, not an unbounded guarantee.','No logout, destructive cleanup or automatic retry; failed evidence and owned test libraries are retained.']};
 const save=()=>writeFile(resolve(opts.output,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 if(opts.mode==='prepare'){report.requiredBeforeRun=['independently reviewed merged client and exact static-verified package','independently verified production device API deployment and its receipt hash/source','parent authorization for real hosted SignIn and two fresh owned clients'];await save();return report;}
 const children=[],apps={},specimens=[],baselines={},ids={},labels=new Map(),authenticated=new Set(),restoring=new Set();let expected={a:new Set(),b:new Set()},owner,phase='startup';
 const check=name=>{report.checks.push({name,status:'pass'});print('PASS '+name);};
 const noteStatus=(name,s)=>{const safe={device:name,phase,...safeStatus(s,labels)},last=report.observations.at(-1);if(!equal(last,safe)&&report.observations.length<512)report.observations.push(safe);};
 const status=async app=>{const s=parseStatus(await app.evaluate(accountExpression,command('status')));noteStatus(app.name,s);app.account110Enabled=s.enabled;if(authenticated.has(app.name)&&!restoring.has(app.name))need(s.profile?.subject===owner&&s.state!=='authorizing','ACCOUNT_OWNER_CHANGED');if(owner&&s.profile)need(s.profile.subject===owner,'ACCOUNT_OWNER_CHANGED');return s;};
 const account=async(app,type,args)=>{const s=parseStatus(await app.evaluate(accountExpression,command(type,args),60000));noteStatus(app.name,s);if(owner&&s.profile)need(s.profile.subject===owner,'ACCOUNT_OWNER_CHANGED');return s;};
 const commandUI=async(app,id,args={})=>{await app.execute(id,args);await app.idle();};
 const ws=async app=>(await app.state()).workspace;
 const leave=async app=>{for(let i=0;i<4&&(await app.state()).preferences.open;i++)await commandUI(app,'app.back');need(!(await app.state()).preferences.open,'UI_NOT_READY');};
 const open=async name=>{if(authenticated.has(name))restoring.add(name);need(await fileHash(candidate.binary)===candidate.binarySha256,'BINARY_CHANGED');const app=new App(candidate.binary,resolve(opts.output,'desktop-'+name),{name,env:{NOTES_SYNC_E2E_SLOT:name==='a'?'left':'right'}});children.push(app);apps[name]=app;await app.ready(60000);return app;};
 const close=async app=>{await app.close();need(app.lifecycle.naturalExit===true,'CLEANUP_FAILED');};
 const capture=async(app,label)=>{
  await leave(app);await commandUI(app,'folder.select',{id:'default'});await commandUI(app,'note.create');
  const document={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:`Account110 ${label}`,marks:[{type:'bold'}]}]},{type:'paragraph',content:[{type:'text',text:'完整正文 / UTF-8 😀 / '+label,marks:[{type:'italic'}]}]}]};
  await commandUI(app,'editor.setContent',{document});const files=filesFor(label);
  await commandUI(app,'attachment.submit',{files:files.map(f=>({name:f.name,mime:f.mime,base64:f.bytes.toString('base64')}))});await commandUI(app,'app.flush');
  const state=await app.state(),note=state.workspace.notes.find(n=>n.id===state.selection.noteId);need(note,'CONTENT_MISSING');
  const attachments=state.workspace.attachments.filter(a=>a.noteId===note.id);need(attachments.length===files.length,'ATTACHMENT_MISMATCH');
  const specimen={id:note.id,label,owner:app.name,note:noteSemantic(note),attachments,files};specimens.push(specimen);
  (report.specimens??=[]).push({label,origin:app.name,semanticSha256:hash(JSON.stringify(stable(specimen.note))),attachments:files.map(f=>({mime:f.mime,bytes:f.bytes.length,sha256:f.sha256}))});expected[app.name].add(specimen.id);return specimen;
 };
 const baseline=async app=>{
  const workspace=await ws(app),saved={notes:workspace.notes.map(noteSemantic),folders:workspace.folders.map(f=>structuredClone(f)),attachments:[]};
  for(const a of workspace.attachments){const path=await ownedFile(app.directory,'attachments/'+a.relativePath);saved.attachments.push({metadata:structuredClone(a),sha256:await fileHash(path)});}
  baselines[app.name]=saved;
  (report.initialBusinessBaselines??=[]).push({device:app.name,notes:saved.notes.length,folders:saved.folders.length,attachments:saved.attachments.length,semanticSha256:hash(JSON.stringify(stable(saved)))});
 };
 const preserveBaseline=async(app,workspace)=>{
  const saved=baselines[app.name];for(const n of saved.notes)need(equal(noteSemantic(workspace.notes.find(row=>row.id===n.id)||{}),n),'CONTENT_MISMATCH');
  for(const f of saved.folders)need(equal(workspace.folders.find(row=>row.id===f.id),f),'CONTENT_MISMATCH');
  for(const a of saved.attachments){need(equal(workspace.attachments.find(row=>row.id===a.metadata.id),a.metadata),'ATTACHMENT_MISMATCH');const path=await ownedFile(app.directory,'attachments/'+a.metadata.relativePath);need(await fileHash(path)===a.sha256,'ATTACHMENT_BYTES_MISMATCH');}
 };
 const verify=async(app,specimen)=>{
  const workspace=await ws(app),note=workspace.notes.find(n=>n.id===specimen.id);need(note&&equal(noteSemantic(note),specimen.note),'CONTENT_MISMATCH');
  const attachments=workspace.attachments.filter(a=>a.noteId===note.id);need(attachments.length===specimen.attachments.length,'ATTACHMENT_MISMATCH');
  await leave(app);await commandUI(app,'note.select',{id:note.id});
  for(const original of specimen.attachments){const a=attachments.find(a=>a.id===original.id),file=specimen.files.find(f=>f.name===original.displayName);need(a&&file&&refs(note.document).includes(a.id),'ATTACHMENT_MISMATCH');
   // relativePath is local storage placement; all wire/user metadata must match.
   for(const k of ['id','noteId','kind','mime','displayName','size','recordedAt'])need(a[k]===original[k],'ATTACHMENT_MISMATCH');
   const path=await ownedFile(app.directory,'attachments/'+a.relativePath);need(await fileHash(path)===file.sha256,'ATTACHMENT_BYTES_MISMATCH');
   const read=await app.evaluate(readExpression,{id:a.id,noteId:note.id});need(read&&read.mime===a.mime&&read.name===a.displayName&&read.recordedAt===(a.recordedAt??null),'ATTACHMENT_READ_MISMATCH');
   const bytes=Buffer.from(read.data,'base64');need(bytes.length===file.bytes.length&&hash(bytes)===file.sha256,'ATTACHMENT_READ_MISMATCH');
  }
  if((report.contentVerifications??=[]).length<512)report.contentVerifications.push({phase,device:app.name,specimen:specimen.label,semanticSha256:hash(JSON.stringify(stable(noteSemantic(note)))),attachmentCount:attachments.length,storedFilesMatch:true,productionReadsMatch:true});
 };
 const verifyExpected=async()=>{for(const name of ['a','b']){const app=apps[name];await status(app);const workspace=await ws(app);await preserveBaseline(app,workspace);const forbidden=specimens.filter(s=>!expected[name].has(s.id));
  for(const s of specimens.filter(s=>expected[name].has(s.id)))await verify(app,s);
  need(forbidden.every(s=>!workspace.notes.some(n=>n.id===s.id)),'REVERSE_CONTENT');await protocolAbsence(app,forbidden);
 }};
 const idle=async label=>{const sample=await observeWindow(async()=>{const rows=await Promise.all(['a','b'].map(n=>status(apps[n])));for(const s of rows)need(s.profile&&s.enabled,'ACCOUNT_NOT_ENABLED');return Promise.all(['a','b'].map(n=>ws(apps[n])));},async workspaces=>{
  for(const [i,name] of ['a','b'].entries()){for(const s of specimens){const note=workspaces[i].notes.find(n=>n.id===s.id);if(expected[name].has(s.id))need(note&&equal(noteSemantic(note),s.note),'CONTENT_MISMATCH');else need(!note,'UNREQUESTED_TRANSFER');}await protocolAbsence(apps[name],specimens.filter(s=>!expected[name].has(s.id)));}
 });report.checks.push({name:label,status:'pass',...sample});};
 const current=s=>{const rows=s.devices.filter(d=>d.current);need(rows.length===1,'CURRENT_DEVICE_MISSING');return rows[0];};
 const directory=async({offline=false}={})=>waitFor(async()=>{const s=await status(apps.a);return {s,row:s.devices.find(d=>d.id===ids.b)};},({row})=>!!row&&(offline?!row.online&&row.summary===undefined:row.online),{timeoutMs:90000,code:'DIRECTORY_TIMEOUT'});
 const summary=async()=>waitFor(async()=>{
  const workspaces=await Promise.all(['a','b'].map(n=>ws(apps[n]))),statuses=await Promise.all(['a','b'].map(n=>status(apps[n])));return {workspaces,statuses};
 },({workspaces,statuses})=>['a','b'].every((name,i)=>statuses.every(s=>{const d=s.devices.find(d=>d.id===ids[name]),e=expectedSummary(workspaces[i]);return d?.online&&d.summary&&d.summary.noteCount===e.noteCount&&d.summary.lastNoteUpdatedAt===e.lastNoteUpdatedAt;})),{timeoutMs:90000,code:'SUMMARY_TIMEOUT'});
 try{
  for(const name of ['a','b']){await mkdir(resolve(opts.output,'desktop-'+name),{mode:0o700});await open(name);const s=await status(apps[name]);need(s.state==='signedOut'&&!s.enabled&&!s.profile&&s.devices.length===0,'FRESH_LIBRARY_REQUIRED');await baseline(apps[name]);await capture(apps[name],'initial-'+name);}
  await verifyExpected();check('two fresh independent native stores, rich documents and original attachment bytes');
  for(const name of ['a','b']){await close(apps[name]);await open(name);}
  await verifyExpected();check('independent real process restart preserves local content and attachments');
  for(const name of ['a','b']){phase='login-'+name;await commandUI(apps[name],'settings.open');await commandUI(apps[name],'settings.tab',{tab:'account'});print('WAIT '+name+' normal hosted browser SignIn; parent completes real form');
   const begin=parseStatus(await account(apps[name],'signIn'));need(begin.state==='authorizing'||begin.profile,'LOGIN_FAILED');
   report.checkpoint={phase,client:name,waitingFor:'human-hosted-form',credentialsCaptured:false,authorizationUrlCaptured:false};await save();
   const logged=await waitFor(()=>status(apps[name]),s=>{need(s.state!=='signedOut','LOGIN_FAILED');return !!s.profile&&s.state!=='authorizing';},{timeoutMs:opts.authorizationTimeoutMs,code:'AUTHORIZATION_TIMEOUT'});
   need(logged.profile&&!logged.enabled&&logged.state==='paused','LOGIN_NOT_PAUSED');if(owner)need(logged.profile.subject===owner,'ACCOUNT_OWNER_CHANGED');else owner=logged.profile.subject;authenticated.add(name);await leave(apps[name]);await save();
  }
  delete report.checkpoint;check('two normal hosted logins resolve to same verified account, initially paused');phase='directory';
  for(const name of ['a','b']){await waitFor(()=>status(apps[name]),s=>s.devices.filter(d=>d.current).length===1,{timeoutMs:90000,code:'DIRECTORY_TIMEOUT'});ids[name]=current(await status(apps[name])).id;labels.set(ids[name],name);await account(apps[name],'renameDevice',{name:'Account110 '+name.toUpperCase()});}
  need(ids.a!==ids.b,'DEVICE_ID_COLLISION');
  await waitFor(()=>Promise.all(['a','b'].map(n=>status(apps[n]))),ss=>ss.every(s=>['a','b'].every(n=>s.devices.some(d=>d.id===ids[n]&&d.online&&d.name==='Account110 '+n.toUpperCase()&&!d.syncAvailable))),{timeoutMs:90000,code:'DIRECTORY_TIMEOUT'});
  await summary();check('paused same-account directory, stable distinct registry IDs, rename and true note summaries');
  phase='enable';for(const name of ['a','b'])await account(apps[name],'setEnabled',{enabled:true});
  await waitFor(()=>Promise.all(['a','b'].map(n=>status(apps[n]))),ss=>ss.every(s=>s.enabled&&s.profile&&s.devices.some(d=>!d.current&&d.online&&d.syncAvailable)),{timeoutMs:90000,code:'DIRECTORY_TIMEOUT'});
  await account(apps.a,'syncNow');await account(apps.b,'syncNow');await idle('enable, discovery and explicit syncNow never exchange unsolicited data');
  for(const direction of directions){phase=direction;for(const name of ['a','b'])await capture(apps[name],direction+'-'+name);await verifyExpected();
   const result=await syncOnce(apps.a,ids.b,direction,{onStatus:s=>{need(s.profile?.subject===owner,'ACCOUNT_OWNER_CHANGED');noteStatus('a',s);}});expected=expectedAfter(expected,direction);
   // Durable completion and foreground apply are independently observed.
   await waitFor(async()=>{await Promise.all(['a','b'].map(n=>status(apps[n])));return Promise.all(['a','b'].map(n=>ws(apps[n])));},w=>['a','b'].every((n,i)=>specimens.filter(s=>expected[n].has(s.id)).every(s=>w[i].notes.some(note=>note.id===s.id&&equal(noteSemantic(note),s.note)))),{timeoutMs:60000,code:'FOREGROUND_APPLY_TIMEOUT'});
   await verifyExpected();check(direction+' allowed complete documents/production attachment reads/raw bytes and forbidden protocol/blob absence');report.checks.at(-1).runningObserved=result.runningObserved;await summary();await idle(direction+' terminal exchange does not continue in background');await save();
  }
  phase='late-edits';for(const name of ['a','b'])await capture(apps[name],'late-'+name);await idle('later local edits remain isolated without a new explicit action');await verifyExpected();
  phase='offline';await close(apps.b);await directory({offline:true});check('offline registry row retained and current summary hidden');
  await capture(apps.a,'offline-a');phase='restart-b';await open('b');
  const restored=await waitFor(()=>status(apps.b),s=>!!s.profile&&s.state!=='authorizing',{timeoutMs:120000,code:'RESTORE_TIMEOUT'});need(restored.profile.subject===owner&&restored.enabled,'RESTORE_FAILED');restoring.delete('b');
  await waitFor(()=>status(apps.b),s=>s.devices.some(d=>d.current&&d.id===ids.b&&d.name==='Account110 B'),{timeoutMs:90000,code:'DIRECTORY_TIMEOUT'});await directory();await idle('offline restart restores same device and account without hidden transfer');await verifyExpected();await summary();check('normal offline restart preserves registry identity, name, complete content and original attachment bytes');
  report.status='pass';
 }catch(error){report.status='fail';report.failure={phase,code:safeFailure(error)};print('FAIL '+phase+' '+report.failure.code);}
 finally{
  const closed=await Promise.allSettled(children.map(app=>app.close()));report.lifecycle=children.map(app=>({device:app.name,naturalExit:app.lifecycle.naturalExit===true,exitCode:app.lifecycle.exit?.code??null,forcedSignals:(app.lifecycle.forcedSignals||[]).filter(s=>['SIGTERM','SIGKILL'].includes(s))}));
  if(closed.some(r=>r.status==='rejected')||report.lifecycle.some(l=>!l.naturalExit)){report.status='fail';report.cleanupFailure={code:'CLEANUP_FAILED'};}
  report.finishedAt=new Date().toISOString();await save();
 }
 return report;
}
export function safeFailure(error){const codes=['INVALID_DTO','ACCOUNT_FAILURE','DEVICE_OPERATION_FAILED','ACCOUNT_OWNER_CHANGED','ACTION_OWNER','ACTION_RECEIPT','ACCOUNT_COMMAND_FAILED','DEVICE_OPERATION_TIMEOUT','BINARY_CHANGED','OWNERSHIP_FAILED','PROBE_TIMEOUT','PROBE_FAILED','REVERSE_PROTOCOL_DATA','REVERSE_ATTACHMENT_BYTES','CONTENT_MISSING','CONTENT_MISMATCH','ATTACHMENT_MISMATCH','ATTACHMENT_BYTES_MISMATCH','ATTACHMENT_READ_MISMATCH','REVERSE_CONTENT','UNREQUESTED_TRANSFER','ACCOUNT_NOT_ENABLED','CURRENT_DEVICE_MISSING','DIRECTORY_TIMEOUT','SUMMARY_TIMEOUT','FRESH_LIBRARY_REQUIRED','LOGIN_FAILED','LOGIN_NOT_PAUSED','AUTHORIZATION_TIMEOUT','DEVICE_ID_COLLISION','FOREGROUND_APPLY_TIMEOUT','RESTORE_TIMEOUT','RESTORE_FAILED','UI_NOT_READY','CLEANUP_FAILED','HELLO_TIMEOUT','NATIVE_TIMEOUT','DRIVER_TIMEOUT','TIMEOUT','SPAWN_ERROR'];return codes.includes(error?.code)?error.code:'CHECK_FAILED';}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main(process.argv.slice(2)).then(report=>{console.log('RESULT '+report.status);if(report.status==='fail')process.exitCode=1;}).catch(()=>{console.error('FAIL INPUT_OR_PREPARE');process.exitCode=1;});
}
