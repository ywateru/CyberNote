import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,relative} from 'node:path';
const repo='/private/tmp/apple-notes-sync86-adapter',out='/private/tmp/sync86-independent-review-02/process';
const binary='/private/tmp/sync86-transport-build10/notes-current-attachment-transport';
const started=performance.now(), checks=[], events=[], devices=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function fingerprint(){const h=createHash('sha256');for(const dir of ['src-tauri/src','scripts/debug/rust']){const files=(await readdir(resolve(repo,dir),{recursive:true,withFileTypes:true})).filter(x=>x.isFile()).map(x=>resolve(x.parentPath,x.name)).sort();for(const f of files)h.update(relative(repo,f)+'\0').update(await readFile(f)).update('\0')}return h.digest('hex')}
const before=await fingerprint(),binaryBefore=createHash('sha256').update(await readFile(binary)).digest('hex');
function assert(name,yes){if(!yes)throw Error(name);checks.push(name);console.log('PASS '+name)}
class Device{
 async open(name){this.name=name;this.root=resolve(out,'stores',name);this.queue=[];this.pending=new Map();this.id=0;this.buffer='';this.stderr='';this.child=spawn(binary,[this.root]);devices.push(this);this.closed=new Promise(r=>this.child.once('close',(code,signal)=>{this.exit={code,signal};r(this.exit)}));this.child.stderr.on('data',b=>this.stderr=(this.stderr+b).slice(-2000));this.child.stdout.on('data',b=>{this.buffer+=b;while(this.buffer.includes('\n')){const i=this.buffer.indexOf('\n'),row=JSON.parse(this.buffer.slice(0,i));this.buffer=this.buffer.slice(i+1);this.queue.push(...row.events);const p=this.pending.get(row.requestId);if(!p)throw Error('Unexpected response');this.pending.delete(row.requestId);p(row)}});await this.workspace();return this;}
 async row(command,args={},window='main'){const requestId=++this.id;return Promise.race([new Promise(r=>{this.pending.set(requestId,r);this.child.stdin.write(JSON.stringify({requestId,window,command,args})+'\n')}),delay(36000).then(()=>{throw Error('Timeout '+command)})]);}
 async call(command,args={},window='main'){const row=await this.row(command,args,window);if(!row.ok)throw Error(command+':'+row.error.code);return row.value;}
 async workspace(){const w=await this.call('load_workspace');this.access=w.access;return w}
 token(){return {sessionId:this.access.sessionId,epoch:this.access.epoch}}
 async sync(command){await this.workspace();return this.call('sync_command',{command,expected:this.token()})}
 async poll(){await this.call('poll_events');const list=this.queue.splice(0);for(const e of list)events.push({device:this.name,...e});return list}
 async reply(p,extras){return this.call('sync_window_reply',{expected:this.token(),reply:{phase:p.phase,operationId:p.operationId,...extras}})}
 async close(){this.child.stdin.end();await this.closed;assert(this.name+' natural exit',this.exit.code===0&&this.exit.signal===null)}
}
let a,b,failure;
async function eventually(name,fn,limit=16000){const end=performance.now()+limit;while(performance.now()<end){const value=await fn();if(value)return value;await delay(60)}throw Error('Timeout '+name)}
async function event(phase){return eventually(phase,async()=>{for(const e of await a.poll()){if(e.name==='notes-sync'&&e.payload.phase===phase)return e.payload}return false})}
async function pendingCount(){return (await a.sync({type:'status'})).status.pendingCount}
async function beginPrepare(){const p=await event('probe');await a.reply(p,{protectedNoteIds:[],blocked:false});return event('prepare')}
async function noRemote(id){return !(await a.workspace()).notes.some(n=>n.id===id)}
async function createRemote(){const w=await b.workspace();return (await b.call('workspace_action',{action:{type:'createNote'},expected:b.token()})).id}
try{
 a=await new Device().open('A');b=await new Device().open('B');
 assert('strict no-arg command rejects hidden input',!(await a.row('sync_command',{command:{type:'status',endpoint:'ws://127.0.0.1:1'},expected:a.token()})).ok);
 assert('strict Token rejects unknown fields',!(await a.row('sync_command',{command:{type:'status'},expected:{...a.token(),owner:'main'}})).ok);
 assert('actual window rejects forged label',!(await a.row('sync_command',{command:{type:'status'},expected:a.token()},'unknown')).ok);
 assert('stale session rejects command',!(await a.row('sync_command',{command:{type:'status'},expected:{...a.token(),sessionId:randomUUID()}})).ok);
 assert('headless apply rejects live participants',!(await a.row('headless_apply')).ok);
 assert('invalid commands leave sync disabled',(await a.sync({type:'status'})).status.state==='disabled');
 const host=(await a.sync({type:'startHost',deviceName:'Independent A',port:0})).status;
 const invitation=(await a.sync({type:'createInvite',endpoint:host.listenAddress.replace('0.0.0.0','127.0.0.1')})).invitation;
 await b.sync({type:'pair',deviceName:'Independent B',invitation});
 const id=await createRemote();let p=await beginPrepare();
 assert('real prepare targets actual received note',p.noteIds.includes(id)&&await noRemote(id));
 await a.reply(p,{ready:true});const cancelled=await a.reply(p,{ready:false});
 assert('cancel after ready returns linearized abort',cancelled.outcome==='abort');
 let release=await event('release');assert('cancel releases abort and retains inbox',release.operationId===p.operationId&&release.outcome==='abort'&&await noRemote(id)&&await pendingCount()>0);
 assert('terminal abort receipt remains idempotent',(await a.reply(p,{ready:false})).outcome==='abort');
 p=await beginPrepare();await a.call('set_document_participants',{windows:['main','note-independent']});
 release=await event('release');assert('participant addition aborts prepared plan',release.operationId===p.operationId&&release.outcome==='abort'&&await noRemote(id));
 await a.call('set_document_participants',{windows:['main']});p=await beginPrepare();
 const waitStart=performance.now();release=await event('release');const elapsed=performance.now()-waitStart;
 assert('actual five second prepare timeout retains inbox',release.outcome==='abort'&&elapsed>=4500&&elapsed<7500&&await noRemote(id)&&await pendingCount()>0);
 p=await beginPrepare();await a.reply(p,{ready:true});release=await event('release');
 assert('only later successful gate commits real SQLite row',release.operationId===p.operationId&&release.outcome==='commit'&&!await noRemote(id)&&await pendingCount()===0);
 const committed=events.filter(e=>e.device==='A');const ri=committed.findIndex(e=>e.name==='notes-sync'&&e.payload.operationId===p.operationId&&e.payload.phase==='release');
 assert('real metadata is delivered before commit release',committed.slice(0,ri).some(e=>e.name==='notes-metadata'));
 const again=await a.reply(p,{ready:false});assert('late cancel cannot change committed terminal outcome',again.outcome==='commit');
 const next=await createRemote();p=await event('probe');await a.reply(p,{protectedNoteIds:[next],blocked:false});release=await event('release');assert('probe protection preserves real owner pending',release.outcome==='abort'&&await noRemote(next)&&await pendingCount()>0);
 assert('production never silently headless-applies with no windows',await (async()=>{await a.call('set_document_participants',{windows:[]});await delay(1800);return await noRemote(next)})());
 await a.call('set_document_participants',{windows:['main']});p=await beginPrepare();await a.reply(p,{ready:true});release=await event('release');assert('returning real participant permits normal commit',release.outcome==='commit'&&!await noRemote(next));
}catch(e){failure={message:e.message,stack:e.stack};console.error(e.stack)}finally{
 for(const d of devices)try{await d.close()}catch(e){failure??={message:e.message,stack:e.stack}}
 const after=await fingerprint(),binaryAfter=createHash('sha256').update(await readFile(binary)).digest('hex');
 assert('product source remains unchanged',before===after);assert('immutable binary remains unchanged',binaryBefore===binaryAfter);
 await writeFile(resolve(out,'status.json'),JSON.stringify({sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),before,after,binaryBefore,binaryAfter,wallMs:Math.round(performance.now()-started),checks,events,processes:devices.map(d=>({name:d.name,pid:d.child.pid,exit:d.exit,stderr:d.stderr})),failure},null,2)+'\n');
}
if(failure)process.exitCode=1;
