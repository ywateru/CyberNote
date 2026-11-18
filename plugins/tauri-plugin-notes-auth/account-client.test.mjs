import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {resolve} from 'node:path';
const built = await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/account-client.ts'),formats:['es']}},define:{'import.meta.env':'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'}});
const {validateAccountStatus,accountErrorMessage,accountIPCError,accountNeedsLogin,accountNetworkError,accountConnectionRetry,accountTransportLabel} = await import('data:text/javascript;base64,'+Buffer.from((Array.isArray(built) ? built[0] : built).output[0].code).toString('base64'));
const status = error => ({state:'error',enabled:false,devices:[],pendingCount:0,conflictCount:0,error});
const reasons = ['invalidClaims','conflict','deadlineExceeded','unauthenticated','reauthRequired','sessionRevoked','unknownOutcome','unavailable','rollback','resourceExhausted','invalidDevice','unsupported'];
test('finite CyberBus authorization classifications preserve existing providerReason wire shape', () => {
  for (const providerReason of reasons) {
    const error = {code:'account_authentication',stage:'authorizationProvider',providerReason,message:'private-sentinel https://invalid.test'};
    assert.deepEqual(validateAccountStatus(status(error)).error,error);
    const message = accountErrorMessage(error);
    assert.doesNotMatch(message, /private-sentinel|https:|Keystore|AES|Noise|Protobuf/);
    assert.equal(accountIPCError(error).message,message);
    assert.equal(accountNeedsLogin(error),['unauthenticated','reauthRequired','sessionRevoked'].includes(providerReason));
    assert.equal(accountNetworkError(error),providerReason==='unavailable');
    assert.deepEqual(accountConnectionRetry({...status(error),state:'paused'}),{type:'status'});
  }
  const unknown = {code:'account_authentication',stage:'authorizationProvider',providerReason:'unknownOutcome',message:'safe'};
  assert.deepEqual(accountConnectionRetry(status(unknown)),{type:'status'});
  for (const change of [{providerReason:'raw SDK error'},{stage:'identityProvider'},{code:'account_network'},{sdkReason:'storage'}]) {
    assert.throws(()=>validateAccountStatus(status({...unknown,...change})),/无效数据/);
    assert.equal(accountIPCError({...unknown,...change}),undefined);
  }
});
test('CyberBus transport preserves registry UUID and finite observations without inventing route', () => {
  const device = {id:'11111111-1111-4111-8111-111111111111',name:'Fixture',current:false,online:true,connected:true,syncAvailable:true,transport:{generation:1,sample:1,ageMs:0,enrollment:'cyberbus',sync:'cyberbus'}};
  const input = {...status(),state:'ready',enabled:true,transportGeneration:1,devices:[device]}; delete input.error;
  assert.deepEqual(validateAccountStatus(input).devices[0],device);
  assert.equal(accountTransportLabel(device),'CyberBus');
  assert.equal(accountTransportLabel({...device,online:false}),undefined);
  assert.equal(accountTransportLabel({...device,transport:undefined}),undefined);
  for(const kind of ['unknown','unavailable','cloudflare-tunnel']) assert.equal(accountTransportLabel({...device,transport:{...device.transport,enrollment:kind,sync:kind}}),undefined);
  for(const kind of ['cyberbus-direct','easytier-relay','https://invalid.test']) assert.throws(()=>validateAccountStatus({...input,devices:[{...device,transport:{...device.transport,sync:kind}}]}),/无效数据/);
  assert.throws(()=>validateAccountStatus({...input,devices:[{...device,id:'AAAA'.repeat(11)}]}),/无效数据/);
});
