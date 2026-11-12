//105 tools only: two immutable identity roles, same real-App access barrier.
//No product queue hooks, media IO substitutes, URL assignment, or formal gate.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,statfs,readdir,realpath,stat} from 'node:fs/promises';
import {appendFileSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {sourceIdentity} from '../build-info.mjs';
import {validateProvider,verifyFrozenFixture,acceptedCandidate} from './media-candidate.mjs';
import {prepareMeasurementStore} from './prepare-store.mjs';
import {tracedTransport} from './trace-transport.mjs';
import {realMediaTransport,rendererCommandAllowed} from './media-trace.mjs';
import {validateMediaMetrics,mediaMetricsDelta} from './media-metrics.mjs';
import {CoverageLedger105,phaseSummary105,formalPhases105,terminal105} from './coverage105-formal.mjs';
import {installPerformancePlatform,pageSnapshot} from './browser-probes.mjs';
export const after105=Object.freeze({revision:'bf26dae17f972fc09276deb456b4599e1ebe5d67',fingerprint:'a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9',inputCount:445,sourceDirty:true});
export const baseline105=Object.freeze({binary:'artifacts/media99-baseline-harness/current-transport',binarySHA256:'f2ccb77a82fbe3986f956b368d0a41fe5a09e9e9118c912c676367422a44a6cf',frontend:'artifacts/media99-baseline-run1/frontend',revision:'84f2c896a4bfb6a4e3d48a8d51aff7a2471dbfa3',fingerprint:'2f77b076c00cc67416d7cdcbad08d85e2e4dded3cee056d987a9c001b3d687d2',inputCount:372,sourceDirty:true});
export const frontendPins={
 'assets/index-DZMIUHbb.js':'57192e78a3beda5da45d27c12c7c3f7992347cc363b8fd825a8c037619505f05',
 'assets/index-KKkYOzJz.css':'f9a37a9dcc5a221ad95d5b4f1696809f464ed5b4e8b66992a2ac1d77c1f71cbd',
 'assets/native-recording-access-CFEbIwSC.js':'5df87a4fae2aa88d67cd586444022e23574cd24f4b7358392c5741e0dfe8ca57',
 'assets/runtime-5LFG0ObK.js':'8a84e5d5bc5d91c92350ef4d63cfa3f5a291149ce68e38c2ba3f9af558330fe7',
 'cybernote.svg':'64ced2fa3d9f18adcc1bb20b2f53c371f0791facf08c3acfaebc6e89bba0ff8f',
 'index.html':'87241d8be01dff3f936b10b34af94d2babcd7bb6d7b463d6c14614b4d7d548e5',
 'source.json':'af9ad88ef52d35d33efe88780db54de4e810c136f7b9a7a8aef21afac7550ed1',
 'startup.css':'2deaeeb5a19519a39731cbfbd3b1d53f9a4eb829307bb70cb21088e8e1f473b7',
 'startup.js':'ed5c34bf3f142f9619e680059c4c5fa95c07a4b41eaf9871a757e784e0881ff9'
};
export const chrome105=Object.freeze({version:'157.0.8103.40',executable:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',executableSHA256:'e363cda287a8dd81a8934e6aaae74e941f85c9bd0d2110a5f2a67b2741922923',framework:'/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/157.0.8103.40/Google Chrome Framework',frameworkSHA256:'45f8ebf07ada22b83fcde1fa63c5da79a7c5b7ebdcc0b0250f78eff5c0f8f2a3'});
async function verifyChrome105(path){assert.equal(await realpath(path),await realpath(chrome105.executable));assert.equal(sha(await readFile(path)),chrome105.executableSHA256);const h=createHash('sha256');for await(const b of createReadStream(chrome105.framework))h.update(b);assert.equal(h.digest('hex'),chrome105.frameworkSHA256);return chrome105;}
export const protocol105=Object.freeze({sampleMs:100,dwellMs:500,viewportDeadlineMs:30000,maxStepRatio:.5,wallMs:45*60000,startFreeBytes:5*1024**3,stopFreeBytes:2.5*1024**3,continuousVisibility:false,maxCoverageLogBytes:64*1024**2,maxRawLogBytes:96*1024**2,maxSvgResponseBytes:32*1024**2});
const sha=b=>createHash('sha256').update(b).digest('hex');
export function assertAfter105(source){assert.equal(source.sourceFingerprint,after105.fingerprint,'105 unaccepted product fingerprint');assert.equal(source.inputCount,after105.inputCount,'105 unaccepted product inputs');}
export function assertBaselineInventory(value){assert.deepEqual(value,frontendPins,'105 baseline frontend exact inventory');}
export function currentDecoded(row){return row.connected&&row.complete&&row.width>0&&row.decode==='resolved'&&row.decodeSource===row.source&&row.frames===2;}
async function inventory(dir,prefix=''){const out={};for(const e of await readdir(resolve(dir,prefix),{withFileTypes:true})){const name=prefix+e.name;if(e.isDirectory())Object.assign(out,await inventory(dir,name+'/'));else {assert(e.isFile(),'Unexpected non-file frontend input');out[name]=sha(await readFile(resolve(dir,name)));}}return out;}
export async function identity105(root,side,build,frontend){
 assert(['baseline','after'].includes(side),'105 requires fixed --side baseline|after');
 const current=sourceIdentity(root);assertAfter105(current);execFileSync('git',['merge-base','--is-ancestor',after105.revision,'HEAD'],{cwd:root});
 if(side==='baseline'){
  assert.equal(await realpath(build.transport.path),await realpath(resolve(root,baseline105.binary)),'105 baseline binary path');
  assert.equal(sha(await readFile(build.transport.path)),baseline105.binarySHA256);assert.equal(build.transport.sha256,baseline105.binarySHA256);
  assert.equal(build.sourceHead,baseline105.revision);assert.equal(await realpath(frontend),await realpath(resolve(root,baseline105.frontend)),'105 fixed baseline frontend path');assertBaselineInventory(await inventory(frontend));
  const s=JSON.parse(await readFile(resolve(frontend,'source.json'),'utf8')).source;
  assert.equal(s.sourceFingerprint,baseline105.fingerprint);assert.equal(s.sourceRevision,baseline105.revision);assert.equal(s.inputCount,372);assert.equal(s.sourceDirty,true);
  return {role:'baseline-artifact',product:s,binarySHA256:baseline105.binarySHA256,frontend:frontendPins,toolHostSource:current,limitation:'Retained actual baseline accepted99P; historical dirty full tree unavailable; frontend identity metadata recovered from original run, no pristine historical per-asset manifest.'};
 }
 await validateProvider(root,build);
 for(const[p,h]of Object.entries(build.sources))assert.equal(sha(await readFile(resolve(root,p))),h,'105 stale transport input '+p);
 assert.equal(sha(await readFile(build.transport.path)),build.transport.sha256);
 assert.equal(build.fontReference?.copy,false);assert.equal(build.fontReference?.sha256,'2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b');
 assert.equal(await realpath(build.fontReference.path),await realpath(resolve(root,'src-tauri/fonts')));
 const s=JSON.parse(await readFile(resolve(frontend,'source.json'),'utf8')).source;assertAfter105(s);
 return {role:'after-source',accepted:after105,product:current,frontend:await inventory(frontend),binarySHA256:build.transport.sha256,font:build.fontReference};
}

//Installed after the existing transparent platform shim and before product code.
export function installCoverage105(attachments){
 const c=window.__COVERAGE105__={events:[],dropped:0,errors:[],costMs:0,samples:0};
 const known=new Map(attachments.map(a=>[a.id,a.mime])),cardIds=new WeakMap(),imageIds=new WeakMap(),states=new WeakMap(),sources=new Map();let seq=0,callSeq=0,activeRead,decodedRead;
 const emit=row=>{if(c.events.length>=12000){c.dropped++;return;}c.events.push({at:performance.now(),phase:window.__MEDIA_PERF__.phase,...row});};
 const sourceFor=url=>{if(!url)return null;let s=sources.get(url);if(!s){s={token:'source-'+ ++seq,unmapped:true};sources.set(url,s);}return s;};
 //The data getter and atob arm exist only for the same synchronous product turn.
 //No Base64 copy/hash or algorithm replacement. Only the actual object URL
 //created after consuming this exact returned data can claim that read identity.
 const invoke=window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
 window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
  const call=++callSeq;c.invocation=call;const pending=invoke(command,args);c.invocation=undefined;const value=await pending;
  if(command==='read_attachment'&&typeof value?.data==='string'){
   const data=value.data,identity={attachmentId:args.id,call,kind:'original-blob',bytes:data.length/4*3-(data.endsWith('==')?2:data.endsWith('=')?1:0)};
   Object.defineProperty(value,'data',{enumerable:true,configurable:true,get(){const armed={data,identity};activeRead=armed;queueMicrotask(()=>{if(activeRead===armed)activeRead=undefined;});return data;}});
   emit({event:'read-return',...identity});
  }
  if(command==='acquire_attachment_source'&&value?.url){const prior=sources.get(value.url);if(prior&&!prior.unmapped)c.errors.push('Duplicate capability association');sources.set(value.url,{token:prior?.token||'source-'+ ++seq,attachmentId:args.id,call,purpose:args.purpose,kind:'lease',unmapped:false});emit({event:'grant-return',...sources.get(value.url)});}
  return value;
 };
 const atobNative=window.atob.bind(window);window.atob=value=>{const result=atobNative(value);if(activeRead?.data===value){const arm={...activeRead.identity};decodedRead=arm;queueMicrotask(()=>{if(decodedRead===arm)decodedRead=undefined;});}return result;};
 const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);const read=decodedRead;decodedRead=undefined;const prior=sources.get(url);if(prior)c.errors.push('Duplicate Blob URL');const valid=read&&blob.size===read.bytes;sources.set(url,{token:'source-'+ ++seq,...(valid?read:{}),unmapped:!valid});emit({event:'blob-created',...sources.get(url),bytes:blob.size});return url;};
 const mount=card=>{if(!cardIds.has(card))cardIds.set(card,'mount-'+ ++seq);return cardIds.get(card);};
 function state(img){
  if(!imageIds.has(img))imageIds.set(img,'image-'+ ++seq);
  const url=img.currentSrc||img.getAttribute('src')||'';let s=states.get(img);
  if(!s||s.url!==url){s={url,source:sourceFor(url)?.token||null,decode:'pending',frames:0};states.set(img,s);}
  return s;
 }
 for(const event of ['load','error'])document.addEventListener(event,e=>{const img=e.target,card=img instanceof HTMLImageElement?img.closest('.attachment-gallery-card'):null;if(!card)return;const id=card.dataset.attachmentId,s=state(img);emit({event,attachmentId:id,mount:mount(card),image:imageIds.get(img),source:s.source,complete:img.complete,width:img.naturalWidth,height:img.naturalHeight});if(event==='error')s.decode='error';},true);
 c.snapshot=joinCards=>{
  const started=performance.now(),root=document.querySelector('.attachment-gallery-scroll');if(!root)return {cards:[],geometry:null};
  const rr=root.getBoundingClientRect(),box={top:Math.max(0,rr.top),bottom:Math.min(innerHeight,rr.bottom),left:Math.max(0,rr.left),right:Math.min(innerWidth,rr.right)};
  const cards=[...root.querySelectorAll('.attachment-gallery-card')].map(card=>{
   const id=card.dataset.attachmentId,mime=known.get(id);if(!mime)c.errors.push('Non-fixture card');else if(!/^(image|video)\//.test(mime))c.errors.push('Unknown gallery MIME');const r=card.getBoundingClientRect(),visible=r.width>0&&r.height>0&&r.bottom>box.top&&r.top<box.bottom&&r.right>box.left&&r.left<box.right;
   const img=card.querySelector('img'),s=img?state(img):null,link=s?sourceFor(s.url):null;
   const element=card.querySelector('video'),nativeVideo=mime?.startsWith('video/')&&element instanceof HTMLVideoElement?element:null,vs=nativeVideo?state(nativeVideo):null;
   if(element&&!mime?.startsWith('video/'))c.errors.push('Native video disagrees with frozen MIME');
   if(img&&visible&&img.complete&&img.naturalWidth>0&&s.decode==='pending'){
    if(typeof img.decode!=='function'){c.errors.push('img.decode unavailable');}
    else {s.decode='running';const began=performance.now(),url=s.url;img.decode().then(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);if(!img.isConnected||(img.currentSrc||img.getAttribute('src')||'')!==url||states.get(img)!==s){emit({event:'decode-stale',attachmentId:id,source:s.source});return;}s.decode='resolved';s.frames=2;s.decodeSource=s.source;emit({event:'decode-resolved',attachmentId:id,mount:mount(card),image:imageIds.get(img),source:s.source,elapsedMs:performance.now()-began});},()=>{s.decode='rejected';emit({event:'decode-rejected',attachmentId:id,source:s.source});});}
   }
   const result={attachmentId:id,mime,mount:mount(card),rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height},visible,prefetch:r.bottom>box.top-120&&r.top<box.bottom+120&&r.right>box.left&&r.left<box.right,productError:card.querySelector('.gallery-load-error')?.textContent||null,image:img?{node:imageIds.get(img),source:s.source,link,connected:img.isConnected,complete:img.complete,width:img.naturalWidth,height:img.naturalHeight,decode:s.decode,decodeSource:s.decodeSource||null,frames:s.frames}:null,video:nativeVideo?{domKind:'HTMLVideoElement',node:imageIds.get(nativeVideo),source:vs.source,link:sourceFor(vs.url),connected:nativeVideo.isConnected,readyState:nativeVideo.readyState,width:nativeVideo.videoWidth,height:nativeVideo.videoHeight,duration:Number.isFinite(nativeVideo.duration)?nativeVideo.duration:null,error:nativeVideo.error?.code??null}:null};
   // The URL and owner/mount/source/visibility all come from this same card
   // traversal and source read. Ephemeral join tuples never enter raw samples.
   if(joinCards&&(img||nativeVideo))joinCards.push({...result,...(img?{image:{...result.image,url:s.url}}:{video:{...result.video,url:vs.url}})});
   return result;
  });
  c.samples++;c.costMs+=performance.now()-started;return {at:performance.now(),cards,geometry:{scrollTop:root.scrollTop,clientHeight:root.clientHeight,scrollHeight:root.scrollHeight,box}};
 };
 //Only a current DOM source is exposed to Node, where its token is joined to
 //real transport SHA, then discarded. Never serialize raw capability URLs.
 c.join=()=>{const cards=[];c.snapshot(cards);return cards;};
 c.take=()=>({events:c.events.splice(0),dropped:c.dropped,errors:[...c.errors],costMs:c.costMs,samples:c.samples});
}

