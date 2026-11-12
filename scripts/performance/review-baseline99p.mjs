#!/usr/bin/env node
// Independent read-only audit of the frozen baseline, not another browser run.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {sourceIdentity} from '../build-info.mjs';
import {boundedLines} from './line-transport.mjs';
import {tracedTransport} from './trace-transport.mjs';
const [fixtureArg='artifacts/media99-fixture',runArg='artifacts/media99-baseline-run4',buildArg='artifacts/media99-baseline-harness',traceArg='artifacts/media99p-independent/probe-transport.jsonl']=process.argv.slice(2);
const fixture=resolve(fixtureArg),run=resolve(runArg),buildDir=resolve(buildArg);
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');};
const manifest=await json(resolve(fixture,'manifest.json')),mapping=await json(resolve(fixture,'store-map.json')),result=await json(resolve(run,'result.json')),phases=await json(resolve(run,'phases.json')),build=await json(resolve(buildDir,'performance-build.json'));
assert.equal(await hash(resolve(fixture,'manifest.json')),result.configuration.fixtureManifestSha256);
assert.equal(mapping.fixtureManifestSha256,result.configuration.fixtureManifestSha256);
assert.equal(manifest.files.length,503);assert.equal(mapping.attachments.length,503);assert.equal(mapping.notes.length,103);
assert.equal(manifest.originalBytes,715371216);assert.equal(manifest.files.reduce((n,f)=>n+f.bytes,0),manifest.originalBytes);
const fileByIndex=new Map(manifest.files.map(f=>[f.index,f])),attachmentById=new Map(mapping.attachments.map(a=>[a.id,a]));
for(const a of mapping.attachments){
 const f=fileByIndex.get(a.sampleIndex);assert.equal(a.sha256,f.sha256);assert.equal(a.bytes,f.bytes);
 const original=resolve(fixture,f.path),seeded=resolve(fixture,a.managedPath),measured=resolve(run,'store',a.managedPath.slice('store/'.length));
 const stats=await Promise.all([original,seeded,measured].map(p=>stat(p)));
 for(const s of stats){assert.equal(s.dev,stats[0].dev);assert.equal(s.ino,stats[0].ino);assert.equal(s.size,f.bytes);}
 assert.equal(await hash(original),f.sha256);
}
assert.equal(new Set(manifest.files.map(f=>f.sha256)).size,503);
assert.equal(await hash(resolve(fixture,'store-baseline.sqlite3')),result.configuration.store.sqliteSha256);
for(const [path,expected] of Object.entries(build.sources))assert.equal(await hash(resolve(path)),expected,'stale Rust input '+path);
assert.equal(await hash(build.transport.path),build.transport.sha256);assert.equal(await hash(build.seeder.path),build.seeder.sha256);
assert.equal(sourceIdentity().sourceFingerprint,result.configuration.source.sourceFingerprint);
for(const [name,expected] of Object.entries(result.configuration.toolSources)){
 const path=name==='run.mjs'?resolve(run,'measured-runner.mjs'):resolve('scripts/performance',name);
 assert.equal(await hash(path),expected,'measured tool input '+name);
}
assert.equal((await readFile(resolve(run,'measured-runner.mjs'),'utf8')).trimEnd().replace(/ +$/gm,''),(await readFile('scripts/performance/run.mjs','utf8')).trimEnd().replace(/ +$/gm,''),'runner changes beyond trailing spaces');
const lines=async path=>(await readFile(path,'utf8')).trim().split('\n').map(JSON.parse);
const transport=await lines(resolve(run,'transport.jsonl')),memory=await lines(resolve(run,'memory.jsonl'));
const starts=new Map(transport.filter(x=>x.event==='start').map(x=>[x.id,x]));
const ends=transport.filter(x=>x.event==='end'||x.event==='error');assert.equal(new Set(ends.map(x=>x.id)).size,ends.length);assert.equal(starts.size,ends.length);
const reads=ends.filter(x=>x.command==='read_attachment');
assert.equal(reads.length,1917);assert.ok(reads.every(x=>x.ok));
for(const r of reads){const a=attachmentById.get(r.attachmentId);assert.equal(r.originalBytes,a.bytes);assert.equal(r.returnedSha256,a.sha256);assert.equal(r.phase,starts.get(r.id).phase);}
const totals={readCalls:reads.length,originalBytes:reads.reduce((n,x)=>n+x.originalBytes,0),uniqueAttachments:new Set(reads.map(x=>x.attachmentId)).size,returnedSHA256Mismatches:0,observerHashMs:reads.reduce((n,x)=>n+x.observerHashMs,0)};
assert.deepEqual(totals,result.total);
const q=(xs,p)=>{xs=[...xs].sort((a,b)=>a-b);return xs.length?xs[Math.floor((xs.length-1)*p)]:null;};
for(const m of result.metrics){
 const p=phases.find(p=>p.name===m.name),rr=reads.filter(r=>r.phase===m.name),mm=memory.filter(x=>x.phase===m.name),frames=p.snapshot.frames.filter(x=>x.phase===m.name).map(x=>x.delta),tasks=p.snapshot.longTasks.filter(x=>x.phase===m.name);
 assert.equal(m.reads,rr.length);assert.equal(m.originalBytes,rr.reduce((n,x)=>n+x.originalBytes,0));
 assert.deepEqual(m.frames,{count:frames.length,p50:q(frames,.5),p95:q(frames,.95),max:frames.length?Math.max(...frames):null});
 assert.deepEqual(m.longTasks,{count:tasks.length,totalMs:tasks.reduce((n,x)=>n+x.duration,0),maxMs:Math.max(0,...tasks.map(x=>x.duration))});
 for(const [output,input] of [['peakJSHeap','jsHeapUsed'],['peakChromeRendererRSS','chromeRendererRSS'],['peakChromeTotalRSS','chromeTotalRSS'],['peakRustRSS','rustRSS']])assert.equal(m[output],Math.max(0,...mm.map(x=>x[input]||0)));
 assert.equal(m.peakNodeBridgeRSS,Math.max(0,...mm.map(x=>x.nodeBridge.rss)));
 assert.equal(m.offscreenReads,rr.filter(x=>x.visibility&&!x.visibility.visible).length);
 assert.equal(m.beyondPrefetchReads,rr.filter(x=>x.visibility&&!x.visibility.within120px).length);
}
for(const name of ['startup-cold','startup-hot']){const m=result.metrics.find(x=>x.name===name);assert.equal(m.reads,22);assert.ok(m.originalBytes<3.29*1024**2);}
const audio=await json(resolve(run,'audio-90min.json'));assert.equal(audio.ok,false);assert.equal(audio.elements[0].hasSrc,false);assert.equal(audio.elements[0].readyState,0);assert.match(audio.error,/60000ms/);
for(const name of ['video-faststart','video-tail']){const v=await json(resolve(run,name+'.json'));assert.equal(v.ok,true);assert.equal(v.playing,true);assert.ok(v.seek.advanced>v.seek.target);}
assert.deepEqual(result.failures.map(x=>[x.phase,x.kind]),[['audio-90min','long-media']]);assert.equal(result.pageErrors.length,0);assert.equal(result.lowDisk,false);
// Additional segmented-parser boundary: a large UTF8 line across uneven blocks.
const text=JSON.stringify({message:'中文'.repeat(20000)}),wire=Buffer.from(text+'\n'),seen=[];const consume=boundedLines(x=>seen.push(x),wire.length);
for(let at=0;at<wire.length;at+=127)consume(wire.subarray(at,at+127));consume.finish();assert.deepEqual(seen,[text]);
// Exact transparent trace probe against the owned real Rust binary and Store.
const backend=await tracedTransport(build.transport.path,resolve(run,'store'),resolve(traceArg));
try{const ws=await backend.call('load_workspace');assert.equal(ws.ok,true);assert.equal(ws.value.notes.length,103);assert.equal(ws.value.attachments.length,503);const a=mapping.attachments.find(x=>x.mime==='image/svg+xml');const r=await backend.call('read_attachment',{id:a.id,expected:{sessionId:ws.value.access.sessionId,epoch:ws.value.access.epoch,noteEpoch:ws.value.access.notes[a.noteId].epoch}},{phase:'independent-svg-probe'});assert.equal(r.ok,true);const bytes=Buffer.from(r.value.data,'base64');assert.equal(bytes.length,a.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.equal(backend.rows.at(-1).returnedSha256,a.sha256);assert.equal(backend.rows.at(-1).originalBytes,a.bytes);assert.equal(r.value.mime,a.mime);}finally{await backend.close();}
console.log(JSON.stringify({ok:true,reviewedCommit:'7a9ced6c289c8ce06c558ae90a4f22b87864a402',fixtureFiles:503,originalBytes:manifest.originalBytes,allSHAAndThreeHardlinks:true,realStoreNotes:103,realStoreAttachments:503,totals,phaseMetricsRecomputed:result.metrics.length,memorySamples:memory.length,audioFailurePreserved:true,sourceAndOwnedBinariesVerified:true,transparentRealSVGProbe:true,native:false},null,2));
