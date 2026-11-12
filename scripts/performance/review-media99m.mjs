// Independent host-adapter probes. Real production binary/Session/HTTP only;
// no native package, product UI performance or decoder support claim.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {prepareMeasurementStore} from './prepare-store.mjs';
import {boundedLines} from './line-transport.mjs';
import {rendererCommandAllowed} from './media-trace.mjs';
import {sourceIdentity} from '../build-info.mjs';

const [fixtureArg,buildArg,toolsArg,gateArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node review-media99m.mjs FIXTURE BUILD INDEPENDENT_TOOLS FORMAL_GATE FRESH_OUTPUT');
const fixture=resolve(fixtureArg),out=resolve(outArg),sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out);
const build=JSON.parse(await readFile(resolve(buildArg,'performance-build.json'),'utf8'));
for(const[path,hash]of Object.entries(build.sources))assert.equal(sha(await readFile(path)),hash,path);
assert.equal(sha(await readFile(build.transport.path)),build.transport.sha256);
const tools=JSON.parse(await readFile(resolve(toolsArg,'result.json'),'utf8'));
assert.ok(tools.ok);assert.equal(tools.verifiedOriginals.length,503);
const originals=tools.verifiedOriginals.reduce((n,a)=>n+a.bytes,0);assert.equal(originals,715371216);
assert.equal(new Set(tools.verifiedOriginals.map(a=>a.sha256)).size,503);
assert.equal(tools.store.newOriginalBytes,0);assert.equal(tools.store.attachmentHardlinks,503);
const warm=tools.observations.warm;
assert.equal(warm.bytesRead,tools.observations.original.bytes+1024+2*tools.observations.thumbnail.bytes);
assert.equal(warm.thumbnailGenerations,1);assert.equal(warm.thumbnailHits,1);
assert.equal(tools.observations.afterClear.thumbnailGenerations,2);
assert.equal(tools.observations.final.activeStreams,0);
assert.ok(tools.observations.final.peakReadBlock<=65536);
const gate=JSON.parse(await readFile(resolve(gateArg,'result.json'),'utf8'));
assert.equal(gate.completedPhaseCount,0);assert.equal(gate.configuration.browser,undefined);
assert.ok(gate.failures.some(f=>f.error.includes('requires accepted99C purpose/logical metrics')));
assert.equal(gate.mediaTrace.at(-1).metrics.purposeBytes,null);
const store=await prepareMeasurementStore(fixture,resolve(out,'store'));
const child=spawn(build.transport.path,[store.directory],{env:{...process.env,MEDIA_TEST_ORIGIN:'http://127.0.0.1:19783'},stdio:['pipe','pipe','pipe']});
let next=0,stderr='';const pending=new Map();
const consume=boundedLines(line=>{const row=JSON.parse(line),slot=pending.get(row.requestId);assert.ok(slot,'unknown receipt');pending.delete(row.requestId);clearTimeout(slot.timer);slot.resolve(row);},8*1024*1024);
child.stdout.on('data',consume);child.stderr.on('data',b=>stderr=(stderr+b).slice(-4000));
const exited=new Promise(done=>child.once('close',(code,signal)=>done({code,signal})));
function call(command,args={},window='main'){return new Promise((resolve,reject)=>{const requestId=++next,timer=setTimeout(()=>reject(Error('Probe timeout '+command)),10000);pending.set(requestId,{resolve,reject,timer});child.stdin.write(JSON.stringify({requestId,command,args,window})+'\n');});}
const checks=[],errors=[];
try {
  const w=await call('load_workspace');assert.ok(w.ok);assert.equal(w.value.attachments.length,503);
  const mapping=JSON.parse(await readFile(resolve(fixture,'store-map.json'),'utf8'));
  const image=mapping.attachments.find(a=>a.mime==='image/jpeg');
  const token={sessionId:w.value.access.sessionId,epoch:w.value.access.epoch,noteEpoch:w.value.access.notes[image.noteId].epoch};
  const args={id:image.id,purpose:'original',expected:token};
  for(const window of ['unregistered','MAIN',null]) {
    const r=await call('acquire_attachment_source',args,window);assert.equal(r.ok,false);assert.equal(r.error.code,'access_changed');assert.equal(r.value,undefined);
  }
  checks.push('Raw renderer-supplied alternate/null window identities rejected before media grant');
  for(const expected of [{...token,sessionId:'forged'}, {...token,noteEpoch:token.noteEpoch+1}, {...token,metadata:{sequence:0}},null]) {
    const r=await call('acquire_attachment_source',{...args,expected});assert.equal(r.ok,false);assert.equal(r.value,undefined);errors.push(r.error.code);
  }
  for(const patch of [{purpose:'anything'},{purpose:'thumbnail',pixels:1025},{purpose:'original',pixels:160},{id:'not-registered'}]) {
    const r=await call('acquire_attachment_source',{...args,...patch});assert.equal(r.ok,false);assert.equal(r.value,undefined);errors.push(r.error.code);
  }
  checks.push('Forged/stale/extra-metadata Token, malformed purpose/size and unknown attachment never return source');
  for(const command of ['perf_metrics','perf_prepare','perf_finish','perf_window_close','perf_window_open',null,{}]) assert.equal(rendererCommandAllowed(command),false);
  checks.push('All host perf commands denied by exact renderer route policy');
  const r=await call('acquire_attachment_source',args);assert.ok(r.ok);
  assert.equal(r.value.noteId,image.noteId);assert.equal(r.value.access.sessionId,w.value.access.sessionId);
  assert.equal(r.value.metadata.sessionId,w.value.metadata.sessionId);assert.equal(r.value.metadata.sequence,w.value.metadata.sequence);
  assert.equal(r.value.bytes,image.bytes);
  const head=await fetch(r.value.url,{method:'HEAD',headers:{Origin:'http://127.0.0.1:19783'}});assert.equal(head.status,200);assert.equal(+head.headers.get('content-length'),image.bytes);
  assert.ok((await call('release_attachment_source',{leaseId:r.value.leaseId})).ok);
  const final=await call('perf_metrics');assert.ok(final.ok);assert.equal(final.value.bytesRead,0);assert.equal(final.value.activeStreams,0);
  checks.push('Valid receipt keeps exact same Session/access and metadata tags; HEAD exact registered bytes; negative probes/HEAD read zero payload');
} finally {child.stdin.end();const exit=await exited;assert.equal(exit.code,0,stderr);}
const result={result:'tools-ready',source:sourceIdentity(),transport:build.transport,checks,errorCodes:errors,metricsAudit:{originals,verified503UniqueSHA:true,warmExpectedBytes:tools.observations.original.bytes+1024+2*tools.observations.thumbnail.bytes,warmActualBytes:warm.bytesRead,formalBeforeBrowser:true},limits:['Production precise purpose/logical metrics unavailable; formal deliberately blocked','No accepted99UI/provider postmeasurement','No Mac/Android native runtime or RSS evidence']};
await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
