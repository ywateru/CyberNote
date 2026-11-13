#!/usr/bin/env node
// Real account discovery only. Importing this module does not operate devices.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeApp,delay} from './sync108-native-driver.mjs';
import {connectAndroid,ownedForwardPresent,PHONE_FILES,PACKAGE,SERIAL} from './account109-android.mjs';
import {safeStatus,safeMappingObservation,statusObserver,requireHealthy,waitForAccountStatuses,accountEnabled,nativeAccount,signedOut,noteBody,attachmentRefs,canonicalBody,snapshotNotes,assertPreserved,failureCode,fail} from './account109-desktop-helpers.mjs';

export const STORES='/private/tmp/account109-desktop-real-90b8b28b-01';
export const USERNAME='cybernoteqa20261113a';
// Preserved isolated-package originals recorded in android/9263-signin01/result.json.
export const PHONE_ORIGINAL_IDS=['321e9d6c-d590-437d-8edb-d6ed2feae3fa','d6e3b2e2-d799-49e5-91ac-b76e2a7126f4','2113f89b-8183-458a-a97a-27d4b4be9b73','3cfe6fa1-8a3e-4c4c-94d3-4f377562dc3f'];
const CASES=['auto-discovery','a-rich-media','c-ui-note','b-file','phone-pause-resume'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assertThat=(condition,code)=>{if(!condition)throw fail(code);};
export function options(argv){
  const opts={allowDesktopSignIn:false,requireRelay02:false,declarePhone4gDesktopWifi:false};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(key==='--allow-desktop-sign-in'){assert(!opts.allowDesktopSignIn,'Duplicate sign-in flag');opts.allowDesktopSignIn=true;continue;}
    if(key==='--require-relay-02'){assert(!opts.requireRelay02,'Duplicate relay flag');opts.requireRelay02=true;continue;}
    if(key==='--declare-phone-4g-desktop-wifi'){assert(!opts.declarePhone4gDesktopWifi,'Duplicate network declaration');opts.declarePhone4gDesktopWifi=true;continue;}
    assert(['--binary','--stores','--output'].includes(key)&&!opts[key],'Unknown or duplicate option');
    const value=argv[++i];assert(value&&isAbsolute(value),'Absolute path required');opts[key]=value;
  }
  assert(opts['--binary']&&opts['--stores']&&opts['--output'],'--binary, --stores and fresh --output required');
  assert.equal(opts['--stores'],STORES,'Only the original owned 90b stores are supported');
  assert.equal(opts.requireRelay02,opts.declarePhone4gDesktopWifi,'RELAY-02 requires the explicit network declaration and opt-in together');
  const output=resolve(opts['--output']);assert(output!==STORES&&!output.startsWith(STORES+sep),'Output must be outside original stores');
  return {binary:opts['--binary'],stores:STORES,output,allowDesktopSignIn:opts.allowDesktopSignIn,requireRelay02:opts.requireRelay02,declarePhone4gDesktopWifi:opts.declarePhone4gDesktopWifi};
}
export function expectedAccount(s){
  assertThat(s.profile?.username===USERNAME&&typeof s.profile.subject==='string'&&!!s.profile.subject,'EXPECTED_ACCOUNT_REQUIRED');
}
export function sameAccount(statuses){statuses.forEach(expectedAccount);assertThat(statuses.every(s=>s.profile.subject===statuses[0].profile.subject),'ACCOUNT_OWNER_MISMATCH');}
function linkedStatuses(statuses){
  if(!statuses.every(s=>!s.error&&s.state==='ready'&&s.enabled))return false;
  const current=statuses.map(s=>s.devices.filter(d=>d.current));
  if(current.some(ds=>ds.length!==1)||new Set(current.map(ds=>ds[0].id)).size!==statuses.length)return false;
  return statuses.every((s,i)=>current.every((ds,j)=>j===i||s.devices.some(d=>d.id===ds[0].id&&!d.current&&d.online&&d.connected)));
}
export const meshReady=statuses=>statuses.length===3&&linkedStatuses(statuses);
// This proves endpoint samples only; the operator's network declaration is
// separate from evidence of each live Mapping. connected alone is insufficient.
export function relay02Samples(statuses,previous){
  sameAccount(statuses);
  assertThat(meshReady(statuses),'RELAY02_NOT_PROVEN');
  const current=statuses.map(s=>s.devices.filter(d=>d.current)[0].id);
  return [[0,2],[2,0],[1,2],[2,1]].map(([from,to],index)=>{
    const s=statuses[from],matches=s.devices.filter(d=>!d.current&&d.id===current[to]&&d.online&&d.connected);
    const sample=matches.length===1?safeMappingObservation(matches[0].transport,s.transportGeneration):undefined;
    const edge=['A->C','C->A','B->C','C->B'][index];
    assertThat(!!sample&&sample.sync==='cloudflare-tunnel','RELAY02_NOT_PROVEN');
    if(previous)assertThat(previous.length===4&&previous[index].edge===edge&&sample.generation===previous[index].generation&&sample.sample>previous[index].sample,'RELAY02_NOT_PROVEN');
    return {edge,...sample};
  });
}
const rich=text=>({type:'doc',content:[
  {type:'heading',attrs:{level:1},content:[{type:'text',text}]},
  {type:'paragraph',content:[{type:'text',text:'完整中文 / UTF-8 / 😀',marks:[{type:'bold'}]}]},
  {type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'保留列表结构与附件引用'}]}]}]},
]});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=','base64');
export const fixtures=[{name:'account109-three.png',mime:'image/png',bytes:png},{name:'account109-three.bin',mime:'application/octet-stream',bytes:Buffer.from(Array.from({length:4096},(_,i)=>i%256))}];
export const phoneFixtures=PHONE_FILES.map(({name,mime,base64})=>({name,mime,bytes:Buffer.from(base64,'base64')}));

