/** Actual React/Tiptap App page backed by real Rust Session/Store/socket. OS boundaries are synthetic. */
import { access,readFile,lstat,realpath,mkdir,writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openRuntime,api,idle } from '../runtime.mjs';
import { sourceFingerprint } from '../source-identity.mjs';
import { chooseFiles } from '../mobile-attachments.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const DOM_DEPENDENCIES={"scripts/debug/runtime.mjs":"f6d84cfc6b48a33b4d8c12c98e84e8635dd093b507ccdca87539b12c4b092618","scripts/debug/rust-backend.mjs":"3df944b85e2e65e10a4a1eaaae5b23c6b107b73ecfd9ed071bd8de9b2f988d0f","scripts/debug/sync-rust-dom.mjs":"b8fe79058842c73303b4019e172842cd6ab74803a09f83f365d5ad6cfed62ff7"};
export async function verifyDOMDependencies(root){for(const [name,digest] of Object.entries(DOM_DEPENDENCIES))assert.equal(hash(await readFile(join(root,name))),digest,"Frozen DOM dependency changed");return {sourceCommit:"b08c77289203691c30026ce673116721c5ca5a59",files:DOM_DEPENDENCIES};}
export function validatePeerReceipt(value) {
  assert(value&&typeof value==='object'&&!Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(),['authorizedBy','binary','buildLabel','sha256','sourceCommit']);
  assert.equal(value.authorizedBy,'root-sync87-peer-review');assert(typeof value.buildLabel==='string'&&/^build[0-9]{2,}$/.test(value.buildLabel)&&Number(value.buildLabel.slice(5))>=10,'new reviewed build10 or later required');
  assert(typeof value.binary==='string'&&value.binary.startsWith('/'));
  assert(/^[0-9a-f]{64}$/.test(value.sha256));assert(/^[0-9a-f]{40}$/.test(value.sourceCommit));
  return value;
}
export async function reviewedPeer(path) {
  assert(typeof path==='string'&&path.startsWith('/'));const stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink());assert.equal(await realpath(path),path);
  const receipt=validatePeerReceipt(JSON.parse(await readFile(path,'utf8')));
  const binary=await lstat(receipt.binary);assert(binary.isFile()&&!binary.isSymbolicLink());assert.equal(await realpath(receipt.binary),receipt.binary);
  assert(binary.size>0&&binary.size<300*1024*1024);await access(receipt.binary,constants.X_OK);
  assert.equal(hash(await readFile(receipt.binary)),receipt.sha256,'reviewed backend bytes changed');
  return {receipt,identity:{device:binary.dev,inode:binary.ino,size:binary.size}};
}
export function validatePeerEvent(event,sessionId) {
  assert(event&&typeof event==='object'&&['notes-sync','notes-access','notes-metadata'].includes(event.name));
  const p=event.payload;assert(p&&typeof p==='object');
  if(event.name==='notes-sync'){
    assert(typeof p.sessionId==='string'&&p.sessionId.length>0);if(sessionId)assert.equal(p.sessionId,sessionId);assert(['probe','prepare','release'].includes(p.phase));assert(typeof p.operationId==='string'&&p.operationId.length>0);
    const keys=p.phase==='prepare'?['phase','operationId','sessionId','noteIds']:p.phase==='release'?['phase','operationId','sessionId','outcome']:['phase','operationId','sessionId'];
    assert.deepEqual(Object.keys(p).sort(),keys.sort());
    if(p.phase==='prepare'){assert(Array.isArray(p.noteIds)&&p.noteIds.every(x=>typeof x==='string'&&x.length>0));assert.equal(new Set(p.noteIds).size,p.noteIds.length);}
    if(p.phase==='release')assert(['commit','abort'].includes(p.outcome));
  }
  if(event.name==='notes-access'){assert(typeof p.access?.sessionId==='string');if(sessionId)assert.equal(p.access.sessionId,sessionId);assert(Number.isSafeInteger(p.access.epoch));assert(['prepare','commit','abort'].includes(p.phase));}
  if(event.name==='notes-metadata'){assert(typeof p.metadata?.sessionId==='string');if(sessionId)assert.equal(p.metadata.sessionId,sessionId);}
  return event;
}
async function freePort() {
  const server=createServer();await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
  const port=server.address().port;await new Promise(done=>server.close(done));return port;
}
/** One exact failed aggregate; preserve it and prove the three admitted tool deltas. */
export async function reviewCycle14ToolContinuation(output, previous) {
  assert.equal(output,'/private/tmp/notes-sync87-native-final-02');
  assert.equal(previous.pid,93757);assert.equal(previous.frontendUnchanged,false);
  assert.deepEqual(previous.exit,{code:0,signal:null});assert.equal(previous.forcedOrFailed,false);assert.equal(previous.pageErrorCount,0);assert.equal(previous.binaryUnchanged,true);
  const sourceRoot=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
  assert.equal(sourceRoot,'/private/tmp/apple-notes-sync87-native');
  const paths=['src','scripts/debug','plugins/tauri-plugin-notes-ui/src','plugins/tauri-plugin-notes-ui/macos','plugins/tauri-plugin-notes-ui/guest-js','plugins/tauri-plugin-notes-ui/examples','scripts/native','plugins/tauri-plugin-notes-ui/Cargo.toml','plugins/tauri-plugin-notes-ui/build.rs','package.json','pnpm-lock.yaml','vite.config.ts','tsconfig.json'];
  const git=args=>execFileSync('git',args,{cwd:sourceRoot,maxBuffer:8*1024*1024});
  const manifests=[];
  for(const [commit,expected] of [['ad982595','8ce891d834639f6a4bcf77fb877ef50e5b0783baaee66e3a70588a416bcc9d13'],['0be31b97','21684ce60962428ac86d16dfd92aca354d7dafce866b6bb6d8ba165569ea42f4']]){
    const names=git(['ls-tree','-r','--name-only',commit,'--',...paths]).toString().trim().split('\n').sort();assert.equal(names.length,160);
    const digest=createHash('sha256'),files=[];
    for(const path of names){const bytes=git(['show',commit+':'+path]);digest.update(path);digest.update('\0');digest.update(bytes);digest.update('\0');files.push({path,bytes:bytes.length,sha256:hash(bytes)});}
    assert.equal(digest.digest('hex'),expected);manifests.push({commit,sha256:expected,files});
  }
  const [before,after]=manifests;assert.equal(previous.frontendBefore.sha256,before.sha256);assert.equal(previous.frontendAfter.sha256,after.sha256);
  assert.equal(previous.frontendBefore.gitDirty,false);assert.equal(previous.frontendAfter.gitDirty,false);
  assert.deepEqual(before.files.map(x=>x.path),after.files.map(x=>x.path));
  const changed=before.files.filter((f,i)=>f.sha256!==after.files[i].sha256).map(x=>x.path);
  assert.deepEqual(changed,['scripts/debug/sync87-native/android/SyncTargetCounts.java','scripts/debug/sync87-native/check-counts.py','scripts/debug/sync87-native/guard.py']);
  for(const f of after.files){if(f.path==='scripts/debug/sync87-native/desktop-peer.mjs')continue;const actual=await readFile(join(sourceRoot,f.path));assert.equal(actual.length,f.bytes);assert.equal(hash(actual),f.sha256);}
  const current=await sourceFingerprint(sourceRoot);assert.equal(current.fileCount,160);assert.equal(current.gitDirty,false);
  const productReportPath='/Users/water/work/2026/Apple-Notes-Clone/docs/verification/sync88/android-build/result.json';
  const productBytes=await readFile(productReportPath);assert.equal(hash(productBytes),'a4c7040dd58f720cb75d4061316df2042bf1966fa099854bdf0267e315b0d976');
  const product=JSON.parse(productBytes);assert.equal(product.inputBefore.length,321);assert.deepEqual(product.inputBefore,product.inputAfter);
  for(const f of product.inputBefore){const bytes=await readFile(join(sourceRoot,f.path));assert.equal(bytes.length,f.bytes);assert.equal(hash(bytes),f.sha256);}
  await verifyDOMDependencies(sourceRoot);
  const lifecyclePath=join(output,'lifecycle14.execution.json'),lifecycleBytes=await readFile(lifecyclePath),lifecycle=JSON.parse(lifecycleBytes);
  assert.equal(lifecycle.exitCode,0);assert.deepEqual(lifecycle.argv,['python3','scripts/debug/sync87-environment/lifecycle.py','cycle','--serial','emulator-5584','--avd','notes-sync87-isolated','--boot-timeout','180','--hold-seconds','600']);
  for(const [name,path] of [['root',join(output,'desktop-peer')],['database',join(output,'desktop-peer/notes.sqlite3')]]){const stat=await lstat(path);assert.equal(stat.dev,previous.reopenProof.identities[name].device);assert.equal(stat.ino,previous.reopenProof.identities[name].inode);}
  return {kind:'exact-cycle14-admitted-count-tool-continuation',originalAggregateFrontendUnchanged:false,manifests,changedPaths:changed,productInputs:product.inputBefore,productInputsUnchanged:true,domDependenciesUnchanged:true,currentFrontend:current,lifecycle:{path:lifecyclePath,sha256:hash(lifecycleBytes),exitCode:0},originalPeerNaturalExit:true};
}
export async function reviewExistingStore(output,runId,reviewed) {
  assert(/^\/private\/tmp\/notes-sync87-native-[a-z0-9-]+$/.test(output));assert(/^[0-9a-f]{10}$/.test(runId));
  const root=join(output,'desktop-peer');
  for(const name of ['state.json','desktop-peer-lifecycle.json']){const path=join(output,name),stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink());assert.equal(await realpath(path),path);}
      const state=JSON.parse(await readFile(join(output,'state.json'),'utf8'));
      assert.equal(state.runId,runId);assert.equal(state.serial,'emulator-5584');assert.equal(state.avd,'notes-sync87-isolated');
      const previous=JSON.parse(await readFile(join(output,'desktop-peer-lifecycle.json'),'utf8'));
      assert.equal(previous.root,root);assert.equal(previous.kind,'actual-react-tiptap-dom-real-rust-session-store-network');
      assert.equal(previous.binarySha256,reviewed.receipt.sha256);assert.equal(previous.sourceCommit,reviewed.receipt.sourceCommit);
      assert.deepEqual(previous.exit,{code:0,signal:null});assert.equal(previous.forcedOrFailed,false);assert.equal(previous.pageErrorCount,0);assert.equal(previous.binaryUnchanged,true);let toolContinuation;
      if(previous.frontendUnchanged===false)toolContinuation=await reviewCycle14ToolContinuation(output,previous);else assert.equal(previous.frontendUnchanged,true);
      const identities={};
      for(const [name,path,directory] of [['output',output,true],['root',root,true],['sync',join(root,'.sync'),true],['database',join(root,'notes.sqlite3'),false]]){
        const stat=await lstat(path);assert(!stat.isSymbolicLink());assert.equal(await realpath(path),path);assert(directory?stat.isDirectory():stat.isFile());
        if(!directory)assert(stat.size>0);identities[name]={device:stat.dev,inode:stat.ino,...(!directory?{size:stat.size,sha256:hash(await readFile(path))}:{})};
      }
      const archive=join(output,'desktop-peer-lifecycle-before-reopen-'+String(Date.now())+'.json');await writeFile(archive,JSON.stringify(previous,null,2)+'\n',{flag:'wx',mode:0o600});
      return {kind:'same-existing-owned-store',identities,previousLifecycle:archive,...(toolContinuation?{toolContinuation}:{})};
}
export class DesktopPeer {
  static async reopen(receiptPath,output,runId) { return DesktopPeer.open(receiptPath,output,runId,true); }
  static async open(receiptPath,output,runId,reopenExisting=false) {
    assert(/^\/private\/tmp\/notes-sync87-native-[a-z0-9-]+$/.test(output));assert(/^[0-9a-f]{10}$/.test(runId));
    const reviewed=await reviewedPeer(receiptPath),root=join(output,'desktop-peer');let reopenProof;
    assert.equal(typeof reopenExisting,'boolean');
    if(reopenExisting)reopenProof=await reviewExistingStore(output,runId,reviewed);else await mkdir(root,{mode:0o700});
    const self=new DesktopPeer();Object.assign(self,{reviewed,root,output,runId,closed:false,started:performance.now()});
    self.reopenProof=reopenProof;
    self.frontendRoot=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
    self.domDependencies=await verifyDOMDependencies(self.frontendRoot);
    self.frontendBefore=await sourceFingerprint(self.frontendRoot);
    try{
      self.runtime=await openRuntime({root:self.frontendRoot,transport:reviewed.receipt.binary,storeDirectory:root,rustEvents:true,bundleDebug:true,transportOptions:{timeoutMs:40000,closeTimeoutMs:10000,recordPolls:false},beforeRustEvent:event=>{validatePeerEvent(event,self.access?.sessionId);}});
      self.backend=self.runtime.backend;self.page=self.runtime.page;await self.workspace();
      if(reopenProof){for(const [name,path] of [['root',root],['database',join(root,'notes.sqlite3')]]){const stat=await lstat(path);assert.equal(stat.dev,reopenProof.identities[name].device);assert.equal(stat.ino,reopenProof.identities[name].inode);}}
      return self;
    }catch(error){if(self.runtime)await self.close();throw error;}
  }
  async call(command,args={}) {
    assert(!this.closed);assert(this.page&&!this.page.isClosed(),'actual App page required');assert.equal(this.runtime.errors.length,0,'actual App event delivery failed');
    const response=await this.backend.call(command,args);
    assert.equal(response.events.length,0,'all events must pass through one sink');
    if(!response.ok)throw Error('peer command failed');return response.value;
  }
  async workspace(){const w=await this.call('load_workspace');assert(w.access?.sessionId);if(this.access)assert.equal(w.access.sessionId,this.access.sessionId,'peer process session changed');if(!this.access||w.access.epoch>=this.access.epoch)this.access=w.access;return w;}
  expected(id){assert(this.access);const token={sessionId:this.access.sessionId,epoch:this.access.epoch};if(id){assert(this.access.notes[id]?.authorized);token.noteEpoch=this.access.notes[id].epoch;}return token;}
  async sync(command){assert(['stop','resume','status'].includes(command.type)&&Object.keys(command).length===1);await this.command('data.open');const value=await this.command('sync.'+command.type);await this.command('app.back');return value;}
  async command(id,args={}) {
    assert(!this.closed&&this.page&&!this.page.isClosed(),'actual App page required');
    assert.equal(this.runtime.errors.length,0,'actual App event delivery failed');
    const result=await api(this.page,id,args);await idle(this.page);return result.result;
  }
  async host(){const port=await freePort();await this.command('data.open');await this.command('sync.host.start',{deviceName:'SYNC87 Desktop',port});await this.command('app.back');return{port,endpoint:'ws://10.0.2.2:'+port};}
  async invitation(endpoint){await this.command('data.open');await this.command('sync.invite',{endpoint});const invitation=await this.page.getByRole('textbox',{name:'生成的配对串',exact:true}).inputValue();assert(invitation.startsWith('notes-sync-v1:'));await this.command('app.back');return invitation;}
  async create(text){await this.command('note.create');await this.command('editor.insertText',{text});await this.command('app.flush');const state=(await api(this.page,'app.state')).result;assert(state.selection.noteId);return state.selection.noteId;}
  async save(id,text){
    const w=await this.workspace(),note=w.notes.find(n=>n.id===id);assert(note);
    await this.command('note.select',{id});
    const content=[{type:'paragraph',content:[{type:'text',text}]},...note.document.content.filter(n=>n.type==='attachment')];
    await this.command('editor.setContent',{document:{type:'doc',content}});await this.command('app.flush');
  }
  async addMedia(id,file){
    const bytes=await readFile(file.path);assert.equal(hash(bytes),file.sha256);await this.workspace();
    const mime=file.name.endsWith('.png')?'image/png':'audio/wav';
    await this.command('note.select',{id});
    const before=(await this.workspace()).attachments.map(a=>a.id);
    await chooseFiles(this.page,[{name:file.name,mimeType:mime,buffer:bytes}]);await idle(this.page);await this.command('app.flush');
    const attachment=(await this.workspace()).attachments.find(a=>a.noteId===id&&a.displayName===file.name&&!before.includes(a.id));assert(attachment);return attachment.id;
  }
  async verifyOriginal(id,file,label){
    assert(/^[a-z0-9-]+$/.test(label));await this.workspace();
    const attachment=(await this.workspace()).attachments.find(a=>a.id===id),owner=attachment?.noteId;
    assert(owner);const read=await this.call('read_attachment',{id,expected:this.expected(owner)});
    const bytes=Buffer.from(read.data,'base64');assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256);
    const destination=join(this.output,label+'-'+file.name);
    await this.call('export_attachment',{id,path:destination,expected:this.expected(owner)});
    assert.equal(hash(await readFile(destination)),file.sha256);
    assert(typeof attachment.relativePath==='string'&&!attachment.relativePath.startsWith('/')&&!attachment.relativePath.split('/').includes('..'));
    const managedPath=resolve(this.root,'attachments',attachment.relativePath);assert(managedPath.startsWith(join(this.root,'attachments')+'/'));
    const managed=await lstat(managedPath);assert(managed.isFile()&&!managed.isSymbolicLink());assert.equal(await realpath(managedPath),managedPath);
    assert.equal(hash(await readFile(managedPath)),file.sha256);
    return{id,bytes:bytes.length,sha256:file.sha256,exportPath:destination,managedFileVerified:true};
  }
  async close(){
    if(this.closePromise)return this.closePromise;
    this.closePromise=(async()=>{
      this.closed=true;let exit,failed;
      try{await this.runtime.cleanup();exit=this.backend.lifecycle.exit;}catch{failed=true;exit=this.backend.lifecycle.exit;}
      const binaryUnchanged=hash(await readFile(this.reviewed.receipt.binary))===this.reviewed.receipt.sha256;
      await verifyDOMDependencies(this.frontendRoot);
      const frontendAfter=await sourceFingerprint(this.frontendRoot);
      const report={kind:'actual-react-tiptap-dom-real-rust-session-store-network',domDependencies:this.domDependencies,frontendBefore:this.frontendBefore,frontendAfter,frontendUnchanged:this.frontendBefore.sha256===frontendAfter.sha256,pid:this.backend.pid,root:this.root,sourceCommit:this.reviewed.receipt.sourceCommit,binarySha256:this.reviewed.receipt.sha256,buildLabel:this.reviewed.receipt.buildLabel,exit,forcedOrFailed:!!failed,pageErrorCount:this.runtime.errors.length,events:this.runtime.rustEvents.history.length,resourceClosures:this.runtime.rustEvents.resourceClosures,binaryUnchanged,...(this.reopenProof?{reopenProof:this.reopenProof}:{}),wallSeconds:(performance.now()-this.started)/1000};
      await writeFile(join(this.output,'desktop-peer-lifecycle.json'),JSON.stringify(report,null,2)+'\n');
      assert(!failed&&exit?.code===0&&!exit.signal&&binaryUnchanged&&report.frontendUnchanged&&this.runtime.errors.length===0,'peer did not close naturally with unchanged binary');return report;
    })();return this.closePromise;
  }
}
