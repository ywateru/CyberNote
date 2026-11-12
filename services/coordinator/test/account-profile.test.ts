import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {createAccountProfile,accountWorkspace,workspaceSeed} from '../src/account-profile.js';
import {createAccountCoordinator} from '../src/account-config.js';
import {coordinatorAuthConfiguration} from '../src/deployment-config.js';
import {LogtoIdentity} from '../src/identity.js';
import {ProductPolicy} from '../src/products.js';

const issuer='https://fixture.example/oidc',resource='https://cybernote.example/api';
const rawProducts=JSON.stringify({version:1,products:[
 {id:'NativeA',name:'CyberNote',nativeClientIds:['NativeA','NativeAlias'],browserClientIds:['ConsoleA']},
 {id:'NativeB',name:'Separate product fixture',nativeClientIds:['NativeB'],browserClientIds:['ConsoleB']},
]});
const seed=Buffer.alloc(32,17);
async function fixture(){
 const keys=await generateKeyPair('ES384');
 const jwk={...await exportJWK(keys.publicKey),kid:'profile-fixture',alg:'ES384'};
 const auth=coordinatorAuthConfiguration({LOGTO_ISSUER:issuer,LOGTO_RESOURCE:resource,LOGTO_BROWSER_CLIENT_ID:'ConsoleA'});
 const identity=new LogtoIdentity(auth,['ES384'],createLocalJWKSet({keys:[jwk]}));
 const handle=createAccountProfile({identity,issuer,seed,products:new ProductPolicy(rawProducts)});
 const now=Math.floor(Date.now()/1000);
 const claims={sub:'user-A',iss:issuer,aud:resource,client_id:'NativeA',scope:'openid connect',iat:now,exp:now+120};
 const sign=(changes:Record<string,unknown>={},header:Record<string,unknown>={})=>new SignJWT({...claims,...changes})
  .setProtectedHeader({alg:'ES384',kid:jwk.kid,typ:'at+jwt',...header}).sign(keys.privateKey);
 const request=(token:string,init:RequestInit={},url='https://coordinator.example/api/v1/account/profile')=>
  handle(new Request(url,{...init,headers:{authorization:'Bearer '+token,...init.headers}}));
 return {handle,sign,request,claims,now};
}

