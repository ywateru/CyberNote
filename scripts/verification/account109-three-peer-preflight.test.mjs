// Synthetic RAM/file fixtures only. No device, credential or private snapshot reads.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,mkdir,writeFile,symlink,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PACKAGE} from './account109-android.mjs';
import {B_SUBJECT_SHA} from './account109-desktop-relogin.mjs';
import {CANDIDATES,QA_USERNAME,requireMacCandidate,requireAndroidCandidate,requirePausedAccount,requireHistoricalOwnerHash,requireHistoricalAccount,requirePausedAccounts,captureOriginalLibrary,captureCurrentPhone,unionOriginalLibraries,crossPeerOriginals,originalsPresent,assertOriginalLibrary,verifyOriginalLibrary,verifyOriginalUnion,originalSummary,preparationSummary,requirePreparation,preserveBeforeCleanup} from './account109-three-peer-preflight.mjs';
import {finishThreePeers} from './account109-three-peers.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const clone=structuredClone;
const paused=()=>({state:'paused',enabled:false,profile:{username:QA_USERNAME,subject:'synthetic-owner'},devices:[],conflictCount:0,pendingCount:0});
function fixture(name='A'){
  const bytes=Buffer.from([0,255,128,17]),id=name+'-note',aid=name+'-attachment';
  const note={id,folderId:'default',title:'Synthetic original',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'完整中文 😀',marks:[{type:'bold'}]}]},{type:'attachment',attrs:{id:aid,name:'synthetic.bin',kind:'file'}}]},plainText:'完整中文 😀',createdAt:1,updatedAt:2,pinned:true,deletedAt:null,originalFolderId:null,locked:false,paperStyle:'plain',revision:3,sealed:null};
  const attachment={id:aid,noteId:id,kind:'file',mime:'application/octet-stream',displayName:'synthetic.bin',size:bytes.length,relativePath:name+'.bin',recordedAt:null};
  const peer={name,ws:{notes:[note],attachments:[attachment]},blobs:new Map([[aid,bytes]]),reads:0};
  peer.workspace=async()=>({...clone(peer.ws),access:{notes:Object.fromEntries(peer.ws.notes.map(n=>[n.id,{authorized:peer.authorized!==false}])),suspended:peer.suspended?[id]:[]}});
  peer.readAttachment=async id=>{peer.reads++;const data=peer.corrupt?Buffer.alloc(bytes.length,7):peer.blobs.get(id);return {data:data.toString('base64'),byteLength:data.length,sha256:hash(data)};};
  return peer;
}
async function setup(){
  const peers=['A','B','C'].map(fixture),sources=[];
  for(const peer of peers)sources.push({peer,baseline:await captureOriginalLibrary(peer)});
  const union=unionOriginalLibraries(sources.map(s=>s.baseline));
  return {peers,sources,union};
}
function merge(peers){
  const notes=peers.flatMap(p=>clone(p.ws.notes)),attachments=peers.flatMap(p=>clone(p.ws.attachments)),blobs=new Map(peers.flatMap(p=>[...p.blobs]));
  for(const peer of peers){peer.ws={notes:clone(notes),attachments:clone(attachments)};peer.blobs=new Map(blobs);}
}
const readyReport=()=>({status:'running',preparation:preparationSummary(),originalBaseline:{capturedBeforeEnable:true},phoneBaseline:{capturedBeforeDesktops:true},preservation:{afterMerge:true,afterCatchUp:true,final:true},cases:['auto-discovery','a-rich-media','c-ui-note','b-file','phone-pause-resume'].map(id=>({id,status:'pass'}))});
const closeClean=report=>finishThreePeers(report,{desktops:[{lifecycle:{naturalExit:true},close:async()=>{}}],phone:{owned:{},close:async()=>{}},forwardPresent:async()=>false},async()=>{});

