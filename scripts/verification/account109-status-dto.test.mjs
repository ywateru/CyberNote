import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {resolve} from 'node:path';
const built = await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/account-client.ts'),formats:['es']}},define:{'import.meta.env':'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'}});
const output = (Array.isArray(built) ? built[0] : built).output;
const {validateAccountStatus,accountConnectionRetry,accountNeedsLogin,accountTokenResponseMessage} = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
const status = error => ({state:'error',enabled:false,devices:[],pendingCount:0,conflictCount:0,error});
test('authorization surface is finite, authorizing-only and optional for legacy native status',()=>{
 const authorizing={state:'authorizing',enabled:false,devices:[],pendingCount:0,conflictCount:0};
 assert.equal(validateAccountStatus(authorizing).authorizationSurface,undefined);
 for(const authorizationSurface of ['embedded','browser']) {
  const parsed=validateAccountStatus({...authorizing,authorizationSurface});
  assert.equal(parsed.authorizationSurface,authorizationSurface);
  assert.deepEqual(accountConnectionRetry(parsed),{type:'status'});
  for(const state of ['signedOut','connecting','ready','paused','error'])
   assert.throws(()=>validateAccountStatus({...authorizing,state,authorizationSurface}),/无效数据/);
 }
 for(const authorizationSurface of [undefined,null,0,{},[],false,'external','https://private.invalid'])
  assert.throws(()=>validateAccountStatus({...authorizing,authorizationSurface}),/无效数据/);
 const failedTransfer={...authorizing,authorizationSurface:'embedded',error:{code:'account_network',stage:'browserOpen',message:'safe'}};
 assert.deepEqual(validateAccountStatus(failedTransfer).error,failedTransfer.error);
 assert.deepEqual(accountConnectionRetry(validateAccountStatus(failedTransfer)),{type:'status'});
});
test('explicit network retry restores a retained owner without authorizing or enabling',()=>{
 for(const enabled of [false,true]) for(const error of [
  {code:'account_network',message:'safe',stage:'identityProvider'},
  {code:'account_authentication',message:'safe',stage:'authorizationProvider',providerReason:'network'},
 ]) {
  const s=validateAccountStatus({...status(error),enabled,profile:{subject:'fixture-owner',displayName:'Fixture'}});
  const before=structuredClone(s);
  assert.equal(accountNeedsLogin(s.error),false);
  assert.deepEqual(accountConnectionRetry(s),{type:'syncNow'});
  assert.deepEqual(s,before);
  assert.deepEqual(accountConnectionRetry({...s,profile:undefined}),{type:error.code==='account_network'?'signIn':'status'});
  for(const state of ['paused','ready','authorizing','signedOut','connecting'])
   assert.deepEqual(accountConnectionRetry({...s,state}),{type:'status'});
 }
});
test('retry respects authentication, cleanup, ownership and unknown-error fences',()=>{
 for(const code of ['account_configuration','account_storage','account_cleanup_required','account_owner_workspace_mismatch','account_sync_protocol','account_auth_token_response_invalid','unknown_auth_error']) {
  const s={...status({code,message:'safe'}),enabled:true,profile:{subject:'fixture-owner',displayName:'Fixture'}};
  assert.equal(accountNeedsLogin(s.error),false);
  assert.deepEqual(accountConnectionRetry(s),{type:'status'});
 }
 for(const error of [{code:'account_authentication',message:'safe',stage:'identityRefresh'},
  {code:'account_authentication',message:'safe',stage:'authorizationProvider',providerReason:'refreshFailed'}]) {
  assert.equal(accountNeedsLogin(error),true);
  assert.deepEqual(accountConnectionRetry(status(error)),{type:'signIn'});
 }
 for(const error of [{code:'account_auth_code_rejected',message:'safe'},
  {code:'account_auth_token_response_invalid',message:'safe'},
  {code:'account_auth_identity_invalid',message:'safe'}]) {
  assert.equal(accountNeedsLogin(error),false);
  assert.deepEqual(accountConnectionRetry(status(error)),{type:'signIn'}); // initial begin only, never replacement
  assert.deepEqual(accountConnectionRetry({...status(error),profile:{subject:'fixture-owner',displayName:'Fixture'}}),{type:'status'});
 }
 for(const stage of [undefined,'coordinator','identitySession','coordinatorProfile']) {
  const s={...status({code:'account_authentication',message:'safe',...(stage?{stage}:{})}),profile:{subject:'fixture-owner',displayName:'Fixture'}};
  assert.equal(accountNeedsLogin(s.error),false);
  assert.deepEqual(accountConnectionRetry(s),{type:'status'});
 }
 for(const providerReason of ['configuration','storage','cancelled','busy','tokenResponseInvalid','ownershipMismatch']) {
  const s=status({code:'account_authentication',message:'safe',stage:'authorizationProvider',providerReason});
  assert.equal(accountNeedsLogin(s.error),false);
  assert.deepEqual(accountConnectionRetry(s),{type:'status'});
 }
});
test('legacy errors and fixed native network stages remain valid DTOs',()=>{
 assert.deepEqual(validateAccountStatus(status({code:'account_network',message:'safe'})).error,{code:'account_network',message:'safe'});
 for(const stage of ['callbackListen','browserOpen','callbackReceive','identityProvider','coordinator','coordinatorConfiguration','coordinatorRegistration'])
  assert.equal(validateAccountStatus(status({code:'account_network',message:'safe',stage})).error.stage,stage);
 for(const reason of ['responseMetadata','missingIdToken','issuer','audience','expired','nonce','signingKey','signature','algorithm','subject','authorizedParty','issuedAt','accessTokenHash','otherClaims'])
  assert.equal(validateAccountStatus(status({code:'account_auth_identity_invalid',message:'safe',reason})).error.reason,reason);
});
test('untrusted diagnostic fields and upstream values fail closed',()=>{
 for(const error of [
  {code:'account_network',message:'safe',stage:'https://upstream.invalid/private'},
  {code:'account_network',message:'safe',stage:null},
  {code:'account_network',message:'safe',stage:{token:'synthetic'}},
  {code:'account_network',message:'safe',stage:'coordinator',url:'https://upstream.invalid'},
  {code:'account_auth_identity_invalid',message:'safe',reason:'upstream-sensitive-response'},
  {code:'account_auth_identity_invalid',message:'safe',reason:null},
  {code:'account_authentication',message:'safe',stage:'https://private.invalid/token'},
  {code:'account_authentication',message:'safe',stage:'authorizationProvider',cause:'private-response-sentinel'},
  {code:'account_authentication',message:'safe',stage:['coordinatorEnrollment']},
  {code:'account_authentication',message:'safe',stage:0},
  {code:'account_authentication',message:'safe',stage:null},
  ...[null, 0, {}, [], 'https://private.invalid/token', 'private-response-sentinel'].map(providerReason=>({code:'account_authentication',message:'safe',stage:'authorizationProvider',providerReason})),
  {code:'account_authentication',message:'safe',stage:'coordinatorRegistration',providerReason:'refreshFailed'},
  {code:'account_authentication',message:'safe',providerReason:'refreshFailed'},
  {code:'account_network',message:'safe',stage:'authorizationProvider',providerReason:'network'},
 ]) assert.throws(()=>validateAccountStatus(status(error)),/无效数据/);
});
test('provider diagnostics preserve finite auth categories in their strict context',()=>{
 for(const providerReason of ['configuration','network','invalidCallback','invalidIdentity','identityRejected','codeExchangeRejected','tokenResponseInvalid','missingRefreshToken','cancelled','noSession','ownershipMismatch','storage','refreshFailed','revocationFailed','busy']) {
  const error = {code:'account_authentication',message:'safe',stage:'authorizationProvider',providerReason};
  assert.deepEqual(validateAccountStatus(status(error)).error,error);
 }
});
test('authentication diagnostics preserve only the finite native operation stages',()=>{
 assert.deepEqual(validateAccountStatus(status({code:'account_authentication',message:'safe'})).error,{code:'account_authentication',message:'safe'});
 for(const stage of ['identityProvider','coordinator','coordinatorConfiguration','coordinatorRegistration','coordinatorProfile','coordinatorEnrollment','coordinatorJwks','authorizationProvider','identitySession','identityRefresh','identityRevocation','coordinatorSession']) {
  const error = {code:'account_authentication',message:'safe',stage};
  assert.deepEqual(validateAccountStatus(status(error)).error,error);
 }
 for(const stage of ['coordinatorProfile','coordinatorEnrollment','coordinatorJwks'])
  assert.equal(validateAccountStatus(status({code:'account_network',message:'safe',stage})).error.stage,stage);
});

