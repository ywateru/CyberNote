/** Sole-operator test driver: a new SignIn followed by a newly changed same-origin
 * page gives temporal association only. Native AuthClient alone verifies callback
 * state/PKCE/issuer/nonce. This driver exposes no production auth transaction IPC.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { connectAndroid, launchAndroid, assertInteractive, SERIAL } from '/private/tmp/cybernote-account109-native/scripts/verification/account109-android.mjs';
import { acquireDriverLease } from '/private/tmp/cybernote-account109-native/scripts/verification/sync108-android-lifecycle.mjs';
const adb='/Users/water/Library/Android/sdk/platform-tools/adb';
const run=(...args)=>execFileSync(adb,['-s',SERIAL,...args],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','ignore']});
const origin='https://auth.x.aixgg.com';
const fail=code=>Object.assign(Error(code),{code});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Injected probes make expiry, navigation, visibility and ownership races
// testable without a device. This factory never sends Input on its own.
export function createInputGuard({preparedAt,binding,assertOwner,probe,nativeWaiting,now=Date.now}){
 let invalidated=false;
 const checkTime=deadline=>{
  const time=now();
  if(!Number.isFinite(time)||!Number.isFinite(deadline)||!Number.isFinite(preparedAt)||time>=deadline||time>=preparedAt+240000)throw fail('INPUT_EXPIRED');
 };
 const checkPage=page=>{
  if(invalidated)throw fail('INPUT_DOCUMENT_INVALIDATED');
  if(page.origin!==origin||page.href!==binding.href||page.frameId!==binding.frameId||page.loaderId!==binding.loaderId){invalidated=true;throw fail('INPUT_DOCUMENT_CHANGED');}
  if(!page.visible||!page.focused||!page.fieldFocused)throw fail('INPUT_PAGE_NOT_INTERACTIVE');
 };
 return{
  invalidate(){invalidated=true;},
  async guard(deadline,options={}){
   if(invalidated)throw fail('INPUT_DOCUMENT_INVALIDATED');
   checkTime(deadline);assertOwner();checkPage(await probe(options));
   if(!await nativeWaiting()){invalidated=true;throw fail('NATIVE_AUTHORIZATION_NOT_WAITING');}
   // Native IPC can yield. Recheck page and device after it, just before send.
   checkPage(await probe(options));assertOwner();checkTime(deadline);
  },
 };
}

export function createGuardedSender(guard,send){
 return async(method,params,deadline,options)=>{
  if(!['Input.dispatchMouseEvent','Input.dispatchKeyEvent','Input.insertText'].includes(method))throw fail('INPUT_METHOD_NOT_ALLOWED');
  await guard(deadline,options);
  return send(method,params);
 };
}

// Android can report the same package name from another user/profile.
// Never select by position: require exactly one cmdline + user-0 package UID.
export function selectBrowserPid(pids,expectedUid,inspect){
 if(!/^\d+$/.test(expectedUid||''))throw fail('BROWSER_USER0_UID_UNAVAILABLE');
 const matches=[];
 for(const pid of pids){
  if(!/^\d+$/.test(pid))throw fail('BROWSER_PID_INVALID');
  const process=inspect(pid);
  if(process.name==='com.android.chrome'&&process.uid===expectedUid)matches.push(Number(pid));
 }
 if(matches.length!==1)throw fail('BROWSER_PID_NOT_UNIQUE_FOR_USER0');
 return matches[0];
}

// Require the resumed ActivityRecord's user token and exact component package.
export function isUser0Foreground(activities,packageName){
 const lines=activities.split('\n').filter(line=>line.includes('mResumedActivity:'));
 if(lines.length!==1)return false;
 const match=lines[0].match(/mResumedActivity:\s+ActivityRecord\{[^}]*?\su(\d+)\s+([^\s/]+)\/[^\s}]+(?:\s|})/);
 return match?.[1]==='0'&&match[2]===packageName;
}

// Prove the global socket's browser OS PID before enumerating any page targets.
// Unsupported, ambiguous or mismatched endpoints fail closed on this device.
export async function verifyBrowserEndpoint({port,pid,WebSocketImpl,fetchImpl=fetch}){
 let socket,timer;
 try{
  const version=await(await fetchImpl(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(3000)})).json();
  const url=new URL(version.webSocketDebuggerUrl);
  if(url.protocol!=='ws:'||!['localhost','127.0.0.1'].includes(url.hostname)||Number(url.port)!==port||url.username||url['pass'+'word']||!(url.pathname==='/devtools/browser'||url.pathname.startsWith('/devtools/browser/')))throw fail('BROWSER_ENDPOINT_AUTHORITY_MISMATCH');
  const result=await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(fail('BROWSER_ENDPOINT_OWNER_TIMEOUT')),5000);
   socket=new WebSocketImpl(url);
   socket.onopen=()=>socket.send(JSON.stringify({id:1,method:'SystemInfo.getProcessInfo'}));
   socket.onerror=()=>reject(fail('BROWSER_ENDPOINT_OWNER_UNAVAILABLE'));
   socket.onclose=()=>reject(fail('BROWSER_ENDPOINT_OWNER_UNAVAILABLE'));
   socket.onmessage=event=>{
    try{
     const message=JSON.parse(event.data);
     if(message.id!==1)return;
     if(message.error)return reject(fail('BROWSER_ENDPOINT_OWNER_UNAVAILABLE'));
     const browsers=message.result?.processInfo?.filter(entry=>entry.type==='browser');
     if(!browsers||browsers.length!==1||!Number.isSafeInteger(Number(browsers[0].id))||Number(browsers[0].id)!==pid)return reject(fail('BROWSER_ENDPOINT_OWNER_MISMATCH'));
     resolve({browserEndpointPidVerified:true});
    }catch{reject(fail('BROWSER_ENDPOINT_OWNER_UNAVAILABLE'));}
   };
  });
  return result;
 }catch(error){
  const allowed=['BROWSER_ENDPOINT_AUTHORITY_MISMATCH','BROWSER_ENDPOINT_OWNER_TIMEOUT','BROWSER_ENDPOINT_OWNER_UNAVAILABLE','BROWSER_ENDPOINT_OWNER_MISMATCH'];
  throw fail(allowed.includes(error?.code)?error.code:'BROWSER_ENDPOINT_OWNER_UNAVAILABLE');
 }finally{clearTimeout(timer);if(socket){socket.onopen=null;socket.onmessage=null;socket.onclose=null;socket.onerror=()=>{};socket.close();}}
}

export async function prepareHostedDriver({WebSocketImpl=globalThis.WebSocket}={}){
 if(typeof WebSocketImpl!=='function')throw fail('BROWSER_WEBSOCKET_UNAVAILABLE');
 const lease=await acquireDriverLease(path.join(os.tmpdir(),`cybernote-account109-browser-${SERIAL}.lock`));
 let owned,ws,native,seq=0,inputGuard;
 const pending=new Map();
 let expectedBrowserUid;
 const browserPid=()=>{
  if(!expectedBrowserUid){
   const packageLine=run('shell','cmd','package','list','packages','-U','--user','0','com.android.chrome').split('\n').find(l=>/^package:com\.android\.chrome\s+uid:\d+\s*$/.test(l));
   expectedBrowserUid=packageLine?.match(/uid:(\d+)/)?.[1];
  }
  const pids=run('shell','pidof','com.android.chrome').trim().split(/\s+/);
  return selectBrowserPid(pids,expectedBrowserUid,pid=>({name:run('shell','cat',`/proc/${pid}/cmdline`).split('\0')[0],uid:run('shell','cat',`/proc/${pid}/status`).match(/^Uid:\s+(\d+)/m)?.[1]}));
 };
 const assertBrowser=()=>{
  lease.assertOpen();
  if(browserPid()!==owned.pid)throw fail('BROWSER_PID_CHANGED');
  const policy=run('shell','dumpsys','window','policy');
  if(!/\bshowing=false\b/.test(policy)||!/\binputRestricted=false\b/.test(policy))throw fail('DEVICE_AUTH_REQUIRED');
  if(!isUser0Foreground(run('shell','dumpsys','activity','activities'),'com.android.chrome'))throw fail('BROWSER_USER0_NOT_FOREGROUND');
  if(!owned.browserEndpointPidVerified)throw fail('BROWSER_ENDPOINT_NOT_VERIFIED');
 };
 const close=()=>lease.close(async()=>{
  inputGuard?.invalidate();ws?.close();
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(fail('BROWSER_CLOSED'));}pending.clear();
  if(native){await native.close();native=null;}
  if(owned&&run('forward','--list').trim().split('\n').includes(`${SERIAL} ${owned.local} ${owned.remote}`))run('forward','--remove',owned.local);
 });
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  lease.assertOpen();const id=++seq;
  const timer=setTimeout(()=>{pending.delete(id);reject(fail('BROWSER_CDP_TIMEOUT'));},15000);
  pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
 });
 const evaluate=async expression=>{
  const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw fail('BROWSER_EVALUATION_FAILED');return r.result?.value;
 };
 const controls=async()=>{
  assertBrowser();
  const info=await evaluate(`(()=>{const visible=e=>!!(e.getClientRects().length&&!e.closest('[hidden],[inert]')&&getComputedStyle(e).visibility==='visible');if(location.origin!=='https://auth.x.aixgg.com')return{trusted:false,inputs:[],buttons:[]};return{trusted:true,inputs:Array.from(document.querySelectorAll('input')).filter(visible).map(e=>({type:e.type,name:e.name,disabled:e.disabled,readOnly:e.readOnly})),buttons:Array.from(document.querySelectorAll('button[type=submit]')).filter(visible).map(e=>({disabled:e.disabled})),iframeCount:document.querySelectorAll('iframe').length}})()`);
  if(!info.trusted)throw fail('HOSTED_ORIGIN_MISMATCH');return info;
 };
 const probe=async({focusSelector}={})=>{
  const tree=await send('Page.getFrameTree');const frame=tree.frameTree?.frame;
  const page=await evaluate(`({origin:location.origin,href:location.href,visible:document.visibilityState==='visible',focused:document.hasFocus(),fieldFocused:${focusSelector?`(()=>{const e=document.activeElement;return!!(e?.matches(${JSON.stringify(focusSelector)})&&!e.disabled&&!e.readOnly&&e.getClientRects().length&&!e.closest('[hidden],[inert]')&&getComputedStyle(e).visibility==='visible')})()`:'true'}})`);
  // href and loader identifiers remain private in memory, never in a receipt.
  return{...page,frameId:frame?.id,loaderId:frame?.loaderId};
 };
 const nativeWaiting=async()=>{
  const app=await connectAndroid({WebSocketImpl});
  try{const s=await app.accountStatus();return s.state==='authorizing'&&!s.profile&&!s.enabled&&!s.error;}
  finally{await app.close();}
 };
 const driver={origin,assertBrowser,evaluate,controls,owned:()=>owned,close,
  guardInput:(deadline,options)=>inputGuard.guard(deadline,options),
  sendInput:createGuardedSender((deadline,options)=>inputGuard.guard(deadline,options),send),
 };
 let stage='launch-owned-app';
 try{
  launchAndroid();assertInteractive();stage='browser-forward';
  const pid=browserPid(),remote='localabstract:chrome_devtools_remote';
  const port=Number(run('forward','--no-rebind','tcp:0',remote).trim());
  if(!Number.isInteger(port)||port<1024)throw fail('INVALID_BROWSER_FORWARD');
  owned={serial:SERIAL,package:'com.android.chrome',pid,local:`tcp:${port}`,remote};
  stage='browser-endpoint-owner';
  Object.assign(owned,await verifyBrowserEndpoint({port,pid,WebSocketImpl}));
  if(browserPid()!==pid)throw fail('BROWSER_PID_CHANGED');
  const pages=async()=>await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(2000)})).json();
  const baseline=new Map((await pages()).filter(t=>t.type==='page').map(t=>[t.id,t.url]));
  stage='native-state';native=await connectAndroid({WebSocketImpl});
  const before=await native.accountStatus();
  if(!['signedOut','error'].includes(before.state)||before.profile||before.enabled)throw fail('NATIVE_ACCOUNT_NOT_READY_FOR_FRESH_LOGIN');
  stage='native-sign-in-ui';const started=await native.signIn();
  if(started.state!=='authorizing')throw fail('NATIVE_AUTHORIZATION_NOT_STARTED');
  await native.close();native=null;
  stage='new-associated-hosted-target';let target;const deadline=Date.now()+30000;
  while(Date.now()<deadline){
   const matching=(await pages()).filter(t=>{try{return t.type==='page'&&new URL(t.url).origin===origin&&baseline.get(t.id)!==t.url;}catch{return false;}});
   if(matching.length>1)throw fail('NEW_HOSTED_TARGET_AMBIGUOUS');
   if(matching.length===1){target=matching[0];break;}await delay(250);
  }
  if(!target)throw fail('NEW_HOSTED_TARGET_TIMEOUT');
  stage='browser-socket';const socket=new URL(target.webSocketDebuggerUrl);
  if(!['localhost','127.0.0.1'].includes(socket.hostname)||Number(socket.port)!==port)throw fail('BROWSER_SOCKET_AUTHORITY_MISMATCH');
  owned.pageId=target.id;ws=new WebSocketImpl(socket);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(fail('BROWSER_SOCKET_TIMEOUT')),10000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(fail('BROWSER_SOCKET_ERROR'));};});
  ws.onmessage=event=>{
   const r=JSON.parse(event.data);
   if(['Page.frameNavigated','Page.navigatedWithinDocument','Inspector.detached'].includes(r.method))inputGuard?.invalidate();
   const p=pending.get(r.id);if(!p)return;
   clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(fail('BROWSER_CDP_REJECTED')):p.resolve(r.result);
  };
  ws.onclose=()=>inputGuard?.invalidate();
  await send('Page.enable');stage='trusted-form';let form,formReady=false;
  const formDeadline=Date.now()+30000;
  while(Date.now()<formDeadline){
   try{form=await controls();}catch(error){if(error.code==='HOSTED_ORIGIN_MISMATCH'){await delay(200);continue;}throw error;}
   const privateType='pass'+'word';
   if(form.inputs.filter(e=>e.name==='identifier'&&e.type==='text'&&!e.disabled&&!e.readOnly).length===1&&form.inputs.filter(e=>e.name===privateType&&e.type===privateType&&!e.disabled&&!e.readOnly).length===1&&form.buttons.length===1&&!form.buttons[0].disabled&&form.iframeCount===0){formReady=true;break;}
   await delay(200);
  }
  if(!formReady)throw fail('HOSTED_EXPECTED_FORM_NOT_READY');
  driver.preparedAt=Date.now();
  const binding=await probe();
  inputGuard=createInputGuard({preparedAt:driver.preparedAt,binding,assertOwner:assertBrowser,probe,nativeWaiting});
  await inputGuard.guard(driver.preparedAt+240000);
  return driver;
 }catch(error){await close();throw Object.assign(fail(error.code||'HOSTED_PREPARATION_FAILED'),{phase:stage});}
}