test('profile verifies real ES384 JWT; exact safe schema; concurrent stable workspace and canonical Native aliases',async()=>{
 const f=await fixture(),token=await f.sign();
 const responses=await Promise.all(Array.from({length:24},()=>f.request(token)));
 const bodies=await Promise.all(responses.map(async r=>{assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');return r.json();}));
 const profile=bodies[0];assert.deepEqual(Object.keys(profile).sort(),['issuer','productId','schemaVersion','subject','workspaceId']);
 assert.deepEqual(profile,{schemaVersion:1,subject:'user-A',issuer,productId:'NativeA',workspaceId:accountWorkspace(seed,issuer,'user-A','NativeA')});
 assert.match(profile.workspaceId,/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 for(const body of bodies)assert.deepEqual(body,profile);
 assert.deepEqual(await (await f.request(await f.sign({client_id:'NativeAlias'}))).json(),profile);
 assert.deepEqual(await (await f.request(token,{},'https://attacker.example/api/v1/account/profile')).json(),profile);
 for(const changes of [{sub:'user-B'},{client_id:'NativeB'}])assert.notEqual((await (await f.request(await f.sign(changes))).json()).workspaceId,profile.workspaceId);
 assert.notEqual(accountWorkspace(seed,'https://other.example/oidc','user-A','NativeA'),profile.workspaceId);
 assert.notEqual(accountWorkspace(Buffer.alloc(32,18),issuer,'user-A','NativeA'),profile.workspaceId);
 assert.notEqual(accountWorkspace(seed,issuer,'ab','c'),accountWorkspace(seed,issuer,'a','bc'));
});

test('JWT issuer/resource/algorithm/signature/client/expiry/scope and machine-token boundaries fail closed',async()=>{
 const f=await fixture();
 const changes:Record<string,unknown>[]=[
  {iss:'https://other.example/oidc'},{iss:undefined},{aud:'NativeA'},{aud:undefined},
  {exp:f.now-1},{exp:undefined},{exp:'tomorrow'},{iat:undefined},{iat:'now'},{iat:f.now+60},{exp:f.now-10,iat:f.now},
  {nbf:f.now+60},{sub:undefined},{sub:''},{sub:'NativeA'},{sub:7},
  {client_id:undefined},{client_id:''},{client_id:1},{azp:'other'},
  {scope:undefined},{scope:['connect']},{scope:'openid disconnect'},{scope:'connect:all'},
  {gty:'client_credentials'},{gty:'client-credentials'},{gty:['client_credentials']},
 ];
 for(const change of changes){const r=await f.request(await f.sign(change));assert.equal(r.status,401,JSON.stringify(change));assert.match(r.headers.get('www-authenticate')!,/^Bearer /);}
 for(const client_id of ['OtherNative','ConsoleA','ConsoleB'])assert.equal((await f.request(await f.sign({client_id}))).status,403);
 for(const header of [{typ:'id_token'},{kid:'unknown'}])assert.equal((await f.request(await f.sign({},header))).status,401);
 const rsa=await generateKeyPair('RS256'),ec256=await generateKeyPair('ES256'),other=await generateKeyPair('ES384');
 for(const [alg,key] of [['RS256',rsa.privateKey],['ES256',ec256.privateKey],['ES384',other.privateKey]] as const){
  const token=await new SignJWT(f.claims).setProtectedHeader({alg,kid:'profile-fixture'}).sign(key);
  assert.equal((await f.request(token)).status,401);
 }
 assert.equal((await f.request(Buffer.from('{"alg":"none"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(f.claims)).toString('base64url')+'.')).status,401);
});

test('profile rejects anonymous/malformed/duplicate authorization, unsupported methods, parameters and bodies',async()=>{
 const f=await fixture(),token=await f.sign();
 for(const authorization of [undefined,'','Basic fixture','Bearer opaque','Bearer '+token+', Bearer '+token,'Bearer  '+token,'Bearer '+token+' extra','Bearer '+('a'.repeat(16385))+'.b.c']){
  const r=await f.handle(new Request('https://fixture.example/api/v1/account/profile',{headers:authorization===undefined?{}:{authorization}}));
  assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');assert(!JSON.stringify(await r.json()).includes(token));
 }
 for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS']){const r=await f.request(token,{method});assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'GET');}
 const invalidHeaders:Record<string,string>[]=[{'content-length':'1'},{'content-length':'bogus'},{'transfer-encoding':'chunked'}];
 for(const headers of invalidHeaders)assert.equal((await f.request(token,{headers})).status,400);
 assert.equal((await f.request(token,{},'https://fixture.example/api/v1/account/profile?subject=other')).status,400);
 assert.equal((await f.request(token,{headers:{'content-length':'0'}})).status,200);
});

test('explicit seed, static policy, resource and isolated namespace are mandatory before connecting Redis',()=>{
 for(const raw of [undefined,'','a'.repeat(42),' '+seed.toString('base64url'),seed.toString('base64'), 'a'.repeat(129)])assert.throws(()=>workspaceSeed(raw));
 assert.deepEqual(workspaceSeed(seed.toString('base64url')),seed);
 const env={CYBERNOTE_WORKSPACE_SEED:seed.toString('base64url'),CYBERGRID_PRODUCTS:rawProducts,
  LOGTO_RESOURCE:resource,LOGTO_ISSUER:issuer,LOGTO_BROWSER_CLIENT_ID:'ConsoleA',
  CYBERGRID_REDIS_PREFIX:'cybernote-fixture',CYBERGRID_REDIS_TRANSPORT:'tcp',REDIS_URL:'rediss://fixture.invalid:6379'};
 for(const name of ['CYBERNOTE_WORKSPACE_SEED','CYBERGRID_PRODUCTS','LOGTO_RESOURCE','CYBERGRID_REDIS_PREFIX'])assert.throws(()=>createAccountCoordinator({...env,[name]:undefined}));
 assert.throws(()=>createAccountCoordinator({...env,LOGTO_BROWSER_CLIENT_ID:'OtherConsole'}));
 assert.throws(()=>createAccountCoordinator({...env,LOGTO_ISSUER:'http://fixture.example/oidc'}));
 const coordinator=createAccountCoordinator(env);coordinator.close();
});
