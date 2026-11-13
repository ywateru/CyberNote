import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,lstat,rm} from 'node:fs/promises';
import os from 'node:os';
import {join} from 'node:path';
import {PIN,hash,canonical,historicalPrefix,fixedEvidence,initialAccount,sameSnapshot,signatureVerified,writePrivateSnapshot,executeUpgrade,options} from './account109-android-preserving-upgrade.mjs';

const clone=structuredClone;
const error=code=>Object.assign(Error('synthetic error that must not be recorded'),{code});
const initial=()=>({state:'error',enabled:false,devices:[],error:{code:'account_network',stage:'coordinator'},pendingCount:0,conflictCount:0});
const knownEvidence=()=>({idSha256:PIN.attachmentIdSha256,nodeSha256:PIN.attachmentNodeSha256,byteLength:PIN.attachmentBytes,sha256:PIN.attachmentSha256});
function structure(){
  // Entirely synthetic unit data; never claimed as phone observation or provenance.
  const history={notes:[PIN.noteId,'note-b','note-c','note-d'].map(id=>({id,plainText:'unit text',document:{type:'doc',content:[{type:'heading'},{type:'paragraph'},{type:'paragraph'}]}}))};
  const w={notes:clone(history.notes),attachments:[{id:'unit-attachment',noteId:PIN.noteId,displayName:'unit.bin',kind:'file',mime:'application/octet-stream',size:4,recordedAt:null,relativePath:'unit.bin'}],access:{notes:{[PIN.noteId]:{authorized:true}}}};
  w.notes[0].document.content.push({type:'attachment',attrs:{id:'unit-attachment',name:'unit.bin',kind:'file'}},{type:'paragraph'});
  return {w,history};
}
test('fixed CLI accepts only a fresh private-upgrade output path shape, with no identity overrides',()=>{
  assert.equal(options(['--output','/private/tmp/account109-android-preserving-upgrade-live01']),'/private/tmp/account109-android-preserving-upgrade-live01');
  for(const args of [[],['--apk','other'],['--output','/tmp/x'],['--output','/private/tmp/original'],['--output','/private/tmp/account109-android-preserving-upgrade-../original'],['--output','/private/tmp/account109-android-preserving-upgrade-live01','--force'],['--output','relative']])assert.throws(()=>options(args));
});
test('historical prefix allows exactly the already described extra node and empty paragraph',()=>{
  const {w,history}=structure();assert.equal(historicalPrefix(w,history).attachment.id,'unit-attachment');
});
for(const [label,mutate] of [
  ['plainText changed',w=>{w.notes[0].plainText+='x';}],
  ['original prefix changed',w=>{w.notes[0].document.content[1].type='heading';}],
  ['other complete document changed',w=>{w.notes[1].document.content.push({type:'paragraph'});}],
  ['unknown note',w=>{w.notes.push(clone(w.notes[1]));}],
  ['reference changed',w=>{w.notes[0].document.content[3].attrs.id='other';}],
  ['duplicate reference',w=>{w.notes[1].document.content[0]={type:'attachment',attrs:{id:'unit-attachment'}};}],
  ['descriptor owner changed',w=>{w.attachments[0].noteId='note-b';}],
  ['descriptor metadata changed shape',w=>{w.attachments[0].unexpected=true;}],
  ['name differs',w=>{w.attachments[0].displayName='other';}],
  ['not authorized',w=>{w.access.notes[PIN.noteId].authorized=false;}],
  ['trailing paragraph contains content',w=>{w.notes[0].document.content[4].content=[{type:'text',text:'unit'}];}],
])test(`pre-install structural gate rejects ${label}`,()=>{const {w,history}=structure();mutate(w);assert.throws(()=>historicalPrefix(w,history));});
test('fixed attachment evidence refuses each replacement digest and changed length',()=>{
  fixedEvidence(knownEvidence());
  for(const key of Object.keys(knownEvidence())){const e=knownEvidence();e[key]=typeof e[key]==='number'?e[key]+1:'0'.repeat(64);assert.throws(()=>fixedEvidence(e),{code:'CURRENT_EVIDENCE_CHANGED'});}
});
test('preservation compares full document/text, all note metadata, descriptor metadata and byte evidence',()=>{
  const before={notes:[{document:{type:'doc'},plainText:'unit',pinned:true,revision:4}],attachments:[{id:'a',noteId:'n',mime:'unit/type',relativePath:'unit',recordedAt:3}],attachmentBytes:[{sha256:'unit'}]};
  sameSnapshot(before,clone(before));
  for(const mutate of [s=>s.notes[0].document.type='paragraph',s=>s.notes[0].plainText+='x',s=>s.notes[0].pinned=false,s=>s.notes[0].revision++,s=>s.attachments[0].noteId='other',s=>s.attachments[0].mime='other',s=>s.attachments[0].relativePath='other',s=>s.attachments[0].recordedAt++,s=>s.attachmentBytes[0].sha256='other']){
    const after=clone(before);mutate(after);assert.throws(()=>sameSnapshot(before,after),{code:'DATA_CHANGED'});
  }
});
test('initial state stays the original error, never a clean-signedOut requirement or error reset',()=>{
  initialAccount(initial());for(const s of [{...initial(),state:'signedOut'},{...initial(),enabled:true},{...initial(),profile:{}},{...initial(),error:{code:'account_network',stage:'identityProvider'}},{...initial(),devices:[{connected:true}]}])assert.throws(()=>initialAccount(s));
});
test('debug signature requires verified v2, one signer and the exact reviewed certificate',()=>{
  const output=`Verified using v2 scheme (APK Signature Scheme v2): true\nNumber of signers: 1\nSigner #1 certificate DN: C=US, O=Android, CN=Android Debug\nSigner #1 certificate SHA-256 digest: ${PIN.certificateSha256}\n`;
  signatureVerified(output);
  for(const changed of [output.replace('): true','): false'),output.replace('signers: 1','signers: 2'),output.replace('CN=Android Debug','CN=Other'),output.replace(PIN.certificateSha256,'0'.repeat(64))])assert.throws(()=>signatureVerified(changed));
});
test('private current-content snapshot is mode 0600, byte-hashable and never overwritten',async()=>{
  const dir=await mkdtemp(join(os.tmpdir(),'account109-upgrade-unit-'));
  try{const data={notes:[{document:{type:'doc'},plainText:'synthetic unit-only text'}],attachments:[]};await writePrivateSnapshot(dir,data);
    const path=join(dir,'before.private.json');assert.equal((await lstat(path)).mode&0o777,0o600);assert.equal(hash(await readFile(path)),hash(canonical(data)+'\n'));
    await assert.rejects(writePrivateSnapshot(dir,{notes:[]}),{code:'EEXIST'});assert.equal(hash(await readFile(path)),hash(canonical(data)+'\n'));
  }finally{await rm(dir,{recursive:true});}
});

