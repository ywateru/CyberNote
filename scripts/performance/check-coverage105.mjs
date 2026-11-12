#!/usr/bin/env node
//Small tool predicates plus both real-App representative runs; never500paired.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {after105,assertAfter105,assertBaselineInventory,frontendPins,currentDecoded,protocol105,installCoverage105,settle105} from './coverage105.mjs';
import {CoverageLedger105,phaseSummary105,formalPhases105,terminal105,nativeVideoReady105} from './coverage105-formal.mjs';
const args={};for(let i=2;i<process.argv.length;i+=2){assert(process.argv[i].startsWith('--')&&process.argv[i+1]);args[process.argv[i].slice(2)]=process.argv[i+1];}
const checks=[];function test(name,f){f();checks.push({name,ok:true});}
test('accepted-source-is-exact',()=>{const valid={sourceFingerprint:after105.fingerprint,inputCount:445};assertAfter105(valid);assert.throws(()=>assertAfter105({...valid,sourceFingerprint:'0'.repeat(64)}));assert.throws(()=>assertAfter105({...valid,inputCount:444}));});
test('baseline-missing-extra-bytechanged-failclosed',()=>{assertBaselineInventory({...frontendPins});const missing={...frontendPins};delete missing['index.html'];assert.throws(()=>assertBaselineInventory(missing));assert.throws(()=>assertBaselineInventory({...frontendPins,'extra.js':'x'}));assert.throws(()=>assertBaselineInventory({...frontendPins,'index.html':'0'.repeat(64)}));});
test('decode-requires-current-source-and-two-frames',()=>{const good={connected:true,complete:true,width:64,decode:'resolved',source:'s1',decodeSource:'s1',frames:2};assert(currentDecoded(good));for(const patch of [{connected:false},{complete:false},{width:0},{decode:'running'},{decodeSource:'old'},{frames:1}])assert(!currentDecoded({...good,...patch}));});
test('protocol-is-fixed',()=>{assert.equal(protocol105.sampleMs,100);assert.equal(protocol105.dwellMs,500);assert.equal(protocol105.viewportDeadlineMs,30000);assert.equal(protocol105.continuousVisibility,false);});
test('formal-ledger-never-only-supplement-and-warm-gate',()=>{const mapping={attachments:Array.from({length:500},(_,sampleIndex)=>({id:'a'+sampleIndex,sampleIndex,mime:'image/png',sha256:'s'}))},ledger=new CoverageLedger105(mapping);const card=id=>({attachmentId:id,visible:true,image:{connected:true,complete:true,width:64,decode:'resolved',source:'source-'+id,decodeSource:'source-'+id,frames:2}});const sample=cards=>({event:'sample',snapshot:{at:1,cards,geometry:{}},observation:{events:[]}});ledger.ingest('gallery-cold-first-pass',sample([...ledger.rows.keys()].slice(0,499).map(card)));assert.equal(ledger.allColdDecoded(),false);assert.deepEqual(ledger.neverVisited(),['a499']);ledger.ingest('gallery-cold-supplement',sample([card('a499')]));assert.equal(ledger.allColdDecoded(),false);ledger.supplementAllowed=new Set(['a499']);assert.equal(ledger.allColdDecoded(),true);ledger.rows.get('a0').phases['gallery-cold-first-pass'].errors.push({message:'actual error'});assert.equal(ledger.allColdDecoded(),false);assert.equal(ledger.coldStatus(ledger.rows.get('a0')),'explicit-error');});
test('formal-state-log-does-not-repeat-500-card-rects',()=>{const ledger=new CoverageLedger105({attachments:Array.from({length:500},(_,sampleIndex)=>({id:'a'+sampleIndex,sampleIndex}))});const row={event:'sample',snapshot:{at:1,geometry:{},cards:[...ledger.rows.keys()].map(id=>({attachmentId:id,visible:false,rect:{top:10000},image:null}))},observation:{events:[]}};assert.equal(ledger.ingest('gallery-cold-first-pass',row).length,501);assert.equal(ledger.ingest('gallery-cold-first-pass',row).length,1);assert.equal(ledger.neverVisited().length,500);});
test('formal-current-source-timeout-stays-failure',()=>{const ledger=new CoverageLedger105({attachments:[{id:'a',sampleIndex:0}]});const card={attachmentId:'a',visible:true,image:{connected:true,complete:true,width:64,decode:'resolved',source:'new',decodeSource:'old',frames:2}};ledger.ingest('gallery-cold-first-pass',{event:'sample',snapshot:{at:1,cards:[card],geometry:{}},observation:{events:[]}});ledger.timeout('gallery-cold-first-pass',{cards:[card]});assert.equal(ledger.coldStatus(ledger.rows.get('a')),'timeout');});
test('baseline-missing-native-metrics-remain-null',()=>{const p=phaseSummary105({name:'cold',start:1,end:11,runtimeStart:null,runtimeEnd:null,runtimeDelta:null},{frames:[],longTasks:[]},[],[],[],null);assert.equal(p.runtimeDelta,null);assert.equal(p.peakRustRSS,null);assert.equal(p.peakRendererRSS,null);assert.equal(p.wallMs,10);});
async function supplementPathChecks(){
 // Execute the exact shared scroll helper with deterministic settled DOM
 // geometry. No browser, source acquisition or replacement readiness policy.
 const source=await readFile(new URL('./coverage105.mjs',import.meta.url),'utf8');
 const text=source.slice(source.indexOf('export async function scroll105('),source.indexOf('\nexport async function runCoverage105(')).replace('export ','');
 const execute=new (Object.getPrototypeOf(async function(){}).constructor)('env',`with(env){${text}\nreturn await scroll105(page,record,options);}`);
 const results=[];
 for(const [name,targets,expectedTop,error,startTop=0,returnToTop=false]of [['near-top',['near'],50,null],['multiple',['near','far'],250,null],['none',[],0,null],['missing',['missing'],0,'missing from DOM'],['unreachable',['beyond'],900,'unreachable at scroll boundary'],['warm-position',undefined,0,null,250,true]]){
  const el={clientHeight:100,scrollHeight:1000,scrollTop:startTop},moves=[],audits=[];let settled=0,reads=0;
  const templates=[['old-error',0],['near',110],['old-error-crossed',210],['far',310],['tail',900],['beyond',2000]];
  const snapshot=()=>({at:settled,cards:templates.map(([attachmentId,y])=>({attachmentId,visible:y+30>el.scrollTop&&y<el.scrollTop+100,rect:{top:y-el.scrollTop,bottom:y+30-el.scrollTop},...(attachmentId.startsWith('old-error')?{productError:'preserved actual error'}:{image:{connected:true,complete:true,width:64,decode:'resolved',source:attachmentId,decodeSource:attachmentId,frames:2}})})),geometry:{scrollTop:el.scrollTop,clientHeight:100,scrollHeight:1000,box:{top:0,bottom:100}}});
  const env={assert,terminal105,page:{locator:()=>({evaluate:async(fn,arg)=>{reads++;return fn(el,arg);}})},record:async row=>moves.push(row.after),options:{targetIds:targets,returnToTop,onStep:async r=>audits.push(r.snapshot.cards.filter(c=>c.visible).map(c=>c.attachmentId))},settle105:async()=>{settled++;return {wallMs:500,snapshot:snapshot()};},requestAnimationFrame:cb=>queueMicrotask(()=>cb(0))};
  if(error)await assert.rejects(()=>execute(env),new RegExp(error));else await execute(env);
  assert.equal(el.scrollTop,expectedTop);assert(moves.every((p,i)=>Math.abs(p-(i?moves[i-1]:startTop))<=50),'supplement half-viewport step');
  if(name==='near-top')assert.deepEqual(moves,[50]);if(name==='multiple'){assert.deepEqual(moves,[50,100,150,200,250]);assert(audits.some(ids=>ids.includes('old-error-crossed')));}
  if(name==='none'){assert.equal(reads,0);assert.equal(settled,0);}
  if(name==='warm-position'){assert.deepEqual(moves,[200,150,100,50,0,0]);assert.equal(settled,6);}
  results.push({name,targets,returnToTop,startTop,moves,finalTop:el.scrollTop,settled,error,oldErrorsNotTargets:!(targets||[]).some(x=>x.startsWith('old-error'))});
 }
 // Exercise the real formal branch as well: frozen DOM order is forwarded,
 // only original never IDs are targets, and no-never emits no supplement.
 for(const {name,missing,originalError,stopTop}of [{name:'formal-only-never-forwarded',missing:true,originalError:true,stopTop:250},{name:'successful-supplement-prepare-warm',missing:true,originalError:false,stopTop:250},{name:'successful-supplement-already-top',missing:true,originalError:false,stopTop:0},{name:'formal-no-never-no-supplement',missing:false,originalError:false,stopTop:0}]){
  const ledger=new CoverageLedger105({attachments:Array.from({length:500},(_,sampleIndex)=>({id:'a'+sampleIndex,sampleIndex}))});let phase,top=0;const calls=[],outputs=[],phases=[];
  const dom=['a499',...Array.from({length:499},(_,i)=>'a'+i)],sample=(ids)=>({event:'sample',snapshot:{at:1,geometry:{},cards:ids.map(id=>({attachmentId:id,visible:true,...(originalError&&id==='a0'?{productError:'original failure'}:{image:{connected:true,complete:true,width:64,decode:'resolved',source:id,decodeSource:id,frames:2}})}))},observation:{events:[]}});
  const control={inputValue:async()=>'',fill:async()=>{},click:async()=>{},waitFor:async()=>{},evaluateAll:async()=>dom,evaluate:async fn=>fn({scrollTop:top})};
  await formalPhases105({page:{getByRole:()=>control,locator:()=>control,evaluate:async()=>{},waitForTimeout:async()=>{}},mapping:{notes:[{id:'note',sampleIndices:[0,1,2,3,4]}]},manifest:{files:[]},ledger,scroll:async(_page,_record,options)=>{calls.push({phase,startTop:top,targetIds:options.targetIds,returnToTop:options.returnToTop});if(phase==='gallery-warm-position'){assert.equal(options.returnToTop,true);top=0;}else{if(phase==='gallery-warm-pass')assert.equal(top,0);ledger.ingest(phase,sample(phase==='gallery-cold-supplement'?options.targetIds:missing&&phase==='gallery-cold-first-pass'?dom.filter(id=>id!=='a499'):dom));top=phase==='gallery-cold-supplement'?stopTop:0;}},record:()=>{},join:async()=>{},begin:async name=>{phase=name;phases.push({name,startTop:top});},end:async()=>{},backend:{},side:'after',output:async(name,value)=>outputs.push({name,value})});
  const supplemental=calls.filter(c=>c.phase==='gallery-cold-supplement');assert.equal(supplemental.length,missing?1:0);if(missing)assert.deepEqual(supplemental[0].targetIds,['a499']);
  const position=calls.filter(c=>c.phase==='gallery-warm-position');assert.equal(position.length,!originalError&&stopTop!==0?1:0);if(position.length){assert.equal(position[0].startTop,250);assert(phases.some(p=>p.name==='gallery-warm-position'));}
  if(originalError){assert.equal(ledger.coldStatus(ledger.rows.get('a0')),'explicit-error');assert(!calls.some(c=>c.phase==='gallery-warm-pass'));}else assert.equal(calls.find(c=>c.phase==='gallery-warm-pass').startTop,0);
  results.push({name,calls,phases,oldFailurePreserved:originalError?ledger.coldStatus(ledger.rows.get('a0')):null});
 }
 checks.push({name:'supplement-target-paths-and-real-formal-routing',ok:true,results});
}
async function atomicJoinChecks(){
 const source=await readFile(new URL('./coverage105.mjs',import.meta.url),'utf8');
 const extract=s=>s.slice(s.indexOf(' const join=async(visibleOnly=false)=>{'),s.indexOf(' const accessRecord=async row=>'));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,current=new AsyncFunction('env',`with(env){${extract(source)}return await join(true);}`),results=[];
 const rawURL='http://127.0.0.1:12345/private-capability-not-for-raw';
 const makeCard=()=>({attachmentId:'a',mount:'mount-1',visible:true,prefetch:true,image:{node:'image-1',source:'source-1',url:rawURL,connected:true,link:{token:'source-1',attachmentId:'a',call:1,purpose:'thumbnail',unmapped:false}}});
 for(const name of ['stable-baseline','stable-after','new-offscreen-after-observation','coherent-offscreen-unmapped','historical-not-in-current','visible-missing-source','visible-unmapped','visible-wrong-owner','visible-wrong-source','missing-IPC','duplicate-IPC','failed-IPC','wrong-grant-owner','wrong-grant-purpose']){
  const after=name==='stable-after'||name.startsWith('wrong-grant'),card=makeCard(),cards=[card],events=[],links=new Map();let evaluations=0;
  const rows=[{id:4,coverageCall:1,command:after?'acquire_attachment_source':'read_attachment',ok:true,...(after?{}:{attachmentId:'a',returnedSha256:'frozen-SHA'})}];
  if(name==='visible-missing-source')card.image.url='';if(name==='visible-unmapped')card.image.link.unmapped=true;if(name==='visible-wrong-owner')card.image.link.attachmentId='other';if(name==='visible-wrong-source')card.image.source='source-99';if(name==='missing-IPC')rows.length=0;if(name==='duplicate-IPC')rows.push({...rows[0],id:5});if(name==='failed-IPC')rows[0].ok=false;
  if(name==='coherent-offscreen-unmapped')cards.push({...makeCard(),attachmentId:'off',visible:false,image:{...makeCard().image,source:'source-2',link:{unmapped:true}}});
  const env={assert,page:{evaluate:async fn=>{evaluations++;if(fn.toString().includes('.join()'))return structuredClone(cards);if(fn.toString().includes('.snapshot()'))return {cards:structuredClone(cards)};assert(fn.toString().includes('.urls()'));return [...cards.map(c=>({source:c.image.source,url:c.image.url})),...(name==='new-offscreen-after-observation'?[{source:'source-2',url:rawURL+'/off'}]:[])];}},backend:{rows,mediaRows:after?[{id:4,command:'acquire_attachment_source',ok:true,tagged:true,attachmentId:'a',purpose:'thumbnail',capabilitySHA256:'c'.repeat(64)}]:[],mediaForURL:()=>({attachmentId:name==='wrong-grant-owner'?'other':'a',purpose:name==='wrong-grant-purpose'?'original':'thumbnail',capabilitySHA256:'c'.repeat(64)})},args:{side:after?'after':'baseline'},mapping:{attachments:[{id:'a',sha256:'frozen-SHA'}]},sourceLinks:links,record:row=>events.push(row),config:{formalMeasurement:true},output:async()=>{}};
  const rejected=name.startsWith('visible-')||name.endsWith('-IPC')||name.startsWith('wrong-grant');
  if(rejected)await assert.rejects(()=>current(env));else await current(env);
  assert.equal(evaluations,1,'atomic join must use one browser turn');assert.equal(links.size,rejected?0:1);assert.equal(events.some(e=>e.event==='source-association-failure'),rejected);assert(!JSON.stringify(events).includes(rawURL),'capability URL leaked into evidence');
  const diagnostic=events.find(e=>e.event==='source-association-failure')||null;if(diagnostic)assert(Buffer.byteLength(JSON.stringify(diagnostic))<1024,'failure scalar evidence bound');
  results.push({name,rejected,atomicBrowserTurns:1,successfulLinks:links.size,secondObservationWouldAddOffscreen:name==='new-offscreen-after-observation',diagnostic});
 }
 // Run the actual browser-side observer against a tiny DOM double: one root
 // traversal/source read yields a stable tuple, and ordinary samples omit URL.
 let rootTraversals=0,sourceReads=0;let url=rawURL;
 const image={get currentSrc(){sourceReads++;return url;},isConnected:true,complete:false,naturalWidth:64,naturalHeight:64};
 const rect={top:10,bottom:80,left:10,right:80,width:70,height:70},card={dataset:{attachmentId:'a'},getBoundingClientRect:()=>rect,querySelector:s=>s==='img'?image:null};
 const root={scrollTop:0,clientHeight:100,scrollHeight:100,getBoundingClientRect:()=>({top:0,bottom:100,left:0,right:100}),querySelectorAll:()=>{rootTraversals++;return [card];}};
 const window={__MEDIA_PERF__:{phase:'pure-check'},__TAURI_INTERNALS__:{invoke:async()=>({url:rawURL})},atob:value=>value};
 const env={window,document:{addEventListener:()=>{},querySelector:()=>root},URL:{createObjectURL:()=>rawURL},innerWidth:100,innerHeight:100};
 new Function('env',`with(env){(${installCoverage105.toString()})([{id:'a',mime:'image/png'}]);}`)(env);
 await window.__TAURI_INTERNALS__.invoke('acquire_attachment_source',{id:'a',purpose:'thumbnail'});
 const tuples=window.__COVERAGE105__.join();assert.equal(rootTraversals,1);assert.equal(sourceReads,1);assert.equal(tuples[0].image.url,rawURL);assert.equal(tuples[0].image.link.token,tuples[0].image.source);assert.equal(tuples[0].image.link.attachmentId,tuples[0].attachmentId);
 url=rawURL+'/changed';assert.equal(tuples[0].image.url,rawURL);assert(!JSON.stringify(window.__COVERAGE105__.snapshot()).includes(rawURL));
 results.push({name:'exact-observer-one-traversal-one-source-read',rootTraversalsAtJoin:1,sourceReadsAtJoin:1,tupleStableAfterDOMChange:true,ordinarySnapshotURLAbsent:true});
 checks.push({name:'atomic-current-DOM-join-and-strict-failures',ok:true,results});
}
async function nativeVideoChecks(){
 const raw=resolve('artifacts/media105-formal-run2/baseline'),original=JSON.parse(await readFile(resolve(raw,'last-viewport.json'),'utf8')),mapping=JSON.parse(await readFile(resolve('artifacts/media99-fixture/store-map.json'),'utf8'));
 const rows=(await readFile(resolve(raw,'transport.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(r=>r.event==='end');
 const observations=(await readFile(resolve(raw,'coverage.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).flatMap(r=>r.observation?.events||[]),results=[];
 const typed=structuredClone(original);for(const c of typed.cards)c.mime=mapping.attachments.find(a=>a.id===c.attachmentId)?.mime;
 const videos=typed.cards.filter(c=>c.visible&&c.mime?.startsWith('video/'));assert.equal(videos.length,2);assert.equal(typed.cards.filter(c=>c.visible&&c.image&&currentDecoded(c.image)).length,12);
 for(const c of videos){const source=observations.find(e=>e.event==='blob-created'&&e.attachmentId===c.attachmentId);assert(source&&!source.unmapped);const ipc=rows.filter(r=>r.command==='read_attachment'&&r.coverageCall===source.call);assert.equal(ipc.length,1);assert.equal(ipc[0].ok,true);assert.equal(ipc[0].originalBytes,96754277);c.video={domKind:'HTMLVideoElement',node:'video-controlled-'+ipc[0].id,source:source.token,link:source,connected:true,readyState:2,width:640,height:360,duration:96,error:null};}
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,settle=new AsyncFunction('env',`with(env){return await (${settle105.toString()})(page,record);}`);
 // Historical raw did not capture video metadata/currentURL. Only geometry,
 // owner and exact IPC identities are replayed; readiness below is controlled.
 for(const name of ['old-raw-no-video-state','native-current-data','metadata-only','zero-dimensions','wrong-frozen-MIME','wrong-DOM-kind','missing-video','wrong-source','native-error','image-missing','image-error']){
  const snapshot=structuredClone(name==='old-raw-no-video-state'?original:typed),v=snapshot.cards.find(c=>c.attachmentId===videos[0].attachmentId),image=snapshot.cards.find(c=>c.visible&&c.image);let now=0;const recorded=[];
  if(name==='metadata-only')v.video.readyState=1;if(name==='zero-dimensions')v.video.width=0;if(name==='wrong-frozen-MIME')v.mime='image/png';if(name==='wrong-DOM-kind')v.video.domKind='DIV';if(name==='missing-video')v.video=null;if(name==='wrong-source')v.video.source='source-999999';if(name==='native-error')v.video.error=3;if(name==='image-missing')image.image=null;if(name==='image-error')image.image.decode='error';
  const env={performance:{now:()=>now},protocol105,terminal105,page:{evaluate:async fn=>fn.toString().includes('.snapshot()')?snapshot:{events:[],errors:[],dropped:0},waitForTimeout:async n=>{now+=n;}},record:async row=>recorded.push(row)};
  const pass=['native-current-data','image-error'].includes(name);if(pass)await settle(env);else await assert.rejects(()=>settle(env),name==='native-error'?/native video error/:/viewport timeout/);
  if(name==='native-error')assert(recorded.some(r=>r.event==='native-video-error'&&r.video.error===3));
  const ledger=new CoverageLedger105(mapping);ledger.ingest('gallery-cold-first-pass',{event:'sample',snapshot,observation:{events:[]}});assert.equal(ledger.rows.size,500);assert([...ledger.rows.values()].every(r=>r.mime.startsWith('image/')));assert(!videos.some(c=>ledger.rows.has(c.attachmentId)));if(name==='image-error')assert.equal(ledger.coldStatus(ledger.rows.get(image.attachmentId)),'explicit-error');
  results.push({name,settled:pass,wallMs:now,separateNativeError:recorded.some(r=>r.event==='native-video-error'),imageDenominator:ledger.rows.size});
 }
 // Exact observer with controlled HTMLVideoElement nominal type; no browser.
 class NativeVideo{};const video=Object.assign(new NativeVideo(),{currentSrc:'blob:controlled-native',isConnected:true,readyState:2,videoWidth:640,videoHeight:360,duration:96,error:null});
 const rect={top:10,bottom:80,left:10,right:80,width:70,height:70},card={dataset:{attachmentId:'video-id'},getBoundingClientRect:()=>rect,querySelector:s=>s==='video'?video:null},root={scrollTop:0,clientHeight:100,scrollHeight:100,getBoundingClientRect:()=>rect,querySelectorAll:()=>[card]},window={__MEDIA_PERF__:{phase:'controlled'},__TAURI_INTERNALS__:{invoke:async()=>({url:video.currentSrc})},atob:x=>x};
 const env={window,HTMLVideoElement:NativeVideo,document:{addEventListener:()=>{},querySelector:()=>root},URL:{createObjectURL:()=>video.currentSrc},innerWidth:100,innerHeight:100};
 new Function('env',`with(env){(${installCoverage105.toString()})([{id:'video-id',mime:'video/mp4'}]);}`)(env);await window.__TAURI_INTERNALS__.invoke('acquire_attachment_source',{id:'video-id',purpose:'original'});
 const plain=window.__COVERAGE105__.snapshot().cards[0],tuple=window.__COVERAGE105__.join()[0];assert(!JSON.stringify(plain).includes('blob:'));assert.equal(tuple.image,null);assert.equal(tuple.video.url,video.currentSrc);assert(nativeVideoReady105(plain));
 for(const patch of [{connected:false},{source:null},{readyState:1},{duration:null},{duration:Infinity},{error:3},{link:{...plain.video.link,unmapped:true}},{link:{...plain.video.link,attachmentId:'other'}}])assert(!nativeVideoReady105({...plain,video:{...plain.video,...patch}}));
 card.dataset.attachmentId='unknown';window.__COVERAGE105__.snapshot();assert(window.__COVERAGE105__.take().errors.includes('Non-fixture card'));
 card.dataset.attachmentId='video-id';card.querySelector=s=>s==='video'?{}:null;assert.equal(window.__COVERAGE105__.snapshot().cards[0].video,null);
 card.querySelector=s=>s==='video'?video:null;new Function('env',`with(env){(${installCoverage105.toString()})([{id:'video-id',mime:'image/png'}]);}`)(env);assert.equal(window.__COVERAGE105__.snapshot().cards[0].video,null);assert(window.__COVERAGE105__.take().errors.includes('Native video disagrees with frozen MIME'));
 // Replay actual run2 video read owner/call/hash through unmodified strict join.
 const source=await readFile(new URL('./coverage105.mjs',import.meta.url),'utf8'),start=source.indexOf(' const join=async(visibleOnly=false)=>{'),end=source.indexOf(' const accessRecord=async row=>'),join=new AsyncFunction('env',`with(env){${source.slice(start,end)}return await join(true);}`);
 for(const name of ['actual-video-IPC','wrong-IPC-owner','missing-IPC','wrong-frozen-SHA']){
  const cards=videos.map(c=>({...c,video:{...c.video,url:'blob:controlled-'+c.video.source}})),calls=rows.filter(r=>cards.some(c=>c.video.link.call===r.coverageCall)).map(r=>({...r})),links=new Map();if(name==='wrong-IPC-owner')calls[0].attachmentId='other';if(name==='missing-IPC')calls.shift();if(name==='wrong-frozen-SHA')calls[0].returnedSha256='wrong';
  const env={assert,page:{evaluate:async()=>cards},backend:{rows:calls},args:{side:'baseline'},mapping,sourceLinks:links,record:()=>{},config:{formalMeasurement:true},output:async()=>{}};
  if(name==='actual-video-IPC')await join(env);else await assert.rejects(()=>join(env));results.push({name,strictJoinPassed:name==='actual-video-IPC',linkedSources:links.size});
 }
 checks.push({name:'frozen-native-video-barrier-and-real-run2-IPC',ok:true,scope:'Pure controlled media state; actual frozen14-card geometry and IPC526/527 identities; historical native readiness was not captured',results});
}
//Execute the exact current finally body with deterministic failing resource/IO
//doubles. This tests real teardown control flow, not browser/media substitutes.
async function cleanupBoundaryChecks(){
 const source=await readFile(new URL('./coverage105.mjs',import.meta.url),'utf8');
 const marker=' finally{',start=source.lastIndexOf(marker)+marker.length,end=source.lastIndexOf('\n }\n}');
 assert(start>marker.length&&end>start,'105 cleanup extraction boundary');
 const record=source.split('\n').find(line=>line.startsWith(' const record=row=>'));assert(record);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const execute=new AsyncFunction('env',`with(env){${record}\n${source.slice(start,end)}}`);
 const kinds=['wall-limit','record-write-failure','last-viewport-write-failure','snapshot-failure','context','browser','browserServer','socket','serverConnections','server','backend','all-evidence-writes','configuration-write-failure','result-write-failure'];
 const results=[];
 for(const kind of kinds){
  const calls=[],failures=['original failure'],stderr=[],testProcess={exitCode:0};
  const call=name=>{calls.push(name);if(kind===name)throw Error('controlled '+name+' failure');};
  const closer=name=>({close:async()=>call(name)});
  const identity={role:'controlled'},backend={...closer('backend'),rows:[]};
  const env={formalData:null,logBytes:0,Buffer,captureTasks:new Set(),sourceLinks:new Map(),svgCaptures:[],memory:[],config:{startedAt:new Date(Date.now()-(kind==='wall-limit'?46*60000:0)).toISOString(),chrome:{path:'controlled'}},protocol105,
   appendFileSync:()=>{if(kind==='record-write-failure'||kind==='all-evidence-writes')throw Error('ENOSPC controlled record');},resolve:(...x)=>x.join('/'),out:'owned',args:{side:'after'},phase:'controlled',clearInterval:()=>{},timer:null,sampling:false,
   page:{evaluate:async()=>{calls.push('page-evaluate');if(kind==='snapshot-failure')throw Error('controlled snapshot failure');return {}; }},pageSnapshot:()=>{},
   output:async(name,value)=>{calls.push('output:'+name);if(kind==='all-evidence-writes'||kind==='last-viewport-write-failure'&&name==='last-viewport.json'||kind==='configuration-write-failure'&&name==='configuration.json'||kind==='result-write-failure'&&name==='result.json')throw Error('ENOSPC controlled '+name);if(name==='result.json')assert.equal(value.failures[0],'original failure');},
   context:closer('context'),browser:closer('browser'),browserServer:closer('browserServer'),sockets:new Set([{destroy:()=>call('socket')},{destroy:()=>call('socket2')}]),server:{close(done){call('server');done();},closeAllConnections:()=>call('serverConnections')},backend,failures,
   console:{error:value=>stderr.push(value),log:()=>calls.push('summary')},verifyFrozenFixture:async()=>({}),fixture:'controlled',verifyChrome105:async()=>{},identity105:async()=>identity,identity,root:'controlled',build:{},frontend:'controlled',tools:{},mapping:{attachments:[]},sourceIdentity:()=>({sourceFingerprint:after105.fingerprint}),after105,free:async()=>10*1024**3,groupsResult:[{},{},{}],network:[],pageErrors:[],process:testProcess,assert};
  await execute(env);
  for(const resource of ['context','browser','browserServer','socket','socket2','serverConnections','server','backend'])assert(calls.includes(resource),kind+' skipped '+resource);
  assert(calls.includes('output:result.json'),kind+' skipped best-effort result');assert(calls.includes('summary'),kind+' skipped summary');assert.equal(failures[0],'original failure');assert(failures.length>1,kind+' suppressed controlled failure');assert(stderr.length>0,kind+' omitted stderr');assert.equal(testProcess.exitCode,1);
  results.push({kind,calls,originalFailurePreserved:true,cleanupAllAttempted:true,bestEffortResultAttempted:true,stderrFailures:stderr.length,exitCode:testProcess.exitCode});
 }
 return {method:'Exact source-extracted record and entire finally body, controlled failing IO/resource doubles; no browser/Rust/device',results};
}
if(args.cleanup==='only'){const result=await cleanupBoundaryChecks();if(args.output)await writeFile(resolve(args.output),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}
else if(args.unit==='only'){await supplementPathChecks();await atomicJoinChecks();await nativeVideoChecks();console.log(JSON.stringify({checks},null,2));}
else {
 assert(args.fixture&&args['after-build']&&args['after-frontend']&&args.output,'Usage: --fixture DIR --after-build DIR --after-frontend DIR --output FRESH [--source ROOT] or --unit only');
 const root=resolve(args.source||'.'),out=resolve(args.output);await mkdir(out,{recursive:false});
 for(const side of ['baseline','after']){
  const cmd=[resolve(root,'scripts/performance/run-media.mjs'),'--mode',args.geometry==='only'?'coverage105-geometry':'coverage105-smoke','--side',side,'--source',root,'--fixture',resolve(args.fixture),'--build',side==='baseline'?resolve(root,'artifacts/media99-baseline-harness'):resolve(args['after-build']),'--frontend',side==='baseline'?resolve(root,'artifacts/media99-baseline-run1/frontend'):resolve(args['after-frontend']),'--output',resolve(out,side)];
  for(const key of ['chrome','playwright','roi-build'])if(args[key])cmd.push('--'+key,args[key]);
  const child=spawn(process.execPath,cmd,{stdio:'inherit'});console.log(JSON.stringify({side,liveRunnerPID:child.pid,output:resolve(out,side)}));
  const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});assert.equal(code,0,side+' actual App validation failed');
  const result=JSON.parse(await readFile(resolve(out,side,'result.json'),'utf8'));assert.equal(result.formalMeasurement,false);assert.equal(result.groups.length,3);if(args.geometry==='only')assert(result.groups.every(g=>g.maxScrollTop>0),'105 geometry must actually move');assert.deepEqual(result.failures,[]);assert.deepEqual(result.pageErrors,[]);
  checks.push({name:side+'-actual-App-PNG-JPEG-textSVG',ok:true,groups:result.groups.map(g=>({title:g.title,indices:g.indices,settledSteps:g.settledSteps}))});
 }
 await writeFile(resolve(out,'checks.json'),JSON.stringify({formalMeasurement:false,checks},null,2)+'\n');console.log(JSON.stringify({output:out,checks},null,2));
}
