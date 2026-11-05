// Read-only adaptation of independent03/08 bounded embedded-resource decoder.
import fs from 'node:fs';import cp from 'node:child_process';import zlib from 'node:zlib';import crypto from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url));
const root='/Users/water/work/2026/Apple-Notes-Clone';const run=root+'/docs/verification/unified-candidate06/android-recording-wave-build13/android-attempt01';
const build=JSON.parse(fs.readFileSync(run+'/result.json'));const apk=root+'/artifacts/unified-candidate06/android-recording-wave-build13/android-attempt01/android-original.apk';
const library='lib/arm64-v8a/libnotes_clone_lib.so';const data=cp.execFileSync('/usr/bin/unzip',['-p',apk,library],{maxBuffer:200*1024*1024,timeout:30000});
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');const records=[];
for(const row of build.dist){const file=fs.readFileSync(run+'/prior-outputs/dist/'+row.path);if(file.length!==row.bytes||hash(file)!==row.sha256)throw Error('prior dist does not equal historical dist '+row.path);
const bn=Buffer.from(path.basename(row.path));const offsets=[];let at=-1;while((at=data.indexOf(bn,at+1))>=0)offsets.push(at);let match=null;
for(const position of offsets){for(let start=position+bn.length;start<position+bn.length+33;start++){try{const value=zlib.brotliDecompressSync(data.subarray(start,Math.min(start+1200000,data.length)),{maxOutputLength:2000000,info:true});
const exact=value.buffer.equals(file);const html=row.path==='index.html'&&value.buffer.length>=400&&build.dist.filter(r=>r.path!=='index.html'&&!r.path.includes('native-recording-access')).every(r=>value.buffer.includes(Buffer.from(path.basename(r.path))));
if(exact||html){match={offset:start,bytes:value.buffer.length,sha256:hash(value.buffer),compressedBytes:value.engine.bytesWritten,exactBytes:exact};if(row.path==='index.html')fs.writeFileSync(out+'/decoded-index.html',value.buffer);break;}}catch{}}
if(match)break;}records.push({path:row.path,expectedBytes:row.bytes,expectedSha256:row.sha256,filenameOffsets:offsets,match});}
const result={status:records.every(r=>r.match)?'DECODED':'INCOMPLETE',library,librarySha256:hash(data),libraryBytes:data.length,assets:records,method:'Brotli streams within 32 bytes after embedded asset filename. Compare full decoded CSS and both JS files to historical dist hashes/bytes, raw index.html if exact else complete HTML token check separately. Bounded 1.2MB input/2MB output per candidate, native member <=200MiB; no execution/injection.'};
fs.writeFileSync(out+'/embedded-assets.json',JSON.stringify(result,null,2)+'\n');if(result.status!=='DECODED')throw Error('incomplete embedded resource decode');console.log(JSON.stringify(result,null,2));
