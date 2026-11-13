#!/usr/bin/env node
// Disposable-store native smoke only. Importing this module launches nothing.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,appendFile,lstat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HeadlessApp,TRANSPORT,PARTICIPANT} from './account109-headless-driver.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const BINARY=resolve(ROOT,'artifacts/account109/mac-be037f3c-native-headless/notes-clone');
const BINARY_SHA='f5b64d0dbaa7001b2e00ee94f40fcdc69f6da7f0584f44dc6c42cf3bc2405add';
const SOURCE='be037f3cc542f53fba06d604f932743542e29bc4';
const RECEIPT=resolve(ROOT,'docs/verification/account109/native/headless-build01/receipt.json');
const TITLE='account109-headless-smoke 标题';
const TEXT='account109-headless-smoke 完整本地正文 / UTF-8 / 😀 / restart equality';
const DOCUMENT={type:'doc',content:[
  {type:'heading',attrs:{level:1},content:[{type:'text',text:TITLE}]},
  {type:'paragraph',content:[{type:'text',text:TEXT}]}]
};
const BODY={document:DOCUMENT,plainText:TITLE+'\n'+TEXT};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const body=note=>({document:note.document,plainText:note.plainText});
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const bodyHash=note=>hash(JSON.stringify(sorted(body(note))));
const DRIVER_CODES=['NATIVE_OPERATION_FAILED','DRIVER_TIMEOUT','HELLO_TIMEOUT','INVALID_HELLO',
  'INVALID_FRAME','INVALID_RESPONSE','UNEXPECTED_RESPONSE','TRUNCATED_FRAME',
  'STDOUT_LINE_TOO_LARGE','NOT_HEADLESS_NATIVE_APP','INVALID_SHUTDOWN','EXIT_BEFORE_HELLO',
  'EXIT_BEFORE_RESPONSE','SPAWN_ERROR','STDIN_ERROR','APP_CLOSING','APP_EXITED',
  'NATURAL_EXIT_TIMEOUT','TERM_EXIT_TIMEOUT','KILL_EXIT_TIMEOUT','PIPE_CLOSE_TIMEOUT','NON_NATURAL_EXIT'];
const safeFailure=error=>DRIVER_CODES.includes(error?.code)?error.code:'CHECK_FAILED';

export function options(argv){
  const opts={};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    assert(['--binary','--output'].includes(key)&&!Object.hasOwn(opts,key),'Unknown/duplicate option');
    const value=argv[++i];assert(isAbsolute(value||''),'Absolute paths required');opts[key]=value;
  }
  assert.equal(Object.keys(opts).length,2,'--binary EXACT_CANDIDATE --output FRESH_SMOKE_ROOT required');
  assert.equal(opts['--binary'],BINARY,'Only the reviewed native-only candidate is supported');
  const output=opts['--output'];
  assert(/^\/private\/tmp\/account109-headless-smoke-[A-Za-z0-9-]+$/.test(output)
    &&resolve(output)===output,'Only a fresh disposable smoke root is allowed');
  return {binary:BINARY,output,store:resolve(output,'store')};
}

function assertSignedOut(status){
  assert.equal(status.state,'signedOut');assert.equal(status.enabled,false);
  assert(!status.profile&&!status.error,'Fresh smoke must have no account profile or error');
  assert.equal(status.pendingCount,0);assert.equal(status.conflictCount,0);
  assert(status.devices.every(device=>!device.connected),'Signed-out smoke has no connected devices');
}
function assertNote(note){
  assert(note&&uuid(note.id),'Native Session note ID required');
  assert.equal(note.title,TITLE);assert.deepEqual(body(note),BODY,'Complete document/plainText must match');
}

