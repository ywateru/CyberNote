/** Read-only terminal evidence. No callback URL, profile fields, tokens or errors
 * are emitted. Native paused/profile proves the native callback was accepted;
 * this observer does not separately inspect or claim a raw OS scheme event.
 */
import { execFileSync } from 'node:child_process';
import { connectAndroid, SERIAL, PACKAGE } from '/private/tmp/cybernote-account109-native/scripts/verification/account109-android.mjs';
import { isUser0Foreground } from './account109-hosted-memory-driver.mjs';
const adb='/Users/water/Library/Android/sdk/platform-tools/adb';
const run=(...args)=>execFileSync(adb,['-s',SERIAL,...args],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function readDevice(){
 const policy=run('shell','dumpsys','window','policy');
 const activities=run('shell','dumpsys','activity','activities');
 return{unlocked:/\bshowing=false\b/.test(policy)&&/\binputRestricted=false\b/.test(policy),ownedAppForeground:isUser0Foreground(activities,PACKAGE)};
}
// Pure classification for offline checks; real observer supplies native DTO.
export function classifyTerminal(s,ownedAppForeground){
 const sameSyntheticUser=s.profile?.username==='cybernoteqa20261113a';
 if(s.state==='paused'&&s.profile&&!s.enabled&&!s.error&&!sameSyntheticUser)return{phase:'callback-identity-mismatch',sameSyntheticUser:false};
 if(s.state==='paused'&&s.profile&&!s.enabled&&!s.error&&ownedAppForeground&&sameSyntheticUser)return{phase:'native-paused-profile-observed',ownedAppForeground:true,deviceUnlocked:true,nativePaused:true,profilePresent:true,syncEnabled:false,nativeErrorPresent:false,sameSyntheticUser:true,nativeCallbackAccepted:true,pageAssociation:'temporal-only',rawSchemeEventInspected:false};
 if(s.state==='error')return{phase:'callback-native-error',ownedAppForeground,nativeErrorPresent:true,profilePresent:!!s.profile,syncEnabled:s.enabled===true};
 if(s.enabled)return{phase:'callback-observation-stopped',code:'UNEXPECTED_SYNC_ENABLED'};
 return null;
}
// Trusted offline probes exercise this same async path without device commands.
export async function observeTerminal({WebSocketImpl=globalThis.WebSocket,timeoutMs=90000,connect=connectAndroid,probe=readDevice,now=Date.now,sleep=pause}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>90000)return{phase:'callback-observation-rejected',code:'OBSERVATION_BOUND_INVALID'};
 let app;
 try{
  const startedAt=now();
  if(!Number.isFinite(startedAt))return{phase:'callback-observation-rejected',code:'OBSERVATION_CLOCK_INVALID'};
  const deadline=startedAt+timeoutMs;
  const timedOut=()=>{const time=now();return!Number.isFinite(time)||time>=deadline;};
  const timeout=()=>({phase:'callback-observation-timeout',code:'NATIVE_PAUSED_PROFILE_NOT_OBSERVED'});
  app=await connect({WebSocketImpl});
  while(!timedOut()){
   const before=probe();
   if(!before.unlocked)return{phase:'callback-observation-stopped',code:'DEVICE_AUTH_REQUIRED'};
   const s=await app.accountStatus();
   if(timedOut())return timeout();
   const current=probe();
   if(timedOut())return timeout();
   if(!current.unlocked)return{phase:'callback-observation-stopped',code:'DEVICE_AUTH_REQUIRED'};
   // Chrome may still be foreground while awaiting the callback. A paused
   // terminal or a lost app foreground after status must never claim success.
   if(!current.ownedAppForeground&&(before.ownedAppForeground||s.state==='paused'))return{phase:'callback-observation-stopped',code:'OWNED_APP_NOT_FOREGROUND'};
   const terminal=classifyTerminal(s,current.ownedAppForeground);
   if(terminal)return terminal;
   await sleep(400);
  }
  return timeout();
 }catch{return{phase:'callback-observation-failed',code:'OWNED_APP_OBSERVATION_FAILED'};}
 finally{if(app){try{await app.close();}catch{return{phase:'callback-observation-failed',code:'OWNED_APP_CLEANUP_FAILED'};}}}
}
