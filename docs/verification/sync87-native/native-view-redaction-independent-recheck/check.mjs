// Only the two prior P2 witnesses and positive integration paths; host-only.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertHomeVisible} from '../../../../scripts/debug/sync87-native/client.mjs';
import {guardFailureSummary} from '../../../../scripts/debug/sync87-native/protocol.mjs';
const run=await readFile('scripts/debug/sync87-native/run.mjs','utf8');
const out=resolve('docs/verification/sync87-native/native-view-redaction-independent-recheck');
const between=(a,b)=>{assert(run.includes(a)&&run.includes(b));return run.slice(run.indexOf(a),run.indexOf(b,run.indexOf(a)));};
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const homeSource=between("    case 'home':{","    case 'createNote':").replace("    case 'home':{",'{');
const home=new AsyncFunction('app','goHome','assertHomeVisible','output',homeSource);
const results=[];
async function test(name,operation){try{await operation();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
function homeFixture(hidden){
 const calls=[];
 const gallery={getBoundingClientRect:()=>({x:16,y:172,width:hidden?0:328,height:hidden?0:330})},add={getBoundingClientRect:()=>({x:284,y:492,width:56,height:56})},editor={getBoundingClientRect:()=>({x:0,y:0,width:0,height:0})};
 const document={querySelector:selector=>selector==='.mobile-add-note'?add:selector==='.tiptap'?editor:selector==='.app'?{className:'app mobile page-notes'}:gallery};
 const evaluate=expression=>new Function('document','getComputedStyle','innerWidth','innerHeight','return '+expression)(document,e=>e===add?{backgroundColor:'rgb(255, 188, 0)'}:{gridTemplateColumns:'158px 158px',display:'grid',visibility:'visible'},360,568);
 const c={wait:async expression=>{calls.push('wait');assert(evaluate(expression));},read:async expression=>{calls.push('read');return evaluate(expression);},snapshot:async(_out,name)=>calls.push('snapshot:'+name)};
 return{c,calls,goHome:async value=>{assert.equal(value,c);calls.push('goHome');}};
}
await test('Original P2 hidden gallery rejected by exact final home path before snapshot',async()=>{const x=homeFixture(true);await assert.rejects(home(async()=>x.c,x.goHome,assertHomeVisible,'/synthetic'),/gallery must have visible bounds/);assert.equal(x.calls[0],'goHome');assert(!x.calls.some(c=>c.startsWith('snapshot:')));});
await test('Visible mobile notes gallery passes exact home path after goHome with final evidence name',async()=>{const x=homeFixture(false),v=await home(async()=>x.c,x.goHome,assertHomeVisible,'/synthetic');assert.equal(x.calls[0],'goHome');assert.equal(x.calls.at(-1),'snapshot:home-visible-final');assert.equal(v.app,'app mobile page-notes');assert.equal(v.gallery.width,328);assert.equal(v.editor.width,0);});
const stepSource=between('async function nativeStep(','async function persistedNote(');
function step(){const records=[];return{records,call:new Function('assert','appendFile','resolve','output','performance','guardFailureSummary',stepSource+'return nativeStep;')(assert,async(path,line)=>records.push({file:path.split('/').at(-1),record:JSON.parse(line)}),resolve,'/synthetic',performance,guardFailureSummary)};}
await test('Original P2 arbitrary guard message removed from both exact final step logs',async()=>{const x=step(),secret='SYNTHETIC_PRIVATE_SENTINEL',e=Object.assign(Error(secret),{stdout:JSON.stringify({ok:false,error:'Refused',message:secret})});await assert.rejects(x.call('attachments-synthetic',async()=>{throw e;}),v=>v===e);assert(!JSON.stringify(x.records).includes(secret));assert.deepEqual(x.records[1],{file:'attachment-guard-failures.jsonl',record:{step:'attachments-synthetic',event:'GUARD_FAILURE_REDACTED'}});assert.equal(x.records.at(-1).record.reason,'guard-command-failed');});
await test('Exact exit137 still records only fixed event and preserves original failure',async()=>{const x=step(),e=Object.assign(Error('synthetic'),{stdout:JSON.stringify({ok:false,error:'Refused',message:'bounded subprocess failed 137: '})});await assert.rejects(x.call('attachments-synthetic',async()=>{throw e;}),v=>v===e);assert.deepEqual(x.records[1],{file:'attachment-guard-failures.jsonl',record:{step:'attachments-synthetic',event:'GUARD_BOUNDED_EXIT_137'}});assert.equal(x.records.at(-1).record.phase,'fail');});
const result={status:results.every(x=>x.pass)?'PASS':'BLOCKED',frozenAuthor:'95aa2c3f',results,priorFindingsClosed:['home-visible-assertions','guard-detail-arbitrary-message'],hostOnly:true,adbCalls:0,deviceActions:0,limits:'No selector acceptance, device tests, attachment multi/continuous/export or sync acceptance was run.'};
await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:results.length,failed:results.filter(x=>!x.pass),adbCalls:0}));if(results.some(x=>!x.pass))process.exitCode=1;