// Attachment insertion may leave an empty trailing editor paragraph. Compare
// every original text block/mark and exact plainText, not an includes() check.
export function assertPhoneBodyRetained(before,after) {
  const textDocument=note=>{
    const doc=structuredClone(note.document);doc.content=doc.content.filter(n=>n.type!=='attachment');
    while(doc.content.at(-1)?.type==='paragraph'&&!(doc.content.at(-1).content||[]).length)doc.content.pop();
    return doc;
  };
  assert.equal(after.id,before.id,'Exact new phone note identity');
  assert.deepEqual(textDocument(after),textDocument(before),'Complete phone text document retained after attachment insertion');
  assert.equal(after.plainText,before.plainText,'Complete phone plainText retained after attachment insertion');
}

class Desktop {
  constructor(app,name){this.app=app;this.name=name;this.directory=app.directory;}
  async command(id,args={}){const value=await this.app.execute(id,args);await this.app.idle();return value;}
  async workspace(){return (await this.app.state()).workspace;}
  status(){return nativeAccount(this.app,'status');}
  setEnabled(enabled){return nativeAccount(this.app,'setEnabled',{enabled});}
  syncNow(){return nativeAccount(this.app,'syncNow');}
  async create(document,files){
    for(let i=0;i<3&&(await this.app.state()).preferences.open;i++)await this.command('app.back');
    assert(!(await this.app.state()).preferences.open,'Preferences must close');
    await this.command('folder.select',{id:'default'});await this.command('note.create');await this.command('editor.setContent',{document});
    if(files.length)await this.command('attachment.submit',{files:files.map(f=>({name:f.name,mime:f.mime,base64:f.bytes.toString('base64')}))});
    await this.command('app.flush');const id=(await this.app.state()).selection.noteId;assert(id,'Created note selected');return id;
  }
  async readAttachment(id,noteId){
    await this.command('note.select',{id:noteId});
    return this.app.evaluate(`(async()=>{const s=(await window.__NOTES_DEBUG__.execute('app.state')).result;const a=s.workspace.access,n=a.notes[arg.noteId];if(!n?.authorized)throw Error('OWNER_NOT_AUTHORIZED');return window.__TAURI_INTERNALS__.invoke('read_attachment',{id:arg.id,expected:{sessionId:a.sessionId,epoch:a.epoch,noteEpoch:n.epoch}});})()`,{id,noteId});
  }
}

