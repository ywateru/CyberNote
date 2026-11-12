/** Fixed, credential-free public metadata probe. No page enumeration or body reads. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {selectBrowserPid,verifyBrowserEndpoint,isUser0Foreground} from './account109-hosted-memory-driver.mjs';
import {acquireDriverLease} from '/private/tmp/cybernote-account109-native/scripts/verification/sync108-android-lifecycle.mjs';
const serial='98895a3147304c3132';
const run=(...args)=>execFileSync('/Users/water/Library/Android/sdk/platform-tools/adb',['-s',serial,...args],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore']});
const fail=code=>Object.assign(Error(code),{code});
const classify=raw=>({ 'net::ERR_NAME_NOT_RESOLVED':'dns', 'net::ERR_CONNECTION_RESET':'connection_reset', 'net::ERR_CONNECTION_REFUSED':'connection_refused', 'net::ERR_CONNECTION_CLOSED':'connection_closed', 'net::ERR_CONNECTION_TIMED_OUT':'timeout', 'net::ERR_TIMED_OUT':'timeout', 'net::ERR_INTERNET_DISCONNECTED':'offline', 'net::ERR_NETWORK_CHANGED':'network_changed', 'net::ERR_ABORTED':'aborted' }[raw]||(typeof raw==='string'&&/^net::ERR_(?:CERT_|SSL_)/.test(raw)?'tls':'fetch_failed'));
export async function probePublic({WebSocketImpl}){
 const lease=await acquireDriverLease(path.join(os.tmpdir(),`cybernote-account109-browser-${serial}.lock`));
 let owned,ws,targetId,seq=0;const pending=new Map();let active;
 const receipt={schemaVersion:1,recordedAt:new Date().toISOString(),scope:'user0-Chrome-public-metadata-only',requestCredentials:'omit',responseBodyRead:false,requestHeadersRead:false,appGrantAccessed:false,dnsTlsOverrides:false,otherPagesEnumerated:false,results:[]};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
  const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(fail('PUBLIC_CDP_TIMEOUT'));},25000);
  pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
 });
 try{
  const policy=run('shell','dumpsys','window','policy');
  if(!/\bshowing=false\b/.test(policy)||!/\binputRestricted=false\b/.test(policy))throw fail('DEVICE_AUTH_REQUIRED');
  const packageLine=run('shell','cmd','package','list','packages','-U','--user','0','com.android.chrome').split('\n').find(l=>/^package:com\.android\.chrome\s+uid:\d+\s*$/.test(l));
  const uid=packageLine?.match(/uid:(\d+)/)?.[1];
  const currentPid=()=>selectBrowserPid(run('shell','pidof','com.android.chrome').trim().split(/\s+/),uid,pid=>({name:run('shell','cat',`/proc/${pid}/cmdline`).split('\0')[0],uid:run('shell','cat',`/proc/${pid}/status`).match(/^Uid:\s+(\d+)/m)?.[1]}));
  const pid=currentPid(),remote='localabstract:chrome_devtools_remote',port=Number(run('forward','--no-rebind','tcp:0',remote).trim());
  if(!Number.isInteger(port)||port<1024)throw fail('PUBLIC_FORWARD_INVALID');
  owned={serial,pid,local:`tcp:${port}`,remote};receipt.ownedMapping=owned;
  await verifyBrowserEndpoint({port,pid,WebSocketImpl});receipt.user0BrowserEndpointPidVerified=true;
  const version=await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(3000)})).json();
  const socket=new URL(version.webSocketDebuggerUrl);
  if(socket.protocol!=='ws:'||!['localhost','127.0.0.1'].includes(socket.hostname)||Number(socket.port)!==port)throw fail('PUBLIC_SOCKET_AUTHORITY_MISMATCH');
  ws=new WebSocketImpl(socket);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(fail('PUBLIC_SOCKET_TIMEOUT')),5000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=()=>{clearTimeout(timer);reject(fail('PUBLIC_SOCKET_FAILED'));};});
  ws.onmessage=event=>{
   let m;try{m=JSON.parse(event.data);}catch{return;}
   const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(fail('PUBLIC_CDP_REJECTED')):p.resolve(m.result);return;}
   if(!active||m.sessionId!==active.sessionId)return;
   if(m.method==='Network.requestWillBeSent'&&m.params.request?.url===active.url)active.id=m.params.requestId;
   if(m.method==='Network.responseReceivedExtraInfo')active.extra.set(m.params.requestId,m.params.statusCode);
   if(m.method==='Network.responseReceived'&&m.params.requestId===active.id&&m.params.response?.url===active.url)active.httpStatus=m.params.response.status;
   if(m.method==='Network.loadingFailed'&&m.params.requestId===active.id)active.networkCategory=classify(m.params.errorText);
  };
  targetId=(await send('Target.createTarget',{url:'about:blank'})).targetId;
  await send('Target.activateTarget',{targetId});
  run('shell','am','start','--user','0','-n','com.android.chrome/com.google.android.apps.chrome.Main','-a','android.intent.action.MAIN');
  await send('Target.activateTarget',{targetId});
  if(!isUser0Foreground(run('shell','dumpsys','activity','activities'),'com.android.chrome'))throw fail('PUBLIC_BROWSER_NOT_USER0_FOREGROUND');
  receipt.user0ChromeForeground=true;
  const sessionId=(await send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
  await send('Network.enable',{},sessionId);await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId);await send('Network.setBypassServiceWorker',{bypass:true},sessionId);
  const blank=await send('Runtime.evaluate',{expression:'({blank:location.href==="about:blank",visible:document.visibilityState==="visible"})',returnByValue:true},sessionId);
  if(!blank.result?.value?.blank||!blank.result.value.visible)throw fail('PUBLIC_BLANK_PAGE_NOT_VISIBLE');
  receipt.onlyCreatedBlankPageVisible=true;
  const urls=[['health','https://cybernote-sync.vercel.app/healthz'],['native-auth-config','https://cybernote-sync.vercel.app/api/v1/auth/config?appId=il4abzwbu1ohjwv5mb667'],['anonymous-profile','https://cybernote-sync.vercel.app/api/v1/account/profile']];
  for(const [endpoint,url] of urls){
   lease.assertOpen();const currentPolicy=run('shell','dumpsys','window','policy');if(!/\bshowing=false\b/.test(currentPolicy)||!/\binputRestricted=false\b/.test(currentPolicy)||!isUser0Foreground(run('shell','dumpsys','activity','activities'),'com.android.chrome'))throw fail('PUBLIC_BROWSER_NOT_USER0_FOREGROUND');if(currentPid()!==pid)throw fail('PUBLIC_BROWSER_OWNER_CHANGED');
   active={sessionId,url,extra:new Map()};
   const evaluation=await send('Runtime.evaluate',{expression:`(async()=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);try{await fetch(${JSON.stringify(url)},{credentials:'omit',redirect:'error',cache:'no-store',signal:c.signal});return{fetchCompleted:true,deadlineReached:false};}catch{return{fetchCompleted:false,deadlineReached:c.signal.aborted};}finally{clearTimeout(t);}})()`,awaitPromise:true,returnByValue:true},sessionId);
   await new Promise(resolve=>setTimeout(resolve,150));
   const status=active.httpStatus??active.extra.get(active.id);
   receipt.results.push({endpoint,...(Number.isInteger(status)&&status>=100&&status<=599?{httpStatus:status}:{networkCategory:evaluation.result?.value?.deadlineReached?'probe_deadline':active.networkCategory||'no_http_metadata'}),...(Number.isInteger(status)&&active.networkCategory?{browserFetchCategory:active.networkCategory}:{})});
   active=undefined;
  }
 }catch(error){receipt.failureCode=['DEVICE_AUTH_REQUIRED','PUBLIC_BROWSER_OWNER_CHANGED'].includes(error?.code)?error.code:'PUBLIC_METADATA_PROBE_FAILED';}
 finally{
  receipt.cleanup={};
  if(targetId&&ws){try{await send('Target.closeTarget',{targetId});receipt.cleanup.onlyCreatedTargetClosed=true;}catch{receipt.cleanup.onlyCreatedTargetClosed=false;}}
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(fail('PUBLIC_CLOSED'));}pending.clear();ws?.close();
  await lease.close(async()=>{if(owned&&run('forward','--list').trim().split('\n').includes(`${serial} ${owned.local} ${owned.remote}`))run('forward','--remove',owned.local);});
  receipt.cleanup.exactForwardAbsent=!owned||!run('forward','--list').trim().split('\n').includes(`${serial} ${owned.local} ${owned.remote}`);
  receipt.cleanup.leaseReleased=true;
  try{run('shell','am','start','--user','0','-n','com.local.notesclone.account109/com.local.notesclone.MainActivity');receipt.cleanup.ownedSandboxForeground=isUser0Foreground(run('shell','dumpsys','activity','activities'),'com.local.notesclone.account109');}catch{receipt.cleanup.ownedSandboxForeground=false;}
 }
 return receipt;
}
