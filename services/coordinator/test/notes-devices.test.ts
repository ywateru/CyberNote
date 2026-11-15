import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {createNotesDevices,notesScope,type NotesDeviceUpdate,type NotesScope} from '../src/notes-devices.js';
import {MemoryStore} from '../src/memory.js';
import {LogtoIdentity} from '../src/identity.js';
import {coordinatorAuthConfiguration} from '../src/deployment-config.js';
import {ProductPolicy} from '../src/products.js';
import {createAccountCoordinator} from '../src/account-config.js';
import {ApiError,SESSION_TTL,type Store,type DeviceSession} from '../src/types.js';
import {redisFixture} from './redis-fixture.js';

const issuer='https://fixture.example/oidc',origin='https://coordinator.example',resource='https://notes.example/api';
const products=new ProductPolicy(JSON.stringify({version:1,products:[
 {id:'NativeA',name:'Notes',nativeClientIds:['NativeA','AliasA'],browserClientIds:['WebA']},
 {id:'NativeB',name:'Other',nativeClientIds:['NativeB'],browserClientIds:['WebB']},
]}));
const scope:NotesScope={issuer,subject:'owner-a',productId:'NativeA'};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const keys=new Map<string,string>();
function registryKey(id:string){let key=keys.get(id);if(!key){key=randomBytes(32).toString('base64url');keys.set(id,key);}return key;}
function put(store:Store,scope:NotesScope,sessionHash:string,value:NotesDeviceUpdate,now:number,revision=1,key=registryKey(value.deviceId)){
 return store.putNotesDevice(scope,sessionHash,value,{keyHash:hash(key),revision,requestDigest:hash(JSON.stringify([value,sessionHash,revision,key]))},now);
}
const code=(expected:string)=>(e:unknown)=>e instanceof ApiError&&e.code===expected;
const publication={ports:[],tunnelUrl:null,certificateFingerprint:'a'.repeat(64),iroh:null};
const update=(changes:Partial<NotesDeviceUpdate>={}):NotesDeviceUpdate=>({deviceId:randomUUID(),name:'Fixture desktop',summary:{noteCount:3,lastNoteUpdatedAt:1700000000123,capturedAt:1700000001000},syncAvailable:true,protocolDeviceId:randomUUID(),noisePublicKey:Buffer.alloc(32,17).toString('base64url'),...changes});
async function register(store:Store,now=Date.now(),owner='owner-a',product='NativeA',client=product){
 const r=await store.register(owner,product,'SDK fixture',randomBytes(32).toString('base64url'),randomUUID(),now,1,undefined,{authClientId:client,policyMode:'static'});
 assert.equal(r.session.purpose,'device');return {...r,session:r.session as DeviceSession};
}
async function api(store:Store,clock=Date.now){
 const keys=await generateKeyPair('ES384'),jwk={...await exportJWK(keys.publicKey),kid:'notes-fixture'};
 const auth=coordinatorAuthConfiguration({LOGTO_ISSUER:issuer,LOGTO_RESOURCE:resource,LOGTO_BROWSER_CLIENT_ID:'WebA'});
 const identity=new LogtoIdentity(auth,['ES384'],createLocalJWKSet({keys:[jwk]}));
 const options={identity,products,issuer,seed:Buffer.alloc(32,17),store,now:clock};
 const handle=createNotesDevices(options),now=Math.floor(Date.now()/1000);
 const token=(changes:Record<string,unknown>={})=>new SignJWT({sub:scope.subject,client_id:'NativeA',scope:'connect',iss:issuer,aud:resource,iat:now,exp:now+120,...changes}).setProtectedHeader({alg:'ES384',kid:jwk.kid}).sign(keys.privateKey);
 const request=async(method='GET',body?:unknown,changes:Record<string,unknown>={},init:RequestInit={},path='/api/v1/notes/devices'+(method==='PUT'?'/self':''))=>{
  const response=await handle(new Request(origin+path,{method,body:body===undefined?undefined:JSON.stringify(body),...init,headers:{authorization:'Bearer '+await token(changes),'content-type':'application/json',...init.headers}}));
  return {status:response.status,data:await response.json() as any,headers:response.headers};
 };
 return {handle,token,request,options};
}

