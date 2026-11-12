//Formal105 workflow only. Shared observer/settle/scroll are supplied by the
//accepted runner, not reimplemented here. No backend image acquisition.
import assert from 'node:assert/strict';
import {currentDecoded} from './coverage105.mjs';
const quantile=(values,q)=>{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return s[Math.floor((s.length-1)*q)];};
const peak=(rows,key)=>{const values=rows.map(x=>x[key]);return values.length&&values.every(Number.isFinite)?Math.max(...values):null;};
// Native video is separate poster/readiness evidence, never one of500 images.
// HAVE_CURRENT_DATA is not a claim of full decode, playback or rear seek.
export function nativeVideoReady105(card){const v=card.video;return card.mime?.startsWith('video/')&&v?.domKind==='HTMLVideoElement'&&v.connected&&!!v.source&&v.link?.token===v.source&&!v.link.unmapped&&v.link.attachmentId===card.attachmentId&&v.readyState>=2&&v.width>0&&v.height>0&&Number.isFinite(v.duration)&&v.duration>0&&v.error==null;}
export function terminal105(card){return !!card.productError||['error','rejected'].includes(card.image?.decode)||!!card.image&&currentDecoded(card.image)||nativeVideoReady105(card);}
export class CoverageLedger105{
 constructor(mapping){this.rows=new Map(mapping.attachments.filter(a=>a.sampleIndex<500).map(a=>[a.id,{attachmentId:a.id,sampleIndex:a.sampleIndex,mime:a.mime,sourceSHA256:a.sha256,domSeen:false,phases:{}}]));this.states=new Map();this.last=null;this.phaseStats={};this.supplementAllowed=new Set();}
 ingest(phase,row){
  if(row.event!=='sample')return [row];
  const {snapshot,observation}=row;this.last=snapshot;const log=[{event:'sample-clock',at:snapshot.at,geometry:snapshot.geometry,observation}];
  const p=this.phaseStats[phase]??={samples:0,steps:0,dwellMs:0,waitBeyondDwellMs:0,motionMs:0,decodeBarrierMs:0};p.samples++;
  p.decodeBarrierMs+=observation.events.filter(e=>e.event==='decode-resolved').reduce((n,e)=>n+e.elapsedMs,0);
  const mounted=new Set();
  for(const card of snapshot.cards){
   const id=card.attachmentId;mounted.add(id);const item=this.rows.get(id);if(item)item.domSeen=true;
   const signature=JSON.stringify({...card,rect:undefined});
   if(this.states.get(id)!==signature){this.states.set(id,signature);log.push({event:'card-state',at:snapshot.at,...card,rect:card.visible||card.prefetch?card.rect:null});}
   if(!item||!card.visible)continue;
   const state=item.phases[phase]??={visited:false,firstVisibleAt:snapshot.at,lastVisibleAt:snapshot.at,decodedSources:[],errors:[],timeout:false};state.visited=true;state.lastVisibleAt=snapshot.at;
   if(card.image&&currentDecoded(card.image)&&!state.decodedSources.includes(card.image.source))state.decodedSources.push(card.image.source);
   if(card.productError||['error','rejected'].includes(card.image?.decode)){const error={source:card.image?.source||null,message:card.productError||card.image.decode};if(!state.errors.some(x=>x.source===error.source&&x.message===error.message))state.errors.push(error);}
  }
  for(const id of this.states.keys())if(!mounted.has(id)){this.states.delete(id);log.push({event:'card-unmounted',attachmentId:id,at:snapshot.at});}
  return log;
 }
 step(phase,result){const p=this.phaseStats[phase]??={samples:0,steps:0,dwellMs:0,waitBeyondDwellMs:0,motionMs:0,decodeBarrierMs:0};p.steps++;p.dwellMs+=500;p.waitBeyondDwellMs+=Math.max(0,result.wallMs-500);}
 motion(phase,row){const p=this.phaseStats[phase];if(p)p.motionMs+=row.motionMs||0;}
 timeout(phase,snapshot){for(const card of snapshot?.cards||[])if(card.visible&&!terminal105(card)){const item=this.rows.get(card.attachmentId);if(item){const s=item.phases[phase]??={visited:true,decodedSources:[],errors:[]};s.timeout=true;}}}
 neverVisited(){return [...this.rows.values()].filter(r=>!r.phases['gallery-cold-first-pass']?.visited).map(r=>r.attachmentId);}
 coldStatus(row){const first=row.phases['gallery-cold-first-pass'];const extra=this.supplementAllowed.has(row.attachmentId)?row.phases['gallery-cold-supplement']:null;const states=[first,extra].filter(Boolean);if(states.some(s=>s.timeout))return 'timeout';if(states.some(s=>s.errors.length))return 'explicit-error';if(states.some(s=>s.decodedSources.length))return 'decoded';return states.some(s=>s.visited)?'unknown':'unvisited';}
 allColdDecoded(){return this.rows.size===500&&[...this.rows.values()].every(row=>this.coldStatus(row)==='decoded');}
 finish(backend,network,links){const mediaById=new Map((backend.mediaRows||[]).map(m=>[m.id,m]));return [...this.rows.values()].map(row=>({...row,coldStatus:this.coldStatus(row),queueCancellationReason:'unknown',requests:backend.rows.filter(r=>r.attachmentId===row.attachmentId||mediaById.get(r.id)?.attachmentId===row.attachmentId).map(r=>({id:r.id,command:r.command,phase:r.phase,coverageCall:r.coverageCall,ok:r.ok,error:r.error,originalBytes:r.originalBytes??null,originalSHA256:r.returnedSha256??null})),sources:[...links.values()].filter(s=>s.attachmentId===row.attachmentId),http:network.filter(n=>n.attachmentId===row.attachmentId).map(n=>({id:n.id,phase:n.phase,status:n.status,failed:n.failed||false,purpose:n.purpose,capabilitySHA256:n.capabilitySHA256,encodedDataLength:n.encodedDataLength??null}))}));}
}
export function phaseSummary105(phase,snapshot,memory,rows,network,access){
 const frames=(snapshot?.frames||[]).filter(x=>x.phase===phase.name).map(x=>x.delta),tasks=(snapshot?.longTasks||[]).filter(x=>x.phase===phase.name),samples=memory.filter(x=>x.phase===phase.name);
 const reads=rows.filter(r=>r.command==='read_attachment'&&r.phase===phase.name);
 return {...phase,snapshot:undefined,wallMs:phase.end-phase.start,access:access||null,frames:{count:frames.length,p50:quantile(frames,.5),p95:quantile(frames,.95),max:frames.length?Math.max(...frames):null},longTasks:{count:tasks.length,totalMs:tasks.reduce((n,x)=>n+x.duration,0)},peakJSHeap:peak(samples,'jsHeapUsed'),peakRendererRSS:peak(samples,'chromeRendererRSS'),peakRustRSS:peak(samples,'rustRSS'),peakNodeRSS:samples.length?Math.max(...samples.map(x=>x.nodeBridge.rss)):null,legacyOriginalIPC:{calls:reads.length,bytes:reads.reduce((n,r)=>n+(r.originalBytes||0),0)},http:network.filter(n=>n.phase===phase.name&&n.kind==='loopback-media').map(n=>({id:n.id,attachmentId:n.attachmentId,purpose:n.purpose,status:n.status,encodedDataLength:n.encodedDataLength??null})),memoryScope:'Node/Rust/renderer separate, no forced GC; phase counter deltas are not transactional operation-origin attribution; decodeBarrierMs includes2rAF and overlaps dwell/wait'};
}
export async function activateLongMedia105({page,backend,side,file,attachment}){
 const start=Date.now(),audio=file.mime.startsWith('audio/');
 //Same existing99M actual product navigation. No source/load/play fallback
 //before the product activation. Setting time afterward is the fixed seek test.
 await page.evaluate(async id=>window.__NOTES_DEBUG__.execute('note.select',{id}),attachment.noteId);
 const node=page.locator(`.attachment-node[data-attachment-id="${attachment.id}"]`);await node.scrollIntoViewIfNeeded();
 const selector=`.attachment-node[data-attachment-id="${attachment.id}"] ${audio?'audio':'video'}`,media=page.locator(selector);
 const prior=side==='after'?backend.mediaRows.filter(r=>r.command==='acquire_attachment_source'&&r.attachmentId===attachment.id&&r.purpose==='original').length:backend.rows.filter(r=>r.command==='read_attachment'&&r.attachmentId===attachment.id).length;
 if(side==='after')assert.equal(prior,0,'105 after media original acquired before activation');
 const result={sampleIndex:file.index,attachmentId:attachment.id,originalBytes:file.bytes,beforeOriginalAcquires:prior,baselineEagerOriginalReads:side==='baseline'?prior:null};
 if(side==='baseline'&&!audio){result.controlKind='native-video-controls';result.input='focus+Space';await media.waitFor({state:'attached',timeout:120000});await page.waitForFunction(selector=>{const el=document.querySelector(selector);if(el?.error)throw Error('Media error '+el.error.code);return el&&el.readyState>=1;},selector,{timeout:60000});await media.focus();await media.press('Space');}
 else {result.controlKind='product-button';result.input='pointer click';const button=node.getByRole('button',{name:audio?'播放':`播放视频 ${file.name}`,exact:true});assert.equal(await button.count(),1,'Expected actual product activation control');await button.click();}
 await page.waitForFunction(selector=>{const el=document.querySelector(selector);if(el?.error)throw Error('Media error '+el.error.code);return el&&el.readyState>=1;},selector,{timeout:60000});
 result.metadataMs=Date.now()-start;result.duration=await media.evaluate(el=>el.duration);assert(Number.isFinite(result.duration)&&Math.abs(result.duration-file.durationSeconds)<=1,'105 full duration mismatch');
 const initialTime=await media.evaluate(el=>el.currentTime);await page.waitForTimeout(400);result.playing=await media.evaluate((el,at)=>!el.paused&&el.currentTime>at,initialTime);assert(result.playing,'105 actual time did not advance');
 const seekStart=Date.now();result.seek=await media.evaluate(async el=>{el.pause();const target=el.duration*.9;await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(Error('Rear seek timeout')),15000);el.addEventListener('seeked',()=>{clearTimeout(timer);done();},{once:true});el.currentTime=target;});await el.play();return {target,at:el.currentTime,readyState:el.readyState,error:el.error?.code??null};});await page.waitForTimeout(400);result.seek.advanced=await media.evaluate(el=>el.currentTime);result.rearSeekMs=Date.now()-seekStart;await media.evaluate(el=>el.pause());assert(result.seek.advanced>result.seek.target,'105 rear seek time did not advance');result.ok=true;return result;
}
export async function formalPhases105({page,mapping,manifest,ledger,scroll,record,join,begin,end,backend,side,output}){
 //Begin BEFORE real gallery entry. Startup's naturally cached images remain
 //in measured startup counters and may already hit in first gallery pass.
 await begin('gallery-cold-first-pass');
 const search=page.getByRole('textbox',{name:'搜索备忘录',exact:true});if(await search.inputValue())await search.fill('');
 await page.getByRole('button',{name:'显示选项',exact:true}).click();await page.getByRole('menuitem',{name:'查看附件',exact:true}).click();await page.locator('.attachment-gallery').waitFor();
 const traverse=async(name,targetIds,returnToTop=false)=>{try{await scroll(page,record,{retainSnapshots:false,targetIds,returnToTop,onStep:async result=>{ledger.step(name,result);await join(true);}});}catch(error){ledger.timeout(name,error.viewport||ledger.last);throw error;}};
 await traverse('gallery-cold-first-pass');await end();
 const never=ledger.neverVisited();
 if(never.length){ledger.supplementAllowed=new Set(never);const present=await page.locator('.attachment-gallery-card').evaluateAll(els=>els.map(el=>el.dataset.attachmentId));assert(never.every(id=>present.includes(id)),'105 never-visited ID missing from DOM');const targets=present.filter(id=>ledger.supplementAllowed.has(id));await output('supplement-targets.json',targets);await begin('gallery-cold-supplement');await traverse('gallery-cold-supplement',targets);await end();}
 if(ledger.allColdDecoded()){
  if(await page.locator('.attachment-gallery-scroll').evaluate(el=>el.scrollTop)!==0){await begin('gallery-warm-position');await traverse('gallery-warm-position',undefined,true);await end();}
  assert.equal(await page.locator('.attachment-gallery-scroll').evaluate(el=>el.scrollTop),0,'105 warm origin must be top0');
  await begin('gallery-warm-pass');await traverse('gallery-warm-pass');await end();assert([...ledger.rows.values()].every(row=>{const p=row.phases['gallery-warm-pass'];return p?.visited&&p.decodedSources.length&&!p.errors.length&&!p.timeout;}),'105 warm pass has unvisited/error/timeout/current decode failure');
 }else await output('partial-cache.json',{reason:'Not all500 current visible sources decoded; full warm phase skipped',statuses:[...ledger.rows.values()].map(r=>({attachmentId:r.attachmentId,status:ledger.coldStatus(r)}))});
 await begin('gallery-leave');await page.getByRole('button',{name:'显示选项',exact:true}).click();await page.getByRole('menuitem',{name:'列表',exact:true}).click();await page.waitForTimeout(600);await end();
 for(const file of manifest.files.filter(x=>!x.mime.startsWith('image/'))){const attachment=mapping.attachments.find(a=>a.sampleIndex===file.index),name=file.mime.startsWith('audio/')?'audio-90min':file.metadataLayout==='faststart'?'video-faststart':'video-tail';await begin(name);const result=await activateLongMedia105({page,backend,side,file,attachment});await output(name+'.json',result);await end();}
 await begin('final-leave');await page.evaluate(async id=>window.__NOTES_DEBUG__.execute('note.select',{id}),mapping.notes.find(n=>n.sampleIndices.length===5).id);await page.waitForTimeout(600);await end();
}
