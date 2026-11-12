import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { finalizeBrowserResult } from '../debug/finalize-browser-result.mjs';

test('final verdict is absent while cleanup is pending and passes after cleanup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sync108-browser-cleanup-'));
  try {
    const path = join(dir, 'result.json');
    let release;
    const pending = finalizeBrowserResult({ cleanup: () => new Promise(resolve => { release = resolve; }) }, path, { passed: true });
    await assert.rejects(access(path), { code: 'ENOENT' });
    release();
    await pending;
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { passed: true, cleanup: { passed: true } });
  } finally { await rm(dir, { recursive: true }); }
});

test('cleanup failure rejects and publishes failed even after successful checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sync108-browser-cleanup-'));
  try {
    const path = join(dir, 'result.json');
    await assert.rejects(finalizeBrowserResult({ cleanup: async () => { throw new TypeError('injected'); } }, path, { passed: true, checks: ['business'] }), TypeError);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { passed: false, checks: ['business'], cleanup: { passed: false, error: 'TypeError' } });
  } finally { await rm(dir, { recursive: true }); }
});

test('successful cleanup preserves an earlier failed verdict', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sync108-browser-cleanup-'));
  try {
    const path = join(dir, 'result.json');
    await finalizeBrowserResult({ cleanup: async () => {} }, path, { passed: false, error: 'assertion' });
    assert.equal(JSON.parse(await readFile(path, 'utf8')).passed, false);
  } finally { await rm(dir, { recursive: true }); }
});