test('notes API real bearer, exact safe JSON, Native aliases, owner/product/issuer isolation',async t=>{
 const store=new MemoryStore();t.after(()=>store.close());const f=await api(store),a=await register(store),v=update();
 const response=await f.request('PUT',{...v,registryKey:registryKey(v.deviceId),revision:1,transportSessionKey:a.sessionKey});assert.equal(response.status,200);
 assert.deepEqual(response.data,{schemaVersion:1,device:{id:v.deviceId,name:v.name,online:true,syncAvailable:true,summary:v.summary,transportDeviceId:a.session.deviceId,protocolDeviceId:v.protocolDeviceId,noisePublicKey:v.noisePublicKey}});
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const list=await f.request();assert.deepEqual(list.data,{schemaVersion:1,devices:[response.data.device]});
 assert.deepEqual((await f.request('GET',undefined,{client_id:'AliasA'})).data,list.data);
 for(const changes of [{sub:'owner-b'},{client_id:'NativeB'}])assert.deepEqual((await f.request('GET',undefined,changes)).data,{schemaVersion:1,devices:[]});
 assert.deepEqual(await store.notesDevices({...scope,issuer:'https://other.example/oidc'},Date.now()),[]);
 for(const secret of [a.sessionKey,a.session.hash,a.session.incarnation!,registryKey(v.deviceId)]){
  if(secret.length>3)assert.equal(JSON.stringify(list.data).includes(secret),false);
 }
 const text=JSON.stringify(list.data);for(const field of ['subject','productId','sessionKey','sessionHash','registryKey','keyHash','revision','requestDigest','leaseUntil','incarnation'])assert.equal(text.includes(field),false);
});

test('notes API rejects invalid identity, foreign/console sessions, removed Native mapping and credentials never echoed',async t=>{
 const store=new MemoryStore();t.after(()=>store.close());const f=await api(store),a=await register(store),v=update();
 for(const changes of [{iss:'https://other.example/oidc'},{aud:'wrong'},{scope:'disconnect'},{exp:1},{gty:'client_credentials'}])assert.equal((await f.request('GET',undefined,changes)).status,401);
 for(const client_id of ['WebA','Unknown'])assert.equal((await f.request('GET',undefined,{client_id})).status,403);
 assert.equal((await f.handle(new Request(origin+'/api/v1/notes/devices'))).status,401);
 for(const [owner,product] of [['owner-b','NativeA'],['owner-a','NativeB']] as const){const other=await register(store,Date.now(),owner,product);const r=await f.request('PUT',{...v,registryKey:registryKey(v.deviceId),revision:1,transportSessionKey:other.sessionKey});assert.equal(r.status,403);assert(!JSON.stringify(r.data).includes(other.sessionKey));}
 const web=await store.register('owner-a',null,'Web',undefined,randomUUID(),Date.now(),undefined,undefined,{authClientId:'WebA',policyMode:'static'});
 assert.equal((await f.request('PUT',{...v,registryKey:registryKey(v.deviceId),revision:1,transportSessionKey:web.sessionKey})).status,401);
 assert.equal((await f.request('PUT',{...v,registryKey:registryKey(v.deviceId),revision:1,transportSessionKey:randomBytes(32).toString('base64url')})).status,401);
 const alias=await register(store,Date.now(),'owner-a','NativeA','AliasA');
 const removed=new ProductPolicy(JSON.stringify({version:1,products:[{id:'NativeA',name:'Notes',nativeClientIds:['NativeA'],browserClientIds:['WebA']}]}));
 const next=createNotesDevices({...f.options,products:removed});
 const denied=await next(new Request(origin+'/api/v1/notes/devices/self',{method:'PUT',headers:{authorization:'Bearer '+await f.token(),'content-type':'application/json'},body:JSON.stringify({...v,registryKey:registryKey(v.deviceId),revision:1,transportSessionKey:alias.sessionKey})}));assert.equal(denied.status,403);
 await store.revoke(a.session.hash);assert.equal((await f.request('PUT',{...v,registryKey:registryKey(v.deviceId),revision:1,transportSessionKey:a.sessionKey})).status,401);
 assert.deepEqual((await f.request()).data.devices,[]);
});

