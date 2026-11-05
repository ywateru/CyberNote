import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import ts from 'typescript';
const out=resolve(process.argv[2]);await mkdir(out,{recursive:true});
const source=await readFile('src/native-recording-access.ts','utf8');
let compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
assert(compiled.includes('import { isTauri } from "@tauri-apps/api/core";'));
assert(compiled.includes('import { recordingAccess } from "../plugins/tauri-plugin-notes-ui/guest-js";'));
compiled=compiled.replace('import { isTauri } from "@tauri-apps/api/core";','const isTauri=()=>globalThis.__isTauri63;').replace('import { recordingAccess } from "../plugins/tauri-plugin-notes-ui/guest-js";','const recordingAccess=()=>globalThis.__invoke63();');
const {authorizeNativeRecording}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const globals=['navigator','__isTauri63','__invoke63'];const originals=globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
const results=[];let calls=0;
const environment=(tauri=true,platform='MacIntel',userAgent='Mac')=>{globalThis.__isTauri63=tauri;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{platform,userAgent}})};
const rejectWith=(value)=>{globalThis.__invoke63=async()=>{calls++;throw value}};
const check=async(name,fn)=>{await fn();results.push({name,status:'PASS'})};
try {
 environment();
 for(const code of ['microphone_timeout','microphone_busy','microphone_denied','microphone_restricted','microphone_unsettled','microphone_native','window_closed','window_mismatch','thread','dispatch','microphone_bridge']) {
  await check('structured-code-'+code,async()=>{const message='synthetic '+code;rejectWith({code,message,stage:'native_result',requestId:'42',privateNote:'not copied',nested:{secret:'not copied'}});await assert.rejects(authorizeNativeRecording(),e=>{assert(e instanceof Error);assert.equal(e.message,message);assert.deepEqual(Object.keys(e).sort(),['code','requestId','stage']);assert.equal(e.code,code);assert.equal(e.stage,'native_result');assert.equal(e.requestId,'42');return true})});
 }
 for(const stage of ['native_result','rust_dispatch','rust_wait_deadline','rust_wait_receive','rust_revalidate','rust_delivery']) await check('stage-'+stage,async()=>{rejectWith({code:'microphone_busy',message:'same',stage,requestId:'18446744073709551615'});await assert.rejects(authorizeNativeRecording(),e=>e.stage===stage&&e.requestId==='18446744073709551615'&&e.message==='same')});
 for(const requestId of ['0','01','-1','18446744073709551616','123456789012345678901','title/path','1\n','',42,null]) await check('unsafe-or-invalid-id-'+JSON.stringify(requestId),async()=>{rejectWith({code:'microphone_timeout',message:'same',stage:'native_result',requestId});await assert.rejects(authorizeNativeRecording(),e=>e.requestId===undefined&&e.code==='microphone_timeout'&&e.message==='same')});
 await check('unknown-stage-and-private-fields-not-read',async()=>{const value={code:'microphone_busy',message:'same',stage:'synthetic private title',requestId:'42'};Object.defineProperty(value,'privateAudio',{get(){throw new Error('must not inspect private property')}});rejectWith(value);await assert.rejects(authorizeNativeRecording(),e=>e.stage===undefined&&e.requestId==='42'&&!('privateAudio' in e))});
 await check('off-wire-optional-fields-absent',async()=>{rejectWith({code:'microphone_timeout',message:'same'});await assert.rejects(authorizeNativeRecording(),e=>e.code==='microphone_timeout'&&e.stage===undefined&&e.requestId===undefined&&e.message==='same')});
 await check('ordinary-error-identity-preserved',async()=>{const value=Object.assign(new TypeError('ordinary'),{code:'existing',cause:new Error('synthetic cause')});rejectWith(value);await assert.rejects(authorizeNativeRecording(),e=>e===value)});
 for(const value of [undefined,null,0,false,'unknown',{}, {message:12},{message:null}]) await check('unknown-error-'+JSON.stringify(value),async()=>{rejectWith(value);await assert.rejects(authorizeNativeRecording(),e=>e.message==='无法确认系统麦克风权限，录音未开始。')});
 await check('invalid-code-type-not-copied',async()=>{rejectWith({message:'safe',code:{nested:'private'}});await assert.rejects(authorizeNativeRecording(),e=>e.message==='safe'&&e.code===undefined)});
 await check('authorized-success',async()=>{globalThis.__invoke63=async()=>{calls++;return {status:'authorized'}};assert.equal(await authorizeNativeRecording(),undefined)});
 for(const result of [null,undefined,{}, {status:'denied'},{status:'unknown'}]) await check('unknown-success-is-failure-'+JSON.stringify(result),async()=>{globalThis.__invoke63=async()=>{calls++;return result};await assert.rejects(authorizeNativeRecording(),e=>e.message==='系统未明确允许麦克风访问，录音未开始。')});
 for(const [tauri,platform,agent] of [[false,'MacIntel','Mac'],[true,'Linux x86','Linux'],[true,'MacIntel','Android'],[true,'MacIntel','iPhone'],[true,'MacIntel','iPad']]) await check('environment-gate-'+[tauri,platform,agent].join('-'),async()=>{environment(tauri,platform,agent);const before=calls;await assert.rejects(authorizeNativeRecording(),e=>e.message==='当前环境不支持Mac麦克风授权预检。');assert.equal(calls,before)});
 await writeFile(resolve(out,'result.json'),JSON.stringify({source:'78f9f9d896e8c5d75311f3202484ff119f57369c',boundary:'Real production JS helper transpiled; only isTauri/invoke/platform are synthetic. No native, media, permissions or app runtime.',status:'PASS',cases:results.length,invokeCalls:calls,results},null,2)+'\n');console.log(`PASS ${results.length} independent production-helper JS cases; no native/media/device`);
} finally {for(const [name,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}
