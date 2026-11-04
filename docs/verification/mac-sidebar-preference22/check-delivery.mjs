// Focused port-contract edge: a delivery may expose value AND maintenanceError.
// Main integration uses the actual unchanged bridge; this covers the stricter helper input shape.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root='docs/verification/mac-sidebar-preference22';const source=await readFile('src/sidebar-preference.ts','utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {SidebarPreference}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const workspace=value=>({folders:[],notes:[],attachments:[],settings:{macSidebarVisible:value}});const cases=[];
for(const mode of ['maintenance-with-value','unaccepted-with-value','strict-boolean-read','accepted-exact']){
 let reads=0,writes=0;const preference=new SidebarPreference(async()=>{writes++;return{accessAccepted:mode!=='unaccepted-with-value',value:workspace(false),...(mode==='maintenance-with-value'?{maintenanceError:Error('Controlled maintenance')}:{}),...(mode==='strict-boolean-read'?{value:workspace('false')}: {})}},async()=>{reads++;if(mode==='maintenance-with-value')throw Error('Controlled trusted read failure');return workspace(mode==='strict-boolean-read'?'false':false)});
 let failure;try{await preference.request(false)}catch(error){failure=String(error)}
 assert.equal(writes,1);
 if(['maintenance-with-value','strict-boolean-read'].includes(mode)){assert.match(failure,/侧栏显示偏好未确认保存/);assert.equal(preference.needsConfirmation,true)}else{assert.equal(failure,undefined);assert.equal(preference.needsConfirmation,false)}
 assert.equal(reads,mode==='accepted-exact'?0:1);cases.push({mode,writes,reads,dirty:preference.needsConfirmation,failure:failure??null,pass:true});
}
const result={status:'pass',scope:'Actual production helper, transpiled without semantic rewrite; controlled delivery ports only, supplement to 27 real App/bridge/Rust cases.',sourceSha256:createHash('sha256').update(source).digest('hex'),typescriptVersion:ts.version,cases};await writeFile(root+'/delivery-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