test('notes API strict routes, bounded UTF-8 JSON, exact fields, finite summary and enabled identity pairing',async t=>{
 const store=new MemoryStore();t.after(()=>store.close());const f=await api(store),a=await register(store),v=update(),good={...v,registryKey:registryKey(v.deviceId),revision:1,transportSessionKey:a.sessionKey};
 for(const body of [null,[],{}, {...good,owner:'forged'},{...good,deviceId:v.deviceId.toUpperCase()}, {...good,deviceId:'00000000-0000-5000-8000-000000000000'},
  {...good,name:''},{...good,name:'\u0000bad'},{...good,name:'x'.repeat(97)},{...good,name:'\ud800'},
  {...good,summary:{...v.summary,unexpected:1}},{...good,summary:{noteCount:-1,lastNoteUpdatedAt:0,capturedAt:0}},
  {...good,summary:{noteCount:Number.MAX_SAFE_INTEGER+1,lastNoteUpdatedAt:0,capturedAt:0}},
  {...good,summary:{noteCount:0,lastNoteUpdatedAt:0,capturedAt:0}},{...good,summary:{noteCount:1,lastNoteUpdatedAt:null,capturedAt:0}},
  {...good,summary:{noteCount:1,lastNoteUpdatedAt:0,capturedAt:-1}},
  {...good,syncAvailable:1},{...good,syncAvailable:false},{...good,protocolDeviceId:null},{...good,noisePublicKey:v.noisePublicKey+'='},
  {...good,transportSessionKey:'not-a-key'},{...good,registryKey:undefined},{...good,registryKey:'not-a-key'},
  {...good,revision:undefined},{...good,revision:0},{...good,revision:-1},{...good,revision:1.5},{...good,revision:Number.MAX_SAFE_INTEGER+1}])assert.equal((await f.request('PUT',body)).status,400);
 assert.equal((await f.request('PUT',good,{}, {body:'x'.repeat(8193)})).status,413);
 assert.equal((await f.request('PUT',good,{}, {body:'{broken'})).status,400);
 assert.equal((await f.request('PUT',good,{}, {body:new Uint8Array([0xff])})).status,400);
 assert.equal((await f.request('PUT',good,{}, {headers:{'content-type':'text/plain'}})).status,415);
 for(const [path,method] of [['/api/v1/notes/devices','POST'],['/api/v1/notes/devices/self','GET']] as const){const r=await f.request(method,undefined,{}, {},path);assert.equal(r.status,405);}
 assert.equal((await f.request('GET',undefined,{}, {},'/api/v1/notes/devices?owner=forged')).status,400);
 assert.equal((await f.request('GET',undefined,{}, {},'/api/v1/notes/devices/other')).status,404);
 assert.equal((await f.request('GET',undefined,{}, {headers:{'content-length':'1'}})).status,400);
 const paused={...good,revision:2,name:'  本机  ',summary:null,syncAvailable:false,protocolDeviceId:null,noisePublicKey:null};
 const result=await f.request('PUT',paused);assert.equal(result.status,200);assert.equal(result.data.device.name,'本机');assert.equal(result.data.device.summary,null);assert.equal(result.data.device.syncAvailable,false);
});

