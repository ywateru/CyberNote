import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createLocalJWKSet,exportJWK,generateKeyPair,jwtVerify,SignJWT} from 'jose';
import {createEnrollment,enrollmentSigner,ENROLLMENT_AUDIENCE} from '../src/account-enrollment.js';
import {LogtoIdentity} from '../src/identity.js';
import {coordinatorAuthConfiguration} from '../src/deployment-config.js';
import {ProductPolicy} from '../src/products.js';
import {accountWorkspace} from '../src/account-profile.js';
import {redisFixture} from './redis-fixture.js';

const issuer='https://fixture.example/oidc',origin='https://coordinator.example',resource='https://cybernote.example/api';
async function fixture(){
 const key=await generateKeyPair('ES384'),jwk={...await exportJWK(key.publicKey),kid:'logto-fixture'};
 const auth=coordinatorAuthConfiguration({LOGTO_ISSUER:issuer,LOGTO_RESOURCE:resource,LOGTO_BROWSER_CLIENT_ID:'ConsoleA'});
 const identity=new LogtoIdentity(auth,['ES384'],createLocalJWKSet({keys:[jwk]}));
 const products=new ProductPolicy(JSON.stringify({version:1,products:[{id:'NativeA',name:'Fixture',nativeClientIds:['NativeA'],browserClientIds:['ConsoleA']}]}));
 const rawKey=JSON.stringify(generateKeyPairSync('ec',{namedCurve:'secp384r1'}).privateKey.export({format:'jwk'}));
 const signer=enrollmentSigner(rawKey),seed=Buffer.alloc(32,17),now=Math.floor(Date.now()/1000);
 const options={identity,products,issuer,origin,seed,signer,now:()=>now,rate:async()=>true};
 const handle=createEnrollment(options);
 const token=(changes:Record<string,unknown>={})=>new SignJWT({sub:'user-A',client_id:'NativeA',scope:'connect',...changes})
  .setProtectedHeader({alg:'ES384',kid:jwk.kid}).setIssuer(issuer).setAudience(resource).setIssuedAt(now).setExpirationTime(now+120).sign(key.privateKey);
 const device={deviceId:randomUUID(),noisePublicKey:Buffer.alloc(32,23).toString('base64url')};
 const request=async(body:unknown=device,changes:Record<string,unknown>={},init:RequestInit={})=>handle(new Request(origin+'/api/v1/account/enrollment',{
  method:'POST',body:JSON.stringify(body),...init,headers:{authorization:'Bearer '+await token(changes),'content-type':'application/json',...init.headers}}));
 return {handle,request,token,device,signer,rawKey,now,seed,options};
}

test('enrollment signs exact verified account/device/Noise binding; public JWKS verifies expiry and exposes no private data',async()=>{
 const f=await fixture(),publicResponse=await f.handle(new Request(origin+'/api/v1/account/jwks'));
 assert.equal(publicResponse.status,200);assert.equal(publicResponse.headers.get('cache-control'),'no-store');
 const jwks=await publicResponse.json();assert.deepEqual(Object.keys(jwks.keys[0]).sort(),['alg','crv','kid','kty','use','x','y']);
 const response=await f.request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.deepEqual(Object.keys(body).sort(),['expiresAt','schemaVersion','token']);
 assert.equal(body.expiresAt,f.now+300);assert.equal(body.schemaVersion,1);
 const {payload,protectedHeader}=await jwtVerify(body.token,createLocalJWKSet(jwks),{issuer:origin,audience:ENROLLMENT_AUDIENCE,algorithms:['ES384']});
 assert.equal(protectedHeader.kid,f.signer.kid);
 assert.deepEqual(payload,{...f.device,accountIssuer:issuer,productId:'NativeA',
  workspaceId:accountWorkspace(f.seed,issuer,'user-A','NativeA'),purpose:'pair',iss:origin,aud:ENROLLMENT_AUDIENCE,
  sub:'user-A',iat:f.now,exp:f.now+300,jti:payload.jti});
 assert.match(String(payload.jti),/^[0-9a-f-]{36}$/);
 await assert.rejects(()=>jwtVerify(body.token,createLocalJWKSet(jwks),{issuer:origin,audience:ENROLLMENT_AUDIENCE,algorithms:['ES384'],currentDate:new Date((f.now+301)*1000)}));
 for(const options of [{issuer:'https://other.example'},{audience:'other-purpose'}])await assert.rejects(()=>jwtVerify(body.token,createLocalJWKSet(jwks),options));
 const repeated=await(await f.request()).json();assert.notEqual(repeated.token,body.token);
 const other=await(await f.request(f.device,{sub:'user-B'})).json();
 assert.notEqual((await jwtVerify(other.token,createLocalJWKSet(jwks))).payload.workspaceId,payload.workspaceId);
 const attacker=await f.handle(new Request('https://attacker.example/api/v1/account/enrollment',{method:'POST',headers:{authorization:'Bearer '+await f.token(),'content-type':'application/json'},body:JSON.stringify(f.device)}));
 assert.equal((await jwtVerify((await attacker.json()).token,createLocalJWKSet(jwks))).payload.iss,origin);
});

