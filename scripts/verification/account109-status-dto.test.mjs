import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {resolve} from 'node:path';
const built = await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:resolve('src/account-client.ts'),formats:['es']}},define:{'import.meta.env':'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'}});
const output = (Array.isArray(built) ? built[0] : built).output;
const {validateAccountStatus,accountConnectionRetry,accountNeedsLogin,accountSuggestsRelogin,accountTokenResponseMessage,accountErrorMessage,accountErrorDetails,accountIPCError,accountErrorStateKey} = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
const status = error => ({state:'error',enabled:false,devices:[],pendingCount:0,conflictCount:0,error});
const syncStageLabels={pair:'配对',recoverPairing:'恢复配对',transfer:'传输',retirement:'收尾'};
const syncReasonLabels={io:'读写操作未完成',invalid_input:'同步请求参数无效',corrupt_identity:'同步身份数据未通过校验',authentication:'设备身份验证未通过',expired:'同步凭证或请求已过期',revoked:'同步授权已撤销',workspace_mismatch:'设备同步空间不一致',protocol:'设备同步协议校验未通过',limit:'本次同步超出支持的限制',timeout:'操作超时',stopped:'同步操作已停止',backend:'同步数据处理未完成',plan_stale:'同步计划已失效',busy:'已有同步操作正在处理',transport:'同步传输连接未完成'};
test('typed sync failure accepts every frozen stage/reason pair with local-only status and IPC copy',()=>{
 for(const [syncStage,stage] of Object.entries(syncStageLabels))for(const [syncReason,reason] of Object.entries(syncReasonLabels)) {
  const error={code:'account_sync_failed',message:'private-response-sentinel',syncStage,syncReason};
  assert.deepEqual(validateAccountStatus(status(error)).error,error);
  const message=`设备同步在${stage}阶段未完成：${reason}。${syncReason==='timeout'?'请确认两台设备保持运行且网络可用，再选择此设备重试。已接收的内容会保留。':'本地更改仍保存在此设备。'}`;
  assert.equal(accountErrorMessage(error),message);
  assert.deepEqual(accountErrorDetails(error),[['code','account_sync_failed'],['syncStage',stage],['syncReason',reason]]);
  const ipc=accountIPCError(error);assert.deepEqual(ipc,{...error,message});
  assert(!JSON.stringify([ipc,accountErrorDetails(error),message]).includes('private-'));
  assert.equal(accountNeedsLogin(error),false);
  assert.equal(accountSuggestsRelogin(error),false);
 }
});
test('sync diagnostics reject partial, unknown, cross-code and cross-branch fields in status and IPC',()=>{
 const base={code:'account_sync_failed',message:'private-response-sentinel'},valid={...base,syncStage:'transfer',syncReason:'timeout'};
 const invalids=[{...base,syncStage:'transfer'},{...base,syncReason:'timeout'},
  ...[undefined,null,0,false,{},[],'private-response-sentinel'].flatMap(value=>[{...valid,syncStage:value},{...valid,syncReason:value}]),
  ...['invalidInput','corruptIdentity','workspaceMismatch','planStale'].map(syncReason=>({...valid,syncReason})),
  ...['account_network','account_authentication','account_sync_protocol','account_sync_adoption_blocked','unknown'].map(code=>({...valid,code})),
  ...['stage','reason','providerReason','requestReason','httpStatus','tokenOperation','tokenField','adoptionStage','adoptionReason','url','commit'].flatMap(key=>[{...valid,[key]:undefined},{...valid,[key]:'private-response-sentinel'}]),
 ];
 for(const error of invalids) {
  assert.throws(()=>validateAccountStatus(status(error)),/无效数据/);
  assert.equal(accountIPCError(error),undefined);assert.deepEqual(accountErrorDetails(error),[]);
  assert.equal(accountErrorMessage(error),accountErrorMessage(undefined));
  assert.equal(accountSuggestsRelogin(error),false);
 }
 const token={code:'account_auth_identity_invalid',message:'safe',reason:'responseMetadata',tokenOperation:'refresh',tokenField:'scope'};
 for(const extra of [{syncStage:undefined},{syncReason:undefined},{syncStage:'transfer',syncReason:'timeout'}])assert.equal(accountTokenResponseMessage({...token,...extra}),undefined);
});
test('legacy sync failures suggest explicit logout recovery without claiming token expiry or authorizing login',()=>{
 const error={code:'account_sync_failed',message:'private-response-sentinel'};
 assert.deepEqual(validateAccountStatus(status(error)).error,error);
 assert.equal(accountErrorMessage(error),'同步未完成。请先退出账户并重新登录，再重新开启同步。本机备忘录及附件会保留。');
 assert.equal(accountSuggestsRelogin(error),true);
 assert.equal(accountNeedsLogin(error),false);
 assert.deepEqual(accountConnectionRetry({...status(error),profile:{subject:'fixture-owner',displayName:'Fixture'}}),{type:'status'});
 for(const other of [undefined,{code:'account_network',message:'safe'},{code:'account_sync_adoption_blocked',message:'safe'}])assert.equal(accountSuggestsRelogin(other),false);
 assert.deepEqual(accountErrorDetails(error),[['code','account_sync_failed']]);assert(!accountIPCError(error).message.includes('private-'));
 const typed={...error,syncStage:'pair',syncReason:'timeout'},s=status(typed),key=accountErrorStateKey(s);
 assert.equal(accountErrorStateKey({...s,pendingCount:20,error:{...typed,message:'different'}}),key);
 for(const change of [{syncStage:'transfer'},{syncReason:'transport'}])assert.notEqual(accountErrorStateKey({...s,error:{...typed,...change}}),key);
 for(const enabled of [false,true])assert.deepEqual(accountConnectionRetry({...s,enabled}),accountConnectionRetry({...s,enabled,error}));
});
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
test('adoption blocked is a finite local sync error, never an authentication or connection retry',()=>{
 const error={code:'account_sync_adoption_blocked',message:'private-response-sentinel'};
 const expected='旧同步仍有未解决冲突、待应用内容或正在保存的操作。请先处理后再开启合并；当前账户已登录且同步暂停，本机内容会保留。若旧同步来自“设备同步”，可退出当前账户，再前往“设备同步”恢复并处理旧同步。若旧账户仍有待接收内容，可退出当前账户并重新登录旧账户；身份及同步空间验证通过且原同步凭证仍可用时，会恢复旧设备身份，同步仍保持暂停。请确认开启原同步空间并处理待接收内容，完成后再退出，登录目标账户并确认开启合并。';
 for(const state of ['paused','error'])for(const profile of [undefined,{subject:'fixture-B',displayName:'B'}]) {
  const parsed=validateAccountStatus({...status(error),state,...(profile?{profile}:{})});
  assert.equal(parsed.error.code,error.code);assert.equal(accountNeedsLogin(parsed.error),false);
  assert.deepEqual(accountConnectionRetry(parsed),{type:'status'});
 }
 assert.equal(accountErrorMessage(error),expected);
 for(const shape of [error,{...error,commit:null}])assert.deepEqual(accountIPCError(shape),{code:error.code,message:expected});
 assert.deepEqual(accountErrorDetails(error),[['code',error.code]]);
 for(const extra of [{stage:'coordinatorProfile'},{reason:'subject'},{providerReason:'busy'},
  {requestReason:'timeout'},{httpStatus:409},{tokenOperation:'refresh',tokenField:'scope'},{url:'private-response-sentinel'}]) {
  assert.throws(()=>validateAccountStatus(status({...error,...extra})),/无效数据/);
  assert.equal(accountIPCError({...error,...extra}),undefined);
 }
 assert.equal(accountIPCError({...error,code:error.code+'_private-response-sentinel'}),undefined);
});
test('adoption timeout diagnostics are a strict finite pair with fixed stage copy and details',()=>{
 const base={code:'account_sync_adoption_blocked',message:'private-response-sentinel'};
 for(const [adoptionStage,label] of [['probe','检查同步窗口'],['prepare','保存并冻结本地更改'],['media','准备附件']]) {
  const error={...base,adoptionStage,adoptionReason:'timeout'},parsed=validateAccountStatus(status(error));
  assert.deepEqual(parsed.error,error);assert.equal(accountNeedsLogin(parsed.error),false);
  assert.deepEqual(accountConnectionRetry(parsed),{type:'status'});
  const copy=`开启同步时，${label}超时。当前账户仍已登录且同步暂停，本机内容会保留。请稍后重新确认开启同步。`;
  assert.equal(accountErrorMessage(error),copy);assert.deepEqual(accountIPCError(error),{...error,message:copy});
  assert.deepEqual(accountErrorDetails(error),[['code',base.code],['adoptionStage',adoptionStage],['adoptionReason','timeout']]);
  assert(!/private|未解决冲突|重新登录/.test(copy));
  assert.notEqual(accountErrorStateKey(status(base)),accountErrorStateKey(parsed));
 }
 const valid={...base,adoptionStage:'media',adoptionReason:'timeout'};
 const invalids=[{...base,adoptionStage:'media'},{...base,adoptionReason:'timeout'},
  ...[undefined,null,0,{},[],'private-response-sentinel'].flatMap(value=>[{...valid,adoptionStage:value},{...valid,adoptionReason:value}]),
  ...['account_network','account_authentication','account_busy','unknown'].map(code=>({...valid,code})),
  ...['stage','reason','providerReason','tokenOperation','tokenField','requestReason','httpStatus'].flatMap(key=>[{...valid,[key]:undefined},{...valid,[key]:'private-response-sentinel'}]),
  {...valid,operationId:'private-operation'},{...valid,path:'private-path'},
 ];
 for(const error of invalids) {
  assert.throws(()=>validateAccountStatus(status(error)),/无效数据/);assert.equal(accountIPCError(error),undefined);
  assert.deepEqual(accountErrorDetails(error),[]);assert(!accountErrorMessage(error).includes('超时'));
 }
 assert(accountErrorMessage(base).includes('旧同步仍有未解决冲突'));
 assert(!accountErrorMessage(base).includes('超时'),'legacy generic adoption error never invents timeout');
 assert.equal(accountTokenResponseMessage({code:'account_auth_identity_invalid',message:'safe',reason:'responseMetadata',tokenOperation:'refresh',tokenField:'scope',adoptionReason:'timeout'}),undefined);
});
test('legacy errors and fixed native network stages remain valid DTOs',()=>{
 assert.deepEqual(validateAccountStatus(status({code:'account_network',message:'safe'})).error,{code:'account_network',message:'safe'});
 for(const stage of ['callbackListen','browserOpen','embeddedOpen','callbackReceive','identityProvider','coordinator','coordinatorConfiguration','coordinatorRegistration'])
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
test('credential storage is an optional finite status field',()=>{
 for(const credentialStorage of ['keychain','encryptedFile']) {
  const parsed=validateAccountStatus({...status(undefined),credentialStorage});
  assert.equal(parsed.credentialStorage,credentialStorage);
 }
 assert.equal(validateAccountStatus(status(undefined)).credentialStorage,undefined);
 for(const credentialStorage of [null,'keychainFile','encrypted_file','',0,false,{},[]])
  assert.throws(()=>validateAccountStatus({...status(undefined),credentialStorage}),/无效数据/);
});
test('SDK failures preserve every finite stage and reject cross-branch diagnostics',()=>{
 const stages=['init','authStart','authCallback','authState','authRestore','authCancel','authLogout','publishProfile','networkStart','networkStop'];
 for(const sdkStage of stages) {
  const error={code:'account_sdk_failed',message:'safe',cyberbusCode:1,sdkStage};
  const parsed=validateAccountStatus(status(error));
  assert.deepEqual(parsed.error,error);
  assert.deepEqual(accountErrorDetails(error),[['code','account_sdk_failed'],['cyberbusCode','1'],['sdkStage',sdkStage]]);
  assert.deepEqual(accountIPCError(error),{...error,message:accountErrorMessage(error)});
 }
 const legacy={code:'account_sdk_failed',message:'safe',cyberbusCode:1};
 assert.deepEqual(validateAccountStatus(status(legacy)).error,legacy);
 const valid={...legacy,sdkStage:'networkStart'};
 for(const error of [
  {...legacy,cyberbusCode:undefined},{...legacy,cyberbusCode:0},{...legacy,cyberbusCode:27},
  {...legacy,cyberbusCode:'1'},{...valid,sdkStage:'network_start'},
  ...['stage','reason','providerReason','requestReason','httpStatus','adoptionStage','adoptionReason','syncStage','syncReason','url','token']
   .flatMap(key=>[{...valid,[key]:undefined},{...valid,[key]:'private-response-sentinel'}]),
  {code:'account_network',message:'safe',sdkStage:'networkStart'},
  {code:'account_auth_identity_invalid',message:'safe',reason:'responseMetadata',sdkStage:'authCallback'},
 ]) {
  assert.throws(()=>validateAccountStatus(status(error)),/无效数据/);
  assert.equal(accountIPCError(error),undefined);
  assert.deepEqual(accountErrorDetails(error),[]);
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

const mappingStatus=()=>({state:'ready',enabled:true,devices:[{id:'11111111-1111-4111-8111-111111111111',name:'Fixture',online:true,current:false,connected:true,syncAvailable:true,transport:{generation:2,sample:7,ageMs:10,enrollment:'webrtc-direct',sync:'cloudflare-tunnel'}}],transportGeneration:2,pendingCount:0,conflictCount:0});
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

const registryPeer='12345678-1234-4123-8123-123456789abc';
const deviceStatus=()=>({...status(undefined),state:'paused',devices:[{id:registryPeer,name:'Fixture',current:false,online:true,connected:false,syncAvailable:false}]});
test('registry summary distinguishes missing, empty and ordinary note modification time',()=>{
 const s=deviceStatus();assert.equal(validateAccountStatus(s).devices[0].summary,undefined);
 for(const summary of [{noteCount:0,lastNoteUpdatedAt:null,capturedAt:100},{noteCount:12,lastNoteUpdatedAt:80,capturedAt:100}]) {
  s.devices[0].summary=summary;assert.deepEqual(validateAccountStatus(s).devices[0].summary,summary);
 }
 for(const summary of [null,{},
  {noteCount:0,lastNoteUpdatedAt:1,capturedAt:100},{noteCount:2,lastNoteUpdatedAt:null,capturedAt:100},
  {noteCount:1,lastNoteUpdatedAt:80,capturedAt:100,heartbeat:100},
  ...['noteCount','lastNoteUpdatedAt','capturedAt'].flatMap(key=>[-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'100',undefined].map(value=>({...{noteCount:1,lastNoteUpdatedAt:80,capturedAt:100},[key]:value}))),
 ]) {s.devices[0].summary=summary;assert.throws(()=>validateAccountStatus(s),/无效数据/);}
});
test('registry device DTO rejects invalid identifiers, duplicate stable IDs, unknown fields and missing permission',()=>{
 for(const mutate of [
  s=>{s.devices[0].id='protocol-id';},s=>{s.devices[0].id=registryPeer.replace('-4123-','-5123-');},
  s=>{delete s.devices[0].syncAvailable;},s=>{s.devices[0].syncAvailable='true';},
  s=>{s.devices[0].owner='other';},s=>{s.devices[0].transportDeviceId='private';},
  s=>{s.devices.push({...s.devices[0],id:registryPeer.toUpperCase()});},
  s=>{s.devices=Array.from({length:65},()=>({...s.devices[0]}));},
 ]) {const s=deviceStatus();mutate(s);assert.throws(()=>validateAccountStatus(s),/无效数据/);}
});
test('device operations retain only a finite target direction phase and safe time receipt',()=>{
 for(const phase of ['running','succeeded','failed'])for(const direction of ['push','pull','both']) {
  const op={deviceId:registryPeer,direction,phase,startedAt:100,...(phase==='running'?{}:{finishedAt:200})};
  assert.deepEqual(validateAccountStatus({...deviceStatus(),deviceOperation:op}).deviceOperation,op);
 }
 const op={deviceId:registryPeer,direction:'push',phase:'running',startedAt:100};
 for(const patch of [{deviceId:'private-url'},{direction:'broadcast'},{phase:'complete'},{startedAt:-1},{startedAt:1.5},{finishedAt:50},{finishedAt:200},{url:'private'},{direction:undefined}])
  assert.throws(()=>validateAccountStatus({...deviceStatus(),deviceOperation:{...op,...patch}}),/无效数据/);
});
test('device failures have fixed safe copy; unrecognized or cross-branch diagnostics cannot leak a peer message',()=>{
 for(const code of ['account_device_offline','account_device_incompatible','account_sync_not_enabled','account_directory_unavailable','account_directory_unsupported']) {
  const safe=accountIPCError({code,message:'private-remote-message'});assert.equal(safe.code,code);assert(!safe.message.includes('private-remote-message'));
  assert(!accountErrorMessage(safe).includes('private-remote-message'));
  assert.equal(accountIPCError({code,message:'private',stage:'identityProvider'}),undefined);
 }
 assert.equal(accountIPCError({code:'account_device_private-message',message:'private'}),undefined);
 assert(accountErrorMessage({code:'account_directory_unsupported',message:'private'}).includes('不会退回自动'));
});
