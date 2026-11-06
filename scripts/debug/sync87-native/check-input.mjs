/** Host-only negative stdin regressions. Child PATH excludes Python/ADB entirely. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { parseRequest,readRequests,actionFailure,MAX_REQUEST_BYTES } from './protocol.mjs';
const marker='Z7X9K2',runner=fileURLToPath(new URL('./run.mjs',import.meta.url));
const output='/private/tmp/notes-sync87-native-input-'+randomBytes(6).toString('hex');
const env={...process.env,PATH:'/nonexistent-sync87-host-only-no-python-or-adb'};
let checked=0;
const fresh=spawnSync(process.execPath,[runner,'--mode','prepare','--output',output],{env,encoding:'utf8',timeout:5000});assert.equal(fresh.status,0,fresh.stderr);
const cases=[
  ['malformed-short',marker+'\n','INVALID_JSON'],
  ['malformed-prefix',marker+'-long-input-that-Node-would-quote\n','INVALID_JSON'],
  ['truncated-json','{"action":"pair","invitation":"'+marker,'INVALID_JSON'],
  ['truncated-escape','{"action":"pair","invitation":"'+marker+'\\','INVALID_JSON'],
  ['oversized',marker.repeat(6000)+'\n','INPUT_TOO_LARGE'],
  ['oversized-multibyte','字'.repeat(12000)+marker+'\n','INPUT_TOO_LARGE'],
  ['null','null\n','INVALID_REQUEST'],
  ['array',JSON.stringify([marker])+'\n','INVALID_REQUEST'],
  ['unknown-action',JSON.stringify({action:marker})+'\n','INVALID_REQUEST'],
  ['invalid-request-id',JSON.stringify({action:'close',requestId:marker+' secret'})+'\n','INVALID_REQUEST'],
  ['unknown-sensitive-field',JSON.stringify({action:'close',invitation:marker})+'\n','INVALID_REQUEST'],
  ['sensitive-unknown-key',JSON.stringify({action:'close',[marker]:'value'})+'\n','INVALID_REQUEST'],
  ['oversized-pair-field',JSON.stringify({action:'pair',invitation:marker.repeat(2800)})+'\n','INVALID_REQUEST'],
  ['non-string-pair-field',JSON.stringify({action:'pair',invitation:{secret:marker}})+'\n','INVALID_REQUEST'],
  ['parser-no-second-dispatch',marker+'\n{"action":"background"}\n','INVALID_JSON'],
];
for(const [name,input,expected] of cases) {
  const child=spawnSync(process.execPath,[runner,'--mode','serve','--output',output,'--receipt','/private/tmp/nonexistent-sync87-input-receipt.json'],{env,input,encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
  assert.equal(child.status,2,name);assert.equal(child.signal,null,name);assert.equal(child.stderr,'',name);
  assert(!child.stdout.includes(marker),name+' leaked synthetic marker');
  const responses=child.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(responses.length,1,name);
  const reply=responses[0];assert.equal(reply.ok,false,name);assert.equal(reply.error,expected,name);
  assert.equal(reply.action,undefined,name);assert.equal(reply.requestId,undefined,name);assert(!('stack' in reply),name);checked++;
}
const pairChild=spawnSync(process.execPath,[runner,'--mode','serve','--output',output,'--receipt','/private/tmp/nonexistent-sync87-input-receipt.json'],{env,input:JSON.stringify({action:'pair',requestId:'pair_safe',invitation:marker})+'\n',encoding:'utf8',timeout:5000});
assert.equal(pairChild.status,2);assert.equal(pairChild.stderr,'');assert(!pairChild.stdout.includes(marker));
const pairReply=JSON.parse(pairChild.stdout);assert.equal(pairReply.error,'ACTION_FAILED');assert.equal(pairReply.action,'pair');assert.equal(pairReply.requestId,'pair_safe');assert.equal(pairReply.message,'Native UI pairing failed; no input or exception recorded');checked++;
const bytes=Buffer.from(marker+'\n{"action":"background"}\n');let yielded=0;
for await(const reply of readRequests(Readable.from([bytes.subarray(0,2),bytes.subarray(2)]))){assert.equal(reply.error,'INVALID_JSON');yielded++;}
assert.equal(yielded,1);checked++;
const huge=Buffer.alloc(MAX_REQUEST_BYTES+1,65);let pulls=0;
async function* bounded(){pulls++;yield huge;pulls++;throw Error(marker);}
for await(const reply of readRequests(bounded()))assert.equal(reply.error,'INPUT_TOO_LARGE');
assert.equal(pulls,1);checked++;
const invalidUtf8=parseRequest(Buffer.from([0xff,0xfe]));assert.equal(invalidUtf8.error,'INVALID_JSON');checked++;
const valid=parseRequest(Buffer.from('{"action":"pair","requestId":"pair_1","invitation":"'+marker+'"}'));assert.equal(valid.ok,true);assert.equal(valid.request.invitation,marker);
const failed=actionFailure(valid.request);assert(!JSON.stringify(failed).includes(marker));assert.equal(failed.error,'ACTION_FAILED');assert.equal(failed.action,'pair');checked++;
const normal=actionFailure({action:'home',requestId:'home_1'});assert.equal(normal.message,'Native acceptance action failed; no input or exception recorded');checked++;
console.log(JSON.stringify({passed:checked,processNegativeCases:cases.length,scope:'host-only parse/validation/action redaction; no Python/ADB executable reachable in child PATH',output}));