test('enrollment rejects untrusted identities, forged owner fields, malformed keys, unbounded bodies and unsupported routes',async()=>{
 const f=await fixture();
 assert.equal((await f.handle(new Request(origin+'/api/v1/account/enrollment',{method:'POST',body:'{}'}))).status,401);
 for(const change of [{client_id:'OtherNative'},{client_id:'ConsoleA'}])assert.equal((await f.request(f.device,change)).status,403);
 for(const change of [{scope:'openid'},{gty:'client_credentials'}])assert.equal((await f.request(f.device,change)).status,401);
 for(const body of [null,[],{}, {...f.device,subject:'forged'}, {...f.device,workspaceId:randomUUID()},
  {...f.device,deviceId:'not-a-uuid'},{...f.device,deviceId:f.device.deviceId.toUpperCase()},
  {...f.device,noisePublicKey:f.device.noisePublicKey+'='},{...f.device,noisePublicKey:Buffer.alloc(31).toString('base64url')}])assert.equal((await f.request(body)).status,400);
 assert.equal((await f.request(f.device,{}, {headers:{'content-type':'text/plain'}})).status,415);
 assert.equal((await f.request(f.device,{}, {body:'{invalid'})).status,400);
 assert.equal((await f.request(f.device,{}, {body:'x'.repeat(2049)})).status,413);
 for(const method of ['GET','HEAD','PUT','DELETE','OPTIONS'])assert.equal((await f.handle(new Request(origin+'/api/v1/account/enrollment',{method}))).status,405);
 assert.equal((await f.handle(new Request(origin+'/api/v1/account/jwks?subject=forged'))).status,400);
 assert.equal((await f.handle(new Request(origin+'/api/v1/account/jwks',{method:'POST',body:'{}'}))).status,405);
});

test('enrollment signing key must be explicit private ES384; stable public fingerprint excludes caller kid/private data',()=>{
 const raw=generateKeyPairSync('ec',{namedCurve:'secp384r1'}).privateKey.export({format:'jwk'});
 for(const value of [undefined,'','{}','invalid',JSON.stringify({...raw,d:undefined}),JSON.stringify({...raw,alg:'ES256'}),JSON.stringify({...raw,use:'enc'}),JSON.stringify({...raw,d:'broken'}),JSON.stringify({...raw,d:Buffer.alloc(48,17).toString('base64url')})])assert.throws(()=>enrollmentSigner(value));
 const a=enrollmentSigner(JSON.stringify(raw)),b=enrollmentSigner(JSON.stringify({...raw,kid:'untrusted-label'}));
 assert.equal(a.kid,b.kid);assert.deepEqual(a.publicJWK,b.publicJWK);assert(!('d' in a.publicJWK));
});

test('two enrollment instances share real Redis source and account budgets; public keys do not spend signing quota',async t=>{
 const redis=await redisFixture(t);if(!redis)return;
 const f=await fixture(),first=redis.store({},redis.prefix),second=redis.store({},redis.prefix);
 const handlers=[first,second].map(store=>createEnrollment({...f.options,rate:(key,limit)=>store.rate(key,Date.now(),limit)}));
 const token=await f.token(),request=()=>new Request(origin+'/api/v1/account/enrollment',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(f.device)});
 for(let i=0;i<30;i++)assert.equal((await handlers[i%2]!(request(),'192.0.2.1')).status,200);
 for(const handler of handlers){const denied=await handler(request(),'192.0.2.1');assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'60');}
 assert.equal((await handlers[1]!(request(),'192.0.2.2')).status,200);
 for(let i=0;i<10;i++)assert.equal((await handlers[i%2]!(new Request(origin+'/api/v1/account/jwks'),'192.0.2.1')).status,200);
 // Distinct source addresses cannot bypass the verified-account budget.
 for(let i=31;i<60;i++)assert.equal((await handlers[i%2]!(request(),'192.0.2.'+(i+2))).status,200);
 assert.equal((await handlers[0]!(request(),'192.0.2.250')).status,429);
 // Another owner on a fresh source still has its own budget.
 const otherToken=await f.token({sub:'user-B'});
 assert.equal((await handlers[1]!(new Request(origin+'/api/v1/account/enrollment',{
  method:'POST',headers:{authorization:'Bearer '+otherToken,'content-type':'application/json'},body:JSON.stringify(f.device)}),'192.0.2.251')).status,200);
});