export async function verifyOriginals(peer,id,files,report){
  const ws=await peer.workspace(),note=ws.notes.find(n=>n.id===id);assert(note,'Attachment owner exists');canonicalBody(ws,note);
  for(const f of files){
    const matches=ws.attachments.filter(a=>a.noteId===id&&a.displayName===f.name);assert.equal(matches.length,1,'Exactly one fixture attachment owned by note');
    const a=matches[0];assert(attachmentRefs(note.document).includes(a.id),'Document references original attachment');assert.equal(a.mime,f.mime);assert.equal(a.size,f.bytes.length);
    const result=await peer.readAttachment(a.id,id),bytes=Buffer.from(result.data,'base64');assert.equal(bytes.length,f.bytes.length);assert.equal(hash(bytes),hash(f.bytes));
    if(peer.directory){const root=resolve(peer.directory,'attachments'),file=resolve(root,a.relativePath);assert(file.startsWith(root+sep),'Confined attachment file');assert.equal(hash(await readFile(file)),hash(f.bytes));}
    report.observations.push({kind:'original-attachment',device:peer.name,noteId:id,name:f.name,bytes:bytes.length,sha256:hash(bytes),ownedDocumentReference:true,productionReadMatches:true,storedFileMatches:!!peer.directory});
  }
}
const attachmentSnapshot=ws=>ws.attachments.map(({id,noteId,displayName,mime,size,kind,recordedAt})=>({id,noteId,displayName,mime,size,kind,...(recordedAt===undefined?{}:{recordedAt})})).sort((a,b)=>a.id.localeCompare(b.id));
export const phoneSnapshot=ws=>({notes:snapshotNotes(ws.notes),attachments:attachmentSnapshot(ws)});
// This runs immediately after phone account validation, before any desktop is
// constructed or any sync mutation is issued. Full original bodies stay in memory.
export async function capturePhoneBaseline(peer,report){
  const ws=await peer.workspace();
  for(const id of PHONE_ORIGINAL_IDS){const matches=ws.notes.filter(n=>n.id===id&&!n.deletedAt);assert.equal(matches.length,1,'All four expected original phone notes required');}
  const baseline=phoneSnapshot(ws);
  for(const a of baseline.attachments){const owner=ws.notes.find(n=>n.id===a.noteId);assert(owner&&attachmentRefs(owner.document).includes(a.id),'Original phone attachment must have an owned document reference');canonicalBody(ws,owner);const result=await peer.readAttachment(a.id,a.noteId),bytes=Buffer.from(result.data,'base64');assert.equal(bytes.length,a.size);a.sha256=hash(bytes);}
  report.phoneBaseline={capturedBeforeDesktops:true,requiredNoteIds:[...PHONE_ORIGINAL_IDS],notes:baseline.notes.map(n=>({id:n.id,documentAndPlainTextSha256:hash(n.body)})),attachments:baseline.attachments.map(a=>({...a}))};
  report.preservation={afterMerge:false,afterCatchUp:false,final:false};
  return baseline;
}
export async function verifyPhoneBaseline(peer,baseline){
  const ws=await peer.workspace();assertPreserved(ws.notes,baseline.notes);
  const current=attachmentSnapshot(ws);
  for(const original of baseline.attachments){
    const {sha256,...expected}=original,matches=current.filter(a=>a.id===original.id);assert.equal(matches.length,1,'Original phone attachment row retained');assert.deepEqual(matches[0],expected,'Original phone ownership metadata retained');
    const owner=ws.notes.find(n=>n.id===original.noteId);assert(attachmentRefs(owner.document).includes(original.id),'Original phone document reference retained');canonicalBody(ws,owner);
    const result=await peer.readAttachment(original.id,original.noteId),bytes=Buffer.from(result.data,'base64');assert.equal(bytes.length,original.size);assert.equal(hash(bytes),sha256,'Original phone raw attachment bytes retained');
    if(peer.directory){const root=resolve(peer.directory,'attachments'),path=resolve(root,ws.attachments.find(a=>a.id===original.id).relativePath);assert(path.startsWith(root+sep));assert.equal(hash(await readFile(path)),sha256);}
  }
}
export async function samplePhonePause({readStatus,readWorkspace,before,remoteId,durationMs=3000,now=()=>performance.now(),sleep=delay}){
  const start=now();let samples=0;
  for(;;){
    const s=await readStatus();requireHealthy(s);expectedAccount(s);
    assert(s.state==='paused'&&!s.enabled&&!s.devices.some(d=>!d.current&&d.connected),'Phone remains paused without connected account streams');
    const ws=await readWorkspace();assert(!ws.notes.some(n=>n.id===remoteId),'Paused phone applied remote note');assert.deepEqual(phoneSnapshot(ws),before,'Paused phone retains exact local bodies and attachment rows');
    samples++;if(now()-start>=durationMs){assert(samples>=2,'Pause proof requires repeated samples');return {samples,observedMs:now()-start};}
    await sleep(Math.min(100,durationMs-(now()-start)));
  }
}

