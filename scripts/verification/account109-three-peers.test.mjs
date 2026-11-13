// In-memory policy/orchestration fixtures only. Never native synchronization evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {accountSyncControls,installedApkPath,phoneFileControls,PACKAGE} from './account109-android.mjs';
import {options,STORES,USERNAME,PHONE_ORIGINAL_IDS,expectedAccount,sameAccount,meshReady,relay02Samples,fixtures,phoneFixtures,assertPhoneBodyRetained,verifyOriginals,phoneSnapshot,capturePhoneBaseline,verifyPhoneBaseline,samplePhonePause,runCases,finishThreePeers} from './account109-three-peers.mjs';

test('CLI accepts only original stores, absolute paths and explicit A sign-in opt-in',()=>{
  const argv=['--binary','/unit/native','--stores',STORES,'--output','/unit/fresh'];
  assert.equal(options(argv).allowDesktopSignIn,false);assert.equal(options([...argv,'--allow-desktop-sign-in']).allowDesktopSignIn,true);
  for(const bad of [argv.slice(0,-2),['--binary','relative','--stores',STORES,'--output','/unit/fresh'],[...argv,'--token','secret'],[...argv,'--binary','/duplicate'],[...argv,'--allow-desktop-sign-in','--allow-desktop-sign-in'],['--binary','/unit/native','--stores','/private/tmp/other','--output','/unit/fresh'],['--binary','/unit/native','--stores',STORES,'--output',STORES+'/result-new']])assert.throws(()=>options(bad));
});
test('RELAY-02 requires separate explicit opt-in and declared network topology',()=>{
 const argv=['--binary','/unit/native','--stores',STORES,'--output','/unit/fresh'];
 assert.equal(options(argv).requireRelay02,false);
 assert.equal(options([...argv,'--require-relay-02','--declare-phone-4g-desktop-wifi']).requireRelay02,true);
 for(const flags of [['--require-relay-02'],['--declare-phone-4g-desktop-wifi'],['--require-relay-02','--require-relay-02','--declare-phone-4g-desktop-wifi']])assert.throws(()=>options([...argv,...flags]));
});
test('fixed Android account methods reject extra arguments and injection',async()=>{
  const calls=[],controls=accountSyncControls(async command=>{calls.push(command);return {state:'paused'};});
  await controls.setEnabled(false);await controls.setEnabled(true);await controls.syncNow();
  assert.deepEqual(calls,[{type:'setEnabled',enabled:false},{type:'setEnabled',enabled:true},{type:'syncNow'}]);
  for(const args of [[],['true'],[{enabled:true,token:'secret'}],[true,{url:'https://private.invalid'}]])await assert.rejects(controls.setEnabled(...args));
  for(const args of [[{}],[{type:'signIn'}],['https://private.invalid']])await assert.rejects(controls.syncNow(...args));
  assert.equal(calls.length,3);assert.deepEqual(Object.keys(controls),['setEnabled','syncNow']);
});
test('installed APK lookup accepts only one safe base APK path',()=>{
  const apk=`/data/app/${PACKAGE}-abc_12==/base.apk`;
  assert.equal(installedApkPath('package:'+apk+'\n'),apk);
  for(const value of ['package:/other/base.apk','package:/data/app/a/../base.apk',`package:${apk}\npackage:/data/app/split/base.apk`,'package:/data/app/a;echo-secret/base.apk','package:/data/app/$(secret)/base.apk','package:/data/app/a space/base.apk'])assert.throws(()=>installedApkPath(value),{code:'ANDROID_APK_PATH_INVALID'});
});

