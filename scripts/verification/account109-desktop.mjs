#!/usr/bin/env node
// Real native account handlers + system-browser login; no grants or invites injected.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {NativeApp,delay} from './sync108-native-driver.mjs';
import {safeStatus,requireHealthy,waitForAccountStatuses,accountEnabled,statusObserver,nativeAccount,signedOut,noteBody,attachmentRefs,preserveAttachments,canonicalBody,snapshotNotes,observeLogout,failureCode,finishReport,fail} from './account109-desktop-helpers.mjs';
const args=process.argv.slice(2), opts={};
for(let i=0;i<args.length;i++){
 assert(['--binary','--output','--resume-from','--account-path'].includes(args[i])&&!opts[args[i]],'Expected --binary ABS_PATH --output FRESH_ABS_DIR [--resume-from OWNED_PRIOR_OUTPUT] [--account-path ui|native]');
 opts[args[i]]=args[++i];
}
assert(isAbsolute(opts['--binary']||'')&&isAbsolute(opts['--output']||''),'Absolute paths required');
const accountPath=opts['--account-path']||'ui';assert(['ui','native'].includes(accountPath),'Account path must be ui or native');
const binary=opts['--binary'], output=opts['--output'];
let prior;
const stores=opts['--resume-from']||output;
if(opts['--resume-from']){
 assert(isAbsolute(stores)&&/^\/private\/tmp\/account109-desktop-real-[A-Za-z0-9-]+$/.test(stores)&&await realpath(stores)===stores,'Resume only a canonical owned prior test root');
 const bytes=await readFile(resolve(stores,'result.json'));prior=JSON.parse(bytes);
 assert(prior.kind==='real-account-two-native-desktops'&&['a','b'].every(name=>prior.observations.some(r=>r.device===name&&r.kind==='login'&&r.hasProfile&&r.state==='paused')),'Both prior real logins must be recorded');
 for(const name of ['a','b']){const path=resolve(stores,'desktop-'+name);assert((await lstat(path)).isDirectory()&&await realpath(path)===path,'Owned stores must be regular canonical directories');}
}
await mkdir(output); // Never reuse, clear or replace an existing library.
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={schema:1,kind:'real-account-two-native-desktops',startedAt:new Date().toISOString(),tools:{runnerSha256:hash(await readFile(new URL(import.meta.url))),driverSha256:hash(await readFile(new URL('./sync108-native-driver.mjs',import.meta.url)))},binary:{path:binary,sha256:hash(await readFile(binary))},checks:[],observations:[],limitations:['Debug/e2e build and existing synthetic File[] attachment boundary; no physical keyboard or OS picker claim.','Only dedicated synthetic hosted SSO may be used. This runner never supplies credentials, callbacks, tokens, workspace IDs or pairing invitations.','Inherited shell proxy variables are blanked for these owned test processes, matching an app launched outside the shell; no system network settings change.']};
if(prior)report.resume={from:stores,priorReportSha256:hash(await readFile(resolve(stores,'result.json'))),mode:'existing-real-grants-restored-by-native-runtime',newAuthorizationRequested:false};
report.status='running';report.accountPath=accountPath;report.scenarios={concurrentOffline:'not-run',logout:'not-run'};
report.tools.helpersSha256=hash(await readFile(new URL('./account109-desktop-helpers.mjs',import.meta.url)));
report.limitations.push('Logout exclusion is sampled for 3 seconds before and after restart, not an unbounded guarantee. Concurrent edits are made with both account runtimes paused; this does not simulate OS network loss.','Hosted registration/cancellation, callback rejection, token rotation, cross-account rejection and physical Android coverage are outside this runner.');
if(accountPath==='native')report.limitations.push('Account mutations invoke the existing production account_command through debug eval; this path does not test account UI confirmations. Hosted sign-in still uses the system browser and native PKCE owner.');
const check=name=>{report.checks.push({name,status:'pass'});console.log('PASS '+name);};
// Scoped to this runner's lifetime; does not unlock or change system settings.
if(process.platform==='darwin'){
 const awake=spawn('/usr/bin/caffeinate',['-di','-w',String(process.pid)],{stdio:'ignore'});
 awake.on('error',()=>{report.sleepAssertionUnavailable=true;});awake.unref();
}
const children=[],devices={}; let phase='startup';
let saving=Promise.resolve();
const save=()=>{const bytes=JSON.stringify(report,null,2)+'\n';saving=saving.then(()=>writeFile(resolve(output,'result.json'),bytes));return saving;};
const observeStatus=statusObserver(report,()=>phase);
const proxyEnv=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].map(k=>[k,'']));
async function open(name){
 const app=new NativeApp(binary,resolve(stores,'desktop-'+name),{name,env:{...proxyEnv,NOTES_SYNC_E2E_SLOT:name==='a'?'left':'right'}});children.push(app);devices[name]=app;
 const ready=await app.ready(45000);report.observations.push({device:name,kind:'ready',pid:app.child.pid,interactive:ready.interactive,startupDetached:ready.startupDetached});return app;
}
async function command(app,id,args={}){const v=await app.execute(id,args);await app.idle();return v;}
async function workspace(app){return (await app.state()).workspace;}
async function recordStatus(app,s,{allowFailure=false,pendingNetwork=false}={}){if(observeStatus(app.name,s))await save();if(!allowFailure)requireHealthy(s,{pendingNetwork});return s;}
async function account(app,options){return recordStatus(app,await nativeAccount(app,'status'),options);}
const waitAccounts=(name,apps,ready,timeoutMs,begin)=>waitForAccountStatuses(name,()=>Promise.all(apps.map(app=>account(app,{pendingNetwork:true}))),ready,timeoutMs,begin);
async function accountAction(app,type,args={},options){
 if(accountPath==='native')return recordStatus(app,await nativeAccount(app,type,args),options);
 await enter(app);await command(app,'account.'+type,args);
 if(type==='signOut'||(type==='setEnabled'&&args.enabled)){
  const prompt=await app.evaluate("document.querySelector('.account-confirmation')?.textContent||''");
  assert(type==='signOut'?prompt.includes('退出账户'):prompt.includes('本地备忘录')&&prompt.includes('开启并合并'),'Real account confirmation required');
  await command(app,'dom.click',{selector:'.account-confirmation button:last-child'});
 }
 return account(app,options);
}
async function enter(app){if(!(await app.state()).preferences.open)await command(app,'settings.open');await command(app,'settings.tab',{tab:'account'});}
async function leave(app){for(let i=0;i<3&&(await app.state()).preferences.open;i++)await command(app,'app.back');assert(!(await app.state()).preferences.open,'Preferences must close');}
const doc=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text,marks:[{type:'bold'}]}]},{type:'paragraph',content:[{type:'text',text:'中文第二段 / UTF-8 / 😀'}]}]});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64');
const raw=Buffer.from(Array.from({length:4096},(_,i)=>i%256));
const files=[['account109.png','image/png',png],['account109.bin','application/octet-stream',raw]];
async function create(app,text,attachments=true){
 await leave(app);await command(app,'folder.select',{id:'default'});await command(app,'note.create');
 await command(app,'editor.setContent',{document:doc(text)});
 if(attachments)await command(app,'attachment.submit',{files:files.map(([name,mime,bytes])=>({name,mime,base64:bytes.toString('base64')}))});
 await command(app,'app.flush');const s=await app.state();return s.selection.noteId;
}
const body=noteBody;
async function note(app,id){return (await workspace(app)).notes.find(n=>n.id===id);}
async function originals(app,id){
 const ws=await workspace(app),n=ws.notes.find(n=>n.id===id);assert(n);
 for(const [name,,bytes] of files){
  const a=ws.attachments.find(a=>a.noteId===id&&a.displayName===name);assert(a,'Attachment exists');
  assert(attachmentRefs(n.document).includes(a.id),'Document references original attachment');
  const result=await app.evaluate(`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;const access=s.workspace.access,owner=access.notes[arg.noteId];if(!owner?.authorized)throw Error('OWNER_NOT_AUTHORIZED');return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,expected:{sessionId:access.sessionId,epoch:access.epoch,noteEpoch:owner.epoch}});})()`,{id:a.id,noteId:id});
  const actual=Buffer.from(result.data,'base64');assert.equal(actual.length,bytes.length);assert.equal(hash(actual),hash(bytes));
  assert.equal(hash(await readFile(resolve(app.directory,'attachments',a.relativePath))),hash(bytes));
  report.observations.push({device:app.name,kind:'original-attachment',noteId:id,name,bytes:actual.length,sha256:hash(actual),documentReference:true,productionReadMatches:true,storedFileMatches:true});
 }
}
async function converge(source,target,id,label){
 const expected=body(await note(source,id));await waitAccounts(label,[source,target],async()=>{const n=await note(target,id);return n&&body(n)===expected;},60000);await command(target,'note.select',{id});await originals(target,id);report.observations.push({kind:'convergence',label,noteId:id,documentAndPlainTextSha256:hash(expected)});check(label+' full document/plainText and raw attachment bytes');
}
async function login(app,name){
 assert.equal((await account(app)).enabled,false);
 console.log('WAIT '+name+' hosted system-browser login');
 const [terminal]=await waitAccounts(name+' login',[app],async([s])=>{if(s.state==='authorizing')return false;if(s.state==='signedOut')throw fail('LOGIN_ENDED_SIGNED_OUT');return !!s.profile;},120000,()=>accountAction(app,'signIn',{}, {pendingNetwork:true}));
 report.observations.push({device:name,kind:'login',...safeStatus(terminal)});await save();
 assert(terminal.profile&&!terminal.error&&terminal.profile.username==='cybernoteqa20261113a','LOGIN_NOT_ACCEPTED');assert.equal(terminal.state,'paused');assert.equal(terminal.enabled,false);check(name+' real same-account login, initially paused');
 return terminal.profile.subject;
}
async function enable(app){
 const [status]=await waitAccounts('enable settles',[app],([s])=>accountEnabled(s),60000,()=>accountAction(app,'setEnabled',{enabled:true},{pendingNetwork:true}));
 report.observations.push({kind:'enabled',...safeStatus(status)});assert(!status.error,'ENABLE_FAILED');await leave(app);
}
async function pause(app){await waitAccounts('account paused',[app],([s])=>s.state==='paused'&&!s.enabled&&!!s.profile&&!s.devices.some(d=>d.connected),10000,()=>accountAction(app,'setEnabled',{enabled:false},{pendingNetwork:true}));await leave(app);}
async function edit(app,id,text){await leave(app);await command(app,'note.select',{id});const current=await note(app,id);await command(app,'editor.setContent',{document:preserveAttachments(current.document,doc(text))});await command(app,'app.flush');}
async function conflictRows(app,checkAccount=true){
 if(checkAccount)await account(app);if(!(await app.state()).preferences.open)await command(app,'settings.open');await command(app,'settings.tab',{tab:'sync'});await command(app,'sync.conflicts');
 assert(!(await app.state()).synchronization.error,'Conflict query must succeed');
 return app.evaluate("Array.from(document.querySelectorAll('.sync-conflict')).map(row=>({titles:Array.from(row.querySelectorAll('.sync-variant strong')).map(n=>n.textContent),variants:row.querySelectorAll('.sync-variant').length}))");
}
try{
 let a=await open('a'),b=await open('b');check('two isolated native stores become interactive');
 let ids,expected;
 if(prior){
  phase='restore-existing-grants';ids=Object.fromEntries(['a','b'].map(name=>[name,prior.observations.find(r=>r.device===name&&r.kind==='original-attachment')?.noteId]));assert(ids.a&&ids.b,'Prior local note IDs required');
  expected={a:body(await note(a,ids.a)),b:body(await note(b,ids.b))};
  await waitAccounts('both existing real grants restore',[a,b],s=>s.every(v=>v.enabled&&v.profile?.username==='cybernoteqa20261113a'&&!v.error),120000);
  assert.equal((await account(a)).profile.subject,(await account(b)).profile.subject);check('same real account grants restore without a new authorization');
 }else{
 phase='local-data';ids={a:await create(a,'账户验收 A → B'),b:await create(b,'账户验收 B → A')};
 expected={a:body(await note(a,ids.a)),b:body(await note(b,ids.b))};
 await originals(a,ids.a);await originals(b,ids.b);assert(!(await note(a,ids.b))&&!(await note(b,ids.a)));check('local rich documents and PNG/bin raw bytes, isolated before login');
 await a.close();await b.close();assert(a.lifecycle.naturalExit&&b.lifecycle.naturalExit);a=await open('a');b=await open('b');
 for(const name of ['a','b']){assert.equal(body(await note(devices[name],ids[name])),expected[name]);await command(devices[name],'note.select',{id:ids[name]});await originals(devices[name],ids[name]);}check('both local documents and attachments survive real process restarts');await save();
 phase='login-a';const owner=await login(a,'a');phase='login-b';assert.equal(await login(b,'b'),owner);check('both native grants resolve to the same account');
 phase='first-merge';await enable(a);await enable(b);
 }
 phase='automatic-discovery';await waitAccounts('trusted automatic peer connection',[a,b],s=>s.every(s=>s.state==='ready'&&!s.error&&s.devices.some(d=>!d.current&&d.connected)),120000);check('account automatic discovery without manual pairing');
 phase='bidirectional-data';await converge(a,b,ids.a,'A to B');await converge(b,a,ids.b,'B to A');
 phase='pause';await pause(b);
 const pending=await create(a,'账户验收 暂停补齐');await delay(3000);assert(!(await note(b,pending)));check('paused device retains account and does not apply remote new note');await enable(b);await converge(a,b,pending,'resume catch-up');
 phase='offline-restart';await b.close();assert(b.lifecycle.naturalExit);const offline=await create(a,'账户验收 离线重启补齐');b=await open('b');await converge(a,b,offline,'offline restart catch-up');check('account runtime restores and syncs with account UI closed');
 phase='concurrent-offline';report.scenarios.concurrentOffline='running';await save();
 const concurrent=await create(a,'账户验收 并发共享基线');
 await converge(a,b,concurrent,'concurrent shared base');
 // Both account runtimes are sealed before either edit, so both branches share
 // the replicated base and neither can observe the other's new version.
 await pause(a);await pause(b);
 await edit(a,concurrent,'甲端并发版本：保留全部甲中文');await edit(b,concurrent,'乙端并发版本：保留全部乙中文');
 const branches=[await note(a,concurrent),await note(b,concurrent)];assert.notEqual(branches[0].title,branches[1].title);
 const branchBodies=[];
 for(const [i,app] of [a,b].entries()){await originals(app,concurrent);branchBodies.push(canonicalBody(await workspace(app),branches[i]));}
 assert.notEqual(branchBodies[0],branchBodies[1]);
 await enable(a);await enable(b);
 for(const app of [a,b]){
  await waitAccounts('both concurrent heads visible on '+app.name,[app],async()=>{const rows=await conflictRows(app,false);return rows.some(r=>r.variants>=2&&branches.every(n=>r.titles.includes(n.title)));},60000);
  assert((await account(app)).conflictCount>0,'Account metrics must expose the conflict');await leave(app);
 }
 // Use the same production keep-all confirmation as the existing sync runner.
 await conflictRows(a);
 assert(await a.evaluate(`(()=>{const row=Array.from(document.querySelectorAll('.sync-conflict')).find(row=>arg.every(title=>Array.from(row.querySelectorAll('.sync-variant strong')).some(n=>n.textContent===title)));const button=row&&Array.from(row.querySelectorAll('button')).find(b=>b.textContent.trim()==='全部另存并解决');if(!button||button.disabled)return false;button.click();return true;})()`,branches.map(n=>n.title)),'Conflict keep-all action available');await a.idle();
 assert(await a.evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.sync-confirmation button')).find(b=>b.textContent.replace(/\\s/g,'')==='确认全部另存');if(!button||button.disabled)return false;button.click();return true;})()`),'Keep-all confirmation available');await a.idle();
 const resolvedIds=[];
 for(const app of [a,b]){
  await leave(app);
  let copies;
  await waitAccounts('keep-all preserves both complete branches on '+app.name,[a,b],async statuses=>{const ws=await workspace(app);copies=branchBodies.map(expected=>ws.notes.find(n=>!n.deletedAt&&canonicalBody(ws,n)===expected));return statuses[app===a?0:1].conflictCount===0&&copies.every(Boolean);},60000);
  for(const copy of copies){await command(app,'note.select',{id:copy.id});await originals(app,copy.id);}
  if(app===a)resolvedIds.push(...copies.map(n=>n.id));
 }
 report.observations.push({kind:'concurrent-offline',isolation:'both-account-runtimes-paused',visibleHeadsOnBothDevices:true,resolution:'confirmed-keepAll',bothCompleteBodiesOnBothDevices:true,attachmentReferencesOwned:true,originalBytesMatchOnBothDevices:true,comparison:'full-document-and-plainText-with-owned-attachment-metadata-in-place-of-remapped-IDs',branchBodySha256:branchBodies.map(n=>hash(n))});
 report.scenarios.concurrentOffline='pass';check('concurrent offline heads and keepAll preserve both full bodies, owned attachment references and original bytes');await save();

 phase='logout';report.scenarios.logout='running';await save();
 const preserved=snapshotNotes((await workspace(a)).notes);
 await waitAccounts('signed out',[a],([s])=>signedOut(s),60000,()=>accountAction(a,'signOut',{}, {pendingNetwork:true}));await leave(a);
 const remoteIds=[await create(b,'账户验收 退出后不得接收',false)];
 const assertLogout=async label=>{
  await waitAccounts('remote source ready after logout',[b],([peer])=>peer.state==='ready'&&peer.enabled&&!!peer.profile,60000,async()=>{await accountAction(b,'syncNow',{}, {pendingNetwork:true});await leave(b);});
  const result=await observeLogout({readStatus:async()=>{const peer=await account(b);assert(peer.state==='ready'&&peer.enabled&&peer.profile,'Remote source must remain ready, signed in and enabled');return account(a);},readNotes:async()=>(await workspace(a)).notes,snapshot:preserved,remoteIds});
  report.observations.push({kind:'logout-exclusion',label,...result,remoteSyncRequested:true,remoteSourceReady:true,remoteNoteCount:remoteIds.length,preservedNoteCount:preserved.length});
 };
 await assertLogout('before restart');
 await a.close();assert(a.lifecycle.naturalExit);a=await open('a');
 remoteIds.push(await create(b,'账户验收 退出重启后不得接收',false));
 await assertLogout('after restart');
 for(const id of [ids.a,ids.b,pending,offline,...resolvedIds]){await command(a,'note.select',{id});await originals(a,id);}
 report.scenarios.logout='pass';check('logout excludes post-logout remote notes before/after restart and retains all local bodies plus original attachments');await save();
}catch(error){report.status='fail';report.failure={phase,code:failureCode(error)};console.log('FAIL '+phase+' '+report.failure.code);
 if(phase==='concurrent-offline')report.scenarios.concurrentOffline='fail';if(phase==='logout')report.scenarios.logout='fail';
 for(const [name,app] of Object.entries(devices)){try{report.observations.push({device:name,kind:'failure-status',...safeStatus(await account(app,{allowFailure:true}))});}catch{}}
}finally{
 await finishReport(report,children,save);
}
process.exitCode=report.status==='pass'?0:1;