for(const kind of ['memory','redis'] as const){
 test(`${kind} registry key binding, exact replay without lease renewal, same-revision conflicts and pause fence`,async t=>{
  let now=Date.now();const redis=kind==='redis'?await redisFixture(t):undefined;if(kind==='redis'&&!redis)return;
  const store:Store=redis?redis.store({},redis.prefix):new MemoryStore({},'legacy-v1',()=>now);if(!redis)t.after(()=>store.close());
  const a=await register(store,now),b=await register(store,now),v=update(),f=await api(store,()=>now);
  const good={...v,registryKey:registryKey(v.deviceId),revision:1,transportSessionKey:a.sessionKey};
  assert.equal((await f.request('PUT',good)).status,200);
  const storedKey=redis?'{'+redis.prefix+'}:notes:devices:'+notesScope(scope):'';
  const before=redis?await redis.client.hGet(storedKey,v.deviceId):null;
  assert.equal((await f.request('PUT',good)).status,200);
  if(redis)assert.equal(await redis.client.hGet(storedKey,v.deviceId),before);
  for(const changes of [{name:'Other'}, {summary:null}, {transportSessionKey:b.sessionKey}, {name:' '+v.name+' '}, {protocolDeviceId:randomUUID()}]){
   const conflict=await f.request('PUT',{...good,...changes});assert.equal(conflict.status,409);assert.equal(conflict.data.error.code,'DEVICE_REVISION_CONFLICT');
  }
  const intruder=await f.request('PUT',{...good,registryKey:randomBytes(32).toString('base64url'),revision:99,transportSessionKey:b.sessionKey});assert.equal(intruder.status,403);assert.equal(intruder.data.error.code,'REGISTRY_KEY_MISMATCH');
  // Keep the SDK session online while the app-specific presence expires.
  if(redis){const row=JSON.parse(before!);row.leaseUntil=0;await redis.client.hSet(storedKey,v.deviceId,JSON.stringify(row));}
  else{now+=30_000;await store.publish(a.session,publication,a.session.incarnation,1,now);now+=35_000;}
  const replay=await f.request('PUT',good);assert.equal(replay.status,200);assert.equal(replay.data.device.online,false);
  // A higher persisted revision renews, then a pause cannot be undone by a late earlier heartbeat.
  await store.publish(b.session,publication,b.session.incarnation,1,now);
  assert.equal((await f.request('PUT',{...good,revision:2,transportSessionKey:b.sessionKey})).data.device.online,true);
  const paused={...good,revision:3,transportSessionKey:b.sessionKey,syncAvailable:false,protocolDeviceId:null,noisePublicKey:null};
  assert.equal((await f.request('PUT',paused)).data.device.syncAvailable,false);
  assert.equal((await f.request('PUT',{...good,revision:2,transportSessionKey:b.sessionKey})).data.error.code,'STALE_DEVICE_REVISION');
  assert.equal((await f.request()).data.devices[0].syncAvailable,false);
 });

 test(`${kind} first registry key claim is atomic and revoke after HTTP lookup cannot create a row`,async t=>{
  const redis=kind==='redis'?await redisFixture(t):undefined;if(kind==='redis'&&!redis)return;
  const store:Store=redis?redis.store({},redis.prefix):new MemoryStore();if(!redis)t.after(()=>store.close());
  const a=await register(store),b=await register(store),v=update();
  const writes=await Promise.allSettled([put(store,scope,a.session.hash,v,0),put(store,scope,b.session.hash,v,0,1,randomBytes(32).toString('base64url'))]);
  assert.equal(writes.filter(w=>w.status==='fulfilled').length,1);assert.equal(writes.filter(w=>w.status==='rejected'&&code('REGISTRY_KEY_MISMATCH')(w.reason)).length,1);
  const original=store.session.bind(store);store.session=async h=>{const s=await original(h);await store.revoke(h);return s;};
  const f=await api(store),fresh=update(),denied=await f.request('PUT',{...fresh,registryKey:registryKey(fresh.deviceId),revision:1,transportSessionKey:a.sessionKey});
  assert.equal(denied.status,401);assert.equal((await store.notesDevices(scope,Date.now())).some(d=>d.id===fresh.deviceId),false);
 });

 test(`${kind} registry persists offline rows, independently fences transport online and preserves note timestamp`,async t=>{
  let now=Date.now();const redis=kind==='redis'?await redisFixture(t):undefined;if(kind==='redis'&&!redis)return;
  const store:Store=redis?redis.store({},redis.prefix):new MemoryStore({},'legacy-v1',()=>now);if(!redis)t.after(()=>store.close());
  const a=await register(store,now),v=update();await put(store,scope,a.session.hash,v,now);
  const first=(await store.notesDevices(scope,now))[0]!;assert.equal(first.online,true);
  if(redis){const key='{'+redis.prefix+'}:notes:devices:'+notesScope(scope);const stored=JSON.parse((await redis.client.hGet(key,v.deviceId))!);stored.leaseUntil=0;await redis.client.hSet(key,v.deviceId,JSON.stringify(stored));assert.equal(await redis.client.pTTL(key),-1);}
  else now+=65_000;
  const offline=(await store.notesDevices(scope,now))[0]!;assert.equal(offline.id,v.deviceId);assert.equal(offline.name,v.name);assert.equal(offline.online,false);assert.equal(offline.summary,null);assert.equal(offline.syncAvailable,false);assert.equal(offline.transportDeviceId,null);
  // A registry renewal cannot substitute for an SDK transport heartbeat.
  if(redis){const key='{'+redis.prefix+'}:devices',d=JSON.parse((await redis.client.hGet(key,a.session.deviceId))!);d.lastSeen=0;await redis.client.hSet(key,a.session.deviceId,JSON.stringify(d));}
  await put(store,scope,a.session.hash,{...v,name:'Renamed'},now,2);assert.equal((await store.notesDevices(scope,now))[0]!.online,false);
  await store.publish(a.session,publication,a.session.incarnation,1,now);
  const renewed=await put(store,scope,a.session.hash,{...v,name:'Renamed'},now,3);assert.equal(renewed.online,true);assert.deepEqual(renewed.summary,v.summary);
  await store.revoke(a.session.hash);await store.cleanup(now);const revoked=(await store.notesDevices(scope,now))[0]!;assert.equal(revoked.online,false);assert.equal(revoked.name,'Renamed');
 });

 test(`${kind} atomic registry revision fence rejects old transport and same-session late publication`,async t=>{
  const redis=kind==='redis'?await redisFixture(t):undefined;if(kind==='redis'&&!redis)return;
  const store:Store=redis?redis.store({},redis.prefix):new MemoryStore();if(!redis)t.after(()=>store.close());
  const old=await register(store),next=await register(store),v=update();
  if(redis){const key='{'+redis.prefix+'}:sessions',s=JSON.parse((await redis.client.hGet(key,next.session.hash))!);s.expiresAt=Date.now()+60000;await redis.client.hSet(key,next.session.hash,JSON.stringify(s));}
  await put(store,scope,next.session.hash,{...v,name:'New session'},Date.now(),2);
  await assert.rejects(put(store,scope,old.session.hash,{...v,name:'Late old'},Date.now()),code('STALE_DEVICE_REVISION'));
  assert.equal((await store.notesDevices(scope,Date.now()))[0]!.name,'New session');
  // Both valid sessions race on another registry ID: larger persisted revision wins in either scheduling order.
  const racing=update(),writes=await Promise.allSettled([put(store,scope,next.session.hash,{...racing,name:'Winner'},Date.now(),2),put(store,scope,old.session.hash,{...racing,name:'Old'},Date.now())]);
  assert.equal(writes[0]!.status,'fulfilled');assert.equal((await store.notesDevices(scope,Date.now())).find(d=>d.id===racing.deviceId)!.name,'Winner');
  await store.revoke(next.session.hash);
  await assert.rejects(put(store,scope,old.session.hash,v,Date.now()),code('STALE_DEVICE_REVISION'));
 });

 test(`${kind} registry enforces 64 persistent devices per owner/product, updates allowed, no silent eviction`,async t=>{
  const redis=kind==='redis'?await redisFixture(t):undefined;if(kind==='redis'&&!redis)return;
  const store:Store=redis?redis.store({},redis.prefix):new MemoryStore();if(!redis)t.after(()=>store.close());
  const a=await register(store),values=Array.from({length:64},()=>update());
  await Promise.all(values.map(v=>put(store,scope,a.session.hash,v,Date.now())));
  await assert.rejects(put(store,scope,a.session.hash,update(),Date.now()),code('NOTES_DEVICE_LIMIT'));
  await put(store,scope,a.session.hash,{...values[0]!,name:'Changed at capacity'},Date.now(),2);
  const otherScope={...scope,subject:'owner-b'},other=await register(store,Date.now(),'owner-b');await put(store,otherScope,other.session.hash,values[0]!,Date.now());
  const otherProduct={...scope,productId:'NativeB'},b=await register(store,Date.now(),'owner-a','NativeB');await put(store,otherProduct,b.session.hash,values[0]!,Date.now());
  assert.equal((await store.notesDevices(scope,Date.now())).length,64);assert.equal((await store.notesDevices(otherScope,Date.now())).length,1);assert.equal((await store.notesDevices(otherProduct,Date.now())).length,1);
  await store.revoke(a.session.hash);assert.equal((await store.notesDevices(scope,Date.now())).length,64);assert((await store.notesDevices(scope,Date.now())).every(d=>!d.online));
 });
}

