import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync, lstatSync, writeFileSync, copyFileSync} from 'node:fs';
import {join, relative, dirname, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {brotliDecompressSync} from 'node:zlib';

const out = dirname(fileURLToPath(import.meta.url));
const root = '/private/tmp/cybernote-account109-gui-reauth-01';
const artifact = '/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-10814415-debug-e2e-02';
const expectedRevision = '10814415ca088273bacc311d192b9605bda16775';
const expectedHash = 'b981400529f36cb698616d3871cc83b9a5d7cc4c10fb75009276697daba9ee6f';
const sha = b => createHash('sha256').update(b).digest('hex');
const save = (name, value) => writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
const git = (...args) => execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});
const regular = p => {const s=lstatSync(p); assert(s.isFile()&&!s.isSymbolicLink()); return readFileSync(p);};
const startedAt = new Date().toISOString();
const receiptBytes = regular(join(artifact,'build-record.json'));
const receipt = JSON.parse(receiptBytes);
assert.equal(git('rev-parse','HEAD').toString().trim(),expectedRevision);
assert.equal(git('status','--porcelain','--untracked-files=normal').length,0);
assert.equal(receipt.sourceRevision,expectedRevision);
assert.equal(receipt.sourceTree,git('rev-parse','HEAD^{tree}').toString().trim());
const dotenvNames = readdirSync(root).filter(p=>/^\.env(?:\.|$)/.test(p));
assert.deepEqual(dotenvNames,[]);
const {sourceIdentity,productFiles,assertVersions} = await import(pathToFileURL(join(root,'scripts/build-info.mjs')));
const identity=sourceIdentity(root,{metadataPath:null});
assert.equal(identity.sourceDirty,false);
assert.deepEqual(identity,receipt.sourceBefore);
assert.deepEqual(identity,receipt.sourceAfter);
const tree=new Map(git('ls-tree','-rz',expectedRevision).toString().split('\0').filter(Boolean).map(row=>{
  const [meta,path]=row.split('\t');const [mode,type,oid]=meta.split(' ');return [path,{mode,type,oid}];
}));
const inputs=productFiles(root).map(path=>{
  const bytes=regular(join(root,path)), entry=tree.get(path);
  assert(entry&&entry.type==='blob'&&['100644','100755'].includes(entry.mode),path);
  const oid=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(oid,entry.oid,path);
  return {path,bytes:bytes.length,sha256:sha(bytes),gitBlob:oid,matchesCommit:true};
});
assert.equal(inputs.length,1654);
const fingerprint=createHash('sha256');
for(const p of inputs){const bytes=regular(join(root,p.path));fingerprint.update(`${p.path}\0${bytes.length}\0`);fingerprint.update(bytes);}
assert.equal(fingerprint.digest('hex'),identity.sourceFingerprint);
save('source-inputs.json',inputs);
const lockfiles=Object.keys(receipt.lockfilesBefore).map(path=>{
  const b=regular(join(root,path)), hash=sha(b);
  assert.equal(hash,receipt.lockfilesBefore[path]);assert.equal(hash,receipt.lockfilesAfter[path]);
  assert(b.equals(git('show',`${expectedRevision}:${path}`)),path);
  return {path,bytes:b.length,sha256:hash,matchesCommitAndBothReceiptSnapshots:true};
});
const tools=['scripts/build-info.mjs','scripts/publish/package-identity.mjs','scripts/publish/policy.mjs',
  'scripts/debug/account-native-capability.mjs','vite.config.ts','package.json','src-tauri/build.rs',
  'src-tauri/Cargo.toml','src-tauri/tauri.conf.json','src/App.tsx','src/debug/runtime.ts','src/account-client.ts'].map(path=>{
    const b=regular(join(root,path));assert(b.equals(git('show',`${expectedRevision}:${path}`)),path);
    return {path,sha256:sha(b),bytes:b.length,matchesCommit:true};
});
const controller=regular(join(artifact,'build-controller.py'));
assert.equal(sha(controller),receipt.buildControllerSha256);
const logs=receipt.commands.map(c=>{
  const bytes=regular(join(artifact,c.name+'.log'));assert.equal(sha(bytes),c.logSha256);assert.equal(c.exitCode,0);
  return {name:c.name,command:c.command,exitCode:c.exitCode,bytes:bytes.length,sha256:sha(bytes),receiptMatches:true};
});
const identityLog=JSON.parse(regular(join(artifact,'embedded-identity.log')));
assert.deepEqual(identityLog,receipt.identityReceipt);
const capability=JSON.parse(regular(join(artifact,'compiled-capability.log')));
assert.equal(capability.checks,24);assert.equal(capability.results.length,24);
const native=regular(join(artifact,'notes-clone'));
assert.equal(sha(native),expectedHash);assert.equal(sha(native),receipt.binary.sha256);
assert.equal(native.length,receipt.binary.bytes);
assert.equal(native.readUInt32LE(0),0xfeedfacf);assert.equal(native.readUInt32LE(4),0x0100000c);
assert.equal(native.readUInt32LE(12),2);
const cstr=b=>b.toString().split('\0')[0];
const sections=[],segments=[];let pos=32;
for(let i=0;i<native.readUInt32LE(16);i++){
  const cmd=native.readUInt32LE(pos),size=native.readUInt32LE(pos+4);assert(size>=8&&pos+size<=native.length);
  if(cmd===0x19){
    const segment=cstr(native.subarray(pos+8,pos+24)),fileoff=Number(native.readBigUInt64LE(pos+40)),filesize=Number(native.readBigUInt64LE(pos+48));
    const initprot=native.readUInt32LE(pos+60);
    segments.push({segment,fileoff,filesize,initprot});
    for(let j=0;j<native.readUInt32LE(pos+64);j++){
      const q=pos+72+j*80;sections.push({segment,section:cstr(native.subarray(q,q+16)),
        offset:native.readUInt32LE(q+48),size:Number(native.readBigUInt64LE(q+40))});
    }
  }
  pos+=size;
}
const distRoot=join(root,'dist');
function walk(p){return readdirSync(p,{withFileTypes:true}).flatMap(e=>{const q=join(p,e.name);return e.isDirectory()?walk(q):[q];}).sort();}
const dist=walk(distRoot).map(path=>({path:relative(distRoot,path),bytes:regular(path)}));
const target=receipt.cargoTarget;
const candidatePaths=readdirSync(join(target,'debug/build'),{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('notes-clone-')).flatMap(e=>{
  const dir=join(target,'debug/build',e.name,'out/tauri-codegen-assets');
  try{return walk(dir);}catch(error){if(error.code==='ENOENT')return [];throw error;}
});
const candidates=candidatePaths.map(path=>({path,bytes:regular(path)})).filter(c=>c.bytes.length<=4*1024*1024);
for(const c of candidates){try{c.decoded=brotliDecompressSync(c.bytes,{maxOutputLength:16*1024*1024});}catch{}}
const assetResults=dist.map(d=>{
  const matches=[];
  for(const c of candidates){
    if(!c.decoded?.equals(d.bytes))continue;
    const offset=native.indexOf(c.bytes);if(offset<0)continue;
    const section=sections.find(s=>offset>=s.offset&&offset+c.bytes.length<=s.offset+s.size);
    const segment=segments.find(s=>offset>=s.fileoff&&offset+c.bytes.length<=s.fileoff+s.filesize);
    assert(segment&&(segment.initprot&1)&&segment.segment!=='__LINKEDIT');
    matches.push({encodedPath:relative(target,c.path),encoding:'brotli',encodedBytes:c.bytes.length,
      encodedSha256:sha(c.bytes),binaryFileOffset:offset,section:section??null,loadSegment:segment.segment,
      decodedEqualsDist:true,binarySliceEqualsEncoded:true});
  }
  return {path:d.path,bytes:d.bytes.length,sha256:sha(d.bytes),matches,exactEmbeddedMatch:matches.length>0};
});
save('embedded-assets.json',assetResults);
const required=assetResults.filter(a=>/\.(?:js|css|json|svg)$/.test(a.path));
assert(required.every(a=>a.exactEmbeddedMatch),'A current required dist asset was not proven embedded');
const buildInfoBytes=dist.find(d=>d.path==='build-info.json').bytes, info=JSON.parse(buildInfoBytes);
assert.deepEqual(info,identityLog.info);assert.equal(info.mode,'production');
assert.equal(info.version,assertVersions(root));assert.equal(info.target,'macos');
for(const key of Object.keys(identity))assert.equal(info[key],identity[key]);
assert.equal(sha(buildInfoBytes),identityLog.embeddedIdentity.sha256);
assert(buildInfoBytes.equals(regular(join(artifact,'frontend-build-info.json'))));
const main=dist.find(d=>/^assets\/index-.*\.js$/.test(d.path));
const debug=dist.find(d=>/^assets\/runtime-.*\.js$/.test(d.path));assert(main&&debug);
const importText=`import("./${basename(debug.path)}")`;
assert(main.bytes.includes(Buffer.from(importText)),'Expected actual debug chunk dynamic import');
const debugMarkers=['__NOTES_DEBUG__','app.state','registerDebug'].map(marker=>({marker,present:debug.bytes.includes(Buffer.from(marker))}));
assert(debugMarkers.find(m=>m.marker==='app.state').present);
const index=dist.find(d=>d.path==='index.html');
const htmlRefs=[...index.bytes.toString().matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(m=>m[1].slice(1));
assert(htmlRefs.includes(main.path));assert(htmlRefs.every(p=>assetResults.find(a=>a.path===p)?.exactEmbeddedMatch));
const fingerprints=['notes-clone-63305be8bf99585f/bin-notes-clone.json','notes-clone-3cecca753b1ac10a/lib-notes_clone_lib.json'].map(path=>{
  const bytes=regular(join(target,'debug/.fingerprint',path));const value=JSON.parse(bytes);
  assert(JSON.parse(value.features).includes('sync-e2e'));
  return {path,sha256:sha(bytes),features:JSON.parse(value.features),profile:value.profile,rustflags:value.rustflags};
});
const targetBinary=regular(join(target,'debug/notes-clone'));assert.equal(sha(targetBinary),expectedHash);
const {verifyEmbeddedIdentity}=await import(pathToFileURL(join(root,'scripts/publish/package-identity.mjs')));
const actualIdentity=verifyEmbeddedIdentity(native,buildInfoBytes,candidates.map(c=>c.bytes));
assert.deepEqual(actualIdentity,identityLog.embeddedIdentity);
assert.deepEqual(sourceIdentity(root,{metadataPath:null}),identity);
assert(regular(join(artifact,'build-record.json')).equals(receiptBytes));
assert.equal(sha(regular(join(artifact,'notes-clone'))),expectedHash);
for(const c of candidates)assert(regular(c.path).equals(c.bytes),'Read-only target asset changed');
for(const d of dist)assert(regular(join(distRoot,d.path)).equals(d.bytes),'Dist asset changed');
copyFileSync(join(artifact,'build-record.json'),join(out,'build-record.json'));
copyFileSync(join(artifact,'build-controller.py'),join(out,'build-controller.py.txt'));
copyFileSync(join(artifact,'frontend-build-info.json'),join(out,'frontend-build-info.json'));
save('review-result.json',{schema:1,startedAt,finishedAt:new Date().toISOString(),verdict:'PASS_STATIC_DEBUG_E2E_PACKAGE_ONLY',
  source:{root,tree:receipt.sourceTree,...identity,allInputsMatchCommittedBlobs:true,lockfiles,dotenvNames},
  binary:{path:join(artifact,'notes-clone'),sha256:sha(native),bytes:native.length,format:'thin Mach-O 64-bit little-endian',architecture:'arm64',filetype:'MH_EXECUTE',sections,segments,matchesCurrentTargetBinary:true},
  receipt:{sha256:sha(receiptBytes),controllerSha256:sha(controller),allLogHashesMatch:true,logs,capabilityChecksReported:capability.checks},
  embeddedIdentity:actualIdentity,buildInfo:info,tools,fingerprints,
  frontend:{distFiles:dist.length,exactEmbeddedFiles:assetResults.filter(a=>a.exactEmbeddedMatch).length,
    requiredJsCssJsonSvgAllExact:true,unmatchedPaths:assetResults.filter(a=>!a.exactEmbeddedMatch).map(a=>a.path),
    mainChunk:main.path,debugChunk:debug.path,debugDynamicImportPresent:true,debugMarkers,htmlAssetReferences:htmlRefs},
  boundary:{appExecuted:false,buildPerformed:false,targetWrites:false,storesAccessed:false,adbUsed:false,networkUsed:false,
    classification:'Debug E2E with sync-e2e and VITE_NOTES_DEBUG=1 under NODE_ENV=development. Vite production build-info label describes build command only; not a production release, signing, runtime, account acceptance, or exhaustive binary/source equivalence claim.',
    provenanceLimit:'Receipts and Cargo fingerprints corroborate provenance, but no rebuild or native-code source equivalence proof was performed. Exact resource bytes were checked in readable Mach-O file segments.'},
  reaEvidenceId:'ev_f63ee75eeb52129943644c3346292c6ab1473408a919df17513a4275973910ee'});
console.log(JSON.stringify({verdict:'PASS_STATIC_DEBUG_E2E_PACKAGE_ONLY',inputs:inputs.length,binarySha256:sha(native),
  distFiles:dist.length,exactEmbeddedFiles:assetResults.filter(a=>a.exactEmbeddedMatch).length,
  unmatchedPaths:assetResults.filter(a=>!a.exactEmbeddedMatch).map(a=>a.path),debugChunk:debug.path},null,2));
