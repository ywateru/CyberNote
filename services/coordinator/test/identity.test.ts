import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,exportJWK,createLocalJWKSet,errors,type FetchImplementation} from 'jose';
import {LogtoIdentity} from '../src/identity.js';
import {ApiError,type AuthConfiguration} from '../src/types.js';
const config:AuthConfiguration={provider:'logto',issuer:'https://tenant.example/oidc',clientId:'native-client',resource:'https://cybergrid.aixgg.com/api',scope:'openid connect',deviceAuthorizationEndpoint:'https://tenant.example/oidc/device/auth',tokenEndpoint:'https://tenant.example/oidc/token',authorizationEndpoint:'https://tenant.example/oidc/auth',revocationEndpoint:'https://tenant.example/oidc/token/revocation',redirectUri:'https://cybergrid.aixgg.com/console/callback/',jwksUri:'https://tenant.example/oidc/jwks'};
test('exchange verifier pins issuer/audience/algorithm/client/user/expiry and whole-word connect permission',async()=>{
 const keys=await generateKeyPair('ES384');const jwk={...await exportJWK(keys.publicKey),kid:'test',alg:'ES384'};
 const identity=new LogtoIdentity(config,['ES384'],createLocalJWKSet({keys:[jwk]}));
 const now=Math.floor(Date.now()/1000);
 const claims={sub:'logto-user',iss:config.issuer,aud:config.resource,client_id:config.clientId,scope:'openid connect',iat:now,exp:now+60};
 const sign=(changes:Record<string,unknown>={})=>new SignJWT({...claims,...changes}).setProtectedHeader({alg:'ES384',kid:'test',typ:'JWT'}).sign(keys.privateKey);
 assert.deepEqual(await identity.verify(await sign()),{id:'logto-user',clientId:config.clientId});
 assert.deepEqual(await identity.verify(await sign({client_id:'browser-client',email:'user@example.test'})),{id:'logto-user',clientId:'browser-client',email:'user@example.test'});
 for(const changes of [{iss:'https://other.example/oidc'},{aud:config.clientId},{exp:now-30},{scope:'openid disconnect'},{client_id:undefined},{sub:config.clientId},{sub:undefined},{gty:'client_credentials'},{azp:'conflicting-client'},{iat:undefined}])await assert.rejects(()=>sign(changes).then(t=>identity.verify(t)),e=>(e as any).code==='INVALID_IDENTITY');
 await assert.rejects(()=>identity.verify('pat_not_a_user_token'));
 const other=await generateKeyPair('ES384');const forged=await new SignJWT(claims).setProtectedHeader({alg:'ES384',kid:'test'}).sign(other.privateKey);await assert.rejects(()=>identity.verify(forged));
});

const invalid=(error:unknown)=>error instanceof ApiError&&error.status===401&&error.code==='INVALID_IDENTITY';
const unavailable=(error:unknown)=>{
 assert.ok(error instanceof ApiError);
 assert.equal(error.status,503);
 assert.equal(error.code,'IDENTITY_UNAVAILABLE');
 assert.equal(error.message,'Logto 身份验证暂时不可用，请稍后重试');
 assert.equal(error.cause,undefined);
 return true;
};
async function remoteFixture(t:TestContext,fetchJWKS:FetchImplementation){
 const requests:string[]=[];
 // Intercept every fetch; no test can fall through to the production network.
 t.mock.method(globalThis,'fetch',async(url:string,options:Parameters<FetchImplementation>[1])=>{
  requests.push(url);
  assert.equal(url,config.issuer+'/jwks');
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'manual');
  assert.ok(options.signal instanceof AbortSignal);
  return fetchJWKS(url,options);
 });
 const keys=await generateKeyPair('ES384');
 const jwk={...await exportJWK(keys.publicKey),kid:'test',alg:'ES384'};
 const now=Math.floor(Date.now()/1000);
 const claims={sub:'logto-user',iss:config.issuer,aud:config.resource,client_id:config.clientId,scope:'openid connect',iat:now,exp:now+3600};
 const sign=(changes:Record<string,unknown>={},header:Record<string,unknown>={})=>new SignJWT({...claims,...changes}).setProtectedHeader({alg:'ES384',kid:'test',typ:'JWT',...header}).sign(keys.privateKey);
 return {identity:new LogtoIdentity(config),jwk,claims,sign,requests};
}