test('Redis process/AOF and handler restart preserve registry; clean transport epoch reset retains registry key/revision fencing',async t=>{
 const redis=await redisFixture(t);if(!redis)return;const first=redis.store({},redis.prefix),a=await register(first),v=update();
 await put(first,scope,a.session.hash,v,Date.now());first.close();await redis.restart();
 const second=redis.store({},redis.prefix);assert.equal((await second.notesDevices(scope,Date.now()))[0]!.id,v.deviceId);
 const prefix='{'+redis.prefix+'}:';
 // Simulate deliberate removal of the complete transient coordinator namespace,
 // preserving only app registry.
 for(const key of await redis.client.keys(prefix+'*'))if(!key.startsWith(prefix+'notes:'))await redis.client.del(key);
 const fresh=redis.store({},redis.prefix);await fresh.ready();assert.notEqual(fresh.epoch,first.epoch);
 const offline=(await fresh.notesDevices(scope,Date.now()))[0]!;assert.equal(offline.online,false);assert.equal(offline.id,v.deviceId);
 const next=await register(fresh);
 const resumed=await put(fresh,scope,next.session.hash,v,Date.now(),2);assert.equal(resumed.online,true);assert.equal((await fresh.notesDevices(scope,Date.now())).length,1);
 const stored=await redis.client.hGet(prefix+'notes:devices:'+notesScope(scope),v.deviceId);assert(!stored!.includes(a.sessionKey));assert(!stored!.includes(next.sessionKey));
});

