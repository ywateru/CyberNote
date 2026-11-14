// Device-free tests of the production renderer bridge with a controlled clock.
// Native ACK/terminal replies are explicit fixtures, not an actual Store run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const built=await build({entryPoints:[resolve('src/network-sync.ts')],bundle:true,write:false,format:'esm',platform:'node'});
const {NetworkSyncCoordinator,parseSyncWindowEvent}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const event=(phase,extra={})=>({phase,operationId:'op',sessionId:'session',...extra});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const settle=async()=>{for(let n=0;n<16;n++)await Promise.resolve();};
function captureTimers(t) {
 const schedule=globalThis.setTimeout,timers=[];
 t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{
  timers.push({delay,fire:()=>callback(...args)});
  return schedule(callback,delay,...args);
 });
 return timers;
}
function fixture(t,{flush=async()=>{},onReady}={}) {
 t.mock.timers.enable({apis:['setTimeout']});
 let releases=0,commits=0,current=true;
 const replies=[],errors=[],snapshot={sessionId:'session',blocked:false,protectedNoteIds:[]};
 const bridge=new NetworkSyncCoordinator({
  snapshot:()=>snapshot,
  freeze:()=>({flush,current:()=>current,release:()=>{releases++;}}),
  reply:async reply=>{replies.push(reply);return reply.ready===true&&onReady?onReady(reply):{operationId:reply.operationId,outcome:'pending'};},
  committed:async()=>{commits++;},error:error=>errors.push(error),
 });
 t.after(()=>bridge.dispose());
 return {bridge,replies,errors,snapshot,invalidLease:()=>{current=false;},releases:()=>releases,commits:()=>commits,
  cancelled:()=>replies.filter(r=>r.ready===false).length,
  tick:async ms=>{t.mock.timers.tick(ms);await settle();}};
}
test('adoptionMedia parser admits only exact fixed event fields and valid identities',()=>{
 assert.deepEqual(parseSyncWindowEvent(event('adoptionMedia')),event('adoptionMedia'));
 for(const bad of [event('adoption-media'),event('adoptionMedia',{noteIds:[]}),event('adoptionMedia',{outcome:'commit'}),
  ...[undefined,null,0,'','x'.repeat(513)].flatMap(value=>[event('adoptionMedia',{operationId:value}),event('adoptionMedia',{sessionId:value})])])
  assert.throws(()=>parseSyncWindowEvent(bad),/同步窗口/);
});
test('25.766 seconds of prepared media work retains the original freeze until backend commit',async t=>{
 const h=fixture(t);await h.bridge.receive(event('prepare',{noteIds:['note']}));
 await h.tick(5000);await h.bridge.receive(event('adoptionMedia'));await h.tick(25766);
 assert.equal(h.cancelled(),0);assert.equal(h.releases(),0);assert(h.bridge.frozen('note'));
 await h.bridge.receive(event('release',{outcome:'commit'}));
 assert.equal(h.commits(),1);assert.equal(h.releases(),1);assert(!h.bridge.frozen());
 await h.tick(60500);assert.equal(h.cancelled(),0);assert.deepEqual(h.errors,[]);
});
test('media timer fires at 60.5 seconds once, repeated stage events never renew, and timer alone never thaws',async t=>{
 const h=fixture(t);await h.bridge.receive(event('prepare',{noteIds:['note']}));await h.bridge.receive(event('adoptionMedia'));
 await h.tick(25766);await h.bridge.receive(event('adoptionMedia'));
 await h.tick(34733);assert.equal(h.cancelled(),0);
 await h.tick(1);assert.equal(h.cancelled(),1);assert(h.bridge.frozen());assert.equal(h.releases(),0);
 await h.bridge.receive(event('adoptionMedia'));await h.tick(100);
 assert(h.cancelled()>=2,'lost/pending terminal receipt keeps cancellation recovery active');assert(h.bridge.frozen());
 await h.bridge.receive(event('release',{outcome:'abort'}));
 assert.equal(h.releases(),1);assert.equal(h.commits(),0);assert(!h.bridge.frozen());
});
test('media stage can arrive while the accepted prepare ACK invoke promise is still unresolved',async t=>{
 const ack=deferred();let h;
 h=fixture(t,{onReady:async()=>{await h.bridge.receive(event('adoptionMedia'));return ack.promise;}});
 const preparing=h.bridge.receive(event('prepare',{noteIds:['note']}));await settle();
 assert(h.replies.some(r=>r.ready===true));await h.tick(25766);
 assert.equal(h.cancelled(),0);assert(h.bridge.frozen());
 ack.resolve({operationId:'op',outcome:'pending'});await preparing;
 await h.bridge.receive(event('release',{outcome:'abort'}));assert.equal(h.releases(),1);
});
test('wrong-order, wrong-operation, wrong-session and malformed events leave the original prepare deadline unchanged',async t=>{
 const flushing=deferred(),h=fixture(t,{flush:()=>flushing.promise});
 await h.bridge.receive(event('adoptionMedia'));
 const preparing=h.bridge.receive(event('prepare',{noteIds:['note']}));await settle();
 await h.bridge.receive(event('adoptionMedia')); // Flush/prepare ACK has not completed.
 flushing.resolve();await preparing;
 await h.bridge.receive(event('adoptionMedia',{operationId:'other'}));
 await h.bridge.receive(event('adoptionMedia',{sessionId:'old-session'}));
 await assert.rejects(h.bridge.receive(event('adoptionMedia',{extra:true})),/同步窗口/);
 await h.tick(5499);assert.equal(h.cancelled(),0);await h.tick(1);
 assert.equal(h.cancelled(),1);assert(h.bridge.frozen());assert.equal(h.releases(),0);
 await h.bridge.receive(event('release',{outcome:'abort'}));
 const replies=h.replies.length;await h.bridge.receive(event('adoptionMedia'));await h.tick(60500);
 assert.equal(h.replies.length,replies,'completed/stale media never creates or revives an operation');
});
test('ordinary apply without a media event still cancels at the original 5.5-second renderer deadline',async t=>{
 const h=fixture(t);await h.bridge.receive(event('prepare',{noteIds:['note']}));
 await h.tick(5499);assert.equal(h.cancelled(),0);await h.tick(1);
 assert.equal(h.cancelled(),1);assert(h.bridge.frozen());assert.equal(h.releases(),0);
 await h.bridge.receive(event('release',{outcome:'abort'}));assert.equal(h.releases(),1);
});
test('invalidated permission or lease cannot gain a media extension',async t=>{
 const h=fixture(t);await h.bridge.receive(event('prepare',{noteIds:['note']}));
 h.snapshot.blocked=true;await h.bridge.receive(event('adoptionMedia'));h.snapshot.blocked=false;
 h.snapshot.protectedNoteIds=['note'];await h.bridge.receive(event('adoptionMedia'));h.snapshot.protectedNoteIds=[];
 h.invalidLease();await h.bridge.receive(event('adoptionMedia'));
 await h.tick(5500);assert.equal(h.cancelled(),1);assert(h.bridge.frozen());
 await h.bridge.receive(event('release',{outcome:'abort'}));assert.equal(h.releases(),1);
});
test('saved prepare and media callbacks cannot cancel a replacement operation after release',async t=>{
 const h=fixture(t),timers=captureTimers(t);
 for(const delay of [5500,60500]) {
  const oldId='old-'+delay,newId='new-'+delay;
  await h.bridge.receive(event('prepare',{operationId:oldId,noteIds:['old-note']}));
  if(delay===60500)await h.bridge.receive(event('adoptionMedia',{operationId:oldId}));
  const stale=timers.at(-1);assert.equal(stale.delay,delay);
  await h.bridge.receive(event('release',{operationId:oldId,outcome:'abort'}));
  await h.bridge.receive(event('prepare',{operationId:newId,noteIds:['new-note']}));
  const replies=h.replies.length,releases=h.releases();stale.fire();await settle();
  assert.equal(h.replies.length,replies);assert.equal(h.releases(),releases);assert(h.bridge.frozen('new-note'));
  await h.bridge.receive(event('release',{operationId:newId,outcome:'abort'}));
 }
});
test('saved callbacks do not cancel after Session replacement even before check/receive observes it',async t=>{
 const h=fixture(t),timers=captureTimers(t);
 for(const delay of [5500,60500]) {
  const oldSession=h.snapshot.sessionId,oldId='old-'+delay,newId='new-'+delay;
  await h.bridge.receive(event('prepare',{operationId:oldId,sessionId:oldSession,noteIds:['old-note']}));
  if(delay===60500)await h.bridge.receive(event('adoptionMedia',{operationId:oldId,sessionId:oldSession}));
  const stale=timers.at(-1);assert.equal(stale.delay,delay);
  h.snapshot.sessionId='session-'+delay;
  const replies=h.replies.length,releases=h.releases();stale.fire();await settle();
  assert.equal(h.replies.length,replies);assert.equal(h.releases(),releases);assert(h.bridge.frozen('old-note'));
  h.bridge.check();assert.equal(h.releases(),releases+1);
  await h.bridge.receive(event('prepare',{operationId:newId,sessionId:h.snapshot.sessionId,noteIds:['new-note']}));
  const current=timers.at(-1),before=h.replies.length;stale.fire();await settle();
  assert.equal(h.replies.length,before);assert(h.bridge.frozen('new-note'));
  current.fire();await settle();assert.equal(h.replies.at(-1).ready,false);assert.equal(h.replies.at(-1).operationId,newId);
  assert(h.bridge.frozen('new-note'),'even the current timer cannot thaw without a terminal');
  await h.bridge.receive(event('release',{operationId:newId,sessionId:h.snapshot.sessionId,outcome:'abort'}));
 }
});
test('a queued old prepare callback cannot defeat the media deadline on the same operation',async t=>{
 const h=fixture(t),timers=captureTimers(t);
 await h.bridge.receive(event('prepare',{noteIds:['note']}));const prepare=timers.at(-1);
 await h.bridge.receive(event('adoptionMedia'));const media=timers.at(-1);
 prepare.fire();await settle();assert.equal(h.cancelled(),0);assert(h.bridge.frozen());
 media.fire();await settle();assert.equal(h.cancelled(),1);assert(h.bridge.frozen());
 await h.bridge.receive(event('release',{outcome:'abort'}));assert.equal(h.releases(),1);
});
