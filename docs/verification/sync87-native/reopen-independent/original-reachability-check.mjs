import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const s=execFileSync('git',['show','578e8af4:scripts/debug/sync87-native/protocol.mjs'],{cwd:'/private/tmp/apple-notes-sync87-native',encoding:'utf8'});
const {parseRequest}=await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
const results=['reopenDesktop','observeSync'].map(action=>({action,result:parseRequest(Buffer.from(JSON.stringify({action})))}));
console.log(JSON.stringify(results,null,2));
for(const x of results)assert.equal(x.result.ok,true,'new reviewed action must be reachable');