// Device-free orchestration seam: tests supply in-memory peers, never native evidence.
export async function runCases({peers,report,save,readStatuses,record,phoneBaseline,timeoutMs=60000,connectionTimeoutMs=120000,pauseWindowMs=3000,clock={},requireRelay02=false,declarePhone4gDesktopWifi=false,relayTimeoutMs=10000}){
  const [a,b,c]=peers;
  report.cases=CASES.map(id=>({id,status:'not-run'}));
  assert(phoneBaseline&&report.phoneBaseline?.capturedBeforeDesktops,'Pre-desktop phone baseline required');
  if(requireRelay02){
    assertThat(declarePhone4gDesktopWifi,'RELAY02_DECLARATION_REQUIRED');
    report.relay02={requested:true,status:'running',networkDeclaration:'phone-4g-desktop-wifi',networkSettingsIndependentlyVerified:false,scenarios:[],boundary:'Fresh sync Mapping samples before/after transfer, not per-byte path tracing'};
  }
  const preservation=async stage=>{for(const peer of peers)await verifyPhoneBaseline(peer,phoneBaseline);report.preservation[stage]=true;report.observations.push({kind:'original-phone-preservation',stage,peers:peers.map(p=>p.name),requiredOriginalNotes:4,allBaselineBodiesAndRawAttachments:true});await save();};
  const wait=(label,ready,begin,budget=timeoutMs)=>waitForAccountStatuses(label,readStatuses,async statuses=>{sameAccount(statuses);return ready(statuses);},budget,begin);
  const operation=async(peer,type,...args)=>{const s=await peer[type](...args);await record(peer,s);requireHealthy(s,{pendingNetwork:true});};
  const enabled=async peer=>wait('enable '+peer.name,statuses=>accountEnabled(statuses[peers.indexOf(peer)]),()=>operation(peer,'setEnabled',true));
  const same=async(source,targets,id,label,files)=>{
    const original=(await source.workspace()).notes.find(n=>n.id===id);assert(original,'Source full note exists');
    const participants=[source,...targets];
    await wait(label+' connection',statuses=>linkedStatuses(participants.map(p=>statuses[peers.indexOf(p)])),undefined,connectionTimeoutMs);
    await wait(label,async()=>{
      for(const p of targets){const n=(await p.workspace()).notes.find(n=>n.id===id);if(!n||noteBody(n)!==noteBody(original))return false;}return true;
    });
    for(const p of [source,...targets]){
      const n=(await p.workspace()).notes.find(n=>n.id===id);assert.deepEqual(n.document,original.document);assert.equal(n.plainText,original.plainText);await verifyOriginals(p,id,files,report);
    }
    report.observations.push({kind:'full-body-convergence',label,noteId:id,targets:targets.map(p=>p.name),documentAndPlainTextSha256:hash(noteBody(original))});
  };
  const caseRun=async(id,work)=>{
    report.phase=id;const row=report.cases.find(c=>c.id===id);row.status='running';await save();
    const relay=requireRelay02&&['a-rich-media','c-ui-note'].includes(id);
    const observation=async previous=>{
      let proof;
      await wait('RELAY-02 '+id+(previous?' after':' before'),statuses=>{
        try{proof=relay02Samples(statuses,previous);return true;}catch(error){if(error.code==='RELAY02_NOT_PROVEN')return false;throw error;}
      },undefined,relayTimeoutMs);
      return proof;
    };
    try{
      const before=relay?await observation():undefined;
      await work();assertPreserved((await c.workspace()).notes,phoneBaseline.notes);
      if(relay){const after=await observation(before);report.relay02.scenarios.push({id,before,after});}
      row.status='pass';
    }catch(error){row.status='fail';if(requireRelay02)report.relay02.status='fail';throw error;}finally{await save();}
  };
  await caseRun('auto-discovery',async()=>{
    const initial=await wait('initial three account statuses',()=>true);
    for(const [i,peer] of peers.entries())if(!initial[i].enabled)await enabled(peer);
    await wait('all three automatic account connections',meshReady,undefined,connectionTimeoutMs);
    await wait('original phone notes merge',async()=>{
      assertPreserved((await c.workspace()).notes,phoneBaseline.notes);
      for(const peer of [a,b]){const ws=await peer.workspace();for(const original of phoneBaseline.notes){const n=ws.notes.find(n=>n.id===original.id);if(!n)return false;assert.equal(noteBody(n),original.body,'Merged original phone body must remain exact');}}return true;
    });
    await preservation('afterMerge');
    report.observations.push({kind:'account-discovery',currentPeers:3,connectedDirectedEdges:6,manualPairing:false});
  });
  await caseRun('a-rich-media',async()=>{const id=await a.create(rich('Account109 三端 A '+report.runId),fixtures);await same(a,[b,c],id,'A to B/C formatted PNG+bin',fixtures);});
  await caseRun('c-ui-note',async()=>{
    const title='Account109 三端 C '+report.runId,lines=['手机真实界面创建完整正文','C → A/B 中文与 emoji 🌏'];
    const previous=new Set((await c.workspace()).notes.map(n=>n.id));
    const created=await c.createNote({title,body:lines.join('\n')});
    const expected={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:title}]},...lines.map(text=>({type:'paragraph',content:[{type:'text',text}]}))]};
    assert.deepEqual(created.document,expected);assert.equal(created.plainText,[title,...lines].join('\n'));
    assert(!previous.has(created.id),'Phone file owner must be newly created in this case');
    const attached=await c.submitNoteFiles(created.id);assertPhoneBodyRetained(created,attached);
    assert.equal(attachmentRefs(attached.document).length,phoneFixtures.length,'Exactly the fixed phone fixture references required');
    await same(c,[a,b],created.id,'C real UI body plus fixed File[] PNG+bin to A/B',phoneFixtures);
    report.observations.push({kind:'phone-origin-file-submission',noteId:created.id,bodyViaVisibleUI:true,filesViaFixedDebugCommand:true,systemPicker:false,verifiedPeers:['C','A','B']});
  });
  await caseRun('b-file',async()=>{const files=[fixtures[1]],id=await b.create(rich('Account109 三端 B '+report.runId),files);await same(b,[a,c],id,'B new file to A/C',files);});
  await caseRun('phone-pause-resume',async()=>{
    await wait('phone paused',s=>s[2].state==='paused'&&!s[2].enabled&&!s[2].devices.some(d=>!d.current&&d.connected),()=>operation(c,'setEnabled',false));
    const before=phoneSnapshot(await c.workspace()),id=await a.create(rich('Account109 手机暂停 '+report.runId),fixtures);
    await same(a,[b],id,'pause sentinel reaches B',fixtures);
    const proof=await samplePhonePause({readStatus:async()=>{
      const statuses=await readStatuses();statuses.forEach(s=>requireHealthy(s));sameAccount(statuses);
      assert(statuses.slice(0,2).every(s=>s.state==='ready'&&s.enabled),'Desktop sources remain ready');return statuses[2];
    },readWorkspace:()=>c.workspace(),before,remoteId:id,durationMs:pauseWindowMs,...clock});
    report.observations.push({kind:'phone-pause-no-apply',...proof,retainedNoteCount:before.notes.length,remoteNoteAbsent:true});
    await enabled(c);await wait('phone sync request ready',meshReady,()=>operation(c,'syncNow'),connectionTimeoutMs);
    await same(a,[b,c],id,'phone resume catch-up',fixtures);assertPreserved((await c.workspace()).notes,before.notes);
    await preservation('afterCatchUp');
  });
  await preservation('final');
  if(requireRelay02)report.relay02.status=report.relay02.scenarios.length===2?'pass':'fail';
}

