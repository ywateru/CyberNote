#!/usr/bin/env node
// External harness only: fixed owned fresh-live03, same reviewed package. No sign-in.
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeApp} from './sync108-native-driver.mjs';
import {validatePackage,syncOnce,closeNativeClients,safeFailure,safeFailureReceipt,ownedFile,waitFor} from './account110-device-actions.mjs';
import {validateObservedStatus,safeStatusSample} from './account110-sdk-diagnostic.mjs';
const ROOT='/Users/water/work/2026/Apple-Notes-Clone';
const SOURCE='29c878108b2ea421b5e4fccd71547206071fdbfa';
const OWNED='/private/tmp/account110-device-actions-staging-fix-fresh-live03';
const FIRST='33b8150f542aa3eab1dfce2151923837cb693191df8edc6ece9996eee00f49fb';
const RECEIPT=ROOT+'/artifacts/account110/mac-29c87810-debug-01/packaging-receipt.json';
const RECEIPT_HASH='8f1dc6d52f00732b9e76018ef76433404e23314573e5f59efb55b7c1832c13b0';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>Object.assign(new Error(code),{code});
const need=(v,code='CHECK_FAILED')=>{if(!v)throw fail(code);};
const stable=v=>Array.isArray(v)?v.map(stable):v&&Object.getPrototypeOf(v)===Object.prototype?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const semantic=n=>Object.fromEntries(Object.entries(n).filter(([k])=>k!=='revision'));
const account="window.__TAURI_INTERNALS__.invoke('account_command',{command:arg})";
const read=`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;const access=s.workspace.access,owner=access.notes[arg.noteId];if(!owner?.authorized)throw Error('OWNER_NOT_AUTHORIZED');return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,expected:{sessionId:access.sessionId,epoch:access.epoch,noteEpoch:owner.epoch}});})()`;
export const ACTIONS=['ready','restore.status','verify.state','verify.select','verify.idle','verify.readAttachment','sync.start','sync.status','sync.poll','cleanup.close'];
const phases=['nativePageFinished','documentProbe','debugRegistration','appIdle','startupHandoff','evalEntered','evalNotObserved'];
export class ActionTrace{
 constructor({save=async()=>{},now=Date.now,limit=8192}={}){this.records=[];this.save=save;this.now=now;this.began=now();this.limit=limit;this.sequence=0;}
 async call(device,action,run,app){
  need(['a','b'].includes(device)&&ACTIONS.includes(action),'INVALID_ARGUMENTS');
  // Never run a request when its durable begin row could not be saved.
  need(this.records.length+2<=this.limit,'TRACE_LIMIT');
  const sequence=++this.sequence,started=this.now();
  this.records.push({sequence,device,action,event:'begin',elapsedMs:started-this.began});await this.save();
  try{const value=await run();this.records.push({sequence,device,action,event:'ok',elapsedMs:this.now()-this.began,durationMs:this.now()-started});await this.save();return value;}
  catch(error){const phase=phases.includes(app?.lifecycle?.failurePhase)?app.lifecycle.failurePhase:null;
   this.records.push({sequence,device,action,event:'error',elapsedMs:this.now()-this.began,durationMs:this.now()-started,code:safeFailure(error),nativePhase:phase});await this.save();throw error;}
 }
}
export function syncAction(arg){
 need(arg&&Object.getPrototypeOf(arg)===Object.prototype,'INVALID_ARGUMENTS');
 const keys=Object.keys(arg).sort().join(',');
 if(keys==='command,sequence'&&Number.isSafeInteger(arg.sequence)&&arg.sequence>0&&arg.command?.type==='syncDevice')return 'sync.start';
 if(keys==='type'&&arg.type==='status')return 'sync.status';
 if(keys==='sequence'&&Number.isSafeInteger(arg.sequence)&&arg.sequence>0)return 'sync.poll';
 throw fail('INVALID_ARGUMENTS');
}
export function argumentsFor(argv){
 need(argv.length===3&&argv[0]==='--run'&&argv[1]==='--output'&&/^\/private\/tmp\/account110-device-actions-continuation-[A-Za-z0-9-]+$/.test(argv[2]),'INVALID_ARGUMENTS');return argv[2];
}
const source=()=>({head:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),clean:execFileSync('git',['status','--porcelain'],{cwd:ROOT}).length===0});
export async function main(argv){
 const output=argumentsFor(argv),before=source();need(before.head===SOURCE&&before.clean,'SOURCE_CHANGED');
 const original=await readFile(OWNED+'/result.json');need(hash(original)===FIRST,'FIRST_RESULT_CHANGED');const prior=JSON.parse(original);
 need(hash(await readFile(new URL('./account110-device-actions.mjs',import.meta.url)))===prior.runnerSha256&&hash(await readFile(new URL('./sync108-native-driver.mjs',import.meta.url)))===prior.driverSha256,'SOURCE_CHANGED');
 need(prior.status==='fail'&&prior.failure.phase==='push'&&prior.failure.code==='NATIVE_TIMEOUT'&&prior.nativeCleanup.allClosed,'OWNERSHIP_FAILED');
 need(hash(await readFile(RECEIPT))===RECEIPT_HASH,'BINARY_CHANGED');const candidate=await validatePackage(RECEIPT,SOURCE);
 for(const n of ['a','b']){const dir=OWNED+'/desktop-'+n;need((await lstat(dir)).isDirectory()&&!(await lstat(dir)).isSymbolicLink()&&await realpath(dir)===dir,'OWNERSHIP_FAILED');}
 need(await realpath(OWNED)===OWNED&&!(await lstat(OWNED)).isSymbolicLink(),'OWNERSHIP_FAILED');
 await mkdir(output,{mode:0o700});
 const report={schema:1,kind:'fixed-owned-push-native-action-continuation',status:'running',source:SOURCE,candidate,firstResultSha256:FIRST,harnessSha256:hash(await readFile(fileURLToPath(import.meta.url))),actions:[],samples:[],verifications:[],pushStartAckObserved:false,boundaries:['Independent continuation, not replacement for failed full acceptance.','Fixed owned fresh-live03 A/B, normal restore only; no sign-in, grant/Noise copies, arbitrary commands, new content or native changes.','Same production operation/driver deadlines, strict error failure, at most one push attempt.','Only finite action labels, validated status, hashes/counts and finite failure codes; no raw IPC/error text or payload.']};
 let trace;const save=()=>{if(trace)report.actions=trace.records;return writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});};trace=new ActionTrace({save});await save();
 const apps={},labels=new Map();let owner;const run=(n,label,fn)=>trace.call(n,label,fn,apps[n]);
 const sample=async n=>{const s=validateObservedStatus(await run(n,'restore.status',()=>apps[n].evaluate(account,{type:'status'})));const own=s.devices.find(d=>d.current);if(own)labels.set(own.id,n);need(report.samples.length<4096,'TRACE_LIMIT');report.samples.push(safeStatusSample(n,'restore',s,labels));await save();if(s.error||s.state==='error')throw Object.assign(fail('ACCOUNT_FAILURE'),s.error?{accountError:s.error}:{});need(s.state!=='authorizing','RESTORE_FAILED');if(s.profile){if(owner)need(s.profile.subject===owner,'ACCOUNT_OWNER_CHANGED');else owner=s.profile.subject;}return s;};
 try{
  for(const n of ['a','b']){apps[n]=new NativeApp(candidate.binary,OWNED+'/desktop-'+n,{name:n,env:{NOTES_SYNC_E2E_SLOT:n==='a'?'left':'right'}});await run(n,'ready',()=>apps[n].ready(60000));}
  const statuses=await waitFor(async()=>[await sample('a'),await sample('b')],ss=>ss.every(s=>s.profile&&s.enabled&&s.state==='ready'&&s.devices.some(d=>!d.current&&d.online&&d.syncAvailable)),{timeoutMs:90000,code:'RESTORE_TIMEOUT'});
  for(const n of ['a','b']){
   const state=await run(n,'verify.state',()=>apps[n].state());
   for(const spec of prior.specimens.filter(s=>s.origin===n)){
    const notes=state.workspace.notes.filter(note=>hash(JSON.stringify(stable(semantic(note))))===spec.semanticSha256);need(notes.length===1,'CONTENT_MISMATCH');const note=notes[0];
    const attachments=state.workspace.attachments.filter(a=>a.noteId===note.id);need(attachments.length===spec.attachments.length,'ATTACHMENT_MISMATCH');
    await run(n,'verify.select',()=>apps[n].execute('note.select',{id:note.id}));await run(n,'verify.idle',()=>apps[n].idle());
    for(const a of attachments){const expected=spec.attachments.find(f=>f.mime===a.mime);need(expected&&expected.bytes===a.size,'ATTACHMENT_MISMATCH');const path=await ownedFile(apps[n].directory,'attachments/'+a.relativePath);need(hash(await readFile(path))===expected.sha256,'ATTACHMENT_BYTES_MISMATCH');
     const got=await run(n,'verify.readAttachment',()=>apps[n].evaluate(read,{id:a.id,noteId:note.id}));need(got&&got.mime===a.mime&&got.name===a.displayName&&got.recordedAt===(a.recordedAt??null),'ATTACHMENT_READ_MISMATCH');const bytes=Buffer.from(got.data,'base64');need(bytes.length===expected.bytes&&hash(bytes)===expected.sha256,'ATTACHMENT_READ_MISMATCH');}
    report.verifications.push({device:n,documentHashMatched:true,attachmentCount:attachments.length,storedFilesMatch:true,productionReadsMatch:true});await save();
   }
  }
  const target=statuses[1].devices.find(d=>d.current)?.id;need(target&&statuses[0].devices.some(d=>d.id===target&&!d.current&&d.online&&d.syncAvailable),'ACTION_OWNER');
  const facade={evaluate:async(expression,arg)=>{const action=syncAction(arg);const value=await run('a',action,()=>apps.a.evaluate(expression,arg));if(action==='sync.start'){need(value?.started===true,'ACTION_OWNER');report.pushStartAckObserved=true;await save();}return value;}};
  const result=await syncOnce(facade,target,'push',{onStatus:s=>{report.samples.push(safeStatusSample('a','push',s,labels));}});
  report.runningObserved=result.runningObserved;report.status='single-push-succeeded-not-acceptance';await save();
 }catch(error){report.status='fail';report.failure=safeFailureReceipt(error);await save();}
 finally{
  // Existing driver owns shutdown/exit/pipe confirmation. No retry after timeout.
  const closed=await closeNativeClients(Object.values(apps));report.lifecycle=closed.lifecycle;report.nativeCleanup={allClosed:closed.allClosed,failed:closed.failed};if(closed.failed||!closed.allClosed)report.status='fail';
  const after=source();report.sourceAfter=after;report.firstResultUnchanged=hash(await readFile(OWNED+'/result.json'))===FIRST;if(after.head!==SOURCE||!after.clean||!report.firstResultUnchanged)report.status='fail';await save();
 }
 console.log(JSON.stringify({status:report.status,failure:report.failure,lastActions:report.actions.slice(-6),nativeCleanup:report.nativeCleanup}));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(r=>{if(r.status==='fail')process.exitCode=1;}).catch(e=>{console.error(JSON.stringify({code:safeFailure(e)}));process.exitCode=1;});
