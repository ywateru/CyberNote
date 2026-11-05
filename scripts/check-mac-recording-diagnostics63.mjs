import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import ts from 'typescript';
const compiled=ts.transpileModule(await readFile('src/native-recording-access.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  .replace(/import \{ isTauri \} from "@tauri-apps\/api\/core";/,'const isTauri=()=>true;')
  .replace(/import \{ recordingAccess \} from "\.\.\/plugins\/tauri-plugin-notes-ui\/guest-js";/,'const recordingAccess=()=>globalThis.invoke63();');
const {authorizeNativeRecording}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const originals=['navigator','invoke63'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{platform:'MacIntel',userAgent:'Mac'}});
let cases=0;
try {
  for(const code of ['microphone_timeout','microphone_busy','microphone_denied','microphone_restricted']) {
    const input={message:'合成失败文案',code,stage:'native_result',requestId:'42',privateContent:'must not copy'};
    globalThis.invoke63=async()=>{throw input;};
    await assert.rejects(authorizeNativeRecording(),error=>{
      assert(error instanceof Error); assert.equal(error.message,input.message); assert.equal(error.code,code);
      assert.equal(error.stage,'native_result'); assert.equal(error.requestId,'42'); assert.equal(error.privateContent,undefined); return true;
    }); cases++;
  }
  const ordinary=Object.assign(new Error('ordinary'),{code:'existing'}); globalThis.invoke63=async()=>{throw ordinary;};
  await assert.rejects(authorizeNativeRecording(),error=>error===ordinary); cases++;
  for(const input of [null,undefined,7,'unknown',{}]) {
    globalThis.invoke63=async()=>{throw input;};
    await assert.rejects(authorizeNativeRecording(),error=>error.message==='无法确认系统麦克风权限，录音未开始。'); cases++;
  }
  for(const [stage,requestId] of [['private title','/private/path'],['native_result','18446744073709551616'],['native_result','0'],['native_result',12]]) {
    globalThis.invoke63=async()=>{throw {message:'safe',code:'microphone_busy',stage,requestId};};
    await assert.rejects(authorizeNativeRecording(),error=>{
      assert.equal(error.code,'microphone_busy'); assert.equal(error.requestId,undefined);
      assert.equal(error.stage,stage==='native_result'?stage:undefined); return true;
    }); cases++;
  }
  globalThis.invoke63=async()=>{throw {message:'safe',code:'microphone_timeout'};};
  await assert.rejects(authorizeNativeRecording(),error=>error.stage===undefined && error.requestId===undefined && error.code==='microphone_timeout'); cases++;
  globalThis.invoke63=async()=>({status:'unknown'}); await assert.rejects(authorizeNativeRecording(),/未明确允许/); cases++;
  globalThis.invoke63=async()=>({status:'authorized'}); await authorizeNativeRecording(); cases++;
} finally { for(const [name,descriptor] of originals) if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]; }
console.log(`PASS ${cases} production JS structured-error cases; IPC stub only`);
const binary=process.argv[2];
if(binary) {
  const base={...process.env}; delete base.NOTES_RECORDING_DIAGNOSTICS;
  for(const value of [undefined,'0','true','1']) {
    const env={...base,...(value===undefined?{}:{NOTES_RECORDING_DIAGNOSTICS:value})};
    const result=spawnSync(binary,['--exact','sink_contract63','--nocapture'],{env,encoding:'utf8'}); assert.equal(result.status,0,result.stderr);
    if(value==='1') {
      const lines=result.stderr.trim().split('\n'); assert.equal(lines.length,3);
      for(const stage of ['rust_dispatch','os_completion_entry','rust_wait_cancelled'])assert(lines.some(line=>line.includes(`stage=${stage} `)));
    } else assert.equal(result.stderr,'','default/off/invalid flag must be silent');
    console.log(result.stdout.trim());
  }
  const result=spawnSync(binary,['--exact','sink_contract63','--nocapture'],{env:{...base,NOTES_RECORDING_DIAGNOSTICS:'1',DIAGNOSTICS63_SYNTHETIC_FLOOD:'1'},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const lines=result.stderr.trim().split('\n'); assert(lines.length>=2 && lines.length<=257);
  assert.equal(lines.filter(line=>line.includes('stage=truncated')).length,1);
  const summary=lines.at(-1).match(/^notes-recording-diag stage=truncated event_limit=256 emitted=(\d+) queue_dropped=(\d+) budget_dropped=(\d+) t_us=\d+$/);
  assert(summary); assert.equal(Number(summary[1]),lines.length-1);
  assert.equal(Number(summary[1])+Number(summary[2]),256); assert.equal(Number(summary[3]),144);
  for(const line of lines.slice(0,-1))assert.match(line,/^notes-recording-diag request=1 stage=rust_dispatch code=0 status=-1 t_us=\d+$/);
  console.log('PASS production Rust sink: strict opt-in, zero output by default, nonblocking bounded queue, <=256 events + one drop/truncation snapshot across 4 concurrent threads');
}
const blockedBinary=process.argv[3];
if(blockedBinary) {
  await new Promise((resolve,reject)=>{
    const child=spawn(blockedBinary,[],{env:{...process.env,NOTES_RECORDING_DIAGNOSTICS:'1'},stdio:['ignore','pipe','pipe']});
    let output=''; const deadline=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('blocked stderr stalled authorization/producer beyond 5 seconds'));},5000);
    // Deliberately never attach a stderr reader until the child has exited.
    child.stdout.setEncoding('utf8'); child.stdout.on('data',text=>{output+=text;});
    child.on('error',error=>{clearTimeout(deadline);reject(error);});
    child.on('exit',()=>{child.stderr.resume();});
    child.on('close',(code,signal)=>{
      clearTimeout(deadline);
      try {assert.equal(code,0,`code=${code} signal=${signal} ${output}`);assert.match(output,/blocked-output production Rust producer_ms=/);assert.match(output,/69 unchanged query\/request\/reply\/release operations/);console.log(output.trim());resolve();}catch(error){reject(error);}
    });
  });
}
