import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {resolve} from 'node:path';
const built = await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/account-client.ts'),formats:['es']}},define:{'import.meta.env':'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'}});
const output = (Array.isArray(built) ? built[0] : built).output;
const {validateAccountStatus,accountConnectionRetry,accountNeedsLogin} = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
const status = error => ({state:'error',enabled:false,devices:[],pendingCount:0,conflictCount:0,error});
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
