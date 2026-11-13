#!/usr/bin/env node
// Preserved full02 continuation via fixed native functions. Importing is inert.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,appendFile,lstat,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HeadlessApp,OPS,TRANSPORT,PARTICIPANT} from './account109-headless-driver.mjs';
import {options as recoveryOptions,STORES,hash,priorEntity,readBaseline,canonicalBranch,validateBaselines,verifyBytes,boundedPoll,observeLogoutDirections,finishRecovery} from './account109-desktop-recovery.mjs';
import {statusObserver,requireHealthy,signedOut,snapshotNotes,failureCode} from './account109-desktop-helpers.mjs';

const USERNAME='cybernoteqa20261113a';
export function options(argv){
  const rest=[],source=[];
  for(let i=0;i<argv.length;i++){if(argv[i]==='--binary-source-revision')source.push(argv[++i]);else rest.push(argv[i]);}
  assert.equal(source.length,1,'One --binary-source-revision required');assert(/^[a-f0-9]{40}$/.test(source[0]),'Full source revision required');
  return {...recoveryOptions(rest),sourceRevision:source[0]};
}
const DRIVER_CODES=['NATIVE_OPERATION_FAILED','DRIVER_TIMEOUT','HELLO_TIMEOUT','INVALID_HELLO','INVALID_FRAME','INVALID_RESPONSE','UNEXPECTED_RESPONSE','TRUNCATED_FRAME','STDOUT_LINE_TOO_LARGE','NOT_HEADLESS_NATIVE_APP','INVALID_SHUTDOWN','EXIT_BEFORE_HELLO','EXIT_BEFORE_RESPONSE','SPAWN_ERROR','STDIN_ERROR','APP_CLOSING','APP_EXITED','NATURAL_EXIT_TIMEOUT','TERM_EXIT_TIMEOUT','KILL_EXIT_TIMEOUT','PIPE_CLOSE_TIMEOUT','NON_NATURAL_EXIT'];
export const safeFailure=error=>DRIVER_CODES.includes(error?.code)?error.code:failureCode(error);
export function checkpoint(report,save,append){
  let sequence=0;
  return async(peer,operation,work)=>{
    assert(['a','b'].includes(peer)&&[...OPS,'close'].includes(operation),'Fixed checkpoint required');
    const before={sequence:++sequence,stage:report.phase,device:peer,operation,event:'before',at:new Date().toISOString()};report.lastOperation=before;await save();await append(before);
    try{const value=await work();const after={...before,event:'after',at:new Date().toISOString()};report.lastOperation=after;await append(after);return value;}
    catch(error){const failed={...before,event:'failed',code:safeFailure(error),at:new Date().toISOString()};report.lastOperation=failed;await append(failed);await save();throw error;}
  };
}
export function connectedPair(statuses){
  if(statuses.length!==2||!statuses.every(s=>s.state==='ready'&&!s.error&&s.enabled))return false;
  const current=statuses.map(s=>s.devices.filter(d=>d.current));
  if(current.some(ds=>ds.length!==1)||current[0][0].id===current[1][0].id)return false;
  return statuses.every((s,i)=>s.devices.some(d=>d.id===current[1-i][0].id&&!d.current&&d.online&&d.connected));
}
export function assertExistingConflict(result,heads,entityId){
  assert.equal(result.conflicts?.length,1,'Exactly the existing target conflict, no others');const row=result.conflicts[0];assert.equal(row.kind,'note');assert.equal(row.entityId,entityId);
  assert.deepEqual(row.variants.map(v=>v.digest).sort(),heads.map(h=>h.digest).sort(),'Native variants must be the existing SQLite heads');
  for(const head of heads){const variant=row.variants.find(v=>v.digest===head.digest);assert.equal(variant.title,head.payload.note.title);assert.equal(variant.updatedAt,head.payload.note.updatedAt);assert.equal(variant.attachmentCount,head.payload.attachments.length);assert.equal(variant.deleted,false);assert.equal(variant.purged,false);assert.equal(variant.locked,false);}
}
export function branchMatches(workspace,heads,entityId){
  const matches=heads.map(h=>workspace.notes.filter(n=>n.title===h.payload.note.title&&!n.deletedAt&&canonicalBranch({note:n,attachments:workspace.attachments.filter(a=>a.noteId===n.id)},false)===canonicalBranch(h.payload,false)));
  if(matches.some(ms=>ms.length!==1))return null;assert.notEqual(matches[0][0].id,matches[1][0].id);assert(matches.some(ms=>ms[0].id===entityId),'Original target ID retained');return matches.map(ms=>ms[0]);
}
export const plainDocument=(title,text)=>({type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:title}]},{type:'paragraph',content:[{type:'text',text}]}]});
export function assertCreated(note,title,text){assert(note&&typeof note.id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(note.id));assert.deepEqual(note.document,plainDocument(title,text));assert.equal(note.plainText,title+'\n'+text);return note;}

