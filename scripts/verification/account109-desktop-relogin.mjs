#!/usr/bin/env node
// Importing is inert. Only run() opens the two original synthetic stores.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,lstat,realpath,appendFile} from 'node:fs/promises';
import {resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeApp,delay} from './sync108-native-driver.mjs';
import {STORES,hash,canonicalBranch,verifyBytes,boundedPoll} from './account109-desktop-recovery.mjs';
import {connectedPair} from './account109-headless-recovery.mjs';
import {nativeAccount,requireHealthy,signedOut,noteBody,statusObserver,safeStatus,failureCode} from './account109-desktop-helpers.mjs';

// The reviewed .app wrapper's nested executable has these same approved bytes.
// SignIn commands still omit surface, preserving the native browser default.
export const BINARY_SHA='187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459';
export const SOURCE='72513d1296df4526a08834db65a3427957d3fb50';
const USERNAME='cybernoteqa20261113a';
const PRIOR=new URL('../../docs/verification/account109/native/headless-continuation01/result.json',import.meta.url);
const B_HISTORY=new URL('../../docs/verification/account109/native/relogin-live02/result.json',import.meta.url);
export const B_HISTORY_SHA='b553d6ba27ba43e4281ebfc6abc445c583cf7e25bc4bfe285e3fa749d86fa439';
export const B_SUBJECT_SHA='03efb3ceea182d57ea4a56fc7e9b0e5e3577192f6a4818d8a454d77cb1cffc8b';
export async function readBHistory(read=()=>readFile(B_HISTORY)){
  const bytes=await read();assert.equal(hash(bytes),B_HISTORY_SHA,'Exact committed relogin02 history required');
  const r=JSON.parse(bytes),rows=r.observations.filter(o=>o.kind==='b-startup-recovery-decision');
  assert.equal(r.kind,'account109-original-desktop-relogin');assert.equal(r.status,'fail');assert.equal(rows.length,1);
  assert.equal(rows[0].originalSubjectSha256,B_SUBJECT_SHA);return {sha256:B_HISTORY_SHA,originalSubjectSha256:B_SUBJECT_SHA};
}
export function checkBHistoryProfile(s){
  if(s.profile){assert(typeof s.profile.subject==='string'&&s.profile.subject.length>0);assert.equal(hash(s.profile.subject),B_SUBJECT_SHA,'B subject must match committed bound-owner history');}
  return s;
}
export const cleanBSignedOut=s=>s?.state==='signedOut'&&s.enabled===false&&!s.profile&&!s.error&&Array.isArray(s.devices)&&!s.devices.some(d=>d.connected)&&s.conflictCount===0;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export function options(argv){
  const o={};
  for(let i=0;i<argv.length;i++){const k=argv[i];assert(['--binary','--stores','--output','--end-state','--allow-b-relogin','--allow-b-network-retry','--allow-b-signed-out-relogin','--authorization-timeout-ms'].includes(k)&&!Object.hasOwn(o,k),'Unknown/duplicate option');o[k]=k.startsWith('--allow-b-')?true:argv[++i];}
  assert.equal(Object.keys(o).length,4+Number(!!o['--allow-b-relogin'])+Number(!!o['--allow-b-network-retry'])+Number(!!o['--allow-b-signed-out-relogin'])+Number(Object.hasOwn(o,'--authorization-timeout-ms')),'--binary ABS --stores ORIGINAL --output FRESH --end-state enabled|paused [--allow-b-relogin] [--allow-b-network-retry] [--allow-b-signed-out-relogin] [--authorization-timeout-ms 120000..600000] required');
  let authorizationTimeoutMs=120000;
  if(Object.hasOwn(o,'--authorization-timeout-ms')){
    const value=o['--authorization-timeout-ms'];
    assert(typeof value==='string'&&/^[1-9][0-9]*$/.test(value),'Authorization timeout must be a decimal integer from 120000 to 600000');
    authorizationTimeoutMs=Number(value);
    assert(Number.isSafeInteger(authorizationTimeoutMs)&&authorizationTimeoutMs>=120000&&authorizationTimeoutMs<=600000,'Authorization timeout must be a decimal integer from 120000 to 600000');
  }
  for(const k of ['--binary','--stores','--output'])assert(isAbsolute(o[k]||'')&&resolve(o[k])===o[k],'Canonical absolute paths required');
  assert.equal(o['--stores'],STORES,'Only original synthetic stores allowed');assert(['enabled','paused'].includes(o['--end-state']),'Explicit final state required');
  const output=o['--output'];assert(output!==STORES&&!output.startsWith(STORES+sep)&&!STORES.startsWith(output+sep),'Evidence must be outside original stores');
  return {binary:o['--binary'],stores:STORES,output,endState:o['--end-state'],allowBRelogin:o['--allow-b-relogin']===true,allowBNetworkRetry:o['--allow-b-network-retry']===true,allowBSignedOutRelogin:o['--allow-b-signed-out-relogin']===true,authorizationTimeoutMs};
}
export function checkProfile(s){
  // An unsuccessful refresh and pending SignIn can retain only the bound subject.
  // Errors keep their native classification; accepted terminal profiles are strict.
  if(!s.error&&s.state!=='error'&&s.profile&&!(s.state==='authorizing'&&s.profile.username===undefined))assert.equal(s.profile.username,USERNAME,'Expected original synthetic account');
  return s;
}
// These finite meanings belong only to the pinned 72513d12 auth implementation:
// RefreshFailed here is produced only by HTTP 400 invalid_grant, not all refresh errors.
export const refreshClassification=s=>s?.error?.code==='account_network'||(s?.error?.code==='account_authentication'&&s.error.stage==='authorizationProvider'&&s.error.providerReason==='network')?'transport':s?.error?.code==='account_authentication'&&s.error.stage==='identityRefresh'&&s.error.providerReason===undefined?'serverInvalidGrant400':s?.error?.code==='account_authentication'&&s.error.stage==='identitySession'?'noSession':'other';
export const isBRefreshFailure=s=>s?.state==='error'&&s.enabled===false&&refreshClassification(s)==='serverInvalidGrant400'&&typeof s.profile?.subject==='string'&&s.profile.subject.length>0&&Array.isArray(s.devices)&&!s.devices.some(d=>d.connected)&&s.conflictCount===0;
export async function waitForBStartup(read,{poll=boundedPoll,allowSignedOut=false}={}){
  let result,subject,entirelyClean=true;
  const sample=async()=>{
    result=checkProfile(await read());
    if(allowSignedOut)checkBHistoryProfile(result);
    entirelyClean=entirelyClean&&cleanBSignedOut(result);
    if(result.profile){assert(typeof result.profile.subject==='string'&&result.profile.subject.length>0);subject??=result.profile.subject;assert.equal(result.profile.subject,subject,'Original B subject during startup');}
    // Runtime starts signedOut before restore is spawned. Polling issues no mutation.
    return !!result.error||result.state==='error'||!!result.profile&&['paused','ready'].includes(result.state);
  };
  try{await poll('B asynchronous restore result',sample,120000);}
  catch(error){
    if(error.code!=='CONDITION_TIMEOUT:B asynchronous restore result'||!allowSignedOut)throw error;
    // Also inspect the deadline boundary: a late error must not become a login.
    if(await sample())return result;
    if(!entirelyClean)throw error;
  }
  return result;
}
export async function waitForBHistoryAccount(read,{poll=boundedPoll,authorizationTimeoutMs=120000}={}){
  const [s]=await waitHealthy('B historical-owner sign-in',async()=>[checkProfile(checkBHistoryProfile(await read()))],([s])=>{
    if(signedOut(s))throw Object.assign(new Error('Login ended signed out'),{code:'LOGIN_ENDED_SIGNED_OUT'});
    return !!s.profile&&['paused','ready','connecting'].includes(s.state);
  },authorizationTimeoutMs,{poll});return s;
}
export async function recoverBSignedOut(initial,{allow,history,before,login,enable,record}){
  assert.equal(allow,true,'Explicit B signed-out re-login required');assert(cleanBSignedOut(initial));
  assert.equal(history?.sha256,B_HISTORY_SHA);assert.equal(history?.originalSubjectSha256,B_SUBJECT_SHA);
  await record({kind:'b-clean-signed-out-recovery',startupReadOnlyMs:120000,historySha256:B_HISTORY_SHA,originalSubjectSha256:B_SUBJECT_SHA});
  await before();const restored=checkProfile(checkBHistoryProfile(await login()));requireHealthy(restored);
  assert(restored.profile&&['paused','ready','connecting'].includes(restored.state));assert.equal(restored.profile.username,USERNAME);
  await record({kind:'b-clean-signed-out-recovery-completed',sameOriginalSubject:true,command:'account.signIn',...safeStatus(restored)});
  await enable();return restored;
}
export async function recoverB(initial,{allowRelogin,allowNetworkRetry,login,retry,enable,record,before=async()=>{}}){
  const classification=refreshClassification(initial);
  await record({kind:'b-startup-recovery-decision',classification,...safeStatus(initial),...(initial.profile?.subject?{originalSubjectSha256:hash(initial.profile.subject)}:{})});
  if(classification==='noSession'){
    await record({kind:'b-session-action-required',guidance:'Explicit UI SignOut and cleanup is required before another login; not performed.',signOutExecuted:false});
    throw Object.assign(new Error('Explicit session cleanup required'),{code:'B_SESSION_ACTION_REQUIRED'});
  }
  const network=classification==='transport';
  if(network?!allowNetworkRetry:!allowRelogin||!isBRefreshFailure(initial)){requireHealthy(initial);assert.fail('Explicit supported B recovery required');}
  assert(initial.state==='error'&&initial.profile?.subject&&initial.conflictCount===0&&!initial.devices.some(d=>d.connected),'Retained original B owner required');
  const subject=initial.profile.subject;
  if(initial.profile.username!==undefined)assert.equal(initial.profile.username,USERNAME);
  // One chosen action only. A failed retry never falls through to SignIn or SignOut.
  await before();
  const restored=checkProfile(await (network?retry():login()));requireHealthy(restored);
  assert.equal(restored.profile?.subject,subject,'B recovery must retain original bound subject');
  assert(['paused','ready','connecting'].includes(restored.state));
  await record({kind:'b-recovery-completed',classification,sameOriginalSubject:true,command:network?'account.syncNow':'account.signIn',replacementAuthorizationRequested:!network,...safeStatus(restored)});
  await enable();return restored;
}
export async function waitForOriginalAccount(label,read,subject,{poll=boundedPoll,authorizationTimeoutMs=120000}={}){
  return waitHealthy(label,async()=>{
    const ss=await read();for(const s of ss){checkProfile(s);if(s.profile)assert.equal(s.profile.subject,subject,'Original account binding during authorization');}return ss;
  },([s])=>{if(signedOut(s))throw Object.assign(new Error('Login ended signed out'),{code:'LOGIN_ENDED_SIGNED_OUT'});return !!s.profile&&['paused','ready','connecting'].includes(s.state);},authorizationTimeoutMs,{poll});
}
// Only these three terminal SignIn waits use the interactive authorization budget.
export function authorizationWaits(authorizationTimeoutMs=120000,{poll=boundedPoll}={}){
  const config={authorizationTimeoutMs,poll};
  return {
    bSignedOut:read=>waitForBHistoryAccount(read,config),
    bRefresh:(read,subject)=>waitForOriginalAccount('B same-subject sign-in',read,subject,config),
    a:(read,subject)=>waitForOriginalAccount('A real sign-in',read,subject,config),
  };
}

