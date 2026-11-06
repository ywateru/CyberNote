#!/usr/bin/env node
// Required stdin wrappers: original production local registry and Session ACKs.
import {rustBackend} from '../rust-backend.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const [binary,output]=process.argv.slice(2);
if(!binary||!output)throw Error('binary output required');
await mkdir(output,{recursive:false});
const started=performance.now(),checks=[],events=[];
const backend=await rustBackend(binary,resolve(output,'store'),{timeoutMs:15000,closeTimeoutMs:10000});
let failure;
function check(name,valid){if(!valid)throw Error(name);checks.push(name);console.log('PASS '+name)}
async function call(command,args={}){const row=await backend.call(command,args);events.push(...row.events);return row}
async function ok(command,args={}){const row=await call(command,args);if(!row.ok)throw Error(row.error.message);return row.value}
async function workspace(){return ok('load_workspace')}
function token(workspace){return{sessionId:workspace.access.sessionId,epoch:workspace.access.epoch}}
try{
 const identity=await ok('register_recording_local',{sessionId:randomUUID(),operationId:randomUUID()});
 check('production registration returns original owner and incarnation',identity.owner==='main'&&!!identity.incarnation);
 check('exact lost registration receipt is recoverable before capture',JSON.stringify(await ok('register_recording_local',identity))===JSON.stringify(identity));
 await ok('recording_local_validate',identity);await ok('recording_local_started',identity);
 check('duplicate capture start is rejected',!(await call('recording_local_started',identity)).ok);
 check('forged recording incarnation is rejected',!(await call('recording_local_validate',{...identity,incarnation:randomUUID()})).ok);
 check('recording ACK skips are rejected',!(await call('recording_local_revision',{...identity,revision:2,finalIntent:false})).ok);
 await ok('recording_local_revision',{...identity,revision:1,finalIntent:false});
 check('checkpoint alone cannot release saved recording',!(await call('recording_local_release',{...identity,saved:true,revision:1})).ok);
 await ok('recording_local_revision',{...identity,revision:2,finalIntent:true});
 await ok('recording_local_release',{...identity,saved:true,revision:2});
 await ok('recording_local_release',{...identity,saved:true,revision:2});
 check('final ACK release is idempotent but validation then fails',!(await call('recording_local_validate',identity)).ok);
 check('released recording identity cannot be registered again',!(await call('register_recording_local',identity)).ok);
 const empty=await workspace();const note=await ok('workspace_action',{action:{type:'createNote'},expected:token(empty)});
 async function barrier(success){
  const w=await workspace();let settled=false;
  const promise=call('workspace_action',{action:{type:'lockNote',id:note.id,password:'synthetic'},expected:token(w)}).then(row=>{settled=true;return row});
  for(let i=0;i<50&&!events.some(e=>e.name==='notes-access'&&e.payload.phase==='prepare');i++){await new Promise(r=>setTimeout(r,20));await call('poll_events')}
  const event=events.findLast(e=>e.name==='notes-access'&&e.payload.phase==='prepare');
  check('workspace barrier waits for actual window ACK '+success,!!event&&!settled);
  await ok('acknowledge_access',{operationId:event.payload.operationId,success});
  const result=await promise;events.splice(0,events.length,...events.filter(e=>e!==event));return result;
 }
 const cancelled=await barrier(false);check('negative actual window ACK aborts lock',!cancelled.ok&&!(await workspace()).notes.find(n=>n.id===note.id).locked);
 const committed=await barrier(true);check('positive actual window ACK commits lock',committed.ok&&(await workspace()).notes.find(n=>n.id===note.id).locked);
 check('actual access commit and metadata events are emitted',events.some(e=>e.name==='notes-access'&&e.payload.phase==='commit')&&events.some(e=>e.name==='notes-metadata'));
}catch(e){failure={message:e.message,stack:e.stack};console.error(e.stack)}finally{
 try{await backend.close();check('owned transport exits naturally',backend.lifecycle.exit?.code===0&&!backend.lifecycle.exit?.signal)}catch(e){failure||={message:e.message,stack:e.stack}}
 await writeFile(resolve(output,'status.json'),JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),binary:{path:resolve(binary),sha256:createHash('sha256').update(await readFile(binary)).digest('hex')},wallMs:Math.round(performance.now()-started),checks,process:backend.lifecycle,events,failure:failure||null},null,2)+'\n');
}
if(failure)process.exitCode=1;