// Device-free seam. Only open() constructs a process in the actual entry point.
export async function runCases({open,report,save,trace,heads,entityId,verify=verifyBytes,poll=boundedPoll,connectionMs=120000,dataMs=60000,logoutMs=3000,clock={now:()=>performance.now()}}){
  const call=(peer,op,...args)=>{assert(OPS.includes(op));return trace(peer.name,op,()=>peer[op](...args));};
  const observe=statusObserver(report,()=>report.phase);
  const status=async peer=>{const s=await call(peer,'accountStatus');observe(peer.name,s);return s;};
  const statuses=async peers=>{const ss=await Promise.all(peers.map(status)),healthy=ss.map(s=>requireHealthy(s,{pendingNetwork:true}));
    for(const s of ss)if(s.profile)assert.equal(s.profile.username,USERNAME,'Expected synthetic owner');
    if(ss.every(s=>s.profile))assert(ss.every(s=>s.profile.subject===ss[0].profile.subject),'Same real owner required');return {ss,healthy:healthy.every(Boolean)};};
  const connect=peers=>poll('both native peers connected',async()=>{const {ss,healthy}=await statuses(peers);return healthy&&ss.every(s=>s.profile?.username===USERNAME)&&connectedPair(ss);},connectionMs);
  const bytes=(peer,ws,expected)=>verify(peer,ws,a=>call(peer,'readAttachment',a.id),expected);
  const check=name=>report.checks.push({name,status:'pass'});
  report.phase='existing-conflict';report.scenarios.conflict='running';await save();
  let a=await open('a');await call(a,'ready');const b=await open('b');await call(b,'ready');
  await connect([a,b]);
  for(const peer of [a,b])assertExistingConflict(await call(peer,'conflicts'),heads,entityId);
  report.resolve={entityId,chosenExistingDigest:heads[0].digest,keepAll:true,bypassesGuiConfirmation:true};await save();
  await call(a,'keepAll',entityId,heads[0].digest);
  await connect([a,b]);
  const resolved=new Map();
  await poll('both complete branches applied',async()=>{
    const {ss,healthy}=await statuses([a,b]);if(!healthy||!connectedPair(ss)||!ss.every(s=>s.conflictCount===0))return false;
    for(const peer of [a,b]){const ws=await call(peer,'workspace'),notes=branchMatches(ws,heads,entityId);if(!notes)return false;resolved.set(peer.name,{ws,notes});}return true;
  },dataMs);
  for(const peer of [a,b]){const {ws,notes}=resolved.get(peer.name);for(const [i,note] of notes.entries()){
    const attachments=await bytes(peer,{attachments:ws.attachments.filter(a=>a.noteId===note.id)});const actual=canonicalBranch({note,attachments}),expected=canonicalBranch(heads[i].payload);assert.equal(actual,expected,'Full payload and original bytes retained after ID remap');
    report.observations.push({kind:'resolved-complete-branch',device:peer.name,noteId:note.id,existingHeadDigest:heads[i].digest,canonicalPayloadSha256:hash(actual),attachments:attachments.map(a=>({id:a.id,noteId:a.noteId,name:a.displayName,size:a.size,sha256:a.sha256})),productionReadAndStoredFile:true});
  }assert.equal((await call(peer,'conflicts')).conflicts.length,0);}
  report.scenarios.conflict='pass';check('exact existing conflict keep-all preserves both complete branches and original PNG/bin on both peers');await save();
  report.phase='logout';report.scenarios.logout='running';await save();
  const before=await call(a,'workspace'),snapshot=snapshotNotes(before.notes),allBytes=await bytes(a,before);
  report.preLogout={notes:snapshot.map(n=>({id:n.id,fullBodySha256:hash(n.body)})),attachments:allBytes.map(a=>({id:a.id,noteId:a.noteId,size:a.size,sha256:a.sha256}))};await save();
  const out=await call(a,'signOut');observe('a',out);requireHealthy(out,{pendingNetwork:true});
  await poll('A signed out',async()=>{const s=await status(a);return requireHealthy(s,{pendingNetwork:true})&&signedOut(s);},15000);
  const suffix=randomUUID(),title='account109-local-'+suffix,text='account109-local 退出后本地完整正文 😀 '+suffix;
  const local=assertCreated(await call(a,'createPlainNote',title,text),title,text);assert(!snapshot.some(n=>n.id===local.id));snapshot.push(...snapshotNotes([local]));
  report.postLogoutLocalEdit={noteId:local.id,fullBodySha256:hash(snapshot.at(-1).body),sessionSave:true};await save();
  const remoteIds=[];
  async function remote(){const s=await status(b);requireHealthy(s);assert(s.profile?.username===USERNAME&&s.enabled&&s.state==='ready');const suffix=randomUUID(),title='account109-remote-'+suffix,text='account109-remote 退出后远端完整正文 🌏 '+suffix;const note=assertCreated(await call(b,'createPlainNote',title,text),title,text);assert(!snapshot.some(n=>n.id===note.id)&&!remoteIds.includes(note.id));remoteIds.push(note.id);}
  async function exclude(label){
    const proof=await observeLogoutDirections({readStatus:()=>status(a),readNotes:async()=>(await call(a,'workspace')).notes,readRemoteNotes:async()=>{const s=await status(b);requireHealthy(s);assert(s.profile?.username===USERNAME&&s.enabled&&s.state==='ready');return (await call(b,'workspace')).notes;},localNoteId:local.id,snapshot,remoteIds,durationMs:logoutMs,...clock});
    await bytes(a,await call(a,'workspace'),allBytes);report.observations.push({kind:'two-way-logout-exclusion',label,...proof,localNoteId:local.id,remoteNoteIds:[...remoteIds],allLocalBodiesAndRawAttachmentsPreserved:true,localEditPreservedAndAbsentRemotely:true});await save();
  }
  await remote();await exclude('before restart');await trace('a','close',()=>a.close());assert(a.lifecycle.naturalExit===true);a=await open('a');await call(a,'ready');await remote();await exclude('after restart');
  report.scenarios.logout='pass';check('real sign-out stops new data in both directions before/after A restart while all local bodies, local edit and raw attachments survive');await save();
}