function memoryPeers(){
  const baseline=PHONE_ORIGINAL_IDS.map((id,i)=>({id,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'保留已有中文 😀 '+i}]}]},plainText:'保留已有中文 😀 '+i}));
  const events=[],blobs=new Map();
  const peers=['A','B','C'].map(name=>({name,enabled:true,ws:{notes:structuredClone(baseline),attachments:[]}}));
  const publish=(source,note,rows)=>{for(const p of peers.filter(p=>p.enabled||p===source)){p.ws.notes=p.ws.notes.filter(n=>n.id!==note.id);p.ws.notes.push(structuredClone(note));p.ws.attachments=p.ws.attachments.filter(a=>a.noteId!==note.id);p.ws.attachments.push(...structuredClone(rows));}};
  for(const peer of peers){
    peer.status=async()=>({state:peer.enabled?'ready':'paused',enabled:peer.enabled,profile:{subject:'unit-owner',username:USERNAME},devices:peers.map(p=>({id:p.name,current:p===peer,online:true,connected:p!==peer&&p.enabled&&peer.enabled})),pendingCount:0,conflictCount:0});
    peer.workspace=async()=>({...structuredClone(peer.ws),access:{notes:Object.fromEntries(peer.ws.notes.map(n=>[n.id,{authorized:true}]))}});
    peer.setEnabled=async enabled=>{events.push(peer.name+':enabled:'+enabled);peer.enabled=enabled;if(enabled){for(const source of peers.filter(p=>p!==peer&&p.enabled))for(const note of [...source.ws.notes])publish(source,note,source.ws.attachments.filter(a=>a.noteId===note.id));}return peer.status();};
    peer.syncNow=async()=>{events.push(peer.name+':syncNow');return peer.status();};
    peer.create=async(document,files)=>{
      const id=randomUUID(),copy=structuredClone(document),rows=files.map((f,i)=>({id:id+'-attachment-'+i,noteId:id,displayName:f.name,mime:f.mime,size:f.bytes.length,kind:f.mime==='image/png'?'image':'file'}));
      for(const [i,f] of files.entries()){blobs.set(rows[i].id,Buffer.from(f.bytes));copy.content.push({type:'attachment',attrs:{id:rows[i].id,name:f.name,kind:rows[i].kind}});}
      const texts=node=>[...(node.text?[node.text]:[]),...(node.content||[]).flatMap(texts)];
      publish(peer,{id,document:copy,plainText:texts(copy).join('\n')},rows);events.push(peer.name+':create');return id;
    };
    const files=phoneFileControls({readWorkspace:peer.workspace,openNote:async id=>{events.push(peer.name+':open:'+id);},submit:async id=>{
      events.push(peer.name+':fixed-files:'+id);
      const note=structuredClone(peer.ws.notes.find(n=>n.id===id)),rows=phoneFixtures.map((f,i)=>({id:id+'-phone-'+i,noteId:id,displayName:f.name,mime:f.mime,size:f.bytes.length,kind:f.mime==='image/png'?'image':'file'}));
      for(const [i,f] of phoneFixtures.entries()){blobs.set(rows[i].id,Buffer.from(f.bytes));note.document.content.push({type:'attachment',attrs:{id:rows[i].id,name:f.name,kind:rows[i].kind}});}
      publish(peer,note,rows);return {submitted:true};
    }});
    peer.submitNoteFiles=files.submitNoteFiles;
    peer.createNote=async({title,body})=>{events.push(peer.name+':real-ui-fixture');const document={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:title}]},...body.split('\n').map(text=>({type:'paragraph',content:[{type:'text',text}]}))]};const id=await peer.create(document,[]),note=structuredClone(peer.ws.notes.find(n=>n.id===id));files.created(note);return note;};
    peer.readAttachment=async id=>({data:(peer.corrupt?Buffer.from('wrong original'):blobs.get(id)).toString('base64')});
  }
  return {peers,events,baseline};
}
async function relayStatuses(peers,sample=1){
 return Promise.all(peers.map(async peer=>{
  const s=await peer.status();s.transportGeneration=5;
  for(const d of s.devices)if(!d.current)d.transport={generation:5,sample,ageMs:0,enrollment:'iroh-direct',sync:'cloudflare-tunnel'};
  return s;
 }));
}
test('RELAY-02 refuses connected direct/unknown/missing/stale paths and requires new same-generation after samples',async()=>{
 const {peers}=memoryPeers(),before=await relayStatuses(peers,1),proof=relay02Samples(before);
 assert.equal(proof.length,4);assert(!JSON.stringify(proof).includes('unit-owner'));
 assert.doesNotThrow(()=>relay02Samples(awaitableClone(before,2),proof));
 function awaitableClone(s,sample){const c=structuredClone(s);for(const row of c)for(const d of row.devices)if(d.transport)d.transport.sample=sample;return c;}
 for(const change of [s=>{delete s[0].devices[2].transport;},s=>{s[0].devices[2].transport.sync='webrtc-direct';},s=>{s[0].devices[2].transport.sync='iroh-direct';},s=>{s[0].devices[2].transport.sync='unknown';},s=>{s[0].devices[2].transport.sync='unavailable';},s=>{s[0].devices[2].transport.ageMs=3001;},s=>{s[0].devices[2].transport.generation=4;},s=>{s[0].state='error';},s=>{s[0].devices[2].connected=false;}]){
  const s=structuredClone(before);change(s);assert.throws(()=>relay02Samples(s),{code:'RELAY02_NOT_PROVEN'});
 }
 assert.throws(()=>relay02Samples(before,proof),{code:'RELAY02_NOT_PROVEN'});
 const next=await relayStatuses(peers,2);next[2].transportGeneration=6;for(const d of next[2].devices)if(d.transport)d.transport.generation=6;
 assert.throws(()=>relay02Samples(next,proof),{code:'RELAY02_NOT_PROVEN'});
});

