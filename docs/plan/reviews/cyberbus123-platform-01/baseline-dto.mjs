// Reproduce the historical test against committed parent bytes without edits.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const here=fileURLToPath(new URL('.',import.meta.url));
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const tmp=mkdtempSync(join(here,'.baseline-'));
try {
  const entry=join(tmp,'account-client.ts');
  writeFileSync(entry,execFileSync('git',['show','b74eeb637^:src/account-client.ts'],{cwd:root}));
  const original=readFileSync(join(root,'scripts/verification/account109-status-dto.test.mjs'),'utf8');
  const test=join(tmp,'baseline.test.mjs');
  assert(original.includes("entry:resolve('src/account-client.ts')"));
  writeFileSync(test,original.replace("entry:resolve('src/account-client.ts')",'entry:'+JSON.stringify(entry)));
  const result=spawnSync(process.execPath,['--test',test],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(result.status,1);
  assert.match(result.stdout,/# pass 24/);assert.match(result.stdout,/# fail 1/);
  assert.match(result.stdout,/not ok 1 - typed sync failure/);
  assert.match(result.stdout,/请确认两台设备保持运行且网络可用/);
  console.log('Confirmed committed parent b74eeb637^: historical DTO suite 24/25, same timeout-copy assertion failure. No source files changed.');
} finally { rmSync(tmp,{recursive:true,force:true}); }
