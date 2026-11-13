import {prepareCandidate} from '/private/tmp/cybernote-account109-login-surfaces/scripts/verification/account109-android-build.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,cpSync,unlinkSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='/private/tmp/cybernote-account109-login-surfaces';
const out='/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/android-88b2dabe-debug-01';
const source='88b2dabe4bb898b0bf225e913883b43ed2cac865';
const target='/private/tmp/cybernote-account109-mac-ec4348c6-target-01';
const offline='/private/tmp/cybernote-account109-gradle/init.d/account109-offline-88b2dabe.gradle';
let record={schemaVersion:1,sourceCommit:source,startedAt:new Date().toISOString(),status:'preparing',appLaunched:false,adbUsed:false};
let offlineOwned=false;
try {
 const candidate=await prepareCandidate({root,expectedSource:source,gradleHome:'/private/tmp/cybernote-account109-gradle',targetDir:target});
 Object.assign(candidate.env,{JAVA_HOME:'/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',ANDROID_HOME:'/Users/water/Library/Android/sdk',NDK_HOME:'/Users/water/Library/Android/sdk/ndk/27.2.12479018',CARGO_NET_OFFLINE:'true',CYBERNOTE_BUILD_TARGET:'android',npm_config_offline:'true'});
 writeFileSync(offline,'gradle.startParameter.offline = true\ngradle.startParameter.maxWorkerCount = 2\n',{flag:'wx'});offlineOwned=true;
 record={...record,...candidate.manifest,status:'building',gradleOffline:true,cargoOffline:true,javaHome:candidate.env.JAVA_HOME,ndkHome:candidate.env.NDK_HOME};
 writeFileSync(out+'/build-record.json',JSON.stringify(record,null,2)+'\n');
 const log=await open(out+'/build.log','wx');
 const child=spawn(candidate.manifest.command[0],candidate.manifest.command.slice(1),{cwd:root,env:candidate.env,detached:true,stdio:['ignore',log.fd,log.fd]});
 writeFileSync(out+'/owner.json',JSON.stringify({controllerPid:process.pid,buildGroupPid:child.pid,timeoutMs:1200000},null,2)+'\n');
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM');}catch{}},1200000);
 const result=await new Promise(resolve=>{child.once('error',()=>resolve({exitCode:null,launchFailed:true}));child.once('exit',(exitCode,signal)=>resolve({exitCode,signal}));});
 clearTimeout(timer);await log.close();
 const status=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim();
 Object.assign(record,result,{timedOut,finishedAt:new Date().toISOString(),sourceClean:!status,sourceStatus:status,logSha256:createHash('sha256').update(readFileSync(out+'/build.log')).digest('hex'),status:result.exitCode===0&&!timedOut&&!status?'build-only-passed':'failed'});
 if(record.status==='build-only-passed') {
  const final=execFileSync('python3',[out+'/input-guard.py',root],{cwd:root});
  writeFileSync(out+'/input-final.json',final,{flag:'wx'});
  const before=JSON.parse(readFileSync(out+'/input-before.json'));const after=JSON.parse(final);
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Postbuild input guard changed');
  cpSync(root+'/dist',out+'/frontend-dist',{recursive:true,errorOnExist:true});
 }
 if(record.status!=='build-only-passed')process.exitCode=1;
} catch (error) {
 record.status='failed';record.controllerError=error.message;record.finishedAt=new Date().toISOString();process.exitCode=1;
} finally {
 if(offlineOwned)unlinkSync(offline);
 writeFileSync(out+'/build-record.json',JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({status:record.status,exitCode:record.exitCode,signal:record.signal,sourceClean:record.sourceClean,controllerError:record.controllerError}));
}