test('importing preflight/runner loads only source modules, without process/network/private input IO',()=>{
  const url=new URL('./account109-three-peer-preflight.mjs',import.meta.url).href;
  const runner=new URL('./account109-three-peers.mjs',import.meta.url).href;
  const program=`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
    const forbidden=()=>{throw Error('IMPORT_SIDE_EFFECT');};
    const originalRead=fs.promises.readFile,sourcePrefix=${JSON.stringify(new URL('../',import.meta.url).pathname)};
    fs.promises.readFile=(path,...args)=>{const p=path instanceof URL?path.pathname:String(path);if(!p.startsWith(sourcePrefix)||!p.endsWith('.mjs'))return forbidden();return originalRead(path,...args);};
    for(const key of ['lstat','realpath','mkdir','writeFile'])fs.promises[key]=forbidden;
    for(const key of ['execFile','execFileSync','spawn'])cp[key]=forbidden;
    globalThis.fetch=forbidden;globalThis.WebSocket=class{constructor(){forbidden();}};syncBuiltinESMExports();
    await import(${JSON.stringify(url)});await import(${JSON.stringify(runner)});console.log('inert');`;
  assert.equal(execFileSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8'}).trim(),'inert');
});
test('candidate pins match committed independent build receipts and reject alternate bytes/package',async()=>{
  const mac=JSON.parse(await readFile(new URL('../../docs/verification/account109/native/72513d12-platform-build01/mac-build-record.json',import.meta.url)));
  const android=JSON.parse(await readFile(new URL('../../docs/verification/account109/native/88b2dabe-android-build01/receipt.json',import.meta.url)));
  assert.equal(CANDIDATES.macSha256,mac.binary.sha256);assert.equal(CANDIDATES.macSource,mac.sourceRevision);
  // Finite receipt fields, never the APK, installed app or original library.
  assert.equal(android.apk.sha256,CANDIDATES.androidSha256);assert.equal(android.sourceRevision,CANDIDATES.androidSource);
  requireMacCandidate(CANDIDATES.macSha256);requireAndroidCandidate({package:PACKAGE,apkSha256:CANDIDATES.androidSha256});
  assert.throws(()=>requireMacCandidate('0'.repeat(64)),{code:'THREE_PEER_CANDIDATE_MISMATCH'});
  for(const identity of [{package:PACKAGE,apkSha256:'0'.repeat(64)},{package:'other',apkSha256:CANDIDATES.androidSha256},null])assert.throws(()=>requireAndroidCandidate(identity),{code:'THREE_PEER_CANDIDATE_MISMATCH'});
});
test('healthy paused and fixed historical owner are distinct mandatory checks; same QA name is insufficient',()=>{
  requirePausedAccount(paused());requireHistoricalOwnerHash(B_SUBJECT_SHA);
  assert.throws(()=>requireHistoricalOwnerHash(hash('synthetic-owner')),{code:'THREE_PEER_HISTORY_MISMATCH'});
  assert.throws(()=>requireHistoricalAccount(paused()),{code:'THREE_PEER_HISTORY_MISMATCH'});
  assert.throws(()=>requirePausedAccounts([paused(),paused(),paused()]),{code:'THREE_PEER_HISTORY_MISMATCH'});
  for(const change of [s=>s.enabled=true,s=>s.state='ready',s=>s.state='authorizing',s=>s.state='signedOut',s=>s.profile.username='other',s=>delete s.profile,s=>s.authorizationSurface='embedded',s=>s.conflictCount=1,s=>s.devices.push({connected:true}),s=>s.error={code:'account_network'}]){
    const s=paused();change(s);assert.throws(()=>requirePausedAccount(s));
  }
  assert.throws(()=>requirePausedAccounts([paused(),paused()]),{code:'THREE_PEER_PAUSED_REQUIRED'});
});
test('capture retains all fields and exact identities, checks authorization and reads stable original bytes',async()=>{
  const peer=fixture(),baseline=await captureOriginalLibrary(peer);
  assert.deepEqual(baseline.notes,peer.ws.notes);assert.deepEqual(baseline.attachments,peer.ws.attachments);
  assert.deepEqual(baseline.attachmentBytes,[{id:'A-attachment',noteId:'A-note',byteLength:4,sha256:hash(peer.blobs.get('A-attachment'))}]);
  const summary=originalSummary(baseline);assert.equal(summary.notes,1);assert.equal(summary.attachments,1);
  assert(!JSON.stringify(summary).includes('完整中文'));assert(!JSON.stringify(summary).includes('Synthetic original'));
  const read=peer.readAttachment;peer.readAttachment=async id=>{peer.ws.notes[0].updatedAt++;return read(id);};
  await assert.rejects(captureOriginalLibrary(peer),{code:'THREE_PEER_ORIGINAL_CHANGED'});
});
test('deleted, locked, sealed, unauthorized, suspended and unknown/missing fields reject capture before byte reads',async()=>{
  for(const change of [p=>p.ws.notes[0].deletedAt=4,p=>p.ws.notes[0].locked=true,p=>p.ws.notes[0].sealed={ciphertext:'synthetic'},p=>p.authorized=false,p=>p.suspended=true,p=>p.ws.notes[0].futureSemanticField=true,p=>delete p.ws.notes[0].pinned,p=>p.ws.attachments[0].unknown=true,p=>p.ws.attachments[0].internal=true,p=>p.ws.attachments[0].noteId='wrong',p=>p.ws.notes[0].document.content[1].attrs.id='missing']){
    const peer=fixture();change(peer);await assert.rejects(captureOriginalLibrary(peer),{code:'THREE_PEER_ORIGINAL_UNSUPPORTED'});assert.equal(peer.reads,0);
  }
});
test('phone must match its supplied fixed-input snapshot exactly; a changed current value is never adopted',async()=>{
  const peer=fixture('C'),expected=await captureOriginalLibrary(peer),inputs={expected,history:{synthetic:true}};
  let reads=0;const read=async(adapter,history)=>{reads++;assert.equal(history,inputs.history);assert.equal(typeof adapter.readWorkspace,'function');return captureOriginalLibrary(peer);};
  assert.deepEqual(await captureCurrentPhone(peer,inputs,{read}),expected);assert.equal(reads,1);
  for(const change of [p=>p.ws.notes[0].pinned=false,p=>p.ws.notes[0].title='changed',p=>p.ws.notes[0].revision++,p=>p.ws.attachments[0].relativePath='different.bin',p=>p.corrupt=true,p=>p.ws.notes[0].document.content[1].attrs.id='wrong']){
    const saved=clone(peer.ws);change(peer);await assert.rejects(captureCurrentPhone(peer,inputs,{read}));peer.ws=saved;peer.corrupt=false;
  }
  assert.equal(inputs.expected.notes[0].title,'Synthetic original');assert.equal(inputs.expected.attachments[0].relativePath,'C.bin');
});
test('union requires overlapping originals to agree before enable, preserving IDs and full semantics',async()=>{
  const baseline=await captureOriginalLibrary(fixture()),same=clone(baseline);same.notes[0].revision=99;same.attachments[0].relativePath='another-device.bin';
  const union=unionOriginalLibraries([baseline,same,clone(baseline)]);assert.equal(union.notes.length,1);assert.equal(union.attachments.length,1);
  for(const change of [s=>s.notes[0].title='other',s=>s.notes[0].updatedAt++,s=>s.notes[0].document.content[1].attrs.id='remapped',s=>s.attachments[0].noteId='other',s=>s.attachments[0].recordedAt=1,s=>s.attachmentBytes[0].sha256='0'.repeat(64)]){
    const changed=clone(baseline);change(changed);assert.throws(()=>unionOriginalLibraries([baseline,changed,baseline]));
  }
  const missingBytes=clone(baseline);missingBytes.attachmentBytes=[];assert.throws(()=>unionOriginalLibraries([baseline,missingBytes,baseline]),{code:'THREE_PEER_ORIGINAL_UNSUPPORTED'});
});
test('only revision and relativePath normalize across peers; every original semantic field, id and byte remains exact',async()=>{
  const baseline=await captureOriginalLibrary(fixture()),changed=clone(baseline);changed.notes[0].revision++;changed.attachments[0].relativePath='other.bin';assertOriginalLibrary(changed,baseline);
  const fields={id:'other-id',folderId:'other-folder',title:'other-title',document:{type:'doc',content:[]},plainText:'other-body',createdAt:9,updatedAt:9,pinned:false,deletedAt:9,originalFolderId:'other-folder',locked:true,paperStyle:'grid',sealed:{ciphertext:'synthetic'}};
  for(const [key,value] of Object.entries(fields)){const actual=clone(baseline);actual.notes[0][key]=value;assert.throws(()=>assertOriginalLibrary(actual,baseline),{code:'THREE_PEER_ORIGINAL_CHANGED'},key);}
  for(const [key,value] of Object.entries({id:'other-id',noteId:'other-owner',kind:'image',mime:'text/plain',displayName:'other.bin',size:99,recordedAt:5})){
    const actual=clone(baseline);actual.attachments[0][key]=value;assert.throws(()=>assertOriginalLibrary(actual,baseline),{code:'THREE_PEER_ORIGINAL_CHANGED'},key);
  }
  for(const key of ['notes','attachments','attachmentBytes']){const actual=clone(baseline);actual[key]=[];assert.throws(()=>assertOriginalLibrary(actual,baseline),{code:'THREE_PEER_ORIGINAL_CHANGED'});}
  const bytes=clone(baseline);bytes.attachmentBytes[0].sha256='f'.repeat(64);assert.throws(()=>assertOriginalLibrary(bytes,baseline),{code:'THREE_PEER_ORIGINAL_CHANGED'});
});
test('all three verify the original union, including desktop-only originals; new notes are allowed',async()=>{
  const {peers,union}=await setup();assert(!originalsPresent(await peers[2].workspace(),union));merge(peers);
  await verifyOriginalUnion(peers,union);assert(peers.every(p=>originalsPresent(p.ws,union)));
  const extra=fixture('new');for(const peer of peers){peer.ws.notes.push(...clone(extra.ws.notes));peer.ws.attachments.push(...clone(extra.ws.attachments));peer.blobs.set('new-attachment',extra.blobs.get('new-attachment'));}
  await verifyOriginalUnion(peers,union);
  peers[2].ws.notes.find(n=>n.id==='A-note').pinned=false;
  await assert.rejects(verifyOriginalUnion(peers,union),{code:'THREE_PEER_ORIGINAL_CHANGED'});
  peers[2].ws.notes.find(n=>n.id==='A-note').pinned=true;peers[1].corrupt=true;
  await assert.rejects(verifyOriginalUnion(peers,union),{code:'THREE_PEER_ORIGINAL_CHANGED'});
});
test('repeated references remain exact; unreferenced recovery attachments are protected at source without promising sync',async()=>{
  const a=fixture('A');a.ws.notes[0].document.content.push(clone(a.ws.notes[0].document.content[1]));
  const unreferenced={...a.ws.attachments[0],id:'source-only-attachment',relativePath:'recovery.bin'};
  a.ws.attachments.push(unreferenced);a.blobs.set(unreferenced.id,Buffer.from([1,2,3,4]));
  const baseline=await captureOriginalLibrary(a),union=unionOriginalLibraries([baseline,clone(baseline),clone(baseline)]),cross=crossPeerOriginals(union);
  assert.equal(baseline.attachments.length,2);assert.equal(cross.attachments.length,1);assert.equal(cross.notes[0].document.content.length,3);
  const b=fixture('B');b.ws={notes:clone(cross.notes),attachments:clone(cross.attachments)};b.blobs=new Map(a.blobs);
  await verifyOriginalLibrary(b,cross);await verifyOriginalLibrary(a,baseline);
  b.ws.notes[0].document.content.pop();await assert.rejects(verifyOriginalLibrary(b,cross),{code:'THREE_PEER_ORIGINAL_CHANGED'});
  a.ws.attachments.pop();await assert.rejects(verifyOriginalLibrary(a,baseline),{code:'THREE_PEER_ORIGINAL_CHANGED'});
});
test('desktop authorized bytes must also match confined managed files; corruption and symlinks fail',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'account109-original-library-fixture-')));
  try{
    const peer=fixture();peer.directory=root;await mkdir(join(root,'attachments'));
    const path=join(root,'attachments','A.bin');await writeFile(path,peer.blobs.get('A-attachment'));
    const baseline=await captureOriginalLibrary(peer);await verifyOriginalLibrary(peer,baseline);
    await writeFile(path,Buffer.alloc(4,33));await assert.rejects(verifyOriginalLibrary(peer,baseline),{code:'THREE_PEER_ORIGINAL_CHANGED'});
    await rm(path);await writeFile(join(root,'synthetic-other.bin'),Buffer.from([0,255,128,17]));await symlink(join(root,'synthetic-other.bin'),path);
    await assert.rejects(captureOriginalLibrary(peer),{code:'THREE_PEER_ORIGINAL_UNSUPPORTED'});
    peer.ws.attachments[0].relativePath='../synthetic-other.bin';await assert.rejects(captureOriginalLibrary(peer),{code:'THREE_PEER_ORIGINAL_UNSUPPORTED'});
  }finally{await rm(root,{recursive:true,force:true});}
});
test('cleanup records source and union proofs independently; preservation failure never replaces an earlier failure',async()=>{
  const {peers,sources,union}=await setup();merge(peers);
  const pass=readyReport();await preserveBeforeCleanup(pass,sources,union);assert.equal(pass.preservation.beforeCleanup,true);assert.equal(pass.cleanupPreservation.unionOnAllPeers,true);await closeClean(pass);assert.equal(pass.status,'pass');
  peers[1].ws.notes.find(n=>n.id==='B-note').title='changed';
  const report={...readyReport(),status:'fail',failure:{phase:'a-rich-media',code:'ORIGINAL_FAILURE'}};
  await preserveBeforeCleanup(report,sources,union);assert.equal(report.failure.code,'ORIGINAL_FAILURE');assert.equal(report.originalPreservationFailure.code,'THREE_PEER_ORIGINAL_CHANGED');
  await closeClean(report);assert.equal(report.status,'fail');assert.equal(report.cleanup.desktopNaturalExits,true);
  const finalFailure=readyReport();await preserveBeforeCleanup(finalFailure,sources,union);await closeClean(finalFailure);assert.equal(finalFailure.status,'fail');
});
test('partial preflight failure still checks captured sources and cannot claim full union or pass',async()=>{
  const {sources}=await setup(),report={status:'fail',failure:{phase:'restore-desktops',code:'ACCOUNT_STATUS_FAILED'}};
  await preserveBeforeCleanup(report,sources.slice(0,1),undefined);
  assert.equal(report.preservation.beforeCleanup,false);assert.equal(report.cleanupPreservation.unionOnAllPeers,false);assert.deepEqual(report.cleanupPreservation.sourceDevices,['A']);
  await closeClean(report);assert.equal(report.status,'fail');
});
test('cleanup checks C/B/A independently after a first read failure or change and still performs owned cleanup',async()=>{
  for(const firstFailure of ['read','changed']){
    const {peers,sources,union}=await setup();merge(peers);
    const attempts=[];
    for(const peer of peers){const workspace=peer.workspace;peer.workspace=async()=>{attempts.push(peer.name);return workspace();};}
    if(firstFailure==='read')peers[2].workspace=async()=>{attempts.push('C');throw Error('synthetic private detail');};
    else peers[2].ws.notes.find(n=>n.id==='C-note').title='changed';
    peers[1].ws.notes.find(n=>n.id==='B-note').title='also changed';
    const report={...readyReport(),status:'fail',failure:{phase:'a-rich-media',code:'ORIGINAL_FAILURE'}};
    await preserveBeforeCleanup(report,[...sources].reverse(),union);
    assert.deepEqual(report.cleanupPreservation.sourceChecks.map(({device,status})=>({device,status})),[
      {device:'C',status:'fail'},{device:'B',status:'fail'},{device:'A',status:'pass'},
    ]);
    assert.deepEqual(report.cleanupPreservation.unionChecks.map(({device,status})=>({device,status})),[
      {device:'C',status:'fail'},{device:'B',status:'fail'},{device:'A',status:'pass'},
    ]);
    assert(attempts.filter(name=>name==='A').length>=4,'A source and union must both be attempted');
    assert.equal(report.preservation.beforeCleanup,false);assert.equal(report.cleanupPreservation.allSourceDescriptorsAndBytes,false);
    assert.equal(report.cleanupPreservation.unionOnAllPeers,false);assert.equal(report.failure.code,'ORIGINAL_FAILURE');
    assert.equal(report.originalPreservationFailure.failures.length,4);assert(!JSON.stringify(report).includes('synthetic private detail'));
    await closeClean(report);assert.equal(report.cleanup.desktopNaturalExits,true);assert.equal(report.cleanup.androidDriverClosed,true);assert.equal(report.status,'fail');
  }
});
test('completion requires fixed preparation evidence and a successful before-cleanup preservation gate',async()=>{
  const good=readyReport();requirePreparation(good);
  for(const change of [r=>delete r.preparation,r=>r.preparation.historicalSubjectSha256='0'.repeat(64),r=>r.preparation.phoneAttachmentOriginExplained=true,r=>delete r.originalBaseline]){
    const report=readyReport();change(report);assert.throws(()=>requirePreparation(report),{code:'THREE_PEER_PREPARATION_REQUIRED'});await closeClean(report);assert.equal(report.status,'fail');
  }
  await closeClean(good);assert.equal(good.status,'fail','Green scenarios without final original-source proof cannot pass');
});