test('Redis exact safe-integer summary/revision serialization and expired sessions fail closed',async t=>{
 const redis=await redisFixture(t);if(!redis)return;const store=redis.store({},redis.prefix),a=await register(store),v=update({summary:{noteCount:Number.MAX_SAFE_INTEGER,lastNoteUpdatedAt:Number.MAX_SAFE_INTEGER,capturedAt:Number.MAX_SAFE_INTEGER}});
 assert.deepEqual((await put(store,scope,a.session.hash,v,0,Number.MAX_SAFE_INTEGER-1)).summary,v.summary);
 assert.deepEqual((await store.notesDevices(scope,0))[0]!.summary,v.summary);
 await put(store,scope,a.session.hash,{...v,name:'Max revision'},0,Number.MAX_SAFE_INTEGER);
 await assert.rejects(put(store,scope,a.session.hash,v,0,Number.MAX_SAFE_INTEGER-1),code('STALE_DEVICE_REVISION'));
 await redis.client.zAdd('{'+redis.prefix+'}:sessions:expiry',{score:0,value:a.session.hash});await store.cleanup(0);
 await assert.rejects(put(store,scope,a.session.hash,v,0,Number.MAX_SAFE_INTEGER),code('INVALID_SESSION'));assert.equal((await store.notesDevices(scope,0)).length,1);
});

test('memory session expiry/transport GC retain registry; storage schema cannot be bypassed',async t=>{
 let now=Date.now();const store=new MemoryStore({},'legacy-v1',()=>now);t.after(()=>store.close());const a=await register(store,now),v=update();
 await put(store,scope,a.session.hash,v,now);now+=SESSION_TTL+1;await store.cleanup(now);
 assert.equal(await store.session(a.session.hash),undefined);assert.equal(await store.device(a.session.deviceId,now),undefined);
 assert.equal((await store.notesDevices(scope,now))[0]!.online,false);
 await assert.rejects(put(store,scope,a.session.hash,{...v,summary:{noteCount:-1,lastNoteUpdatedAt:0,capturedAt:0}},now),code('INVALID_INPUT'));
});

test('registry Redis corruption fails closed without replacing the last accepted row',async t=>{
 const redis=await redisFixture(t);if(!redis)return;const store=redis.store({},redis.prefix),a=await register(store),v=update();await put(store,scope,a.session.hash,v,0);
 const key='{'+redis.prefix+'}:notes:devices:'+notesScope(scope),before=await redis.client.hGet(key,v.deviceId);
 await assert.rejects(put(store,scope,a.session.hash,{...v,name:'forged'},0,2,randomBytes(32).toString('base64url')),code('REGISTRY_KEY_MISMATCH'));assert.equal(await redis.client.hGet(key,v.deviceId),before);
 await redis.client.del(key);await redis.client.set(key,'wrongtype');await assert.rejects(store.notesDevices(scope,0),code('COORDINATOR_UNAVAILABLE'));
});

test('configured app routes explicitly recognize notes API, reject unsupported methods before touching Redis',async()=>{
 // Reuse configuration contract with a fixture-only public signing key generated locally.
 const {generateKeyPairSync}=await import('node:crypto');
 const configured=createAccountCoordinator({LOGTO_ISSUER:issuer,LOGTO_RESOURCE:resource,LOGTO_BROWSER_CLIENT_ID:'WebA',
  CYBERGRID_PRODUCTS:JSON.stringify({version:1,products:[{id:'NativeA',name:'Notes',nativeClientIds:['NativeA'],browserClientIds:['WebA']}]}),
  CYBERNOTE_WORKSPACE_SEED:Buffer.alloc(32,17).toString('base64url'),CYBERNOTE_ENROLLMENT_JWK:JSON.stringify(generateKeyPairSync('ec',{namedCurve:'secp384r1'}).privateKey.export({format:'jwk'})),
  CYBERGRID_PUBLIC_ORIGIN:origin,CYBERGRID_REDIS_PREFIX:'notes-config-fixture',CYBERGRID_REDIS_TRANSPORT:'tcp',REDIS_URL:'rediss://fixture.invalid:6379'});
 try{assert.equal((await configured.handle(new Request(origin+'/api/v1/notes/devices',{method:'POST'}))).status,405);assert.equal((await configured.handle(new Request(origin+'/api/v1/notes/devices/self'))).status,405);}finally{configured.close();}
});
