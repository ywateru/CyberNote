/** Offline fixtures only. These tests are not native authentication evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {publicEncrypt,createPublicKey,constants} from 'node:crypto';
const originalExec=childProcess.execFileSync;
let externalCommands=0;
childProcess.execFileSync=()=>{externalCommands++;throw Error('OFFLINE_FORBIDS_DEVICE_COMMANDS');};
syncBuiltinESMExports();
test.after(()=>{childProcess.execFileSync=originalExec;syncBuiltinESMExports();assert.equal(externalCommands,0);});
const {createInputGuard,createGuardedSender,selectBrowserPid,isUser0Foreground,verifyBrowserEndpoint}=await import('./account109-hosted-memory-driver.mjs');
const {prepareConsumer}=await import('./account109-hosted-memory-consumer.mjs');
const {prepareEnvelope}=await import('./account109-hosted-rsa-envelope.mjs');
const {classifyTerminal,observeTerminal}=await import('./account109-hosted-terminal-observer.mjs');
const preparedAt=1800000000000;
const binding={href:'https://auth.x.aixgg.com/offline-marker',frameId:'offline-frame',loaderId:'offline-loader'};
const page=()=>({...binding,origin:'https://auth.x.aixgg.com',visible:true,focused:true,fieldFocused:true});
function setup(overrides={}){
 let sends=0;
 const guard=createInputGuard({preparedAt,binding,assertOwner:()=>{},probe:async()=>page(),nativeWaiting:async()=>true,now:()=>preparedAt+1,...overrides});
 const send=createGuardedSender((...args)=>guard.guard(...args),()=>{sends++;});
 return{guard,send,sends:()=>sends};
}
test('each supported Input event passes its own guard before dispatch',async()=>{
 const events=[];
 const send=createGuardedSender(async()=>{events.push('guard');},method=>{events.push(method);});
 for(const method of ['Input.dispatchMouseEvent','Input.dispatchKeyEvent','Input.insertText'])await send(method,{},preparedAt+1000);
 assert.deepEqual(events,['guard','Input.dispatchMouseEvent','guard','Input.dispatchKeyEvent','guard','Input.insertText']);
 await assert.rejects(send('Runtime.evaluate',{},preparedAt+1000),{code:'INPUT_METHOD_NOT_ALLOWED'});
 assert.equal(events.length,6);
});
test('hidden, unfocused, wrong-origin and changed-document targets receive no Input',async t=>{
 for(const change of [{visible:false},{focused:false},{fieldFocused:false},{origin:'https://invalid.example'},{href:'https://auth.x.aixgg.com/another-offline-marker'},{frameId:'other-frame'},{loaderId:'other-loader'}])await t.test(Object.keys(change)[0],async()=>{
  const fixture=setup({probe:async()=>({...page(),...change})});
  await assert.rejects(fixture.send('Input.insertText',{},preparedAt+1000));assert.equal(fixture.sends(),0);
 });
});
test('lease, foreground and lock failures prevent dispatch',async()=>{
 for(const code of ['OFFLINE_LEASE_CLOSED','OFFLINE_NOT_FOREGROUND','OFFLINE_LOCKED']){
  const fixture=setup({assertOwner:()=>{throw Object.assign(Error(code),{code});}});
  await assert.rejects(fixture.send('Input.dispatchMouseEvent',{},preparedAt+1000),{code});assert.equal(fixture.sends(),0);
 }
});
test('expiry after awaited native check prevents Input and cannot extend preparedAt',async()=>{
 let clock=preparedAt+1;
 const fixture=setup({now:()=>clock,nativeWaiting:async()=>{await Promise.resolve();clock=preparedAt+1000;return true;}});
 await assert.rejects(fixture.send('Input.insertText',{},preparedAt+1000),{code:'INPUT_EXPIRED'});assert.equal(fixture.sends(),0);
 const old=setup({now:()=>preparedAt+240000});
 await assert.rejects(old.send('Input.insertText',{},preparedAt+999999),{code:'INPUT_EXPIRED'});assert.equal(old.sends(),0);
});
test('page changes during native IPC and final ownership changes prevent Input',async()=>{
 let foreground=true,visible=true;
 const pageFixture=setup({probe:async()=>({...page(),visible}),nativeWaiting:async()=>{visible=false;return true;}});
 await assert.rejects(pageFixture.send('Input.insertText',{},preparedAt+1000),{code:'INPUT_PAGE_NOT_INTERACTIVE'});assert.equal(pageFixture.sends(),0);
 const ownerFixture=setup({assertOwner:()=>{if(!foreground)throw Object.assign(Error('OFFLINE_OWNER_CHANGED'),{code:'OFFLINE_OWNER_CHANGED'});},nativeWaiting:async()=>{foreground=false;return true;}});
 await assert.rejects(ownerFixture.send('Input.insertText',{},preparedAt+1000),{code:'OFFLINE_OWNER_CHANGED'});assert.equal(ownerFixture.sends(),0);
});
test('navigation invalidation and no longer authorizing prevent every later Input',async()=>{
 const fixture=setup();fixture.guard.invalidate();
 await assert.rejects(fixture.send('Input.insertText',{},preparedAt+1000),{code:'INPUT_DOCUMENT_INVALIDATED'});assert.equal(fixture.sends(),0);
 const stopped=setup({nativeWaiting:async()=>false});
 await assert.rejects(stopped.send('Input.insertText',{},preparedAt+1000),{code:'NATIVE_AUTHORIZATION_NOT_WAITING'});
 await assert.rejects(stopped.send('Input.insertText',{},preparedAt+1000),{code:'INPUT_DOCUMENT_INVALIDATED'});assert.equal(stopped.sends(),0);
});
test('consumer routes all twelve mouse/key/text events through sendInput with the minimum expiry',async()=>{
 const methods=[];
 const fixture={preparedAt,guardInput:async d=>assert.equal(d,preparedAt+1000),controls:async()=>({trusted:true,iframeCount:0,inputs:[{name:'identifier',type:'text'},{name:'pass'+'word',type:'pass'+'word'}],buttons:[{disabled:false}]}),evaluate:async()=>({x:10,y:10}),sendInput:async(method,params,deadline,options)=>{assert.equal(deadline,preparedAt+1000);if(method!=='Input.dispatchMouseEvent')assert.equal(typeof options.focusSelector,'string');methods.push(method);}};
 const consume=prepareConsumer(fixture);
 const data={username:'cybernoteqa20261113a',passphrase:'offline-fixture-only',expiresAt:preparedAt+1000};
 await consume(data,{deadline:preparedAt+2000});
 assert.equal(methods.length,12);assert.equal(methods.filter(m=>m==='Input.insertText').length,2);
 assert.equal(data.username,null);assert.equal(data.passphrase,null);
 await assert.rejects(consume(data,{deadline:preparedAt+2000}),{code:'CONSUMER_ALREADY_USED'});
});
test('async post-Input recorder rejection is awaited, sanitized and cannot return success',async()=>{
 let consumed=0,observed=0;
 const env=await prepareEnvelope({driver:{},record:async receipt=>{await Promise.resolve();if(receipt.phase==='hosted-submit-input-dispatched')throw Object.assign(Error('offline-private-recorder-message'),{code:'offline-private-code',cause:Error('offline-private-cause')});},consumeUi:async()=>{consumed++;},observe:async()=>{observed++;return{phase:'offline-observer-not-auth-evidence'};}});
 try{
  const marker='account109-offline-envelope-marker';
  const raw=Buffer.from(JSON.stringify({marker,purpose:'account109-synthetic-login',expiresAt:Date.now()+30000,username:'cybernoteqa20261113a',passphrase:'offline-fixture-only'}));
  const publicKey=createPublicKey({key:Buffer.from(env.publicKeyBase64,'base64'),format:'der',type:'spki'});
  const cipher=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},raw);raw.fill(0);
  const result=await env.accept(cipher.toString('base64'),marker);cipher.fill(0);
  assert.deepEqual(result,{phase:'encrypted-transfer-rejected',code:'TRANSFER_OR_CONSUMER_REJECTED'});
  assert.equal(consumed,1);assert.equal(observed,0);
  assert.equal(JSON.stringify(result).includes('offline-private'),false);
  assert.equal((await env.accept('',marker)).code,'ENVELOPE_EXPIRED_OR_CONSUMED');
 }finally{env.dispose();}
});

test('native terminal requires exact synthetic user, paused, disabled and owned foreground',()=>{
 const synthetic={state:'paused',profile:{username:'cybernoteqa20261113a'},enabled:false};
 const accepted=classifyTerminal(synthetic,true);
 assert.equal(accepted.sameSyntheticUser,true);assert.equal(accepted.nativeCallbackAccepted,true);
 assert.equal(accepted.pageAssociation,'temporal-only');assert.equal(accepted.rawSchemeEventInspected,false);
 assert.equal('username' in accepted,false);assert.equal('profile' in accepted,false);
 assert.deepEqual(classifyTerminal({...synthetic,profile:{username:'other-offline-user'}},true),{phase:'callback-identity-mismatch',sameSyntheticUser:false});
 assert.equal(classifyTerminal(synthetic,false),null);
 assert.equal(classifyTerminal({...synthetic,state:'authorizing'},true),null);
 assert.equal(classifyTerminal({...synthetic,enabled:true},true).code,'UNEXPECTED_SYNC_ENABLED');
 assert.equal(classifyTerminal({...synthetic,state:'error'},true).phase,'callback-native-error');
});


test('observer await boundary rechecks lock, foreground and deadline before success',async t=>{
 for(const change of ['stable','lock','foreground','deadline'])await t.test(change,async()=>{
  let clock=1000,unlocked=true,foreground=true,closed=0,reads=0;
  const result=await observeTerminal({timeoutMs:50,now:()=>clock,
   connect:async()=>({accountStatus:async()=>{reads++;await Promise.resolve();if(change==='lock')unlocked=false;if(change==='foreground')foreground=false;if(change==='deadline')clock=1050;return{state:'paused',profile:{username:'cybernoteqa20261113a'},enabled:false};},close:async()=>{closed++;}}),
   probe:()=>({unlocked,ownedAppForeground:foreground}),sleep:async()=>{throw Error('OFFLINE_UNEXPECTED_SLEEP');},
  });
  assert.equal(reads,1);assert.equal(closed,1);
  if(change==='stable'){
   assert.equal(result.phase,'native-paused-profile-observed');assert.equal(result.sameSyntheticUser,true);
  }else{
   assert.notEqual(result.phase,'native-paused-profile-observed');assert.notEqual(result.nativeCallbackAccepted,true);
   assert.equal(result.code,{lock:'DEVICE_AUTH_REQUIRED',foreground:'OWNED_APP_NOT_FOREGROUND',deadline:'NATIVE_PAUSED_PROFILE_NOT_OBSERVED'}[change]);
  }
  assert.equal('username' in result,false);assert.equal('profile' in result,false);
 });
});

test('observer deadline includes awaited connection setup',async()=>{
 let clock=1000,closed=0,reads=0;
 const result=await observeTerminal({timeoutMs:50,now:()=>clock,
  connect:async()=>{await Promise.resolve();clock=1050;return{accountStatus:async()=>{reads++;return{};},close:async()=>{closed++;}};},
  probe:()=>({unlocked:true,ownedAppForeground:true}),sleep:async()=>{throw Error('OFFLINE_UNEXPECTED_SLEEP');},
 });
 assert.equal(result.code,'NATIVE_PAUSED_PROFILE_NOT_OBSERVED');assert.equal(reads,0);assert.equal(closed,1);
});

test('observer device recheck crossing deadline cannot report success',async()=>{
 let clock=1000,probes=0,closed=0;
 const result=await observeTerminal({timeoutMs:50,now:()=>clock,
  connect:async()=>({accountStatus:async()=>({state:'paused',profile:{username:'cybernoteqa20261113a'},enabled:false}),close:async()=>{closed++;}}),
  probe:()=>{if(++probes===2)clock=1050;return{unlocked:true,ownedAppForeground:true};},sleep:async()=>{throw Error('OFFLINE_UNEXPECTED_SLEEP');},
 });
 assert.equal(result.code,'NATIVE_PAUSED_PROFILE_NOT_OBSERVED');assert.equal(probes,2);assert.equal(closed,1);
});


test('browser PID selection requires exact user-0 Chrome UID and cmdline',()=>{
 const records={'101':{name:'com.android.chrome',uid:'10001'},'202':{name:'com.android.chrome',uid:'1010001'}};
 assert.equal(selectBrowserPid(['202','101'],'10001',pid=>records[pid]),101);
 assert.throws(()=>selectBrowserPid(['202'],'10001',pid=>records[pid]),{code:'BROWSER_PID_NOT_UNIQUE_FOR_USER0'});
 records['303']={name:'com.android.chrome',uid:'10001'};
 assert.throws(()=>selectBrowserPid(['101','303'],'10001',pid=>records[pid]),{code:'BROWSER_PID_NOT_UNIQUE_FOR_USER0'});
 records['101'].name='other-offline-process';
 assert.throws(()=>selectBrowserPid(['101'],'10001',pid=>records[pid]),{code:'BROWSER_PID_NOT_UNIQUE_FOR_USER0'});
 assert.throws(()=>selectBrowserPid(['101'],undefined,pid=>records[pid]),{code:'BROWSER_USER0_UID_UNAVAILABLE'});
});


test('foreground ActivityRecord must name user0 and the exact package',()=>{
 const line=(user,pkg)=>`  mResumedActivity: ActivityRecord{abc u${user} ${pkg}/.Main t12}`;
 assert.equal(isUser0Foreground(line(0,'com.android.chrome'),'com.android.chrome'),true);
 assert.equal(isUser0Foreground(line(10,'com.android.chrome'),'com.android.chrome'),false);
 assert.equal(isUser0Foreground(line(999,'com.android.chrome'),'com.android.chrome'),false);
 assert.equal(isUser0Foreground(line(0,'com.android.chrome.other'),'com.android.chrome'),false);
 assert.equal(isUser0Foreground(line(0,'other.app')+' com.android.chrome/','com.android.chrome'),false);
 assert.equal(isUser0Foreground(line(0,'com.android.chrome')+'\n'+line(10,'com.android.chrome'),'com.android.chrome'),false);
 assert.equal(isUser0Foreground(line(0,'com.local.notesclone.account109'),'com.local.notesclone.account109'),true);
 assert.equal(isUser0Foreground(line(10,'com.local.notesclone.account109'),'com.local.notesclone.account109'),false);
});

test('global browser endpoint must prove selected OS PID before page access',async t=>{
 for(const scenario of ['match','root-path','other-user','ambiguous','unsupported','malformed','wrong-authority','fetch-error'])await t.test(scenario,async()=>{
  let closed=0,sent=[];
  class FakeSocket{
   constructor(){queueMicrotask(()=>this.onopen());}
   send(raw){sent.push(JSON.parse(raw));queueMicrotask(()=>{
    const processInfo=scenario==='ambiguous'?[{type:'browser',id:101},{type:'browser',id:202}]:[{type:'browser',id:scenario==='other-user'?202:101},{type:'renderer',id:303}];
    this.onmessage({data:scenario==='malformed'?'invalid':JSON.stringify(scenario==='unsupported'?{id:1,error:{message:'offline-private-detail'}}:{id:1,result:{processInfo}})});
   });}
   close(){closed++;}
  }
  const fetchImpl=async()=>{if(scenario==='fetch-error')throw Error('offline-private-detail');return{json:async()=>({webSocketDebuggerUrl:`ws://127.0.0.1:${scenario==='wrong-authority'?9999:4567}/devtools/browser${scenario==='root-path'?'':'/offline-marker'}`})};};
  const operation=verifyBrowserEndpoint({port:4567,pid:101,WebSocketImpl:FakeSocket,fetchImpl});
  if(['match','root-path'].includes(scenario))assert.deepEqual(await operation,{browserEndpointPidVerified:true});
  else await assert.rejects(operation,error=>{assert.equal(error.message.includes('offline-private-detail'),false);assert.equal(error.cause,undefined);return error.code===({'other-user':'BROWSER_ENDPOINT_OWNER_MISMATCH',ambiguous:'BROWSER_ENDPOINT_OWNER_MISMATCH','wrong-authority':'BROWSER_ENDPOINT_AUTHORITY_MISMATCH'}[scenario]||'BROWSER_ENDPOINT_OWNER_UNAVAILABLE');});
  assert.equal(closed,['wrong-authority','fetch-error'].includes(scenario)?0:1);
  assert.deepEqual(sent,['wrong-authority','fetch-error'].includes(scenario)?[]:[{id:1,method:'SystemInfo.getProcessInfo'}]);
 });
});
