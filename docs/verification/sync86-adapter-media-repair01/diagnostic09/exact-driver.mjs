import {rustBackend} from '/private/tmp/apple-notes-sync86-adapter/scripts/debug/rust-backend.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const out='/private/tmp/sync86-build09-flow-diagnostic';await mkdir(out);const rows=[];const devices=[];
class Device{
 async open(name){this.name=name;this.b=await rustBackend('/private/tmp/sync86-transport-build09/notes-current-attachment-transport',out+'/'+name,{timeoutMs:35000,closeTimeoutMs:10000});devices.push(this);await this.workspace();return this;}
 async call(command,args={}){const r=await this.b.call(command,args);for(const e of r.events||[]){if(e.name==='notes-sync'){rows.push({device:this.name,event:e.payload.phase,outcome:e.payload.outcome});const p=e.payload;if(p.phase==='probe'||p.phase==='prepare'){await this.workspace();await this.call('sync_window_reply',{expected:this.t(),reply:p.phase==='probe'?{phase:'probe',operationId:p.operationId,protectedNoteIds:[],blocked:false}:{phase:'prepare',operationId:p.operationId,ready:true}})}}}if(!r.ok)throw Error(r.error.code);return r.value;}
 t(note){return {sessionId:this.w.access.sessionId,epoch:this.w.access.epoch,...(note?{noteEpoch:this.w.access.notes[note]?.epoch}:{})}}
 async workspace(){return this.w=await this.call('load_workspace');}
 async sync(command){await this.workspace();return this.call('sync_command',{command,expected:this.t()});}
 async action(action){const r=await this.call('workspace_action',{action,expected:this.t()});await this.workspace();return r;}
}
try{
 const a=await new Device().open('A'),b=await new Device().open('B');const h=await a.sync({type:'startHost',deviceName:'A',port:0});const endpoint=h.status.listenAddress.replace('0.0.0.0','127.0.0.1');const invite=(await a.sync({type:'createInvite',endpoint})).invitation;await b.sync({type:'pair',invitation:invite,deviceName:'B'});
 const folder=await a.action({type:'createFolder',name:'Network folder'});await a.action({type:'createSmartFolder',input:{name:'Network pinned',query:{version:1,combine:'all',rules:[{type:'pinned',value:true}]}}});const note=await a.action({type:'createNote',folderId:folder.id});const intent=randomUUID();await a.call('register_save_intent',{noteId:note.id,intent,expected:a.t(note.id)});await a.call('workspace_action',{action:{type:'saveNote',id:note.id,revision:0,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'synthetic'}]}]},saveIntent:intent},expected:a.t(note.id)});
 for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,500));rows.push({tick:i,A:(await a.sync({type:'status'})).status,B:(await b.sync({type:'status'})).status,notesB:(await b.workspace()).notes.length});}
}catch(e){rows.push({failure:e.message})}finally{for(const d of devices){await d.b.close();rows.push({name:d.name,lifecycle:d.b.lifecycle})}await writeFile(out+'/result.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows));}
