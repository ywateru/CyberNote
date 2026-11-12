// A transparent observer around the existing real Rust Session/Store protocol.
// Arguments, result envelopes and errors are passed through unchanged. Bytes
// are never substituted; bounded Base64 chunks are hashed only for evidence.
import {appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {linearRustBackend} from './line-transport.mjs';
export async function tracedTransport(binary,directory,path,{timeoutMs=120000,maxLineBytes=180*1024*1024}={}) {
 const backend=await linearRustBackend(binary,directory,{timeoutMs,maxLineBytes});
 let sequence=0;const rows=[];
 const original=backend.call.bind(backend);
 return {...backend,kind:backend.kind,pid:backend.pid,rows,async call(command,args={},context={}) {
  const id=++sequence,start=performance.now();
  const row={id,command,attachmentId:command==='read_attachment'?args.id:undefined,startedAt:Date.now(),...context};
  appendFileSync(path,JSON.stringify({event:'start',...row})+'\n');
  try {
   const result=await original(command,args);
   row.ok=result.ok;row.error=result.error?.code;row.elapsedMs=performance.now()-start;
   if(command==='read_attachment'&&result.ok){
    const data=result.value?.data;if(typeof data!=='string')throw Error('Real Rust read_attachment has no Base64 data');
    row.base64Characters=data.length;row.originalBytes=data.length/4*3-(data.endsWith('==')?2:data.endsWith('=')?1:0);
    const hashStart=performance.now(),hash=createHash('sha256');
    for(let at=0;at<data.length;at+=65536)hash.update(Buffer.from(data.slice(at,at+65536),'base64'));
    row.returnedSha256=hash.digest('hex');row.observerHashMs=performance.now()-hashStart;
   }
   rows.push(row);appendFileSync(path,JSON.stringify({event:'end',...row})+'\n');return result;
  } catch(error){row.error=error.message;row.ok=false;row.elapsedMs=performance.now()-start;rows.push(row);appendFileSync(path,JSON.stringify({event:'error',...row})+'\n');throw error;}
 },async close(){return backend.close();}};
}
