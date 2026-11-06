import assert from 'node:assert/strict';
import {abortReasons,applyErrors,validateDiagnostics,readNativeDiagnostics} from './diagnostics89.mjs';
const valid=()=>({version:2,commits:0,aborts:1,latestAbortReason:'applyError',abortReasons:Object.fromEntries(abortReasons.map(r=>[r,r==='applyError'?1:0])),activePhase:null,latestApplyError:'databaseNotNull',applyErrors:Object.fromEntries(applyErrors.map(r=>[r,r==='databaseNotNull'?1:0]))});
assert.equal(abortReasons.length,19);assert.equal(applyErrors.length,29);assert.deepEqual(validateDiagnostics(valid()),valid());
for(const mutate of [v=>v.version=1,v=>v.version='SECRET_VERSION',v=>v.SECRET_KEY=1,v=>v.latestApplyError='SECRET_REASON',v=>delete v.applyErrors.databaseOther,v=>v.applyErrors.other=-1,v=>v.applyErrors.other=Number.MAX_SAFE_INTEGER+1,v=>v.applyErrors.other=true,v=>v.applyErrors.SECRET_KEY=1,v=>Object.defineProperty(v.applyErrors,'other',{get(){throw Error('SECRET_GETTER');}})]){
  const v=valid();mutate(v);assert.throws(()=>validateDiagnostics(v),e=>e.message==='native diagnostics refused'&&!e.cause&&!Object.hasOwn(e,'actual'));
}
let calls=0;
assert.deepEqual(await readNativeDiagnostics({read:async expression=>{calls++;assert.equal(expression,"(async()=>{const w=await window.__TAURI_INTERNALS__.invoke('load_workspace');return window.__TAURI_INTERNALS__.invoke('sync_diagnostics',{expected:{sessionId:w.access.sessionId,epoch:w.access.epoch}})})()");return valid();}}),valid());assert.equal(calls,1);
await assert.rejects(readNativeDiagnostics({read:async()=>{throw Error('SECRET_IPC_ERROR');}}),e=>e.message==='native diagnostics refused'&&!e.cause&&!Object.hasOwn(e,'actual'));
console.log(JSON.stringify({ok:true,checks:13}));