const sql=String.raw`import sqlite3,json,sys
from pathlib import Path
c=sqlite3.connect((Path(sys.argv[1])/'notes.sqlite3').as_uri()+'?mode=ro',uri=True)
c.execute('pragma query_only=on')
assert c.execute('pragma query_only').fetchone()[0]==1
notes=[json.loads(r[0]) for r in c.execute('select body from notes order by id')]
attachments=[json.loads(r[0]) for r in c.execute('select body from attachments order by id')]
c.close()
print(json.dumps({'notes':notes,'attachments':attachments,'mode':'ro','queryOnly':True}))`;

// Opens only copied DB/WAL/SHM; never queries account or grant tables.
export async function readLibrary(directory,destination){
  assert.equal(await realpath(directory),directory);await mkdir(destination,{mode:0o700});
  const names=['notes.sqlite3','notes.sqlite3-wal','notes.sqlite3-shm'];
  async function hashes(){const rows={};for(const name of names){try{const p=resolve(directory,name);assert((await lstat(p)).isFile());rows[name]=hash(await readFile(p));}catch(e){if(e.code!=='ENOENT'||name===names[0])throw e;}}return rows;}
  const before=await hashes();
  for(const [name,digest] of Object.entries(before)){const p=resolve(destination,name);await copyFile(resolve(directory,name),p);assert.equal(hash(await readFile(p)),digest);}
  assert.deepEqual(await hashes(),before,'Original DB/WAL/SHM changed during snapshot');
  const library=JSON.parse(execFileSync('python3',['-c',sql,destination],{encoding:'utf8',maxBuffer:8_000_000,timeout:15000,stdio:['ignore','pipe','pipe']}));
  for(const a of library.attachments){
    assert(uuid(a.id)&&uuid(a.noteId));const p=resolve(directory,'attachments',a.relativePath),root=resolve(directory,'attachments');
    assert(p.startsWith(root+sep)&&await realpath(p)===p&&(await lstat(p)).isFile(),'Confined regular attachment required');
    const bytes=await readFile(p);assert.equal(bytes.length,a.size);a.sha256=hash(bytes);
    await writeFile(resolve(destination,a.id+'.bytes'),bytes,{flag:'wx',mode:0o600});
    assert.equal(hash(await readFile(p)),a.sha256,'Original attachment changed while snapshotting');
  }
  assert.deepEqual(await hashes(),before,'Original DB/WAL/SHM unchanged after query');
  assertLibrary(library,library);
  return {...library,originalFiles:before,originalFilesUnchanged:true};
}

