// Fixed browser-command and ownership fixtures only; no CDP/ADB/App invocation.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import {PHONE_FILES,phoneFileSubmission,phoneFileControls} from './account109-android.mjs';

const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const note=()=>({id,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'完整手机正文 😀'}]}]},plainText:'完整手机正文 😀'});
function browser(mode){
  const calls=[],state={selection:{noteId:mode==='wrong-selected'?other:id},workspace:{access:{notes:{[id]:{authorized:mode!=='unauthorized'}}}}};
  const debug={version:1,list:()=>['app.state','attachment.submit','app.flush'].map(id=>({id,available:!(mode==='unavailable'&&id==='attachment.submit')})),
    execute:async(command,args)=>{calls.push({command,args});if(mode==='rejected'&&command==='attachment.submit')throw Error('private provider detail must not escape');return {result:command==='app.state'?state:null};},
    waitForIdle:async args=>{calls.push({command:'waitForIdle',args});}};
  if(mode==='old-protocol')debug.version=2;
  const window=mode==='no-debug'?{}:{__NOTES_DEBUG__:debug};
  const document={querySelector:selector=>{assert.equal(selector,`.tiptap[data-note-id="${id}"][contenteditable="true"]`);return mode==='no-editor'?null:{getClientRects:()=>mode==='invisible'?[]:[{}]};}};
  return {calls,context:{window,document}};
}
test('candidate must expose the existing fixed debug capability and selected authorized editor',async()=>{
  for(const mode of ['no-debug','old-protocol','unavailable','wrong-selected','unauthorized','no-editor','invisible']){
    const {calls,context}=browser(mode),result=await runInNewContext(phoneFileSubmission(id),context);
    assert.equal(result.code,['no-debug','old-protocol','unavailable'].includes(mode)?'ANDROID_FILE_CAPABILITY_REQUIRED':'ANDROID_FILE_OWNER_REQUIRED');
    assert(!calls.some(c=>c.command==='attachment.submit'||c.command==='app.flush'));
  }
});
test('browser submission sends exactly two immutable fixed File payloads and flushes; no arbitrary input or raw failure',async()=>{
  const {calls,context}=browser();assert.deepEqual(JSON.parse(JSON.stringify(await runInNewContext(phoneFileSubmission(id),context))),{submitted:true});
  assert.deepEqual(calls.map(c=>c.command),['app.state','attachment.submit','app.flush','waitForIdle']);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args)),{files:PHONE_FILES});
  assert.deepEqual(PHONE_FILES.map(f=>Buffer.from(f.base64,'base64').length),[68,4096]);
  assert(Object.isFrozen(PHONE_FILES)&&PHONE_FILES.every(Object.isFrozen));assert(PHONE_FILES.every(f=>Object.keys(f).sort().join(',')==='base64,mime,name'&&!/[\\/]/.test(f.name)));
  const rejected=browser('rejected'),result=await runInNewContext(phoneFileSubmission(id),rejected.context);
  assert.equal(result.code,'ANDROID_FILE_SUBMIT_REJECTED');assert(!JSON.stringify(result).includes('private'));
  for(const value of ['bad',id+';globalThis.secret',{},undefined,'/private/tmp/file','https://example.invalid'])assert.throws(()=>phoneFileSubmission(value),{code:'ANDROID_FILE_NOTE_INVALID'});
});
function controlsFixture({afterOpen,submitResult={submitted:true}}={}){
  const saved=note(),ws={notes:[saved],attachments:[],access:{notes:{[id]:{authorized:true}}}},events=[];
  const controls=phoneFileControls({readWorkspace:async()=>{events.push('read');return structuredClone(ws);},openNote:async actual=>{assert.equal(actual,id);events.push('open');afterOpen?.(ws);},submit:async actual=>{assert.equal(actual,id);events.push('submit');return submitResult;}});
  return {controls,ws,events,saved};
}
test('only a recorded new-note receipt admits one attempt; rejects extra file, action, path and auth arguments before effects',async()=>{
  const {controls,events,saved}=controlsFixture();
  for(const args of [[],[id],[other],[{}],['https://example.invalid'],[id,PHONE_FILES],[id,{token:'fixture'}],[id,{path:'/fixture/input'}]])await assert.rejects(controls.submitNoteFiles(...args));
  assert.equal(events.length,0);controls.created(saved);
  assert.throws(()=>controls.created(saved),{code:'ANDROID_FILE_NOTE_INVALID'});
  const result=await controls.submitNoteFiles(id);assert.equal(result.id,id);assert.deepEqual(events,['read','open','read','submit','read']);
  const count=events.length;await assert.rejects(controls.submitNoteFiles(id),{code:'ANDROID_FILE_NEW_NOTE_REQUIRED'});assert.equal(events.length,count);
});
test('owner, body, prior attachment or authorization changes fail closed before submission, including after reopening',async()=>{
  const changes=[ws=>{ws.notes=[];},ws=>{ws.notes[0].document.content=[];},ws=>{ws.notes[0].plainText='lost';},ws=>{ws.attachments.push({noteId:id});},ws=>{ws.access.notes[id].authorized=false;},ws=>{ws.notes[0].deletedAt='fixture';}];
  for(const change of changes)for(const after of [false,true]){
    const f=controlsFixture(after?{afterOpen:change}:{});f.controls.created(f.saved);if(!after)change(f.ws);
    await assert.rejects(f.controls.submitNoteFiles(id),{code:'ANDROID_FILE_OWNER_REQUIRED'});assert(!f.events.includes('submit'));
    await assert.rejects(f.controls.submitNoteFiles(id),{code:'ANDROID_FILE_NEW_NOTE_REQUIRED'});
  }
});
test('missing or unknown submission acknowledgement cannot turn into success or expose upstream details',async()=>{
  for(const submitResult of [undefined,{}, {code:'raw untrusted failure'}, {code:'ANDROID_FILE_CAPABILITY_REQUIRED'}]){
    const f=controlsFixture({submitResult:submitResult??{}});f.controls.created(f.saved);
    await assert.rejects(f.controls.submitNoteFiles(id),error=>['ANDROID_FILE_SUBMIT_REJECTED','ANDROID_FILE_CAPABILITY_REQUIRED'].includes(error.code)&&!error.message.includes('raw'));
  }
});
