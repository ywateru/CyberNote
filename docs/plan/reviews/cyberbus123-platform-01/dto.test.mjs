import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('../../../../src/account-client.ts',import.meta.url));
const bundle=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry,formats:['es']}},define:{'import.meta.env':'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'}});
const api=await import('data:text/javascript;base64,'+Buffer.from((Array.isArray(bundle)?bundle[0]:bundle).output[0].code).toString('base64'));
const status=()=>({state:'ready',enabled:true,devices:[{id:'11111111-1111-4111-8111-111111111111',name:'synthetic device',online:true,current:false,connected:true,syncAvailable:true,transport:{generation:4,sample:2,ageMs:3000,enrollment:'cyberbus',sync:'unknown'}}],pendingCount:0,conflictCount:0,transportGeneration:4});
test('CyberBus observation accepts age boundary and rejects stale/generation/extra-secret data',()=>{
  assert.equal(api.accountTransportLabel(api.validateAccountStatus(status()).devices[0]),'CyberBus');
  for(const change of [{ageMs:3001},{sample:0},{generation:3},{generation:5},{route:'direct'},{root:'/synthetic/private'},{seed:'synthetic-secret'}]) {
    const s=status(); Object.assign(s.devices[0].transport,change);
    assert.throws(()=>api.validateAccountStatus(s),/无效数据/);
  }
  for(const change of [{online:false},{current:true}]) {
    const s=status();Object.assign(s.devices[0],change);assert.throws(()=>api.validateAccountStatus(s),/无效数据/);
  }
  for(const kind of ['unknown','unavailable']) {
    const s=status();Object.assign(s.devices[0].transport,{enrollment:kind,sync:kind});
    assert.equal(api.accountTransportLabel(api.validateAccountStatus(s).devices[0]),undefined);
  }
});
test('new auth classifications keep finite recovery and refuse storage/credential fields',()=>{
  const reasons=['invalidClaims','conflict','deadlineExceeded','unauthenticated','reauthRequired','sessionRevoked','unknownOutcome','unavailable','rollback','resourceExhausted','invalidDevice','unsupported'];
  for(const reason of reasons) {
    const error={code:'account_authentication',stage:'authorizationProvider',providerReason:reason,message:'private-synthetic-sentinel'};
    const s={state:'error',enabled:false,devices:[],pendingCount:0,conflictCount:0,error};
    assert.doesNotMatch(api.accountIPCError(error).message,/private-synthetic-sentinel/);
    assert.doesNotMatch(api.accountErrorMessage(api.validateAccountStatus(s).error),/private-synthetic-sentinel/);
    for(const key of ['token','root','vault','key','authorizationUrl','sdkError']) {
      const invalid={...error,[key]:'synthetic'};
      assert.equal(api.accountIPCError(invalid),undefined);
      assert.throws(()=>api.validateAccountStatus({...s,error:invalid}),/无效数据/);
    }
    if(reason==='unknownOutcome') {
      assert.equal(api.accountNeedsLogin(error),false);
      assert.deepEqual(api.accountConnectionRetry(s),{type:'status'});
    }
  }
});
