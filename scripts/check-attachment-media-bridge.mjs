// Test the production bridge and both real response gates. Only IPC transport
// is controlled; Rust runtime/TCP integration is the separate platform target.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const modules = new Map();
globalThis.__mediaBoundary = { invoke: () => { throw Error('unexpected invocation'); } };
async function production(path) {
  path = resolve(path);
  if (modules.has(path)) return modules.get(path).exports;
  let code = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replaceAll('import.meta.env.VITE_ACCESS_BOUNDARY_PROOF', '"0"');
  for (const match of [...code.matchAll(/from ["']([^"']+)["']/g)]) {
    const name = match[1]; let url;
    if (name.startsWith('.')) {
      let file = resolve(dirname(path), name);
      if (!file.endsWith('.ts')) file += await stat(file).then(s => s.isDirectory(), () => false) ? '/index.ts' : '.ts';
      await production(file); url = modules.get(file).url;
    } else if (name === '@tauri-apps/api/core') {
      url = 'data:text/javascript;base64,' + Buffer.from('export const isTauri=()=>true;export const invoke=(...a)=>globalThis.__mediaBoundary.invoke(...a);').toString('base64');
    } else if (name === '@tauri-apps/api/event') {
      url = 'data:text/javascript;base64,' + Buffer.from('export const listen=async()=>()=>{};').toString('base64');
    } else throw Error('Unexpected runtime import: ' + name);
    code = code.replaceAll(JSON.stringify(name), JSON.stringify(url)).replaceAll("'" + name + "'", JSON.stringify(url));
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  const exports = await import(url); modules.set(path, { exports, url }); return exports;
}
const bridge = await production('src/bridge.ts');
const { validateDataManagement } = await production('src/data-management.ts');
const access = () => ({ sessionId:'actual-process', epoch:1, notes:{ n:{epoch:0,authorized:true} }, suspended:[] });
const metadata = () => ({sessionId:'actual-process',sequence:10});
const leaseId = 'a'.repeat(32);
const grant = () => ({leaseId,url:`http://127.0.0.1:49152/media/${leaseId}`,mime:'image/png',bytes:123,name:'source.svg',
  width:160,height:80,attachmentId:'a',noteId:'n',purpose:'thumbnail',access:access(),metadata:metadata()});
function reset() {
  bridge.accessGate.invalidate(access());
  bridge.metadataGate.sessionId=undefined; bridge.metadataGate.observe(metadata(),'actual-process');
  bridge.markWorkspaceApplied({attachments:[{id:'a',noteId:'n'}],metadata:metadata()});
}
const released=[];let args;
function native(response) {
  globalThis.__mediaBoundary.invoke=async(command, input) => {
    if(command==='release_attachment_source'){released.push(input.leaseId);return;}
    assert.equal(command,'acquire_attachment_source');args=input;
    return typeof response==='function' ? response() : response;
  };
}
reset(); native(grant());
assert.equal((await bridge.acquireAttachmentSource('a','thumbnail',160)).leaseId,leaseId);
assert.deepEqual(args,{id:'a',purpose:'thumbnail',pixels:160,expected:{sessionId:'actual-process',epoch:1,noteEpoch:0}});
assert.equal('window' in args,false);assert.equal('label' in args,false);assert.equal(released.length,0);
// Delayed result after an access prepare cannot publish, even at equal stamps.
reset();let resolveGrant;native(()=>new Promise(resolve=>{resolveGrant=resolve;}));
const late=bridge.acquireAttachmentSource('a','thumbnail',160);
bridge.accessGate.invalidate({...access(),suspended:['n'],operationId:'locking'});resolveGrant(grant());
await assert.rejects(late,e=>e.code==='access_changed');assert.equal(released.length,1);
assert.equal(bridge.accessGate.state.operationId,'locking');
// Same access epoch is insufficient when a newer metadata receipt was observed.
reset();native(()=>{bridge.metadataGate.observe({...metadata(),sequence:11},'actual-process');return grant();});
await assert.rejects(bridge.acquireAttachmentSource('a','thumbnail',160),e=>e.code==='metadata_stale');assert.equal(released.length,2);
assert.equal(bridge.metadataGate.observed,11);
// Source owner changed after a workspace refresh; do not expose another note.
reset();native(()=>{bridge.markWorkspaceApplied({attachments:[{id:'a',noteId:'other'}],metadata:metadata()});return grant();});
await assert.rejects(bridge.acquireAttachmentSource('a','thumbnail',160),e=>e.code==='invalid');assert.equal(released.length,3);
for (const patch of [ {url:`http://localhost:49152/media/${leaseId}`}, {url:`http://127.0.0.1:49152/media/${leaseId}?token=oops`},
  {url:'https://example.com/original'}, {width:161}, {noteId:'other'}, {purpose:'original'}, {mime:'image/svg+xml'}, {bytes:-1} ]) {
  reset();native({...grant(),...patch});
  await assert.rejects(bridge.acquireAttachmentSource('a','thumbnail',160),e=>e.code==='invalid');
}
assert.equal(released.length,11);
reset();const original={...grant(),purpose:'original',width:null,height:null,mime:'audio/wav'};native(original);
assert.equal((await bridge.acquireAttachmentSource('a','original')).mime,'audio/wav');
for(const [purpose,size] of [['thumbnail',undefined],['thumbnail',1025],['thumbnail',0],['original',100],['unrecognized',100]]) {
  await assert.rejects(bridge.acquireAttachmentSource('a',purpose,size),e=>e.code==='invalid');
}
await assert.rejects(bridge.acquireAttachmentSource('missing','original'),e=>e.code==='not_found');
// Cleanup failure is never permission to publish a rejected capability.
reset();globalThis.__mediaBoundary.invoke=async(command)=>{
  if(command==='release_attachment_source')throw Error('transport closed');
  bridge.accessGate.invalidate();return grant();
};
await assert.rejects(bridge.acquireAttachmentSource('a','thumbnail',160),e=>e.code==='access_changed');
reset();globalThis.__mediaBoundary.invoke=async(command,args)=>{
  assert.equal(command,'clear_attachment_media_cache');assert.deepEqual(args.expected,{sessionId:'actual-process',epoch:1});
  return {cleared:true,access:access(),metadata:metadata()};
};await bridge.clearAttachmentMediaCache();
const snapshot={version:1,capturedAt:0,rootPath:'/isolated',files:[],warnings:[],
  totals:{databaseBytes:0,auxiliaryBytes:0,attachmentBytes:0,otherBytes:0,totalBytes:0,declaredAttachmentBytes:0},
  counts:{notes:0,folders:0,attachments:0,physicalFiles:0,missingAttachments:0}};
assert.equal(validateDataManagement(snapshot),snapshot);
assert.equal(validateDataManagement({...snapshot,mediaCache:{version:1,bytes:15,files:1,quota:100}}).totals.totalBytes,0);
for(const cache of [null,{version:2,bytes:15,files:1,quota:100},{version:1,bytes:-1,files:1,quota:100}])assert.throws(()=>validateDataManagement({...snapshot,mediaCache:cache}));
// Exact production network config: no broad HTTP origin or attachment asset widening.
const config=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
const rules=Object.fromEntries(config.app.security.csp.split(';').filter(x=>x.trim()).map(x=>{const [name,...sources]=x.trim().split(/\s+/);return[name,sources];}));
for(const name of ['img-src','media-src','connect-src'])assert.equal(rules[name].filter(x=>x==='http://127.0.0.1:*').length,1);
for(const [name,sources] of Object.entries(rules))for(const source of sources) {
  assert.ok(!['http:','*','http://localhost:*','http://*'].includes(source));
  if(source==='http://127.0.0.1:*')assert.ok(['img-src','media-src','connect-src'].includes(name));
}
assert.deepEqual(config.app.security.assetProtocol.scope,['$APPDATA/attachments/**']);
const releaseXML=await readFile('src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml','utf8');
assert.match(releaseXML,/<base-config cleartextTrafficPermitted="false"/);
assert.deepEqual([...releaseXML.matchAll(/<domain>([^<]+)<\/domain>/g)].map(m=>m[1]),['127.0.0.1']);
assert.ok(!releaseXML.includes('includeSubdomains='));
const manifest=await readFile('src-tauri/gen/android/app/src/main/AndroidManifest.xml','utf8');
assert.match(manifest,/android:networkSecurityConfig="@xml\/network_security_config"/);
const host=await readFile('src-tauri/src/lib.rs','utf8');
assert.equal((host.match(/acquire_attachment_source,\s*release_attachment_source,\s*clear_attachment_media_cache,/g)||[]).length,2);
assert.match(host,/media\.0\.window\(window\.label\(\)\)/);
assert.match(host,/fn emit\(&self, name: &str, payload: &Value\)[\s\S]*?emit_document_event\(&self\.0, name, payload\)/);
console.log('Media bridge: real dual gates, late/malformed lease release, owner binding, native cache API, optional stats and exact platform config passed. Native playback remains FINAL101.');
