// Only IPC envelope observation. Rust HTTP serves all original/PNG bytes.
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tracedTransport } from './trace-transport.mjs';
export async function realMediaTransport(binary,directory,path,origin,options={}) {
 const prior=process.env.MEDIA_TEST_ORIGIN;
 let backend;
 try {process.env.MEDIA_TEST_ORIGIN=origin;backend=await tracedTransport(binary,directory,path+'.ipc',options);}
 finally {if(prior===undefined)delete process.env.MEDIA_TEST_ORIGIN;else process.env.MEDIA_TEST_ORIGIN=prior;}
 const grants=new Map(),rows=[];let sequence=0;
 const hash=v=>createHash('sha256').update(v).digest('hex');
 return {...backend,rows:backend.rows,mediaRows:rows,mediaForURL:url=>grants.get(url),async call(command,args={},context={}){
  const startedAt=Date.now(),at=performance.now(),id=++sequence;
  const result=await backend.call(command,args,context);
  const row={id,command,startedAt,elapsedMs:performance.now()-at,attachmentId:args.id,purpose:args.purpose,pixels:args.pixels,phase:context.phase,visibility:context.visibility,ok:result.ok,error:result.error?.code};
  if(command==='acquire_attachment_source'&&result.ok){
   const v=result.value;
   if(!v||typeof v.url!=='string'||!v.url.startsWith('http://127.0.0.1:')||typeof v.leaseId!=='string'||v.purpose!==args.purpose||v.attachmentId!==args.id||!v.access)throw Error('Invalid real tagged media receipt');
   const identity={attachmentId:args.id,purpose:args.purpose,pixels:args.pixels,mime:v.mime,registeredBytes:v.bytes,capabilitySHA256:hash(v.url)};
   grants.set(v.url,identity);Object.assign(row,identity);row.leaseSHA256=hash(v.leaseId);row.tagged=true;
  }
  if(command==='perf_metrics'&&result.ok)row.metrics=result.value;
  rows.push(row);appendFileSync(path,JSON.stringify(row)+'\n');return result;
 }};
}
export function rendererCommandAllowed(command) {return typeof command==='string'&&!command.startsWith('perf_');}
