// Independent production pool/lifetime probes. Transport deliberately controlled;
// this proves frontend state and release ordering, not Rust/native decoding.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
const output='artifacts/media99ui-independent/pool';
await mkdir(output,{recursive:true});
const vite=await createServer({configFile:false,cacheDir:output+'/vite',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},logLevel:'error'});
const checks=[];
const tick=()=>new Promise(setImmediate);
const grant=(id,purpose='thumbnail',extra={})=>({leaseId:id,url:'http://127.0.0.1:1234/media/'+id,mime:'image/png',bytes:20,name:id,attachmentId:id,noteId:'owner',purpose,...extra});
try{
 const {AttachmentSourcePool}=await vite.ssrLoadModule('/src/attachment-source-pool.ts');
 const {createLeasedAttachmentMediaSource}=await vite.ssrLoadModule('/src/attachment-media.ts');
 for(const bad of [{noteId:'foreign'},{attachmentId:'foreign'},{purpose:'original'}]){
  const releases=[],errors=[];let published=0;
  const pool=new AttachmentSourcePool({acquire:async()=>grant('wrong','thumbnail',bad),release:async id=>releases.push(id)});
  const cancel=pool.request('wrong','owner','thumbnail',160,'v1',()=>published++,e=>errors.push(e.code));
  await tick();cancel();
  assert.equal(published,0);assert.deepEqual(releases,['wrong']);assert.deepEqual(errors,['access_changed']);
 }
 checks.push('mismatched owner, attachment ID and purpose each reject publication and release exact lease once');
 {
  const waiting=[],calls=[],releases=[];let publications=0;
  const pool=new AttachmentSourcePool({acquire:async(id,purpose)=>{calls.push(id);return new Promise(resolve=>waiting.push({id,purpose,resolve}));},release:async id=>releases.push(id)},1);
  const a=pool.request('running','owner','thumbnail',160,'v',()=>publications++,()=>assert.fail('retired error'));
  const b=pool.request('queued','owner','thumbnail',160,'v',()=>publications++,()=>assert.fail('retired error'));
  const o=pool.request('original','owner','original',undefined,'v',()=>publications++,()=>assert.fail('retired error'));
  assert.deepEqual(calls,['running','original']);pool.revoke(['owner']);
  for(const row of waiting)row.resolve(grant(row.id,row.purpose));
  await tick();a();b();o();
  assert.equal(publications,0);assert.deepEqual(calls,['running','original']);assert.deepEqual(releases.sort(),['original','running']);
  assert.equal(pool.version('queued','thumbnail'),1);
 }
 checks.push('prepare retires queued and in-flight requests; independent original does not queue; late grants release without errors/publication');
 {
  let resolveGrant;const releases=[],ready=[];let first;
  const pool=new AttachmentSourcePool({acquire:()=>new Promise(r=>resolveGrant=r),release:async id=>releases.push(id)});
  const a=pool.request('reentrant','owner','thumbnail',160,'v',s=>{first=s;ready.push('first');pool.invalidate(['reentrant']);},()=>assert.fail('invalidating ready should not throw'));
  const b=pool.request('reentrant','owner','thumbnail',160,'v',()=>ready.push('second'),()=>assert.fail('invalidating ready should not throw'));
  resolveGrant(grant('reentrant'));await tick();a();b();
  assert.deepEqual(ready,['first']);assert(first.disposed);assert.deepEqual(releases,['reentrant']);
 }
 checks.push('invalidation inside first ready callback prevents subsequent shared consumer publication');
 {
  let rejectGrant,calls=0;const errors=[];
  const pool=new AttachmentSourcePool({acquire:()=>{calls++;return new Promise((_,r)=>rejectGrant=r);},release:async()=>{} });
  const cancel=pool.request('retired-retry','owner','thumbnail',160,'v',()=>assert.fail('unexpected source'),e=>errors.push(e));
  cancel();rejectGrant(Object.assign(Error('gate changed'),{code:'access_changed'}));await tick();
  assert.equal(calls,1);assert.equal(errors.length,0);
 }
 checks.push('retired gate-change failure cannot restart a withdrawn request');
 {
  let calls=0;const errors=[];
  const pool=new AttachmentSourcePool({acquire:async()=>{calls++;throw Object.assign(Error('stale'),{code:'metadata_stale'});},release:async()=>{} });
  const cancel=pool.request('retry-cap','owner','thumbnail',160,'v',()=>assert.fail('unexpected source'),e=>errors.push(e.code));await tick();cancel();
  assert.equal(calls,3);assert.deepEqual(errors,['metadata_stale']);
 }
 checks.push('continuously stale metadata exhausts exactly three fresh attempts and reports failure');
 {
  const sources=new Map(),releases=[],cancels=[];
  const pool=new AttachmentSourcePool({acquire:async(id,purpose)=>grant(id,purpose,{noteId:id==='other'?'other-owner':'owner'}),release:async id=>releases.push(id)});
  for(const [id,owner,purpose] of [['thumb','owner','thumbnail'],['original','owner','original'],['other','other-owner','original']]){
   cancels.push(pool.request(id,owner,purpose,purpose==='thumbnail'?160:undefined,'v',s=>sources.set(id,s),()=>assert.fail('unexpected failure')));
  }
  await tick();const retain=sources.get('original').retain();cancels[1]();assert(!retain.disposed);
  pool.clearThumbnails();assert(sources.get('thumb').disposed);assert(!retain.disposed);assert(!sources.get('other').disposed);
  pool.revoke(['owner']);assert(retain.disposed);assert(!sources.get('other').disposed);
  for(const c of cancels)c();assert.deepEqual(releases.sort(),['original','other','thumb']);
 }
 checks.push('cache clear preserves detached retained original, owner revocation finds it, unrelated owner survives');
 {
  const order=[];const a=createLeasedAttachmentMediaSource({url:'http://127.0.0.1:1234/media/stop',purpose:'original'},async()=>order.push('release'));
  const b=a.retain();a.bindController(()=>{order.push('first');throw Error('controller failure');});a.bindController(()=>order.push('second'));b.bindController(()=>order.push('retained'));
  a.revoke();a.revoke();a.dispose();b.dispose();
  assert.deepEqual(order,['first','second','retained','release']);assert.throws(()=>a.retain());assert.throws(()=>b.retain());
 }
 checks.push('throwing controller cannot bypass remaining synchronous stops, retained disposal, or exactly-once native release');
 await writeFile(output+'/result.json',JSON.stringify({passed:true,checks,scope:'Real production TypeScript pool/source, deferred transport; not Rust/native/performance'},null,2)+'\n');
 console.log('Independent MEDIA99UI pool:',checks.length,'groups passed');
}finally{await vite.close();}