function fixture(){
  const calls=[],saved=[],snapshot={notes:[{document:{type:'doc'},plainText:'unit',pinned:true}],attachments:[],attachmentBytes:[]};
  const peer=(label,pid,sha)=>({label,owned:{pid},artifactIdentity:async()=>({apkSha256:sha}),accountStatus:async()=>initial()});
  const pre=peer('pre',PIN.oldPid,PIN.oldApkSha256),post=peer('post',PIN.oldPid+1,PIN.apkSha256);
  let leased=false;
  const io={save:async r=>{saved.push(clone(r));},verifyCandidate:async()=>{calls.push('candidate');},
    connect:async launch=>{calls.push(launch?'launch':'connect-existing');return launch?post:pre;},
    capture:async p=>{calls.push('capture-'+p.label);return clone(snapshot);},
    privateSnapshot:async()=>{calls.push('private-write');},release:async p=>{calls.push('release-'+p.label);},assertReleased:async()=>{assert(!leased);calls.push('lease-absent');},
    acquireInstallLease:async()=>{calls.push('install-lease');leased=true;return {close:async()=>{calls.push('install-lease-close');leased=false;}};},
    installFence:async()=>{calls.push('install-fence');},install:async()=>{calls.push('install');},installedIdentity:async()=>{calls.push('installed-identity');},pause:async()=>{},
  };
  return {io,calls,saved,pre,post,snapshot,report:{status:'running',installAttempted:false}};
}
test('finite successful orchestration releases CDP, installs once, pins identity and compares twice before pass',async()=>{
  const f=fixture(),r=await executeUpgrade(f.io,f.report);
  assert.equal(r.status,'pass-data-preservation-only');assert(r.allCurrentDataPreserved&&r.cleanupComplete);assert.equal(r.postReadSamples,2);
  assert.equal(r.privateSnapshotSha256,hash(canonical(f.snapshot)+'\n'));
  const index=x=>f.calls.indexOf(x);assert(index('private-write')<index('release-pre'));assert(index('release-pre')<index('install-lease'));assert(index('install-fence')<index('install'));assert(index('install')<index('installed-identity'));assert(index('installed-identity')<index('launch'));
  assert.equal(f.calls.filter(x=>x==='install').length,1);assert.equal(f.calls.filter(x=>x==='capture-post').length,2);
  assert(f.saved.slice(0,-1).every(x=>x.status==='running'));assert.equal(f.saved.at(-1).status,'pass-data-preservation-only');
});
for(const phase of ['verifyCandidate','capture','privateSnapshot','release','assertReleased','installFence'])test(`${phase} failure prevents installation and retains sanitized failure`,async()=>{
  const f=fixture();f.io[phase]=async()=>{throw error('UNIT_UNSAFE_RAW_CODE');};const r=await executeUpgrade(f.io,f.report);
  assert.equal(r.status,'fail');assert(!f.calls.includes('install'));assert(!f.calls.includes('launch'));assert.equal(r.failure.code,'CHECK_FAILED');assert(!JSON.stringify(r).includes('synthetic error'));
});
test('old PID/package mismatch blocks installation',async()=>{
  for(const change of [f=>{f.pre.owned.pid++;},f=>{f.pre.artifactIdentity=async()=>({apkSha256:PIN.apkSha256});},f=>{f.pre.accountStatus=async()=>({...initial(),state:'signedOut'});}]){
    const f=fixture();change(f);assert.equal((await executeUpgrade(f.io,f.report)).status,'fail');assert(!f.calls.includes('install'));
  }
});
for(const phase of ['install','installedIdentity'])test(`${phase} failure never launches or retries and closes installer lease`,async()=>{
  const f=fixture();f.io[phase]=async()=>{throw error('COMMAND_FAILED');};const r=await executeUpgrade(f.io,f.report);
  assert.equal(r.status,'fail');assert(!f.calls.includes('launch'));assert(f.calls.includes('install-lease-close'));assert(f.calls.includes('release-pre'));
});
test('post-install data loss fails without rewriting the saved pre-upgrade snapshot',async()=>{
  const f=fixture(),old=f.io.capture;f.io.capture=async p=>{const s=await old(p);if(p===f.post)s.notes[0].pinned=false;return s;};
  const r=await executeUpgrade(f.io,f.report);assert.equal(r.status,'fail');assert.equal(r.failure.code,'DATA_CHANGED');assert.equal(f.calls.filter(x=>x==='private-write').length,1);assert(!r.allCurrentDataPreserved);
});
test('automatic authorization or auth-required state stops with no account command or retry',async()=>{
  for(const state of [{...initial(),state:'authorizing'},{...initial(),error:{code:'account_authentication',stage:'identityRefresh'}}]){
    const f=fixture();f.post.accountStatus=async()=>state;const r=await executeUpgrade(f.io,f.report);assert.equal(r.status,'fail');assert(['AUTOMATIC_AUTHORIZATION_PENDING','ACCOUNT_RECOVERY_REQUIRED'].includes(r.failure.code));assert.equal(f.calls.filter(x=>x==='install').length,1);assert(f.calls.includes('release-post'));
  }
});
test('one cleanup failure still executes other cleanup and cannot pass',async()=>{
  const f=fixture(),release=f.io.release;f.io.release=async p=>{await release(p);if(p===f.post)throw error('CLEANUP_FAILED');};
  const r=await executeUpgrade(f.io,f.report);assert.equal(r.status,'fail');assert.equal(r.cleanupComplete,false);assert(f.calls.filter(x=>x==='release-pre').length>=2);assert(f.calls.includes('release-post'));assert.equal(r.allCurrentDataPreserved,true);
});