test('opt-in relay proof brackets both transfer cases while ordinary data success never implies relay success',async()=>{
 for(const relay of [false,true]){
  const {peers}=memoryPeers(),report={status:'running',runId:'unit',observations:[]};let sequence=0,clock=0;
  const phoneBaseline=await capturePhoneBaseline(peers[2],report);
  await runCases({peers,report,phoneBaseline,save:async()=>{},record:async()=>{},readStatuses:()=>relay?relayStatuses(peers,++sequence):Promise.all(peers.map(p=>p.status())),requireRelay02:relay,declarePhone4gDesktopWifi:relay,pauseWindowMs:20,clock:{now:()=>clock,sleep:async ms=>{clock+=ms;}}});
  assert(report.cases.every(c=>c.status==='pass'));
  if(relay){assert.equal(report.relay02.status,'pass');assert.equal(report.relay02.scenarios.length,2);for(const s of report.relay02.scenarios)assert(s.after.every((p,i)=>p.sample>s.before[i].sample));}
  else assert.equal(report.relay02,undefined);
 }
});
test('connected direct paths cannot start relay transfer or pass finalization after clean teardown',async()=>{
 const {peers,events}=memoryPeers(),report={status:'running',runId:'unit',observations:[]};
 const phoneBaseline=await capturePhoneBaseline(peers[2],report);
 await assert.rejects(runCases({peers,report,phoneBaseline,save:async()=>{},record:async()=>{},requireRelay02:true,declarePhone4gDesktopWifi:true,relayTimeoutMs:1,readStatuses:async()=>{
  const statuses=await relayStatuses(peers);for(const s of statuses)for(const d of s.devices)if(d.transport)d.transport.sync='iroh-direct';return statuses;
 }}));
 assert.equal(report.cases[0].status,'pass');assert.equal(report.cases[1].status,'fail');
 assert.equal(report.relay02.status,'fail');assert.equal(report.relay02.scenarios.length,0);assert(!events.includes('A:create'));
 await finishThreePeers(report,{desktops:[{lifecycle:{naturalExit:true},close:async()=>{}}],phone:{owned:{},close:async()=>{}},forwardPresent:async()=>false},async()=>{});assert.equal(report.status,'fail');
});
test('relay success remains separate from data and cleanup completion',async()=>{
 for(const relay02 of [{requested:true,status:'running',scenarios:[]},{requested:true,status:'pass',scenarios:[{id:'a-rich-media'}]}]){
  const report={...completeReport(),relay02};
  await finishThreePeers(report,{desktops:[{lifecycle:{naturalExit:true},close:async()=>{}}],phone:{owned:{},close:async()=>{}},forwardPresent:async()=>false},async()=>{});assert.equal(report.status,'fail');
 }
});
test('discovery needs all three actual peer connections and one common expected account',async()=>{
  const {peers}=memoryPeers(),statuses=await Promise.all(peers.map(p=>p.status()));assert(meshReady(statuses));sameAccount(statuses);
  const disconnected=structuredClone(statuses);disconnected[2].devices[0].connected=false;assert(!meshReady(disconnected));
  const duplicate=structuredClone(statuses);duplicate[2].devices.find(d=>d.current).id='A';assert(!meshReady(duplicate));
  assert(!meshReady(statuses.slice(0,2)));assert(!meshReady(statuses.map(s=>({...s,state:'connecting'}))));
  assert.throws(()=>expectedAccount({...statuses[0],profile:{subject:'unit-owner',username:'other'}}),{code:'EXPECTED_ACCOUNT_REQUIRED'});
  assert.throws(()=>sameAccount([statuses[0],{...statuses[1],profile:{subject:'different',username:USERNAME}}]),{code:'ACCOUNT_OWNER_MISMATCH'});
});
test('full fixture byte/reference checks reject corruption and missing document attachment refs',async()=>{
  const {peers:[a,b]}=memoryPeers(),id=await a.create({type:'doc',content:[]},fixtures),report={observations:[]};
  await verifyOriginals(b,id,fixtures,report);assert.equal(report.observations.length,2);
  b.corrupt=true;await assert.rejects(verifyOriginals(b,id,fixtures,report));b.corrupt=false;
  b.ws.notes.find(n=>n.id===id).document.content=[];await assert.rejects(verifyOriginals(b,id,fixtures,report),/Document references original attachment/);
});
test('paused phone snapshots repeatedly exclude remote notes and preserve all prior bodies and rows',async()=>{
  for(const failure of [null,'delayed-note','changed-body','lost-row','reauthorized','single-slow-read']){
    const {peers:[,,c]}=memoryPeers();await c.create({type:'doc',content:[]},fixtures);await c.setEnabled(false);
    const before=phoneSnapshot(await c.workspace());let clock=0;
    const work=samplePhonePause({before,remoteId:'remote',durationMs:300,now:()=>clock,sleep:async ms=>{clock+=ms;},readStatus:async()=>{const s=await c.status();if(failure==='reauthorized')s.enabled=true;return s;},readWorkspace:async()=>{
      const ws=await c.workspace();if(clock>=200&&failure==='delayed-note')ws.notes.push({id:'remote',document:{},plainText:''});
      if(failure==='changed-body')ws.notes[0].plainText='lost Chinese';if(failure==='lost-row')ws.attachments=[];if(failure==='single-slow-read')clock=400;return ws;
    }});
    if(failure)await assert.rejects(work);else{const proof=await work;assert.equal(proof.samples,4);assert.equal(proof.observedMs,300);}
  }
});
test('all five cases exercise both directions, media, phone pause and catch-up without assigning overall pass',async()=>{
  const {peers,events}=memoryPeers(),report={status:'running',runId:'unit',observations:[]},saved=[];let clock=0;
  const phoneBaseline=await capturePhoneBaseline(peers[2],report);assert.equal(events.length,0,'Capture precedes all mutation operations');
  await runCases({peers,report,phoneBaseline,save:async()=>{saved.push(structuredClone(report));},readStatuses:()=>Promise.all(peers.map(p=>p.status())),record:async()=>{},timeoutMs:1000,connectionTimeoutMs:1000,pauseWindowMs:300,clock:{now:()=>clock,sleep:async ms=>{clock+=ms;}}});
  assert.equal(report.cases.length,5);assert(report.cases.every(row=>row.status==='pass'));assert.equal(report.status,'running');assert(saved.every(s=>s.status==='running'));
  assert(events.includes('C:real-ui-fixture'));assert(events.includes('C:enabled:false'));assert(events.includes('C:enabled:true'));assert(events.includes('C:syncNow'));
  assert(report.observations.some(o=>o.kind==='phone-pause-no-apply'&&o.samples===4));
  const phoneNotes=(await peers[2].workspace()).notes;assert(PHONE_ORIGINAL_IDS.every(id=>phoneNotes.some(n=>n.id===id)));assert.equal(phoneNotes.length,8);
  assert.deepEqual(report.preservation,{afterMerge:true,afterCatchUp:true,final:true});assert(!JSON.stringify(report).includes('保留已有中文'));
  for(const peer of peers)assert.deepEqual(peer.ws.notes.map(n=>n.id).sort(),phoneNotes.map(n=>n.id).sort());
  const originals=report.observations.filter(o=>o.kind==='original-attachment');assert(originals.some(o=>o.device==='C'&&o.name.endsWith('.png')));assert(originals.some(o=>o.device==='A'&&o.name.endsWith('.bin')));
  assert.equal(originals.find(o=>o.name===fixtures[1].name).sha256,createHash('sha256').update(fixtures[1].bytes).digest('hex'));
  for(const name of ['C','A','B'])for(const file of phoneFixtures)assert(originals.some(o=>o.device===name&&o.name===file.name&&o.bytes===file.bytes.length&&o.sha256===createHash('sha256').update(file.bytes).digest('hex')));
  const submission=report.observations.find(o=>o.kind==='phone-origin-file-submission');assert(submission&&submission.bodyViaVisibleUI&&submission.filesViaFixedDebugCommand&&!submission.systemPicker);
  assert(events.some(e=>e.startsWith('C:fixed-files:')));
});

