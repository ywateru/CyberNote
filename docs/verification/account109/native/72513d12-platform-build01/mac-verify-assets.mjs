import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const root='/private/tmp/cybernote-account109-android-72513d12-01';
const out='/Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-72513d12-debug-e2e-01';
const target='/private/tmp/cybernote-account109-mac-ec4348c6-target-01';
const source='72513d1296df4526a08834db65a3427957d3fb50';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:root,maxBuffer:16*1024*1024});
const regular=p=>{assert(lstatSync(p).isFile()&&!lstatSync(p).isSymbolicLink());return readFileSync(p);};
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>{const q=join(p,e.name);assert(!e.isSymbolicLink());return e.isDirectory()?walk(q):[q];}).sort();
const receipt=JSON.parse(regular(join(out,'build-record.json')));
assert.equal(git('rev-parse','HEAD').toString().trim(),source);
assert.equal(git('status','--porcelain').length,0);
assert.deepEqual(receipt.sourceBefore,receipt.sourceAfter);
assert.equal(receipt.sourceBefore.sourceDirty,false);
assert.deepEqual(receipt.lockfilesBefore,receipt.lockfilesAfter);
for(const [path,expected] of Object.entries(receipt.lockfilesBefore)){
 const bytes=regular(join(root,path));assert.equal(sha(bytes),expected);assert(bytes.equals(git('show',`${source}:${path}`)));
}
const native=regular(join(out,'notes-clone'));assert.equal(sha(native),receipt.binary.sha256);
assert.equal(native.readUInt32LE(0),0xfeedfacf);assert.equal(native.readUInt32LE(4),0x0100000c);assert.equal(native.readUInt32LE(12),2);
const segments=[];let pos=32;
for(let i=0;i<native.readUInt32LE(16);i++){
 const cmd=native.readUInt32LE(pos),size=native.readUInt32LE(pos+4);assert(size>=8&&pos+size<=native.length);
 if(cmd===0x19)segments.push({name:native.subarray(pos+8,pos+24).toString().split('\0')[0],offset:Number(native.readBigUInt64LE(pos+40)),size:Number(native.readBigUInt64LE(pos+48)),protection:native.readUInt32LE(pos+60)});
 pos+=size;
}
const dist=walk(join(root,'dist')).map(p=>({path:relative(join(root,'dist'),p),bytes:regular(p)}));
const wanted=dist.filter(d=>/\.(js|css|json|svg)$/.test(d.path));
const matches=new Map(wanted.map(d=>[d.path,[]]));let scanned=0;
for(const entry of readdirSync(join(target,'debug/build'),{withFileTypes:true})){
 if(!entry.isDirectory()||!entry.name.startsWith('notes-clone-'))continue;
 const folder=join(target,'debug/build',entry.name,'out/tauri-codegen-assets');let files;
 try{files=walk(folder);}catch(e){if(e.code==='ENOENT')continue;throw e;}
 for(const file of files){
  assert(++scanned<=4096);if(lstatSync(file).size>4*1024*1024)continue;
  const encoded=regular(file);let decoded;
  try{decoded=brotliDecompressSync(encoded,{maxOutputLength:16*1024*1024});}catch{decoded=encoded;}
  for(const d of wanted){
   if(!decoded.equals(d.bytes))continue;
   const offset=native.indexOf(encoded);if(offset<0)continue;
   const segment=segments.find(s=>offset>=s.offset&&offset+encoded.length<=s.offset+s.size);
   assert(segment&&(segment.protection&1)&&segment.name!=='__LINKEDIT');
   matches.get(d.path).push({encodedPath:relative(target,file),encoding:decoded===encoded?'raw':'brotli',encodedSha256:sha(encoded),encodedBytes:encoded.length,binaryOffset:offset,loadSegment:segment.name});
  }
 }
}
for(const d of wanted)assert(matches.get(d.path).length>0,`Required current asset not embedded: ${d.path}`);
const main=dist.find(d=>/^assets\/index-.*\.js$/.test(d.path));
const debug=dist.find(d=>/^assets\/runtime-.*\.js$/.test(d.path));assert(main&&debug);
const mainText=main.bytes.toString();
assert(mainText.includes('__CYBERNOTE_STARTUP_DIAGNOSTIC__=Object.freeze({schema:1,gates:'));
assert(mainText.includes(`import("./${basename(debug.path)}")`));
assert(debug.bytes.includes(Buffer.from('app.state')));
const html=dist.find(d=>d.path==='index.html');
const refs=[...html.bytes.toString().matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(m=>m[1].slice(1));
assert(refs.includes(main.path));assert(refs.every(p=>matches.get(p)?.length));
const runtime=regular(join(root,'src/debug/runtime.ts')).toString();
const oldRuntime=git('show','920fa9cf3af6e3b3cc3b99fb1a78d960ab0c7d11:src/debug/runtime.ts').toString();
const barrier='        await frame();\n        await frame();\n        const failure = live().state().failure;';
assert(runtime.includes(barrier)&&oldRuntime.includes(barrier));
assert(runtime.includes('new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));'));
const capability=JSON.parse(regular(join(out,'compiled-capability.log')));assert.equal(capability.checks,24);
const result={schema:1,sourceRevision:source,binarySha256:sha(native),sourceClean:true,sourceBeforeAfterEqual:true,fourLocksEqualBeforeAfterAndCommit:true,
 capabilityChecks:capability.checks,mainChunk:main.path,debugChunk:debug.path,debugImportPresent:true,startupDiagnosticAssignmentCompiled:true,
 executeDoubleRafSourcePreserved:true,htmlAssetReferences:refs,
 resources:dist.map(d=>({path:d.path,bytes:d.bytes.length,sha256:sha(d.bytes),embeddedMatches:matches.get(d.path)??[]})),
 allRequiredJsCssJsonSvgEmbedded:true,
 boundary:'Static build/resource identity only. Diagnostic is compiled and linked, not observed at runtime. HTML is hashed and its asset references checked; no exact transformed HTML byte-equivalence claim. No App/store/network/ADB execution.'};
writeFileSync(join(out,'resource-identity.json'),JSON.stringify(result,null,2)+'\n');
assert.equal(git('status','--porcelain').length,0);
console.log(JSON.stringify({source,binarySha256:result.binarySha256,capabilityChecks:capability.checks,distFiles:dist.length,requiredEmbeddedFiles:wanted.length,startupDiagnosticAssignmentCompiled:true,debugImportPresent:true,executeDoubleRafSourcePreserved:true}));
