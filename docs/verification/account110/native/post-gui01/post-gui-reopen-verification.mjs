import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {NativeApp} from '/Users/water/work/2026/Apple-Notes-Clone/scripts/verification/sync108-native-driver.mjs';
import {validatePackage,parseStatus,closeNativeClients,safeFailureReceipt,waitFor} from '/Users/water/work/2026/Apple-Notes-Clone/scripts/verification/account110-device-actions.mjs';
import {semantic,stable} from '/private/tmp/cybernote-account109-login-surfaces/scripts/verification/account110-owned-continuation.mjs';
const root='/Users/water/work/2026/Apple-Notes-Clone',source='29c878108b2ea421b5e4fccd71547206071fdbfa',owned='/private/tmp/account110-device-actions-staging-fix-fresh-live03';
const out='/private/tmp/account110-postgui-verify-close-01',priorPath='/private/tmp/account110-device-actions-owned-continuation-01/result.json',priorSHA='246c0f624784e16797a9d27a871a9d5af2da482e9b3f8db099e7c6fa017a21ca';
const firstSHA='33b8150f542aa3eab1dfce2151923837cb693191df8edc6ece9996eee00f49fb';
const hash=b=>createHash('sha256').update(b).digest('hex'),need=(v,c)=>{if(!v)throw Object.assign(new Error(c),{code:c});};
const currentSource=()=>({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),clean:execFileSync('git',['status','--porcelain'],{cwd:root}).length===0});
const apps={},clients=[];let phase='preflight';
const r={schema:1,kind:'post-GUI-normal-reopen-readonly-verification',status:'running',productSource:source,continuationResultSha256:priorSHA,readOnlyActions:['ready','account.status','app.state'],noTransferCommand:true,noLogin:true,boundary:'GUI holders lacked status/state control. Both were first closed normally. These status and semantic checks are from separate normal same-owned reopens, not the original GUI processes before close.',devices:[]};
const save=()=>writeFile(out+'/result.json',JSON.stringify(r,null,2)+'\n',{mode:0o600});
async function main(){
 const before=currentSource();need(before.head===source&&before.clean,'SOURCE_CHANGED');
 const bytes=await readFile(priorPath);need(hash(bytes)===priorSHA,'FIRST_RESULT_CHANGED');const prior=JSON.parse(bytes);need(prior.status==='continuation-pass-original-fresh-run-still-failed','CHECK_FAILED');
 const candidate=await validatePackage(root+'/artifacts/account110/mac-29c87810-debug-01/packaging-receipt.json',source);
 for(const p of [owned,owned+'/desktop-a',owned+'/desktop-b'])need((await lstat(p)).isDirectory()&&!(await lstat(p)).isSymbolicLink()&&await realpath(p)===p,'OWNERSHIP_FAILED');
 const ps=execFileSync('/bin/ps',['-axo','command='],{encoding:'utf8'});need(!ps.split('\n').some(s=>s.startsWith(candidate.binary+' ')),'APP_ALREADY_RUNNING');
 for(const name of ['a-02','b-01']){const g=JSON.parse(await readFile('/private/tmp/account110-postgui-'+name+'/result.json'));need(g.status==='closed'&&g.cleanup.allClosed&&!g.cleanup.failed&&g.cleanup.lifecycle.every(l=>l.naturalExit&&l.exitCode===0&&l.closeConfirmed&&l.forcedSignals.length===0),'CLEANUP_FAILED');}
 await mkdir(out,{mode:0o700});r.candidate=candidate;r.sourceBefore=before;r.harnessSha256=hash(await readFile(new URL(import.meta.url)));await save();
 try{
  phase='normal-reopen';for(const n of ['a','b']){apps[n]=new NativeApp(candidate.binary,owned+'/desktop-'+n,{name:n,env:{NOTES_SYNC_E2E_SLOT:n==='a'?'left':'right'}});clients.push(apps[n]);await apps[n].ready(60000);}
  let owner;
  for(const n of ['a','b']){
   phase='status-'+n;let samples=0;
   const status=await waitFor(async()=>{const s=parseStatus(await apps[n].evaluate("window.__TAURI_INTERNALS__.invoke('account_command',{command:{type:'status'}})"));need(s.error===undefined&&s.deviceOperation===undefined,'CHECK_FAILED');samples++;return s;},s=>s.profile&&s.enabled&&s.state==='ready'&&s.devices.filter(d=>d.current).length===1&&s.devices.some(d=>!d.current&&d.online&&d.syncAvailable),{timeoutMs:90000,code:'RESTORE_TIMEOUT'});
   if(owner)need(owner===status.profile.subject,'ACCOUNT_OWNER_CHANGED');else owner=status.profile.subject;
   phase='semantic-'+n;const state=await apps[n].state(),notes=state.workspace.notes;
   const expected=prior.verifications.filter(v=>v.phase==='final-restart'&&v.device===n).map(v=>v.semanticSha256).sort();
   const actual=notes.map(note=>hash(JSON.stringify(stable(semantic(note))))).sort();
   need(expected.length===(n==='a'?10:9)&&new Set(expected).size===expected.length,'CHECK_FAILED');
   need(JSON.stringify(expected)===JSON.stringify(actual),'CONTENT_MISMATCH');
   r.devices.push({device:n,status:{state:status.state,enabled:status.enabled,hasProfile:!!status.profile,errorAbsent:status.error===undefined,deviceOperationAbsent:status.deviceOperation===undefined,currentDeviceCount:status.devices.filter(d=>d.current).length,onlinePeerCount:status.devices.filter(d=>!d.current&&d.online&&d.syncAvailable).length,samples},semantic:{expectedNotes:expected.length,actualNotes:actual.length,exactSetEqual:true,expectedSetSha256:hash(JSON.stringify(expected)),actualSetSha256:hash(JSON.stringify(actual))},attachmentCount:state.workspace.attachments.length});await save();console.log('PASS '+n+' status-no-error-no-operation exact-semantic-set '+actual.length);
  }
  r.status='pass';
 }catch(error){r.status='fail';r.failure={phase,...safeFailureReceipt(error)};console.log('FAIL '+phase+' '+r.failure.code);}
 finally{
  r.cleanup=await closeNativeClients(clients);if(r.cleanup.failed||!r.cleanup.allClosed)r.status='fail';
  r.sourceAfter=currentSource();r.continuationResultUnchanged=hash(await readFile(priorPath))===priorSHA;r.originalResultUnchanged=hash(await readFile(owned+'/result.json'))===firstSHA;
  if(r.sourceAfter.head!==source||!r.sourceAfter.clean||!r.continuationResultUnchanged||!r.originalResultUnchanged)r.status='fail';
  const psAfter=execFileSync('/bin/ps',['-axo','command='],{encoding:'utf8'});r.noCandidateProcessRemaining=!psAfter.split('\n').some(s=>s.startsWith(candidate.binary+' '));if(!r.noCandidateProcessRemaining)r.status='fail';await save();
 }
 console.log('RESULT '+r.status);if(r.status!=='pass')process.exitCode=1;
}
main().catch(error=>{console.log(JSON.stringify({failure:safeFailureReceipt(error),phase}));process.exitCode=1;});