test('phone-origin failures leave later scenarios unexecuted and cleanup cannot manufacture success',async()=>{
  for(const mode of ['capability','old-note-id','wrong-owner','lost-reference','changed-body','corrupt-phone-read','corrupt-desktop-read','wrong-length']){
    const {peers,events}=memoryPeers(),[a,b,c]=peers,report={status:'running',runId:'unit',observations:[]};
    const phoneBaseline=await capturePhoneBaseline(c,report),submit=c.submitNoteFiles;
    c.submitNoteFiles=async id=>{
      if(mode==='capability')throw Object.assign(Error('fixed capability failure'),{code:'ANDROID_FILE_CAPABILITY_REQUIRED'});
      if(mode==='old-note-id')return submit(PHONE_ORIGINAL_IDS[0]);
      const note=await submit(id);
      if(mode==='corrupt-phone-read')c.corrupt=true;if(mode==='corrupt-desktop-read')b.corrupt=true;
      for(const p of peers){const n=p.ws.notes.find(n=>n.id===id);if(mode==='wrong-owner')p.ws.attachments.find(a=>a.noteId===id).noteId=PHONE_ORIGINAL_IDS[0];if(mode==='lost-reference')n.document.content=n.document.content.filter(n=>n.type!=='attachment');if(mode==='changed-body')n.document.content[1].content[0].text='lost full body';if(mode==='wrong-length')p.ws.attachments.find(a=>a.noteId===id).size++;}
      return structuredClone(c.ws.notes.find(n=>n.id===id));
    };
    await assert.rejects(runCases({peers,report,phoneBaseline,save:async()=>{},readStatuses:()=>Promise.all(peers.map(p=>p.status())),record:async()=>{},timeoutMs:1000,connectionTimeoutMs:1000}));
    assert.equal(report.cases[2].status,'fail',mode);assert(report.cases.slice(3).every(r=>r.status==='not-run'));assert(!events.includes('C:enabled:false'));assert(!report.observations.some(o=>o.kind==='phone-origin-file-submission'));
    for(const p of [a,b,c])for(const original of phoneBaseline.notes)assert.equal(JSON.stringify({document:p.ws.notes.find(n=>n.id===original.id).document,plainText:p.ws.notes.find(n=>n.id===original.id).plainText}),original.body);
    await finishThreePeers(report,{desktops:[{lifecycle:{naturalExit:true},close:async()=>{}}],phone:{owned:{},close:async()=>{}},forwardPresent:async()=>false},async()=>{});assert.equal(report.status,'fail');
  }
});

