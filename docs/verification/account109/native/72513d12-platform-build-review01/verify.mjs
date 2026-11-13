import assert from 'node:assert/strict';
import {readFileSync, readdirSync, lstatSync, writeFileSync} from 'node:fs';
import {join, dirname, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {brotliDecompressSync} from 'node:zlib';

const source='72513d1296df4526a08834db65a3427957d3fb50';
const root='/private/tmp/cybernote-account109-android-72513d12-01';
const base='/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109';
const mac=join(base,'mac-72513d12-debug-e2e-01');
const android=join(base,'android-72513d12-debug-01');
const apk=join(android,'CyberNote-account109-debug.apk');
const out=dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>{assert(lstatSync(p).isFile()&&!lstatSync(p).isSymbolicLink());return readFileSync(p);};
const json=p=>JSON.parse(read(p));
const git=(...a)=>execFileSync('git',['--no-optional-locks',...a],{cwd:root,maxBuffer:20*1024*1024});
assert.equal(git('rev-parse','HEAD').toString().trim(),source);
assert.equal(git('status','--porcelain','--untracked-files=all').length,0);
const records=[join(mac,'build-record.json'),join(mac,'resource-identity.json'),join(android,'package-record.json'),join(android,'embedded-identity.json'),join(android,'retry02/build-record.json')];
const initialHashes=Object.fromEntries(records.map(p=>[p,sha(read(p))]));
const tree=new Map(git('ls-tree','-r','-z',source).toString().split('\0').filter(Boolean).map(row=>{
  const [meta,name]=row.split('\t');return [name,meta.split(' ')[2]];
}));
const blob=b=>createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const tools=['scripts/build-info.mjs','scripts/publish/package-identity.mjs','scripts/publish/policy.mjs'];
const toolHashes={};
for(const name of tools){const b=read(join(root,name));assert.equal(blob(b),tree.get(name));toolHashes[name]=sha(b);}
const {productFiles,sourceIdentity}=await import(pathToFileURL(join(root,'scripts/build-info.mjs')));
const {validatePackageInfo,verifyEmbeddedIdentity}=await import(pathToFileURL(join(root,'scripts/publish/package-identity.mjs')));
const inputs=productFiles(root);
for(const name of inputs)assert.equal(blob(read(join(root,name))),tree.get(name),'product input differs from exact committed blob');
const identity=sourceIdentity(root,{metadataPath:null});
assert.equal(identity.sourceRevision,source);assert.equal(identity.sourceDirty,false);assert.equal(inputs.length,1664);
const macRecord=json(records[0]), resources=json(records[1]), packageRecord=json(records[2]), androidIdentity=json(records[3]), retry=json(records[4]);
assert.equal(git('rev-parse',`${source}^{tree}`).toString().trim(),macRecord.sourceTree);
assert.equal(macRecord.sourceRoot,root);
assert.deepEqual(macRecord.sourceBefore,identity);assert.deepEqual(macRecord.sourceAfter,identity);
const sourceSnapshots=['input-before.json','input-after.json','input-final.json'].map(n=>json(join(android,n)));
for(const s of sourceSnapshots){assert.deepEqual(s.identity,identity);assert.equal(s.fullGitTreeExpectedProductInputs,1664);assert.equal(s.missingInputs,0);assert.equal(s.changedInputBytes,0);}
const locks={};
for(const [name,expected] of Object.entries(macRecord.lockfilesBefore)){
  const b=read(join(root,name));assert.equal(blob(b),tree.get(name));assert.equal(sha(b),expected);
  assert.equal(macRecord.lockfilesAfter[name],expected);assert.equal(retry.lockfiles[name],expected);locks[name]=expected;
}
assert.equal(Object.keys(locks).length,4);
assert(!readdirSync(root).some(n=>/^\.env(?:\.|$)/.test(n)));
assert.equal(retry.sourceCommit,source);assert.equal(retry.exitCode,0);assert.equal(retry.timedOut,false);assert.equal(retry.signal,null);
assert(macRecord.commands.every(c=>c.exitCode===0));
const boundEvidence={};
for(const c of macRecord.commands){const p=join(mac,c.name+'.log');assert.equal(sha(read(p)),c.logSha256);boundEvidence[p]=c.logSha256;}
assert.equal(sha(read(join(android,'retry02/build.log'))),retry.logSha256);
const capability=json(join(mac,'compiled-capability.log'));assert.equal(capability.checks,24);
const binary=read(join(mac,'notes-clone'));
const macSHA=sha(binary);assert.equal(macSHA,'187cf39d9143b66436b5ea260793f1700f346ac2c6d24cc391be629e96705459');
assert.equal(binary.length,204326848);assert.equal(binary.readUInt32LE(0),0xfeedfacf);assert.equal(binary.readUInt32LE(4),0x0100000c);assert.equal(binary.readUInt32LE(12),2);
const segments=[];let cursor=32;
for(let i=0;i<binary.readUInt32LE(16);i++){
  const command=binary.readUInt32LE(cursor),size=binary.readUInt32LE(cursor+4);assert(size>=8&&cursor+size<=binary.length);
  if(command===0x19)segments.push({name:binary.subarray(cursor+8,cursor+24).toString().split('\0')[0],offset:Number(binary.readBigUInt64LE(cursor+40)),size:Number(binary.readBigUInt64LE(cursor+48)),protection:binary.readUInt32LE(cursor+60)});
  cursor+=size;
}
const actualResources=[];
for(const r of resources.resources.filter(r=>/\.(js|css|json|svg)$/.test(r.path))){
  const expected=read(join(mac,'frontend-dist',r.path));assert.equal(sha(expected),r.sha256);
  const m=r.embeddedMatches[0];assert(m&&m.encoding==='brotli');
  const encoded=binary.subarray(m.binaryOffset,m.binaryOffset+m.encodedBytes);
  assert.equal(sha(encoded),m.encodedSha256);assert(brotliDecompressSync(encoded).equals(expected));
  assert(segments.some(s=>m.binaryOffset>=s.offset&&m.binaryOffset+encoded.length<=s.offset+s.size&&(s.protection&1)&&s.name!=='__LINKEDIT'));
  actualResources.push({path:r.path,sha256:r.sha256,encodedSHA256:sha(encoded),binaryOffset:m.binaryOffset});
}
assert.equal(actualResources.length,8);
const macInfo=json(join(mac,'frontend-dist/build-info.json'));validatePackageInfo(macInfo,root);assert.equal(macInfo.target,'macos');
const nativeInfo=actualResources.find(r=>r.path==='build-info.json');assert.equal(nativeInfo.sha256,macRecord.identityReceipt.embeddedIdentity.sha256);
const mainText=read(join(mac,'frontend-dist',resources.mainChunk)).toString();
assert(mainText.includes(`import("./${basename(resources.debugChunk)}")`));
assert(mainText.includes('__CYBERNOTE_STARTUP_DIAGNOSTIC__=Object.freeze({schema:1,gates:'));
const runtime=read(join(root,'src/debug/runtime.ts')).toString();
assert(runtime.includes('        await frame();\n        await frame();\n        const failure = live().state().failure;'));
assert(runtime.includes('new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));'));

const apkSHA=sha(read(apk));assert.equal(apkSHA,'654ab2a820de70588edcceb5231818b3580e425cdf7de1db395b585066091268');assert.equal(lstatSync(apk).size,77337368);
const zipSummary=JSON.parse(execFileSync('python3',['-c',`import zipfile,hashlib,json,sys,struct
with zipfile.ZipFile(sys.argv[1]) as z:
 rows=[]
 for n in z.namelist():
  if n.startswith('lib/') and n.endswith('.so'):
   b=z.read(n);rows.append({'path':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'elf64aarch64':b[:6]==b'\\x7fELF\\x02\\x01' and struct.unpack_from('<H',b,18)[0]==183})
 print(json.dumps({'libraries':rows,'nativePluginClassInDex':any(b'Lcom/local/notesauth/NotesAuthPlugin;' in z.read(n) for n in z.namelist() if n.startswith('classes') and n.endswith('.dex'))}))`,apk],{maxBuffer:1024*1024}));
assert(zipSummary.nativePluginClassInDex);assert.equal(zipSummary.libraries.length,5);
for(const lib of zipSummary.libraries){assert(lib.elf64aarch64);assert.deepEqual({bytes:lib.bytes,sha256:lib.sha256},packageRecord.nativeLibraries[lib.path]);}
const appLib=zipSummary.libraries.find(r=>r.path.endsWith('/libnotes_clone_lib.so'));assert(appLib);
const elf=execFileSync('python3',['-c','import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',apk,appLib.path],{maxBuffer:180*1024*1024});
assert.equal(sha(elf),appLib.sha256);
const androidInfoBytes=read(join(android,'retry02/frontend-dist/build-info.json'));
const androidInfo=JSON.parse(androidInfoBytes);validatePackageInfo(androidInfo,root);assert.equal(androidInfo.target,'android');
const candidates=[];
const build=join(macRecord.cargoTarget,'aarch64-linux-android/debug/build');
for(const entry of readdirSync(build,{withFileTypes:true})){
  if(!entry.isDirectory()||!entry.name.startsWith('notes-clone-'))continue;
  const folder=join(build,entry.name,'out/tauri-codegen-assets');let names;
  try{names=readdirSync(folder);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  for(const n of names)if(/^[a-f0-9]{64}\.json$/.test(n)&&lstatSync(join(folder,n)).size<=1024*1024)candidates.push(read(join(folder,n)));
}
assert(candidates.length<=4096);
const actualAndroidIdentity=verifyEmbeddedIdentity(elf,androidInfoBytes,candidates);
assert.deepEqual(actualAndroidIdentity,androidIdentity.embeddedIdentity);
assert.equal(androidIdentity.nativeBinarySha256,appLib.sha256);
const nativeOffset=candidates.map(b=>({b,offset:elf.indexOf(b)})).find(({b,offset})=>{try{return offset>=0&&brotliDecompressSync(b).equals(androidInfoBytes);}catch{return false;}});
assert(nativeOffset);
assert(brotliDecompressSync(elf.subarray(nativeOffset.offset,nativeOffset.offset+nativeOffset.b.length)).equals(androidInfoBytes));
const badging=execFileSync('/Users/water/Library/Android/sdk/build-tools/36.0.0/aapt2',['dump','badging',apk],{maxBuffer:1024*1024}).toString();
assert(badging.includes("package: name='com.local.notesclone.account109'"));assert(badging.includes("name='com.local.notesclone.MainActivity'"));assert(badging.includes('application-debuggable'));
const signature=execFileSync('/opt/zerobrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java',['-jar','/Users/water/Library/Android/sdk/build-tools/36.0.0/lib/apksigner.jar','verify','--verbose',apk],{maxBuffer:1024*1024}).toString();
assert(signature.includes('Verifies'));
assert.equal(git('status','--porcelain','--untracked-files=all').length,0);
assert.deepEqual(sourceIdentity(root,{metadataPath:null}),identity);
for(const [p,h] of Object.entries(initialHashes))assert.equal(sha(read(p)),h);
assert.equal(sha(read(join(mac,'notes-clone'))),macSHA);assert.equal(sha(read(apk)),apkSHA);
const result={schema:1,verdict:'APPROVE_EXACT_DEBUG_PACKAGE_IDENTITY',source,tree:macRecord.sourceTree,sourceRoot:root,identity,inputBlobsVerified:inputs.length,lockSHA256:locks,toolSHA256:toolHashes,recordSHA256:initialHashes,mac:{sha256:macSHA,bytes:binary.length,header:'thin Mach-O64 arm64 MH_EXECUTE',embeddedIdentity:nativeInfo.sha256,resources:actualResources,capabilityChecksBound:24,startupDiagnosticAssignmentCompiled:true,executeDoubleRafSourcePreserved:true},android:{sha256:apkSHA,bytes:lstatSync(apk).size,appLibrary:appLib,embeddedIdentity:actualAndroidIdentity,nativeIdentityOffset:nativeOffset.offset,packagedLibraries:zipSummary.libraries,pluginClassInDex:true,packageId:'com.local.notesclone.account109',debuggable:true,signatureVerified:true,successfulAttempt:'retry02'},initialFailureEvidence:'retained; retry/cache recovery is author provenance, not independently reproduced',boundEvidence,sourceAndArtifactsUnchangedAtClosingChecks:true,boundary:'Static exact identity only. Vite production identity mode coexists with explicitly enabled debug/E2E capability. No App, ADB, live acceptance, build, network, target write, source modification or runtime WebView claim. Selected Android generated identity candidates were read only; actual payload was found and decoded inside APK ELF.'};
writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({verdict:result.verdict,source,sourceFingerprint:identity.sourceFingerprint,inputs:inputs.length,macSHA256:macSHA,macActualResources:actualResources.length,apkSHA256:apkSHA,androidNativeSHA256:appLib.sha256,androidActualEmbeddedIdentity:true,signatureVerified:true,sourceClean:true}));
