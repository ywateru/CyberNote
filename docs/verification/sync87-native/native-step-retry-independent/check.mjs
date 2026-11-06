// Host-only execution of exact frozen function bodies, with explicit synthetic dependencies.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseNodes,nativeWebViewRect} from '../../../../scripts/debug/sync87-native/client.mjs';
const out=resolve('docs/verification/sync87-native/native-step-retry-independent');
const client=await readFile('scripts/debug/sync87-native/client.mjs','utf8');
const run=await readFile('scripts/debug/sync87-native/run.mjs','utf8');
const guardSource=await readFile('scripts/debug/sync87-native/guard.py','utf8');
const results=[];
async function test(name,operation){try{await operation();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.message});}}
const between=(s,a,b)=>{assert(s.includes(a)&&s.includes(b));return s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));};
const tapSource=between(client,'    const nativeTap=','    const insert=');
const xml='<node class="android.webkit.WebView" package="com.local.notesclone" bounds="[0,48][720,1184]"/>';
const refused=(message='bounded subprocess failed 137: ',error='Refused')=>Object.assign(Error('synthetic child failure'),{stdout:JSON.stringify({ok:false,error,message})});
function makeTap(sequence,{pointError,tapError}={}){
  const calls=[],events=[];let next=0;
  const point=async()=>{calls.push('point');if(pointError)throw pointError;return{x:100,y:150};};
  const guard=async(op,args)=>{calls.push({op,args});if(op==='tap'){if(tapError)throw tapError;return;}const value=sequence[next++];if(value instanceof Error)throw value;return value;};
  const tap=new Function('point','guard','errors','pause','parseNodes','nativeWebViewRect','read',tapSource+'return nativeTap;')(point,guard,events,async ms=>calls.push({pause:ms}),parseNodes,nativeWebViewRect,async()=>({width:360,height:568}));
  return{tap,calls,events};
}
await test('137 followed by success retries exactly one read-only dump and taps once',async()=>{const x=makeTap([refused(),xml]);await x.tap('synthetic');assert.equal(x.calls.filter(v=>v.op==='uia').length,2);assert.equal(x.calls.filter(v=>v.op==='tap').length,1);assert.deepEqual(x.events,[{event:'UIA_DUMP_EXIT_137',retry:1}]);assert.deepEqual(x.calls.at(-1),{op:'tap',args:{x:200,y:348}});});
await test('second exit137 propagates without third dump or tap',async()=>{const e=refused(),x=makeTap([refused(),e,xml]);await assert.rejects(x.tap('synthetic'),v=>v===e);assert.equal(x.calls.filter(v=>v.op==='uia').length,2);assert.equal(x.calls.filter(v=>v.op==='tap').length,0);});
for(const [label,e] of [['exit1',refused('bounded subprocess failed 1: ')],['stderr-bearing137',refused('bounded subprocess failed 137: diagnostic')],['different-error',refused(undefined,'Other')],['malformed-output',Object.assign(Error('synthetic'),{stdout:'not-json'})],['non-guard',Error('synthetic')]])await test(label+' never retried',async()=>{const x=makeTap([e,xml]);await assert.rejects(x.tap('synthetic'),v=>v===e);assert.equal(x.calls.filter(v=>v.op==='uia').length,1);assert.equal(x.calls.filter(v=>v.op==='tap').length,0);assert.deepEqual(x.events,[]);});
await test('tap action failure is not replayed',async()=>{const e=refused(),x=makeTap([xml],{tapError:e});await assert.rejects(x.tap('synthetic'),v=>v===e);assert.equal(x.calls.filter(v=>v.op==='tap').length,1);assert.equal(x.calls.filter(v=>v.op==='uia').length,1);assert.deepEqual(x.events,[]);});
await test('point failure stops before all native calls',async()=>{const e=Error('synthetic'),x=makeTap([xml],{pointError:e});await assert.rejects(x.tap('synthetic'),v=>v===e);assert.deepEqual(x.calls,['point']);});
const pointSource=between(client,'    const point=','    const tap=');
function point(elements){return new Function('read',pointSource+'return point;')(async expression=>new Function('document',expression.startsWith('(')?'return '+expression:expression)({querySelectorAll:()=>elements}));}
const element=(width,height,text='Attach',disabled=false)=>({disabled,textContent:text,getBoundingClientRect:()=>({x:10,y:20,width,height}),scrollIntoView(){}});
await test('unique visible enabled DOM point accepted',async()=>assert.deepEqual(await point([element(0,0),element(40,40),element(40,40,'Other')])('button','Attach'),{x:30,y:40}));
await test('ambiguous visible targets refused',async()=>assert.rejects(point([element(40,40),element(40,40)])('button','Attach')));
await test('disabled or zero-bound targets refused',async()=>assert.rejects(point([element(40,40,'Attach',true),element(0,0)])('button','Attach')));
await test('each guard UIA/tap path retains serial/AVD ownership validation (static)',async()=>{assert(guardSource.includes('def adb(serial,avd,tail,timeout=15,binary=False):\n    ownership(serial,avd)'));assert(guardSource.includes("invoke=lambda tail,**kw:adb(a.serial,a.avd,tail,**kw)"));assert(guardSource.includes("invoke(['shell','uiautomator','dump'"));assert(guardSource.includes("result=invoke(args)"));});
const stepSource=between(run,'async function nativeStep(','async function persistedNote(');
function step(){const records=[];return{records,call:new Function('assert','appendFile','resolve','output','performance',stepSource+'return nativeStep;')(assert,async(path,line)=>records.push({file:path.split('/').at(-1),record:JSON.parse(line)}),resolve,'/synthetic',performance)};}
await test('step pass records fixed schema and returns operation value',async()=>{const x=step(),value={synthetic:true};assert.equal(await x.call('attachments-synthetic',async()=>value),value);assert.deepEqual(x.records.map(x=>x.record.phase),['start','pass']);assert(!JSON.stringify(x.records).includes('synthetic":true'));});
await test('step unclassified error never copies exception body to primary log',async()=>{const x=step(),e=Error('SYNTHETIC_PRIVATE_SENTINEL');await assert.rejects(x.call('attachments-synthetic',async()=>{throw e;}),v=>v===e);assert.equal(x.records.at(-1).record.reason,'unclassified-fixed-step-failure');assert(!JSON.stringify(x.records).includes('SYNTHETIC_PRIVATE_SENTINEL'));});
await test('invalid step label rejected before log or operation',async()=>{const x=step();let called=false;await assert.rejects(x.call('bad label',async()=>{called=true;}));assert.equal(called,false);assert.equal(x.records.length,0);});
await test('known exit137 detail recorded without retry by logger',async()=>{const x=step();await assert.rejects(x.call('attachments-synthetic',async()=>{throw refused();}));assert.equal(x.records[1].file,'attachment-guard-failures.jsonl');assert.equal(x.records[1].record.message,'bounded subprocess failed 137: ');assert.equal(x.records.at(-1).record.reason,'guard-command-failed');});
let guardDetailWitness;
await test('P2 guard detail logger accepts arbitrary parsed message (negative witness)',async()=>{const x=step();await assert.rejects(x.call('attachments-synthetic',async()=>{throw refused('SYNTHETIC_PRIVATE_SENTINEL');}));guardDetailWitness=x.records.find(v=>v.file==='attachment-guard-failures.jsonl').record;assert.equal(guardDetailWitness.message,'SYNTHETIC_PRIVATE_SENTINEL');});
const attachments=between(run,"    case 'attachments':{","    case 'exportImage':");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
for(const current of [{editor:true,title:'SYNTHETIC'},{editor:false,title:'SYNTHETIC'},{editor:true,title:'WRONG'}])await test('owned note resume and Store-before-picker '+JSON.stringify(current),async()=>{
 const calls=[],files=['a.png','b.txt','c.wav'].map(name=>({name}));let count=0;
 const c={read:async()=>current,wait:async()=>{},snapshot:async()=>{}};
 const fn=new AsyncFunction('app','s','assert','nativeStep','openNote','guard','pause','persistedNote','openFilePicker','chooserFiles','output',attachments.replace("    case 'attachments':{",'{'));
 const value=await fn(async()=>c,{notes:[{id:'owned-id',marker:'SYNTHETIC'}],files},assert,async(label,op)=>op(),async(_c,id)=>{calls.push('open:'+id);},async()=>'',async()=>{},async(_c,id,expected=0)=>{calls.push('store:'+expected);return{attachments:files.slice(0,count).map(f=>({displayName:f.name}))};},async()=>calls.push('picker'),async(_s,names)=>{count+=names.length;},'/synthetic');
 assert.equal(calls.includes('open:owned-id'),!current.editor||current.title!=='SYNTHETIC');assert(calls.indexOf('store:0')<calls.indexOf('picker'));assert.equal(value.cancelPreserved,true);assert.equal(value.multipleCount,2);assert.equal(value.continuousCount,3);
});
const home=between(run,"    case 'home':{","    case 'createNote':");
let homeWitness;
await test('P2 home hidden gallery can pass current exact home assertions (negative witness)',async()=>{
 const gallery={getBoundingClientRect:()=>({width:0,height:0})},add={getBoundingClientRect:()=>({width:56,height:56})};let snapshot=false;
 const document={querySelector:selector=>selector==='.mobile-add-note'?add:gallery};
 const evaluate=expression=>new Function('document','getComputedStyle','return '+expression)(document,e=>e===add?{backgroundColor:'rgb(255, 188, 0)'}:{gridTemplateColumns:'160px 160px'});
 const c={wait:async expression=>assert(evaluate(expression)),read:async expression=>evaluate(expression),snapshot:async()=>{snapshot=true;}};
 const fn=new AsyncFunction('app','assert','output',home.replace("    case 'home':{",'{'));const value=await fn(async()=>c,assert,'/synthetic');assert(snapshot);homeWitness={acceptedHiddenGallery:true,galleryBounds:gallery.getBoundingClientRect(),returned:value};
});
const sourceHashes=Object.fromEntries([['client.mjs',client],['run.mjs',run],['guard.py',guardSource]].map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]));
const result={status:results.every(x=>x.pass)?'HOST_CHECKS_PASS_WITH_P2_FINDINGS':'CHECK_FAILED',frozenAuthor:'9c648b1f',hostOnly:true,adbCalls:0,deviceActions:0,sourceHashes,results,findings:[{priority:'P2',id:'home-visible-assertions',witness:homeWitness},{priority:'P2',id:'guard-detail-arbitrary-message',witness:guardDetailWitness}],limits:'Mock assertions do not prove device acceptance; actual chooser multiple/continuous/export/sync remains pending.'};
await writeFile(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:results.length,failed:results.filter(x=>!x.pass),findings:result.findings.map(x=>({id:x.id,priority:x.priority})),adbCalls:0}));if(results.some(x=>!x.pass))process.exitCode=1;