test('token envelope details preserve exact finite operation/field and safe UI explanation',()=>{
 for(const tokenOperation of ['codeExchange','refresh']) for(const tokenField of ['tokenType','accessToken','expiresIn','scope']) {
  const error={code:'account_auth_identity_invalid',message:'safe',reason:'responseMetadata',tokenOperation,tokenField};
  const parsed=validateAccountStatus(status(error));
  assert.deepEqual(parsed.error,error);
  const expectedOperation=tokenOperation==='codeExchange'?'登录响应':'刷新响应';
  const expectedField={tokenType:'授权类型',accessToken:'访问授权',expiresIn:'有效期',scope:'授权范围'}[tokenField];
  assert.equal(accountTokenResponseMessage(parsed.error),`${expectedOperation}的${expectedField}未通过校验。请检查服务或更新应用。本机备忘录会保留。`);
  assert.equal(accountNeedsLogin(parsed.error),false);
  assert.deepEqual(accountConnectionRetry({...parsed,profile:{subject:'fixture-owner',displayName:'Fixture'}}),{type:'status'});
 }
 const legacy={code:'account_auth_identity_invalid',message:'safe',reason:'responseMetadata'};
 assert.deepEqual(validateAccountStatus(status(legacy)).error,legacy);
 assert.equal(accountTokenResponseMessage(legacy),undefined);
});

