/** Fixed, credential-free public metadata probe. No page enumeration or body reads. */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {selectBrowserPid,verifyBrowserEndpoint,isUser0Foreground} from './account109-hosted-memory-driver.mjs';
import {acquireDriverLease} from '/private/tmp/cybernote-account109-native/scripts/verification/sync108-android-lifecycle.mjs';
const serial='98895a3147304c3132';
const run=(...args)=>execFileSync('/Users/water/Library/Android/sdk/platform-tools/adb',['-s',serial,...args],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','ignore']});
const fail=code=>Object.assign(Error(code),{code});
const classifyCategory=raw=>({ 'net::ERR_NAME_NOT_RESOLVED':'dns', 'net::ERR_CONNECTION_RESET':'connection_reset', 'net::ERR_CONNECTION_REFUSED':'connection_refused', 'net::ERR_CONNECTION_CLOSED':'connection_closed', 'net::ERR_CONNECTION_TIMED_OUT':'timeout', 'net::ERR_TIMED_OUT':'timeout', 'net::ERR_INTERNET_DISCONNECTED':'offline', 'net::ERR_NETWORK_CHANGED':'network_changed', 'net::ERR_ABORTED':'aborted' }[raw]||(typeof raw==='string'&&/^net::ERR_(?:CERT_|SSL_)/.test(raw)?'tls':'fetch_failed'));
const allowedNet=new Set(['net::ERR_NAME_NOT_RESOLVED','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_CLOSED','net::ERR_CONNECTION_TIMED_OUT','net::ERR_TIMED_OUT','net::ERR_INTERNET_DISCONNECTED','net::ERR_NETWORK_CHANGED','net::ERR_ABORTED','net::ERR_SSL_PROTOCOL_ERROR','net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH','net::ERR_CERT_AUTHORITY_INVALID','net::ERR_CERT_COMMON_NAME_INVALID','net::ERR_CERT_DATE_INVALID','net::ERR_CERT_REVOKED','net::ERR_EMPTY_RESPONSE','net::ERR_ADDRESS_UNREACHABLE','net::ERR_TUNNEL_CONNECTION_FAILED','net::ERR_PROXY_CONNECTION_FAILED']);
const classify=raw=>allowedNet.has(raw)?raw:'unclassified_network_failure';
export async function probeNavigation({WebSocketImpl}){
 const lease=await acquireDriverLease(path.join(os.tmpdir(),`cybernote-account109-browser-${serial}.lock`));
 let owned,ws,targetId,seq=0;const pending=new Map();let active;
 const receipt={schemaVersion:1,recordedAt:new Date().toISOString(),scope:'user0-Chrome-direct-navigation-public-metadata-only',method:'direct-Page.navigate',responseBodyRead:false,requestHeadersRead:false,appGrantAccessed:false,dnsTlsOverrides:false,otherPagesEnumerated:false,results:[]};
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
   
   if(m.method==='Network.responseReceived'&&m.params.requestId===active.id&&m.params.type==='Document'&&m.params.response?.url===active.url)active.httpStatus=m.params.response.status;
   if(m.method==='Network.loadingFailed'&&m.params.requestId===active.id)active.networkError=classify(m.params.errorText);
  };
  targetId=(await send('Target.createTarget',{url:'about:blank'})).targetId;
  await send('Target.activateTarget',{targetId});
  run('shell','am','start','--user','0','-n','com.android.chrome/com.google.android.apps.chrome.Main','-a','android.intent.action.MAIN');
  await send('Target.activateTarget',{targetId});
  if(!isUser0Foreground(run('shell','dumpsys','activity','activities'),'com.android.chrome'))throw fail('PUBLIC_BROWSER_NOT_USER0_FOREGROUND');
  receipt.user0ChromeForeground=true;
  const sessionId=(await send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
  await send('Network.enable',{},sessionId);await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId);await send('Network.setBypassServiceWorker',{bypass:true},sessionId);
  await send('Page.enable',{},sessionId);
  const cases=[{endpoint:'health',url:'https://cybernote-sync.vercel.app/healthz',limitMs:30000},{endpoint:'oidc-discovery-control',url:'https://auth.x.aixgg.com/oidc/.well-known/openid-configuration',limitMs:20000}];
  for(const {endpoint,url,limitMs} of cases){
   if(endpoint==='oidc-discovery-control'&&receipt.results[0]?.httpStatus)break;
   lease.assertOpen();
   const currentPolicy=run('shell','dumpsys','window','policy');
   if(!/\bshowing=false\b/.test(currentPolicy)||!/\binputRestricted=false\b/.test(currentPolicy)||!isUser0Foreground(run('shell','dumpsys','activity','activities'),'com.android.chrome'))throw fail('PUBLIC_BROWSER_NOT_USER0_FOREGROUND');
   if(currentPid()!==pid)throw fail('PUBLIC_BROWSER_OWNER_CHANGED');
   const started=Date.now();active={sessionId,url};
   const current=active;
   // Observe the navigation asynchronously so the wall-clock bound includes it.
   const navigating=send('Page.navigate',{url},sessionId).then(result=>{if(active===current&&result.errorText)current.networkError=classify(result.errorText);}).catch(()=>{if(active===current)current.navigationCommandFailed=true;});
   while(Date.now()-started<limitMs&&!current.httpStatus&&!current.networkError)await new Promise(resolve=>setTimeout(resolve,100));
   active=undefined;
   const elapsedMs=Date.now()-started;
   await send('Page.stopLoading',{},sessionId);
   receipt.results.push({endpoint,limitMs,elapsedMs,stopLoadingSent:true,...(Number.isInteger(current.httpStatus)&&current.httpStatus>=100&&current.httpStatus<=599?{httpStatus:current.httpStatus}:current.networkError?{networkError:current.networkError}:{result:'diagnostic_deadline_no_http'}),...(current.navigationCommandFailed?{navigationCommandFailed:true}:{})});
   // `navigating` already has a fixed-error handler; cleanup settles any pending RPC.
   void navigating;
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