export async function finishThreePeers(report,{desktops,phone,forwardPresent=ownedForwardPresent},save){
  const tasks=desktops.map(app=>Promise.resolve().then(()=>app.close()));if(phone)tasks.push(Promise.resolve().then(()=>phone.close()));
  const results=await Promise.allSettled(tasks);let forwardAbsent=false;
  if(phone){try{forwardAbsent=!(await forwardPresent(phone.owned));}catch{}}
  report.lifecycle=desktops.map(app=>app.lifecycle);report.cleanup={desktopNaturalExits:desktops.every(app=>app.lifecycle.naturalExit===true),androidDriverClosed:!!phone&&results.at(-1)?.status==='fulfilled',exactAndroidForwardAbsent:forwardAbsent};
  const clean=results.every(r=>r.status==='fulfilled')&&report.cleanup.desktopNaturalExits&&report.cleanup.androidDriverClosed&&forwardAbsent;
  if(!clean){report.status='fail';report.cleanup.failureCode='CLEANUP_FAILED';report.failure??={phase:'cleanup',code:'CLEANUP_FAILED'};}
  if(report.status!=='fail'){
    const relay=!report.relay02?.requested||(report.relay02.status==='pass'&&['a-rich-media','c-ui-note'].every(id=>report.relay02.scenarios?.some(s=>s.id===id)));
    report.status=relay&&CASES.every(id=>report.cases?.some(row=>row.id===id&&row.status==='pass'))&&report.phoneBaseline?.capturedBeforeDesktops===true&&['afterMerge','afterCatchUp','final'].every(stage=>report.preservation?.[stage]===true)?'pass':'fail';
    if(report.status==='fail')report.failure={phase:'completion',code:'CHECK_FAILED'};
  }
  report.finishedAt=new Date().toISOString();await save();
}