// Retained semantic note fields, owned metadata and document references. Canonical
// comparison excludes local revision/path, normalizes nullable fields and reference
// IDs; original attachment IDs/ownership/SHA are checked separately by verifyBytes.
export function assertLibrary(actual,expected){
  assert.equal(new Set(actual.notes.map(n=>n.id)).size,actual.notes.length);
  assert.equal(new Set(actual.attachments.map(a=>a.id)).size,actual.attachments.length);
  for(const a of actual.attachments)assert(actual.notes.some(n=>n.id===a.noteId),'Attachment owner exists');
  for(const n of expected.notes){
    const found=actual.notes.find(a=>a.id===n.id);assert(found,'Original note missing');
    const owned=ws=>ws.attachments.filter(a=>a.noteId===n.id);
    assert.equal(canonicalBranch({note:found,attachments:owned(actual)},false),canonicalBranch({note:n,attachments:owned(expected)},false),'Full note/reference/metadata changed');
  }
}
export function combineBaselines(a,b){
  assertLibrary(a,a);assertLibrary(b,b);
  const note=n=>{const {revision,...retained}=n;return retained;};
  const attachment=a=>{const {relativePath,...retained}=a;return retained;};
  for(const row of a.attachments){const other=b.attachments.find(a=>a.id===row.id);if(other)assert.deepEqual(attachment(row),attachment(other),'Overlapping attachment ownership, metadata and SHA must agree before launch');}
  for(const n of a.notes){const other=b.notes.find(row=>row.id===n.id);if(other)assert.deepEqual(note(n),note(other),'Overlapping note semantic fields and exact document references must agree before launch');}
  return {notes:[...a.notes,...b.notes.filter(n=>!a.notes.some(a=>a.id===n.id))],attachments:[...a.attachments,...b.attachments.filter(n=>!a.attachments.some(a=>a.id===n.id))]};
}
export function priorGate(prior,a,b){
  assert.equal(prior.kind,'account109-preserved-full02-headless-recovery');assert.equal(prior.status,'pass');
  assert.equal(prior.scenarios.conflict,'pass');assert.equal(prior.scenarios.logout,'pass');
  for(const ws of [a,b]){
    for(const row of prior.preLogout.notes)assert.equal(hash(noteBody(ws.notes.find(n=>n.id===row.id))),row.fullBodySha256,'Archived full body preserved');
    for(const row of prior.preLogout.attachments){const found=ws.attachments.find(a=>a.id===row.id&&a.noteId===row.noteId);assert(found);assert.equal(found.sha256,row.sha256);assert.equal(found.size,row.size);}
  }
  const local=prior.postLogoutLocalEdit;assert.equal(hash(noteBody(a.notes.find(n=>n.id===local.noteId))),local.fullBodySha256);assert(!b.notes.some(n=>n.id===local.noteId));
  const windows=prior.observations.filter(o=>o.kind==='two-way-logout-exclusion'&&o.label==='after restart');assert.equal(windows.length,1);
  const remoteIds=windows[0].remoteNoteIds;assert.equal(remoteIds.length,2);assert.equal(new Set(remoteIds).size,2);
  for(const id of remoteIds)assert(uuid(id)&&b.notes.some(n=>n.id===id)&&!a.notes.some(n=>n.id===id),'Existing B postlogout note must be absent A before launch');
  return {localId:local.noteId,remoteIds};
}
export async function waitHealthy(label,read,accept,ms,{poll=boundedPoll}={}){
  let result;await poll(label,async()=>{result=await read();const healthy=result.map(s=>requireHealthy(s,{pendingNetwork:true}));return healthy.every(Boolean)&&await accept(result);},ms);return result;
}
export async function connectionThenData(label,read,accept,{poll=boundedPoll,connectionMs=120000,dataMs=60000}={}){
  await waitHealthy(label+' connection',read,connectedPair,connectionMs,{poll});
  return waitHealthy(label+' data',read,ss=>connectedPair(ss)&&accept(ss),dataMs,{poll});
}
export async function confirmEnableUi({inspect,click,record}){
  const p=await inspect();
  assert.equal(p.count,1);assert.equal(p.visible,true);assert.equal(p.title,'开启账户同步？');
  assert.equal(p.explanation,'此设备的本地备忘录将与该账户其他设备的备忘录合并。请确认你登录了正确的账户。');
  assert.equal(p.buttons,2);assert.equal(p.cancel,'取消');assert.equal(p.confirm,'开启并合并');assert.equal(p.confirmEnabled,true);
  await record('merge-confirmation-shown');await click();await record('merge-confirmation-clicked');
}
export async function finish(report,children,save){
  const closed=await Promise.allSettled(children.map(app=>app.close()));report.lifecycle=children.map(app=>app.lifecycle);
  if(closed.some(r=>r.status==='rejected')||children.some(app=>app.lifecycle.naturalExit!==true))report.cleanupFailure={code:'CLEANUP_FAILED'};
  report.status=!report.failure&&!report.cleanupFailure&&['baseline','login','pausedEdits','catchup','bidirectional','restart','endState'].every(k=>report.scenarios[k]==='pass')?'pass':'fail';
  report.finishedAt=new Date().toISOString();await save();
}
const documentFor=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text,marks:[{type:'bold'}]}]},{type:'paragraph',content:[{type:'text',text:'完整第二段 中文 😀'}]}]});
const operations=['ready','state','idle','close','account.status','account.signIn','account.syncNow','account.setEnabled','settings.open','settings.tab','app.back','folder.select','note.create','note.select','editor.setContent','app.flush','attachment.read','confirmation.inspect','recovery.inspect','dom.click'];

