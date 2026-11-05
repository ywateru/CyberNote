import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {openRuntime,saveJSON} from '../../../../scripts/debug/runtime.mjs';
let runtime;
try {
 runtime=await openRuntime({mobile:true,tmp:'/private/tmp'});
 const result=await runtime.page.evaluate(async()=>{
  const module=await import('/node_modules/@tauri-apps/api/app.js');
  const hits=[];
  const listener=await module.onBackButtonPress(payload=>hits.push(payload));
  const first=await window.__DEBUG_PLATFORM__.backIntent(false);
  const second=await window.__DEBUG_PLATFORM__.backIntent(true);
  const before=hits.length;
  await listener.unregister();
  const afterRemoval=await window.__DEBUG_PLATFORM__.backIntent(false);
  const after=hits.length;
  let invalidRejected=false;
  try {await window.__TAURI_INTERNALS__.invoke('plugin:app|register_listener',{event:'back-button',handler:{id:-999}});} catch {invalidRejected=true;}
  return {hits,before,after,first,second,afterRemoval,invalidRejected,platform:'mobile browser synthetic back event only'};
 });
 assert.deepEqual(result.hits,[{canGoBack:false},{canGoBack:true}]);
 assert.equal(result.before,2);assert.equal(result.after,2);assert.equal(result.invalidRejected,true);
 assert.equal(result.first.simulated,true);assert.equal(result.first.nativeBackTested,false);
 assert.deepEqual(runtime.errors,[]);
 const evidence={pass:true,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),metadata:runtime.metadata,installedPrimarySource:['node_modules/@tauri-apps/api/app.js:279','node_modules/@tauri-apps/api/core.js:213','node_modules/@tauri-apps/api/core.js:251'],result,pageErrors:runtime.errors};
 await saveJSON('docs/verification/app-debug-automation70/independent/mobile-back.json',evidence);
 console.log(JSON.stringify(evidence));
}finally {await runtime?.cleanup();}
