#!/usr/bin/env node
// Real native account handlers + system-browser login; no grants or invites injected.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {NativeApp,until,delay} from './sync108-native-driver.mjs';
const args=process.argv.slice(2), opts={};
for(let i=0;i<args.length;i++){
 assert(['--binary','--output'].includes(args[i])&&!opts[args[i]],'Expected --binary ABS_PATH --output FRESH_ABS_DIR');
 opts[args[i]]=args[++i];
}
assert(isAbsolute(opts['--binary']||'')&&isAbsolute(opts['--output']||''),'Absolute paths required');
const binary=opts['--binary'], output=opts['--output'];
await mkdir(output); // Never reuse, clear or replace an existing library.
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={schema:1,kind:'real-account-two-native-desktops',startedAt:new Date().toISOString(),tools:{runnerSha256:hash(await readFile(new URL(import.meta.url))),driverSha256:hash(await readFile(new URL('./sync108-native-driver.mjs',import.meta.url)))},binary:{path:binary,sha256:hash(await readFile(binary))},checks:[],observations:[],limitations:['Debug/e2e build and existing synthetic File[] attachment boundary; no physical keyboard or OS picker claim.','Only dedicated synthetic hosted SSO may be used. This runner never supplies credentials, callbacks, tokens, workspace IDs or pairing invitations.','Inherited shell proxy variables are blanked for these owned test processes, matching an app launched outside the shell; no system network settings change.']};
const check=name=>{report.checks.push({name,status:'pass'});console.log('PASS '+name);};
// Scoped to this runner's lifetime; does not unlock or change system settings.
if(process.platform==='darwin'){
 const awake=spawn('/usr/bin/caffeinate',['-di','-w',String(process.pid)],{stdio:'ignore'});
 awake.on('error',()=>{report.sleepAssertionUnavailable=true;});awake.unref();
}
const children=[],devices={}; let phase='startup';
const save=()=>writeFile(resolve(output,'result.json'),JSON.stringify(report,null,2)+'\n');
const proxyEnv=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].map(k=>[k,'']));
async function open(name){
 const app=new NativeApp(binary,resolve(output,'desktop-'+name),{name,env:{...proxyEnv,NOTES_SYNC_E2E_SLOT:name==='a'?'left':'right'}});children.push(app);devices[name]=app;
 const ready=await app.ready(45000);report.observations.push({device:name,kind:'ready',pid:app.child.pid,interactive:ready.interactive,startupDetached:ready.startupDetached});return app;
}
async function command(app,id,args={}){const v=await app.execute(id,args);await app.idle();return v;}
async function workspace(app){return (await app.state()).workspace;}
async function account(app){return app.evaluate("window.__TAURI_INTERNALS__.invoke('account_command',{command:{type:'status'}})");}
function safeStatus(s){return {state:s.state,enabled:s.enabled,hasProfile:!!s.profile,identityCheck:s.profile?.username===undefined?'unverified':s.profile.username==='cybernoteqa20261113a'?'expectedSyntheticUser':'differentUser',error:s.error?{code:s.error.code,stage:s.error.stage}:undefined,devices:s.devices.map(d=>({online:d.online,current:d.current,connected:d.connected})),pendingCount:s.pendingCount,conflictCount:s.conflictCount};}
async function enter(app){await command(app,'settings.open');await command(app,'settings.tab',{tab:'account'});}
async function leave(app){if((await app.state()).preferences.open)await command(app,'app.back');}
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
const body=n=>JSON.stringify({document:n.document,plainText:n.plainText});
async function note(app,id){return (await workspace(app)).notes.find(n=>n.id===id);}
const attachmentRefs=node=>[...(node?.type==='attachment'?[node.attrs?.id]:[]),...(node?.content||[]).flatMap(attachmentRefs)];
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
 const expected=body(await note(source,id));await until(label,async()=>{const n=await note(target,id);return n&&body(n)===expected;},60000);await command(target,'note.select',{id});await originals(target,id);report.observations.push({kind:'convergence',label,noteId:id,documentAndPlainTextSha256:hash(expected)});check(label+' full document/plainText and raw attachment bytes');
}
async function login(app,name){
 await enter(app);assert.equal((await account(app)).enabled,false);await command(app,'account.signIn');
 console.log('WAIT '+name+' hosted system-browser login');
 let terminal;
 await until(name+' login',async()=>{const s=await account(app);if(s.state==='authorizing'||s.state==='signedOut')return false;terminal=s;return true;},120000);
 report.observations.push({device:name,kind:'login',...safeStatus(terminal)});await save();
 assert(terminal.profile&&!terminal.error&&terminal.profile.username==='cybernoteqa20261113a','LOGIN_NOT_ACCEPTED');assert.equal(terminal.enabled,false);check(name+' real same-account login, initially paused');
 return terminal.profile.subject;
}
async function enable(app){
 await enter(app);await command(app,'account.setEnabled',{enabled:true});
 const prompt=await app.evaluate("document.querySelector('.account-confirmation')?.textContent||''");assert(prompt.includes('本地备忘录')&&prompt.includes('开启并合并'),'Real first merge confirmation required');
 await command(app,'dom.click',{selector:'.account-confirmation button:last-child'});
 let status;await until('enable settles',async()=>{status=await account(app);return status.state!=='authorizing'&&status.enabled;},60000);
 report.observations.push({kind:'enabled',...safeStatus(status)});assert(!status.error,'ENABLE_FAILED');await leave(app);
}
try{
 let a=await open('a'),b=await open('b');check('two isolated native stores become interactive');
 phase='local-data';const ids={a:await create(a,'账户验收 A → B'),b:await create(b,'账户验收 B → A')};
 const expected={a:body(await note(a,ids.a)),b:body(await note(b,ids.b))};
 await originals(a,ids.a);await originals(b,ids.b);assert(!(await note(a,ids.b))&&!(await note(b,ids.a)));check('local rich documents and PNG/bin raw bytes, isolated before login');
 await a.close();await b.close();assert(a.lifecycle.naturalExit&&b.lifecycle.naturalExit);a=await open('a');b=await open('b');
 for(const name of ['a','b']){assert.equal(body(await note(devices[name],ids[name])),expected[name]);await command(devices[name],'note.select',{id:ids[name]});await originals(devices[name],ids[name]);}check('both local documents and attachments survive real process restarts');await save();
 phase='login-a';const owner=await login(a,'a');phase='login-b';assert.equal(await login(b,'b'),owner);check('both native grants resolve to the same account');
 phase='first-merge';await enable(a);await enable(b);
 phase='automatic-discovery';await until('trusted automatic peer connection',async()=>{const [x,y]=await Promise.all([account(a),account(b)]);return [x,y].every(s=>s.state==='ready'&&!s.error&&s.devices.some(d=>!d.current&&d.connected));},120000);check('account automatic discovery without manual pairing');
 phase='bidirectional-data';await converge(a,b,ids.a,'A to B');await converge(b,a,ids.b,'B to A');
 phase='pause';await enter(b);await command(b,'account.setEnabled',{enabled:false});await leave(b);assert.equal((await account(b)).enabled,false);
 const pending=await create(a,'账户验收 暂停补齐');await delay(3000);assert(!(await note(b,pending)));check('paused device retains account and does not apply remote new note');await enable(b);await converge(a,b,pending,'resume catch-up');
 phase='offline-restart';await b.close();assert(b.lifecycle.naturalExit);const offline=await create(a,'账户验收 离线重启补齐');b=await open('b');await converge(a,b,offline,'offline restart catch-up');check('account runtime restores and syncs with account UI closed');
 phase='logout';await enter(a);await command(a,'account.signOut');await command(a,'dom.click',{selector:'.account-confirmation button:last-child'});await until('signed out',async()=>{const s=await account(a);return s.state==='signedOut'&&!s.profile&&!s.enabled;},60000);await leave(a);assert.equal(body(await note(a,ids.a)),expected.a);check('real logout seals account synchronization and keeps local data');
 report.status='pass';
}catch(error){report.status='fail';report.failure={phase,code:/^[A-Z_]+$/.test(error.message||'')?error.message:(error.code||'CHECK_FAILED')};console.log('FAIL '+phase+' '+report.failure.code);
 for(const [name,app] of Object.entries(devices)){try{report.observations.push({device:name,kind:'failure-status',...safeStatus(await account(app))});}catch{}}
}finally{
 await Promise.allSettled(children.map(app=>app.close()));report.lifecycle=children.map(app=>app.lifecycle);report.finishedAt=new Date().toISOString();await save();
}
process.exitCode=report.status==='pass'?0:1;
