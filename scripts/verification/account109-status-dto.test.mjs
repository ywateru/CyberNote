import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {resolve} from 'node:path';
const built = await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/account-client.ts'),formats:['es']}},define:{'import.meta.env':'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'}});
const output = (Array.isArray(built) ? built[0] : built).output;
const {validateAccountStatus} = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
const status = error => ({state:'error',enabled:false,devices:[],pendingCount:0,conflictCount:0,error});
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
 ]) assert.throws(()=>validateAccountStatus(status(error)),/无效数据/);
});
