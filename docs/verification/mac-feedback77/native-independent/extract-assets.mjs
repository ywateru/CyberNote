import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.resolve(process.argv[2]),binary=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const data=fs.readFileSync(binary),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const dist=JSON.parse(fs.readFileSync('docs/verification/mac-feedback77/native-build/result.json')).frontendFiles;
const records=[];
for(const expected of dist){
 const bytes=fs.readFileSync(path.join(root,'dist',expected.path));assert.equal(hash(bytes),expected.sha256);assert.equal(bytes.length,expected.bytes);
 const name=Buffer.from(path.basename(expected.path)),positions=[];let p=-1;while((p=data.indexOf(name,p+1))>=0)positions.push(p);
 const candidates=[];let selected;
 for(const pos of positions){for(let offset=pos+name.length;offset<pos+name.length+33;offset++){try{
  const r=zlib.brotliDecompressSync(data.subarray(offset,Math.min(offset+1200000,data.length)),{maxOutputLength:2000000,info:true});
  if(r.buffer.length<100)continue;const candidate={offset,bytes:r.buffer.length,sha256:hash(r.buffer),compressedBytes:r.engine.bytesWritten};
  candidates.push(candidate);
  if(r.buffer.equals(bytes)||(expected.path==='index.html'&&dist.filter(f=>f.path.startsWith('assets/index-')).every(f=>r.buffer.includes(Buffer.from(path.basename(f.path)))))){
   selected={...candidate,exactDist:r.buffer.equals(bytes)};fs.mkdirSync(path.dirname(path.join(out,expected.path)),{recursive:true});fs.writeFileSync(path.join(out,expected.path),r.buffer);break;
  }
 }catch{}}if(selected)break;}
 records.push({path:expected.path,expectedBytes:expected.bytes,expectedSha256:expected.sha256,filenameOffsets:positions,match:selected,candidates});
}
const result={binary,binaryBytes:data.length,binarySha256:hash(data),method:'Bounded Brotli decoding in first 32 bytes after embedded basename; exact complete decoded bytes compared with current dist and build recorded SHA. HTML may be Tauri transformed and requires separate explicit review.',records};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(records.some(r=>!r.match))process.exitCode=1;