export async function run(argv=process.argv.slice(2)){
  const opts=options(argv),{binary,stores,prior,output}=opts;
  for(const directory of [stores,prior,...['a','b'].map(n=>resolve(stores,'desktop-'+n))])assert((await lstat(directory)).isDirectory()&&await realpath(directory)===directory,'Canonical original roots required');
  const priorBytes=await readFile(resolve(prior,'result.json')),previous=JSON.parse(priorBytes),entityId=priorEntity(previous);
  for(const p of previous.lifecycle){assert(Number.isInteger(p.pid)&&p.pid>0);try{process.kill(p.pid,0);assert.fail('Prior process still exists');}catch(error){if(error.code!=='ESRCH')throw error;}}
  const binarySha256=hash(await readFile(binary));assert.notEqual(binarySha256,previous.binary.sha256,'Headless binary must be independently rebuilt and reviewed');
  await mkdir(output,{mode:0o700});assert.equal(await realpath(output),output);
  const report={schema:1,kind:'account109-preserved-full02-headless-recovery',status:'running',phase:'baseline',startedAt:new Date().toISOString(),checks:[],observations:[],scenarios:{conflict:'not-run',logout:'not-run'},prior:{path:prior,resultSha256:hash(priorBytes),failure:previous.failure,passedChecks:previous.checks.filter(c=>c.status==='pass').length},binary:{path:binary,sha256:binarySha256,sourceRevision:opts.sourceRevision,sourceAuthority:'caller-declared; independent build receipt review required',differsFromPrior:true,priorSha256:previous.binary.sha256},nativeBoundary:{transport:TRANSPORT,participant:PARTICIPANT,windows:0,fixedOperations:true},tools:{},limitations:[
    'Preserved full02 continuation only; the ten prior passed phases are not rerun or reclassified. Historical eval/startup failure causes remain unproven.',
    'Native harness participant replies to real Session coordination without any WebView, renderer, editor draft or GUI confirmation. This is native function/account transport coverage, not IPC-origin or UI acceptance.',
    'Only existing original grants restore through production owners. No sign-in, grant copies, tokens, callbacks, URLs, settings or manual pairing are supplied.',
    'createPlainNote uses production Session save operations with bounded synthetic title/text; it does not exercise the frontend editor.',
    'Logout exclusion is sampled for 3 seconds before/after actual A process restart. Original read-only DB snapshots/full synthetic branch payloads are private evidence, not sanitized repository exports.',
    'Updated executable hash and caller-declared source revision differ from the prior WebView candidate; source/build linkage requires the independent build receipt.'
  ]};
  for(const name of ['account109-headless-driver.mjs','account109-headless-recovery.mjs','account109-desktop-recovery.mjs','account109-desktop-helpers.mjs'])report.tools[name]=hash(await readFile(new URL(name,import.meta.url)));
  let saving=Promise.resolve();const save=()=>{const text=JSON.stringify(report,null,2)+'\n';saving=saving.then(()=>writeFile(resolve(output,'result.json'),text,{mode:0o600}));return saving;};
  const trace=checkpoint(report,save,row=>appendFile(resolve(output,'steps.jsonl'),JSON.stringify(row)+'\n',{mode:0o600})),children=[];
  const open=async name=>{const env=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].map(k=>[k,'']));const app=new HeadlessApp(binary,resolve(STORES,'desktop-'+name),{name,env});children.push(app);return app;};
  try{
    await save();await writeFile(resolve(output,'prior-full02-result.json'),priorBytes,{flag:'wx',mode:0o600});const baselines=[];
    for(const name of ['a','b'])baselines.push(await readBaseline(resolve(stores,'desktop-'+name),resolve(output,'sqlite-readonly-'+name),entityId));
    const heads=validateBaselines(baselines,entityId);const baselineText=JSON.stringify({entityId,baselines},null,2)+'\n';await writeFile(resolve(output,'baseline.json'),baselineText,{flag:'wx',mode:0o600});
    report.baseline={entityId,sha256:hash(baselineText),heads:heads.map(h=>({digest:h.digest,canonicalPayloadSha256:hash(canonicalBranch(h.payload))})),originalFiles:baselines.map(b=>b.originalFiles),mode:'ro',queryOnly:true,originalFilesUnchanged:true};report.checks.push({name:'two exact full branch baselines sealed read-only before any process launch',status:'pass'});await save();
    await runCases({open,report,save,trace,heads,entityId});
  }catch(error){report.status='fail';if(report.phase==='existing-conflict')report.scenarios.conflict='fail';if(report.phase==='logout')report.scenarios.logout='fail';report.failure={phase:report.phase,code:safeFailure(error),lastOperation:report.lastOperation};}
  finally{
    try{assert.equal(hash(await readFile(resolve(prior,'result.json'))),hash(priorBytes));assert.equal(hash(await readFile(binary)),binarySha256);}catch{report.status='fail';report.failure??={phase:'evidence-integrity',code:'CHECK_FAILED'};}
    await finishRecovery(report,children,app=>trace(app.name,'close',()=>app.close()),save);
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const report=await run();console.log(JSON.stringify({status:report.status,failure:report.failure}));process.exitCode=report.status==='pass'?0:1;}
  catch{console.error('HEADLESS_INPUT_OR_REPORT_FAILED');process.exitCode=1;}
}
