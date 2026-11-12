// Same real Rust line protocol as scripts/debug/rust-backend.mjs. This
// measurement-only client assembles each line once; repeated Buffer.concat on
// every 64KiB chunk would turn a 128MiB media reply into quadratic copying.
import {spawn} from 'node:child_process';
export function boundedLines(onLine,maxBytes) {
 let chunks=[],size=0;
 const consume=bytes=>{
  let at=0;
  while(at<bytes.length){const end=bytes.indexOf(10,at),stop=end<0?bytes.length:end,part=bytes.subarray(at,stop);if(part.length){chunks.push(part);size+=part.length;}if(size>maxBytes)throw Error('Rust transport oversized response');if(end<0)return;const line=chunks.length===1?chunks[0]:Buffer.concat(chunks,size);chunks=[];size=0;onLine(line.toString('utf8'));at=end+1;}
 };
 consume.finish=()=>{if(size)throw Error('Rust transport incomplete response');};
 return consume;
}
export async function linearRustBackend(binary,directory,{timeoutMs=120000,maxLineBytes=180*1024*1024}={}) {
 const child=spawn(binary,[directory],{stdio:['pipe','pipe','pipe']});const pending=new Map();let next=0,failure,closing=false,stderr='',exitInfo;
 const fail=error=>{failure||=error;for(const slot of pending.values()){clearTimeout(slot.timer);slot.reject(failure);}pending.clear();if(!closing&&!exitInfo)child.kill('SIGTERM');};
 child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4000);});child.stdin.on('error',e=>{if(!closing)fail(e);});child.on('error',fail);
 const exited=new Promise(done=>child.once('close',(code,signal)=>{exitInfo={code,signal};if(pending.size)fail(Error(`Rust exited ${code}/${signal}: ${stderr}`));done(exitInfo);}));
 const consume=boundedLines(line=>{const row=JSON.parse(line);if(!Number.isSafeInteger(row.requestId)||typeof row.ok!=='boolean'||!Array.isArray(row.events)||(!row.ok&&typeof row.error?.message!=='string'))throw Error('Invalid real Rust response envelope');const slot=pending.get(row.requestId);if(!slot)throw Error('Unknown Rust response requestId');pending.delete(row.requestId);clearTimeout(slot.timer);slot.resolve(row);},maxLineBytes);
 child.stdout.on('data',bytes=>{if(!failure)try{consume(bytes);}catch(error){fail(error);}});
 child.stdout.on('end',()=>{if(!failure)try{consume.finish();}catch(error){fail(error);}});
 await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});
 return {pid:child.pid,kind:'external-real-rust-session-store-transport-linear-line-reader',call(command,args={}){if(failure||closing||exitInfo)return Promise.reject(failure||Error('Rust transport closed'));return new Promise((resolve,reject)=>{const requestId=++next,timer=setTimeout(()=>fail(Error('Rust transport timeout for '+command)),timeoutMs);pending.set(requestId,{resolve,reject,timer});child.stdin.write(JSON.stringify({requestId,command,args,window:'main'})+'\n');});},async close(){closing=true;child.stdin.end();let forced=false;const t=setTimeout(()=>{forced=true;child.kill('SIGTERM');},5000),k=setTimeout(()=>child.kill('SIGKILL'),6000);const info=await exited;clearTimeout(t);clearTimeout(k);if(failure||forced||info.code!==0)throw failure||Error('Rust transport did not close naturally: '+JSON.stringify(info));return info;}};
}