export async function run(argv=process.argv.slice(2)){
  const {binary,stores,output,endState,allowBRelogin,allowBNetworkRetry,allowBSignedOutRelogin,authorizationTimeoutMs}=options(argv);
  const authorization=authorizationWaits(authorizationTimeoutMs);
  // Public committed evidence only; missing/mismatched history stops before Apps or output.
  const bHistory=allowBSignedOutRelogin?await readBHistory():undefined;
  assert.equal(hash(await readFile(binary)),BINARY_SHA,'Only reviewed 72513d12 GUI candidate bytes allowed');
  for(const dir of [stores,...['a','b'].map(n=>resolve(stores,'desktop-'+n))])assert.equal(await realpath(dir),dir);
  await mkdir(output,{mode:0o700});assert.equal(await realpath(output),output);
  const priorBytes=await readFile(PRIOR),prior=JSON.parse(priorBytes);
  const report={schema:1,kind:'account109-original-desktop-relogin',status:'running',phase:'baseline',startedAt:new Date().toISOString(),endState,allowBRelogin,allowBNetworkRetry,allowBSignedOutRelogin,authorizationTimeoutMs,...(bHistory?{bHistory}:{}),scenarios:Object.fromEntries(['baseline','login','pausedEdits','catchup','bidirectional','restart','endState','auth06'].map(k=>[k,'not-run'])),checks:[],observations:[],binary:{path:binary,sha256:BINARY_SHA,sourceRevision:SOURCE,candidateKind:'debug-e2e'},prior:{sha256:hash(priorBytes)},limitations:[
    'Existing synthetic roots only. SignIn uses the product UI handler and native PKCE/system browser; parent completes authorization. No credentials, tokens, callback URLs, grants or manual pairing inputs.',
    'Merge confirmation is inspected and clicked through the existing dom.click UI handler, not physical input. Parent only completes system-browser authorization. Editor commands use debug/e2e UI handlers; no physical typing or OS picker claim.',
    'Pause is the production account setting, not OS network loss. Negative windows are bounded to 3 seconds. AUTH06 is not executed.',
    'Explicit clean B signedOut recovery requires the entire 120-second read-only startup interval and fixed committed relogin02 owner history. Profile subject hashes are checked before runner enable; native bind retains its same-owner and persisted enabled checks. Login is not guaranteed to begin paused. No binding/grant read or identity injection.',
    'Cross-baseline overlap requires exact note fields/references except local revision, and exact attachment ownership/metadata/SHA except physical relativePath. Later canonical preservation excludes local revision/path, normalizes absent/null nullable fields and reference IDs to descriptors; original attachment IDs/ownership/SHA are verified separately. Only live unlocked baselines are supported.',
    'Shell proxy variables are blanked only for owned child processes. No system settings change or conflict creation. Pinned 72513d12 maps identityRefresh without providerReason to HTTP 400 invalid_grant. Explicit B flags select at most one UI recovery: network syncNow retains the production owner, rejected refresh signIn requires same subject. NoSession stops with explicit SignOut guidance; no automatic SignOut or recovery fallback. No grant bytes are read to infer state.'
  ],tools:{}};
  for(const file of ['account109-desktop-relogin.mjs','sync108-native-driver.mjs','account109-desktop-helpers.mjs','account109-desktop-recovery.mjs','account109-headless-recovery.mjs'])report.tools[file]=hash(await readFile(new URL(file,import.meta.url)));
  let saving=Promise.resolve(),sequence=0,interrupted=false;
  const save=()=>{const text=JSON.stringify(report,null,2)+'\n';saving=saving.then(()=>writeFile(resolve(output,'result.json'),text,{mode:0o600}));return saving;};
  const children=[],observe=statusObserver(report,()=>report.phase);
  const onSignal=()=>{interrupted=true;};process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
  async function trace(app,op,work){
    assert(operations.includes(op));if(interrupted&&op!=='close')throw Object.assign(new Error('Interrupted'),{code:'RUN_INTERRUPTED'});
    const row={sequence:++sequence,phase:report.phase,device:app.name,operation:op,event:'before',at:new Date().toISOString()};report.lastOperation=row;await save();
    await appendFile(resolve(output,'steps.jsonl'),JSON.stringify(row)+'\n',{mode:0o600});
    try{const value=await work();report.lastOperation={...row,event:'after'};return value;}
    catch(e){report.lastOperation={...row,event:'failed',code:failureCode(e)};await save();throw e;}
  }
  const command=async(app,op,args={})=>{await trace(app,op,()=>app.execute(op,args,op==='account.syncNow'?60000:undefined));await trace(app,'idle',()=>app.idle());};
  const state=app=>trace(app,'state',()=>app.state());
  const workspace=async app=>(await state(app)).workspace;
  const status=async app=>{const s=await trace(app,'account.status',()=>nativeAccount(app,'status'));observe(app.name,s);if(bHistory&&app.name==='b')checkBHistoryProfile(s);return checkProfile(s);};
  let subject;
  async function statuses(apps){const ss=[];for(const app of apps){const s=await status(app);if(s.profile&&subject)assert.equal(s.profile.subject,subject,'Original account binding');ss.push(s);}return ss;}
  const accountWait=(label,apps,accept,ms)=>waitHealthy(label,()=>statuses(apps),accept,ms);
  const connectData=(label,apps,accept)=>connectionThenData(label,()=>statuses(apps),accept);
  async function enter(app){if(!(await state(app)).preferences.open)await command(app,'settings.open');await command(app,'settings.tab',{tab:'account'});}
  async function leave(app){for(let i=0;i<3&&(await state(app)).preferences.open;i++)await command(app,'app.back');assert(!(await state(app)).preferences.open);}
  async function setPaused(app){await enter(app);await command(app,'account.setEnabled',{enabled:false});await accountWait(app.name+' paused',[app],ss=>ss.every(s=>s.profile&&!s.enabled&&s.state==='paused'&&!s.devices.some(d=>d.connected)),15000);}
  async function enable(app){
    const s=await status(app);requireHealthy(s);if(s.enabled){report.observations.push({kind:'already-enabled',device:app.name,...safeStatus(s)});return;}
    await enter(app);await command(app,'account.setEnabled',{enabled:true});
    await confirmEnableUi({
      inspect:()=>trace(app,'confirmation.inspect',()=>app.evaluate("(()=>{const panels=document.querySelectorAll('.account-confirmation'),p=panels[0],bs=p?.querySelectorAll('button'),b=bs?.[1];return {count:panels.length,visible:!!p&&p.getClientRects().length>0&&getComputedStyle(p).visibility!=='hidden',title:p?.querySelector('h4')?.textContent,explanation:p?.querySelector('p')?.textContent,buttons:bs?.length,cancel:bs?.[0]?.textContent,confirm:b?.textContent,confirmEnabled:!!b&&!b.disabled&&b.getClientRects().length>0};})()")),
      click:()=>command(app,'dom.click',{selector:'.account-confirmation button:last-child'}),
      record:async kind=>{report.observations.push({kind,device:app.name,physicalInput:false});await save();}
    });
    const [enabled]=await accountWait(app.name+' UI enable terminal',[app],async([s])=>s.enabled&&!await trace(app,'confirmation.inspect',()=>app.evaluate("!!document.querySelector('.account-confirmation')")),120000);
    report.observations.push({kind:'merge-confirmation-completed',device:app.name,physicalInput:false,...safeStatus(enabled)});await leave(app);
  }
  async function open(name){
    const env=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].map(k=>[k,'']));
    const app=new NativeApp(binary,resolve(stores,'desktop-'+name),{name,env:{...env,NOTES_SYNC_E2E_SLOT:name==='a'?'left':'right'}});children.push(app);
    const ready=await trace(app,'ready',()=>app.ready(45000));report.observations.push({kind:'ready',device:name,interactive:ready.interactive,startupDetached:ready.startupDetached});return app;
  }
  async function bytes(app,ws,expected){
    return verifyBytes(app,{attachments:ws.attachments.filter(a=>expected.some(e=>e.id===a.id))},async row=>{
      await leave(app);await command(app,'note.select',{id:row.noteId});
      return trace(app,'attachment.read',()=>app.evaluate(`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;const a=s.workspace.access,n=a.notes[arg.noteId];if(!n?.authorized)throw Error('OWNER_NOT_AUTHORIZED');return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,expected:{sessionId:a.sessionId,epoch:a.epoch,noteEpoch:n.epoch}});})()`,{id:row.id,noteId:row.noteId}));
    },expected);
  }
  const check=async key=>{report.scenarios[key]='pass';report.checks.push({name:key,status:'pass'});console.log('PASS '+key);await save();};
  async function preserved(app,expected){const ws=await workspace(app);assertLibrary(ws,expected);await bytes(app,ws,expected.attachments);}
  const created=new Set(),historical=new Set();
  async function edit(app,id,text){assert(created.has(id),'Only this run synthetic notes may be edited');await leave(app);await command(app,'note.select',{id});await command(app,'editor.setContent',{document:documentFor(text)});await command(app,'app.flush');const n=(await workspace(app)).notes.find(n=>n.id===id);assert.deepEqual(n?.document,documentFor(text));assert.equal(n.plainText,text+'\n完整第二段 中文 😀');return n;}
  async function create(app,text){await leave(app);await command(app,'folder.select',{id:'default'});await command(app,'note.create');const id=(await state(app)).selection.noteId;assert(uuid(id)&&!historical.has(id)&&!created.has(id),'New independent ID required before editing');created.add(id);return edit(app,id,text);}
  async function applied(a,b,note,label){await connectData(label,[a,b],async()=>[await workspace(a),await workspace(b)].every(ws=>ws.notes.some(n=>n.id===note.id&&noteBody(n)===noteBody(note))));report.observations.push({kind:'full-body-convergence',label,noteId:note.id,sha256:hash(noteBody(note))});}
  try{
    await save();const baselines={};for(const name of ['a','b'])baselines[name]=await readLibrary(resolve(stores,'desktop-'+name),resolve(output,'readonly-'+name));
    const combined=combineBaselines(baselines.a,baselines.b),gap=priorGate(prior,baselines.a,baselines.b);
    for(const ws of Object.values(baselines))for(const n of ws.notes)historical.add(n.id);
    await writeFile(resolve(output,'baseline.json'),JSON.stringify(baselines,null,2)+'\n',{flag:'wx',mode:0o600});
    report.baseline={sha256:hash(await readFile(resolve(output,'baseline.json'))),originalFilesUnchanged:true,overlapAgreementCheckedBeforeLaunch:true,notes:Object.fromEntries(['a','b'].map(k=>[k,baselines[k].notes.map(n=>({id:n.id,sha256:hash(noteBody(n))}))])),gap};await check('baseline');
    report.phase='startup';let a=await open('a');const b=await open('b');
    assert(signedOut(await status(a)),'A must begin genuinely signed out');
    const initialB=await waitForBStartup(()=>status(b),{allowSignedOut:allowBSignedOutRelogin});subject=initialB.profile?.subject;
    if(allowBSignedOutRelogin&&cleanBSignedOut(initialB)){
      report.phase='b-recovery';
      const restored=await recoverBSignedOut(initialB,{allow:allowBSignedOutRelogin,history:bHistory,
        record:async row=>{report.observations.push(row);await save();},before:async()=>{await preserved(a,baselines.a);await preserved(b,baselines.b);},enable:()=>enable(b),
        login:async()=>{
          await enter(b);await boundedPoll('B signed-out login UI ready',async()=>{
            assert(cleanBSignedOut(await status(b)),'B must remain clean signedOut before one SignIn');
            const p=await trace(b,'recovery.inspect',()=>b.evaluate("(()=>{const p=document.querySelector('.account-settings'),bs=p?.querySelectorAll('.account-group .account-actions button.account-primary'),b=bs?.[0];return {state:p?.dataset.accountState,count:bs?.length,label:b?.textContent,enabled:!!b&&!b.disabled,visible:!!b&&b.getClientRects().length>0};})()"));
            return p.state==='signedOut'&&p.count===1&&p.label==='登录'&&p.enabled&&p.visible;
          },5000);
          report.observations.push({kind:'b-recovery-ui-shown',label:'登录',uiHandler:'account.signIn',physicalInput:false});await save();
          console.log('WAIT b system-browser-sign-in (one explicit historical same-subject authorization)');await command(b,'account.signIn');
          return authorization.bSignedOut(()=>status(b));
        }
      });subject=restored.profile.subject;report.phase='startup';
    }
    if(initialB.error||initialB.state==='error'){
      report.phase='b-recovery';subject=initialB.profile?.subject;
      const classification=refreshClassification(initialB);
      async function invokeRecovery(type,label){
        await enter(b);
        await boundedPoll('B recovery UI ready',async()=>{
          const current=await status(b);assert.equal(refreshClassification(current),classification,'B recovery classification changed');assert.equal(current.profile?.subject,subject);
          const p=await trace(b,'recovery.inspect',()=>b.evaluate("(()=>{const p=document.querySelector('.account-settings'),bs=Array.from(p?.querySelectorAll('section.account-error button')||[]);return {state:p?.dataset.accountState,count:bs.length,label:bs[0]?.textContent,enabled:!!bs[0]&&!bs[0].disabled,visible:!!bs[0]&&bs[0].getClientRects().length>0};})()"));
          return p.state==='error'&&p.count===1&&p.label===label&&p.enabled&&p.visible;
        },5000);
        report.observations.push({kind:'b-recovery-ui-shown',label,uiHandler:'account.'+type,physicalInput:false});await save();
        if(type==='signIn')console.log('WAIT b system-browser-sign-in (one explicit same-subject authorization)');
        await command(b,'account.'+type);
      }
      await recoverB(initialB,{allowRelogin:allowBRelogin,allowNetworkRetry:allowBNetworkRetry,
        record:async row=>{report.observations.push(row);await save();},before:async()=>{await preserved(a,baselines.a);await preserved(b,baselines.b);},enable:()=>enable(b),
        login:async()=>{await invokeRecovery('signIn','重新登录');const [restored]=await authorization.bRefresh(()=>statuses([b]),subject);return restored;},
        retry:async()=>{await invokeRecovery('syncNow','重试连接');return status(b);}
      });
      report.phase='startup';
    }
    const beforeReady=await status(b);if(subject&&beforeReady.profile)assert.equal(beforeReady.profile.subject,subject);requireHealthy(beforeReady,{pendingNetwork:true});if(!beforeReady.error&&!beforeReady.enabled&&beforeReady.state==='paused')await enable(b);
    const [bs]=await accountWait('B saved account restored',[b],ss=>ss.every(s=>s.profile&&s.enabled&&s.state==='ready'),120000);subject=bs.profile.subject;assert(subject);assert.equal(bs.conflictCount,0,'Existing conflict must already be resolved');
    await preserved(a,baselines.a);await preserved(b,baselines.b);
    report.phase='login';await enter(a);console.log('WAIT a system-browser-sign-in (parent completes native PKCE authorization)');await command(a,'account.signIn');
    const [logged]=await authorization.a(()=>statuses([a]),subject);
    assert.equal(logged.profile.subject,subject);assert.equal(logged.conflictCount,0);assert(logged.enabled||logged.state==='paused');report.observations.push({kind:'login-result',...safeStatus(logged)});await preserved(a,baselines.a);await check('login');
    report.phase='paused-edits';await setPaused(a);await setPaused(b);
    const suffix=randomUUID();let an=await create(a,'ACCOUNT109 re-login A '+suffix),bn=await create(b,'ACCOUNT109 re-login B '+suffix);
    assert(![...baselines.a.notes,...baselines.b.notes].some(n=>created.has(n.id)),'New independent IDs required');
    const until=performance.now()+3000;let samples=0;
    do{const ss=await statuses([a,b]);for(const s of ss){requireHealthy(s);assert(s.profile&&!s.enabled&&s.state==='paused'&&!s.devices.some(d=>d.connected));}const aw=await workspace(a),bw=await workspace(b);assertLibrary(aw,{notes:[an],attachments:[]});assertLibrary(bw,{notes:[bn],attachments:[]});assert(!aw.notes.some(n=>n.id===bn.id)&&!bw.notes.some(n=>n.id===an.id));samples++;await delay(250);}while(performance.now()<until);
    assert(samples>=2);report.observations.push({kind:'paused-local-notes',samples,durationMs:3000,noteIds:[an.id,bn.id]});await check('pausedEdits');
    report.phase='catchup';await enable(b);await enable(a);
    await connectData('original complete catchup',[a,b],async()=>{for(const app of [a,b]){const ws=await workspace(app);if(!combined.notes.every(n=>ws.notes.some(x=>x.id===n.id&&noteBody(x)===noteBody(n))))return false;}return true;});
    for(const app of [a,b])await preserved(app,combined);await applied(a,b,an,'A paused note');await applied(a,b,bn,'B paused note');await check('catchup');
    report.phase='bidirectional';an=await edit(a,an.id,'A small edit '+suffix);await applied(a,b,an,'A to B edit');bn=await edit(b,bn.id,'B small edit '+suffix);await applied(a,b,bn,'B to A edit');await check('bidirectional');
    report.phase='restart';await leave(a);await trace(a,'close',()=>a.close());assert(a.lifecycle.naturalExit===true);
    bn=await edit(b,bn.id,'B while A closed '+suffix);a=await open('a');assert(!(await state(a)).preferences.open,'Restart must restore with account settings closed');
    await applied(a,b,bn,'automatic restart catchup');await applied(a,b,an,'A local edit retained');for(const app of [a,b])await preserved(app,combined);await check('restart');
    report.phase='end-state';if(endState==='paused'){await setPaused(a);await setPaused(b);}
    for(const app of [a,b]){await preserved(app,combined);assertLibrary(await workspace(app),{notes:[an,bn],attachments:[]});await leave(app);}
    const final=await accountWait('explicit final state',[a,b],ss=>endState==='enabled'?connectedPair(ss):ss.every(s=>s.profile&&!s.enabled&&s.state==='paused'&&!s.devices.some(d=>d.connected)),15000);
    assert(final.every(s=>s.conflictCount===0),'No new conflict');report.finalStatuses=final.map(safeStatus);await check('endState');
  }catch(error){report.failure={phase:report.phase,code:['RUN_INTERRUPTED','B_SESSION_ACTION_REQUIRED'].includes(error.code)?error.code:failureCode(error),lastOperation:report.lastOperation};}
  finally{report.phase='cleanup';await finish(report,children,save);process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);}
  if(report.status!=='pass')process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(error=>{console.error(failureCode(error));process.exitCode=1;});
