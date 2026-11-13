// Fixed native protocol v1, agreed with the headless-native author. No WebView API.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {bounded} from './sync108-native-driver.mjs';

export const PREFIX='@@ACCOUNT109_HEADLESS@@';
export const TRANSPORT='native-session-stdio';
export const PARTICIPANT='account109-native-harness';
export const MAX_REQUEST=65536,MAX_REPLY=16_000_000+Buffer.byteLength(PREFIX)+1;
export const NATIVE_CODES=['invalid_request','invalid_id','input_error','access_changed','not_found','sync_deferred','sync_disabled','sync_busy','sync_invalid','conflict_changed','operation_failed'];
const fail=code=>Object.assign(new Error(code),{code});
const object=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
export const OPS=['ready','workspace','conflicts','keepAll','accountStatus','signOut','readAttachment','createPlainNote','shutdown'];
export function encodeRequest(id,action){
  assert(Number.isSafeInteger(id)&&id>0,'Invalid request ID');assert(object(action)&&OPS.includes(action.op),'Invalid fixed operation');
  const fields={keepAll:['kind','entityId','digest','keepAll'],readAttachment:['id'],createPlainNote:['title','text']}[action.op]||[];
  assert.deepEqual(Object.keys(action).sort(),['op',...fields].sort(),'Unknown/missing operation field');
  if(action.op==='keepAll')assert(['note','folder'].includes(action.kind)&&uuid(action.entityId)&&typeof action.digest==='string'&&/^[a-f0-9]{64}$/.test(action.digest)&&action.keepAll===true,'Invalid keep-all arguments');
  if(action.op==='readAttachment')assert(uuid(action.id),'Invalid attachment ID');
  if(action.op==='createPlainNote')for(const [key,limit] of [['title',256],['text',16000]])assert(typeof action[key]==='string'&&action[key].startsWith('account109-')&&!action[key].includes('\0')&&Buffer.byteLength(action[key])<=limit,'Only bounded synthetic text allowed');
  const line=JSON.stringify({id,action})+'\n';assert(Buffer.byteLength(line)<=MAX_REQUEST,'Request too large');return line;
}
export class FrameDecoder{
  #decoder=new StringDecoder('utf8');#line='';#bytes=0;noiseBytes=0;
  constructor(onFrame){this.onFrame=onFrame;}
  push(chunk){
    let offset=0;
    for(;;){const newline=chunk.indexOf(10,offset),end=newline===-1?chunk.length:newline+1;this.#bytes+=end-offset;if(this.#bytes>MAX_REPLY)throw fail('STDOUT_LINE_TOO_LARGE');this.#line+=this.#decoder.write(chunk.subarray(offset,end));if(newline===-1)return;
      const line=this.#line.trimEnd();if(line.startsWith(PREFIX)){let frame;try{frame=JSON.parse(line.slice(PREFIX.length));}catch{throw fail('INVALID_FRAME');}if(!object(frame))throw fail('INVALID_FRAME');this.onFrame(frame);}else this.noiseBytes+=this.#bytes;
      this.#line='';this.#bytes=0;offset=end;if(offset===chunk.length)return;
    }
  }
  end(){this.#line+=this.#decoder.end();if(this.#line.startsWith(PREFIX))throw fail('TRUNCATED_FRAME');this.noiseBytes+=this.#bytes;this.#line='';this.#bytes=0;}
}
const exact=(value,keys)=>object(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function validValue(op,value){
  if(!object(value))return false;
  const count=v=>Number.isSafeInteger(v)&&v>=0,tagged=v=>object(v.access)&&object(v.metadata);
  if(op==='ready')return true; // Exact native identity checked by ready().
  if(op==='shutdown')return exact(value,['requested'])&&value.requested===true;
  if(op==='workspace')return Array.isArray(value.notes)&&Array.isArray(value.attachments)&&tagged(value)&&value.notes.every(n=>object(n)&&typeof n.id==='string'&&object(n.document)&&typeof n.plainText==='string');
  if(op==='conflicts'||op==='keepAll')return object(value.status)&&Array.isArray(value.conflicts);
  if(op==='createPlainNote')return uuid(value.id)&&object(value.document)&&typeof value.plainText==='string'&&tagged(value);
  if(op==='readAttachment')return typeof value.data==='string'&&value.data.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)&&Buffer.from(value.data,'base64').toString('base64')===value.data&&typeof value.mime==='string'&&typeof value.name==='string'&&tagged(value);
  return ['signedOut','authorizing','connecting','ready','paused','error'].includes(value.state)&&typeof value.enabled==='boolean'&&count(value.pendingCount)&&count(value.conflictCount)&&Array.isArray(value.devices)&&value.devices.every(d=>object(d)&&typeof d.id==='string'&&['online','current','connected'].every(k=>typeof d[k]==='boolean'));
}
export class HeadlessApp{
  #nextId=0;#tail=Promise.resolve();#pending;#helloResolve;#helloReject;#closedResolve;#fatal;#closing;
  constructor(binary,directory,{name='native',commandArgs,env={},closeTimeoutMs=15000}={}){
    this.name=name;this.directory=directory;this.closeTimeoutMs=closeTimeoutMs;this.lifecycle={name,directory,commands:0,stderrBytes:0,forcedSignals:[]};
    this.hello=new Promise((resolve,reject)=>{this.#helloResolve=resolve;this.#helloReject=reject;});this.hello.catch(()=>{});this.closed=new Promise(resolve=>{this.#closedResolve=resolve;});
    this.decoder=new FrameDecoder(frame=>this.#frame(frame));
    this.child=spawn(binary,commandArgs??['--data-dir',directory],{env:{...process.env,...env,NOTES_SYNC_E2E:'1',NOTES_SYNC_E2E_HEADLESS:'1'},stdio:['pipe','pipe','pipe']});this.lifecycle.pid=this.child.pid;
    this.child.stdout.on('data',chunk=>{try{this.decoder.push(chunk);}catch(error){this.#fail(error);}});
    this.child.stderr.on('data',chunk=>{this.lifecycle.stderrBytes+=chunk.length;});this.child.stdin.on('error',()=>this.#fail(fail('STDIN_ERROR')));this.child.on('error',()=>this.#fail(fail('SPAWN_ERROR')));
    this.child.on('exit',(code,signal)=>{this.lifecycle.exit={code,signal};});
    this.child.on('close',(code,signal)=>{this.lifecycle.close={code,signal};try{this.decoder.end();}catch(error){this.#fail(error);}this.lifecycle.stdoutNoiseBytes=this.decoder.noiseBytes;this.#helloReject(fail('EXIT_BEFORE_HELLO'));if(this.#pending)this.#fail(fail('EXIT_BEFORE_RESPONSE'));this.#closedResolve(this.lifecycle);});
  }
  #fail(error){this.#fatal||=error;this.lifecycle.failureCode||=error.code||'DRIVER_ERROR';this.#helloReject(error);this.#pending?.reject(error);this.#pending=undefined;}
  #frame(frame){
    if(frame.type==='hello'){
      if(this.metadata||!exact(frame,['type','protocol','pid','transport','participant'])||frame.protocol!==1||frame.pid!==this.child.pid||frame.transport!==TRANSPORT||frame.participant!==PARTICIPANT)throw fail('INVALID_HELLO');
      this.metadata=frame;this.#helloResolve(frame);return;
    }
    const inputFailure=frame.id===null&&frame.ok===false&&['invalid_request','invalid_id','input_error'].includes(frame.error?.code);
    if(!this.metadata||frame.type!=='response'||!this.#pending||(!inputFailure&&frame.id!==this.#pending.id)||typeof frame.ok!=='boolean')throw fail('UNEXPECTED_RESPONSE');
    if(frame.ok){if(!exact(frame,['type','id','ok','value'])||!validValue(this.#pending.op,frame.value))throw fail('INVALID_RESPONSE');const pending=this.#pending;this.#pending=undefined;pending.resolve(frame.value);}
    else{
      if(!exact(frame,['type','id','ok','error'])||!exact(frame.error,['code'])||!NATIVE_CODES.includes(frame.error.code))throw fail('INVALID_RESPONSE');
      this.lifecycle.nativeErrorCode=frame.error.code;
      this.#fail(fail('NATIVE_OPERATION_FAILED'));
    }
  }
  request(action,timeoutMs=30000){
    try{encodeRequest(1,action);assert(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=120000);}catch(error){return Promise.reject(error);}
    if(this.#closing)return Promise.reject(fail('APP_CLOSING'));
    const task=this.#tail.then(async()=>{
      if(this.#fatal)throw this.#fatal;if(this.lifecycle.exit)throw fail('APP_EXITED');
      const id=++this.#nextId,line=encodeRequest(id,action),response=new Promise((resolve,reject)=>{this.#pending={id,op:action.op,resolve,reject};});
      this.lifecycle.commands++;this.lifecycle.lastAction=action.op;this.child.stdin.write(line,error=>{if(error)this.#fail(fail('STDIN_ERROR'));});
      try{return await bounded(response,timeoutMs,'DRIVER_TIMEOUT');}catch(error){if(error.code==='DRIVER_TIMEOUT')this.#fail(error);throw error;}
    });this.#tail=task.catch(()=>{});return task;
  }
  async ready(timeoutMs=45000){try{await bounded(this.hello,timeoutMs,'HELLO_TIMEOUT');const value=await this.request({op:'ready'},timeoutMs);if(!exact(value,['protocol','participant','transport','windows'])||value.protocol!==1||value.participant!==PARTICIPANT||value.transport!==TRANSPORT||value.windows!==0)throw fail('NOT_HEADLESS_NATIVE_APP');return value;}catch(error){this.#fail(error);throw error;}}
  workspace(){return this.request({op:'workspace'});}
  conflicts(){return this.request({op:'conflicts'});}
  keepAll(entityId,digest){return this.request({op:'keepAll',kind:'note',entityId,digest,keepAll:true});}
  accountStatus(){return this.request({op:'accountStatus'});}
  signOut(){return this.request({op:'signOut'},60000);}
  readAttachment(id){return this.request({op:'readAttachment',id});}
  createPlainNote(title,text){return this.request({op:'createPlainNote',title,text});}
  close({eof=false}={}){this.#closing||=this.#close(eof);return this.#closing;}
  async #close(eof){
    let error=this.#fatal;
    if(!this.lifecycle.exit){
      if(!error){try{if(eof){await this.#tail;this.child.stdin.end();}else{const reply=await this.request({op:'shutdown'});if(!exact(reply,['requested'])||reply.requested!==true)throw fail('INVALID_SHUTDOWN');this.child.stdin.end();}}catch(cause){error=cause;this.child.stdin.end();}}else this.child.stdin.end();
      try{await bounded(this.closed,this.closeTimeoutMs,'NATURAL_EXIT_TIMEOUT');}catch(cause){error||=cause;if(!this.lifecycle.exit){this.lifecycle.forcedSignals.push('SIGTERM');this.child.kill('SIGTERM');}try{await bounded(this.closed,3000,'TERM_EXIT_TIMEOUT');}catch{if(!this.lifecycle.exit){this.lifecycle.forcedSignals.push('SIGKILL');this.child.kill('SIGKILL');}await bounded(this.closed,3000,'KILL_EXIT_TIMEOUT');}}
    }
    await bounded(this.closed,3000,'PIPE_CLOSE_TIMEOUT');error||=this.#fatal;
    if(this.lifecycle.exit?.code!==0||this.lifecycle.exit?.signal!==null||this.lifecycle.forcedSignals.length)error||=fail('NON_NATURAL_EXIT');
    this.lifecycle.naturalExit=!error;if(error)throw error;return this.lifecycle;
  }
}