test('phone-origin bytes are checked against both desktop managed files as well as production-read fixtures',async()=>{
  const root=await mkdtemp(join(tmpdir(),'account109-phone-files-fixture-'));
  try{
    const {peers:[a,b,c]}=memoryPeers(),note=await c.createNote({title:'固定新笔记',body:'完整正文 😀'}),attached=await c.submitNoteFiles(note.id);assertPhoneBodyRetained(note,attached);
    for(const peer of [a,b]){
      peer.directory=join(root,peer.name);await mkdir(join(peer.directory,'attachments'),{recursive:true});
      for(const [i,file] of phoneFixtures.entries()){const row=peer.ws.attachments.find(a=>a.noteId===note.id&&a.displayName===file.name);row.relativePath='phone-'+i;await writeFile(join(peer.directory,'attachments',row.relativePath),file.bytes);}
      const report={observations:[]};await verifyOriginals(peer,note.id,phoneFixtures,report);assert.equal(report.observations.length,2);assert(report.observations.every(o=>o.storedFileMatches&&o.productionReadMatches&&o.ownedDocumentReference));
      const row=peer.ws.attachments.find(a=>a.noteId===note.id),sameLength=Buffer.alloc(row.size,77);await writeFile(join(peer.directory,'attachments',row.relativePath),sameLength);
      await assert.rejects(verifyOriginals(peer,note.id,phoneFixtures,{observations:[]}),'Same-length managed-file corruption must fail SHA proof');
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
test('failed original-byte proof leaves later cases unrun and cannot pass cleanup finalization',async()=>{
  const {peers}=memoryPeers();peers[2].corrupt=true;
  const report={status:'running',runId:'unit',observations:[]};
  const phoneBaseline=await capturePhoneBaseline(peers[2],report);
  await assert.rejects(runCases({peers,report,phoneBaseline,save:async()=>{},readStatuses:()=>Promise.all(peers.map(p=>p.status())),record:async()=>{},timeoutMs:1000,connectionTimeoutMs:1000}));
  assert.equal(report.cases[1].status,'fail');assert(report.cases.slice(2).every(row=>row.status==='not-run'));
  await finishThreePeers(report,{desktops:[{lifecycle:{naturalExit:true},close:async()=>{}}],phone:{owned:{},close:async()=>{}},forwardPresent:async()=>false},async()=>{});assert.equal(report.status,'fail');
});

const completeReport=()=>({status:'running',phoneBaseline:{capturedBeforeDesktops:true},preservation:{afterMerge:true,afterCatchUp:true,final:true},cases:['auto-discovery','a-rich-media','c-ui-note','b-file','phone-pause-resume'].map(id=>({id,status:'pass'}))});
test('overall pass waits for every owned desktop and exact phone forward cleanup',async()=>{
  const report=completeReport();let releaseA,releaseB,saved=false,phoneClosed=false;
  const desktop=name=>({lifecycle:{name},close(){return new Promise(done=>{const release=()=>{this.lifecycle.naturalExit=true;done();};if(name==='A')releaseA=release;else releaseB=release;});}});
  const finishing=finishThreePeers(report,{desktops:[desktop('A'),desktop('B')],phone:{owned:{},close:async()=>{phoneClosed=true;}},forwardPresent:async()=>false},async()=>{saved=true;});
  await new Promise(done=>setImmediate(done));assert.equal(report.status,'running');assert(!saved);assert(phoneClosed);releaseA();releaseB();await finishing;assert.equal(report.status,'pass');assert(saved);
});
test('retained forward, rejected cleanup, forced exit and original failure all prevent pass',async()=>{
  for(const mode of ['forward','phone-reject','desktop-throw','forced','prior-failure']){
    const report=completeReport();if(mode==='prior-failure'){report.status='fail';report.failure={phase:'phone-prerequisite',code:'ANDROID_SIGN_IN_REQUIRED'};}
    let phoneClosed=false;
    const desktop={lifecycle:{naturalExit:mode!=='forced'},close(){if(mode==='desktop-throw')throw Error('private error detail');}};
    await finishThreePeers(report,{desktops:[desktop],phone:{owned:{},close:async()=>{phoneClosed=true;if(mode==='phone-reject')throw Error('private phone detail');}},forwardPresent:async()=>mode==='forward'},async()=>{});
    assert.equal(report.status,'fail');assert(phoneClosed);assert(!JSON.stringify(report).includes('private'));
    if(mode==='prior-failure')assert.equal(report.failure.code,'ANDROID_SIGN_IN_REQUIRED');
  }
});

test('missing expected original is rejected before any sync mutations; a late baseline is not accepted',async()=>{
  const {peers,events}=memoryPeers(),report={observations:[]};peers[2].ws.notes.pop();
  await assert.rejects(capturePhoneBaseline(peers[2],report),/four expected/);assert.equal(events.length,0);
  await assert.rejects(runCases({peers,report,save:async()=>{},readStatuses:()=>Promise.all(peers.map(p=>p.status())),record:async()=>{}}),/Pre-desktop/);
});
test('loss or changed complete original body before the pause snapshot fails even when every new transfer succeeds',async()=>{
  for(const mode of ['lost-all','changed-document','changed-plainText']){
    const {peers}=memoryPeers(),report={status:'running',runId:'unit',observations:[]};const phoneBaseline=await capturePhoneBaseline(peers[2],report);
    const create=peers[0].create;
    peers[0].create=async(...args)=>{const id=await create(...args);for(const p of peers){if(mode==='lost-all')p.ws.notes=p.ws.notes.filter(n=>!PHONE_ORIGINAL_IDS.includes(n.id));else{const n=p.ws.notes.find(n=>n.id===PHONE_ORIGINAL_IDS[0]);if(mode==='changed-document')n.document.content[0].content[0].text='corrupted formatting/body';else n.plainText='corrupted plain text';}}return id;};
    await assert.rejects(runCases({peers,report,phoneBaseline,save:async()=>{},readStatuses:()=>Promise.all(peers.map(p=>p.status())),record:async()=>{},timeoutMs:1000,connectionTimeoutMs:1000}));
    assert(report.observations.some(o=>o.kind==='full-body-convergence'&&o.label==='A to B/C formatted PNG+bin'),'New transfer passed before preservation failure');assert.equal(report.cases[1].status,'fail');assert(report.cases.slice(2).every(r=>r.status==='not-run'));
    await finishThreePeers(report,{desktops:[{lifecycle:{naturalExit:true},close:async()=>{}}],phone:{owned:{},close:async()=>{}},forwardPresent:async()=>false},async()=>{});assert.equal(report.status,'fail');
  }
});
test('baseline attachment ownership, metadata, references and actual bytes survive with additional notes allowed',async()=>{
  const {peers}=memoryPeers(),report={observations:[]};const c=peers[2];await c.create({type:'doc',content:[]},fixtures);const phoneBaseline=await capturePhoneBaseline(c,report);
  assert.equal(phoneBaseline.attachments.length,2);assert(report.phoneBaseline.attachments.every(a=>a.sha256));
  await c.create({type:'doc',content:[]},[]);await verifyPhoneBaseline(c,phoneBaseline);
  for(const mode of ['lost-row','wrong-owner','wrong-mime','wrong-bytes','lost-reference']){
    const saved=structuredClone(c.ws);c.corrupt=mode==='wrong-bytes';const a=c.ws.attachments[0];
    if(mode==='lost-row')c.ws.attachments.shift();if(mode==='wrong-owner')a.noteId=PHONE_ORIGINAL_IDS[0];if(mode==='wrong-mime')a.mime='other';if(mode==='lost-reference')c.ws.notes.find(n=>n.id===a.noteId).document.content=[];
    await assert.rejects(verifyPhoneBaseline(c,phoneBaseline));c.ws=saved;c.corrupt=false;
  }
  assert(!JSON.stringify(report).includes('保留已有中文'));
});
test('cleanup cannot turn green cases into overall pass without each initial-baseline preservation gate',async()=>{
  for(const missing of ['baseline','afterMerge','afterCatchUp','final']){
    const report=completeReport();if(missing==='baseline')delete report.phoneBaseline;else report.preservation[missing]=false;
    await finishThreePeers(report,{desktops:[{lifecycle:{naturalExit:true},close:async()=>{}}],phone:{owned:{},close:async()=>{}},forwardPresent:async()=>false},async()=>{});assert.equal(report.status,'fail');
  }
});
