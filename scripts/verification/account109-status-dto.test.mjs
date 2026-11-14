import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {resolve} from 'node:path';
const built = await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/account-client.ts'),formats:['es']}},define:{'import.meta.env':'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'}});
const output = (Array.isArray(built) ? built[0] : built).output;
const {validateAccountStatus,accountConnectionRetry,accountNeedsLogin,accountTokenResponseMessage,accountErrorMessage,accountErrorDetails,accountIPCError,accountErrorStateKey} = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
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
test('retry respects authentication, cleanup, service identity and unknown-error fences',()=>{
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
test('service identity mismatch permits only explicit unauthenticated terminal login retry',()=>{
 const error={code:'account_owner_workspace_mismatch',message:'private-response-sentinel'};
 for(const state of ['error','signedOut']) {
  const s=validateAccountStatus({...status(error),state});
  assert.deepEqual(accountConnectionRetry(s),{type:'signIn'});
  assert.deepEqual(accountConnectionRetry({...s,profile:{subject:'fixture-A',displayName:'A'}}),{type:'status'});
 }
 for(const state of ['authorizing','connecting','paused','ready'])
  assert.deepEqual(accountConnectionRetry({...status(error),state}),{type:'status'});
 for(const code of ['account_busy','account_cleanup_required'])
  for(const state of ['error','signedOut'])assert.deepEqual(accountConnectionRetry({...status({code,message:'safe'}),state}),{type:'status'});
 for(const diagnostic of [error,
  {code:'account_authentication',stage:'identitySession',message:'safe'},
  ...['noSession','ownershipMismatch'].map(providerReason=>({code:'account_authentication',stage:'authorizationProvider',providerReason,message:'safe'}))]) {
  const copy=accountErrorMessage(validateAccountStatus(status(diagnostic)).error);
  assert(!/原账户|本机绑定|资料库已关联|资料库归属|private-response-sentinel/.test(copy));
  assert(copy.includes('本机备忘录会保留'));
 }
 assert(accountErrorMessage(error).includes('账户服务返回的身份或同步空间'));
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
  {...valid,requestReason:'timeout'},
  {...valid,httpStatus:401},
  {...valid,tokenValue:'provider-private-sentinel'},
 ]) {
  assert.throws(()=>validateAccountStatus(status(error)),/无效数据/);
  // The UI helper itself also refuses invalid finite context or missing labels.
  if(!('tokenValue' in error))assert.equal(accountTokenResponseMessage(error),undefined);
 }
 assert.equal(accountTokenResponseMessage(undefined),undefined);
});

test('coordinator request diagnostics accept only exact endpoint, reason and native HTTP classification',()=>{
 for(const stage of ['coordinatorProfile','coordinatorEnrollment','coordinatorJwks']) {
  for(const requestReason of ['timeout','connect','request','responseBody','invalidResponse']) {
   const error={code:'account_network',message:'safe',stage,requestReason};assert.deepEqual(validateAccountStatus(status(error)).error,error);
  }
  for(const httpStatus of [100,199,300,400,401,403,429,500,599]) {
   const error={code:[401,403].includes(httpStatus)?'account_authentication':'account_network',message:'safe',stage,requestReason:'httpStatus',httpStatus};
   assert.deepEqual(validateAccountStatus(status(error)).error,error);assert(accountErrorMessage(error).includes(`HTTP ${httpStatus}`));
  }
 }
 const base={code:'account_network',message:'safe',stage:'coordinatorProfile',requestReason:'timeout'};
 for(const error of [
  ...['identityProvider','authorizationProvider','coordinator','identityRefresh',undefined].map(stage=>({...base,stage})),
  ...['account_authentication','account_busy','unknown'].map(code=>({...base,code})),
  ...[null,undefined,{},0,'private-response-sentinel'].map(requestReason=>({...base,requestReason})),
  ...[99,200,204,299,600,401.5,'401',null,undefined].map(httpStatus=>({...base,requestReason:'httpStatus',httpStatus})),
  ...[401,403].map(httpStatus=>({...base,requestReason:'httpStatus',httpStatus})),
  ...[400,429,500].map(httpStatus=>({...base,code:'account_authentication',requestReason:'httpStatus',httpStatus})),
  {...base,httpStatus:503},{...base,requestReason:'httpStatus'},
  {code:base.code,message:base.message,stage:base.stage,httpStatus:503},
  {...base,reason:'responseMetadata'},{...base,reason:undefined},{...base,providerReason:'network'},{...base,providerReason:undefined},{...base,tokenOperation:undefined},{...base,tokenField:'scope'},
  {...base,url:'private-response-sentinel'},
 ])assert.throws(()=>validateAccountStatus(status(error)),/无效数据/);
});

