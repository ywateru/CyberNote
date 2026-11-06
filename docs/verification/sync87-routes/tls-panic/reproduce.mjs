// Evidence-only minimal frozen-build08 TLS diagnostic. Never log an invitation.
// Usage from repository root: node docs/verification/sync87-routes/tls-panic/reproduce.mjs NEW_OWNED_OUTPUT
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]||'');
if(!output.startsWith('/private/tmp/sync87-routes-tls-'))throw Error('new owned output required');
const bin='/private/tmp/sync86-transport-build08/notes-current-attachment-transport';
if(createHash('sha256').update(await readFile(bin)).digest('hex')!=='898331177b9f3f40fcc197c84acd1d93622bc3d453da078cf0c1429ebc81acc3')throw Error('binary mismatch');
const require=createRequire(import.meta.url),cp=require('node:child_process'),original=cp.spawn,logs=[];
cp.spawn=(...args)=>{const p=original(...args),row={pid:p.pid,stderr:''};logs.push(row);p.stderr?.on('data',b=>{row.stderr+=b.toString()});return p};syncBuiltinESMExports();
const {rustBackend}=await import('../../../../scripts/debug/rust-backend.mjs');
await mkdir(output);const a=await rustBackend(bin,output+'/host',{timeoutMs:40000,closeTimeoutMs:10000}),b=await rustBackend(bin,output+'/client',{timeoutMs:40000,closeTimeoutMs:10000});
const call=async(p,command)=>{const w=await p.call('load_workspace'),expected={sessionId:w.value.access.sessionId,epoch:w.value.access.epoch};return p.call('sync_command',{command,expected})};
let result;
try {
 await call(a,{type:'startHost',deviceName:'Synthetic TLS diagnostic',port:0});
 const inv=await call(a,{type:'createInvite',endpoint:'wss://tax-internationally-slightly-forwarding.trycloudflare.com'});
 const started=performance.now();const r=await call(b,{type:'pair',deviceName:'Synthetic TLS diagnostic client',invitation:inv.value.invitation});
 result={ok:r.ok,errorCode:r.error?.code,wallMs:Math.round(performance.now()-started)};
}finally{await a.close();await b.close()}
await writeFile(output+'/result.json',JSON.stringify({scope:'Synthetic frozen build08 client TLS diagnostic; previously owned stopped QuickTunnel hostname. No new tunnel, no payload log.',result,processes:[a.lifecycle,b.lifecycle],logs},null,2));