export async function settle105(page,record){
 const began=performance.now(),seen=new Map();let last;
 while(performance.now()-began<protocol105.viewportDeadlineMs){
  last=await page.evaluate(()=>window.__COVERAGE105__.snapshot());
  const observation=await page.evaluate(()=>window.__COVERAGE105__.take());await record({event:'sample',snapshot:last,observation});
  if(observation.dropped||observation.errors.length)throw Error('105 observer lost/invalid association: '+JSON.stringify(observation));
  const current=last.cards.filter(x=>x.visible);
  for(const card of current){seen.set(card.attachmentId,card);const source=card.image||card.video;if(source?.link?.unmapped)throw Error('105 unmapped current source '+card.attachmentId);if(source?.link?.attachmentId&&source.link.attachmentId!==card.attachmentId)throw Error('105 source/card owner mismatch');if(card.video?.error!=null){await record({event:'native-video-error',attachmentId:card.attachmentId,mime:card.mime,mount:card.mount,video:card.video});const error=Error('105 native video error '+card.attachmentId);error.viewport=last;throw error;}}
  if(performance.now()-began>=protocol105.dwellMs&&current.length&&current.every(terminal105))return {wallMs:performance.now()-began,cards:[...seen.values()],snapshot:last};
  await page.waitForTimeout(protocol105.sampleMs);
 }
 const error=Error('105 viewport timeout; no retry/scroll fallback');error.viewport=last;throw error;
}
export async function scroll105(page,record,{maxSteps,retainSnapshots=true,onStep,targetIds,returnToTop=false}={}){
 assert(!(targetIds&&returnToTop),'105 incompatible target and warm-position route');
 if(targetIds){assert.equal(new Set(targetIds).size,targetIds.length,'105 duplicate supplement target');if(!targetIds.length)return [];}
 const first=await page.locator('.attachment-gallery-scroll').evaluate(el=>({h:el.clientHeight,height:el.scrollHeight}));
 const limit=Math.ceil(Math.max(0,first.height-first.h)/Math.max(1,Math.floor(first.h*.5)))*4+20;
 let steps=0,targetIndex=0;const results=[];
 for(const passDirection of targetIds?[null]:returnToTop?[-1]:[1,-1]){
  while(true){
   if(++steps>Math.min(limit,maxSteps??limit))throw Error('105 scroll bound exceeded');
   const result=await settle105(page,record);if(onStep)await onStep(result);results.push(retainSnapshots?result:{wallMs:result.wallMs,geometry:result.snapshot.geometry});
   let direction=passDirection;
   if(targetIds){
    // Audit only frozen never-visited targets, in DOM order. Old cards on the
    // continuous route still receive the unchanged current-source barrier.
    while(targetIndex<targetIds.length){const target=result.snapshot.cards.find(c=>c.attachmentId===targetIds[targetIndex]);assert(target,'105 supplement target missing from DOM');if(!target.visible)break;assert(terminal105(target),'105 supplement target not terminal');targetIndex++;}
    if(targetIndex===targetIds.length)return results;
    const target=result.snapshot.cards.find(c=>c.attachmentId===targetIds[targetIndex]),box=result.snapshot.geometry.box;
    assert(target,'105 supplement target missing from DOM');direction=target.rect.top>=box.bottom?1:target.rect.bottom<=box.top?-1:0;
    assert(direction,'105 supplement target unreachable in viewport');
   }
   const motionStart=performance.now();
   const moved=await page.locator('.attachment-gallery-scroll').evaluate(async(el,direction)=>{const before=el.scrollTop,max=el.scrollHeight-el.clientHeight,end=direction>0?max:0;if(Math.abs(before-end)<1)return {done:true,before,after:before};el.scrollTop=Math.max(0,Math.min(max,before+direction*Math.max(1,Math.floor(el.clientHeight*.5))));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return {done:false,before,after:el.scrollTop,h:el.clientHeight};},direction);
   await record({event:'scroll',motionMs:performance.now()-motionStart,...moved});if(moved.done){assert(!targetIds,'105 supplement target unreachable at scroll boundary');break;}if(moved.after===moved.before)throw Error('105 stuck scroll');assert(Math.abs(moved.after-moved.before)<=Math.floor(moved.h*.5)+1,'105 step exceeded half viewport');
  }
 }
 return results;
}

