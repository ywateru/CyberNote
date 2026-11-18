// Independent contract probe: builds the candidate's actual account-client.ts in
// memory, invokes its exported validators, never starts an app or calls IPC.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const [candidate, dependencies] = process.argv.slice(2);
if (!candidate || !dependencies) throw Error('usage: node dto-probe.mjs CANDIDATE DEPENDENCY_ROOT');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:candidate, encoding:'utf8'}).trim();
assert.equal(sha, '0805281ed14775c713de48da02fdd35cabcce141');
const require = createRequire(resolve(dependencies, 'package.json'));
const {build} = await import(pathToFileURL(require.resolve('vite')).href);
const built = await build({
  root:candidate, configFile:false, logLevel:'silent',
  resolve:{alias:{'@tauri-apps/api/core':require.resolve('@tauri-apps/api/core')}},
  define:{'import.meta.env':'{VITE_NOTES_ACCOUNT_NATIVE:"0",DEV:false}'},
  build:{write:false,minify:false,lib:{entry:resolve(candidate,'src/account-client.ts'),formats:['es']}},
});
const output = (Array.isArray(built) ? built[0] : built).output;
const api = await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
const status = error => ({state:'error',enabled:false,devices:[],pendingCount:0,conflictCount:0,error});
const outcomes = [];
function check(name, body) {
  try { body(); outcomes.push({name,pass:true}); }
  catch { outcomes.push({name,pass:false}); }
}
check('control_known_network_error_roundtrips', () => {
  const error = {code:'account_network',message:'safe fixture error'};
  assert.equal(api.validateAccountStatus(status(error)).error.code, error.code);
});
// 26 is INTERNAL from the pinned SDK's common.proto; no raw SDK message is used.
check('native_sdk_error_is_accepted_by_status', () => {
  const error = {code:'account_sdk_failed',message:'safe fixture error',cyberbusCode:26};
  assert.deepEqual(api.validateAccountStatus(status(error)).error,error);
});
check('native_sdk_error_is_preserved_by_ipc_error_projection', () => {
  const error = {code:'account_sdk_failed',message:'safe fixture error',cyberbusCode:26};
  assert.equal(api.accountIPCError(error)?.cyberbusCode,26);
});
for (const code of ['account_unknown_outcome','account_deadline_exceeded']) {
  check(`${code}_retains_its_finite_category`, () => {
    assert.equal(api.validateAccountStatus(status({code,message:'safe fixture error'})).error.code,code);
  });
}
check('control_empty_summary_remains_distinct_from_missing', () => {
  const base = {state:'paused',enabled:false,pendingCount:0,conflictCount:0};
  const device = {id:'22222222-2222-4222-8222-222222222222',name:'Fixture',online:true,current:false,connected:false,syncAvailable:false};
  assert.equal(api.validateAccountStatus({...base,devices:[device]}).devices[0].summary,undefined);
  assert.deepEqual(api.validateAccountStatus({...base,devices:[{...device,summary:{noteCount:0,lastNoteUpdatedAt:null,capturedAt:1}}]}).devices[0].summary,
    {noteCount:0,lastNoteUpdatedAt:null,capturedAt:1});
});
console.log(JSON.stringify({baseline:sha,scope:'actual frontend validators only; synthetic finite DTOs; no Rust runtime or network',outcomes},null,2));
if (outcomes.some(outcome => !outcome.pass)) process.exitCode = 1;
