#!/usr/bin/env node
// Transport/HTTP boundary checks, not App UI performance or native evidence.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, mkdir, writeFile, statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { realMediaTransport, rendererCommandAllowed } from './media-trace.mjs';
import { prepareMeasurementStore } from './prepare-store.mjs';
import { boundedLines } from './line-transport.mjs';
import { mediaPopulation } from './media-summary.mjs';
import { validateMediaMetrics, mediaMetricsDelta } from './media-metrics.mjs';
import { extractMacProvider } from './extract-media-provider.mjs';
const [fixtureArg,buildArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node scripts/performance/check-media-tools.mjs FIXTURE HARNESS FRESH_OUTPUT');
const fixture=resolve(fixtureArg),out=resolve(outArg),build=JSON.parse(await readFile(resolve(buildArg,'performance-build.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const disk=await statfs(fixture);if(disk.bavail*disk.bsize<2.5*1024**3)throw Error('STOP: disk below2.5GiB');
await mkdir(out);const checks=[];
const toolSources={};for(const name of ['check-media-tools.mjs','media-trace.mjs','media-summary.mjs','line-transport.mjs','trace-transport.mjs','prepare-store.mjs','media-metrics.mjs','media-macos.rs','media-native-build.rs','media-observer.rs','extract-media-provider.mjs','check-media-accounting.mjs'])toolSources[name]=sha(await readFile(resolve('scripts/performance',name)));
for(const[path,hash]of Object.entries(build.sources))assert.equal(sha(await readFile(path)),hash,'Stale harness input '+path);
assert.equal(sha(await readFile(build.transport.path)),build.transport.sha256);
if(process.platform==='darwin'){
 assert.equal(build.providerNative,true);
 const providerSource=await readFile('plugins/tauri-plugin-notes-media/src/lib.rs','utf8');
 const extracted=extractMacProvider(providerSource);
 assert.equal(sha(extracted),build.generated['native-provider.rs']);
 assert.equal(sha(await readFile(resolve(build.harness,'native-provider.rs'))),sha(extracted));
 assert.throws(()=>extractMacProvider('boundary missing'));
 assert.throws(()=>extractMacProvider(providerSource+'\nuse std::{'));
 checks.push('Unique production Rust provider boundaries mechanically extracted and hashed; exact production C linked without Tauri');
}
assert.throws(()=>validateMediaMetrics({schema:2,bytesRead:0}));
const manifestBytes=await readFile(resolve(fixture,'manifest.json')),mappingBytes=await readFile(resolve(fixture,'store-map.json'));
const manifest=JSON.parse(manifestBytes),mapping=JSON.parse(mappingBytes);
assert.equal(sha(manifestBytes),mapping.fixtureManifestSha256);
const frozenSnapshotHash=sha(await readFile(resolve(fixture,'store-baseline.sqlite3')));
const verified=[];
for(const a of mapping.attachments){const hash=createHash('sha256');let bytes=0;for await(const b of createReadStream(resolve(fixture,a.samplePath))){bytes+=b.length;hash.update(b);}assert.equal(bytes,a.bytes);assert.equal(hash.digest('hex'),a.sha256);verified.push({id:a.id,sha256:a.sha256,bytes});}
assert.equal(verified.length,503);const population=mediaPopulation(mapping,[],[]);assert.equal(population.raster.registeredSamples,450);assert.equal(population.svg.registeredSamples,50);checks.push('All503 originals stream-hashed against frozen manifest; no Base64 or additional original copy');
const store=await prepareMeasurementStore(fixture,resolve(out,'store'));
const parts=[];const reader=boundedLines(s=>parts.push(s),64);for(const b of Buffer.from('{"中文":1}\n{}\n'))reader(Buffer.from([b]));reader.finish();assert.deepEqual(parts,['{"中文":1}','{}']);assert.throws(()=>boundedLines(()=>{},3)(Buffer.from('1234')));checks.push('Bounded segmented line protocol preserves UTF8 and rejects oversize');
assert.equal(rendererCommandAllowed('perf_window_close'),false);assert.equal(rendererCommandAllowed('acquire_attachment_source'),true);
let backend,browser;
const server=createServer(async(req,res)=>{if(req.url==='/__debug_ipc'){let body='';for await(const b of req)body+=b;const input=JSON.parse(body);if(!rendererCommandAllowed(input.command)){res.statusCode=403;res.end(JSON.stringify({ok:false,error:{code:'host_only'}}));return;}res.setHeader('content-type','application/json');res.end(JSON.stringify(await backend.call(input.command,input.args)));return;}res.setHeader('content-type','text/html');res.end('<!doctype html><title>real media HTTP boundary</title><body>transport probe</body>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
const observations={};
try {
 backend=await realMediaTransport(build.transport.path,store.directory,resolve(out,'media.jsonl'),origin);
 const call=async(command,args={})=>{const r=await backend.call(command,args,{phase:'tooling-boundary'});assert.equal(r.ok,true,JSON.stringify(r.error));return r.value;};
 const metrics=async()=>validateMediaMetrics(await call('perf_metrics'));
 const settledMetrics=async()=>{for(let i=0;i<100;i++){const m=await metrics();if(m.activeStreams===0)return m;await new Promise(done=>setTimeout(done,20));}throw Error('Actual HTTP streams did not settle');};
 observations.initial=await settledMetrics();assert.equal(observations.initial.bytesRead,0);assert.equal(observations.initial.activeLeases,0);assert.equal(observations.initial.cacheBytes,0);
 const workspace=()=>call('load_workspace');let w=await workspace();assert.equal(w.attachments.length,503);assert.equal(w.notes.length,103);
 const token=id=>({sessionId:w.access.sessionId,epoch:w.access.epoch,...(id?{noteEpoch:w.access.notes[id].epoch}:{})});
 const img=mapping.attachments.find(a=>a.mime==='image/jpeg'),svg=mapping.attachments.find(a=>a.mime==='image/svg+xml'),video=mapping.attachments.find(a=>a.mime==='video/mp4');
 const grant=(a,purpose='original')=>call('acquire_attachment_source',{id:a.id,purpose,...(purpose==='thumbnail'?{pixels:160}:{}),expected:token(a.noteId)});
 const release=g=>call('release_attachment_source',{leaseId:g.leaseId});
 const blocked=await fetch(origin+'/__debug_ipc',{method:'POST',body:JSON.stringify({command:'perf_window_close',args:{}})});assert.equal(blocked.status,403);checks.push('Actual renderer bridge rejects host-only lifecycle command without closing real host window');
 const original=await grant(img);assert.equal(original.attachmentId,img.id);assert.equal(original.access.sessionId,w.access.sessionId);assert.equal(original.bytes,img.bytes);
 const raw=await fetch(original.url,{headers:{Origin:origin}});assert.equal(raw.status,200);const hash=createHash('sha256');let bytes=0;for await(const b of raw.body){bytes+=b.length;hash.update(b);}assert.equal(bytes,img.bytes);assert.equal(hash.digest('hex'),img.sha256);observations.original={bytes,sha256:img.sha256};
 observations.afterOriginal=await settledMetrics();assert.equal(observations.afterOriginal.originalBytesRead,img.bytes);assert.equal(observations.afterOriginal.bytesRead,img.bytes);assert.equal(observations.afterOriginal.thumbnailBytesRead,0);assert.equal(observations.afterOriginal.activeLeases,1);
 const wrong=await fetch(original.url,{headers:{Origin:origin+'0'}});assert.equal(wrong.status,403);observations.foreignOriginStatus=wrong.status;await wrong.body?.cancel();checks.push('Unique realSession tagged original grants and real HTTP200 exact SHA; exact foreign Origin rejected');
 const svgProbe=await backend.call('acquire_attachment_source',{id:svg.id,purpose:'thumbnail',pixels:160,expected:token(svg.noteId)});observations.svg={ok:svgProbe.ok,error:svgProbe.error?.code,message:svgProbe.error?.message};if(svgProbe.ok)await release(svgProbe.value);else assert.equal(svgProbe.error.code,'unsupported_media');
 const thumb=await grant(img,'thumbnail');const png=await fetch(thumb.url,{headers:{Origin:origin}});assert.equal(png.status,200);const pngBytes=Buffer.from(await png.arrayBuffer());assert.equal(pngBytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(pngBytes.length<img.bytes||pngBytes.length<1024*1024);observations.thumbnail={bytes:pngBytes.length,sha256:sha(pngBytes),width:thumb.width,height:thumb.height};
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_CORE_PATH||'/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs'));
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage();await page.goto(origin);observations.browser=browser.version();
 observations.chrome=await page.evaluate(async({url,thumbnail})=>{const response=await fetch(url,{headers:{Range:'bytes=0-1023'}});const bytes=[...new Uint8Array(await response.arrayBuffer())];const image=document.createElement('img');image.src=thumbnail;document.body.append(image);await image.decode();return {status:response.status,range:response.headers.get('content-range'),bytes,width:image.naturalWidth,height:image.naturalHeight};},{url:original.url,thumbnail:thumb.url});
 assert.equal(observations.chrome.status,206);assert.equal(sha(Buffer.from(observations.chrome.bytes)),sha((await readFile(resolve(fixture,img.samplePath))).subarray(0,1024)));assert.ok(observations.chrome.width<=160);delete observations.chrome.bytes;
 observations.exact=await settledMetrics();
 assert.equal(observations.exact.originalBytesRead,img.bytes+1024);
 assert.equal(observations.exact.thumbnailBytesRead,pngBytes.length*2);
 assert.equal(observations.exact.bytesRead,observations.exact.originalBytesRead+observations.exact.thumbnailBytesRead);
 assert.equal(observations.exact.readOperations,observations.exact.originalReadOperations+observations.exact.thumbnailReadOperations);
 assert.equal(observations.exact.thumbnailGenerationAttempts,2);
 assert.equal(observations.exact.thumbnailSourceLogicalBytes,img.bytes+svg.bytes);
 assert.equal(observations.exact.thumbnailGenerations,1);
 assert.equal(observations.exact.thumbnailOutputBytes,pngBytes.length);
 assert.equal(observations.exact.cacheBytes,pngBytes.length);
 assert.equal(observations.exact.cacheFiles,1);
 assert.equal(observations.exact.activeLeases,2);
 checks.push('Exact real TCP original200+1024B Range and twice-fetched PNG counters; failed textSVG logical input/attempt counted, output/cache bytes exact');
 checks.push('Chrome directly fetched real original206 and displayed production PNG over Rust HTTP; probe only, not product activation');
 await release(thumb);const again=await grant(img,'thumbnail');await release(again);observations.warm=await settledMetrics();
 assert.ok(observations.warm.thumbnailHits>=1);assert.equal(observations.warm.thumbnailGenerationAttempts,observations.exact.thumbnailGenerationAttempts);assert.equal(observations.warm.thumbnailSourceLogicalBytes,observations.exact.thumbnailSourceLogicalBytes);assert.equal(observations.warm.thumbnailOutputBytes,observations.exact.thumbnailOutputBytes);
 await call('clear_attachment_media_cache',{expected:token()});observations.cleared=await settledMetrics();assert.equal(observations.cleared.cacheBytes,0);assert.equal(observations.cleared.cacheFiles,0);assert.equal(observations.cleared.activeLeases,1);
 const clear=await grant(img,'thumbnail');await release(clear);observations.afterClear=await settledMetrics();assert.equal(observations.afterClear.thumbnailGenerationAttempts,observations.warm.thumbnailGenerationAttempts+1);assert.equal(observations.afterClear.thumbnailSourceLogicalBytes,observations.warm.thumbnailSourceLogicalBytes+img.bytes);assert.equal(observations.afterClear.thumbnailGenerations,observations.warm.thumbnailGenerations+1);checks.push('Warm hit reads no original/decode attempt; clear resets only cache gauges and next authorized generation increments actual logical counters');
 if(build.providerNative){
  observations.videoPosters=[];
  for(const sample of mapping.attachments.filter(a=>a.mime==='video/mp4')){
   const before=await settledMetrics(),poster=await grant(sample,'thumbnail');
   const response=await fetch(poster.url,{headers:{Origin:origin}});assert.equal(response.status,200);const encoded=Buffer.from(await response.arrayBuffer());
   const size=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};},poster.url);
   assert.ok(size.width>0&&size.height>0&&size.width<=160&&size.height<=160);await release(poster);
   const after=await settledMetrics(),delta=mediaMetricsDelta(before,after).counters;
   assert.equal(delta.originalBytesRead,0);assert.equal(delta.thumbnailBytesRead,encoded.length*2);assert.equal(delta.thumbnailGenerationAttempts,1);assert.equal(delta.thumbnailSourceLogicalBytes,sample.bytes);assert.equal(delta.thumbnailGenerations,1);assert.equal(delta.thumbnailOutputBytes,encoded.length);
   observations.videoPosters.push({attachmentId:sample.id,registeredBytes:sample.bytes,encodedBytes:encoded.length,size,delta});
  }
  assert.equal(observations.videoPosters.length,2);checks.push('Both frozen faststart/tail-moov videos decoded by exact production Mac provider through real runtime/cache/TCP; exact derivative/generation metrics and zero original HTTP bytes');
 }
 await release(original);const released=await fetch(original.url,{headers:{Origin:origin}});assert.ok(released.status>=400);await released.body?.cancel();checks.push('Released capability rejects subsequent HTTP bytes');
 const long=await grant(video);const stream=await fetch(long.url,{headers:{Origin:origin}});assert.equal(stream.status,200);const body=stream.body.getReader();const first=await body.read();assert.ok(first.value.length>0);let delivered=first.value.length;
 const prepare=await call('perf_prepare',{action:{type:'deleteNote',id:video.noteId},expected:token()});assert.equal(prepare.phase,'prepare');
 const denied=await backend.call('acquire_attachment_source',{id:video.id,purpose:'original',expected:token(video.noteId)});assert.equal(denied.ok,false);
 let interrupted=false;try{for(;;){const p=await body.read();if(p.done)break;delivered+=p.value.length;}}catch{interrupted=true;}assert.ok(delivered<video.bytes);observations.revocation={delivered,total:video.bytes,interrupted,code:denied.error.code};
 await call('acknowledge_access',{operationId:prepare.operationId,success:false});const finish=await backend.call('perf_finish',{operationId:prepare.operationId});assert.equal(finish.ok,false);w=await workspace();checks.push('Real Session prepare forwarded before ACK cancels in-flight noRange original; abort restores authority');
 const reopened=await grant(img);await call('perf_window_close');const closed=await fetch(reopened.url,{headers:{Origin:origin}});assert.ok(closed.status>=400);await closed.body?.cancel();const closedGrant=await backend.call('acquire_attachment_source',{id:img.id,purpose:'original',expected:token(img.noteId)});assert.equal(closedGrant.ok,false);await call('perf_window_open');const fresh=await grant(img);await release(fresh);checks.push('Trusted host window close revokes leases and reopened incarnation can acquire');
 observations.final=await settledMetrics();assert.ok(observations.final.peakReadBlock<=65536);assert.equal(observations.final.activeLeases,0);assert.equal(observations.final.activeStreams,0);assert.equal(observations.final.bytesRead,observations.final.originalBytesRead+observations.final.thumbnailBytesRead);assert.equal(backend.rows.filter(r=>r.command==='read_attachment').length,0);
 checks.push('Production peak block <=64KiB; no legacy read_attachment IPC used in boundary test');
 for(const a of mapping.attachments){const hash=createHash('sha256');for await(const b of createReadStream(resolve(fixture,a.samplePath)))hash.update(b);assert.equal(hash.digest('hex'),a.sha256,'Original changed after test '+a.id);}
 for(const [name,hash]of Object.entries(toolSources))assert.equal(sha(await readFile(resolve('scripts/performance',name))),hash,'Tool changed during boundary check '+name);
 assert.equal(sha(await readFile(resolve(fixture,'manifest.json'))),sha(manifestBytes));assert.equal(sha(await readFile(resolve(fixture,'store-map.json'))),sha(mappingBytes));assert.equal(sha(await readFile(resolve(fixture,'store-baseline.sqlite3'))),frozenSnapshotHash);
 await writeFile(resolve(out,'result.json'),JSON.stringify({ok:true,checks,observations,store,toolSources,originalsUnchangedAfter:true,fixtureManifestSha256:sha(manifestBytes),sqliteSha256:frozenSnapshotHash,verifiedOriginals:verified,transport:build.transport,sourceHead:build.sourceHead,scope:'Tooling: real Session/MediaRuntime+HTTP/Chrome primitive checks. No App performance/native/99UI completion claim.'},null,2)+'\n');
 console.log(JSON.stringify({ok:true,checks,observations},null,2));
}finally {await browser?.close();await backend?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
