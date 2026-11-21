import test from 'node:test';
import assert from 'node:assert/strict';
import {SERIAL,PACKAGE} from './account109-android.mjs';
import {PIN} from './account109-android-preserving-upgrade.mjs';
import {CURRENT,receiptGate,options,exerciseCurrent} from './account109-android-current-login-smoke.mjs';

const signedOut=()=>({state:'signedOut',enabled:false,devices:[],pendingCount:0,conflictCount:0});
function receipt(){return {schema:1,scope:'account109-android-current-data-preserving-upgrade',status:'pass-data-preservation-only',serial:SERIAL,package:PACKAGE,source:PIN.source,apkSha256:PIN.apkSha256,oldApkSha256:PIN.oldApkSha256,certificateSha256:PIN.certificateSha256,privateSnapshotSha256:CURRENT.snapshotSha256,postReadSamples:2,accountAfter:{...signedOut(),hasProfile:false},
  ...Object.fromEntries(['candidateVerified','currentDataCaptured','preInstallLeaseAndForwardReleased','installAttempted','installCompleted','installedReviewedSourceVerified','allCurrentDataPreserved','comparisonCompleted','cleanupComplete'].map(k=>[k,true])),
  ...Object.fromEntries(['historicalBaselineAccepted','attachmentOriginExplained','accountMutationSent','notesOrAttachmentsWritten','dbOrGrantRead','loginOrSyncAccepted'].map(k=>[k,false]))};}
test('fixed upgrade receipt must prove complete preservation and retain the historical limits',()=>{
  receiptGate(receipt());
  for(const patch of [{status:'running'},{source:'other'},{apkSha256:'other'},{certificateSha256:'other'},{privateSnapshotSha256:'other'},{postReadSamples:1},{cleanupComplete:false},{allCurrentDataPreserved:false},{historicalBaselineAccepted:true},{attachmentOriginExplained:true},{accountMutationSent:true},{failure:{}},{accountAfter:{...signedOut(),hasProfile:true}}])assert.throws(()=>receiptGate({...receipt(),...patch}));
});
test('CLI offers only the three independent cases and fresh private-output namespace',()=>{
  for(const scenario of ['embedded-back','browser'])assert.equal(options(['--case',scenario,'--output','/private/tmp/account109-android-current-login-smoke-unit01']).scenario,scenario);
  for(const args of [['--case','all','--output','/private/tmp/account109-android-current-login-smoke-unit01'],['--case','browser','--baseline','arbitrary'],['--case','browser','--output','/private/tmp/original'],['--case','browser','--output','/private/tmp/account109-android-current-login-smoke-unit01','--source','other']])assert.throws(()=>options(args));
});
function fixture(){
  let now=0,state=signedOut();const calls=[],records=[];
  // Synthetic unit payload only. No device, real private snapshot or original bytes are read.
  const expected={notes:[{id:'unit',document:{type:'doc',content:[{type:'paragraph'}]},plainText:'unit',pinned:true,revision:7}],attachments:[{id:'unit-file',noteId:'unit',mime:'unit/type',relativePath:'unit',size:4}],attachmentBytes:[{id:'unit-file',byteLength:4,sha256:'unit-digest'}]};
  const peer={accountStatus:async()=>structuredClone(state),
    signIn:async surface=>{calls.push('signIn:'+surface);state={...signedOut(),state:'authorizing',authorizationSurface:surface};return structuredClone(state);},
    nativeLoginPresentation:async()=>({dialog:true,webView:true,hostedForm:true}),
    closeNativeLogin:async()=>{calls.push('native-back');state=signedOut();},
    externalLoginActivity:async()=>({owned:false,browser:true}),returnFromLoginBrowser:async()=>{calls.push('return-owned');},
    cancelLogin:async()=>{calls.push('cancel');state=signedOut();},closeSettings:async()=>{},
    reclaimSignedOut:async()=>{calls.push('reclaim');return {forceStop:false,oldPid:101};},close:async()=>{calls.push('close');}};
  return {peer,expected,calls,records,scenario:'embedded-back',read:async()=>structuredClone(expected),
    clock:{now:()=>now,sleep:async ms=>{now+=ms;}},reopen:async()=>{calls.push('reopen');return peer;},record:async(kind,proof)=>{records.push({kind,...proof});},setState:s=>{state=s;}};
}
for(const scenario of ['embedded-back','browser'])test(`${scenario} reuses real exercise with full current capture and three 3-second signedOut windows`,async()=>{
  const f=fixture();await exerciseCurrent({...f,scenario});
  assert.equal(f.calls.filter(x=>x.startsWith('signIn:')).length,1);
  assert.equal(f.calls.filter(x=>x==='cancel').length,scenario==='embedded-back'?0:1);
  assert.equal(f.calls.includes('native-back'),scenario==='embedded-back');
  assert(f.calls.includes('reclaim')&&f.calls.includes('reopen'));
  for(const kind of ['baseline-preserved','cancelled-preserved','restarted-preserved']){const r=f.records.find(r=>r.kind===kind);assert(r.samples>=3);assert(r.durationMs>=3000);}
});
test('unexpected initial error stops before capture or SignIn, never clears the error',async()=>{
  const f=fixture();f.setState({...signedOut(),state:'error',error:{code:'account_network'}});let reads=0;
  await assert.rejects(exerciseCurrent({...f,read:async()=>{reads++;return f.expected;}}));assert.equal(reads,0);assert.equal(f.calls.length,0);
});
test('changed current metadata blocks SignIn rather than adopting a new expected snapshot',async()=>{
  const f=fixture();await assert.rejects(exerciseCurrent({...f,read:async()=>{const n=structuredClone(f.expected);n.notes[0].pinned=false;return n;}}),{code:'DATA_CHANGED'});
  assert.equal(f.calls.length,0);assert.equal(f.expected.notes[0].pinned,true);
});
test('post-cancel descriptor or byte changes stop before restart without replacing the private expectation',async()=>{
  for(const change of [s=>{s.attachments[0].noteId='other';},s=>{s.attachmentBytes[0].sha256='other';}]){
    const f=fixture();await assert.rejects(exerciseCurrent({...f,read:async()=>{const s=structuredClone(f.expected);if(f.calls.includes('native-back'))change(s);return s;}}),{code:'DATA_CHANGED'});assert(!f.calls.includes('reclaim'));assert(!f.calls.includes('reopen'));
  }
});
test('incorrect native surface fails and never cancels a different transaction or restarts',async()=>{
  const f=fixture(),signIn=f.peer.signIn;f.peer.signIn=async()=>signIn('browser');
  await assert.rejects(exerciseCurrent(f));assert(!f.calls.includes('native-back')&&!f.calls.includes('cancel')&&!f.calls.includes('reclaim'));
});