test('partial, unknown and cross-branch token diagnostics fail closed without inferred cause',()=>{
 const valid={code:'account_auth_identity_invalid',message:'safe',reason:'responseMetadata',tokenOperation:'refresh',tokenField:'scope'};
 const {tokenOperation,...missingOperation}=valid,{tokenField,...missingField}=valid;
 for(const error of [missingOperation,missingField,
  ...[null,undefined,0,{},[], 'provider-private-sentinel'].flatMap(value=>[{...valid,tokenOperation:value},{...valid,tokenField:value}]),
  ...['account_network','account_authentication','account_cleanup_required','account_auth_token_response_invalid'].map(code=>({...valid,code})),
  ...[undefined,'signature','issuer'].map(reason=>({...valid,reason})),
  {...valid,stage:'identityRefresh'},
  {...valid,providerReason:'identityRejected'},
  {...valid,tokenValue:'provider-private-sentinel'},
 ]) {
  assert.throws(()=>validateAccountStatus(status(error)),/无效数据/);
  // The UI helper itself also refuses invalid finite context or missing labels.
  if(!('tokenValue' in error))assert.equal(accountTokenResponseMessage(error),undefined);
 }
 assert.equal(accountTokenResponseMessage(undefined),undefined);
});

const mappingStatus=()=>({state:'ready',enabled:true,devices:[{id:'peer',name:'Fixture',online:true,current:false,connected:true,transport:{generation:2,sample:7,ageMs:10,enrollment:'webrtc-direct',sync:'cloudflare-tunnel'}}],transportGeneration:2,pendingCount:0,conflictCount:0});
test('live Mapping DTO retains only finite per-path labels and explicit generation/sample age',()=>{
 for(const kind of ['webrtc-direct','iroh-direct','cloudflare-tunnel','unavailable','unknown']) {
  const s=mappingStatus();s.devices[0].transport.enrollment=kind;s.devices[0].transport.sync=kind;
  const parsed=validateAccountStatus(s);assert.deepEqual(parsed.devices,s.devices);assert.equal(parsed.transportGeneration,s.transportGeneration);
 }
 const legacy=mappingStatus();delete legacy.transportGeneration;delete legacy.devices[0].transport;
 assert.equal(validateAccountStatus(legacy).devices[0].transport,undefined);
 assert.equal(validateAccountStatus(legacy).transportGeneration,undefined);
});
test('Mapping DTO rejects stale, wrong-generation, invalid-label and inactive evidence',()=>{
 const corrupt=[
  s=>{delete s.transportGeneration;},s=>{s.transportGeneration=0;},s=>{s.state='paused';},s=>{s.enabled=false;},s=>{s.error={code:'account_network',message:'safe'};},
  s=>{s.devices[0].current=true;},s=>{s.devices[0].online=false;},
  ...['generation','sample','ageMs','enrollment','sync'].map(key=>s=>{delete s.devices[0].transport[key];}),
  ...[{generation:3},{sample:0},{sample:Number.MAX_SAFE_INTEGER+1},{sample:1.5},{ageMs:3001},{ageMs:-1},{enrollment:'private-address-sentinel'},{sync:null},{url:'private-address-sentinel'}].map(value=>s=>{Object.assign(s.devices[0].transport,value);}),
 ];
 for(const change of corrupt){const s=mappingStatus();change(s);assert.throws(()=>validateAccountStatus(s),/无效数据/);}
});