test('remote JWKS cache expiry: valid token, network outage 503, recovery, invalid signatures still 401',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 let offline=false;
 const f=await remoteFixture(t,async()=>{
  if(offline)throw new TypeError('private network diagnostics must not escape');
  return Response.json({keys:[f.jwk]});
 });
 // Untrusted JWT URLs never select the key source.
 const token=await f.sign({}, {jku:'https://attacker.example/jwks'});
 const expected={id:'logto-user',clientId:config.clientId};
 assert.deepEqual(await f.identity.verify(token),expected);
 offline=true;
 assert.deepEqual(await f.identity.verify(token),expected); // Fresh cached keys need no network.
 assert.equal(f.requests.length,1);
 t.mock.timers.tick(600_001);
 await assert.rejects(()=>f.identity.verify(token),unavailable);
 offline=false;
 assert.deepEqual(await f.identity.verify(token),expected);
 const other=await generateKeyPair('ES384');
 const forged=await new SignJWT(f.claims).setProtectedHeader({alg:'ES384',kid:'test'}).sign(other.privateKey);
 await assert.rejects(()=>f.identity.verify(forged),invalid);
 await assert.rejects(()=>f.identity.verify(token.slice(0,token.lastIndexOf('.')+1)+'AA'),invalid);
 for(const changes of [{iss:'https://attacker.example/oidc'},{aud:config.clientId},{exp:f.claims.iat-1},{scope:'disconnect'},{client_id:undefined},{sub:undefined}]){
  await assert.rejects(()=>f.sign(changes).then(token=>f.identity.verify(token)),invalid);
 }
 const es256=await generateKeyPair('ES256');
 const wrongAlgorithm=await new SignJWT(f.claims).setProtectedHeader({alg:'ES256',kid:'test'}).sign(es256.privateKey);
 await assert.rejects(()=>f.identity.verify(wrongAlgorithm),invalid);
 assert.deepEqual(f.requests,Array(3).fill(config.issuer+'/jwks'));
});

test('remote JWKS non-200 responses are unavailable and never expose response bodies',async t=>{
 for(const status of [302,401,404,429,500,503])await t.test(String(status),async t=>{
  const f=await remoteFixture(t,async()=>new Response('private upstream response',{status,headers:{location:'https://attacker.example/jwks'}}));
  await assert.rejects(()=>f.sign().then(token=>f.identity.verify(token)),unavailable);
  assert.deepEqual(f.requests,[config.issuer+'/jwks']);
 });
});

test('remote JWKS actual jose timeout is unavailable',async t=>{
 let signal:AbortSignal|undefined;
 const f=await remoteFixture(t,async(_url,options)=>{
  signal=options.signal;
  return new Promise<Response>((_resolve,reject)=>{
   // Keep the event loop alive for jose's unref'ed 5000ms AbortSignal timeout.
   const timer=setTimeout(()=>reject(new Error('jose did not abort')),6000);
   signal!.addEventListener('abort',()=>{clearTimeout(timer);reject(signal!.reason);},{once:true});
  });
 });
 await assert.rejects(()=>f.sign().then(token=>f.identity.verify(token)),unavailable);
 assert.equal(signal?.aborted,true);
 assert.equal(signal?.reason.name,'TimeoutError');
 assert.deepEqual(f.requests,[config.issuer+'/jwks']);
});

test('remote JWKS interrupted response body is unavailable',async t=>{
 const f=await remoteFixture(t,async()=>new Response(new ReadableStream({start(controller){controller.error(new TypeError('private body transport diagnostics'));}})));
 await assert.rejects(()=>f.sign().then(token=>f.identity.verify(token)),unavailable);
 assert.deepEqual(f.requests,[config.issuer+'/jwks']);
});

test('successfully retrieved malformed JWKS, invalid keys and unknown keys remain invalid identity',async t=>{
 for(const kind of ['json','jwks','key','unknown','ambiguous'])await t.test(kind,async t=>{
  const f=await remoteFixture(t,async()=>{
   if(kind==='json')return new Response('{not json');
   if(kind==='jwks')return Response.json({keys:'not an array'});
   if(kind==='key')return Response.json({keys:[{...f.jwk,x:'AA'}]});
   if(kind==='unknown')return Response.json({keys:[{...f.jwk,kid:'other'}]});
   return Response.json({keys:[f.jwk,f.jwk]});
  });
  await assert.rejects(()=>f.sign().then(token=>f.identity.verify(token)),invalid);
  assert.deepEqual(f.requests,[config.issuer+'/jwks']);
 });
});

test('injected resolver errors without remote retrieval never become retryable',async t=>{
 const f=await remoteFixture(t,async()=>assert.fail('injected resolver must not fetch'));
 const token=await f.sign();
 for(const error of [new Error('private failure'),new TypeError('fetch failed'),new DOMException('private timeout','TimeoutError'),new errors.JWKSTimeout(),new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'),new ApiError(503,'IDENTITY_UNAVAILABLE','untrusted error')]){
  const identity=new LogtoIdentity(config,['ES384'],async()=>{throw error;});
  await assert.rejects(()=>identity.verify(token),invalid);
 }
 assert.deepEqual(f.requests,[]);
});