export async function runCoverage105(args){
 assert(['coverage105-smoke','coverage105-geometry','coverage105-formal'].includes(args.mode),'Unknown fixed105 workflow');
 const formal=args.mode==='coverage105-formal',geometry=args.mode==='coverage105-geometry';
 assert(['baseline','after'].includes(args.side));assert(args.fixture&&args.build&&args.output&&args.frontend,'105 requires fixture/build/output/frontend');
 const root=resolve(args.source||'.'),fixture=resolve(args.fixture),out=resolve(args.output),frontend=resolve(args.frontend),build=JSON.parse(await readFile(resolve(args.build,'performance-build.json'),'utf8'));
 const chromePin=await verifyChrome105(args.chrome||process.env.CHROME_PATH||chrome105.executable);
 const identity=await identity105(root,args.side,build,frontend),fixtureBefore=await verifyFrozenFixture(fixture);
 await mkdir(out,{recursive:false});const output=(name,v)=>writeFile(resolve(out,name),JSON.stringify(v,null,2)+'\n'),free=async()=>{const x=await statfs(out);return x.bavail*x.bsize;};assert(await free()>=protocol105.startFreeBytes,'105 starts below5GiB');
 const mapping=JSON.parse(await readFile(resolve(fixture,'store-map.json'),'utf8')),manifest=JSON.parse(await readFile(resolve(fixture,'manifest.json'),'utf8'));
 const ledger=new CoverageLedger105(mapping),memory=[],phases=[],captureTasks=new Set(),svgCaptures=[],captureKeys=new Set();let logBytes=0;let formalData=null;
 const groups=[0,20,90].map(index=>{const note=mapping.notes.find(n=>n.title===`MEDIA99 images ${String(index).padStart(3,'0')}`);assert(note);return note;});
 const store=await prepareMeasurementStore(fixture,resolve(out,'store'));assert.equal(store.sqliteSha256,acceptedCandidate.fixtureSQLiteSHA256);
 const tools={};for(const file of ['coverage105.mjs','check-coverage105.mjs','run-media.mjs','build-media-harness.mjs','browser-probes.mjs','trace-transport.mjs','media-trace.mjs','media-candidate.mjs','media-metrics.mjs','prepare-store.mjs','coverage105-formal.mjs','roi105.mjs','roi105.rs'])tools[file]=sha(await readFile(resolve(root,'scripts/performance',file)));
 const config={chromePin,historicalChrome:'99P/99M used156.0.8078.80; this new105 pair pins157, not a same-browser rerun of historical raw',mode:args.mode,side:args.side,identity,tools,protocol:protocol105,fixtureBefore,store,viewport:{width:1440,height:geometry?420:1000},groups,startedAt:new Date().toISOString(),formalMeasurement:formal,geometryOnly:geometry,scope:formal?'Fixed105 actual Chrome App+production Rust paired protocol; not native package/device':'Representative/geometry actual App+production Rust; not500paired',coldDefinition:'Fresh owned Chrome context/process+Rust+empty owned derivative cache; OS cache not evicted; identical fixture hashing may warm OS pages. Startup naturally cached thumbnails remain counted in startup.',visibility:'100ms snapshots, sampled intervals only, not continuous exact visibility',metrics:'HTTP source-read purpose counters; logical generation input is not decoder physical IO; baseline unsupported runtime counters=null'};
 await output('configuration.json',config);
 let backend,server,browserServer,browser,context,page,cdp,timer,phase='setup',sampling=false;const failures=[],pageErrors=[],groupsResult=[],network=[],resources=new Map(),sockets=new Set(),sourceLinks=new Map();let chromePID;
 const record=row=>{if(Date.now()-Date.parse(config.startedAt)>protocol105.wallMs)throw Error('105 wall limit');if(row.event==='memory')memory.push({phase,...row});if(config.formalMeasurement&&row.event==='scroll')ledger.motion(phase,row);for(const item of config.formalMeasurement?ledger.ingest(phase,row):[row]){const line=JSON.stringify({side:args.side,phase,...item})+'\n';logBytes+=Buffer.byteLength(line);if(logBytes>protocol105.maxCoverageLogBytes)throw Error('105 coverage log byte budget');appendFileSync(resolve(out,'coverage.jsonl'),line);}};
 const runtime=async()=>{if(args.side==='baseline')return null;const r=await backend.call('perf_metrics');assert(r.ok,'105 metrics failed');const value=validateMediaMetrics(r.value);assert(value.peakReadBlock<=65536,'105 native HTTP read block exceeded64KiB');return value;};
 const sample=async()=>{if(sampling||!cdp)return;sampling=true;try{const m=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));const rows=execFileSync('ps',['-axo','pid=,ppid=,rss=,command='],{encoding:'utf8'}).split('\n').map(l=>/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean);const pids=new Set([chromePID]);for(let i=0;i<6;i++)for(const r of rows)if(pids.has(+r[2]))pids.add(+r[1]);const freeBytes=await free();const rawLogBytes=(await Promise.all(['coverage.jsonl','media.jsonl','media.jsonl.ipc','transport.jsonl'].map(name=>stat(resolve(out,name)).then(s=>s.size).catch(()=>0)))).reduce((n,x)=>n+x,0);if(rawLogBytes>protocol105.maxRawLogBytes)throw Error('105 raw log budget');record({event:'memory',jsHeapUsed:m.JSHeapUsedSize,nodeBridge:process.memoryUsage(),rawLogBytes,rustRSS:rows.find(r=>+r[1]===backend.pid)?.[3]*1024||null,chromeRendererRSS:rows.filter(r=>pids.has(+r[1])&&r[4].includes('--type=renderer')).reduce((n,r)=>n+Number(r[3])*1024,0),freeBytes});if(freeBytes<protocol105.stopFreeBytes)failures.push('105 low disk');}catch(e){failures.push('sample: '+e.message);}finally{sampling=false;}};
 const join=async(visibleOnly=false)=>{
  const cards=await page.evaluate(()=>window.__COVERAGE105__.join());
  for(const card of cards){
   if(visibleOnly&&!card.visible)continue;
   const image=card.image||card.video,link=image?.link;let check='current-source';
   try{
    if(!card.visible&&!image?.url)continue;
    assert(image?.connected&&image.url&&image.source,'105 current visible source missing');assert(/^source-\d+$/.test(image.source),'105 invalid local source token');assert(link&&!link.unmapped,'105 unmapped source');assert(/^source-\d+$/.test(link.token),'105 invalid local link token');
    check='source-owner';assert.equal(link.token,image.source,'105 current source/link mismatch');assert.equal(link.attachmentId,card.attachmentId,'105 current source owner mismatch');
    check='actual-IPC';const calls=backend.rows.filter(row=>row.coverageCall===link.call&&row.command===(args.side==='after'?'acquire_attachment_source':'read_attachment'));assert.equal(calls.length,1,'105 source must have exactly one actual IPC');assert.equal(calls[0].ok,true);
    let receipt;
    if(args.side==='after'){
     // The trace owns call identity; the wrapper owns the validated tagged
     // acquire receipt. Both allocate their ID at this same forwarded call.
     check='actual-media-receipt';const receipts=backend.mediaRows.filter(row=>row.id===calls[0].id);assert.equal(receipts.length,1,'105 IPC must have exactly one media receipt');receipt=receipts[0];assert(receipt.command===calls[0].command&&receipt.ok===true&&receipt.tagged===true,'105 media receipt not successful/tagged');assert.equal(receipt.attachmentId,card.attachmentId,'105 media receipt owner mismatch');assert(['thumbnail','original'].includes(receipt.purpose)&&receipt.purpose===link.purpose,'105 media receipt purpose mismatch');assert(/^[a-f0-9]{64}$/.test(receipt.capabilitySHA256),'105 media receipt capability digest missing');
    }else assert.equal(calls[0].attachmentId,card.attachmentId,'105 IPC owner mismatch');
    check='actual-grant';const found=args.side==='after'?backend.mediaForURL(image.url):null;if(args.side==='after'){assert(found&&found.attachmentId===card.attachmentId,'105 DOM URL lacks real grant');assert.equal(found.purpose,link.purpose,'105 grant purpose mismatch');assert.equal(found.capabilitySHA256,receipt.capabilitySHA256,'105 grant does not belong to exact media receipt');}
    else assert.equal(calls[0].returnedSha256,mapping.attachments.find(a=>a.id===card.attachmentId)?.sha256,'105 Blob IPC is not frozen original');
    const existing=sourceLinks.has(image.source);sourceLinks.set(image.source,{source:image.source,attachmentId:card.attachmentId,coverageCall:link.call,realIPC:calls[0].id,...(found||{kind:'original-blob',originalSHA256:calls[0].returnedSha256,http:null})});if(!existing)record({event:'source-link',...sourceLinks.get(image.source)});
   }catch(error){
    const local=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)?value:null;
    try{record({event:'source-association-failure',check,attachmentId:local(card.attachmentId),mount:local(card.mount),source:local(image?.source),image:local(image?.node),visible:!!card.visible,prefetch:!!card.prefetch,linkOwner:local(link?.attachmentId),linkSource:local(link?.token),coverageCall:Number.isSafeInteger(link?.call)?link.call:null});}catch{}
    throw error;
   }
  }
  if(!config.formalMeasurement)await output('source-links.json',[...sourceLinks.values()]);
 };
 const accessRecord=async row=>{if(failures.length||pageErrors.length)throw Error('105 external failure');record(row);};
 const begin=async(name,ready=true)=>{phase=name;if(ready)await page.evaluate(name=>window.__MEDIA_PERF__.phase=name,name);phases.push({name,start:Date.now(),runtimeStart:await runtime()});await sample();};
 const end=async()=>{const current=phases.at(-1);current.runtimeEnd=await runtime();current.runtimeDelta=current.runtimeStart?mediaMetricsDelta(current.runtimeStart,current.runtimeEnd):null;await sample();current.snapshot=await page.evaluate(pageSnapshot);current.end=Date.now();current.summary=phaseSummary105(current,current.snapshot,memory,backend.rows,network,ledger.phaseStats[phase]);await output('phases.json',phases.map(p=>p.summary||{name:p.name,start:p.start}));};
 try{
  server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://127.0.0.1').pathname;if(path==='/__debug_ipc'){let body='';for await(const bytes of req){body+=bytes;if(body.length>4*1024*1024)throw Error('105 request limit');}const input=JSON.parse(body);if(!rendererCommandAllowed(input.command))throw Error('Host-only105 command');const value=await backend.call(input.command,input.args,input.observation);res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return;}const file=resolve(frontend,'.'+(path==='/'?'/index.html':path));assert(file.startsWith(frontend+'/'));res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream'));res.end(await readFile(file));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
  backend=args.side==='after'?await realMediaTransport(build.transport.path,store.directory,resolve(out,'media.jsonl'),origin):await tracedTransport(build.transport.path,store.directory,resolve(out,'transport.jsonl'));
  config.hostPID=backend.pid;console.log(JSON.stringify({side:args.side,liveHostPID:backend.pid,output:out}));
  const initial=await backend.call('load_workspace');assert(initial.ok);const reset=await backend.call('workspace_action',{action:{type:'settings',settings:{theme:'light',view:'list',groupDates:false,sort:'updated',selectedFolder:'default',selectedNote:groups[0].id}},expected:{sessionId:initial.value.access.sessionId,epoch:initial.value.access.epoch}});assert(reset.ok,'105 owned settings reset');
  const {chromium}=await import(pathToFileURL(args.playwright||process.env.PLAYWRIGHT_CORE_PATH||'/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs'));
  browserServer=await chromium.launchServer({executablePath:args.chrome||process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,host:'127.0.0.1',args:['--autoplay-policy=no-user-gesture-required','--mute-audio','--disable-background-timer-throttling']});chromePID=browserServer.process().pid;config.chromePID=chromePID;console.log(JSON.stringify({side:args.side,liveChromePID:chromePID,output:out}));
  browser=await chromium.connect(browserServer.wsEndpoint());assert.equal(browser.version(),chrome105.version,'105 actual Chrome differs105 pair pin');config.chrome={version:browser.version(),path:args.chrome||process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'};
  context=await browser.newContext({viewport:config.viewport,deviceScaleFactor:1});page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['blob:','data:'].includes(u.protocol)?route.continue():route.abort();});
  const platform=installPerformancePlatform.toString().replace('const observation={phase:p.phase','const observation={coverageCall:window.__COVERAGE105__?.invocation,phase:p.phase').replace("command==='read_attachment'?visibility(args.id):undefined","['read_attachment','acquire_attachment_source'].includes(command)?visibility(args.id):undefined");
  await page.addInitScript({content:`(${platform})(${JSON.stringify(Object.fromEntries(mapping.attachments.map(a=>[a.id,a.noteId])))});(${installCoverage105.toString()})(${JSON.stringify(mapping.attachments.map(a=>({id:a.id,mime:a.mime})))});`});
  cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Network.enable',{maxPostDataSize:0,maxResourceBufferSize:8*1024*1024,maxTotalBufferSize:32*1024*1024});
  cdp.on('Network.requestWillBeSent',e=>resources.set(e.requestId,{id:e.requestId,phase,kind:e.request.url.startsWith('blob:')?'blob':e.request.url.includes('/__debug_ipc')?'IPC':e.request.url.startsWith(origin)?'frontend':'loopback-media',...backend.mediaForURL?.(e.request.url),range:e.request.headers.Range||null,start:e.timestamp}));
  cdp.on('Network.responseReceived',e=>{const row=resources.get(e.requestId);if(row)Object.assign(row,{status:e.response.status,mime:e.response.mimeType});});
  cdp.on('Network.loadingFinished',e=>{const row=resources.get(e.requestId);if(row){network.push({...row,end:e.timestamp,encodedDataLength:e.encodedDataLength});resources.delete(e.requestId);
   const attachment=mapping.attachments.find(a=>a.id===row.attachmentId);
   if((formal||geometry)&&args.side==='after'&&row.purpose==='thumbnail'&&row.pixels===480&&row.status===200&&attachment?.mime==='image/svg+xml'&&!phase.includes('warm')&&!captureKeys.has(row.capabilitySHA256)){
    const capturedForID=svgCaptures.filter(x=>x.attachmentId===attachment.id);if(capturedForID.length>=16){failures.push('105 excessive SVG response capture revisions');return;}
    captureKeys.add(row.capabilitySHA256);const capturedPhase=phase;const task=import('./roi105.mjs').then(m=>m.captureHttpPng105(cdp,e.requestId,row,attachment,out)).then(result=>{svgCaptures.push({...result,phase:capturedPhase});if(svgCaptures.reduce((n,c)=>n+c.pngBytes,0)>protocol105.maxSvgResponseBytes)throw Error('105 captured PNG byte budget');}).catch(error=>failures.push('SVG completed HTTP body evidence: '+error.message)).finally(()=>captureTasks.delete(task));captureTasks.add(task);
   }}});cdp.on('Network.loadingFailed',e=>{const row=resources.get(e.requestId);if(row){network.push({...row,end:e.timestamp,failed:true,error:e.errorText});resources.delete(e.requestId);}});
  timer=setInterval(()=>void sample(),500);await begin('startup-cold',false);await page.goto(origin+'/?notesDebug=1',{waitUntil:'domcontentloaded'});await page.waitForSelector('.app',{timeout:60000});await page.waitForSelector('#startup',{state:'detached',timeout:60000});await page.waitForFunction(()=>window.__NOTES_DEBUG__?.version===1&&window.__MEDIA_PERF__?.readyAt!==null,undefined,{timeout:60000});
  await end();
  if(formal){await formalPhases105({page,mapping,manifest,ledger,scroll:scroll105,record:accessRecord,join,begin,end,backend,side:args.side,output});formalData={completed:true};}
  else {
  //Filter through the actual search control before gallery entry: only five
  //real cards per note, no backend selection/acquire, SQLite rewrite or500scroll.
  await page.getByRole('textbox',{name:'搜索备忘录',exact:true}).fill(groups[0].title);
  await page.getByRole('button',{name:'显示选项',exact:true}).click();await page.getByRole('menuitem',{name:'查看附件',exact:true}).click();await page.locator('.attachment-gallery').waitFor();
  for(const group of groups){
   phase=group.title;await page.evaluate(phase=>window.__MEDIA_PERF__.phase=phase,phase);await page.getByRole('textbox',{name:'搜索备忘录',exact:true}).fill(group.title);
   const expected=mapping.attachments.filter(a=>group.sampleIndices.includes(a.sampleIndex)).map(a=>a.id);
   await page.waitForFunction(ids=>{const actual=[...document.querySelectorAll('.attachment-gallery-card')].map(x=>x.dataset.attachmentId);return actual.length===ids.length&&ids.every(id=>actual.includes(id));},expected,{timeout:30000});
   const start=await runtime();const settled=await scroll105(page,async row=>{if(failures.length||pageErrors.length)throw Error('105 external failure');await record(row);},{maxSteps:geometry?20:8});await join();
   const last=settled.at(-1).snapshot;assert.deepEqual([...new Set(settled.flatMap(s=>s.cards.filter(x=>x.image&&currentDecoded(x.image)).map(x=>x.attachmentId)))].sort(),expected.sort(),'105 representative decode coverage');
   const finish=await runtime();groupsResult.push({title:group.title,indices:group.sampleIndices,expected,settledSteps:settled.length,maxScrollTop:Math.max(...settled.map(s=>s.snapshot.geometry.scrollTop)),visibleDecoded:last.cards.filter(x=>x.visible&&x.image&&currentDecoded(x.image)).length,runtimeStart:start,runtimeEnd:finish,runtimeDelta:start?mediaMetricsDelta(start,finish):null});await page.screenshot({path:resolve(out,'group-'+group.sampleIndices[0]+'.png')});
   //A second stationary snapshot exercises already-complete initial state;
   //decode success remains tied to this exact current mount/source.
   await settle105(page,record);await output('groups.json',groupsResult);
  }
  phase='gallery-leave';await page.getByRole('button',{name:'显示选项',exact:true}).click();await page.getByRole('menuitem',{name:'列表',exact:true}).click();await page.waitForTimeout(600);await sample();
  }
  if(args.side==='after')assert(!backend.rows.some(r=>r.command==='read_attachment'),'105 after legacy Base64 failure');
 }catch(e){failures.push(e.stack||e.message);await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
 finally{
  // Evidence is best-effort during teardown. Preserve the first failure and
  // attempt every owned resource even when disk writes or another close fail.
  const attempt=async(label,operation)=>{try{return await operation();}catch(e){const message=label+': '+(e?.stack||e?.message||String(e));failures.push(message);try{console.error('105 teardown '+message);}catch{}return null;}};
  let snapshot=null;
  try{
   clearInterval(timer);await attempt('pending SVG evidence',()=>Promise.all([...captureTasks]));while(sampling)await new Promise(r=>setTimeout(r,10));
   const coverageSnapshot=await attempt('last viewport snapshot',()=>page?.evaluate(()=>window.__COVERAGE105__.snapshot()));
   await attempt('last viewport evidence',()=>output('last-viewport.json',coverageSnapshot));
   snapshot=await attempt('performance snapshot',()=>page?.evaluate(pageSnapshot));
   const obs=await attempt('final observation snapshot',()=>page?.evaluate(()=>window.__COVERAGE105__.take()));
   // Keep the wall-limit check intact; its repeated failure is recorded, never
   // a prerequisite for closing processes or the HTTP listener.
   if(obs)await attempt('final observation evidence',()=>record({event:'final-observation',observation:obs}));
  }finally{
   await attempt('context close',()=>context?.close());
   await attempt('browser close',()=>browser?.close());
   await attempt('browserServer close',()=>browserServer?.close());
   for(const socket of sockets)await attempt('socket destroy',()=>socket.destroy());
   await attempt('server connections close',()=>server?.closeAllConnections());
   await attempt('server close',()=>server?new Promise((done,reject)=>server.close(error=>error?reject(error):done())):undefined);
   await attempt('backend close',()=>backend?.close());
  }
  let fixtureAfter;
  await attempt('post-run identity',async()=>{fixtureAfter=await verifyFrozenFixture(fixture);await verifyChrome105(config.chrome.path);assert.deepEqual(await identity105(root,args.side,build,frontend),identity,'105 frontend/source identity changed');for(const[p,h]of Object.entries(tools))assert.equal(sha(await readFile(resolve(root,'scripts/performance',p))),h,'105 tool changed');});
  const reads=backend?.rows.filter(r=>r.command==='read_attachment')||[];
  await attempt('original response integrity',()=>{for(const row of reads)if(row.ok)assert.equal(row.returnedSha256,mapping.attachments.find(a=>a.id===row.attachmentId)?.sha256,'105 real original mismatch');});
  await attempt('configuration evidence',()=>output('configuration.json',config));
  await attempt('network evidence',()=>output('network.json',network));
  await attempt('groups evidence',()=>output('groups.json',groupsResult));
  await attempt('source link evidence',()=>output('source-links.json',[...sourceLinks.values()]));
  await attempt('SVG HTTP evidence',()=>output('svg-http.json',svgCaptures));
  if(config.formalMeasurement){await attempt('formal ledger evidence',async()=>{const rows=ledger.finish(backend,network,sourceLinks);formalData={...formalData,ledger:rows,all500ColdDecoded:ledger.allColdDecoded(),phases:phases.map(p=>p.summary||{name:p.name,start:p.start,incomplete:true})};await output('ledger.json',rows);await output('phases.json',formalData.phases);});}
  if((config.formalMeasurement||config.geometryOnly)&&args.side==='after'&&args['roi-build'])await attempt('post-measure SVG analysis',async()=>{const {analyzeCaptured105}=await import('./roi105.mjs');const decodedSources=new Set(config.formalMeasurement?[...ledger.rows.values()].flatMap(r=>Object.values(r.phases).flatMap(p=>p.decodedSources)):[...sourceLinks.keys()]);const captures=svgCaptures.filter(capture=>[...sourceLinks.values()].some(link=>decodedSources.has(link.source)&&link.capabilitySHA256===capture.capabilitySHA256));const expected=config.formalMeasurement?50:5;const analysis=await analyzeCaptured105({root,fixture,buildDir:resolve(args['roi-build']),captures,output:resolve(out,'svg-roi.json'),expected});if(formalData)formalData.svgAnalysis=analysis;});
  const sourceUnchanged=await attempt('final product identity',()=>sourceIdentity(root).sourceFingerprint===after105.fingerprint);
  const freeBytesAtEnd=await attempt('final disk availability',free);
  if(config.formalMeasurement&&(!formalData?.all500ColdDecoded||!formalData?.completed))failures.push('105 formal phases/500 cold decode incomplete');
  const result={side:args.side,formalMeasurement:!!config.formalMeasurement,formalData,groups:groupsResult,failures,pageErrors,fixtureAfter,sourceUnchanged,preciseMetrics:args.side==='after'?'see groups runtime fields':null,legacyOriginalIPC:{calls:reads.length,bytes:reads.reduce((n,r)=>n+(r.originalBytes||0),0)},snapshot,freeBytesAtEnd};
  await attempt('result evidence',()=>output('result.json',result));
  if(failures.length||pageErrors.length||(config.formalMeasurement?(!formalData?.completed||!formalData?.all500ColdDecoded||args.side==='after'&&!formalData?.svgAnalysis?.allPassed):groupsResult.length!==3))process.exitCode=1;
  await attempt('result summary',()=>console.log(JSON.stringify({output:out,side:args.side,groups:groupsResult.length,failures,pageErrors})));
  if(failures.length)process.exitCode=1;
 }
}