test('fixed local error copy and details never expose unknown codes or upstream message and never infer timeout',()=>{
 const error={code:'account_network',message:'private-response-sentinel',stage:'coordinatorProfile',requestReason:'timeout'};
 assert(accountErrorMessage(error).includes('读取账户资料时请求超时'));
 assert.deepEqual(accountErrorDetails(error),[['code','account_network'],['stage','coordinatorProfile'],['requestReason','timeout']]);
 const legacy={code:'account_network',message:'private-response-sentinel',stage:'identityProvider'};
 assert(accountErrorMessage(legacy).includes('连接登录服务时网络请求未完成'));assert(!accountErrorMessage(legacy).includes('超时'));
 const opening=accountErrorMessage({code:'account_network',stage:'browserOpen',message:'safe'});assert(opening.includes('打开登录页面'));assert(!opening.includes('系统浏览器'));
 const unknown={code:'private-sync-owner-url-sentinel',message:'private-response-sentinel'};
 const parsed=validateAccountStatus(status(unknown));assert.equal(parsed.error.code,'unknown');
 assert(accountErrorMessage(unknown).includes('未知错误'));assert.deepEqual(accountErrorDetails(unknown),[['code','未知错误']]);
 assert(!JSON.stringify([parsed.error,accountErrorDetails(unknown),accountErrorMessage(unknown),accountErrorMessage(error),accountErrorDetails(error)]).includes('private-'));
});

test('IPC accepts finite new/legacy rejection shapes, discards messages and never guesses from raw exceptions',()=>{
 for(const shape of [{code:'account_busy',message:'private-response-sentinel'},{code:'account_busy',message:'private-response-sentinel',commit:null},{code:'account_window_invalid',message:'private-response-sentinel'},
  {code:'account_authentication',message:'private-response-sentinel',stage:'coordinatorProfile',requestReason:'httpStatus',httpStatus:401}]) {
  const safe=accountIPCError(shape);assert.equal(safe.code,shape.code);assert(!JSON.stringify(safe).includes('private-'));assert(!('commit' in safe));
 }
 for(const shape of ['network timeout private-response-sentinel',new Error('private-response-sentinel'),{code:'unknown',message:'private-response-sentinel'},
  {code:'account_busy',message:'private-response-sentinel',commit:undefined},{code:'account_busy',message:'private-response-sentinel',commit:{}},
  {code:'account_busy',message:'private-response-sentinel',url:'private-response-sentinel'},
  {code:'account_network',message:'private-response-sentinel',commit:null,stage:'coordinatorProfile'},
  {code:'account_authentication',message:'private-response-sentinel',stage:'coordinatorProfile',requestReason:'timeout'},
 ])assert.equal(accountIPCError(shape),undefined);
});

test('explicit unbound profile retry agrees with native; no polling, replacement or enable is inferred',()=>{
 for(const error of [{code:'account_network',message:'safe',stage:'coordinatorProfile',requestReason:'timeout'},
  {code:'account_authentication',message:'safe',stage:'coordinatorProfile',requestReason:'httpStatus',httpStatus:403}]) {
  const s=validateAccountStatus(status(error));assert.deepEqual(accountConnectionRetry(s),{type:'signIn'});
  const bound={...s,profile:{subject:'fixture',displayName:'Fixture'}};assert.deepEqual(accountConnectionRetry(bound),{type:error.code==='account_network'?'syncNow':'status'});
  for(const stage of ['coordinatorEnrollment','coordinatorJwks'])assert.deepEqual(accountConnectionRetry({...s,error:{...s.error,stage}}),{type:'status'});
 }
 const s=status({code:'account_network',message:'safe',stage:'coordinatorProfile',requestReason:'timeout'}),key=accountErrorStateKey(s);
 assert.equal(accountErrorStateKey({...s,pendingCount:10,devices:[{id:'different'}],error:{...s.error,message:'different'}}),key);
 for(const change of [{state:'authorizing'}, {enabled:true},{profile:{subject:'fixture'}},{error:{...s.error,requestReason:'connect'}}])assert.notEqual(accountErrorStateKey({...s,...change}),key);
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