export async function run(argv=process.argv.slice(2)){
  const opts=options(argv);assert.equal(await realpath(opts.stores),opts.stores,'Canonical original stores required');
  const priorBytes=await readFile(resolve(opts.stores,'result.json')),prior=JSON.parse(priorBytes);
  assert(prior.kind==='real-account-two-native-desktops'&&['a','b'].every(device=>prior.observations.some(s=>s.device===device&&s.kind==='login'&&s.state==='paused'&&s.hasProfile)),'Original real login provenance required');
  for(const name of ['a','b']){const dir=resolve(opts.stores,'desktop-'+name);assert((await lstat(dir)).isDirectory()&&await realpath(dir)===dir,'Canonical original store directories required');}
  const binarySha256=hash(await readFile(opts.binary));await mkdir(opts.output,{mode:0o700});
  const report={schema:1,kind:'account109-two-native-desktops-plus-fixed-android',status:'running',runId:randomUUID().slice(0,8),startedAt:new Date().toISOString(),phase:'phone-prerequisite',stores:{root:opts.stores,priorReportSha256:hash(priorBytes)},binary:{path:opts.binary,sha256:binarySha256,sourceRevision:'unverified'},android:{package:PACKAGE,serial:SERIAL},tools:{},observations:[],cases:CASES.map(id=>({id,status:'not-run'})),authorization:{allowDesktopSignIn:opts.allowDesktopSignIn,desktopASignInRequested:false,phoneSignInRequested:false},limitations:[
    'Actual runtime account discovery/Noise/data paths only; no manual pairing, reverse mapping, grants, callbacks, tokens, workspace IDs or URL injection.',
    'Desktop note creation uses existing debug commands and synthetic File[] attachment.submit, not physical typing or an OS picker. Phone note creation uses existing visible UI and CDP Input.',
    'C to A/B checks a phone UI-created complete body plus fixed synthetic File[] through existing attachment.submit, including phone authorized reads and desktop managed raw bytes. It does not exercise the Android system picker; prepared cases are not evidence of an executed ANDROID-03.',
    'Desktop and phone setEnabled/syncNow use fixed production IPC and bypass UI confirmations. Phone must already be signed in as the expected synthetic username; this runner never signs the phone in.',
    'Desktop A signIn is opt-in native PKCE plus system-browser SSO; no credentials are supplied. Desktop B must restore its existing grant.',
    'Runner commit/tool hashes identify the harness only. Desktop binary and installed APK are independently fingerprinted; matching product source revisions are not claimed.',
    'Phone pause exclusion is sampled for 3 seconds; pause is not OS network loss. Android foreground/process restart, background reclaim, logout and conflict coverage are outside this runner.',
    'Only owned desktop processes and the exact Android CDP forward/lease are cleaned up. The fixed phone package remains running; no ADB settings or other app data are changed.',
    'RELAY-02 is independent opt-in with an operator phone-4G/desktop-WiFi declaration, not automatic network detection. Fresh before/after sync Mapping samples do not trace individual transferred bytes; ordinary three-peer PASS is not relay PASS.',
  ]};
  const root=fileURLToPath(new URL('../..',import.meta.url));report.runnerCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  for(const name of ['account109-three-peers.mjs','account109-android.mjs','account109-desktop-helpers.mjs','sync108-native-driver.mjs','sync108-android-lifecycle.mjs'])report.tools[name]=hash(await readFile(new URL(name,import.meta.url)));
  let saving=Promise.resolve();const save=()=>{const text=JSON.stringify(report,null,2)+'\n';saving=saving.then(()=>writeFile(resolve(opts.output,'result.json'),text,{mode:0o600}));return saving;};
  const observe=statusObserver(report,()=>report.phase),record=async(peer,s)=>{if(observe(peer.name,s))await save();};
  const desktops=[];let phone;
  try{
    await save();phone=await connectAndroid({launch:true});
    const {serial,package:packageId,pid,local,remote}=phone.owned;
    report.android={...report.android,...await phone.artifactIdentity(),owned:{serial,package:packageId,pid,local,remote}};
    const c={name:'C',status:()=>phone.accountStatus(),workspace:()=>phone.readWorkspace(),setEnabled:v=>phone.setEnabled(v),syncNow:()=>phone.syncNow(),createNote:v=>phone.createNote(v),submitNoteFiles:id=>phone.submitNoteFiles(id),readAttachment:id=>phone.readAttachment(id)};
    const phoneInitial=await c.status();await record(c,phoneInitial);requireHealthy(phoneInitial);assertThat(!!phoneInitial.profile&&!['authorizing','signedOut'].includes(phoneInitial.state),'ANDROID_SIGN_IN_REQUIRED');expectedAccount(phoneInitial);
    const phoneBaseline=await capturePhoneBaseline(c,report);await save();
    report.phase='restore-desktops';const peers=[];
    const env=Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].map(k=>[k,'']));
    for(const name of ['B','A']){const app=new NativeApp(opts.binary,resolve(opts.stores,'desktop-'+name.toLowerCase()),{name,env:{...env,NOTES_SYNC_E2E_SLOT:name==='A'?'left':'right'}});desktops.push(app);await app.ready(45000);peers.push(new Desktop(app,name));}
    const [b,a]=peers;
    const read=async list=>Promise.all(list.map(async peer=>{const s=await peer.status();await record(peer,s);return s;}));
    await waitForAccountStatuses('B existing grant restores',()=>read([b]),([s])=>{if(s.profile){expectedAccount(s);return true;}return false;},120000);
    const [initialA]=await waitForAccountStatuses('A restores or requires explicit sign-in',()=>read([a]),([s])=>!!s.profile||signedOut(s),120000);
    if(!initialA.profile){
      assertThat(opts.allowDesktopSignIn,'DESKTOP_A_SIGN_IN_REQUIRED');report.phase='explicit-desktop-a-sign-in';
      await waitForAccountStatuses('A official native PKCE sign-in',()=>read([a]),([s])=>{if(signedOut(s))throw fail('LOGIN_ENDED_SIGNED_OUT');if(!s.profile||s.state==='authorizing')return false;expectedAccount(s);return true;},120000,async()=>{report.authorization.desktopASignInRequested=true;await save();const s=await nativeAccount(a.app,'signIn');await record(a,s);requireHealthy(s,{pendingNetwork:true});});
    }
    const all=[a,b,c],readStatuses=()=>read(all);sameAccount(await readStatuses());
    await runCases({peers:all,report,save,readStatuses,record,phoneBaseline,requireRelay02:opts.requireRelay02,declarePhone4gDesktopWifi:opts.declarePhone4gDesktopWifi});
  }catch(error){report.status='fail';report.failure={phase:report.phase,code:['RELAY02_DECLARATION_REQUIRED','ANDROID_SIGN_IN_REQUIRED','DESKTOP_A_SIGN_IN_REQUIRED','EXPECTED_ACCOUNT_REQUIRED','ACCOUNT_OWNER_MISMATCH','ANDROID_DRIVER_LOCK_BUSY','ANDROID_DEVICE_AUTH_REQUIRED','ANDROID_OWNED_APP_NOT_FOREGROUND','ANDROID_PID_CHANGED','ANDROID_CDP_TIMEOUT','ANDROID_PAGE_EVALUATION_FAILED','ANDROID_UI_TIMEOUT','ANDROID_APK_PATH_INVALID','ANDROID_APK_HASH_INVALID','ANDROID_FILE_NOTE_INVALID','ANDROID_FILE_NEW_NOTE_REQUIRED','ANDROID_FILE_CAPABILITY_REQUIRED','ANDROID_FILE_OWNER_REQUIRED','ANDROID_FILE_SUBMIT_REJECTED'].includes(error.code)?error.code:failureCode(error)};
  }finally{await finishThreePeers(report,{desktops,phone},save);}
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const report=await run();console.log(JSON.stringify({status:report.status,failure:report.failure}));process.exitCode=report.status==='pass'?0:1;}
  catch{console.error('THREE_PEER_INPUT_OR_REPORT_FAILED');process.exitCode=1;}
}
