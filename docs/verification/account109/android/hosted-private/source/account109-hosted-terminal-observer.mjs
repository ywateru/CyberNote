/** Read-only terminal evidence. No callback URL, profile fields, tokens or errors
 * are emitted. Native paused/profile proves the native callback was accepted;
 * this observer does not separately inspect or claim a raw OS scheme event.
 */
import { execFileSync } from 'node:child_process';
import { connectAndroid, SERIAL, PACKAGE } from '/private/tmp/cybernote-account109-native/scripts/verification/account109-android.mjs';
const adb='/Users/water/Library/Android/sdk/platform-tools/adb';
const run=(...args)=>execFileSync(adb,['-s',SERIAL,...args],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Pure classification for offline checks; real observer supplies native DTO.
export function classifyTerminal(s,ownedAppForeground){
 const sameSyntheticUser=s.profile?.username==='cybernoteqa20261113a';
 if(s.state==='paused'&&s.profile&&!s.enabled&&!s.error&&!sameSyntheticUser)return{phase:'callback-identity-mismatch',sameSyntheticUser:false};
 if(s.state==='paused'&&s.profile&&!s.enabled&&!s.error&&ownedAppForeground&&sameSyntheticUser)return{phase:'native-paused-profile-observed',ownedAppForeground:true,deviceUnlocked:true,nativePaused:true,profilePresent:true,syncEnabled:false,nativeErrorPresent:false,sameSyntheticUser:true,nativeCallbackAccepted:true,pageAssociation:'temporal-only',rawSchemeEventInspected:false};
 if(s.state==='error')return{phase:'callback-native-error',ownedAppForeground,nativeErrorPresent:true,profilePresent:!!s.profile,syncEnabled:s.enabled===true};
 if(s.enabled)return{phase:'callback-observation-stopped',code:'UNEXPECTED_SYNC_ENABLED'};
 return null;
}
export async function observeTerminal({WebSocketImpl=globalThis.WebSocket,timeoutMs=90000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>90000)return{phase:'callback-observation-rejected',code:'OBSERVATION_BOUND_INVALID'};
 let app;
 try{
  app=await connectAndroid({WebSocketImpl});
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
   const policy=run('shell','dumpsys','window','policy');
   const unlocked=/\bshowing=false\b/.test(policy)&&/\binputRestricted=false\b/.test(policy);
   if(!unlocked)return{phase:'callback-observation-stopped',code:'DEVICE_AUTH_REQUIRED'};
   const resumed=run('shell','dumpsys','activity','activities').split('\n').find(l=>l.includes('mResumedActivity:'))||'';
   const ownedAppForeground=resumed.includes(`${PACKAGE}/`);
   const s=await app.accountStatus();
   const terminal=classifyTerminal(s,ownedAppForeground);
   if(terminal)return terminal;
   await pause(400);
  }
  return{phase:'callback-observation-timeout',code:'NATIVE_PAUSED_PROFILE_NOT_OBSERVED'};
 }catch{return{phase:'callback-observation-failed',code:'OWNED_APP_OBSERVATION_FAILED'};}
 finally{if(app){try{await app.close();}catch{return{phase:'callback-observation-failed',code:'OWNED_APP_CLEANUP_FAILED'};}}}
}