export async function run(argv=process.argv.slice(2)){
  const {binary,output,store}=options(argv);
  assert((await lstat(binary)).isFile()&&await realpath(binary)===binary,'Regular exact executable required');
  const binaryHash=hash(await readFile(binary));assert.equal(binaryHash,BINARY_SHA,'Candidate hash mismatch');
  const receiptBytes=await readFile(RECEIPT),receipt=JSON.parse(receiptBytes);
  assert.equal(receipt.kind,'native-only-headless-debug-candidate');
  assert.equal(receipt.source.sourceRevision,SOURCE);assert.equal(receipt.source.sourceDirty,false);
  assert.equal(receipt.sourceInventoryUnchanged,true);
  assert.equal(receipt.binary.path,binary);assert.equal(receipt.binary.sha256,BINARY_SHA);
  await mkdir(output,{mode:0o700}); // Atomic freshness gate; never reuse or clear a store.
  assert.equal(await realpath(output),output,'Canonical fresh smoke root required');
  await mkdir(store,{mode:0o700});
  const report={schema:1,kind:'account109-disposable-native-headless-smoke',status:'running',
    phase:'initial-start',startedAt:new Date().toISOString(),checks:[],observations:[],
    store:{path:store,createdFresh:true,disposable:true,originalAccountStoresUsed:false},
    binary:{path:binary,sha256:binaryHash,sourceRevision:SOURCE,nativeOnly:true,embeddedFrontendIdentityClaim:false},
    buildReceipt:{path:RECEIPT,sha256:hash(receiptBytes)},tools:{},
    limitations:[
      'Fresh signed-out disposable store only; no real-account restore, discovery, conflict or logout coverage.',
      'Fixed native Session createPlainNote and workspace operations; no WebView, frontend editor or GUI acceptance claim.',
      'Readiness asserts native protocol identity and zero native-reported windows; no embedded frontend identity is asserted.',
      'Full synthetic document/plainText are compared in memory; only hashes, fixed labels and lifecycle evidence are reported.',
      'No retry, account sign-in/sign-out, manual pairing, original-store access, browser, ADB or network-setting changes.'
    ]};
  for(const name of ['account109-headless-smoke.mjs','account109-headless-driver.mjs','sync108-native-driver.mjs'])
    report.tools[name]=hash(await readFile(new URL(name,import.meta.url)));
  let saving=Promise.resolve(),sequence=0;
  const save=()=>{const bytes=JSON.stringify(report,null,2)+'\n';
    saving=saving.then(()=>writeFile(resolve(output,'result.json'),bytes,{mode:0o600}));return saving;};
  async function trace(device,operation,action){
    assert(['initial','restart'].includes(device));
    assert(['ready','accountStatus','workspace','createPlainNote','close'].includes(operation));
    const before={sequence:++sequence,stage:report.phase,device,operation,event:'before',at:new Date().toISOString()};
    report.lastOperation=before;await save();
    await appendFile(resolve(output,'steps.jsonl'),JSON.stringify(before)+'\n',{mode:0o600});
    try{
      const value=await action(),after={...before,event:'after',at:new Date().toISOString()};
      report.lastOperation=after;
      await appendFile(resolve(output,'steps.jsonl'),JSON.stringify(after)+'\n',{mode:0o600});await save();return value;
    }catch(error){
      const failed={...before,event:'failed',code:safeFailure(error),at:new Date().toISOString()};
      report.lastOperation=failed;
      await appendFile(resolve(output,'steps.jsonl'),JSON.stringify(failed)+'\n',{mode:0o600});await save();throw error;
    }
  }
  const children=[],closing=new Map();let completed=false;
  const check=name=>{report.checks.push({name,status:'pass'});console.log('PASS '+name);};
  function open(name){
    const env=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY',
      'http_proxy','https_proxy','all_proxy','no_proxy'].map(key=>[key,'']));
    const app=new HeadlessApp(binary,store,{name,env});children.push(app);return app;
  }
  function close(app){
    if(!closing.has(app))closing.set(app,trace(app.name,'close',()=>app.close()));
    return closing.get(app);
  }
  async function ready(app){
    const value=await trace(app.name,'ready',()=>app.ready());
    assert.deepEqual(value,{protocol:1,participant:PARTICIPANT,transport:TRANSPORT,windows:0});
    report.observations.push({kind:'native-ready',device:app.name,...value,nativeParticipant:true,noWebView:true});
  }
  async function signedOut(app){
    const status=await trace(app.name,'accountStatus',()=>app.accountStatus());assertSignedOut(status);
    report.observations.push({kind:'account-status',device:app.name,state:'signedOut',enabled:false,
      hasProfile:false,hasError:false,pendingCount:0,conflictCount:0,connectedDevices:0});
  }
  try{
    await save();await writeFile(resolve(output,'build-receipt.json'),receiptBytes,{flag:'wx',mode:0o600});
    const initial=open('initial');await ready(initial);check('initial native participant ready with zero WebViews');
    await signedOut(initial);
    const blank=await trace('initial','workspace',()=>initial.workspace());
    assert.equal(blank.notes.length,0);assert.equal(blank.attachments.length,0);
    check('fresh disposable store is signed out and blank');
    report.phase='save';
    const created=await trace('initial','createPlainNote',()=>initial.createPlainNote(TITLE,TEXT));assertNote(created);
    const saved=await trace('initial','workspace',()=>initial.workspace());
    assert.equal(saved.notes.length,1);assert.equal(saved.attachments.length,0);
    const savedNote=saved.notes.find(note=>note.id===created.id);assertNote(savedNote);
    const expected=structuredClone(body(savedNote));
    report.observations.push({kind:'saved-full-body',noteId:created.id,fullBodySha256:bodyHash(savedNote),
      createReplyMatchesWorkspace:true,fullDocumentAndPlainText:true});
    check('native Session save and workspace match the complete document and plainText');
    report.phase='initial-close';await close(initial);assert.equal(initial.lifecycle.naturalExit,true);
    check('initial owned process closed naturally');
    report.phase='restart';
    const restarted=open('restart');await ready(restarted);await signedOut(restarted);
    check('same-store restart is a signed-out native participant with zero WebViews');
    const reopened=await trace('restart','workspace',()=>restarted.workspace());
    assert.equal(reopened.notes.length,1);assert.equal(reopened.attachments.length,0);
    const restored=reopened.notes.find(note=>note.id===created.id);assertNote(restored);
    assert.deepEqual(body(restored),expected,'Same full saved body must survive actual process restart');
    report.observations.push({kind:'restarted-full-body',noteId:created.id,fullBodySha256:bodyHash(restored),
      sameNoteId:true,fullDocumentAndPlainTextEqual:true});
    check('restart restores the same note and complete saved body');
    report.phase='restart-close';await close(restarted);assert.equal(restarted.lifecycle.naturalExit,true);
    check('restarted owned process closed naturally');completed=true;
  }catch(error){
    report.status='fail';report.failure={phase:report.phase,code:safeFailure(error),lastOperation:report.lastOperation};
    console.log('FAIL '+report.failure.phase+' '+report.failure.code);
  }finally{
    const results=await Promise.allSettled(children.map(close));report.lifecycle=children.map(app=>app.lifecycle);
    if(results.some(result=>result.status==='rejected')||children.some(app=>app.lifecycle.naturalExit!==true)){
      report.status='fail';report.cleanupFailure={code:'CLEANUP_FAILED'};
      report.failure??={phase:'cleanup',code:'CLEANUP_FAILED'};
    }
    try{
      assert.equal(hash(await readFile(binary)),binaryHash);
      assert.equal(hash(await readFile(RECEIPT)),hash(receiptBytes));
      report.evidenceIntegrity={binaryUnchanged:true,buildReceiptUnchanged:true};
    }catch{
      report.status='fail';report.failure??={phase:'evidence-integrity',code:'CHECK_FAILED'};
    }
    if(report.status!=='fail'){
      if(completed&&children.length===2)report.status='pass';
      else{report.status='fail';report.failure={phase:'completion',code:'CHECK_FAILED'};}
    }
    report.finishedAt=new Date().toISOString();await save();
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const report=await run();
    console.log(JSON.stringify({status:report.status,failure:report.failure,cleanupFailure:report.cleanupFailure}));
    process.exitCode=report.status==='pass'?0:1;
  }catch{console.error('HEADLESS_SMOKE_INPUT_OR_REPORT_FAILED');process.exitCode=1;}
}
