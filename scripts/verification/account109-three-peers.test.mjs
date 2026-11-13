// In-memory policy/orchestration fixtures only. Never native synchronization evidence.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {accountSyncControls,installedApkPath,PACKAGE} from './account109-android.mjs';
import {options,STORES,USERNAME,expectedAccount,sameAccount,meshReady,fixtures,verifyOriginals,phoneSnapshot,samplePhonePause,runCases,finishThreePeers} from './account109-three-peers.mjs';

test('CLI accepts only original stores, absolute paths and explicit A sign-in opt-in',()=>{
  const argv=['--binary','/unit/native','--stores',STORES,'--output','/unit/fresh'];
  assert.equal(options(argv).allowDesktopSignIn,false);assert.equal(options([...argv,'--allow-desktop-sign-in']).allowDesktopSignIn,true);
  for(const bad of [argv.slice(0,-2),['--binary','relative','--stores',STORES,'--output','/unit/fresh'],[...argv,'--token','secret'],[...argv,'--binary','/duplicate'],[...argv,'--allow-desktop-sign-in','--allow-desktop-sign-in'],['--binary','/unit/native','--stores','/private/tmp/other','--output','/unit/fresh'],['--binary','/unit/native','--stores',STORES,'--output',STORES+'/result-new']])assert.throws(()=>options(bad));
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
  const baseline={id:'existing-note',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'保留已有中文 😀'}]}]},plainText:'保留已有中文 😀'};
  const events=[],blobs=new Map();let serial=0;
  const peers=['A','B','C'].map(name=>({name,enabled:true,ws:{notes:[structuredClone(baseline)],attachments:[]}}));
  const publish=(source,note,rows)=>{for(const p of peers.filter(p=>p.enabled||p===source)){p.ws.notes=p.ws.notes.filter(n=>n.id!==note.id);p.ws.notes.push(structuredClone(note));p.ws.attachments=p.ws.attachments.filter(a=>a.noteId!==note.id);p.ws.attachments.push(...structuredClone(rows));}};
  for(const peer of peers){
    peer.status=async()=>({state:peer.enabled?'ready':'paused',enabled:peer.enabled,profile:{subject:'unit-owner',username:USERNAME},devices:peers.map(p=>({id:p.name,current:p===peer,online:true,connected:p!==peer&&p.enabled&&peer.enabled})),pendingCount:0,conflictCount:0});
    peer.workspace=async()=>structuredClone(peer.ws);
    peer.setEnabled=async enabled=>{events.push(peer.name+':enabled:'+enabled);peer.enabled=enabled;if(enabled){for(const source of peers.filter(p=>p!==peer&&p.enabled))for(const note of [...source.ws.notes])publish(source,note,source.ws.attachments.filter(a=>a.noteId===note.id));}return peer.status();};
    peer.syncNow=async()=>{events.push(peer.name+':syncNow');return peer.status();};
    peer.create=async(document,files)=>{
      const id=peer.name+'-note-'+(++serial),copy=structuredClone(document),rows=files.map((f,i)=>({id:id+'-attachment-'+i,noteId:id,displayName:f.name,mime:f.mime,size:f.bytes.length,kind:f.mime==='image/png'?'image':'file'}));
      for(const [i,f] of files.entries()){blobs.set(rows[i].id,Buffer.from(f.bytes));copy.content.push({type:'attachment',attrs:{id:rows[i].id,name:f.name,kind:rows[i].kind}});}
      const texts=node=>[...(node.text?[node.text]:[]),...(node.content||[]).flatMap(texts)];
      publish(peer,{id,document:copy,plainText:texts(copy).join('\n')},rows);events.push(peer.name+':create');return id;
    };
    peer.createNote=async({title,body})=>{events.push(peer.name+':real-ui-fixture');const document={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:title}]},...body.split('\n').map(text=>({type:'paragraph',content:[{type:'text',text}]}))]};const id=await peer.create(document,[]);return structuredClone(peer.ws.notes.find(n=>n.id===id));};
    peer.readAttachment=async id=>({data:(peer.corrupt?Buffer.from('wrong original'):blobs.get(id)).toString('base64')});
  }
  return {peers,events,baseline};
}
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
  await runCases({peers,report,save:async()=>{saved.push(structuredClone(report));},readStatuses:()=>Promise.all(peers.map(p=>p.status())),record:async()=>{},timeoutMs:1000,connectionTimeoutMs:1000,pauseWindowMs:300,clock:{now:()=>clock,sleep:async ms=>{clock+=ms;}}});
  assert.equal(report.cases.length,5);assert(report.cases.every(row=>row.status==='pass'));assert.equal(report.status,'running');assert(saved.every(s=>s.status==='running'));
  assert(events.includes('C:real-ui-fixture'));assert(events.includes('C:enabled:false'));assert(events.includes('C:enabled:true'));assert(events.includes('C:syncNow'));
  assert(report.observations.some(o=>o.kind==='phone-pause-no-apply'&&o.samples===4));
  const phoneNotes=(await peers[2].workspace()).notes;assert(phoneNotes.some(n=>n.id==='existing-note'));assert.equal(phoneNotes.length,5);
  for(const peer of peers)assert.deepEqual(peer.ws.notes.map(n=>n.id).sort(),phoneNotes.map(n=>n.id).sort());
  const originals=report.observations.filter(o=>o.kind==='original-attachment');assert(originals.some(o=>o.device==='C'&&o.name.endsWith('.png')));assert(originals.some(o=>o.device==='A'&&o.name.endsWith('.bin')));
  assert.equal(originals.find(o=>o.name===fixtures[1].name).sha256,createHash('sha256').update(fixtures[1].bytes).digest('hex'));
});
test('failed original-byte proof leaves later cases unrun and cannot pass cleanup finalization',async()=>{
  const {peers}=memoryPeers();peers[2].corrupt=true;
  const report={status:'running',runId:'unit',observations:[]};
  await assert.rejects(runCases({peers,report,save:async()=>{},readStatuses:()=>Promise.all(peers.map(p=>p.status())),record:async()=>{},timeoutMs:1000,connectionTimeoutMs:1000}));
  assert.equal(report.cases[1].status,'fail');assert(report.cases.slice(2).every(row=>row.status==='not-run'));
  await finishThreePeers(report,{desktops:[{lifecycle:{naturalExit:true},close:async()=>{}}],phone:{owned:{},close:async()=>{}},forwardPresent:async()=>false},async()=>{});assert.equal(report.status,'fail');
});

const completeReport=()=>({status:'running',cases:['auto-discovery','a-rich-media','c-ui-note','b-file','phone-pause-resume'].map(id=>({id,status:'pass'}))});
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
